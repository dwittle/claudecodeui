# Local Development Guide

This guide shows you how to build and run CloudCLI containers locally on your development machine without needing GitLab Container Registry or any external services.

## Overview

This guide covers building and running CloudCLI locally using Podman or Docker. The gateway image includes a TypeScript build step to compile the server code and resolve path aliases.

## Quick Start - Build and Run Locally

```bash
# 1. Ensure you're in the project directory
cd /space/tucker28/code/claudecodeui

# 2. Create/update .env file with required settings
cat > .env <<'EOF'
# Multi-User Mode
MULTI_USER_MODE=true

# Generate encryption key
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Server configuration
SERVER_PORT=3001
HOST=0.0.0.0

# Container runtime (auto-detects Podman or Docker)
CONTAINER_RUNTIME=auto

# Worker container image (will be built locally)
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest

# Port range for user containers
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000

# Resource limits per container
CONTAINER_MEMORY_LIMIT=2g
CONTAINER_CPU_LIMIT=1.0
EOF

# Replace the generated key with actual value
sed -i "s/\$(openssl rand -hex 32)/$(openssl rand -hex 32)/" .env

# 3. Build the images
podman build -t cloudcliai/gateway:latest -f Dockerfile .
podman build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .

# 4. Start the gateway (builds will be used automatically)
podman-compose -f podman-compose.yml up -d gateway

# 5. Check it's running
podman ps
curl http://localhost:3001/health
```

## Detailed Steps

### Option A: Using Podman (Recommended for RHEL8/Linux)

```bash
# Enable Podman socket (if not already enabled)
systemctl --user enable --now podman.socket
export PODMAN_SOCKET=$XDG_RUNTIME_DIR/podman/podman.sock

# Build images
podman build -t cloudcliai/gateway:latest .
podman build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .

# Verify images
podman images | grep cloudcliai

# Start with podman-compose
podman-compose -f podman-compose.yml up -d gateway

# Or manually without compose
podman run -d \
  --name cloudcli-gateway \
  -p 3001:3001 \
  -v $PODMAN_SOCKET:/var/run/docker.sock:rw \
  -v ./data/gateway:/data:Z \
  --env-file .env \
  cloudcliai/gateway:latest
```

### Option B: Using Docker

```bash
# Build images
docker build -t cloudcliai/gateway:latest .
docker build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .

# Start with docker-compose
docker-compose up -d gateway

# Or manually
docker run -d \
  --name cloudcli-gateway \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./data/gateway:/data \
  --env-file .env \
  cloudcliai/gateway:latest
```

## Testing Your Local Deployment

```bash
# 1. Check gateway is running
podman ps | grep cloudcli-gateway

# 2. Check health endpoint
curl http://localhost:3001/health
# Expected: {"status":"ok","runtime":"podman",...}

# 3. Open in browser
# Navigate to: http://localhost:3001

# 4. Register a test user (via browser UI or curl)
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123!"}'

# 5. Login and verify worker container is created
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123!"}'

# 6. Check worker container was created
podman ps | grep cloudcli-user-testuser
```

## Viewing Logs

```bash
# Gateway logs
podman logs -f cloudcli-gateway

# Worker logs (after creating a user)
podman logs -f cloudcli-user-<username>

# All CloudCLI containers
podman ps --filter "label=cloudcli.managed=true"
```

## Rebuilding After Code Changes

```bash
# Stop containers
podman-compose -f podman-compose.yml down

# Rebuild images
podman build -t cloudcliai/gateway:latest .
podman build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .

# Start again
podman-compose -f podman-compose.yml up -d gateway

# Or force rebuild with compose
podman-compose -f podman-compose.yml up -d --build gateway
```

## Quick Development Workflow

```bash
# Make code changes
vim server/index.js

# Rebuild and restart gateway
podman build -t cloudcliai/gateway:latest .
podman restart cloudcli-gateway

# For worker changes, rebuild worker image
podman build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .
# Worker containers will use new image on next creation
# Restart existing workers via the UI or:
podman restart cloudcli-user-<username>
```

