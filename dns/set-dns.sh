#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Set Dns
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🛜
# @raycast.argument1 { "type": "text", "placeholder": "provider name", "optional": true }
# @raycast.packageName Utils

# Documentation:
# @raycast.description Sets DNS
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

# Usage: set_dns.sh [provider]
# Providers: shecan (default), begzar, bogzar, 403, yandex, shelter, electro, verisign, google, cloudflare
# Use 'list' to show all available DNS providers

# DNS provider configurations
DNS_PROVIDERS_SHECAN="178.22.122.100 185.51.200.2"
DNS_PROVIDERS_BEGZAR="185.55.226.26 185.55.225.25"
DNS_PROVIDERS_BOGZAR="185.55.226.26 185.55.225.25"
DNS_PROVIDERS_403="10.202.10.202 10.202.10.102"
DNS_PROVIDERS_YANDEX="77.88.8.8 77.88.8.1"
DNS_PROVIDERS_SHELTER="185.228.168.168 185.228.169.168"
DNS_PROVIDERS_ELECTRO="78.157.42.100 78.157.42.101"
DNS_PROVIDERS_VERISIGN="64.6.64.6 64.6.65.6"
DNS_PROVIDERS_GOOGLE="8.8.8.8 8.8.4.4"
DNS_PROVIDERS_CLOUDFLARE="1.1.1.1 1.0.0.1"

PROVIDER=${1:-shecan}

case "$PROVIDER" in
  shecan) DNS="$DNS_PROVIDERS_SHECAN" ;;
  begzar) DNS="$DNS_PROVIDERS_BEGZAR" ;;
  bogzar) DNS="$DNS_PROVIDERS_BOGZAR" ;;
  403)    DNS="$DNS_PROVIDERS_403" ;;
  yandex) DNS="$DNS_PROVIDERS_YANDEX" ;;
  shelter) DNS="$DNS_PROVIDERS_SHELTER" ;;
  electro) DNS="$DNS_PROVIDERS_ELECTRO" ;;
  verisign) DNS="$DNS_PROVIDERS_VERISIGN" ;;
  google) DNS="$DNS_PROVIDERS_GOOGLE" ;;
  cloudflare) DNS="$DNS_PROVIDERS_CLOUDFLARE" ;;
  *) echo "Invalid provider. Use shecan, begzar, bogzar, 403, yandex, shelter, electro, verisign, google, or cloudflare."; exit 1 ;;
esac

# Apply DNS settings
echo "Setting DNS to $PROVIDER ($DNS)"
networksetup -setdnsservers Wi-Fi $DNS
echo "DNS set to $PROVIDER ($DNS) successfully."
