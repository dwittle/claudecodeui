#!/usr/bin/env bash
# Simplified wrapper for netswitch skill
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Execute with unbuffered output
"$SCRIPT_DIR/.venv/bin/python3" -u "$SCRIPT_DIR/netswitch_cli.py" "$@"
