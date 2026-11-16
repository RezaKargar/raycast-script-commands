# Raycast Script Commands

This repository contains a set of shell scripts designed to be used with Raycast, a productivity tool for macOS. These scripts provide various utilities, including DNS management and terminal operations.

## Setup

The Kubernetes Checks extension reads its kubectl contexts, namespace, resource names and canary thresholds from a `.env` file at the repository root, which is git-ignored. Copy [.env.example](.env.example) to `.env` and fill it in.

## Scripts

### List DNS

Lists the current DNS provider if any is set.

- **File:** [dns/list-dns.sh](dns/list-dns.sh)
- **Usage:** `./dns/list-dns.sh`

### Set DNS

Sets the DNS to a specified provider.

- **File:** [dns/set-dns.sh](dns/set-dns.sh)
- **Usage:** `./dns/set-dns.sh [provider]`
- **Providers:** `shecan` (default), `begzar`, `bogzar`, `403`

### Remove DNS

Removes custom DNS settings and resets to automatic.

- **File:** [dns/remove-dns.sh](dns/remove-dns.sh)
- **Usage:** `./dns/remove-dns.sh`

### Flush DNS

Flushes macOS DNS cache.

- **File:** [dns/flush-dns.sh](dns/flush-dns.sh)
- **Usage:** `./dns/flush-dns.sh`

### My IP

Gets public IP and shows proxy if used.

- **File:** [ip/my-ip.sh](ip/my-ip.sh)
- **Usage:** `./ip/my-ip.sh`

### Kubernetes Checks (Raycast extension)

Two Kubernetes checks as interactive Raycast views, refreshing while open. Read-only: kubectl calls go through a guard that runs only `kubectl get` and `kubectl port-forward`.

- **Folder:** [extensions/k8s-checks](extensions/k8s-checks)
- **Install:** `cd extensions/k8s-checks && npm install && npm run dev`, then set its **.env File** preference to this repo's `.env`
- **Canary Status:** how the canary analysis went on the configured Rollout's latest deploy. One row per environment with its phase, and a side panel with the step progress, analysis, each new pod's `/errorz` verdict and the recent events. The Rollouts refresh every 15s, the selected environment's pods and events every 30s. `⌘R` refresh, `⌘⇧E` all events, `⌘⇧W` copy a read-only `kubectl argo rollouts … --watch` command, and copy a pod or Rollout name.
- **Secret Last Changed:** when a configured Secret last changed. One row per environment with how long ago it changed (orange within the hour, blue within the day), and a side panel with the exact time, its owner, and which manager last wrote which fields. It reads only the Secret's creation time, resource version, owner and managed fields, never its values or annotations. Refreshes every 30s. `⌘R` refresh, `⌘⇧D` copy a `kubectl describe` command (which shows key sizes, not values), and copy the Secret name or changed time.
- `↵` opens the selected environment in a full view that uses the whole Raycast window, with the same content and actions as the side panel. For a bigger window overall, raise Raycast's own **Interface Size** setting; extensions cannot resize the window.
- `⌘K` lists every action with its shortcut.

### Open Terminal

Opens the Warp terminal application.

- **File:** [terminal.sh](terminal.sh)
- **Usage:** `./terminal.sh`

### Run Script

Runs predefined or custom scripts.

- **File:** [run-script.sh](run-script.sh)
- **Usage:** `./run-script.sh [script name]`
- **Predefined Scripts:**
  - `mfa.sh` or `mfa`: Runs the `mfa.sh` script with sudo.
  - `mfa d`: Runs the `mfa.sh` script with the `d` argument and sudo.
  - Any other script name will be executed as provided.

## Author

- **Reza Kargar**
- **Website:** [https://rezakargar.ir](https://rezakargar.ir)

## License

This project is licensed under the MIT License.