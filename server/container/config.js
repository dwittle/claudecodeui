/**
 * Configuration for Docker container management
 * All values can be overridden by environment variables
 */

export const CONTAINER_CONFIG = {
  // Docker image for worker containers
  BASE_IMAGE: process.env.CONTAINER_BASE_IMAGE || 'cloudcliai/sandbox:claude-code',

  // Naming prefixes
  NETWORK_PREFIX: 'cloudcli-net',
  VOLUME_PREFIX: 'cloudcli-data',
  CONTAINER_PREFIX: 'cloudcli-user',

  // Port allocation range
  PORT_RANGE_START: parseInt(process.env.CONTAINER_PORT_START || '4001', 10),
  PORT_RANGE_END: parseInt(process.env.CONTAINER_PORT_END || '5000', 10),

  // Resource limits
  CONTAINER_MEMORY: process.env.CONTAINER_MEMORY_LIMIT || '2g',
  CONTAINER_CPU: parseFloat(process.env.CONTAINER_CPU_LIMIT || '1.0'),

  // Health check and timeout settings
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  HEALTH_CHECK_TIMEOUT: 5000,   // 5 seconds
  STARTUP_TIMEOUT: 60000,        // 60 seconds
  SHUTDOWN_TIMEOUT: 30000,       // 30 seconds

  // Container lifecycle
  STOP_ON_LOGOUT: process.env.CONTAINER_STOP_ON_LOGOUT === 'true',
  IDLE_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours

  // Docker daemon
  DOCKER_HOST: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  RETRY_BACKOFF_MULTIPLIER: 2,
};

/**
 * Get container name for a user
 * @param {number} userId
 * @returns {string}
 */
export function getContainerName(userId) {
  return `${CONTAINER_CONFIG.CONTAINER_PREFIX}-${userId}`;
}

/**
 * Get volume name for a user
 * @param {number} userId
 * @returns {string}
 */
export function getVolumeName(userId) {
  return `${CONTAINER_CONFIG.VOLUME_PREFIX}-user-${userId}`;
}

/**
 * Get network name for a user
 * @param {number} userId
 * @returns {string}
 */
export function getNetworkName(userId) {
  return `${CONTAINER_CONFIG.NETWORK_PREFIX}-user-${userId}`;
}

/**
 * Parse memory limit string to bytes
 * @param {string} memoryString - e.g., "2g", "512m"
 * @returns {number} bytes
 */
export function parseMemoryLimit(memoryString) {
  const units = {
    b: 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };

  const match = memoryString.match(/^(\d+)([bkmg])$/i);
  if (!match) {
    throw new Error(`Invalid memory limit format: ${memoryString}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return value * units[unit];
}
