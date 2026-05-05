#!/bin/bash
# Quick restart without rebuilding

set -e

echo "Stopping gateway..."
podman stop cloudcli-gateway 2>/dev/null || true
podman rm cloudcli-gateway 2>/dev/null || true

# Remove any existing worker containers
podman rm -f cloudcli-user-1 2>/dev/null || true

echo "Starting gateway with resource limits..."
bash start-rootful.sh
