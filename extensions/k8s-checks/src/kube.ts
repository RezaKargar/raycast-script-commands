import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Cluster, Config, EnvConfig, SecretEnv } from "./config";

const execFileAsync = promisify(execFile);

// Raycast runs extensions with a minimal PATH.
const PATH = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", process.env.PATH].join(":");

// Every kubectl call goes through kubectl(), which runs only get and port-forward, so nothing
// here can change the cluster.
const READ_ONLY_VERBS = new Set(["get", "port-forward"]);

function kubectlArgs(env: Cluster, verb: string, args: string[]): string[] {
  if (!READ_ONLY_VERBS.has(verb)) throw new Error(`Refusing 'kubectl ${verb}': this extension is read-only`);
  return ["--context", env.context, "-n", env.namespace, verb, ...args];
}

/** `output` is kubectl's -o, such as json or a jsonpath. */
async function kubectlGetRaw(config: Config, env: Cluster, args: string[], output: string): Promise<string> {
  const { stdout } = await execFileAsync("kubectl", kubectlArgs(env, "get", [...args, "-o", output]), {
    env: { ...process.env, PATH },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  });
  return stdout;
}

async function kubectlGet<T>(config: Config, env: Cluster, args: string[]): Promise<T> {
  return JSON.parse(await kubectlGetRaw(config, env, args, "json")) as T;
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
// Raycast can stop a command without running its cleanup, which would leave a port-forward open
// for good. So each forward runs under a shell watchdog that ends it once this process is gone, or
// after FORWARD_MAX_SECONDS, whichever comes first.
const FORWARD_MAX_SECONDS = 20;
const FORWARD_WATCHDOG = `kubectl "$@" & k=$!
( i=0; while kill -0 "$PARENT_PID" 2>/dev/null && [ "$i" -lt "$MAX_SECONDS" ]; do sleep 1; i=$((i+1)); done; kill "$k" 2>/dev/null ) &
w=$!; wait "$k"; kill "$w" 2>/dev/null`;

async function readErrorz(env: EnvConfig, pod: string, port: number, errorzPort: number): Promise<Errorz> {
  const args = kubectlArgs(env, "port-forward", [`pod/${pod}`, `${port}:${errorzPort}`]);
  const forward = spawn("/bin/sh", ["-c", FORWARD_WATCHDOG, "sh", ...args], {
    env: { ...process.env, PATH, PARENT_PID: String(process.pid), MAX_SECONDS: String(FORWARD_MAX_SECONDS) },
    stdio: "ignore",
    // Its own process group, so one kill ends the shell, kubectl and the watchdog together.
    detached: true,
  });
  const stop = () => {
    try {
      if (forward.pid) process.kill(-forward.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  };
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
    throw new Error(`no answer on :${errorzPort} (listener off, or the pod is not ready)`);
  } finally {
    stop();
  }
}

/** Empty unless CANARY_ERRORZ_PORT is set. */
export async function getErrorz(config: Config, env: EnvConfig, hash: string): Promise<PodErrorz[]> {
  const { errorzPort } = config;
  if (!errorzPort) return [];
  const json = await kubectlGet<PodsJson>(config, env, ["pods", "-l", `rollouts-pod-template-hash=${hash}`]);
  const base = 18100 + Math.floor(Math.random() * 700);
  return Promise.all(
    json.items.map(async ({ metadata: { name } }, i) => {
      try {
        return { pod: name, errorz: await readErrorz(env, name, base + i, errorzPort) };
      } catch (error) {
        return { pod: name, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

// --- a Secret's changes --------------------------------------------------------------------------

/** One field manager's last write to the Secret. */
export interface SecretWrite {
  manager: string;
  operation: string;
  time: string;
  /** Top-level fields it owns, such as data, metadata and type. */
  fields: string[];
}

export interface SecretInfo {
  name: string;
  /** True when this is the env's fallback, because its Secret does not exist yet. */
  fallback: boolean;
  created: string;
  resourceVersion: string;
  owner?: string;
  /** The latest write's time: when the Secret last changed. */
  changed: string;
  /** Newest first. */
  writes: SecretWrite[];
}

interface ManagedFieldJson {
  manager: string;
  operation: string;
  time?: string;
  fieldsV1?: Record<string, unknown>;
}

// Only these four metadata fields are read, one per line, so the Secret's values never leave the
// cluster. Not even the annotations: kubectl apply keeps a full copy of the Secret in one.
const SECRET_FIELDS = [
  "{.metadata.creationTimestamp}",
  "{.metadata.resourceVersion}",
  "{.metadata.ownerReferences}",
  "{.metadata.managedFields}",
].join('{"\\n"}');

async function readSecret(config: Config, env: SecretEnv, name: string, fallback: boolean): Promise<SecretInfo> {
  const raw = await kubectlGetRaw(config, env, ["secret", name, "--show-managed-fields"], `jsonpath=${SECRET_FIELDS}`);
  const [created, resourceVersion, owners, managedFields] = raw.split("\n");
  const m = {
    creationTimestamp: created,
    resourceVersion,
    ownerReferences: (owners ? JSON.parse(owners) : []) as { kind: string; name: string }[],
    managedFields: (managedFields ? JSON.parse(managedFields) : []) as ManagedFieldJson[],
  };
  const writes = m.managedFields
    .filter((f) => f.time)
    .map((f) => ({
      // Controllers often append a hash ("…/sha3/7e6b…"), which says nothing to a reader.
      manager: f.manager.replace(/\/sha\d*\/[0-9a-f]+$/, ""),
      operation: f.operation,
      time: f.time as string,
      fields: Object.keys(f.fieldsV1 ?? {}).map((k) => k.replace(/^f:/, "")),
    }))
    .sort((a, b) => b.time.localeCompare(a.time));
  const owner = m.ownerReferences[0];
  return {
    name,
    fallback,
    created: m.creationTimestamp,
    resourceVersion: m.resourceVersion,
    owner: owner && `${owner.kind}/${owner.name}`,
    changed: writes[0]?.time ?? m.creationTimestamp,
    writes,
  };
}

export async function getSecret(config: Config, env: SecretEnv): Promise<SecretInfo> {
  try {
    return await readSecret(config, env, env.secret, false);
  } catch (error) {
    if (!env.fallback || !isNotFound(error)) throw error;
    return readSecret(config, env, env.fallback, true);
  }
}
