# Multi-User Worker Container Image
# This container runs an isolated CloudCLI instance for each user
# Based on Docker's official Claude Code sandbox template

FROM docker/sandbox-templates:claude-code

# Install dependencies as root
USER root

# Copy and run CloudCLI installation script
COPY shared/install-cloudcli.sh /tmp/install-cloudcli.sh
RUN chmod +x /tmp/install-cloudcli.sh && /tmp/install-cloudcli.sh

# Switch to agent user for CloudCLI installation
USER agent

# Install CloudCLI globally and verify installation
RUN npm install -g @cloudcli-ai/cloudcli && cloudcli --version

# Copy worker entrypoint script
COPY --chown=agent:agent worker/entrypoint.sh /home/agent/entrypoint.sh
RUN chmod +x /home/agent/entrypoint.sh

# Set working directory
WORKDIR /home/agent

# Expose default port (will be overridden by container manager)
EXPOSE 4001

# Health check to verify CloudCLI server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${SERVER_PORT:-4001}/health || exit 1

# Use entrypoint script to start CloudCLI
ENTRYPOINT ["/home/agent/entrypoint.sh"]
