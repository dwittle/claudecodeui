#!/bin/bash
set -e

# Worker Container Entrypoint
# Starts CloudCLI server with configuration from environment variables

# Default values
SERVER_PORT=${SERVER_PORT:-4001}
HOST=${HOST:-0.0.0.0}
USER_ID=${USER_ID:-unknown}
AGENT_TYPE=${AGENT_TYPE:-claude-code}

echo "========================================="
echo "  CloudCLI Worker Container"
echo "========================================="
echo "User ID:    $USER_ID"
echo "Agent Type: $AGENT_TYPE"
echo "Port:       $SERVER_PORT"
echo "Host:       $HOST"
echo "========================================="
echo ""

# Create required directories
mkdir -p /home/agent/.claude/projects
mkdir -p /home/agent/.cursor/chats
mkdir -p /home/agent/.codex/sessions
mkdir -p /home/agent/.gemini/projects

# Set permissions
chmod -R 755 /home/agent/.claude /home/agent/.cursor /home/agent/.codex /home/agent/.gemini 2>/dev/null || true

# Start CloudCLI server
echo "Starting CloudCLI server on port $SERVER_PORT..."
exec cloudcli start --port "$SERVER_PORT" --host "$HOST"
