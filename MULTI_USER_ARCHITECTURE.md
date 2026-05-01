# Multi-User Container Architecture

CloudCLI supports a multi-user container architecture that enables team deployments, educational environments, and SaaS offerings. Each user gets their own isolated container with a complete CloudCLI environment.

**Container Runtime Support:** CloudCLI works with both **Docker** and **Podman** as container runtimes. See [Podman Support Guide](docs/PODMAN_SUPPORT.md) for details on using Podman.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Gateway Container                        │
│  - Authentication (JWT + bcrypt)                            │
│  - Container lifecycle management                           │
│  - Reverse proxy to user containers                         │
│  - Credential encryption (AES-256-GCM)                      │
│  Port: 3001                                                  │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─> Worker 1 (User 1, Port 4001)
             │   - Isolated network: cloudcli-net-user-1
             │   - Persistent volume: cloudcli-data-user-1
             │   - Agent: Claude Code/Codex/Cursor/Gemini
             │
             ├─> Worker 2 (User 2, Port 4002)
             │   - Isolated network: cloudcli-net-user-2
             │   - Persistent volume: cloudcli-data-user-2
             │   - Agent: Claude Code/Codex/Cursor/Gemini
             │
             └─> Worker N (User N, Port 400N)
                 - Isolated network: cloudcli-net-user-N
                 - Persistent volume: cloudcli-data-user-N
                 - Agent: Claude Code/Codex/Cursor/Gemini
```

## Key Features

### 🔒 Security

- **Network Isolation**: Each user gets a dedicated Docker bridge network
- **Filesystem Isolation**: Persistent volumes per user, no shared mounts
- **Credential Encryption**: AES-256-GCM with user-specific derived keys
- **Authentication**: JWT tokens with bcrypt password hashing
- **Zero Trust**: Credentials never exposed after storage
- **Audit Logging**: All credential operations tracked

### 📦 Container Management

- **Automatic Creation**: Containers created on first login
- **Dynamic Port Allocation**: Ports 4001-5000 (supports 1000 users)
- **Resource Limits**: Configurable memory (2GB) and CPU (1.0) per container
- **Health Monitoring**: Built-in health checks with auto-recovery
- **Lifecycle Control**: Start, stop, restart via UI or API

### 🔐 Credential Management

- **Secure Storage**: AES-256-GCM encryption at rest
- **Type Support**: API keys, passwords, SSH keys, certificates, tokens, env vars
- **Container Injection**: Environment variables and file-based credentials
- **Auto-restart**: Container restarts to apply credential changes
- **Audit Trail**: Complete history of credential operations

### 🌐 Proxy & Routing

- **Transparent Proxying**: Gateway routes requests to user containers
- **WebSocket Support**: Real-time communication preserved
- **Session Persistence**: Long-running connections maintained
- **Error Handling**: Graceful degradation on container unavailability

## Implementation Components

### Backend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Container Manager | `server/container/manager.js` | Docker container orchestration |
| Proxy Middleware | `server/middleware/proxy.js` | Request routing to containers |
| Encryption Service | `server/services/encryption.js` | Credential encryption |
| Container API Routes | `server/routes/containers.js` | Container management endpoints |
| Credentials API Routes | `server/routes/credentials.js` | Credential CRUD operations |
| Database Schema | `server/database/schema.js` | Tables for containers, credentials |
| Configuration | `server/container/config.js` | Container settings |

### Database Schema

#### user_containers
Tracks container state and metadata:
- `id`, `user_id`, `container_id`, `container_name`
- `internal_port`, `status`, `volume_name`, `network_name`
- `agent_type`, `created_at`, `started_at`, `stopped_at`
- `error_message`

#### user_credentials
Stores encrypted credentials:
- `id`, `user_id`, `credential_name`, `credential_type`
- `credential_value` (encrypted), `encryption_iv`, `auth_tag`
- `description`, `created_at`, `updated_at`, `is_active`

#### container_ports
Manages port allocation:
- `port`, `user_id`, `allocated_at`, `is_available`

#### credential_audit_log
Tracks credential operations:
- `id`, `user_id`, `credential_id`, `action`
- `ip_address`, `created_at`

### Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Container Status Tab | `src/components/settings/view/tabs/ContainerStatusTab.tsx` | View/control container |
| Credentials Tab | `src/components/settings/view/tabs/CredentialsManagementTab.tsx` | Manage credentials |

### Docker Configuration

| File | Purpose |
|------|---------|
| `Dockerfile` | Gateway container image |
| `docker/worker/Dockerfile` | Worker container image |
| `docker/worker/entrypoint.sh` | Worker startup script |
| `docker-compose.yml` | Development orchestration |
| `.dockerignore` | Build optimization |

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Enable multi-user mode
MULTI_USER_MODE=true

# Docker configuration
DOCKER_HOST=unix:///var/run/docker.sock
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000

# Resource limits per container
CONTAINER_MEMORY_LIMIT=2g
CONTAINER_CPU_LIMIT=1.0

# Container lifecycle
CONTAINER_STOP_ON_LOGOUT=false

# Encryption (REQUIRED!)
ENCRYPTION_MASTER_KEY=your-random-64-character-string-here
# Generate with: openssl rand -hex 32
```

