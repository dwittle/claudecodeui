# CloudCLI Multi-User Deployment on RHEL8

This guide covers deploying CloudCLI in multi-user mode on Red Hat Enterprise Linux 8 (RHEL8) using pre-built container images from GitLab Container Registry.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Option A: Deploy from GitLab Registry (Recommended)](#option-a-deploy-from-gitlab-registry-recommended)
- [Option B: Build from Source](#option-b-build-from-source)
- [Configuration](#configuration)
- [Verification](#verification)
- [Production Hardening](#production-hardening)
- [Troubleshooting](#troubleshooting)

## Overview

CloudCLI multi-user mode provides:
- **Isolated user environments**: Each user gets their own container
- **Secure credential management**: AES-256-GCM encrypted credentials
- **Automatic container orchestration**: Containers created on first login
- **Resource isolation**: Per-user memory and CPU limits
- **Network isolation**: Each user on separate bridge network
- **Podman native**: Optimized for RHEL8 with rootless support

## Prerequisites

### System Requirements

**Minimum (1-5 users):**
- 16GB RAM
- 4 CPU cores
- 100GB disk space
- RHEL8 or compatible (Rocky Linux, AlmaLinux)

**Recommended (10-20 users):**
- 32GB RAM
- 8 CPU cores
- 250GB disk space

**Large deployment (30-50 users):**
- 64GB RAM
- 16 CPU cores
- 500GB disk space

### Software Requirements

```bash
# Install Podman and tools
sudo dnf install -y podman podman-compose curl openssl

# Verify installation
podman --version
podman-compose --version
```

### Network Configuration

The default configuration uses:
- **Gateway port**: 3001 (user-facing)
- **Worker ports**: 4001-5000 (internal, 1000 users max)

If you need to access the gateway from external machines:

```bash
# Allow gateway port through firewall
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload

# Optional: Allow worker ports if needed for direct access
sudo firewall-cmd --permanent --add-port=4001-5000/tcp
sudo firewall-cmd --reload
```

### Rootless Podman Setup (Recommended)

For better security, run Podman in rootless mode:

```bash
# Enable Podman socket for your user
systemctl --user enable --now podman.socket

# Verify socket is running
systemctl --user status podman.socket

# Set environment variable
echo "export PODMAN_SOCKET=\$XDG_RUNTIME_DIR/podman/podman.sock" >> ~/.bashrc
source ~/.bashrc
```

### Port Configuration (Optional)

If you want to use ports below 1024 with rootless Podman:

```bash
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=0
# Make permanent:
echo "net.ipv4.ip_unprivileged_port_start=0" | sudo tee /etc/sysctl.d/99-unprivileged-ports.conf
```

## Option A: Deploy from GitLab Registry (Recommended)

This is the fastest way to deploy - just pull pre-built images and run!

### Step 1: Authenticate with GitLab Container Registry

```bash
# Login to GitLab Container Registry
podman login registry.gitlab.com

# Enter your GitLab username and a Personal Access Token with read_registry scope
# Create a token at: https://gitlab.com/-/profile/personal_access_tokens
```

### Step 2: Download Deployment Files

```bash
# Create deployment directory
mkdir -p ~/cloudcli-deployment
cd ~/cloudcli-deployment

# Download docker-compose file
curl -O https://raw.githubusercontent.com/siteboon/claudecodeui/main/docker-compose.gitlab.yml

# Or if using GitLab:
curl -O https://gitlab.com/your-username/cloudcli/-/raw/main/docker-compose.gitlab.yml
```

### Step 3: Create Environment Configuration

```bash
# Generate encryption key
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Create .env file
cat > .env <<EOF
# Multi-User Mode Configuration
MULTI_USER_MODE=true

# Security - CRITICAL!
ENCRYPTION_MASTER_KEY=${ENCRYPTION_KEY}

# Server Configuration
SERVER_PORT=3001
HOST=0.0.0.0

# Container Runtime
CONTAINER_RUNTIME=auto
ENABLE_PODMAN_SOCKET=true

# For rootless Podman, set the socket path
DOCKER_HOST=unix://\${XDG_RUNTIME_DIR}/podman/podman.sock

# Worker Container Configuration
CONTAINER_BASE_IMAGE=registry.gitlab.com/cloudcli/cloudcli/worker:latest
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000
CONTAINER_MEMORY_LIMIT=2g
CONTAINER_CPU_LIMIT=1.0
CONTAINER_STOP_ON_LOGOUT=false
EOF

# IMPORTANT: Keep this .env file secure and backed up!
# The ENCRYPTION_MASTER_KEY cannot be changed without re-encrypting all credentials
chmod 600 .env
```

### Step 4: Update docker-compose.gitlab.yml

Edit `docker-compose.gitlab.yml` and update the image paths:

```yaml
services:
  gateway:
    # Change this to your GitLab project path:
    image: registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/gateway:latest

    environment:
      # Update this as well:
      - CONTAINER_BASE_IMAGE=registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/worker:latest
```

### Step 5: Configure Volume Mounts for Podman

For **rootless Podman**, edit `docker-compose.gitlab.yml` and uncomment the appropriate socket mount:

```yaml
volumes:
  # Rootless Podman (recommended):
  - ${XDG_RUNTIME_DIR}/podman/podman.sock:/var/run/docker.sock:rw

  # OR for rootful Podman:
  # - /run/podman/podman.sock:/var/run/docker.sock:rw
```

### Step 6: Deploy

```bash
# Create data directory
mkdir -p data/gateway

# Pull images
podman-compose -f docker-compose.gitlab.yml pull

# Start the gateway
podman-compose -f docker-compose.gitlab.yml up -d

# Check logs
podman logs -f cloudcli-gateway
```

### Step 7: Verify Deployment

```bash
# Check container is running
podman ps

# Test health endpoint
curl http://localhost:3001/health

# Expected output:
# {"status":"ok","runtime":"podman","version":"..."}
```

### Step 8: Access the Application

Open your browser to:
```
http://<your-server-ip>:3001
```

Create your first user account. The gateway will automatically create a worker container for the user on first login.

## Option B: Build from Source

If you need to customize the code or are developing features:

### Step 1: Clone Repository

```bash
git clone https://github.com/siteboon/claudecodeui.git
cd claudecodeui
```

### Step 2: Build Images

```bash
# Build gateway image
podman build -t cloudcli/gateway:latest -f Dockerfile .

# Build worker image
podman build -t cloudcli/worker:latest -f docker/worker/Dockerfile .

# Verify images
podman images | grep cloudcli
```

### Step 3: Create Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env and set required variables:
# - MULTI_USER_MODE=true
# - ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
# - CONTAINER_RUNTIME=auto
```

### Step 4: Deploy with Podman Compose

```bash
# Using docker-compose.yml (update image names first)
podman-compose up -d gateway

# Or using podman-compose.yml if available
podman-compose -f podman-compose.yml up -d gateway
```

## Configuration

### Environment Variables

Key variables in `.env`:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MULTI_USER_MODE` | Enable multi-user container mode | `true` | Yes |
| `ENCRYPTION_MASTER_KEY` | Master key for credential encryption | - | **Yes** |
| `CONTAINER_RUNTIME` | Runtime selection (`auto`, `docker`, `podman`) | `auto` | No |
| `SERVER_PORT` | Gateway HTTP port | `3001` | No |
| `CONTAINER_BASE_IMAGE` | Worker container image | - | **Yes** |
| `CONTAINER_PORT_START` | Start of port range for workers | `4001` | No |
| `CONTAINER_PORT_END` | End of port range for workers | `5000` | No |
| `CONTAINER_MEMORY_LIMIT` | Memory limit per container | `2g` | No |
| `CONTAINER_CPU_LIMIT` | CPU limit per container | `1.0` | No |
| `DOCKER_HOST` | Container runtime socket | auto-detected | No |
| `ENABLE_PODMAN_SOCKET` | Auto-enable Podman socket | `true` | No |

### Resource Limits

Adjust per-container resources in `.env`:

```bash
# For smaller deployments (many light users):
CONTAINER_MEMORY_LIMIT=1g
CONTAINER_CPU_LIMIT=0.5

# For power users with large projects:
CONTAINER_MEMORY_LIMIT=4g
CONTAINER_CPU_LIMIT=2.0
```

### Port Range

The port range determines maximum concurrent users:

```bash
# Default: 4001-5000 = 1000 users
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000

# Expanded: 4001-6000 = 2000 users
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=6000
```

## Verification

### Check Gateway Status

```bash
# Container running?
podman ps | grep cloudcli-gateway

# Check logs
podman logs cloudcli-gateway

# Health check
curl http://localhost:3001/health
```

### Test User Registration

```bash
# Register a test user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"SecurePass123!"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"SecurePass123!"}'
```

### Check Container Creation

After a user logs in, verify their container was created:

```bash
# List all containers (including user containers)
podman ps -a | grep cloudcli

# Check networks
podman network ls | grep cloudcli

# Check volumes
podman volume ls | grep cloudcli
```

### Monitor Resources

```bash
# Resource usage of all containers
podman stats

# Gateway specific
podman stats cloudcli-gateway

# User container specific
podman stats cloudcli-user-testuser
```

## Production Hardening

### 1. Systemd Service (Auto-start on Boot)

```bash
# Generate systemd service file
cd ~/cloudcli-deployment
podman generate systemd --new --files --name cloudcli-gateway

# Install service
sudo cp container-cloudcli-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable container-cloudcli-gateway
sudo systemctl start container-cloudcli-gateway

# Check status
sudo systemctl status container-cloudcli-gateway
```

### 2. Reverse Proxy with HTTPS

Use Nginx or Traefik to provide HTTPS:

**Nginx Example:**

```nginx
upstream cloudcli {
    server localhost:3001;
}

server {
    listen 443 ssl http2;
    server_name cloudcli.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://cloudcli;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_read_timeout 86400;
    }
}

server {
    listen 80;
    server_name cloudcli.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 3. Database Backups

```bash
# Backup script
cat > ~/backup-cloudcli.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backup/cloudcli"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)

# Stop gateway briefly for consistent backup
podman stop cloudcli-gateway

# Backup database
cp ~/cloudcli-deployment/data/gateway/auth.db "$BACKUP_DIR/auth-${DATE}.db"

# Restart gateway
podman start cloudcli-gateway

# Keep last 30 days
find "$BACKUP_DIR" -name "auth-*.db" -mtime +30 -delete

echo "Backup completed: auth-${DATE}.db"
EOF

chmod +x ~/backup-cloudcli.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/youruser/backup-cloudcli.sh
```

### 4. Security Best Practices

```bash
# Restrict gateway access to specific IPs (firewall)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="3001" protocol="tcp" accept'
sudo firewall-cmd --reload

# Enable SELinux (should be enabled by default on RHEL8)
getenforce  # Should show "Enforcing"

# Monitor logs for suspicious activity
sudo journalctl -u container-cloudcli-gateway -f
```

### 5. Log Rotation

```bash
# Podman uses journald by default, but for log rotation:
sudo vi /etc/logrotate.d/cloudcli

# Add:
/var/log/cloudcli/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    missingok
    postrotate
        podman kill -s USR1 cloudcli-gateway
    endscript
}
```

### 6. Resource Monitoring

```bash
# Install monitoring tools
sudo dnf install -y htop iotop

# Monitor in real-time
htop
podman stats

# Set up alerts (optional)
# Consider Prometheus + Grafana for production
```

## Troubleshooting

### Gateway Won't Start

```bash
# Check logs
podman logs cloudcli-gateway

# Common issues:
# 1. Missing ENCRYPTION_MASTER_KEY
grep ENCRYPTION_MASTER_KEY .env

# 2. Port already in use
sudo ss -tulpn | grep 3001

# 3. Podman socket not available
systemctl --user status podman.socket
```

### Container Creation Fails

```bash
# Check runtime detection
podman logs cloudcli-gateway | grep runtime

# Test Podman socket
podman --remote info

# Check permissions
ls -l $XDG_RUNTIME_DIR/podman/podman.sock

# SELinux issues
sudo ausearch -m avc -ts recent
```

### Network Connectivity Issues

```bash
# Check gateway network
podman network inspect cloudcli-gateway

# Check user container network
podman network inspect cloudcli-net-<username>

# Test connectivity from gateway to worker
podman exec cloudcli-gateway curl http://<worker-ip>:4001/health
```

### SELinux Denials

```bash
# Check for denials
sudo ausearch -m avc -ts recent | grep cloudcli

# If you see denials related to container management:
sudo setsebool -P container_manage_cgroup true

# Verify volumes have correct labels
podman volume inspect cloudcli-data-<username>
# Should show "Label": "system_u:object_r:container_file_t:s0"
```

### Performance Issues

```bash
# Check system resources
free -h
df -h
top

# Check container stats
podman stats

# Increase limits if needed
vi .env
# Increase CONTAINER_MEMORY_LIMIT and/or CONTAINER_CPU_LIMIT

# Restart gateway to apply changes
podman restart cloudcli-gateway
```

### Database Corruption

```bash
# Stop gateway
podman stop cloudcli-gateway

# Check database integrity
sqlite3 data/gateway/auth.db "PRAGMA integrity_check;"

# If corrupt, restore from backup
cp /backup/cloudcli/auth-YYYYMMDD_HHMMSS.db data/gateway/auth.db

# Restart gateway
podman start cloudcli-gateway
```

### Worker Container Won't Start

```bash
# Check image availability
podman images | grep worker

# Try pulling manually
podman pull registry.gitlab.com/cloudcli/cloudcli/worker:latest

# Check worker logs
podman logs cloudcli-user-<username>

# Recreate container via UI:
# Settings → Container Management → Restart Container
```

### Can't Login to GitLab Registry

```bash
# Verify credentials
podman login registry.gitlab.com --get-login

# Re-login with verbose output
podman login registry.gitlab.com --log-level=debug

# Check token permissions at:
# https://gitlab.com/-/profile/personal_access_tokens
# Required scope: read_registry
```

## Additional Resources

- **Architecture Overview**: See `MULTI_USER_ARCHITECTURE.md`
- **General Deployment Guide**: See `docs/MULTI_USER_DEPLOYMENT.md`
- **Podman Specifics**: See `docs/PODMAN_SUPPORT.md`
- **Main README**: See `README.md`

## Support

For issues and questions:
- GitHub Issues: https://github.com/siteboon/claudecodeui/issues
- Documentation: https://github.com/siteboon/claudecodeui/tree/main/docs

## License

See LICENSE file in the repository.
