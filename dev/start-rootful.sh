#!/bin/bash
# Start CloudCLI Gateway with Rootful Podman
# This script implements the REVIEW.md recommended architecture

set -e

echo "Starting CloudCLI Gateway (Rootful Podman)..."

# Stop and remove existing containers
podman stop cloudcli-gateway 2>/dev/null || true
podman rm cloudcli-gateway 2>/dev/null || true

# Ensure data directory exists with absolute path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SCRIPT_DIR/data/gateway"

# Create shared worker network if it doesn't exist
if ! podman network exists cloudcli-workers 2>/dev/null; then
  echo "Creating shared worker network..."
  podman network create cloudcli-workers
fi

# Generate secrets if not set (for production, set these externally!)
if [ -z "$JWT_SECRET" ]; then
  export JWT_SECRET=$(openssl rand -hex 32)
  echo "Generated JWT_SECRET (SAVE THIS!): $JWT_SECRET"
fi

if [ -z "$ENCRYPTION_MASTER_KEY" ]; then
  export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
  echo "Generated ENCRYPTION_MASTER_KEY (SAVE THIS!): $ENCRYPTION_MASTER_KEY"
fi

# Build images if they don't exist
if ! podman image exists localhost/cloudcliai/gateway:latest 2>/dev/null; then
  echo "Building gateway image..."
  podman build -t localhost/cloudcliai/gateway:latest .
fi

if ! podman image exists localhost/cloudcliai/worker:latest 2>/dev/null; then
  echo "Building worker image..."
  podman build -t localhost/cloudcliai/worker:latest -f docker/worker/Dockerfile .
fi

# Start gateway container on shared network
podman run -d \
  --name cloudcli-gateway \
  --network cloudcli-workers \
  --restart unless-stopped \
  -p 3001:3001 \
  -v $XDG_RUNTIME_DIR/podman/podman.sock:/var/run/docker.sock \
  -v "$SCRIPT_DIR/data/gateway":/data:Z \
  -e MULTI_USER_MODE=true \
  -e CONTAINER_BASE_IMAGE=localhost/cloudcliai/worker:latest \
  -e CONTAINER_PORT_START=4001 \
  -e CONTAINER_PORT_END=5000 \
  -e CONTAINER_MEMORY_LIMIT=2g \
  -e CONTAINER_CPU_LIMIT=1.0 \
  -e WORKER_NETWORK=cloudcli-workers \
  -e SERVER_PORT=3001 \
  -e HOST=0.0.0.0 \
  -e DATABASE_PATH=/data/auth.db \
  -e JWT_SECRET="$JWT_SECRET" \
  -e ENCRYPTION_MASTER_KEY="$ENCRYPTION_MASTER_KEY" \
  --security-opt label=disable \
  localhost/cloudcliai/gateway:latest

echo ""
echo "✅ CloudCLI Gateway started!"
echo ""
echo "🌐 Web Interface: http://localhost:3001"
echo "🔧 Network: cloudcli-workers (shared)"
echo "🐳 Runtime: Rootful Podman"
echo ""
echo "⚠️  IMPORTANT: Save these secrets!"
echo "   JWT_SECRET=$JWT_SECRET"
echo "   ENCRYPTION_MASTER_KEY=$ENCRYPTION_MASTER_KEY"
echo ""
echo "📊 Check status:"
echo "   podman ps | grep cloudcli"
echo "   podman network inspect cloudcli-workers"
echo ""
echo "📋 View logs:"
echo "   podman logs -f cloudcli-gateway"
echo ""
echo "🛑 Stop:"
echo "   podman stop cloudcli-gateway"
