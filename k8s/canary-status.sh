#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Canary Status
# @raycast.mode fullOutput
# @raycast.packageName Kubernetes
# @raycast.argument1 { "type": "text", "placeholder": "prod | stage | demo", "optional": true }

# Optional parameters:
# @raycast.icon 🐤
# @raycast.description Shows how the canary analysis went on the configured Rollout's latest deploy: Rollout step, analysis result, recent events, and each new pod's /errorz

# Documentation:
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

# Read-only: kubectl get, plus a short port-forward to each new pod's private /errorz port.

# Raycast runs scripts with a minimal PATH.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

# Contexts, namespace, Rollout names and canary thresholds come from the repo's .env (see
# .env.example).
env_file="$(cd "$(dirname "$0")/.." && pwd)/.env"
[ -f "$env_file" ] || { echo "Error: missing $env_file (copy .env.example and fill it in)"; exit 1; }
set -a; . "$env_file"; set +a
namespace="${K8S_NAMESPACE:?set K8S_NAMESPACE in .env}"
errorz_port="${CANARY_ERRORZ_PORT:-8081}"
# The canary check's thresholds, as the AnalysisTemplate sets them.
max_ratio="${CANARY_MAX_ERROR_RATIO:-0.02}"

env=$(echo "${1:-production}" | tr '[:upper:]' '[:lower:]' | xargs)
case "$env" in
    prod|production)
        env="production"
        context="${K8S_CONTEXT_PROD:?set K8S_CONTEXT_PROD in .env}"
        rollout="${K8S_ROLLOUT_PROD:?set K8S_ROLLOUT_PROD in .env}"
        min_requests="${CANARY_MIN_REQUESTS_PROD:-100}"
        ;;
    stage|stg)
        env="stage"
        context="${K8S_CONTEXT_STAGE:?set K8S_CONTEXT_STAGE in .env}"
        rollout="${K8S_ROLLOUT_STAGE:?set K8S_ROLLOUT_STAGE in .env}"
        min_requests="${CANARY_MIN_REQUESTS_STAGE:-100}"
        ;;
    demo)
        context="${K8S_CONTEXT_DEMO:?set K8S_CONTEXT_DEMO in .env}"
        rollout="${K8S_ROLLOUT_DEMO:?set K8S_ROLLOUT_DEMO in .env}"
        min_requests="${CANARY_MIN_REQUESTS_DEMO:-100}"
        ;;
    *)
        echo "Error: unknown environment '$env' (use prod, production, stage, stg or demo)"
        exit 1
        ;;
esac

# Every kubectl call goes through k, which runs only get and port-forward, so nothing here can
# change the cluster.
k() {
    case "$1" in
        get|port-forward) kubectl --context "$context" -n "$namespace" "$@" ;;
        *) echo "Error: refusing 'kubectl $1': this script is read-only" >&2; return 1 ;;
    esac
}

# "3m 20s ago" from an RFC 3339 time.
ago() {
    jq -rn --arg t "$1" '(now - ($t|fromdateiso8601) | floor) as $d |
        if $d < 60 then "\($d)s" elif $d < 3600 then "\($d/60|floor)m \($d%60)s"
        elif $d < 86400 then "\($d/3600|floor)h \(($d%3600)/60|floor)m"
        else "\($d/86400|floor)d \(($d%86400)/3600|floor)h" end'
}

# Raycast's fullOutput renders these ANSI styles, as terminals do.
B=$'\033[1m' D=$'\033[2m' R=$'\033[0m' GREEN=$'\033[32m' RED=$'\033[31m' YELLOW=$'\033[33m'
section() { echo; echo "$B$1$R${2:+ $D$2$R}"; }
# A bold, aligned label in front of a value.
row() { printf '%s%-10s%s %s\n' "$B" "$1" "$R" "$2"; }

echo "🐤 ${B}Canary status · $env$R"
echo "$D$rollout on $context$R"

if ! json=$(k get rollout "$rollout" -o json 2>&1); then
    if echo "$json" | grep -q NotFound; then
        echo
        echo "⚪ ${B}No Rollout on $env:$R the canary is off here, so a deploy replaces the pods"
        echo "   directly and nothing is analysed."
        echo
        k get deployment "$rollout" -o custom-columns='DEPLOYMENT:.metadata.name,READY:.status.readyReplicas,WANTED:.spec.replicas,UPDATED:.status.updatedReplicas' 2>&1
        exit 0
    fi
    echo "❌ ${RED}${B}Could not read Rollout $rollout$R"
    echo "$json"
    exit 1
fi

