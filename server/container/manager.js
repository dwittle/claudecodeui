import fs from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { containerDb, credentialDbEnhanced } from '../database/db.js';
import { encryptionService } from '../services/encryption.js';
import { containerRuntime } from './runtime.js';
import {
  CONTAINER_CONFIG,
  getContainerName,
  getVolumeName,
  getNetworkName,
  parseMemoryLimit
} from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Container Manager Service
 * Orchestrates Docker/Podman containers for multi-user isolation
 */
class ContainerManager {
  constructor() {
    this.runtime = containerRuntime;
    this.initialized = false;
    this.hostDnsServers = this.getHostDnsServers();
  }

  /**
   * Read DNS configuration from host's /etc/resolv.conf
   * @private
   * @returns {Object} Object with nameservers and search domains
   */
  getHostDnsServers() {
    try {
      const resolvConf = execSync('cat /etc/resolv.conf', { encoding: 'utf8' });
      const nameservers = [];
      const searchDomains = [];

      for (const line of resolvConf.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('nameserver ')) {
          const ns = trimmed.substring('nameserver '.length).trim();
          if (ns) nameservers.push(ns);
        } else if (trimmed.startsWith('search ')) {
          const domains = trimmed.substring('search '.length).trim().split(/\s+/);
          searchDomains.push(...domains);
        }
      }

      console.log(`[ContainerManager] Using host DNS servers: ${nameservers.join(', ')}`);
      console.log(`[ContainerManager] Using host DNS search domains: ${searchDomains.join(', ')}`);

      return {
        nameservers: nameservers.length > 0 ? nameservers : ['8.8.8.8', '8.8.4.4'],
        searchDomains: searchDomains
      };
    } catch (error) {
      console.warn(`[ContainerManager] Failed to read host DNS, using Google DNS: ${error.message}`);
      return {
        nameservers: ['8.8.8.8', '8.8.4.4'],
        searchDomains: []
      };
    }
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
      // Initialize container runtime (Docker or Podman)
      const socketPath = CONTAINER_CONFIG.DOCKER_HOST
        ? CONTAINER_CONFIG.DOCKER_HOST.replace('unix://', '')
        : null;

      await this.runtime.initialize({
        socketPath: socketPath || undefined
      });

      const runtimeInfo = this.runtime.getRuntimeInfo();
      console.log(`[ContainerManager] Connected to ${this.runtime.getName()}`);
      console.log(`[ContainerManager] Socket: ${runtimeInfo.socketPath}`);

      if (this.runtime.isRootless()) {
        console.log('[ContainerManager] Running in rootless mode');
      }

