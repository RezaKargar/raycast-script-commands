import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  Image,
  Keyboard,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { ReactNode, useState } from "react";
import { Config, EnvConfig } from "./config";
import { getErrorz, getEvents, getStatus, PodErrorz, RolloutEvent, RolloutStatus, Status } from "./kube";
import { ago, errorMessage, SettingsNeeded, useConfig, useInterval } from "./shared";

// The Rollouts are cheap to read; /errorz needs a port-forward per pod, so it refreshes less often
// and only for the selected environment.
const STATUS_REFRESH_MS = 15_000;
const DETAIL_REFRESH_MS = 30_000;

type StatusResult = { status: Status } | { error: string };

// The side panel and the full view share their content; this is either one's Metadata.
type Meta = typeof Detail.Metadata;

async function readStatus(config: Config, env: EnvConfig): Promise<StatusResult> {
  try {
    return { status: await getStatus(config, env) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

function rolloutOf(result?: StatusResult): RolloutStatus | undefined {
  return result && "status" in result && result.status.kind === "rollout" ? result.status.rollout : undefined;
}

/** The new pods' /errorz and the recent events, read while `active`. */
function usePodsAndEvents(config: Config, env: EnvConfig, rollout: RolloutStatus | undefined, active: boolean) {
  const detail = useCachedPromise(
    async (_name: string, hash: string) => {
      const [events, pods] = await Promise.all([
        getEvents(config, env),
        hash ? getErrorz(config, env, hash) : Promise.resolve([]),
      ]);
      return { events, pods, at: new Date() };
    },
    [env.name, rollout?.currentHash ?? ""],
    { execute: active && rollout !== undefined, keepPreviousData: true },
  );
  useInterval(() => {
    if (active && rollout) detail.revalidate();
  }, DETAIL_REFRESH_MS);
  return detail;
}

export default function Command() {
  const loaded = useConfig((c) => (c.envs.length ? undefined : "Set K8S_CONTEXT_<ENV> and K8S_ROLLOUT_<ENV>"));
  if ("error" in loaded) return <SettingsNeeded title="Canary Status" error={loaded.error} />;
  return <Environments config={loaded.config} />;
}

function Environments({ config }: { config: Config }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, revalidate } = useCachedPromise(
    async (names: string[]): Promise<Record<string, StatusResult>> => {
      const results = await Promise.all(
        config.envs.map(async (env): Promise<[string, StatusResult]> => [env.name, await readStatus(config, env)]),
      );
      return Object.fromEntries(results.filter(([name]) => names.includes(name)));
    },
    [config.envs.map((env) => env.name)],
    { keepPreviousData: true },
  );
  useInterval(revalidate, STATUS_REFRESH_MS);

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      navigationTitle="Canary Status"
      searchBarPlaceholder="Filter environments"
      onSelectionChange={setSelected}
    >
      {config.envs.map((env) => (
        <EnvItem
          key={env.name}
          config={config}
          env={env}
          result={data?.[env.name]}
          selected={selected === env.name}
          refreshStatus={revalidate}
        />
      ))}
    </List>
  );
}

function EnvItem(props: {
  config: Config;
  env: EnvConfig;
  result?: StatusResult;
  selected: boolean;
  refreshStatus: () => void;
}) {
  const { config, env, result, selected, refreshStatus } = props;
  const rollout = rolloutOf(result);
  // The full view reads the pods itself, so the side panel pauses while it is open.
  const [inFullView, setInFullView] = useState(false);
  const detail = usePodsAndEvents(config, env, rollout, selected && !inFullView);

  const refresh = () => {
    refreshStatus();
    if (rollout) detail.revalidate();
  };
  const pods = detail.data?.pods ?? [];
  const events = detail.data?.events ?? [];

  return (
    <List.Item
      id={env.name}
      title={env.name}
      icon={statusIcon(result)}
      subtitle={statusSubtitle(result)}
      detail={
        <List.Item.Detail
          isLoading={!result || (rollout !== undefined && detail.isLoading && !detail.data)}
          markdown={detailMarkdown(config, env, result, pods, events)}
          metadata={detailMetadata(List.Item.Detail.Metadata, env, result, detail.data?.at)}
        />
      }
      actions={
        <EnvActions config={config} env={env} rollout={rollout} pods={pods} events={events} refresh={refresh}>
          <Action.Push
            title="Open Full View"
            icon={Icon.Maximize}
            target={<FullView config={config} env={env} />}
            onPush={() => setInFullView(true)}
            onPop={() => setInFullView(false)}
          />
        </EnvActions>
      }
    />
  );
}

/** One environment across the whole window, with the same content as its side panel. */
function FullView({ config, env }: { config: Config; env: EnvConfig }) {
  const status = useCachedPromise((e: EnvConfig) => readStatus(config, e), [env], { keepPreviousData: true });
  useInterval(status.revalidate, STATUS_REFRESH_MS);
  const result = status.data;
  const rollout = rolloutOf(result);
  const detail = usePodsAndEvents(config, env, rollout, true);

  const refresh = () => {
    status.revalidate();
    if (rollout) detail.revalidate();
  };
  const pods = detail.data?.pods ?? [];
  const events = detail.data?.events ?? [];

  return (
    <Detail
      navigationTitle={`Canary Status · ${env.name}`}
      isLoading={status.isLoading || detail.isLoading}
      markdown={result ? `# ${env.name}\n\n${detailMarkdown(config, env, result, pods, events)}` : ""}
      metadata={detailMetadata(Detail.Metadata, env, result, detail.data?.at)}
      actions={<EnvActions config={config} env={env} rollout={rollout} pods={pods} events={events} refresh={refresh} />}
    />
  );
}

/** `children` go first, so they take ↵. */
function EnvActions(props: {
  config: Config;
  env: EnvConfig;
  rollout?: RolloutStatus;
  pods: PodErrorz[];
  events: RolloutEvent[];
  refresh: () => void;
  children?: ReactNode;
}) {
  const { config, env, rollout, pods, events, refresh, children } = props;
  return (
    <ActionPanel>
      {children}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
      {rollout && (
        <Action.Push
          title="Show All Events"
          icon={Icon.List}
          shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
          target={<EventsView env={env} events={events} />}
        />
      )}
      <ActionPanel.Section title="Copy">
        {pods.length > 0 && (
          <ActionPanel.Submenu title="Copy Pod Name" icon={Icon.Clipboard} shortcut={Keyboard.Shortcut.Common.Copy}>
            {pods.map(({ pod }) => (
              <Action.CopyToClipboard key={pod} title={pod} content={pod} />
            ))}
          </ActionPanel.Submenu>
        )}
        <Action.CopyToClipboard
          title="Copy Rollout Name"
          content={env.rollout}
          shortcut={Keyboard.Shortcut.Common.CopyName}
        />
        <Action.CopyToClipboard
          title="Copy Watch Command"
          icon={Icon.Terminal}
          content={`kubectl argo rollouts get rollout ${env.rollout} --context ${env.context} -n ${config.namespace} --watch`}
          shortcut={{ modifiers: ["cmd", "shift"], key: "w" }}
        />
      </ActionPanel.Section>
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel>
  );
}

function EventsView({ env, events }: { env: EnvConfig; events: RolloutEvent[] }) {
  return (
    <List navigationTitle={`${env.name} · events`} searchBarPlaceholder="Filter events (kept ~1h)">
      <List.EmptyView icon={Icon.Clock} title="No events" description="Kubernetes keeps events for about an hour." />
      {[...events].reverse().map((event, i) => (
        <List.Item
          key={i}
          icon={eventIcon(event.reason)}
          title={event.reason}
          subtitle={event.message}
          accessories={[{ text: ago(event.time), tooltip: event.time }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Message" content={event.message} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

// --- the list item -------------------------------------------------------------------------------

function phaseLook(rollout: RolloutStatus): { icon: Image.ImageLike; color: Color; label: string } {
  if (rollout.aborted) return { icon: { source: Icon.Stop, tintColor: Color.Red }, color: Color.Red, label: "Aborted" };
  const looks: Record<string, [Icon, Color]> = {
    Healthy: [Icon.CheckCircle, Color.Green],
    Progressing: [Icon.CircleProgress50, Color.Blue],
    Paused: [Icon.Pause, Color.Yellow],
    Degraded: [Icon.XMarkCircle, Color.Red],
  };
  const [icon, color] = looks[rollout.phase] ?? [Icon.QuestionMarkCircle, Color.SecondaryText];
  return { icon: { source: icon, tintColor: color }, color, label: rollout.phase };
}

function statusIcon(result?: StatusResult): Image.ImageLike {
  if (!result) return { source: Icon.Circle, tintColor: Color.SecondaryText };
  if ("error" in result) return { source: Icon.Warning, tintColor: Color.Orange };
  if (result.status.kind === "deployment") return { source: Icon.Circle, tintColor: Color.SecondaryText };
  return phaseLook(result.status.rollout).icon;
}

function statusSubtitle(result?: StatusResult): string {
  if (!result) return "loading…";
  if ("error" in result) return "could not read";
  if (result.status.kind === "deployment") return "no Rollout";
  const { revision, step, steps } = result.status.rollout;
  return `rev ${revision} · ${step}/${steps}`;
}

// --- the detail panel ----------------------------------------------------------------------------

function detailMarkdown(
  config: Config,
  env: EnvConfig,
  result: StatusResult | undefined,
  pods: PodErrorz[],
  events: RolloutEvent[],
): string {
  if (!result) return "";
  if ("error" in result) return `## ❌ Could not read ${env.rollout}\n\n\`\`\`\n${result.error}\n\`\`\``;
  if (result.status.kind === "deployment") {
    return "## ⚪ No Rollout here\n\nThe canary is off on this environment, so a deploy replaces the pods directly and nothing is analysed.";
  }

  const lines = [
    "## 🩺 /errorz on the new pods",
    `_Fails above ${percent(config.maxRatio)} once a pod has served ${env.minRequests} requests._`,
    "",
  ];
  if (pods.length === 0) {
    lines.push("⚪ No pods yet.");
  } else {
    lines.push("| | Pod | Last 2m | Since start |", "|---|---|---|---|");
    for (const p of pods) {
      const name = `\`${shortPod(env, p.pod)}\``;
      if ("error" in p) {
        lines.push(`| ⚠️ | ${name} | ${p.error} | |`);
        continue;
      }
      const { window: w, since_start: s } = p.errorz;
      lines.push(
        `| ${podVerdict(config, env, p.errorz)} | ${name} | ${w.requests} req · ${w.errors} err · **${percent(w.error_ratio)}** | ${s.requests} req · ${s.errors} err |`,
      );
    }
  }

  lines.push("", "## 📜 Recent events", "");
  const verdict = [...events]
    .reverse()
    .find((e) => /AnalysisRun(Successful|Failed|Error)|RolloutAborted/.test(e.reason));
  if (verdict)
    lines.push(`**Verdict:** ${eventEmoji(verdict.reason)} **${verdict.reason}** · ${ago(verdict.time)} ago`, "");
  if (events.length === 0) {
    lines.push("⚪ None: the last deploy was more than about an hour ago.");
  } else {
    lines.push("| | When | Reason | Message |", "|---|---|---|---|");
    for (const e of events.slice(-6).reverse()) {
      lines.push(`| ${eventEmoji(e.reason)} | ${ago(e.time)} | **${e.reason}** | ${e.message.replace(/\|/g, "\\|")} |`);
    }
    if (events.length > 6) lines.push("", `_${events.length - 6} more: ⌘⇧E shows them all._`);
  }
  return lines.join("\n");
}

function detailMetadata(M: Meta, env: EnvConfig, result: StatusResult | undefined, at?: Date) {
  const where = [
    <M.Label key="rollout" title="Rollout" text={env.rollout} />,
    <M.Label key="context" title="Context" text={env.context} />,
  ];
  if (!result || "error" in result) return <M>{where}</M>;
  if (result.status.kind === "deployment") {
    const d = result.status.deployment;
    return (
      <M>
        {where}
        <M.Separator />
        <M.Label title="Ready" text={`${d.ready}/${d.wanted}`} />
        <M.Label title="Updated" text={String(d.updated)} />
      </M>
    );
  }

  const r = result.status.rollout;
  const phase = phaseLook(r);
  const analysis = r.analysis;
  return (
    <M>
      <M.TagList title="Phase">
        <M.TagList.Item text={phase.label} color={phase.color} />
        {r.pausedReasons.map((reason) => (
          <M.TagList.Item key={reason} text={`paused: ${reason}`} color={Color.Yellow} />
        ))}
      </M.TagList>
      <M.Label title="Step" text={`${progressBar(r.step, r.steps)}  ${r.step}/${r.steps}`} />
      <M.Label title="Revision" text={r.revision} />
      <M.Label
        title="Pods"
        text={
          r.stableHash === r.currentHash
            ? `${r.currentHash} = stable (promoted)`
            : `new ${r.currentHash}, stable ${r.stableHash}`
        }
      />
      {analysis ? (
        <M.TagList title="Analysis">
          <M.TagList.Item text={`${analysis.status}`} color={analysisColor(analysis.status)} />
        </M.TagList>
      ) : (
        <M.Label title="Analysis" text="none running (only during a canary)" />
      )}
      {analysis?.message && <M.Label title="Analysis Message" text={analysis.message} />}
      {r.message && <M.Label title="Message" text={r.message} />}
      <M.Separator />
      {where}
      {at && <M.Label title="Pods and Events Read" text={at.toLocaleTimeString()} />}
    </M>
  );
}

function podVerdict(
  config: Config,
  env: EnvConfig,
  e: { tracking: boolean; window: { requests: number; error_ratio: number } },
) {
  if (!e.tracking) return "⚪ not counting";
  if (e.window.requests < env.minRequests) return "🟡 too few requests";
  if (e.window.error_ratio <= config.maxRatio) return "✅ passes";
  return "❌ **FAILS**";
}

function analysisColor(status: string): Color {
  return (
    { Successful: Color.Green, Running: Color.Blue, Failed: Color.Red, Error: Color.Red, Inconclusive: Color.Yellow }[
      status
    ] ?? Color.SecondaryText
  );
}

// AnalysisRun and Metric verdicts end in Successful, Failed or Error.
function eventEmoji(reason: string): string {
  if (reason === "RolloutAborted") return "🛑";
  if (reason.endsWith("Successful")) return "✅";
  if (/(Failed|Error)$/.test(reason)) return "❌";
  if (reason === "RolloutPaused") return "⏸️";
  if (/Rollout(Step)?Completed/.test(reason)) return "➡️";
  return "•";
}

function eventIcon(reason: string): Image.ImageLike {
  if (reason === "RolloutAborted") return { source: Icon.Stop, tintColor: Color.Red };
  if (reason.endsWith("Successful")) return { source: Icon.CheckCircle, tintColor: Color.Green };
  if (/(Failed|Error)$/.test(reason)) return { source: Icon.XMarkCircle, tintColor: Color.Red };
  if (reason === "RolloutPaused") return { source: Icon.Pause, tintColor: Color.Yellow };
  if (/Rollout(Step)?Completed/.test(reason)) return { source: Icon.ArrowRight, tintColor: Color.Blue };
  return { source: Icon.Dot, tintColor: Color.SecondaryText };
}

// --- small helpers -------------------------------------------------------------------------------

function progressBar(step: number, steps: number): string {
  const width = 12;
  const filled = steps > 0 ? Math.round((Math.min(step, steps) / steps) * width) : 0;
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 10000) / 100}%`;
}

// Pods are named <rollout>-<hash>-<suffix>; the rollout part is already on screen.
function shortPod(env: EnvConfig, pod: string): string {
  return pod.startsWith(`${env.rollout}-`) ? pod.slice(env.rollout.length + 1) : pod;
}
