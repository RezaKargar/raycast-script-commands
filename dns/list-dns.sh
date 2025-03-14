#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title List DNS
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🔍
# @raycast.packageName Util

# Documentation:
# @raycast.description Lists DNS providers if any has set
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

# Define known DNS providers
KNOWN_DNS=(
  "Shecan:178.22.122.100 185.51.200.2"
  "Begzar:185.55.226.26 185.55.225.25"
  "Bogzar:185.55.226.26 185.55.225.25"
  "403.online:10.202.10.202 10.202.10.102"
  "Yandex:77.88.8.8 77.88.8.1"
  "Shelter:185.228.168.168 185.228.169.168"
  "Electro:78.157.42.100 78.157.42.101"
  "Verisign:64.6.64.6 64.6.65.6"
  "Google:8.8.8.8 8.8.4.4"
  "Cloudflare:1.1.1.1 1.0.0.1"
)

# Get current DNS servers
CURRENT_DNS=$(networksetup -getdnsservers Wi-Fi 2>/dev/null | tr '\n' ' ' | sed 's/ $//')

# Function to check DNS match
check_dns_match() {
  local provider_info=$1
  local provider_name=$(echo "$provider_info" | cut -d':' -f1)
  local provider_dns=$(echo "$provider_info" | cut -d':' -f2)

  if [[ "$CURRENT_DNS" == "$provider_dns" ]]; then
    echo "$provider_name"
    return 0
  fi
  return 1
}

# Check for matching DNS provider
FOUND_PROVIDER=""
for entry in "${KNOWN_DNS[@]}"; do
  result=$(check_dns_match "$entry")
  if [[ -n "$result" ]]; then
    FOUND_PROVIDER="$result"
    break
  fi
done

# Display result
if [[ "$CURRENT_DNS" == "There aren't any DNS Servers set on Wi-Fi." || -z "$CURRENT_DNS" ]]; then
  echo "🔎 No DNS provider is currently set."
elif [[ -n "$FOUND_PROVIDER" ]]; then
  echo "🌐 $FOUND_PROVIDER is set as DNS provider"
else
  echo "🔍 $CURRENT_DNS is set as DNS but it's not known provider"
fi