      // Verify encryption is configured
      if (!encryptionService.isConfigured()) {
        console.warn('[ContainerManager] WARNING: Encryption not configured. Credentials will not be injected.');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[ContainerManager] Failed to initialize:', error.message);
      throw new Error(`Container runtime unavailable: ${error.message}`);
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

      // Remove any orphaned container with the same name (e.g. DB was cleared but
      // the runtime container was never removed).
      const existing = await this.runtime.listContainers({
        all: true,
        filters: { name: [containerName] }
      });
      for (const c of existing) {
        if (c.Names && c.Names.some(n => n === `/${containerName}` || n === containerName)) {
          console.log(`[ContainerManager] Removing orphaned container ${containerName} (${c.Id.slice(0, 12)})`);
          try {
            const old = this.runtime.getContainer(c.Id);
            await old.remove({ force: true });
          } catch (rmErr) {
            console.warn(`[ContainerManager] Could not remove orphaned container: ${rmErr.message}`);
          }
        }
      }

      // Get available port
      const port = containerDb.getAvailablePort(
        CONTAINER_CONFIG.PORT_RANGE_START,
        CONTAINER_CONFIG.PORT_RANGE_END
      );

      // Allocate port in database
      containerDb.allocatePort(userId, containerName, port, port);

      // Get user's decrypted credentials
      const credentials = await this.getDecryptedCredentials(userId);

      // Get JWT secret from gateway to share with worker container
      const { appConfigDb } = await import('../database/db.js');
      const jwtSecret = process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();

      // Build environment variables.
      // USER_ID is the signal worker code uses to detect "I'm a worker, trust the gateway header".
      const envVars = [
        `SERVER_PORT=${port}`,
        `USER_ID=${userId}`,
        `AGENT_TYPE=${agentType}`,
        `JWT_SECRET=${jwtSecret}`,
        `WORKSPACES_ROOT=/home/agent/workspace`,
        // Point to the Claude binary bundled with the SDK
        `CLAUDE_CLI_PATH=/opt/cloudcli/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude`,
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

      // Build HostConfig based on runtime capabilities.
      // The worker image already contains this repo's source, so no source mounts are needed —
      // the per-user volume holds runtime state only.
      const hostConfig = {
        NetworkMode: networkName,
        Binds: [
          `${volumeName}:/home/agent:Z`,
        ],
        PortBindings: {
          [`${port}/tcp`]: [{ HostPort: String(port) }]
        },
        AutoRemove: false,
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      };

      // DNS servers are configured at the network level, but search domains must be set per-container
      if (this.hostDnsServers.searchDomains && this.hostDnsServers.searchDomains.length > 0) {
        hostConfig.DnsSearch = this.hostDnsServers.searchDomains;
      }

      // Only add resource limits if not in rootless mode
      // Rootless Podman doesn't have access to CPU cgroup controller by default
      if (!this.runtime.isRootless()) {
        hostConfig.Memory = parseMemoryLimit(CONTAINER_CONFIG.CONTAINER_MEMORY);
        hostConfig.NanoCpus = CONTAINER_CONFIG.CONTAINER_CPU * 1e9;
        console.log(`[ContainerManager] Setting resource limits: Memory=${CONTAINER_CONFIG.CONTAINER_MEMORY}, CPU=${CONTAINER_CONFIG.CONTAINER_CPU}`);
      } else {
        console.log(`[ContainerManager] Skipping resource limits (rootless mode)`);
      }

      // Create container with runtime-specific handling
      const container = await this.runtime.createContainer({
        Image: CONTAINER_CONFIG.BASE_IMAGE,
        name: containerName,
        Env: envVars,
        ExposedPorts: {
          [`${port}/tcp`]: {}
        },
        HostConfig: hostConfig,
        Labels: {
          'cloudcli.user_id': String(userId),
          'cloudcli.agent_type': agentType,
          'cloudcli.managed': 'true',
          'cloudcli.runtime': this.runtime.getName()
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
   * Create an isolated network for a user
   * @private
   * @param {string} networkName
   */
  async createUserNetwork(networkName) {
    try {
      const networks = await this.runtime.listNetworks({
        filters: { name: [networkName] }
      });

      // Filter does partial match, need exact match
      const exactMatch = networks.find(n => n.Name === networkName);

      if (exactMatch) {
        console.log(`[ContainerManager] Network ${networkName} already exists`);
        return;
      }

      console.log(`[ContainerManager] Creating network ${networkName} with DNS servers: ${this.hostDnsServers.nameservers.join(', ')}`);

      // For Podman with DNS configuration, use podman CLI directly as dockerode doesn't support network_dns_servers
      if (this.runtime.isPodman() && this.hostDnsServers.nameservers && this.hostDnsServers.nameservers.length > 0) {
        const dnsFlags = this.hostDnsServers.nameservers.map(dns => `--dns=${dns}`).join(' ');
        execSync(`podman network create ${dnsFlags} ${networkName}`, { stdio: 'inherit' });
      } else {
        // Use Docker API for Docker or basic Podman networks
        const networkOpts = {
          Name: networkName,
          Driver: 'bridge',
          Internal: false,
          Options: {
            'com.docker.network.bridge.name': networkName.substring(0, 15) // Linux interface name limit
          },
          Labels: {
            'cloudcli.managed': 'true'
          }
        };
        await this.runtime.createNetwork(networkOpts);
      }

      console.log(`[ContainerManager] Created network ${networkName}`);
    } catch (error) {
      console.error(`[ContainerManager] Failed to create network ${networkName}:`, error.message);
      throw error;
    }
  }

  /**
   * Copy user template to volume
   * @private
   * @param {string} volumeName
   */
  async copyTemplateToVolume(volumeName) {
    const templateDir = path.join(__dirname, '../../user-template');

    if (!existsSync(templateDir)) {
      console.log(`[ContainerManager] No user-template directory found, skipping template copy`);
      return;
    }

    try {
      // Get volume mount point
      const volumeInfo = await this.runtime.inspectVolume(volumeName);
      const volumePath = volumeInfo.Mountpoint;

      if (!volumePath) {
        console.warn(`[ContainerManager] Could not determine volume path for ${volumeName}`);
        return;
      }

      // Check if template was already copied (presence of README.md from template)
      const checkCmd = `podman unshare test -f "${volumePath}/README.md" && echo "exists" || echo "missing"`;
      try {
        const result = execSync(checkCmd, { encoding: 'utf-8' }).trim();
        if (result === 'exists') {
          console.log(`[ContainerManager] Template already copied to ${volumeName}, skipping`);
          return;
        }
      } catch (error) {
        // If check fails, proceed with copy
      }

      console.log(`[ContainerManager] Copying template to ${volumePath}`);

      // Copy template files using podman unshare for proper permissions
      // This ensures files are owned by UID 1000 (agent user in container)
      try {
        execSync(`podman unshare sh -c 'cp -a "${templateDir}/." "${volumePath}/" && chown -R 1000:1000 "${volumePath}"'`, {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        console.log(`[ContainerManager] Template copied successfully with correct ownership`);
      } catch (error) {
        console.warn(`[ContainerManager] Failed to copy template with podman unshare: ${error.message}`);
        // Fallback: try regular copy (may have permission issues)
        try {
          execSync(`cp -a "${templateDir}/." "${volumePath}/"`, {
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          console.log(`[ContainerManager] Template copied (ownership may need adjustment)`);
        } catch (fallbackError) {
          console.warn(`[ContainerManager] Failed to copy template: ${fallbackError.message}`);
        }
      }
    } catch (error) {
      console.error(`[ContainerManager] Error copying template to ${volumeName}:`, error.message);
      // Don't throw - template copy is nice-to-have, not critical
    }
  }

  /**
   * Create a persistent volume for a user
   * @private
   * @param {string} volumeName
   */
  async createUserVolume(volumeName) {
    try {
      const volumes = await this.runtime.listVolumes({
        filters: { name: [volumeName] }
      });

      const volumeExists = volumes.Volumes && volumes.Volumes.length > 0;

      if (!volumeExists) {
        await this.runtime.createVolume({
          Name: volumeName,
          Labels: {
            'cloudcli.managed': 'true'
          }
        });
        console.log(`[ContainerManager] Created volume ${volumeName}`);
      } else {
        console.log(`[ContainerManager] Volume ${volumeName} already exists`);
      }

      // Always try to copy template (will check if already copied inside the function)
      await this.copyTemplateToVolume(volumeName);

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
   * Seed the gateway's user record into the worker's local SQLite DB.
   *
   * The worker's auth.js worker-trust branch sets req.user from the gateway header
   * without a DB lookup, but downstream handlers query the local users table by id.
   * Without a row, those queries return null and break things like project listing.
   *
   * Idempotent (INSERT OR IGNORE). Safe to call on every container start.
   * @private
   * @param {string} containerId
   * @param {number} userId
   */
  async seedWorkerUser(containerId, userId) {
    const { userDb } = await import('../database/db.js');
    const user = userDb.getUserById(userId);
    if (!user) {
      throw new Error(`Cannot seed worker: user ${userId} not in gateway DB`);
    }

    // Build a node script that creates the DB file (and table) if missing,
    // then inserts the user row. The schema here matches server/database/schema.js.
    const script = `
      const Database = require('better-sqlite3');
      const fs = require('fs');
      const path = require('path');
      const dbPath = '/home/agent/.cloudcli/auth.db';
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const db = new Database(dbPath);
      db.exec(\`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME,
          is_active BOOLEAN DEFAULT 1,
          git_name TEXT,
          git_email TEXT,
          has_completed_onboarding BOOLEAN DEFAULT 0
        );
      \`);
      db.prepare('INSERT OR IGNORE INTO users (id, username, password_hash, is_active) VALUES (?, ?, ?, 1)')
        .run(${userId}, ${JSON.stringify(user.username)}, '');
      console.log('[seedWorkerUser] ok', ${userId});
    `;

    const container = this.runtime.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ['node', '-e', script],
      AttachStdout: true,
      AttachStderr: true,
      User: 'agent',
      // /opt/cloudcli is where this repo is installed in the worker image,
      // so node can resolve the bundled better-sqlite3.
      WorkingDir: '/opt/cloudcli',
    });
    await exec.start({ hijack: true, stdin: false });
    console.log(`[ContainerManager] Seeded user ${userId} into worker DB`);
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

      const container = this.runtime.getContainer(containerInfo.container_id);

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

      // Seed the gateway user row into the worker's local DB so handlers
      // that look up the user by id (project listings, sessions, settings)
      // succeed. Idempotent — safe across restarts.
      try {
        await this.seedWorkerUser(containerInfo.container_id, userId);
      } catch (err) {
        // Don't fail startup: the worker-trust auth path doesn't need this row,
        // but downstream queries might. Log and continue.
        console.error(`[ContainerManager] User seed failed for ${userId}:`, err.message);
      }

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

      const container = this.runtime.getContainer(containerInfo.container_id);
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
   * This RECREATES the container to inject updated environment variables
   * @param {number} userId
   */
  async restartUserContainer(userId) {
    console.log(`[ContainerManager] Restarting container for user ${userId} (recreate for credential injection)`);

    const containerInfo = containerDb.getContainerByUserId(userId);
    if (!containerInfo) {
      console.log(`[ContainerManager] No container found for user ${userId}`);
      return;
    }

    try {
      // Stop the container
      await this.stopUserContainer(userId);

      // Small delay to ensure clean shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Remove the container (this is necessary to update environment variables)
      const container = this.runtime.getContainer(containerInfo.container_id);
      await container.remove({ force: true });
      console.log(`[ContainerManager] Removed container ${containerInfo.container_id}`);

      // Delete container record from database but keep port allocated
      containerDb.deleteContainer(userId);

      // Small delay to ensure resources are freed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create a new container with updated credentials
      await this.createUserContainer(userId, containerInfo.agent_type);
      console.log(`[ContainerManager] Created new container for user ${userId} with updated credentials`);

    } catch (error) {
      console.error(`[ContainerManager] Failed to restart container for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Ensure a user's container is running, start if needed
   * @param {number} userId
   * @returns {Promise<Object>} Container info with port
   */
  async ensureRunning(userId) {
    console.log(`[ContainerManager.ensureRunning] Called for userId=${userId}`);
    const containerInfo = containerDb.getContainerByUserId(userId);
    console.log(`[ContainerManager.ensureRunning] containerInfo:`, containerInfo);

    if (!containerInfo) {
      console.log(`[ContainerManager.ensureRunning] No container found, creating new container`);
      await this.createUserContainer(userId);
      return await this.ensureRunning(userId);
    }

    // Verify actual runtime state — the DB status can be stale if the container
    // crashed or was stopped externally (e.g. server restart, OOM kill).
    try {
      const container = this.runtime.getContainer(containerInfo.container_id);
      const inspect = await container.inspect();

      if (inspect.State.Running) {
        // Container is genuinely running — update DB if it was out of sync.
        if (containerInfo.status !== 'running') {
          containerDb.updateContainerStatus(userId, 'running');
        }
        console.log(`[ContainerManager.ensureRunning] Container running on port ${containerInfo.internal_port}`);
        return {
          internalPort: containerInfo.internal_port,
          containerId: containerInfo.container_id
        };
      }

      // Container exists but is stopped — start it.
      console.log(`[ContainerManager.ensureRunning] Container stopped, starting it`);
      containerDb.updateContainerStatus(userId, 'stopped');
      await this.startUserContainer(userId);
      return {
        internalPort: containerInfo.internal_port,
        containerId: containerInfo.container_id
      };

    } catch (error) {
      // Container no longer exists in the runtime (removed externally or never created).
      // Clean up the stale DB record and recreate from scratch.
      const isNotFound = error.statusCode === 404 ||
        (error.message && (error.message.includes('no such container') || error.message.includes('No such container')));

      if (isNotFound) {
        console.log(`[ContainerManager.ensureRunning] Container ${containerInfo.container_id} not found in runtime, recreating`);
        containerDb.deleteContainer(userId);
        containerDb.releasePort(containerInfo.internal_port);
        await this.createUserContainer(userId);
        return await this.ensureRunning(userId);
      }

      throw error;
    }
  }

  /**
   * Get container status
   * @param {number} userId
   * @returns {Promise<Object>} Status information
   */
  async getContainerStatus(userId) {
    const containerInfo = containerDb.getContainerByUserId(userId);
    if (!containerInfo) {
      return {
        status: 'none',
        runtime: this.runtime.getName()
      };
    }

    try {
      const container = this.runtime.getContainer(containerInfo.container_id);
      const inspect = await container.inspect();

      return {
        status: inspect.State.Running ? 'running' : 'stopped',
        containerId: containerInfo.container_id,
        port: containerInfo.internal_port,
        created: containerInfo.created_at,
        uptime: inspect.State.StartedAt,
        runtime: this.runtime.getName()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        runtime: this.runtime.getName()
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
      const container = this.runtime.getContainer(containerInfo.container_id);
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
      const container = this.runtime.getContainer(containerInfo.container_id);
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
