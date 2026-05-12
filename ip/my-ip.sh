#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title What is my IP
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 📶
# @raycast.packageName Utils

# Documentation:
# @raycast.description Gets public IP and shows proxy if used
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

# Usage: my-ip.sh

RETRY_COUNT=0
MAX_RETRIES=5
BACKOFF_DELAY=1
MAX_BACKOFF_DELAY=8

# Check for proxy settings
HTTP_PROXY=${http_proxy:-${HTTP_PROXY:-""}}
HTTPS_PROXY=${https_proxy:-${HTTPS_PROXY:-""}}
ALL_PROXY=${all_proxy:-${ALL_PROXY:-""}}

# Use the first available proxy
PROXY=""
if [ -n "$HTTPS_PROXY" ]; then
  PROXY="$HTTPS_PROXY"
elif [ -n "$HTTP_PROXY" ]; then
  PROXY="$HTTP_PROXY"
elif [ -n "$ALL_PROXY" ]; then
  PROXY="$ALL_PROXY"
fi

# Print proxy information
if [ -n "$PROXY" ]; then
  echo "Detected proxy: $PROXY"
  echo "Attempting to connect through proxy..."
fi

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if [ -n "$PROXY" ]; then
    # Try with proxy first
    OUTPUT=$(curl -s --connect-timeout 5 --proxy "$PROXY" https://api.myip.com)
    
    # If proxy fails, try direct connection
    if [ -z "$OUTPUT" ] || ! echo "$OUTPUT" | grep -q '"ip":'; then
      echo "Proxy connection failed, trying direct connection..."
      OUTPUT=$(curl -s --connect-timeout 5 https://api.myip.com)
      PROXY_FAILED=true
    else
      PROXY_FAILED=false
    fi
  else
    OUTPUT=$(curl -s --connect-timeout 5 https://api.myip.com)
  fi
  
  IP_ADDRESS=$(echo "$OUTPUT" | grep -o '"ip":"[^"]*' | cut -d'"' -f4)
  COUNTRY=$(echo "$OUTPUT" | grep -o '"country":"[^"]*' | cut -d'"' -f4)
  CC=$(echo "$OUTPUT" | grep -o '"cc":"[^"]*' | cut -d'"' -f4)
  
  if [ -n "$IP_ADDRESS" ]; then
    echo "Your IP address is: $IP_ADDRESS ($COUNTRY, $CC)"
    if [ -n "$PROXY" ]; then
      if [ "$PROXY_FAILED" = true ]; then
        echo "Proxy failed, using direct connection"
      else
        echo "Using proxy: $PROXY"
      fi
    fi
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep $BACKOFF_DELAY
    BACKOFF_DELAY=$((BACKOFF_DELAY * 2))
    if [ $BACKOFF_DELAY -gt $MAX_BACKOFF_DELAY ]; then
      BACKOFF_DELAY=$MAX_BACKOFF_DELAY
    fi
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "Failed to retrieve IP address after $MAX_RETRIES retries"
    else
      echo "Retry $RETRY_COUNT failed, waiting $BACKOFF_DELAY seconds before next retry"
    fi
  fi
done
