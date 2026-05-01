#!/usr/bin/env node

/**
 * Runtime Detection Test Script
 * Tests the container runtime detection and initialization
 *
 * Usage: node server/container/test-runtime.js
 */

import { detectRuntime, getRuntimeName, validateRuntime } from './runtime-detector.js';
import { containerRuntime } from './runtime.js';

async function testRuntimeDetection() {
  console.log('='.repeat(60));
  console.log('CloudCLI Container Runtime Detection Test');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Runtime Detection
  console.log('Test 1: Detecting available container runtime...');
  try {
    const runtimeInfo = await detectRuntime();

    console.log('✓ Detection completed');
    console.log();
    console.log('Runtime Information:');
    console.log('  Type:', runtimeInfo.type || 'None detected');
    console.log('  Available:', runtimeInfo.available);
    console.log('  Socket Path:', runtimeInfo.socketPath || 'N/A');
    console.log('  CLI Available:', runtimeInfo.cliAvailable);
    console.log('  Version:', runtimeInfo.version || 'Unknown');

    if (runtimeInfo.type?.includes('podman')) {
      console.log('  Rootless Mode:', runtimeInfo.isRootless);
    }
    console.log();

    // Test 2: Runtime Validation
    console.log('Test 2: Validating runtime...');
    const validation = validateRuntime(runtimeInfo);

    if (validation.valid) {
      console.log('✓ Runtime is valid and ready to use');
    } else {
      console.log('✗ Runtime validation failed');
      console.log('  Issues:');
      validation.issues.forEach(issue => console.log(`    - ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log('  Warnings:');
      validation.warnings.forEach(warning => console.log(`    - ${warning}`));
    }
    console.log();

    // Test 3: Runtime Initialization
    if (validation.valid) {
      console.log('Test 3: Initializing container runtime...');
      try {
        await containerRuntime.initialize();

        console.log('✓ Runtime initialized successfully');
        console.log();
        console.log('Runtime Details:');
        console.log('  Name:', containerRuntime.getName());
        console.log('  Is Docker:', containerRuntime.isDocker());
        console.log('  Is Podman:', containerRuntime.isPodman());
        console.log('  Is Rootless:', containerRuntime.isRootless());
        console.log();

        // Test 4: System Information
        console.log('Test 4: Fetching system information...');
        try {
          const systemInfo = await containerRuntime.getSystemInfo();
          console.log('✓ System info retrieved');
          console.log('  Containers:', systemInfo.Containers);
          console.log('  Running:', systemInfo.ContainersRunning);
          console.log('  Paused:', systemInfo.ContainersPaused);
          console.log('  Stopped:', systemInfo.ContainersStopped);
          console.log('  Images:', systemInfo.Images);
          console.log();
        } catch (error) {
          console.log('✗ Failed to get system info:', error.message);
          console.log();
        }

        // Test 5: Version Information
        console.log('Test 5: Fetching version information...');
        try {
          const version = await containerRuntime.getVersion();
          console.log('✓ Version info retrieved');
          console.log('  Version:', version.Version);
          console.log('  API Version:', version.ApiVersion);
          console.log('  Go Version:', version.GoVersion);
          console.log();
        } catch (error) {
          console.log('✗ Failed to get version:', error.message);
          console.log();
        }

      } catch (error) {
        console.log('✗ Failed to initialize runtime:', error.message);
        console.log();
      }
    } else {
      console.log('⊗ Skipping initialization test (runtime not valid)');
      console.log();
    }

    // Summary
    console.log('='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));

    if (validation.valid) {
      console.log('✓ Container runtime is available and working');
      console.log(`  Using: ${getRuntimeName(runtimeInfo.type)}`);
      console.log(`  Socket: ${runtimeInfo.socketPath}`);
      console.log();
      console.log('CloudCLI is ready to manage containers!');
    } else {
      console.log('✗ No container runtime available');
      console.log();
      console.log('Please install Docker or Podman:');
      console.log('  Docker: https://docs.docker.com/get-docker/');
      console.log('  Podman: https://podman.io/getting-started/installation');
      console.log();
      console.log('For Podman rootless mode, enable the socket:');
      console.log('  systemctl --user enable --now podman.socket');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('✗ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testRuntimeDetection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
