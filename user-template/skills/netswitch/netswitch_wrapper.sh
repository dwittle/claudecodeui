#!/usr/bin/env bash
# Simplified wrapper for netswitch skill
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source credentials if available
if [ -f "$HOME/.netswitch_credentials" ]; then
    source "$HOME/.netswitch_credentials"
fi

# Execute with unbuffered output
"$SCRIPT_DIR/.venv/bin/python3" -u "$SCRIPT_DIR/netswitch_cli.py" "$@"
