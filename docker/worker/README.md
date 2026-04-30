# Worker Container Image

This directory contains the Dockerfile and entrypoint script for CloudCLI worker containers used in multi-user mode.

## Overview

Each user gets their own isolated Docker container running a complete CloudCLI instance. The worker container:

- Runs CloudCLI server on a dynamically allocated port
- Has its own persistent Docker volume for user data
- Runs in an isolated Docker network
- Receives credentials securely via environment variables
- Auto-starts on container creation

## Building the Image

From the repository root:

```bash
# Build the worker image
docker build -f docker/worker/Dockerfile -t cloudcliai/worker:latest .

# Or use the tag specified in your .env
docker build -f docker/worker/Dockerfile -t cloudcliai/worker:$(cat .env | grep CONTAINER_BASE_IMAGE | cut -d'=' -f2) .
```

## Environment Variables

The worker container accepts these environment variables:

- `SERVER_PORT` - Port to run CloudCLI on (default: 4001)
- `HOST` - Host to bind to (default: 0.0.0.0)
- `USER_ID` - User ID for logging/tracking
- `AGENT_TYPE` - AI agent type: claude-code, codex, cursor, gemini
- User credentials - Injected dynamically by container manager

## Testing Locally

Test the worker container manually:

```bash
# Run a test worker
docker run -d \
  --name test-worker \
  -e SERVER_PORT=4001 \
  -e USER_ID=123 \
  -e AGENT_TYPE=claude-code \
  -p 4001:4001 \
  -v test-worker-data:/home/agent \
  cloudcliai/worker:latest

# Check logs
docker logs test-worker

# Test health endpoint
curl http://localhost:4001/health

# Access the UI
open http://localhost:4001

# Clean up
docker stop test-worker
docker rm test-worker
docker volume rm test-worker-data
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Gateway Container (port 3001)              │
│  - Authentication                           │
│  - Container orchestration                  │
│  - Reverse proxy to workers                 │
└────────────┬────────────────────────────────┘
             │
             ├─> Worker 1 (user ID: 1, port 4001)
             ├─> Worker 2 (user ID: 2, port 4002)
             └─> Worker N (user ID: N, port 400N)
```

## Files

- `Dockerfile` - Multi-stage build for worker image
- `entrypoint.sh` - Container startup script
- `README.md` - This file

## Base Image

The worker extends `docker/sandbox-templates:claude-code`, which provides:

- Ubuntu-based environment
- Node.js runtime
- Common development tools
- User `agent` with proper permissions
- Sandbox security features

## Security

- Runs as non-root user (`agent`)
- Isolated network per user
- Persistent volumes for data isolation
- Credentials encrypted at rest in gateway database
- No direct external access (gateway proxies all requests)

## Production Considerations

1. **Image Registry**: Push built images to a private registry
2. **Version Tagging**: Use semantic versioning for images
3. **Resource Limits**: Configure memory/CPU limits via container manager
4. **Health Checks**: Ensure health endpoint responds within 5 seconds
5. **Logging**: Container logs are available via Docker logs API
6. **Updates**: Rebuild images to include security patches

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs <container-name>

# Inspect container
docker inspect <container-name>

# Check if port is in use
netstat -an | grep <port>
```

### Health check failing

```bash
# Test health endpoint manually
docker exec <container-name> curl -f http://localhost:${SERVER_PORT}/health

# Check CloudCLI process
docker exec <container-name> ps aux | grep cloudcli
```

### Permission issues

```bash
# Check volume permissions
docker exec <container-name> ls -la /home/agent

# Fix permissions
docker exec -u root <container-name> chown -R agent:agent /home/agent
```

## Development

To modify the worker container:

1. Edit `Dockerfile` or `entrypoint.sh`
2. Rebuild the image: `docker build -f docker/worker/Dockerfile -t cloudcliai/worker:dev .`
3. Update `.env` to use dev image: `CONTAINER_BASE_IMAGE=cloudcliai/worker:dev`
4. Restart gateway: `npm start` (with `MULTI_USER_MODE=true`)

## References

- [Docker Sandbox Templates](https://hub.docker.com/r/docker/sandbox-templates)
- [CloudCLI Documentation](../README.md)
- [Multi-User Architecture Plan](../../plans/drifting-conjuring-meteor.md)
