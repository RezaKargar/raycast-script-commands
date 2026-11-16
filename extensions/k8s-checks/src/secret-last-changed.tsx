import { Action, ActionPanel, Color, Icon, Image, Keyboard, List, openExtensionPreferences } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Config, SecretEnv } from "./config";
import { getSecret, SecretInfo } from "./kube";
import { ago, errorMessage, SettingsNeeded, useConfig, useInterval, useNow } from "./shared";

const REFRESH_MS = 30_000;
const HOUR = 3600_000;

type SecretResult = { secret: SecretInfo } | { error: string };

export default function Command() {
  const loaded = useConfig((c) => (c.secretEnvs.length ? undefined : "Set K8S_CONTEXT_<ENV> and K8S_SECRET_<ENV>"));
  if ("error" in loaded) return <SettingsNeeded title="Secret Last Changed" error={loaded.error} />;
  return <Secrets config={loaded.config} />;
}

function Secrets({ config }: { config: Config }) {
  const { data, isLoading, revalidate } = useCachedPromise(
    async (names: string[]): Promise<Record<string, SecretResult>> => {
      const results = await Promise.all(
        config.secretEnvs.map(async (env): Promise<[string, SecretResult]> => {
          try {
            return [env.name, { secret: await getSecret(config, env) }];
          } catch (error) {
            return [env.name, { error: errorMessage(error) }];
          }
        }),
      );
      return Object.fromEntries(results.filter(([name]) => names.includes(name)));
    },
    [config.secretEnvs.map((env) => env.name)],
    { keepPreviousData: true },
  );
  useInterval(revalidate, REFRESH_MS);
  const now = useNow(1000);

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      navigationTitle="Secret Last Changed"
      searchBarPlaceholder="Filter environments"
    >
      {config.secretEnvs.map((env) => (
        <SecretItem key={env.name} config={config} env={env} result={data?.[env.name]} now={now} refresh={revalidate} />
      ))}
    </List>
  );
}

function SecretItem(props: {
  config: Config;
  env: SecretEnv;
  result?: SecretResult;
  now: number;
  refresh: () => void;
}) {
  const { config, env, result, now, refresh } = props;
  const secret = result && "secret" in result ? result.secret : undefined;
  const name = secret?.name ?? env.secret;

  return (
    <List.Item
      id={env.name}
      title={env.name}
      icon={itemIcon(result, now)}
      subtitle={!result ? "loading…" : secret ? `${ago(secret.changed, now)} ago` : "could not read"}
      detail={
        <List.Item.Detail
          isLoading={!result}
          markdown={detailMarkdown(env, result, now)}
          metadata={secret && <SecretMetadata config={config} env={env} secret={secret} now={now} />}
        />
      }
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={refresh}
          />
          <ActionPanel.Section title="Copy">
            {secret && (
              <Action.CopyToClipboard
                title="Copy Changed Time"
                content={secret.changed}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
            )}
            <Action.CopyToClipboard
              title="Copy Secret Name"
              content={name}
              shortcut={Keyboard.Shortcut.Common.CopyName}
            />
            {/* describe lists each key's size, never its value. */}
            <Action.CopyToClipboard
              title="Copy Describe Command"
              icon={Icon.Terminal}
              content={`kubectl describe secret ${name} --context ${env.context} -n ${config.namespace}`}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            />
          </ActionPanel.Section>
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}

// A change in the last hour is the one worth noticing; a day-old one is still fairly fresh.
function ageColor(changed: string, now: number): Color {
  const age = now - Date.parse(changed);
  if (age < HOUR) return Color.Orange;
  if (age < 24 * HOUR) return Color.Blue;
  return Color.SecondaryText;
}

function itemIcon(result: SecretResult | undefined, now: number): Image.ImageLike {
  if (!result) return { source: Icon.Lock, tintColor: Color.SecondaryText };
  if ("error" in result) return { source: Icon.Warning, tintColor: Color.Orange };
  return { source: Icon.Lock, tintColor: ageColor(result.secret.changed, now) };
}

function detailMarkdown(env: SecretEnv, result: SecretResult | undefined, now: number): string {
  if (!result) return "";
  if ("error" in result) return `## ❌ Could not read ${env.secret}\n\n\`\`\`\n${result.error}\n\`\`\``;

  const s = result.secret;
  const lines = [
    `## 🔐 Changed **${ago(s.changed, now)}** ago`,
    "",
    `🕒 ${new Date(s.changed).toLocaleString()}  ·  \`${s.changed}\``,
    "",
  ];
  if (s.fallback) lines.push(`> ⚠️ Showing the fallback \`${s.name}\`: \`${env.secret}\` does not exist yet.`, "");

  lines.push("### ✍️ Writes by manager", "");
  if (s.writes.length === 0) {
    lines.push("⚪ No managed fields: only its creation time is known.");
  } else {
    lines.push("| | Manager | Operation | Owns | When |", "|---|---|---|---|---|");
    s.writes.forEach((w, i) => {
      lines.push(
        `| ${i === 0 ? "🆕" : "•"} | **${w.manager}** | ${w.operation} | ${w.fields.join(", ")} | ${ago(w.time, now)} ago |`,
      );
    });
  }
  return lines.join("\n");
}

function SecretMetadata({
  config,
  env,
  secret,
  now,
}: {
  config: Config;
  env: SecretEnv;
  secret: SecretInfo;
  now: number;
}) {
  const M = List.Item.Detail.Metadata;
  return (
    <M>
      <M.TagList title="Changed">
        <M.TagList.Item text={`${ago(secret.changed, now)} ago`} color={ageColor(secret.changed, now)} />
        {secret.fallback && <M.TagList.Item text="fallback" color={Color.Yellow} />}
      </M.TagList>
      <M.Label title="Secret" text={secret.name} />
      {secret.owner && <M.Label title="Owner" text={secret.owner} />}
      <M.Label
        title="Created"
        text={`${new Date(secret.created).toLocaleString()} (${ago(secret.created, now)} ago)`}
      />
      <M.Label title="Resource Version" text={secret.resourceVersion} />
      <M.Separator />
      <M.Label title="Context" text={env.context} />
      <M.Label title="Namespace" text={config.namespace} />
      <M.Label title="Now" text={new Date(now).toLocaleTimeString()} />
    </M>
  );
}
