import { Action, ActionPanel, Detail, Icon, openExtensionPreferences } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { Config, loadConfig } from "./config";

/**
 * Loads the .env once. `check` returns what is missing for this command, if anything; either way
 * the error comes back as a message for <SettingsNeeded>.
 */
export function useConfig(check: (config: Config) => string | undefined): { config: Config } | { error: string } {
  return useMemo(() => {
    try {
      const config = loadConfig();
      const missing = check(config);
      return missing ? { error: `${missing} in ${config.envFile}` } : { config };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, []);
}

export function SettingsNeeded({ title, error }: { title: string; error: string }) {
  return (
    <Detail
      markdown={`# ⚙️ ${title} needs its settings\n\n${error}\n\nPoint the **.env File** preference at the script-commands repo's \`.env\` (see \`.env.example\`).`}
      actions={
        <ActionPanel>
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}

export function useInterval(callback: () => void, ms: number) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const id = setInterval(() => latest.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** The current time, updated every `ms`, so "ago" texts tick while the view is open. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}

/** "3m 20s" from an RFC 3339 time. */
export function ago(time: string, now = Date.now()): string {
  const d = Math.max(0, Math.floor((now - Date.parse(time)) / 1000));
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m ${d % 60}s`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`;
  return `${Math.floor(d / 86400)}d ${Math.floor((d % 86400) / 3600)}h`;
}

export function errorMessage(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr;
  return (stderr || (error instanceof Error ? error.message : String(error))).trim();
}
