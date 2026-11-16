import { getPreferenceValues } from "@raycast/api";
import { readFileSync } from "node:fs";

export interface EnvConfig {
  name: string;
  context: string;
  rollout: string;
  /** A pod's error ratio is judged only once it has served this many requests. */
  minRequests: number;
}

export interface Config {
  namespace: string;
  errorzPort: number;
  /** The analysis fails a pod above this error ratio. */
  maxRatio: number;
  envs: EnvConfig[];
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
  const namespace = values.K8S_NAMESPACE;
  if (!namespace) throw new Error(`Set K8S_NAMESPACE in ${envFile}`);

  // An environment shows up once both its context and its Rollout are set.
  const envs = (["PROD", "STAGE", "DEMO"] as const)
    .map((key) => ({
      name: { PROD: "production", STAGE: "stage", DEMO: "demo" }[key],
      context: values[`K8S_CONTEXT_${key}`],
      rollout: values[`K8S_ROLLOUT_${key}`],
      minRequests: Number(values[`CANARY_MIN_REQUESTS_${key}`] || 100),
    }))
    .filter((env) => env.context && env.rollout);
  if (envs.length === 0) throw new Error(`Set K8S_CONTEXT_<ENV> and K8S_ROLLOUT_<ENV> in ${envFile}`);

  return {
    namespace,
    errorzPort: Number(values.CANARY_ERRORZ_PORT || 8081),
    maxRatio: Number(values.CANARY_MAX_ERROR_RATIO || 0.02),
    envs,
  };
}
