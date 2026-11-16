import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Config, EnvConfig } from "./config";

const execFileAsync = promisify(execFile);

// Raycast runs extensions with a minimal PATH.
const PATH = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", process.env.PATH].join(":");

// Every kubectl call goes through kubectl(), which runs only get and port-forward, so nothing
// here can change the cluster.
const READ_ONLY_VERBS = new Set(["get", "port-forward"]);

function kubectlArgs(config: Config, env: EnvConfig, verb: string, args: string[]): string[] {
  if (!READ_ONLY_VERBS.has(verb)) throw new Error(`Refusing 'kubectl ${verb}': this extension is read-only`);
  return ["--context", env.context, "-n", config.namespace, verb, ...args];
}

async function kubectlGet<T>(config: Config, env: EnvConfig, args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("kubectl", kubectlArgs(config, env, "get", [...args, "-o", "json"]), {
    env: { ...process.env, PATH },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  });
  return JSON.parse(stdout) as T;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /NotFound|not found/.test(String((error as { stderr?: string }).stderr ?? error));
}

// --- the Rollout ---------------------------------------------------------------------------------

export interface Analysis {
  name: string;
  status: string;
  message?: string;
}

export interface RolloutStatus {
  revision: string;
  phase: string;
  aborted: boolean;
  pausedReasons: string[];
  step: number;
  steps: number;
  currentHash: string;
  stableHash: string;
  analysis?: Analysis;
  message?: string;
}

/** What a deploy looks like where there is no Rollout, so no canary. */
export interface DeploymentStatus {
  ready: number;
  wanted: number;
  updated: number;
}

export type Status = { kind: "rollout"; rollout: RolloutStatus } | { kind: "deployment"; deployment: DeploymentStatus };

interface RolloutJson {
  metadata: { annotations?: Record<string, string> };
  spec: { strategy?: { canary?: { steps?: unknown[] } } };
  status?: {
    phase?: string;
    abort?: boolean;
    pauseConditions?: { reason: string }[];
    currentStepIndex?: number;
    currentPodHash?: string;
    stableRS?: string;
    message?: string;
    canary?: { currentBackgroundAnalysisRunStatus?: Analysis };
  };
}

interface DeploymentJson {
  spec: { replicas?: number };
  status?: { readyReplicas?: number; updatedReplicas?: number };
}

export async function getStatus(config: Config, env: EnvConfig): Promise<Status> {
  try {
    const json = await kubectlGet<RolloutJson>(config, env, ["rollout", env.rollout]);
    const s = json.status ?? {};
    return {
      kind: "rollout",
      rollout: {
        revision: json.metadata.annotations?.["rollout.argoproj.io/revision"] ?? "?",
        phase: s.phase ?? "Unknown",
        aborted: Boolean(s.abort),
        pausedReasons: (s.pauseConditions ?? []).map((c) => c.reason),
        step: s.currentStepIndex ?? 0,
        steps: json.spec.strategy?.canary?.steps?.length ?? 0,
        currentHash: s.currentPodHash ?? "",
        stableHash: s.stableRS ?? "",
        analysis: s.canary?.currentBackgroundAnalysisRunStatus,
        message: s.message,
      },
    };
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const json = await kubectlGet<DeploymentJson>(config, env, ["deployment", env.rollout]);
  return {
    kind: "deployment",
    deployment: {
      ready: json.status?.readyReplicas ?? 0,
      wanted: json.spec.replicas ?? 0,
      updated: json.status?.updatedReplicas ?? 0,
    },
  };
}

// --- what happened: steps, scaling, analysis verdicts --------------------------------------------

export interface RolloutEvent {
  time: string;
  reason: string;
  message: string;
}

interface EventsJson {
  items: {
    involvedObject: { kind: string; name: string };
    lastTimestamp?: string;
    eventTime?: string;
    reason: string;
    message: string;
  }[];
}

/** The Rollout's and its AnalysisRuns' events, oldest first. Kubernetes keeps them for about an hour. */
export async function getEvents(config: Config, env: EnvConfig): Promise<RolloutEvent[]> {
  const json = await kubectlGet<EventsJson>(config, env, ["events"]);
  return json.items
    .filter(
      ({ involvedObject: o }) =>
        (o.kind === "Rollout" && o.name === env.rollout) ||
        (o.kind === "AnalysisRun" && o.name.startsWith(`${env.rollout}-`)),
    )
    .map((e) => ({ time: e.lastTimestamp ?? e.eventTime ?? "", reason: e.reason, message: e.message }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

// --- each new pod's own counts -------------------------------------------------------------------

export interface Errorz {
  tracking: boolean;
  tracking_ends?: string;
  uptime_seconds: number;
  window: { requests: number; errors: number; error_ratio: number; seconds: number };
  since_start: { requests: number; errors: number };
}

export type PodErrorz = { pod: string; errorz: Errorz } | { pod: string; error: string };

interface PodsJson {
  items: { metadata: { name: string } }[];
}

/** Reads one pod's /errorz through a short port-forward to its private port. */
async function readErrorz(config: Config, env: EnvConfig, pod: string, port: number): Promise<Errorz> {
  const forward = spawn(
    "kubectl",
    kubectlArgs(config, env, "port-forward", [`pod/${pod}`, `${port}:${config.errorzPort}`]),
    {
      env: { ...process.env, PATH },
      stdio: "ignore",
    },
  );
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await fetch(`http://127.0.0.1:${port}/errorz?window=2m`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) return (await response.json()) as Errorz;
      } catch {
        // The port-forward is not up yet.
      }
    }
    throw new Error(`no answer on :${config.errorzPort} (listener off, or the pod is not ready)`);
  } finally {
    forward.kill();
  }
}

export async function getErrorz(config: Config, env: EnvConfig, hash: string): Promise<PodErrorz[]> {
  const json = await kubectlGet<PodsJson>(config, env, ["pods", "-l", `rollouts-pod-template-hash=${hash}`]);
  const base = 18100 + Math.floor(Math.random() * 700);
  return Promise.all(
    json.items.map(async ({ metadata: { name } }, i) => {
      try {
        return { pod: name, errorz: await readErrorz(config, env, name, base + i) };
      } catch (error) {
        return { pod: name, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}
