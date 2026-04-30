import Docker from 'dockerode';
import fs from 'fs/promises';
import { containerDb, credentialDbEnhanced } from '../database/db.js';
import { encryptionService } from '../services/encryption.js';
import {
  CONTAINER_CONFIG,
  getContainerName,
  getVolumeName,
  getNetworkName,
  parseMemoryLimit
} from './config.js';

/**
 * Container Manager Service
 * Orchestrates Docker containers for multi-user isolation
 */
class ContainerManager {
  constructor() {
    this.docker = null;
    this.initialized = false;
  }

  /**
   * Initialize the container manager
   * Must be called before any container operations
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Connect to Docker daemon
      this.docker = new Docker({
        socketPath: CONTAINER_CONFIG.DOCKER_HOST.replace('unix://', '')
      });

      // Test Docker connection
      await this.docker.ping();
      console.log('[ContainerManager] Connected to Docker daemon');

      // Verify encryption is configured
      if (!encryptionService.isConfigured()) {
        console.warn('[ContainerManager] WARNING: Encryption not configured. Credentials will not be injected.');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[ContainerManager] Failed to initialize:', error.message);
      throw new Error(`Docker daemon unavailable: ${error.message}`);
    }
  }

  /**
   * Ensure Docker is initialized before operations
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('ContainerManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Get decrypted credentials for a user
   * @private
   * @param {number} userId
   * @returns {Promise<Array>} Array of credentials with decrypted values
   */
  async getDecryptedCredentials(userId) {
    if (!encryptionService.isConfigured()) {
      return [];
    }

    try {
      const credentials = credentialDbEnhanced.getActiveCredentials(userId);

      return credentials.map(cred => {
        try {
          const decryptedValue = encryptionService.decrypt(
            cred.credential_value,
            cred.encryption_iv,
            cred.auth_tag,
            userId
          );

          return {
            ...cred,
            decrypted_value: decryptedValue
          };
        } catch (error) {
          console.error(`[ContainerManager] Failed to decrypt credential ${cred.id}:`, error.message);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      console.error('[ContainerManager] Failed to get credentials:', error.message);
      return [];
    }
  }

  /**
   * Create a user container with all resources
   * @param {number} userId
   * @param {string} agentType - 'claude-code', 'codex', 'cursor', or 'gemini'
   * @returns {Promise<Object>} Container info
   */
  async createUserContainer(userId, agentType = 'claude-code') {
    this._ensureInitialized();

    const containerName = getContainerName(userId);
    const volumeName = getVolumeName(userId);
    const networkName = getNetworkName(userId);

    try {
      console.log(`[ContainerManager] Creating container for user ${userId}`);

      // Get available port
      const port = containerDb.getAvailablePort(
        CONTAINER_CONFIG.PORT_RANGE_START,
        CONTAINER_CONFIG.PORT_RANGE_END
      );

      // Allocate port in database
      containerDb.allocatePort(userId, containerName, port, port);

      // Get user's decrypted credentials
      const credentials = await this.getDecryptedCredentials(userId);

      // Build environment variables
      const envVars = [
        `SERVER_PORT=${port}`,
        `USER_ID=${userId}`,
        `AGENT_TYPE=${agentType}`,
      ];

      // Add credential environment variables
      for (const cred of credentials) {
        if (['env_var', 'api_key', 'password', 'token'].includes(cred.credential_type)) {
          envVars.push(`${cred.credential_name}=${cred.decrypted_value}`);
        }
      }

      // Create isolated network
      await this.createUserNetwork(networkName);

      // Create persistent volume
      await this.createUserVolume(volumeName);

      // Create container
      const container = await this.docker.createContainer({
        Image: CONTAINER_CONFIG.BASE_IMAGE,
        name: containerName,
        Env: envVars,
        ExposedPorts: {
          [`${port}/tcp`]: {}
        },
        HostConfig: {
          Memory: parseMemoryLimit(CONTAINER_CONFIG.CONTAINER_MEMORY),
          NanoCpus: CONTAINER_CONFIG.CONTAINER_CPU * 1e9,
          NetworkMode: networkName,
          Binds: [
            `${volumeName}:/home/agent`
          ],
          AutoRemove: false,
          RestartPolicy: {
            Name: 'unless-stopped'
          }
        },
        Labels: {
          'cloudcli.user_id': String(userId),
          'cloudcli.agent_type': agentType,
          'cloudcli.managed': 'true'
        }
      });

      // Save to database
      containerDb.createContainer({
        userId,
        containerId: container.id,
        containerName,
        internalPort: port,
        volumeName,
        networkName,
        agentType
      });

      // Inject file-based credentials (SSH keys, certificates)
      await this.injectFileCredentials(container, userId, credentials);

      // Log event
      containerDb.logContainerEvent(userId, container.id, 'created', {
        agent_type: agentType,
        port,
        network: networkName,
        volume: volumeName
      });

      console.log(`[ContainerManager] Created container ${containerName} on port ${port}`);

      return {
        id: container.id,
        name: containerName,
        port,
        status: 'created'
      };
    } catch (error) {
      console.error(`[ContainerManager] Failed to create container for user ${userId}:`, error.message);

      // Update status to error
      const existing = containerDb.getContainerByUserId(userId);
      if (existing) {
        containerDb.updateContainerStatus(userId, 'error', error.message);
      }

      throw error;
    }
  }

  /**
   * Create an isolated Docker network for a user
   * @private
   * @param {string} networkName
   */
  async createUserNetwork(networkName) {
    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] }
      });