## Development with Live Reload (Alternative)

For faster development without rebuilding containers, you can mount your source code:

```bash
# Edit podman-compose.yml and uncomment the source mount:
# volumes:
#   - .:/app:Z

# Then changes to server code will be visible inside the container
# Use nodemon or similar for auto-restart on file changes
```

## Troubleshooting

### Issue: Port already in use

```bash
# Find what's using port 3001
sudo ss -tulpn | grep 3001

# Stop existing container
podman stop cloudcli-gateway
podman rm cloudcli-gateway
```

### Issue: Socket permission denied

```bash
# Check socket exists
ls -la $XDG_RUNTIME_DIR/podman/podman.sock

# Enable socket
systemctl --user enable --now podman.socket
systemctl --user status podman.socket
```

### Issue: Build fails

```bash
# Clean build (no cache)
podman build --no-cache -t cloudcliai/gateway:latest .

# Check disk space
df -h

# Remove old images
podman image prune -a
```

### Issue: Cannot create worker containers

```bash
# Check gateway logs
podman logs cloudcli-gateway

# Verify socket is mounted
podman inspect cloudcli-gateway | grep -A5 "Mounts"

# Test socket access inside gateway
podman exec cloudcli-gateway ls -la /var/run/docker.sock
```

### Issue: SELinux denials (RHEL8/Fedora)

```bash
# Check for denials
sudo ausearch -m avc -ts recent | grep cloudcli

# Verify :Z labels on volumes
# In podman-compose.yml, ensure:
# volumes:
#   - ./data/gateway:/data:Z

# Enable container management
sudo setsebool -P container_manage_cgroup true
```

## Stopping Everything

```bash
# Stop with compose
podman-compose -f podman-compose.yml down

# Or manually stop all CloudCLI containers
podman ps --filter "name=cloudcli-" -q | xargs podman stop
podman ps -a --filter "name=cloudcli-" -q | xargs podman rm

# Clean up networks and volumes (optional)
podman network prune
podman volume prune
```

## Complete Local Setup Script

Save this as `local-dev-setup.sh`:

```bash
#!/bin/bash
# CloudCLI Local Development Setup

set -e

echo "=== CloudCLI Local Development Setup ==="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env <<EOF
MULTI_USER_MODE=true
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
SERVER_PORT=3001
HOST=0.0.0.0
CONTAINER_RUNTIME=auto
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000
CONTAINER_MEMORY_LIMIT=2g
CONTAINER_CPU_LIMIT=1.0
EOF
    echo "✓ .env created"
else
    echo "✓ .env already exists"
fi

# Enable Podman socket
echo "Enabling Podman socket..."
systemctl --user enable --now podman.socket 2>/dev/null || true
export PODMAN_SOCKET=$XDG_RUNTIME_DIR/podman/podman.sock
echo "✓ Podman socket enabled"

# Build gateway image
echo "Building gateway image..."
podman build -t cloudcliai/gateway:latest -f Dockerfile .
echo "✓ Gateway image built"

# Build worker image
echo "Building worker image..."
podman build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .
echo "✓ Worker image built"

# Create data directory
mkdir -p data/gateway
echo "✓ Data directory created"

# Start gateway
echo "Starting gateway..."
podman-compose -f podman-compose.yml up -d gateway
echo "✓ Gateway started"

# Wait for gateway to be ready
echo "Waiting for gateway to be ready..."
sleep 5

# Check health
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✓ Gateway is healthy!"
    echo ""
    echo "=== Setup Complete ==="
    echo "Access CloudCLI at: http://localhost:3001"
    echo ""
    echo "Useful commands:"
    echo "  podman logs -f cloudcli-gateway    # View logs"
    echo "  podman ps                           # List containers"
    echo "  podman-compose down                 # Stop everything"
else
    echo "✗ Gateway health check failed"
    echo "Check logs with: podman logs cloudcli-gateway"
    exit 1
fi
```

