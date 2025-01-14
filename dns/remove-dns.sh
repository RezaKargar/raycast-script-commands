#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Remove DNS
# @raycast.mode compact

# Optional parameters:
# @raycast.icon ❌
# @raycast.packageName Util

# Documentation:
# @raycast.description Removes DNSs
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir


# Reset DNS to automatic
echo "Removing custom DNS settings (resetting to automatic)..."
networksetup -setdnsservers Wi-Fi Empty
echo "DNS reset to automatic."


