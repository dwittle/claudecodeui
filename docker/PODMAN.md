# Using CloudCLI with Podman

CloudCLI supports Podman as an alternative to Docker. Podman provides a daemonless, rootless container runtime that's compatible with Docker's API.

## Quick Start

### 1. Install Podman

```bash
# Fedora/RHEL/CentOS
sudo dnf install podman podman-compose

# Ubuntu/Debian
sudo apt-get install podman podman-compose

# macOS
brew install podman podman-compose
```

### 2. Enable Podman Socket (Rootless Mode)

```bash
systemctl --user enable --now podman.socket
```

### 3. Deploy CloudCLI

```bash
# Use the Podman-specific compose file
podman-compose -f ../podman-compose.yml up -d
```

## Configuration

CloudCLI automatically detects whether you're using Docker or Podman. No configuration changes are required in most cases.

### Environment Variables

```bash
# Force Podman (optional, auto-detected by default)
CONTAINER_RUNTIME=podman

# Custom socket path (optional, auto-detected)
PODMAN_SOCKET_PATH=/run/user/1000/podman/podman.sock
```

## Rootless vs Rootful

### Rootless Podman (Recommended)

**Advantages:**
- Enhanced security (no root access required)
- User-specific containers
- Safer for development

**Setup:**
```bash
# Enable user socket
systemctl --user enable --now podman.socket

# Verify
systemctl --user status podman.socket

# Run CloudCLI
podman-compose -f ../podman-compose.yml up -d
```

### Rootful Podman

**Advantages:**
- Full Docker compatibility
- Access to privileged ports

**Setup:**
```bash
# Enable system socket
sudo systemctl enable --now podman.socket

# Run CloudCLI with sudo
sudo podman-compose -f ../podman-compose.yml up -d
```

## Differences from Docker

| Feature | Docker | Podman |
|---------|--------|--------|
| Daemon | Required | Daemonless |
| Root Access | Typically required | Optional (rootless mode) |
| Socket Location | `/var/run/docker.sock` | `/run/podman/podman.sock` or `/run/user/$UID/podman/podman.sock` |
| Compose Tool | `docker-compose` | `podman-compose` |
| API Compatibility | Native | Docker-compatible |

## Building Worker Images

Worker images work the same with both Docker and Podman:

```bash
# Build with Podman
podman build -t cloudcliai/worker:latest -f worker/Dockerfile .

# Or use buildah (Podman's build tool)
buildah build-using-dockerfile -t cloudcliai/worker:latest -f worker/Dockerfile .
```

## Troubleshooting

### Socket Not Found

If you get "socket not found" errors:

1. Enable the socket:
   ```bash
   systemctl --user enable --now podman.socket
   ```

2. Check socket path:
   ```bash
   podman info --format '{{.Host.RemoteSocket.Path}}'
   ```

3. Set explicitly in `.env`:
   ```bash
   PODMAN_SOCKET_PATH=/run/user/1000/podman/podman.sock
   ```

### Permission Denied

For rootless Podman:
```bash
# Ensure you're not using sudo
podman-compose -f ../podman-compose.yml up -d
```

For rootful Podman:
```bash
# Use sudo
sudo podman-compose -f ../podman-compose.yml up -d
```

### SELinux Issues

If you encounter SELinux-related errors:

1. Add `:Z` suffix to volume mounts in `podman-compose.yml`
2. Or temporarily set to permissive:
   ```bash
   sudo setenforce 0
   ```

## Full Documentation

For comprehensive documentation including migration guides, performance comparisons, and advanced configurations, see:

- [Podman Support Guide](../docs/PODMAN_SUPPORT.md)
- [Multi-User Architecture](../MULTI_USER_ARCHITECTURE.md)

## Additional Resources

- [Podman Documentation](https://docs.podman.io/)
- [Migrating from Docker to Podman](https://docs.podman.io/en/latest/Tutorials/Migration.html)
- [Rootless Containers](https://rootlesscontaine.rs/)
