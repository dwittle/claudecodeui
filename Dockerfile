# CloudCLI Gateway Container
# Handles authentication, routing, and container orchestration for multi-user mode

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Create data directory for database
RUN mkdir -p /data && chown -R node:node /data

# Use non-root user
USER node

# Expose gateway port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the gateway server
CMD ["node", "server/index.js"]