Make it executable:
```bash
chmod +x local-dev-setup.sh
./local-dev-setup.sh
```

## Testing Multi-User Locally

```bash
# Create multiple test users
for i in {1..3}; do
  curl -X POST http://localhost:3001/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"user$i\",\"password\":\"Pass$i123!\"}"
  echo ""
done

# Verify each user got their own container
podman ps | grep cloudcli-user-

# Check isolation - each user has their own network and volume
podman network ls | grep cloudcli-net-
podman volume ls | grep cloudcli-data-

# Monitor resource usage
podman stats --no-stream
```

## Development Tips

### 1. Faster Builds with Layer Caching

```bash
# Order matters - put stable layers first
# package.json and package-lock.json are copied before source code
# This way npm install is cached unless dependencies change
```

### 2. Debug Mode

```bash
# Add debug environment variable
echo "DEBUG=true" >> .env

# Restart gateway
podman restart cloudcli-gateway

# Watch logs
podman logs -f cloudcli-gateway
```

### 3. Clean Slate

```bash
# Stop everything
podman-compose -f podman-compose.yml down

# Remove all CloudCLI resources
podman ps -a --filter "name=cloudcli-" -q | xargs -r podman rm -f
podman volume ls --filter "name=cloudcli-" -q | xargs -r podman volume rm
podman network ls --filter "name=cloudcli-" -q | xargs -r podman network rm

# Remove images
podman rmi cloudcliai/gateway:latest cloudcliai/worker:latest

# Remove data
rm -rf data/

# Start fresh
./local-dev-setup.sh
```

### 4. Profile Build Performance

```bash
# Time the build
time podman build -t cloudcliai/gateway:latest .

# Check build history
podman history cloudcliai/gateway:latest

# Analyze image size
podman images cloudcliai/gateway:latest
```

## Moving from Local to Production

Once you've tested locally, you can:

### Option 1: Push to GitLab Registry

```bash
# Tag for GitLab
podman tag cloudcliai/gateway:latest registry.gitlab.com/your-org/cloudcli/gateway:latest
podman tag cloudcliai/worker:latest registry.gitlab.com/your-org/cloudcli/worker:latest

# Login and push
podman login registry.gitlab.com
podman push registry.gitlab.com/your-org/cloudcli/gateway:latest
podman push registry.gitlab.com/your-org/cloudcli/worker:latest

# See DEPLOY_RHEL8.md for production deployment
```

### Option 2: Save and Transfer Images

```bash
# Export images to tar files
podman save cloudcliai/gateway:latest -o gateway.tar
podman save cloudcliai/worker:latest -o worker.tar

# Transfer to RHEL8 server
scp gateway.tar worker.tar rhel8-server:/tmp/

# On RHEL8 server, load images
podman load -i /tmp/gateway.tar
podman load -i /tmp/worker.tar

# Deploy
podman-compose -f podman-compose.yml up -d gateway
```

## Related Documentation

- **[DEPLOY_RHEL8.md](DEPLOY_RHEL8.md)** - Production deployment on RHEL8
- **[docs/DEPLOYMENT_OPTIONS.md](docs/DEPLOYMENT_OPTIONS.md)** - Compare all deployment methods
- **[MULTI_USER_ARCHITECTURE.md](MULTI_USER_ARCHITECTURE.md)** - Architecture overview
- **[docker/MULTI_USER_DEPLOYMENT.md](docker/MULTI_USER_DEPLOYMENT.md)** - General multi-user guide

## Summary

**Simplest local workflow:**

```bash
# One-time setup
cat > .env <<EOF
MULTI_USER_MODE=true
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
EOF

# Build images
podman build -t cloudcliai/gateway:latest .
podman build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .

# Run
podman-compose -f podman-compose.yml up -d gateway

# Access at http://localhost:3001
```

That's it! No GitLab, no registry, just local development. 🚀