## API Endpoints

### Container Management

```bash
# Get container status
GET /api/containers/status
Authorization: Bearer <token>

# Get detailed container info
GET /api/containers/info
Authorization: Bearer <token>

# Start container
POST /api/containers/start
Authorization: Bearer <token>

# Stop container
POST /api/containers/stop
Authorization: Bearer <token>

# Restart container
POST /api/containers/restart
Authorization: Bearer <token>

# Get container logs
GET /api/containers/logs?tail=100
Authorization: Bearer <token>

# Get container events
GET /api/containers/events?limit=100
Authorization: Bearer <token>
```

### Credential Management

```bash
# List credentials (names only)
GET /api/credentials
Authorization: Bearer <token>

# Get credential details
GET /api/credentials/:id
Authorization: Bearer <token>

# Add/update credential
POST /api/credentials
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "GITHUB_TOKEN",
  "type": "api_key",
  "value": "ghp_xxxxxxxxxxxx",
  "description": "GitHub API token"
}

# Delete credential
DELETE /api/credentials/:id
Authorization: Bearer <token>

# Get audit logs
GET /api/credentials/audit/logs?limit=100
Authorization: Bearer <token>
```

## Deployment

### Quick Start (Docker Compose)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env and set MULTI_USER_MODE=true and ENCRYPTION_MASTER_KEY

# 2. Build images
docker build -t cloudcliai/gateway:latest .
docker build -f docker/worker/Dockerfile -t cloudcliai/worker:latest .

# 3. Start gateway
docker-compose up -d gateway