# --- the Rollout ---------------------------------------------------------------------------------
section "📦 Rollout"
echo "$json" | jq -r '
    (.spec.strategy.canary.steps | length) as $n |
    .status as $s |
    ($s.currentStepIndex // 0) as $i |
    $s.canary.currentBackgroundAnalysisRunStatus as $a |
    ["revision", .metadata.annotations["rollout.argoproj.io/revision"] // "?"],
    ["phase", (if $s.abort then "🛑 \($s.phase // "?") (ABORTED)"
               else ({"Healthy": "✅", "Progressing": "⏳", "Paused": "⏸️ ", "Degraded": "❌"}[$s.phase] // "❔")
                    + " \($s.phase // "?")" end)
              + (if $s.pauseConditions then " (paused: \([$s.pauseConditions[].reason] | join(", ")))" else "" end)],
    ["step", "\($i)/\($n)" + (if $i >= $n then " (all steps done)" else "" end)],
    ["pods", "new \($s.currentPodHash)"
             + (if $s.stableRS == $s.currentPodHash then " = stable (promoted)"
                else ", stable \($s.stableRS) (canary in progress)" end)],
    ["analysis", (if $a then
                    ({"Successful": "✅", "Running": "🔄", "Failed": "❌", "Error": "❌", "Inconclusive": "⚠️ "}[$a.status] // "❔")
                    + " \($a.name): \($a.status)" + (if $a.message then " — \($a.message)" else "" end)
                  else "⚪ none running (it runs only while a canary is in progress)" end)],
    (if $s.message then ["message", $s.message] else empty end)
    | @tsv' |
    while IFS=$'\t' read -r label value; do row "$label" "$value"; done
current=$(echo "$json" | jq -r '.status.currentPodHash')

# --- what happened: steps, scaling, analysis verdicts --------------------------------------------
# Kubernetes keeps events for about an hour, so an older deploy shows nothing here.
section "📜 Recent events" "(kept ~1h)"
events=$(k get events -o json 2>/dev/null | jq -r --arg r "$rollout" '
    [.items[] | select((.involvedObject.kind == "Rollout" and .involvedObject.name == $r)
                    or (.involvedObject.kind == "AnalysisRun" and (.involvedObject.name | startswith($r + "-"))))]
    | sort_by(.lastTimestamp // .eventTime) | .[-15:][]
    | "\(.lastTimestamp // .eventTime)  \(.reason)  \(.message)"')
if [ -n "$events" ]; then
    while IFS= read -r line; do
        t=${line%%  *}
        rest=${line#*  }
        reason=${rest%%  *}
        case "$reason" in
            AnalysisRunSuccessful) icon="✅" ;;
            AnalysisRunFailed|AnalysisRunError) icon="❌" ;;
            RolloutAborted) icon="🛑" ;;
            RolloutCompleted|RolloutStepCompleted) icon="➡️ " ;;
            RolloutPaused) icon="⏸️ " ;;
            *) icon="• " ;;
        esac
        printf '%s %s%-9s%s %s%s%s  %s\n' "$icon" "$D" "$(ago "$t")" "$R" "$B" "$reason" "$R" "${rest#*  }"
    done <<< "$events"
    verdict=$(echo "$events" | grep -E 'AnalysisRun(Successful|Failed|Error)|RolloutAborted' | tail -1)
    if [ -n "$verdict" ]; then
        verdict=${verdict#*  }
        case "$verdict" in
            AnalysisRunSuccessful*) row "verdict" "✅ $GREEN$B${verdict%%  *}$R  ${verdict#*  }" ;;
            *) row "verdict" "❌ $RED$B${verdict%%  *}$R  ${verdict#*  }" ;;
        esac
    fi
else
    echo "⚪ none: the last deploy was more than about an hour ago"
fi

# --- each new pod's own counts -------------------------------------------------------------------
section "🩺 /errorz on the new pods"
echo "${D}hash $current; fails above ratio $max_ratio with >= $min_requests requests$R"
pods=$(k get pods -l "rollouts-pod-template-hash=$current" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>&1)
if [ -z "$pods" ]; then
    echo "⚪ no pods with hash $current"
    exit 0
fi
pf=""
trap '[ -n "$pf" ] && kill "$pf" 2>/dev/null' EXIT
for pod in $pods; do
    port=$((18100 + RANDOM % 800))
    k port-forward "pod/$pod" "$port:$errorz_port" >/dev/null 2>&1 &
    pf=$!
    body=""
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        body=$(curl -s -m 3 -X GET "http://127.0.0.1:$port/errorz?window=2m") && [ -n "$body" ] && break
        sleep 0.5
    done
    kill "$pf" 2>/dev/null
    wait "$pf" 2>/dev/null
    pf=""
    if [ -z "$body" ]; then
        echo "⚠️  $B$pod$R: no answer on :$errorz_port (listener off, or the pod is not ready)"
        continue
    fi
    echo "$body" | jq -r --arg pod "$pod" --argjson max "$max_ratio" --argjson min "$min_requests" \
        --arg B "$B" --arg D "$D" --arg R "$R" --arg G "$GREEN" --arg RED "$RED" --arg Y "$YELLOW" '
        .window as $w |
        (if .tracking | not then "⚪ \($D)not counting (its tracking window is over)\($R)"
         elif $w.requests < $min then "🟡 \($Y)passes\($R) (too few requests to judge)"
         elif $w.error_ratio <= $max then "✅ \($G)\($B)passes\($R)"
         else "❌ \($RED)\($B)FAILS\($R)" end) as $v |
        "\($v)  \($B)\($pod)\($R)",
        "   \($w.requests) req, \($w.errors) err, ratio \($w.error_ratio * 10000 | round / 100)% in the last \($w.seconds | floor)s",
        "   \($D)up \(.uptime_seconds | floor)s; since start \(.since_start.requests) req, \(.since_start.errors) err\(if .tracking_ends then "; counts until \(.tracking_ends)" else "" end)\($R)"' 2>/dev/null \
        || echo "⚠️  $B$pod$R: unexpected answer: $body"
done
