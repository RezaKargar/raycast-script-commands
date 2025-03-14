#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Get Process by Port
# @raycast.mode compact
# @raycast.packageName Utils
# @raycast.argument1 { "type": "text", "placeholder": "Port number" }

# Optional parameters:
# @raycast.icon 🔍
# @raycast.description Shows the process name and PID using the specified port

# Documentation:
# @raycast.author Reza Kargar
# @raycast.authorURL https://rezakargar.ir

if [ -z "$1" ]; then
    echo "Error: Please provide a port number"
    exit 1
fi

# Check if the port is a valid number
if ! [[ "$1" =~ ^[0-9]+$ ]]; then
    echo "Error: Please provide a valid port number"
    exit 1
fi

# Get process information using lsof
process_info=$(lsof -i :$1 -sTCP:LISTEN | grep LISTEN)

if [ -z "$process_info" ]; then
    echo "No process is using port $1"
    exit 0
fi

# Extract PID and process name
pid=$(echo "$process_info" | awk '{print $2}')
process_name=$(echo "$process_info" | awk '{print $1}')

echo "PID: $pid | Port: $1 | Process: $process_name"