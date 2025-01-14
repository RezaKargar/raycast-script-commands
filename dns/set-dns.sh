#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Set Dns
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🛜
# @raycast.argument1 { "type": "text", "placeholder": "Placeholder", "optional": true }
# @raycast.packageName Utils

# Documentation:
# @raycast.description Sets DNS
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

# Usage: set_dns.sh [provider]
# Providers: shecan (default), begzar, bogzar, 403

# DNS provider configurations
DNS_PROVIDERS_SHECAN="178.22.122.100 185.51.200.2"
DNS_PROVIDERS_BEGZAR="185.55.226.26 185.55.225.25"
DNS_PROVIDERS_BOGZAR="185.55.226.26 185.55.225.25"
DNS_PROVIDERS_403="10.202.10.202 10.202.10.102"

PROVIDER=${1:-shecan}

case "$PROVIDER" in
  shecan) DNS="$DNS_PROVIDERS_SHECAN" ;;
  begzar) DNS="$DNS_PROVIDERS_BEGZAR" ;;
  bogzar) DNS="$DNS_PROVIDERS_BOGZAR" ;;
  403)    DNS="$DNS_PROVIDERS_403" ;;
  *) echo "Invalid provider. Use shecan, begzar, bogzar, or 403."; exit 1 ;;
esac

# Apply DNS settings
echo "Setting DNS to $PROVIDER ($DNS)"
networksetup -setdnsservers Wi-Fi $DNS
echo "DNS set to $PROVIDER ($DNS) successfully."