      if (networks.length > 0) {
        console.log(`[ContainerManager] Network ${networkName} already exists`);
        return;
      }

      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Internal: false,
        Labels: {
          'cloudcli.managed': 'true'
        }
      });

      console.log(`[ContainerManager] Created network ${networkName}`);
    } catch (error) {
      console.error(`[ContainerManager] Failed to create network ${networkName}:`, error.message);
      throw error;
    }
  }

  /**
   * Create a persistent Docker volume for a user
   * @private
   * @param {string} volumeName
   */
  async createUserVolume(volumeName) {
    try {
      const volumes = await this.docker.listVolumes({
        filters: { name: [volumeName] }
      });

      if (volumes.Volumes && volumes.Volumes.length > 0) {
        console.log(`[ContainerManager] Volume ${volumeName} already exists`);
        return;
      }

      await this.docker.createVolume({
        Name: volumeName,
        Labels: {
          'cloudcli.managed': 'true'
        }
      });

      console.log(`[ContainerManager] Created volume ${volumeName}`);
    } catch (error) {
      console.error(`[ContainerManager] Failed to create volume ${volumeName}:`, error.message);
      throw error;
    }
  }

  /**
   * Inject file-based credentials into container
   * @private
   * @param {Object} container - Docker container object
   * @param {number} userId
   * @param {Array} credentials
   */
  async injectFileCredentials(container, userId, credentials) {
    const fileCredentials = credentials.filter(c =>
      ['ssh_key', 'certificate'].includes(c.credential_type)
    );

    if (fileCredentials.length === 0) {
      return;
    }

    console.log(`[ContainerManager] Injecting ${fileCredentials.length} file credential(s) for user ${userId}`);

    for (const cred of fileCredentials) {
      try {
        // For now, we'll implement this when container is running
        // File injection requires the container to be started first
        console.log(`[ContainerManager] File credential ${cred.credential_name} will be injected on start`);
      } catch (error) {
        console.error(`[ContainerManager] Failed to inject credential ${cred.id}:`, error.message);
      }
    }
  }

  /**
   * Start a user's container
   * @param {number} userId
   * @returns {Promise<Object>} Container status
   */
  async startUserContainer(userId) {
    this._ensureInitialized();

    try {
      const containerInfo = containerDb.getContainerByUserId(userId);
      if (!containerInfo) {
        throw new Error(`No container found for user ${userId}`);
      }

      const container = this.docker.getContainer(containerInfo.container_id);

      // Check current status
      const inspect = await container.inspect();
      if (inspect.State.Running) {
        console.log(`[ContainerManager] Container for user ${userId} already running`);
        return { status: 'running', port: containerInfo.internal_port };
      }

      // Start container
      console.log(`[ContainerManager] Starting container for user ${userId}`);
      containerDb.updateContainerStatus(userId, 'starting');

      await container.start();

      // Wait for health check
      await this.waitForHealthy(container, CONTAINER_CONFIG.STARTUP_TIMEOUT);

      // Update status
      containerDb.updateContainerStatus(userId, 'running');
      containerDb.logContainerEvent(userId, containerInfo.container_id, 'start');

      console.log(`[ContainerManager] Container for user ${userId} started successfully`);

      return {
        status: 'running',
        port: containerInfo.internal_port,
        containerId: containerInfo.container_id
      };
    } catch (error) {
      console.error(`[ContainerManager] Failed to start container for user ${userId}:`, error.message);
      containerDb.updateContainerStatus(userId, 'error', error.message);
      containerDb.logContainerEvent(userId, '', 'error', { error: error.message });
      throw error;
    }
  }

  /**
   * Wait for container to be healthy
   * @private
   * @param {Object} container
   * @param {number} timeout
   */
  async waitForHealthy(container, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const inspect = await container.inspect();

      if (!inspect.State.Running) {
        throw new Error('Container stopped unexpectedly');
      }

      // For now, just check if running (health check endpoint would be better)
      if (inspect.State.Running) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Container start timeout');
  }

  /**
   * Stop a user's container
   * @param {number} userId
   * @param {boolean} force - Force stop without graceful shutdown
   */
  async stopUserContainer(userId, force = false) {
    this._ensureInitialized();

    try {
      const containerInfo = containerDb.getContainerByUserId(userId);
      if (!containerInfo) {
        console.log(`[ContainerManager] No container to stop for user ${userId}`);
        return;
      }

      const container = this.docker.getContainer(containerInfo.container_id);
      const inspect = await container.inspect();

      if (!inspect.State.Running) {
        console.log(`[ContainerManager] Container for user ${userId} already stopped`);
        containerDb.updateContainerStatus(userId, 'stopped');
        return;
      }

      console.log(`[ContainerManager] Stopping container for user ${userId}`);
      containerDb.updateContainerStatus(userId, 'stopping');

      if (force) {
        await container.kill();
      } else {
        await container.stop({ t: CONTAINER_CONFIG.SHUTDOWN_TIMEOUT / 1000 });
      }

      containerDb.updateContainerStatus(userId, 'stopped');
      containerDb.logContainerEvent(userId, containerInfo.container_id, 'stop', { force });

      console.log(`[ContainerManager] Container for user ${userId} stopped`);
    } catch (error) {
      console.error(`[ContainerManager] Failed to stop container for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Restart a user's container (for credential changes)
   * @param {number} userId
   */
  async restartUserContainer(userId) {
    console.log(`[ContainerManager] Restarting container for user ${userId}`);
    await this.stopUserContainer(userId);
    // Small delay to ensure clean shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startUserContainer(userId);
  }

  /**
   * Ensure a user's container is running, start if needed
   * @param {number} userId
   * @returns {Promise<Object>} Container info with port
   */
  async ensureRunning(userId) {
    const containerInfo = containerDb.getContainerByUserId(userId);

    if (!containerInfo) {
      // Create container if it doesn't exist
      await this.createUserContainer(userId);
      return await this.ensureRunning(userId);
    }

    if (containerInfo.status === 'running') {
      return {
        internalPort: containerInfo.internal_port,
        containerId: containerInfo.container_id
      };
    }

    // Start if stopped
    await this.startUserContainer(userId);
    return {
      internalPort: containerInfo.internal_port,
      containerId: containerInfo.container_id
    };
  }

  /**
   * Get container status
   * @param {number} userId
   * @returns {Promise<Object>} Status information
   */
  async getContainerStatus(userId) {
    const containerInfo = containerDb.getContainerByUserId(userId);
    if (!containerInfo) {
      return { status: 'none' };
    }

    try {
      const container = this.docker.getContainer(containerInfo.container_id);
      const inspect = await container.inspect();

      return {
        status: inspect.State.Running ? 'running' : 'stopped',
        containerId: containerInfo.container_id,
        port: containerInfo.internal_port,
        created: containerInfo.created_at,
        uptime: inspect.State.StartedAt
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get container logs
   * @param {number} userId
   * @param {number} tail - Number of lines to retrieve
   * @returns {Promise<string>} Log output
   */
  async getContainerLogs(userId, tail = 100) {
    this._ensureInitialized();

    const containerInfo = containerDb.getContainerByUserId(userId);
    if (!containerInfo) {
      return '';
    }

    try {
      const container = this.docker.getContainer(containerInfo.container_id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });

      return logs.toString('utf8');
    } catch (error) {
      console.error(`[ContainerManager] Failed to get logs for user ${userId}:`, error.message);
      return `Error retrieving logs: ${error.message}`;
    }
  }

  /**
   * Clean up stopped containers older than threshold
   * @param {number} ageMs - Age threshold in milliseconds
   */
  async cleanupStaleContainers(ageMs = CONTAINER_CONFIG.IDLE_TIMEOUT) {
    this._ensureInitialized();

    console.log('[ContainerManager] Running stale container cleanup');

    const containers = containerDb.getAllContainers();
    const threshold = new Date(Date.now() - ageMs);

    for (const info of containers) {
      if (info.status === 'stopped' && new Date(info.stopped_at) < threshold) {
        console.log(`[ContainerManager] Removing stale container for user ${info.user_id}`);
        await this.removeUserContainer(info.user_id);
      }
    }
  }

  /**
   * Completely remove a user's container and resources
   * @param {number} userId
   */
  async removeUserContainer(userId) {
    this._ensureInitialized();

    const containerInfo = containerDb.getContainerByUserId(userId);
    if (!containerInfo) {
      return;
    }

    try {
      // Stop if running
      await this.stopUserContainer(userId, true);

      // Remove container
      const container = this.docker.getContainer(containerInfo.container_id);
      await container.remove({ force: true });

      // Note: We don't remove volumes/networks to preserve user data
      // They should be manually cleaned when user is deleted

      containerDb.deleteContainer(userId);
      containerDb.releasePort(containerInfo.internal_port);
      containerDb.logContainerEvent(userId, containerInfo.container_id, 'removed');

      console.log(`[ContainerManager] Removed container for user ${userId}`);
    } catch (error) {
      console.error(`[ContainerManager] Failed to remove container for user ${userId}:`, error.message);
    }
  }

  /**
   * Shutdown all containers gracefully
   * Called on server shutdown
   */
  async shutdownAll() {
    console.log('[ContainerManager] Shutting down all containers');

    const containers = containerDb.getRunningContainers();
    for (const info of containers) {
      try {
        await this.stopUserContainer(info.user_id, false);
      } catch (error) {
        console.error(`Failed to stop container for user ${info.user_id}:`, error.message);
      }
    }
  }
}

// Export singleton instance
export const containerManager = new ContainerManager();

// Export class for testing
export { ContainerManager };
