import { getPreferenceValues } from "@raycast/api";
import { readFileSync } from "node:fs";

/** Where an environment lives: its kubectl context and namespace. */
export interface Cluster {
  name: string;
  context: string;
  namespace: string;
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
  /** The pods' private /errorz port. Unset, Canary Status does not read the pods. */
  errorzPort?: number;
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

export function loadConfig(): Config {
  const { envFile } = getPreferenceValues<Preferences>();
  const values = parseEnvFile(envFile);
  const keys = (values.K8S_ENVIRONMENTS || "PROD,STAGE,DEMO")
    .split(",")
    .map((key) => key.trim().toUpperCase())
    .filter(Boolean);

  // An environment shows up in a command once its context and that command's resource are set.
  const clusters = keys
    .map((key) => ({
      key,
      name: key.toLowerCase(),
      context: values[`K8S_CONTEXT_${key}`],
      namespace: values[`K8S_NAMESPACE_${key}`] || values.K8S_NAMESPACE,
    }))
    .filter((c) => c.context);
  const missing = clusters.find((c) => !c.namespace);
  if (missing) throw new Error(`Set K8S_NAMESPACE or K8S_NAMESPACE_${missing.key} in ${envFile}`);
  const cluster = (c: (typeof clusters)[number]): Cluster => ({
    name: c.name,
    context: c.context,
    namespace: c.namespace,
  });

  return {
    envFile,
    errorzPort: values.CANARY_ERRORZ_PORT ? Number(values.CANARY_ERRORZ_PORT) : undefined,
    maxRatio: Number(values.CANARY_MAX_ERROR_RATIO || 0.02),
    envs: clusters
      .filter((c) => values[`K8S_ROLLOUT_${c.key}`])
      .map((c) => ({
        ...cluster(c),
        rollout: values[`K8S_ROLLOUT_${c.key}`],
        minRequests: Number(values[`CANARY_MIN_REQUESTS_${c.key}`] || 100),
      })),
    secretEnvs: clusters
      .filter((c) => values[`K8S_SECRET_${c.key}`])
      .map((c) => ({
        ...cluster(c),
        secret: values[`K8S_SECRET_${c.key}`],
        fallback: values[`K8S_SECRET_${c.key}_FALLBACK`] || undefined,
      })),
  };
}
