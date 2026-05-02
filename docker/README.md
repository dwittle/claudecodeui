<!-- Docker Hub short description (100 chars max): -->
<!-- Sandbox templates for running AI coding agents with a web & mobile IDE (Claude Code, Codex, Gemini) -->

# Sandboxed coding agents with a web & mobile IDE (CloudCLI)

[Docker Sandbox](https://docs.docker.com/ai/sandboxes/) templates that add [CloudCLI](https://cloudcli.ai) on top of Claude Code, Codex, and Gemini CLI. You get a full web and mobile IDE accessible from any browser on any device.

**Container Runtime:** CloudCLI supports both Docker (with `sbx`) and **Podman** for container isolation. See [Podman Instructions](#podman-alternative) below.

## Get started

### 1. Install the sbx CLI

Docker Sandboxes run agents in isolated microVMs. Install the `sbx` CLI:

- **macOS**: `brew install docker/tap/sbx`
- **Windows**: `winget install -h Docker.sbx`
- **Linux**: `sudo apt-get install docker-sbx`

Full instructions: [docs.docker.com/ai/sandboxes/get-started](https://docs.docker.com/ai/sandboxes/get-started/)

### 2. Store your API key

`sbx` manages credentials securely — your API key never enters the sandbox. Store it once:

```bash
sbx login
sbx secret set -g anthropic
```

### 3. Launch Claude Code

```bash
npx @cloudcli-ai/cloudcli@latest sandbox ~/my-project
```

Open **http://localhost:3001**. Set a password on first visit. Start building.

### Using a different agent

Store the matching API key and pass `--agent`:

```bash
# OpenAI Codex
sbx secret set -g openai
npx @cloudcli-ai/cloudcli@latest sandbox ~/my-project --agent codex

# Gemini CLI
sbx secret set -g google
npx @cloudcli-ai/cloudcli@latest sandbox ~/my-project --agent gemini
```

### Available templates

| Agent | Template |
|-------|----------|
| **Claude Code** (default) | `docker.io/cloudcliai/sandbox:claude-code` |
| OpenAI Codex | `docker.io/cloudcliai/sandbox:codex` |
| Gemini CLI | `docker.io/cloudcliai/sandbox:gemini` |

These are used with `--template` when running `sbx` directly (see [Advanced usage](#advanced-usage)).

## Managing sandboxes

```bash
sbx ls                               # List all sandboxes
sbx stop my-project                  # Stop (preserves state)
sbx start my-project                 # Restart a stopped sandbox
sbx rm my-project                    # Remove everything
sbx exec my-project bash             # Open a shell inside the sandbox
```

If you install CloudCLI globally (`npm install -g @cloudcli-ai/cloudcli`), you can also use:

```bash
cloudcli sandbox ls
cloudcli sandbox start my-project    # Restart and re-launch web UI
cloudcli sandbox logs my-project     # View server logs
```

## What you get

- **Chat** — Markdown rendering, code blocks, message history
- **Files** — File tree with syntax-highlighted editor
- **Git** — Diff viewer, staging, branch switching, commits
- **Shell** — Built-in terminal emulator
- **MCP** — Configure Model Context Protocol servers visually
- **Mobile** — Works on tablet and phone browsers

Your project directory is mounted bidirectionally — edits propagate in real time, both ways.

## Configuration

Set variables at creation time with `--env`:

```bash
npx @cloudcli-ai/cloudcli@latest sandbox ~/my-project --env SERVER_PORT=8080
```

Or inside a running sandbox:

```bash
sbx exec my-project bash -c 'echo "export SERVER_PORT=8080" >> /etc/sandbox-persistent.sh'
```

Restart CloudCLI for changes to take effect:

```bash
sbx exec my-project bash -c 'pkill -f "server/index.js"'
sbx exec -d my-project cloudcli start --port 3001
```

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `3001` | Web UI port |
| `HOST` | `0.0.0.0` | Bind address (must be `0.0.0.0` for `sbx ports`) |
| `DATABASE_PATH` | `~/.cloudcli/auth.db` | SQLite database location |

## Advanced usage

For branch mode, multiple workspaces, memory limits, or the terminal agent experience, use `sbx` with the template:

```bash
# Terminal agent + web UI
sbx run --template docker.io/cloudcliai/sandbox:claude-code claude ~/my-project --name my-project
sbx ports my-project --publish 3001:3001

# Branch mode (Git worktree isolation)
sbx run --template docker.io/cloudcliai/sandbox:claude-code claude ~/my-project --branch my-feature

# Multiple workspaces
sbx run --template docker.io/cloudcliai/sandbox:claude-code claude ~/project ~/shared-libs:ro

# Pass a prompt directly
sbx run --template docker.io/cloudcliai/sandbox:claude-code claude ~/my-project -- "Fix the auth bug"
```

CloudCLI auto-starts via `.bashrc` when using `sbx run`.

Full options in the [Docker Sandboxes usage guide](https://docs.docker.com/ai/sandboxes/usage/).

## Network policies

Sandboxes restrict outbound access by default. To reach host services from inside the sandbox:

```bash
sbx policy allow network localhost:11434
# Inside the sandbox: curl http://host.docker.internal:11434
```

The web UI itself doesn't need a policy — access it via `sbx ports`.

## Podman Alternative

**CloudCLI fully supports Podman** as an alternative to Docker. Podman is a daemonless, rootless container engine ideal for multi-user and production environments.

### Why Podman?

- **Rootless**: Run containers without root privileges for better security
- **Daemonless**: No background daemon required
- **Multi-user**: Each user gets isolated containers and volumes
- **Docker-compatible**: Drop-in replacement for most Docker workflows

### Complete Setup Guide (From Scratch)

#### Prerequisites

- **Operating System**: Linux (Fedora/RHEL/Ubuntu/Debian) or macOS
- **Node.js**: Version 18 or higher
- **Podman**: Version 4.0 or higher
- **Git**: For cloning the repository
- **Disk Space**: 2GB minimum for images and containers

#### 1. Install Podman

**Fedora/RHEL/CentOS:**
```bash
sudo dnf install podman
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y podman
```

**macOS:**
```bash
brew install podman
podman machine init
podman machine start
```

Verify installation:
```bash
podman --version
podman info
```

#### 2. Enable Podman Socket (Rootless Mode)

```bash
# Enable and start the user socket service
systemctl --user enable --now podman.socket

# Verify socket is running
systemctl --user status podman.socket

# Check socket path
ls -la $XDG_RUNTIME_DIR/podman/podman.sock
```

#### 3. Clone and Install CloudCLI

```bash
# Clone the repository
git clone https://github.com/siteboon/claudecodeui.git
cd claudecodeui

# Install dependencies
npm install

# Copy example environment file
cp .env.example .env
```

#### 4. Configure Environment

Edit `.env` and set these values:

```bash
# Container runtime
CONTAINER_RUNTIME=podman

# Enable multi-user mode
MULTI_USER_MODE=true

# Server configuration
SERVER_PORT=3333
HOST=0.0.0.0

# Podman socket path (auto-detected if not set)
# PODMAN_SOCKET_PATH=/run/user/$(id -u)/podman/podman.sock
```

#### 5. Build Worker Container Image

**This step is required** - the worker image must be built before starting:

```bash
# Build the worker container image
podman build -t cloudcli-worker:latest -f docker/worker/Dockerfile .

# Verify image was created
podman images | grep cloudcli-worker
```

#### 6. Start the Server

**Development Mode:**
```bash
npm run dev

# Access UI at:
# http://localhost:5173 (frontend)
# WebSocket connects to :3333
```

**Production Mode:**
```bash
# Build frontend
npm run build

# Start server
npm start

# Access UI at:
# http://localhost:3333 (everything on single port)
```

#### 7. Create Your First User

```bash
# Add a user (creates container and volume automatically on first login)
node scripts/add-user.js admin password123

# Or log in to the web UI and create account interactively
# Navigate to http://localhost:5173 (dev) or http://localhost:3333 (prod)
```

#### 8. Verify Everything Works

```bash
# Check if gateway is running
curl http://localhost:3333/health

# List containers (will appear after first user login)
podman ps -a --filter name=cloudcli

# View logs
podman logs cloudcli-user-1
```

**Ports:**
- **Dev mode**: Browser connects to port 5173 (UI) and 3333 (WebSocket)
- **Production**: Browser connects to single port 3333 (everything)

### Production Deployment

For production, build the frontend and run the optimized server:

```bash
# 1. Build the frontend
npm run build

# 2. Start in production mode
npm start

# Or use PM2 for process management:
npm install -g pm2
pm2 start npm --name "cloudcli" -- start
pm2 save
pm2 startup  # Enable auto-start on boot

# View logs
pm2 logs cloudcli

# Restart
pm2 restart cloudcli

# Stop
pm2 stop cloudcli
```

**Production Configuration:**

Edit `.env` for production settings:
```bash
SERVER_PORT=3333
HOST=0.0.0.0
CONTAINER_RUNTIME=podman
MULTI_USER_MODE=true
NODE_ENV=production
```

**Systemd Service (Alternative to PM2):**

Create `/etc/systemd/system/cloudcli.service`:
```ini
[Unit]
Description=CloudCLI Gateway
After=network.target podman.socket

[Service]
Type=simple
User=cloudcli
WorkingDirectory=/opt/cloudcli
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable cloudcli
sudo systemctl start cloudcli
sudo systemctl status cloudcli
```

### Managing the Service

**Note:** The gateway server and worker containers run independently. Stopping the gateway does not stop user containers.

```bash
# Stop the gateway server (Ctrl+C if running in foreground)
# Or if running in background:
pkill -f "server/index.js"

# Restart the gateway server
npm run dev
# Note: This reconnects to existing running containers

# List running containers
podman ps

# List all containers (including stopped)
podman ps -a

# List only CloudCLI containers
podman ps -a --filter name=cloudcli

# Open a bash shell in the gateway (if running standalone)
podman exec -it cloudcli-gateway bash

# Open a bash shell in a user container
podman exec -it cloudcli-user-1 bash

# Run a command in a user container
podman exec cloudcli-user-1 ls -la /home/agent/workspace

# View logs for a specific user container
podman logs cloudcli-user-1

# Follow logs in real-time
podman logs -f cloudcli-user-1

# Stop a specific user container
podman stop cloudcli-user-1

# Start a stopped container
podman start cloudcli-user-1

# Stop all CloudCLI containers (without stopping gateway)
podman ps | grep cloudcli | awk '{print $1}' | xargs podman stop

# Restart everything (gateway + all containers)
pkill -f "server/index.js"  # Stop gateway
podman ps | grep cloudcli | awk '{print $1}' | xargs podman stop  # Stop containers
npm run dev  # Restart gateway (will recreate containers on user login)

# View gateway logs (if running npm run dev in background)
tail -f /tmp/dev-server.log
```

**Architecture:** The gateway server manages container lifecycle but runs independently. Containers persist when the gateway restarts, allowing seamless reconnection to active user sessions.

### Rebuilding Worker Containers

Worker containers need to be rebuilt when:
- Updating CloudCLI to a new version
- Modifying the worker Dockerfile
- Updating Claude Code or other container dependencies
- Changing the base image or system packages

**Rebuild Process:**

```bash
# 1. Build the new worker image
podman build -t cloudcli-worker:latest -f docker/worker/Dockerfile .

# 2. Stop and remove existing user containers
podman stop $(podman ps -a --filter name=cloudcli-user --format "{{.Names}}")
podman rm $(podman ps -a --filter name=cloudcli-user --format "{{.Names}}")

# 3. Restart gateway - it will create new containers with the updated image
pkill -f "server/index.js"
npm run dev  # or npm start for production

# Note: User volumes persist, so data is not lost
```

**Force Rebuild for a Single User:**

```bash
# Stop and remove specific user container
podman stop cloudcli-user-1
podman rm cloudcli-user-1

# Container will be automatically recreated on next user login
# Or trigger manually via the gateway API
```

**Rebuild with --no-cache (if needed):**

```bash
# Force complete rebuild without using cached layers
podman build --no-cache -t cloudcli-worker:latest -f docker/worker/Dockerfile .
```

**Verify Image Update:**

```bash
# Check image creation date
podman images | grep cloudcli-worker

# Inspect running container to see which image it's using
podman inspect cloudcli-user-1 | grep -A 5 "Image"
```

### Multi-User Setup

CloudCLI with Podman supports multi-user environments where each user gets:
- Isolated container with dedicated resources
- Private persistent volume at `~/.cloudcli/`
- Custom Claude Code configuration (API endpoints, models, permissions)

See [docs/PODMAN_SUPPORT.md](../docs/PODMAN_SUPPORT.md) for complete setup instructions, including:
- Rootless vs rootful mode configuration
- Multi-user architecture
- Volume management
- User provisioning with templates
- Troubleshooting guide

### Adding Users

Use the included CLI script to provision new users:

```bash
# Add a new user with initialized home directory
node scripts/add-user.js alice password123

# Template automatically configures:
# - Custom API endpoints
# - Claude Code settings
# - Workspace directory
```

See [scripts/README.md](../scripts/README.md) for user management details.

### Podman vs Docker Sandbox (sbx)

| Feature | Docker Sandbox (sbx) | Podman Multi-User |
|---------|---------------------|-------------------|
| Isolation | MicroVM per sandbox | Container per user |
| Root required | No (uses Docker Desktop) | No (rootless mode) |
| Multi-user | Single user per sandbox | Native multi-user support |
| Persistence | Sandbox volumes | User-specific volumes |
| Custom API | Via env vars | Template-based config |
| Best for | Local development | Production, multi-user systems |

### Troubleshooting

**"Worker image not found" error:**
```bash
# Build the worker image
podman build -t cloudcli-worker:latest -f docker/worker/Dockerfile .
```

**"Cannot connect to Podman socket" error:**
```bash
# Enable the socket
systemctl --user enable --now podman.socket

# Verify it's running
systemctl --user status podman.socket

# Check socket path
echo $XDG_RUNTIME_DIR/podman/podman.sock
```

**Port already in use:**
```bash
# Find what's using the port
sudo lsof -i :3333
# or
sudo ss -tulpn | grep :3333

# Change port in .env
echo "SERVER_PORT=3334" >> .env
```

**Container won't start:**
```bash
# Check container logs
podman logs cloudcli-user-1

# Check gateway logs
tail -f /tmp/dev-server.log

# Rebuild worker image
podman build --no-cache -t cloudcli-worker:latest -f docker/worker/Dockerfile .
```

**User volume data lost:**
```bash
# Volumes persist independently of containers
# List volumes
podman volume ls | grep cloudcli

# Inspect volume
podman volume inspect cloudcli-data-user-1

# Backup user data
podman run --rm -v cloudcli-data-user-1:/data:ro -v $(pwd):/backup alpine tar czf /backup/user-1-backup.tar.gz /data
```

**Permission errors in container:**
```bash
# Check volume ownership
podman unshare ls -la /path/to/volume

# Fix ownership (UID 100999 is container user)
podman unshare chown -R 100999:100999 /path/to/volume
```

**WebSocket connection fails:**
```bash
# Check if WebSocket proxy is configured
grep "setupWebSocketProxy" server/index.js

# Verify container is running
podman ps | grep cloudcli-user

# Test direct connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3333/ws
```

**Need more help?**
- Check [docs/PODMAN_SUPPORT.md](../docs/PODMAN_SUPPORT.md) for detailed troubleshooting
- Open an issue on [GitHub](https://github.com/siteboon/claudecodeui/issues)
- Join [Discord](https://discord.gg/buxwujPNRE) for community support

### Quick Reference

**Common Commands:**
```bash
# Start server (dev)
npm run dev

# Start server (production)
npm run build && npm start

# Add user
node scripts/add-user.js username password

# List containers
podman ps -a --filter name=cloudcli

# View container logs
podman logs -f cloudcli-user-1

# Shell into container
podman exec -it cloudcli-user-1 bash

# Rebuild worker image
podman build -t cloudcli-worker:latest -f docker/worker/Dockerfile .

# Restart everything
pkill -f "server/index.js"
podman stop $(podman ps -q --filter name=cloudcli)
npm run dev
```

**File Locations:**
- Gateway code: `server/`
- Worker Dockerfile: `docker/worker/Dockerfile`
- User template: `user-template/`
- Environment config: `.env`
- User volumes: `$(podman volume inspect cloudcli-data-user-1 --format {{.Mountpoint}})`
- Database: `~/.cloudcli/auth.db` (or `$DATABASE_PATH`)

**Port Reference:**
- Dev mode UI: `http://localhost:5173`
- Dev/Prod API: `http://localhost:3333`
- Worker containers: `4001, 4002, 4003...` (internal)

## Links

- [CloudCLI Cloud](https://cloudcli.ai) — fully managed, no setup required
- [Documentation](https://cloudcli.ai/docs) — full configuration guide
- [Podman Support Guide](../docs/PODMAN_SUPPORT.md) — complete Podman setup
- [User Management](../scripts/README.md) — adding and managing users
- [Discord](https://discord.gg/buxwujPNRE) — community support
- [GitHub](https://github.com/siteboon/claudecodeui) — source code and issues

## License

AGPL-3.0-or-later
