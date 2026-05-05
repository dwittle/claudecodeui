#!/bin/bash
set -e

echo "Stopping gateway..."
podman stop cloudcli-gateway 2>/dev/null || true
podman rm cloudcli-gateway 2>/dev/null || true

echo "Removing old gateway image..."
podman rmi localhost/cloudcliai/gateway:latest 2>/dev/null || true

echo "Rebuilding gateway with current code..."
podman build -t localhost/cloudcliai/gateway:latest .

echo "Starting gateway..."
source .env.production
bash start-rootful.sh
