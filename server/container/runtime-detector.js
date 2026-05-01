import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Container Runtime Detector
 * Automatically detects and configures Docker or Podman
 */

/**
 * Possible socket locations to check
 */
const SOCKET_LOCATIONS = {
  docker: [
    '/var/run/docker.sock',
    '/run/docker.sock',
  ],
  podman: [
    // Rootful Podman
    '/var/run/podman/podman.sock',
    '/run/podman/podman.sock',
    // Rootless Podman (user-specific)
    () => path.join(os.homedir(), '.local/share/podman/podman.sock'),
    () => {
      const xdgRuntime = process.env.XDG_RUNTIME_DIR;
      return xdgRuntime ? path.join(xdgRuntime, 'podman', 'podman.sock') : null;
    },
    () => `/run/user/${process.getuid ? process.getuid() : 1000}/podman/podman.sock`,
  ]
};

/**
 * Runtime types
 */
export const RuntimeType = {
  DOCKER: 'docker',
  PODMAN: 'podman',
  PODMAN_ROOTLESS: 'podman-rootless'
};

/**
 * Check if a socket file exists and is accessible
 * @param {string} socketPath
 * @returns {Promise<boolean>}
 */
async function isSocketAccessible(socketPath) {
  try {
    if (!socketPath) return false;

    const stats = await fs.promises.stat(socketPath);

    // Check if it's a socket
    if (!stats.isSocket()) {
      return false;
    }

    // Try to access it
    await fs.promises.access(socketPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Test if Docker daemon is available via CLI
 * @returns {Promise<boolean>}
 */
async function isDockerAvailable() {
  try {
    await execAsync('docker info', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Test if Podman is available via CLI
 * @returns {Promise<boolean>}
 */
async function isPodmanAvailable() {
  try {
    await execAsync('podman info', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Podman is running in rootless mode
 * @returns {Promise<boolean>}
 */
async function isPodmanRootless() {
  try {
    const { stdout } = await execAsync('podman info --format json', { timeout: 5000 });
    const info = JSON.parse(stdout);

    // Check if running as rootless
    return info.host?.security?.rootless === true;
  } catch {
    // If we can't determine, assume rootful
    return false;
  }
}

/**
 * Find the first accessible socket for a runtime
 * @param {Array<string|Function>} locations
 * @returns {Promise<string|null>}
 */
async function findAccessibleSocket(locations) {
  for (const location of locations) {
    const socketPath = typeof location === 'function' ? location() : location;
    if (await isSocketAccessible(socketPath)) {
      return socketPath;
    }
  }
  return null;
}

/**
 * Detect available container runtime
 * @returns {Promise<Object>} Runtime information
 */
export async function detectRuntime() {
  const result = {
    type: null,
    socketPath: null,
    available: false,
    version: null,
    isRootless: false,
    cliAvailable: false
  };

  // Check for explicit runtime override via environment
  const forceRuntime = process.env.CONTAINER_RUNTIME?.toLowerCase();

  if (forceRuntime === 'docker') {
    console.log('[RuntimeDetector] Forced to use Docker via CONTAINER_RUNTIME env var');

    result.cliAvailable = await isDockerAvailable();
    result.socketPath = await findAccessibleSocket(SOCKET_LOCATIONS.docker);

    if (result.socketPath) {
      result.type = RuntimeType.DOCKER;
      result.available = true;

      try {
        const { stdout } = await execAsync('docker --version');
        result.version = stdout.trim();
      } catch {}
    }

    return result;
  }

  if (forceRuntime === 'podman') {
    console.log('[RuntimeDetector] Forced to use Podman via CONTAINER_RUNTIME env var');

    result.cliAvailable = await isPodmanAvailable();
    result.isRootless = await isPodmanRootless();
    result.socketPath = await findAccessibleSocket(SOCKET_LOCATIONS.podman);

    if (result.socketPath) {
      result.type = result.isRootless ? RuntimeType.PODMAN_ROOTLESS : RuntimeType.PODMAN;
      result.available = true;

      try {
        const { stdout } = await execAsync('podman --version');
        result.version = stdout.trim();
      } catch {}
    }

    return result;
  }

  // Auto-detect: Try Docker first, then Podman
  console.log('[RuntimeDetector] Auto-detecting container runtime...');

  // Try Docker
  const dockerSocket = await findAccessibleSocket(SOCKET_LOCATIONS.docker);
  const dockerCli = await isDockerAvailable();

  if (dockerSocket || dockerCli) {
    console.log('[RuntimeDetector] Docker detected');
    result.type = RuntimeType.DOCKER;
    result.socketPath = dockerSocket;
    result.available = !!dockerSocket;
    result.cliAvailable = dockerCli;

    try {
      const { stdout } = await execAsync('docker --version');
      result.version = stdout.trim();
    } catch {}

    return result;
  }

  // Try Podman
  const podmanSocket = await findAccessibleSocket(SOCKET_LOCATIONS.podman);
  const podmanCli = await isPodmanAvailable();

  if (podmanSocket || podmanCli) {
    console.log('[RuntimeDetector] Podman detected');
    const isRootless = await isPodmanRootless();

    result.type = isRootless ? RuntimeType.PODMAN_ROOTLESS : RuntimeType.PODMAN;
    result.socketPath = podmanSocket;
    result.available = !!podmanSocket;
    result.cliAvailable = podmanCli;
    result.isRootless = isRootless;

    try {
      const { stdout } = await execAsync('podman --version');
      result.version = stdout.trim();
    } catch {}

    return result;
  }

  console.log('[RuntimeDetector] No container runtime detected');
  return result;
}

/**
 * Get runtime-specific configuration adjustments
 * @param {string} runtimeType
 * @returns {Object} Configuration overrides
 */
export function getRuntimeConfig(runtimeType) {
  const config = {
    supportsAutoRemove: true,
    supportsRestartPolicy: true,
    supportsHealthCheck: true,
    requiresSocketActivation: false,
    networkDriver: 'bridge',
    volumeDriver: 'local'
  };

  // Podman-specific adjustments
  if (runtimeType === RuntimeType.PODMAN || runtimeType === RuntimeType.PODMAN_ROOTLESS) {
    // Rootless Podman may need socket activation
    if (runtimeType === RuntimeType.PODMAN_ROOTLESS) {
      config.requiresSocketActivation = true;
    }

    // Podman uses different network drivers in some cases
    config.networkDriver = 'bridge';
  }

  return config;
}

/**
 * Enable Podman socket if running rootless
 * @returns {Promise<void>}
 */
export async function enablePodmanSocket() {
  try {
    const isRootless = await isPodmanRootless();

    if (!isRootless) {
      console.log('[RuntimeDetector] Podman is running rootful, socket should be available');
      return;
    }

    console.log('[RuntimeDetector] Enabling Podman rootless socket...');

    // Try to enable systemd user service
    try {
      await execAsync('systemctl --user enable --now podman.socket');
      console.log('[RuntimeDetector] Podman socket service enabled');

      // Wait a moment for socket to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.warn('[RuntimeDetector] Could not enable systemd service:', error.message);
      console.log('[RuntimeDetector] You may need to manually start the Podman socket:');
      console.log('  systemctl --user enable --now podman.socket');
    }
  } catch (error) {
    console.error('[RuntimeDetector] Error enabling Podman socket:', error.message);
  }
}

/**
 * Get friendly runtime name
 * @param {string} runtimeType
 * @returns {string}
 */
export function getRuntimeName(runtimeType) {
  switch (runtimeType) {
    case RuntimeType.DOCKER:
      return 'Docker';
    case RuntimeType.PODMAN:
      return 'Podman (rootful)';
    case RuntimeType.PODMAN_ROOTLESS:
      return 'Podman (rootless)';
    default:
      return 'Unknown';
  }
}

/**
 * Validate runtime configuration
 * @param {Object} runtimeInfo
 * @returns {Object} Validation result
 */
export function validateRuntime(runtimeInfo) {
  const issues = [];
  const warnings = [];

  if (!runtimeInfo.available) {
    issues.push('Container runtime socket is not accessible');

    if (runtimeInfo.cliAvailable) {
      warnings.push('CLI is available but socket is not accessible. Check permissions.');

      if (runtimeInfo.type === RuntimeType.PODMAN_ROOTLESS) {
        warnings.push('For rootless Podman, enable the socket: systemctl --user enable --now podman.socket');
      }
    }
  }

  if (!runtimeInfo.cliAvailable && runtimeInfo.available) {
    warnings.push('Socket is accessible but CLI is not in PATH');
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
}
