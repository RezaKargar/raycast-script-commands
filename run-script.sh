#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Run Script
# @raycast.mode compact

# Optional parameters:
# @raycast.icon ⚡
# @raycast.argument1 { "type": "text", "placeholder": "script name" }
# @raycast.packageName Util

# Documentation:
# @raycast.description Runs some predefined scripts
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

script_name="$1"

case "$script_name" in
  "mfa.sh" | "mfa")
    sudo /bin/bash ~/scripts/mfa.sh
    ;;
  "mfa d")
    sudo /bin/bash ~/scripts/mfa.sh d
    ;;
  *)
    if [[ "$script_name" == *"sudo"* ]]; then
      sudo /bin/bash "$script_name"
    else
      /bin/bash "$script_name"
    fi
    ;;
esac