# 4. Access
# Open http://localhost:3001
# Register a user account
# Container auto-created on login
```

### Production Deployment

See [docker/MULTI_USER_DEPLOYMENT.md](docker/MULTI_USER_DEPLOYMENT.md) for comprehensive production deployment guide including:
- Reverse proxy configuration (Nginx, Traefik)
- SSL/TLS setup
- Systemd service configuration
- Resource optimization
- Monitoring and maintenance
- Security hardening
- Backup and recovery

## User Experience

### For Users

1. **Registration & Login**
   - Create account with username/password
   - Container automatically created on first login
   - Transparent experience - no container management needed

2. **Container Management** (Settings → Container)
   - View container status (running/stopped/creating/error)
   - Start/stop/restart controls
   - View container logs
   - Monitor resource usage

3. **Credential Management** (Settings → Credentials)
   - Add API keys, passwords, SSH keys, etc.
   - Secure storage with encryption
   - Credentials automatically injected into container
   - Container restarts to apply changes

4. **Development**
   - Use CloudCLI normally (projects, git, files, chat)
   - All operations routed to personal container
   - Data persists in dedicated volume
   - Complete isolation from other users

### For Administrators

1. **Monitoring**
   ```bash
   # View all containers
   docker ps --filter "label=cloudcli.managed=true"

   # Check resource usage
   docker stats

   # View gateway logs
   docker logs cloudcli-gateway
   ```

2. **User Management**
   ```bash
   # List users
   sqlite3 data/auth.db "SELECT id, username FROM users;"

   # Check container status
   sqlite3 data/auth.db "SELECT user_id, status, internal_port FROM user_containers;"
   ```

3. **Maintenance**
   ```bash
   # Update images
   docker pull cloudcliai/gateway:latest
   docker pull cloudcliai/worker:latest

   # Restart gateway
   docker-compose restart gateway

   # Clean up stale containers
   docker container prune --filter "until=24h"
   ```

## Resource Planning

### Server Requirements

| Users | RAM | CPU | Disk | Notes |
|-------|-----|-----|------|-------|
| 1-5 | 16GB | 4 cores | 100GB | Development |
| 10-20 | 32GB | 8 cores | 250GB | Small team |
| 30-50 | 64GB | 16 cores | 500GB | Medium team |
| 100+ | 128GB+ | 32+ cores | 1TB+ | Enterprise |

*Assumes 2GB RAM + 1 CPU per active container*

### Port Allocation

Default: ports 4001-5000 (1000 users)

Adjust in `.env`:
```bash
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=10000  # Supports 6000 users
```

### Storage Planning

Per user:
- Database: ~1MB
- Container image: Shared (500MB)
- Volume data: 1-10GB (depends on projects)

Total: ~2-10GB per active user

## Security Considerations

### Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: HKDF with user-specific salt
- **Master Key**: Must be 32+ random bytes (256 bits)
- **Rotation**: Requires re-encryption of all credentials

### Network Security

- **Gateway**: Only 3001 exposed externally (via reverse proxy)
- **Workers**: Internal ports not directly accessible
- **Isolation**: Each user on separate Docker network
- **Firewall**: Recommended to restrict Docker API access

### Container Security

- **User**: Containers run as non-root user (`agent`)
- **Capabilities**: Limited Linux capabilities
- **Resources**: Hard memory/CPU limits enforced
- **Volumes**: Per-user volumes prevent cross-user access

### Best Practices

1. **HTTPS Required**: Always use TLS in production
2. **Strong Passwords**: Enforce password complexity
3. **Regular Updates**: Keep base images updated
4. **Backup Database**: Regular encrypted backups
5. **Monitor Logs**: Watch for suspicious activity
6. **Rotate Keys**: Plan for credential re-encryption
7. **Limit Exposure**: Use firewall rules
8. **Audit Regularly**: Review credential audit logs

## Troubleshooting

### Container Won't Start

```bash
# Check Docker daemon
docker info

# View container logs
docker logs cloudcli-user-<id>

# Check database status
sqlite3 data/auth.db "SELECT * FROM user_containers WHERE user_id=<id>;"

# Verify image exists
docker images | grep cloudcliai/worker
```

### Credentials Not Working

```bash
# Check if credential exists
sqlite3 data/auth.db "SELECT credential_name FROM user_credentials WHERE user_id=<id>;"

# Verify container restarted
docker ps | grep cloudcli-user-<id>

# Check environment in container
docker exec cloudcli-user-<id> env | grep <CREDENTIAL_NAME>
```

### Proxy Errors

```bash
# Check gateway is running
docker ps | grep cloudcli-gateway

# View gateway logs
docker logs cloudcli-gateway

# Test direct container access
curl http://localhost:<container-port>/health
```

## Performance Optimization

### Container Startup

- Pre-pull worker image on gateway startup
- Use Docker image caching
- Optimize base image layers
- Consider container pre-warming

### Proxy Performance

- Enable HTTP keep-alive
- Use connection pooling
- Configure appropriate timeouts
- Monitor response times

### Resource Management

- Set appropriate memory limits
- Use CPU quotas
- Implement cleanup policies
- Monitor disk usage

## Limitations

- **Single Server**: Current architecture designed for single-server deployment
- **Port Range**: Limited by port range (default: 1000 concurrent users)
- **Scaling**: Horizontal scaling requires additional architecture
- **Shared Storage**: Volumes are local to Docker host

## Future Enhancements

Potential improvements for future versions:

- **Kubernetes Support**: Multi-node orchestration
- **Load Balancing**: Distribute users across multiple gateway instances
- **Shared Storage**: NFS/Ceph for distributed volumes
- **Auto-scaling**: Dynamic resource allocation based on demand
- **Container Snapshots**: Save/restore container state
- **Usage Analytics**: Track resource consumption per user
- **Rate Limiting**: API rate limits per user
- **Custom Images**: Per-user Docker images with pre-installed tools

## Support

- **Documentation**: [docker/MULTI_USER_DEPLOYMENT.md](docker/MULTI_USER_DEPLOYMENT.md)
- **Testing**: [TESTING.md](TESTING.md)
- **Discord**: https://discord.gg/buxwujPNRE
- **GitHub Issues**: https://github.com/siteboon/claudecodeui/issues

## License

AGPL-3.0-or-later
