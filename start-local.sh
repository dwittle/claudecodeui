#!/bin/bash
# Start CloudCLI Gateway Locally with Podman
# This script starts the gateway container with proper configuration for local development

set -e

echo "Starting CloudCLI Gateway..."

# Stop and remove existing container
podman rm -f cloudcli-gateway 2>/dev/null || true

# Ensure data directory exists with correct permissions
mkdir -p ./data/gateway
podman unshare chown -R 1000:1000 ./data/gateway 2>/dev/null || true

# Start gateway container
podman run -d \
  --name cloudcli-gateway \
  --user root \
  -p 3001:3001 \
  -v $XDG_RUNTIME_DIR/podman/podman.sock:/var/run/docker.sock:rw \
  -v ./data/gateway:/data:Z \
  -e MULTI_USER_MODE=true \
  -e CONTAINER_RUNTIME=docker \
  -e DOCKER_HOST=unix:///var/run/docker.sock \
  -e CONTAINER_BASE_IMAGE=cloudcliai/worker:latest \
  -e CONTAINER_PORT_START=4001 \
  -e CONTAINER_PORT_END=5000 \
  -e CONTAINER_MEMORY_LIMIT="" \
  -e CONTAINER_CPU_LIMIT="" \
  -e SERVER_PORT=3001 \
  -e HOST=0.0.0.0 \
  -e DATABASE_PATH=/data/auth.db \
  -e ENCRYPTION_MASTER_KEY=120e93e3e17a0ee97f1437a019ddb5d893dea551c238d7b702c39ce6e299d8f5 \
  --security-opt label=disable \
  cloudcliai/gateway:latest

echo ""
echo "✅ CloudCLI Gateway started!"
echo ""
echo "🌐 Web Interface: http://localhost:3001"
echo ""
echo "📊 Check status:"
echo "   podman ps | grep cloudcli"
echo ""
echo "📋 View logs:"
echo "   podman logs -f cloudcli-gateway"
echo ""
echo "🛑 Stop:"
echo "   podman stop cloudcli-gateway"
