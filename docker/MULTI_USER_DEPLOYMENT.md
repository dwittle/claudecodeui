# Multi-User Deployment Guide

This guide explains how to deploy CloudCLI in multi-user mode with Docker container orchestration.

## Overview

Multi-user mode transforms CloudCLI into a team platform where each user gets their own isolated Docker container with a complete CloudCLI environment.

**Architecture:**
- **Gateway Container**: Handles auth, proxying, and container lifecycle management
- **Worker Containers**: Per-user isolated environments, created on-demand
- **Docker Orchestration**: Gateway manages workers via Docker API

## Prerequisites

- Docker Engine 20.10+ with Docker socket access
- At least 4GB RAM (2GB per active user container)
- Node.js 20+ (for local development)
- SSL/TLS certificate (production)

## Quick Start (Development)

### 1. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Enable multi-user mode
MULTI_USER_MODE=true

# Generate a secure encryption key
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Docker configuration
DOCKER_HOST=unix:///var/run/docker.sock
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
```

### 2. Build Images

```bash
# Build gateway image
docker build -t cloudcliai/gateway:latest .

# Build worker image
docker build -f docker/worker/Dockerfile -t cloudcliai/worker:latest .
```

### 3. Start with Docker Compose

```bash
# Start gateway only
docker-compose up -d gateway

# Start gateway + example worker (for testing)
docker-compose --profile testing up -d
```

### 4. Access Gateway

Open http://localhost:3001 and create your first user account. The gateway will automatically create a worker container when you log in.

## Production Deployment

### 1. Environment Setup

Generate secure keys:

```bash
# Encryption master key (CRITICAL - keep secret!)
export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Optional: API key for programmatic access
export API_KEY=$(openssl rand -hex 32)
```

Save these to a secure location:

```bash
# Using systemd environment file
cat > /etc/cloudcli/env <<EOF
ENCRYPTION_MASTER_KEY=${ENCRYPTION_MASTER_KEY}
NODE_ENV=production
MULTI_USER_MODE=true
EOF

chmod 600 /etc/cloudcli/env
```

### 2. Docker Compose (Recommended)

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  gateway:
    image: cloudcliai/gateway:latest
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - cloudcli-gateway-data:/data
    env_file:
      - /etc/cloudcli/env
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/data/auth.db
    networks:
      - cloudcli-gateway
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

networks:
  cloudcli-gateway:
    driver: bridge

volumes:
  cloudcli-gateway-data:
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Systemd Service (Alternative)

For non-Docker Compose deployments:

```ini
# /etc/systemd/system/cloudcli-gateway.service
[Unit]
Description=CloudCLI Multi-User Gateway
After=docker.service
Requires=docker.service

[Service]
Type=simple
EnvironmentFile=/etc/cloudcli/env
ExecStartPre=-/usr/bin/docker stop cloudcli-gateway
ExecStartPre=-/usr/bin/docker rm cloudcli-gateway
ExecStart=/usr/bin/docker run --rm --name cloudcli-gateway \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v cloudcli-gateway-data:/data \
  -e NODE_ENV=production \
  -e MULTI_USER_MODE=true \
  -e ENCRYPTION_MASTER_KEY=${ENCRYPTION_MASTER_KEY} \
  -e DATABASE_PATH=/data/auth.db \
  cloudcliai/gateway:latest

ExecStop=/usr/bin/docker stop cloudcli-gateway
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudcli-gateway
sudo systemctl start cloudcli-gateway
```

### 4. Reverse Proxy (HTTPS)

**Nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name cloudcli.example.com;

    ssl_certificate /etc/letsencrypt/live/cloudcli.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cloudcli.example.com/privkey.pem;

    # WebSocket support
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running requests
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

**Traefik:**

```yaml
# docker-compose.yml
services:
  gateway:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.cloudcli.rule=Host(`cloudcli.example.com`)"
      - "traefik.http.routers.cloudcli.entrypoints=websecure"
      - "traefik.http.routers.cloudcli.tls.certresolver=letsencrypt"
      - "traefik.http.services.cloudcli.loadbalancer.server.port=3001"
