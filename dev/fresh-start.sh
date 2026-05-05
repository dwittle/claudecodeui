#!/bin/bash
# Complete fresh start - clear everything

set -e

echo "Stopping gateway..."
podman stop cloudcli-gateway 2>/dev/null || true
podman rm cloudcli-gateway 2>/dev/null || true

echo "Removing worker containers..."
podman rm -f $(podman ps -a | grep cloudcli-user | awk '{print $1}') 2>/dev/null || true

echo "Removing volumes..."
podman volume rm $(podman volume ls | grep cloudcli-data | awk '{print $2}') 2>/dev/null || true

echo "Clearing database..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rm -rf "$SCRIPT_DIR/data/gateway"
mkdir -p "$SCRIPT_DIR/data/gateway"

echo "Starting fresh gateway..."
bash "$SCRIPT_DIR/start-rootful.sh"
