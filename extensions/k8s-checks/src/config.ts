import { getPreferenceValues } from "@raycast/api";
import { readFileSync } from "node:fs";

/** An environment's kubectl context. */
export interface Cluster {
  name: string;
  context: string;
}

/** An environment Canary Status checks. */
export interface EnvConfig extends Cluster {
  rollout: string;
  /** A pod's error ratio is judged only once it has served this many requests. */
  minRequests: number;
}

/** An environment Secret Last Changed checks. */
export interface SecretEnv extends Cluster {
  secret: string;
  /** Shown instead while the Secret does not exist yet. */
  fallback?: string;
}

export interface Config {
  envFile: string;
  namespace: string;
  errorzPort: number;
  /** The analysis fails a pod above this error ratio. */
  maxRatio: number;
  envs: EnvConfig[];
  secretEnvs: SecretEnv[];
}

// The same .env the script commands read (see .env.example at the repo root).
function parseEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

const ENVS = [
  { key: "PROD", name: "production" },
  { key: "STAGE", name: "stage" },
  { key: "DEMO", name: "demo" },
] as const;

export function loadConfig(): Config {
  const { envFile } = getPreferenceValues<Preferences>();
  const values = parseEnvFile(envFile);
  const namespace = values.K8S_NAMESPACE;
  if (!namespace) throw new Error(`Set K8S_NAMESPACE in ${envFile}`);

  // An environment shows up in a command once its context and that command's resource are set.
  const clusters = ENVS.map(({ key, name }) => ({ key, name, context: values[`K8S_CONTEXT_${key}`] })).filter(
    (c) => c.context,
  );
  return {
    envFile,
    namespace,
    errorzPort: Number(values.CANARY_ERRORZ_PORT || 8081),
    maxRatio: Number(values.CANARY_MAX_ERROR_RATIO || 0.02),
    envs: clusters
      .filter((c) => values[`K8S_ROLLOUT_${c.key}`])
      .map((c) => ({
        name: c.name,
        context: c.context,
        rollout: values[`K8S_ROLLOUT_${c.key}`],
        minRequests: Number(values[`CANARY_MIN_REQUESTS_${c.key}`] || 100),
      })),
    secretEnvs: clusters
      .filter((c) => values[`K8S_SECRET_${c.key}`])
      .map((c) => ({
        name: c.name,
        context: c.context,
        secret: values[`K8S_SECRET_${c.key}`],
        fallback: values[`K8S_SECRET_${c.key}_FALLBACK`] || undefined,
      })),
  };
}
