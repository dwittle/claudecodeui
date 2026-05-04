# CloudCLI Gateway Container
# Handles authentication, routing, and container orchestration for multi-user mode

FROM node:20-slim

# Install system dependencies including build tools for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and scripts (needed for postinstall hook)
COPY package*.json ./
COPY scripts/ scripts/

# Install ALL dependencies (needed for TypeScript build)
# Skip all install scripts (including husky) then run only the postinstall we need
RUN npm ci --ignore-scripts && \
    node scripts/fix-node-pty.js

# Copy application source
COPY . .

# Build both client and server
# Client build creates the frontend bundle in dist/
# Server build compiles TypeScript to dist-server/
RUN npm run build

# Remove dev dependencies after build, then rebuild native modules
RUN npm prune --production && npm rebuild

# Create data directory for database
RUN mkdir -p /data && chown -R node:node /data

# Use non-root user
USER node

# Expose gateway port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the gateway server (using built version)
CMD ["node", "dist-server/server/index.js"]
