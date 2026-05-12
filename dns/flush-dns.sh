#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Flush DNS
# @raycast.mode compact
# @raycast.needsConfirmation false

# Optional parameters:
# @raycast.icon 🧹
# @raycast.packageName Util

# Documentation:
# @raycast.description Flushes macOS DNS cache
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

echo "DNS cache flushed."
