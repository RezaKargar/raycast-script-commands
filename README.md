# Raycast Script Commands

This repository contains a set of shell scripts designed to be used with Raycast, a productivity tool for macOS. These scripts provide various utilities, including DNS management and terminal operations.

## Setup

The `k8s/` scripts read their kubectl contexts, namespace, resource names and canary thresholds from a `.env` file at the repository root, which is git-ignored. Copy [.env.example](.env.example) to `.env` and fill it in.

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

### Secret Last Changed

Shows when a configured Secret last changed in Kubernetes, the current time, and how long ago.

- **File:** [k8s/secret-last-changed.sh](k8s/secret-last-changed.sh)
- **Usage:** `./k8s/secret-last-changed.sh [environment]`
- **Environments:** `production` or `prod` (default), `stage`, `demo`

### Canary Status

Shows how the canary analysis went on the configured Rollout's latest deploy: the Rollout's phase, step and analysis result, the last hour of Rollout and analysis events, and each new pod's own `/errorz` counts (read through a short port-forward). Read-only.

- **File:** [k8s/canary-status.sh](k8s/canary-status.sh)
- **Usage:** `./k8s/canary-status.sh [environment]`
- **Environments:** `prod` or `production` (default), `stage` or `stg`, `demo` (no canary there; shows the Deployment)

### Canary Status (Raycast extension)

The same check as an interactive Raycast view: one row per environment with its phase, and a side panel with the step progress, analysis, each new pod's `/errorz` verdict and the recent events. It refreshes while open (the Rollouts every 15s, the selected environment's pods and events every 30s). Read-only: it runs only `kubectl get` and `kubectl port-forward`.

- **Folder:** [extensions/canary-status](extensions/canary-status)
- **Install:** `cd extensions/canary-status && npm install && npm run dev`, then set its **.env File** preference to this repo's `.env`
- **Actions:** `⌘R` refresh, `⌘⇧E` all events, `⌘⇧W` copy a read-only `kubectl argo rollouts … --watch` command, and copy a pod or Rollout name (`⌘K` lists every action with its shortcut)

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