```

## Configuration

### Resource Limits

Edit `.env` to adjust per-container limits:

```bash
# Each worker container gets these limits
CONTAINER_MEMORY_LIMIT=2g
CONTAINER_CPU_LIMIT=1.0

# Port range determines max concurrent users
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000  # Supports 1000 users
```

### Container Lifecycle

```bash
# Stop containers when users log out (saves resources)
CONTAINER_STOP_ON_LOGOUT=true

# Auto-cleanup stopped containers after 24 hours
# (configured in server/container/config.js)
```

### Database Backup

```bash
# Backup the gateway database
docker exec cloudcli-gateway cp /data/auth.db /data/auth.db.backup
docker cp cloudcli-gateway:/data/auth.db.backup ./backup-$(date +%Y%m%d).db
```

## Monitoring

### Container Status

```bash
# List all worker containers
docker ps --filter "label=cloudcli.managed=true"

# View gateway logs
docker logs -f cloudcli-gateway

# View worker logs
docker logs cloudcli-user-<user-id>
```

### API Endpoints

```bash
# Health check
curl http://localhost:3001/health

# Container status (requires auth token)
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/containers/status
```

### Metrics

Add Prometheus monitoring:

```bash
# Install docker-exporter
docker run -d --name docker-exporter \
  -p 9323:9323 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  quay.io/prometheuscommunity/docker-exporter
```

## Maintenance

### Update Images

```bash
# Pull latest gateway
docker pull cloudcliai/gateway:latest

# Pull latest worker
docker pull cloudcliai/worker:latest

# Restart gateway
docker-compose restart gateway

# Workers will use new image on next creation
```

### Clean Up Stale Resources

```bash
# Remove unused volumes
docker volume prune

# Remove stopped containers older than 24h
docker container prune --filter "until=24h"

# Remove unused networks
docker network prune
```

### Key Rotation

**WARNING**: Rotating the encryption key makes existing credentials unreadable!

1. Backup database: `docker cp cloudcli-gateway:/data/auth.db ./backup.db`
2. Generate new key: `NEW_KEY=$(openssl rand -hex 32)`
3. Update environment: Edit `/etc/cloudcli/env`
4. Restart gateway: `docker-compose restart gateway`
5. Users must re-enter credentials

## Troubleshooting

### Gateway won't start

```bash
# Check Docker socket permissions
ls -la /var/run/docker.sock
sudo chmod 666 /var/run/docker.sock  # Or add user to docker group

# Check logs
docker logs cloudcli-gateway
```

### Worker creation fails

```bash
# Check Docker daemon
docker info

# Verify image exists
docker images | grep cloudcliai/worker

# Check port availability
netstat -tuln | grep 400[0-9]
```

### Container out of memory

```bash
# Check resource usage
docker stats

# Increase limit in .env
CONTAINER_MEMORY_LIMIT=4g

# Restart gateway for new limits
```

### Database locked

```bash
# Check for multiple gateway instances
docker ps | grep cloudcli-gateway

# Stop duplicate instances
docker stop <duplicate-container-id>
```

## Security Checklist

- [ ] HTTPS enabled with valid certificate
- [ ] Firewall rules: Only 443/80 exposed externally
- [ ] Docker socket access restricted to gateway container only
- [ ] Strong encryption master key (32+ random bytes)
- [ ] Database backups automated and encrypted
- [ ] Regular security updates for base images
- [ ] User passwords enforced (min 8 characters)
- [ ] Rate limiting configured on reverse proxy
- [ ] Docker daemon secured (no remote API without TLS)

## Scaling

### Vertical Scaling

Increase resources per server:

```bash
# More RAM for more concurrent users
# 2GB per user container + 2GB for gateway
# Example: 64GB server = ~30 concurrent users
```

### Horizontal Scaling (Future)

For 100+ users, consider:

- Kubernetes deployment with node affinity
- Shared storage (NFS/Ceph) for volumes
- Redis for session state
- Load balancer for multiple gateway instances

## Support

- Documentation: https://cloudcli.ai/docs
- Discord: https://discord.gg/buxwujPNRE
- GitHub Issues: https://github.com/siteboon/claudecodeui/issues

## License

AGPL-3.0-or-later
