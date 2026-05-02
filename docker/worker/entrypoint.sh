#!/bin/bash
set -e

# Preserve user's settings.json if it exists before Claude Code SDK initializes
# This ensures template settings aren't overwritten on first run

SETTINGS_FILE="/home/agent/.claude/settings.json"
BACKUP_DIR="/home/agent/.claude-config-backup"
BACKUP_FILE="$BACKUP_DIR/settings.json"

# If settings.json exists but backup doesn't, create backup
if [ -f "$SETTINGS_FILE" ] && [ ! -f "$BACKUP_FILE" ]; then
    echo "[Entrypoint] Backing up existing settings.json"
    mkdir -p "$BACKUP_DIR"
    cp "$SETTINGS_FILE" "$BACKUP_FILE"
fi

# If backup exists but settings.json doesn't, restore it
if [ -f "$BACKUP_FILE" ] && [ ! -f "$SETTINGS_FILE" ]; then
    echo "[Entrypoint] Restoring settings.json from backup"
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    cp "$BACKUP_FILE" "$SETTINGS_FILE"
fi

# Start the CloudCLI server
cd /opt/cloudcli
exec npx tsx --tsconfig server/tsconfig.json server/index.js
