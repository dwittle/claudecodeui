# Multi-user worker container
# Runs THIS repository's server in dev mode (tsx) per logged-in user.
# Build context must be the repo root:
#   podman build -t claudecodeui/worker:dev -f docker/worker/Dockerfile .

FROM docker.io/docker/sandbox-templates:claude-code

USER root

# Build toolchain for native modules (better-sqlite3, node-pty, bcrypt)
# plus a few utilities the agent will commonly need.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-setuptools \
      curl git sudo jq ripgrep sqlite3 zip unzip tree vim-tiny \
    && rm -rf /var/lib/apt/lists/*

# App lives in /opt/cloudcli, owned by the unprivileged agent user
# (provided by the sandbox base image).
RUN mkdir -p /opt/cloudcli && chown -R agent:agent /opt/cloudcli

USER agent
WORKDIR /opt/cloudcli

# Install dependencies first for layer caching.
COPY --chown=agent:agent package.json package-lock.json ./
COPY --chown=agent:agent scripts/ scripts/
RUN npm install --legacy-peer-deps

# Copy the rest of the source.
COPY --chown=agent:agent . .

# Workspace lives under the persistent volume mounted at /home/agent.
WORKDIR /home/agent
RUN mkdir -p /home/agent/workspace

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${SERVER_PORT:-4001}/api/health || exit 1

# Dev-mode entrypoint: tsx runs the TypeScript-aware server straight from source.
CMD ["sh", "-c", "cd /opt/cloudcli && npx tsx --tsconfig server/tsconfig.json server/index.js"]
