import Docker from 'dockerode';
import { detectRuntime, getRuntimeConfig, enablePodmanSocket, getRuntimeName, validateRuntime } from './runtime-detector.js';

/**
 * Container Runtime Abstraction Layer
 * Provides a unified interface for both Docker and Podman
 */
class ContainerRuntime {
  constructor() {
    this.client = null;
    this.runtimeInfo = null;
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialize the container runtime
   * Detects and connects to Docker or Podman
   * @param {Object} options - Optional configuration overrides
   * @returns {Promise<Object>} Runtime information
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return this.runtimeInfo;
    }

    console.log('[ContainerRuntime] Initializing container runtime...');

    // Detect available runtime
    this.runtimeInfo = await detectRuntime();

    // Validate detection result
    const validation = validateRuntime(this.runtimeInfo);

    if (!validation.valid) {
      console.error('[ContainerRuntime] Runtime validation failed:');
      validation.issues.forEach(issue => console.error(`  - ${issue}`));
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));

      // Try to enable Podman socket if rootless
      if (this.runtimeInfo.type?.includes('podman')) {
        console.log('[ContainerRuntime] Attempting to enable Podman socket...');
        await enablePodmanSocket();

        // Re-detect after enabling socket
        this.runtimeInfo = await detectRuntime();
        const revalidation = validateRuntime(this.runtimeInfo);

        if (!revalidation.valid) {
          throw new Error(`Container runtime not available: ${revalidation.issues.join(', ')}`);
        }
      } else {
        throw new Error(`Container runtime not available: ${validation.issues.join(', ')}`);
      }
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => console.warn(`[ContainerRuntime] ${warning}`));
    }

    // Get runtime-specific configuration
    this.config = getRuntimeConfig(this.runtimeInfo.type);

    // Allow configuration overrides
    if (options.socketPath) {
      this.runtimeInfo.socketPath = options.socketPath;
    }

    // Initialize Docker API client (works with both Docker and Podman)
    try {
      this.client = new Docker({
        socketPath: this.runtimeInfo.socketPath
      });

      // Test connection
      await this.client.ping();

      console.log(`[ContainerRuntime] Connected to ${getRuntimeName(this.runtimeInfo.type)}`);
      console.log(`[ContainerRuntime] Version: ${this.runtimeInfo.version || 'Unknown'}`);
      console.log(`[ContainerRuntime] Socket: ${this.runtimeInfo.socketPath}`);

      this.initialized = true;
      return this.runtimeInfo;
    } catch (error) {
      console.error('[ContainerRuntime] Failed to connect to runtime:', error.message);
      throw new Error(`Failed to connect to ${getRuntimeName(this.runtimeInfo.type)}: ${error.message}`);
    }
  }

  /**
   * Ensure runtime is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Container runtime not initialized. Call initialize() first.');
    }
  }

  /**
   * Get the underlying Docker API client
   * @returns {Docker}
   */
  getClient() {
    this._ensureInitialized();
    return this.client;
  }

  /**
   * Get runtime information
   * @returns {Object}
   */
  getRuntimeInfo() {
    return this.runtimeInfo;
  }

  /**
   * Get runtime configuration
   * @returns {Object}
   */
  getRuntimeConfig() {
    return this.config;
  }

  /**
   * Check if runtime is Docker
   * @returns {boolean}
   */
  isDocker() {
    return this.runtimeInfo?.type === 'docker';
  }

  /**
   * Check if runtime is Podman
   * @returns {boolean}
   */
  isPodman() {
    return this.runtimeInfo?.type?.includes('podman');
  }

  /**
   * Check if runtime is rootless
   * @returns {boolean}
   */
  isRootless() {
    return this.runtimeInfo?.isRootless === true;
  }

  /**
   * Create a container with runtime-specific adjustments
   * @param {Object} options - Container creation options
   * @returns {Promise<Object>}
   */
  async createContainer(options) {
    this._ensureInitialized();

    // Apply runtime-specific adjustments
    const adjustedOptions = { ...options };

    // Handle RestartPolicy for rootless Podman
    if (this.isRootless() && adjustedOptions.HostConfig?.RestartPolicy) {
      // Rootless Podman may have issues with restart policies
      console.log('[ContainerRuntime] Adjusting restart policy for rootless Podman');

      if (adjustedOptions.HostConfig.RestartPolicy.Name === 'unless-stopped') {
        // Change to 'always' for better compatibility
        adjustedOptions.HostConfig.RestartPolicy.Name = 'always';
      }
    }

    // Handle AutoRemove
    if (this.isPodman() && !this.config.supportsAutoRemove) {
      console.log('[ContainerRuntime] Disabling AutoRemove for Podman compatibility');
      if (adjustedOptions.HostConfig) {
        adjustedOptions.HostConfig.AutoRemove = false;
      }
    }

    return this.client.createContainer(adjustedOptions);
  }

  /**
   * Create a network with runtime-specific adjustments
   * @param {Object} options - Network creation options
   * @returns {Promise<Object>}
   */
  async createNetwork(options) {
    this._ensureInitialized();

    const adjustedOptions = { ...options };

    // Use configured network driver
    if (!adjustedOptions.Driver) {
      adjustedOptions.Driver = this.config.networkDriver;
    }

    return this.client.createNetwork(adjustedOptions);
  }

  /**
   * Connect a container to a network
   * @param {string} containerIdOrName - Container ID or name
   * @param {string} networkName - Network name
   * @returns {Promise<void>}
   */
  async connectContainerToNetwork(containerIdOrName, networkName) {
    this._ensureInitialized();
    const network = this.client.getNetwork(networkName);
    await network.connect({ Container: containerIdOrName });
  }

  /**
   * Create a volume with runtime-specific adjustments
   * @param {Object} options - Volume creation options
   * @returns {Promise<Object>}
   */
  async createVolume(options) {
    this._ensureInitialized();

    const adjustedOptions = { ...options };

    // Use configured volume driver
    if (!adjustedOptions.Driver) {
      adjustedOptions.Driver = this.config.volumeDriver;
    }

    return this.client.createVolume(adjustedOptions);
  }

  /**
   * List containers
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async listContainers(options) {
    this._ensureInitialized();
    return this.client.listContainers(options);
  }

  /**
   * List networks
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async listNetworks(options) {
    this._ensureInitialized();
    return this.client.listNetworks(options);
  }

  /**
   * List volumes
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async listVolumes(options) {
    this._ensureInitialized();
    return this.client.listVolumes(options);
  }

  /**
   * Get a container object
   * @param {string} id
   * @returns {Object}
   */
  getContainer(id) {
    this._ensureInitialized();
    return this.client.getContainer(id);
  }

  /**
   * Get a network object
   * @param {string} id
   * @returns {Object}
   */
  getNetwork(id) {
    this._ensureInitialized();
    return this.client.getNetwork(id);
  }

  /**
   * Get a volume object
   * @param {string} name
   * @returns {Object}
   */
  getVolume(name) {
    this._ensureInitialized();
    return this.client.getVolume(name);
  }

  /**
   * Ping the runtime to check connectivity
   * @returns {Promise<void>}
   */
  async ping() {
    this._ensureInitialized();
    return this.client.ping();
  }

  /**
   * Get runtime system information
   * @returns {Promise<Object>}
   */
  async getSystemInfo() {
    this._ensureInitialized();
    return this.client.info();
  }

  /**
   * Get runtime version
   * @returns {Promise<Object>}
   */
  async getVersion() {
    this._ensureInitialized();
    return this.client.version();
  }

  /**
   * Prune unused resources
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async pruneContainers(options) {
    this._ensureInitialized();
    return this.client.pruneContainers(options);
  }

  /**
   * Prune unused networks
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async pruneNetworks(options) {
    this._ensureInitialized();
    return this.client.pruneNetworks(options);
  }

  /**
   * Prune unused volumes
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async pruneVolumes(options) {
    this._ensureInitialized();
    return this.client.pruneVolumes(options);
  }

  /**
   * Get runtime name for display
   * @returns {string}
   */
  getName() {
    if (!this.runtimeInfo) {
      return 'Unknown';
    }
    return getRuntimeName(this.runtimeInfo.type);
  }

  /**
   * Check if a feature is supported
   * @param {string} feature
   * @returns {boolean}
   */
  supportsFeature(feature) {
    if (!this.config) {
      return false;
    }

    const featureMap = {
      autoRemove: this.config.supportsAutoRemove,
      restartPolicy: this.config.supportsRestartPolicy,
      healthCheck: this.config.supportsHealthCheck
    };

    return featureMap[feature] ?? false;
  }
}

// Export singleton instance
export const containerRuntime = new ContainerRuntime();

// Export class for testing
export { ContainerRuntime };
