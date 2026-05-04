# CloudCLI Deployment Options

This guide provides an overview of all deployment options for CloudCLI, from local development to enterprise production deployments.

## Quick Navigation

| Deployment Type | Best For | Setup Time | Complexity |
|----------------|----------|------------|------------|
| [NPM (Local)](#npm-local) | Local development, single user | 1 minute | ⭐ Simple |
| [Docker Sandbox](#docker-sandbox) | Isolated single-user environments | 5 minutes | ⭐⭐ Easy |
| [Docker/Podman Multi-User](#dockerpodman-multi-user) | Small teams, local deployment | 15 minutes | ⭐⭐⭐ Moderate |
| [RHEL8 Production](#rhel8-production) | Enterprise deployment, many users | 30 minutes | ⭐⭐⭐⭐ Advanced |
| [CloudCLI Cloud](#cloudcli-cloud) | Zero setup, managed service | 0 minutes | ⭐ Simple |

---

## NPM (Local)

**Best for:** Local development, single user, quick testing

### Installation

```bash
# Try instantly with npx
npx @cloudcli-ai/cloudcli

# Or install globally
npm install -g @cloudcli-ai/cloudcli
cloudcli
```

### Features
- ✅ Fast setup
- ✅ Works with existing Claude Code sessions
- ✅ Access via browser at `http://localhost:3001`
- ✅ Mobile access on local network
- ❌ Single user only
- ❌ No container isolation
- ❌ Machine must stay on

### Configuration

Optional `.env` file for custom settings:
```bash
SERVER_PORT=3001
HOST=0.0.0.0
CLAUDE_CLI_PATH=/custom/path/to/claude
```

**Documentation:** [README.md](../README.md)

---

## Docker Sandbox

**Best for:** Isolated development environments, experimenting safely

### Installation

```bash
# Requires Docker Sandboxes (sbx CLI)
npx @cloudcli-ai/cloudcli@latest sandbox ~/my-project
```

### Features
- ✅ Hypervisor-level isolation (microVM)
- ✅ Safe experimentation
- ✅ Web and mobile access
- ✅ Works with Claude Code, Codex, Gemini CLI
- ⚠️ Experimental
- ❌ Single user per sandbox
- ❌ Requires Docker Sandboxes CLI

**Documentation:** [docker/README.md](../docker/README.md)

---

## Docker/Podman Multi-User

**Best for:** Small teams, self-hosted multi-user environments

### Installation

**With Docker:**
```bash
git clone https://github.com/siteboon/claudecodeui.git
cd claudecodeui
cp .env.example .env
# Edit .env with required settings
docker-compose up -d
```

**With Podman:**
```bash
systemctl --user enable --now podman.socket
podman-compose -f podman-compose.yml up -d
```

### Features
- ✅ Multi-user support with isolation
- ✅ Per-user containers
- ✅ Resource limits (CPU, memory)
- ✅ Encrypted credential storage
- ✅ Works with Docker or Podman
- ✅ Rootless mode support
- ⚠️ Requires container runtime
- ⚠️ Manual setup and maintenance

### Architecture

```
┌─────────────┐
│   Gateway   │ ← Users connect here
│  (Port 3001)│
└──────┬──────┘
       │
       ├─────► Worker Container (User 1, Port 4001)
       ├─────► Worker Container (User 2, Port 4002)
       └─────► Worker Container (User 3, Port 4003)
```

### Required Configuration

Minimal `.env`:
```bash
MULTI_USER_MODE=true
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
```

**Documentation:**
- [MULTI_USER_ARCHITECTURE.md](../MULTI_USER_ARCHITECTURE.md)
- [docs/MULTI_USER_DEPLOYMENT.md](MULTI_USER_DEPLOYMENT.md)
- [docs/PODMAN_SUPPORT.md](PODMAN_SUPPORT.md)

---

## RHEL8 Production

**Best for:** Enterprise deployments, production systems, compliance requirements

### Deployment Options

#### Option A: Pre-built Images (Recommended)

```bash
# 1. Login to GitLab Container Registry
podman login registry.gitlab.com

# 2. Download compose file
curl -O https://raw.githubusercontent.com/siteboon/claudecodeui/main/docker-compose.gitlab.yml

# 3. Configure environment
cat > .env <<EOF
MULTI_USER_MODE=true
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
CONTAINER_RUNTIME=auto
CONTAINER_BASE_IMAGE=registry.gitlab.com/your-org/cloudcli/worker:latest
EOF

# 4. Deploy
podman-compose -f docker-compose.gitlab.yml up -d
```

#### Option B: Build from Source

```bash
# 1. Clone and build
git clone https://github.com/siteboon/claudecodeui.git
cd claudecodeui
podman build -t cloudcli/gateway:latest .
podman build -t cloudcli/worker:latest -f docker/worker/Dockerfile .

# 2. Deploy
podman-compose -f podman-compose.yml up -d
```

### Features
- ✅ Enterprise-grade isolation
- ✅ SELinux compatibility
- ✅ Rootless Podman support
- ✅ Systemd integration
- ✅ Firewall configuration
- ✅ Production hardening
- ✅ Scales to 50+ users
- ✅ Pre-built images from CI/CD
- ⚠️ Requires RHEL8 or compatible OS
- ⚠️ More complex setup

### System Requirements

**Small (1-5 users):**
- 16GB RAM, 4 CPU cores, 100GB disk

**Medium (10-20 users):**
- 32GB RAM, 8 CPU cores, 250GB disk

**Large (30-50 users):**
- 64GB RAM, 16 CPU cores, 500GB disk

### Security Features

- SELinux enforcing mode
- Encrypted credentials (AES-256-GCM)
- Network isolation per user
- Resource limits per container
- Firewall rules
- Rootless operation

### Production Hardening

```bash
# 1. Create systemd service
podman generate systemd --new --files --name cloudcli-gateway
sudo mv container-cloudcli-gateway.service /etc/systemd/system/
sudo systemctl enable cloudcli-gateway

# 2. Configure firewall
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload

# 3. Set up backups
# See DEPLOY_RHEL8.md for backup scripts
```

**Documentation:**
- **[DEPLOY_RHEL8.md](../DEPLOY_RHEL8.md)** ← Start here for RHEL8
- [docs/GITLAB_CI_CD.md](GITLAB_CI_CD.md)
- [docs/PODMAN_SUPPORT.md](PODMAN_SUPPORT.md)

---

## CloudCLI Cloud

**Best for:** Teams wanting zero-maintenance managed service

### Features
- ✅ Zero setup required
- ✅ Fully managed infrastructure
- ✅ Access from anywhere (web, mobile, IDE, API)
- ✅ Team collaboration
- ✅ Automatic updates
- ✅ No server maintenance
- ✅ Built-in monitoring
- 💰 Starts at $7/month

### How to Get Started

Visit **[cloudcli.ai](https://cloudcli.ai)** to create an account.

---

## Comparison Matrix

| Feature | NPM Local | Docker Sandbox | Multi-User | RHEL8 Prod | CloudCLI Cloud |
|---------|-----------|----------------|------------|------------|----------------|
| **Setup Complexity** | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| **Multi-user** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Isolation** | None | Hypervisor | Container | Container + SELinux | Full Cloud |
| **Resource Limits** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Auto-start** | ❌ | ❌ | ⚠️ (systemd) | ✅ (systemd) | ✅ |
| **Requires Server** | No | No | Yes | Yes | No |
| **Cost** | Free | Free | Free | Free | Paid |
| **Maintenance** | Self | Self | Self | Self | Managed |
| **Best For** | Dev | Testing | Small teams | Enterprise | Teams |

---

## Migration Paths

### From NPM to Multi-User

1. Clone repository
2. Build or pull container images
3. Configure `.env` with multi-user settings
4. Deploy with docker-compose
5. Import existing sessions (manual)

### From Multi-User to RHEL8 Production

1. Set up CI/CD with GitLab
2. Build and push images to registry
3. Deploy on RHEL8 from registry
4. Configure systemd and firewall
5. Set up backups and monitoring

### From Self-Hosted to CloudCLI Cloud

1. Export your projects and settings
2. Sign up for CloudCLI Cloud
3. Import projects
4. Configure team access
5. Decommission self-hosted instance

---

## Choosing the Right Deployment

### Use **NPM Local** if:
- You're a solo developer
- You want quick setup
- You don't need multi-user support
- You're okay with machine staying on

### Use **Docker Sandbox** if:
- You need isolated experimentation
- You want hypervisor-level security
- You're testing potentially unsafe code
- Single-user isolation is enough

### Use **Docker/Podman Multi-User** if:
- You have a small team (2-10 users)
- You can maintain a server
- You want full control
- You prefer self-hosted solutions

### Use **RHEL8 Production** if:
- You have 10+ users
- You need enterprise features
- You have RHEL8 infrastructure
- You need compliance (SELinux, auditing)
- You want CI/CD integration

### Use **CloudCLI Cloud** if:
- You want zero maintenance
- You need team collaboration
- You want mobile/API access
- You prefer managed services
- You don't want to manage servers

---

## Getting Help

### Documentation
- [README.md](../README.md) - Quick start and overview
- [MULTI_USER_ARCHITECTURE.md](../MULTI_USER_ARCHITECTURE.md) - Architecture details
- [DEPLOY_RHEL8.md](../DEPLOY_RHEL8.md) - RHEL8 deployment guide
- [MULTI_USER_DEPLOYMENT.md](MULTI_USER_DEPLOYMENT.md) - Multi-user setup
- [PODMAN_SUPPORT.md](PODMAN_SUPPORT.md) - Podman specifics
- [GITLAB_CI_CD.md](GITLAB_CI_CD.md) - CI/CD automation

### Support Channels
- **GitHub Issues**: https://github.com/siteboon/claudecodeui/issues
- **Discord**: https://discord.gg/buxwujPNRE
- **Documentation**: https://cloudcli.ai/docs

### Community
- Report bugs on GitHub
- Request features on GitHub
- Join Discord for help
- Contribute via pull requests

---

## License

See [LICENSE](../LICENSE) file in the repository.
