#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Secret Last Changed
# @raycast.mode fullOutput
# @raycast.packageName Kubernetes
# @raycast.argument1 { "type": "text", "placeholder": "production | stage | demo", "optional": true }

# Optional parameters:
# @raycast.icon 🔐
# @raycast.description Shows when the configured Secret last changed in Kubernetes, and how long ago

# Documentation:
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

# Raycast runs scripts with a minimal PATH.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

# Contexts, namespace and Secret names come from the repo's .env (see .env.example).
env_file="$(cd "$(dirname "$0")/.." && pwd)/.env"
[ -f "$env_file" ] || { echo "Error: missing $env_file (copy .env.example and fill it in)"; exit 1; }
set -a; . "$env_file"; set +a
namespace="${K8S_NAMESPACE:?set K8S_NAMESPACE in .env}"

# Every kubectl call goes through k, which runs only get, so nothing here can change the cluster.
k() {
    case "$1" in
        get) kubectl --context "$context" -n "$namespace" "$@" ;;
        *) echo "Error: refusing 'kubectl $1': this script is read-only" >&2; return 1 ;;
    esac
}

env=$(echo "${1:-production}" | tr '[:upper:]' '[:lower:]' | xargs)
case "$env" in
    prod|production)
        env="production"
        context="${K8S_CONTEXT_PROD:?set K8S_CONTEXT_PROD in .env}"
        secret="${K8S_SECRET_PROD:?set K8S_SECRET_PROD in .env}"
        # Until the Secret exists, the optional fallback is shown instead.
        if [ -n "$K8S_SECRET_PROD_FALLBACK" ] && ! k get secret "$secret" >/dev/null 2>&1; then
            secret="$K8S_SECRET_PROD_FALLBACK"
            note="fallback, $K8S_SECRET_PROD does not exist yet"
        fi
        ;;
    stage)
        context="${K8S_CONTEXT_STAGE:?set K8S_CONTEXT_STAGE in .env}"
        secret="${K8S_SECRET_STAGE:?set K8S_SECRET_STAGE in .env}"
        ;;
    demo)
        context="${K8S_CONTEXT_DEMO:?set K8S_CONTEXT_DEMO in .env}"
        secret="${K8S_SECRET_DEMO:?set K8S_SECRET_DEMO in .env}"
        ;;
    *)
        echo "Error: unknown environment '$env' (use production, prod, stage or demo)"
        exit 1
        ;;
esac

if ! json=$(k get secret "$secret" --show-managed-fields -o json 2>&1); then
    echo "Error: could not read $secret on $context"
    echo "$json"
    exit 1
fi

echo "env:     $env ($secret${note:+, $note})"
echo "$json" | jq -r '[.metadata.managedFields[].time] | max as $t | (now - ($t|fromdateiso8601) | floor) as $d | "changed: \($t)\nnow:     \(now|floor|todate)\nago:     \(if $d < 60 then "\($d)s" elif $d < 3600 then "\($d/60|floor)m \($d%60)s" elif $d < 86400 then "\($d/3600|floor)h \(($d%3600)/60|floor)m" else "\($d/86400|floor)d \(($d%86400)/3600|floor)h" end) ago"'
