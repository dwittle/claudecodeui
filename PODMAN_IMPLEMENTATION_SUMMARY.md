# Podman Support Implementation Summary

CloudCLI now supports both **Docker** and **Podman** as container runtimes. This implementation maintains full backward compatibility with Docker while adding native Podman support.

## Implementation Date
April 30, 2026

## Changes Made

### 1. Core Runtime Abstraction

#### New Files Created:

**`server/container/runtime-detector.js`**
- Auto-detects available container runtimes (Docker or Podman)
- Checks socket availability and accessibility
- Supports both rootless and rootful Podman modes
- Provides runtime validation and health checks
- Handles automatic Podman socket activation

**`server/container/runtime.js`**
- Unified abstraction layer for Docker and Podman
- Wraps `dockerode` with runtime-specific adjustments
- Provides single API for both runtimes
- Handles Podman-specific quirks (e.g., restart policies in rootless mode)
- Exposes runtime information and capabilities

### 2. Configuration Updates

**`server/container/config.js`**
- Added `CONTAINER_RUNTIME` option (auto/docker/podman)
- Added Podman-specific socket path configuration
- Added automatic Podman socket enablement setting
- Maintains backward compatibility with existing `DOCKER_HOST` variable

**`.env.example`**
- Added runtime selection documentation
- Added Podman socket path examples
- Added rootless/rootful mode guidance
- Updated multi-user configuration section

### 3. Container Manager Refactoring

**`server/container/manager.js`**
- Replaced direct `dockerode` usage with runtime abstraction
- Updated all container operations to use `containerRuntime`
- Added runtime name to container labels and status responses
- Maintains all existing functionality

### 4. Deployment Configurations

**`podman-compose.yml`** (New)
- Podman-compatible compose file
- SELinux label support (`:Z` suffixes)
- Rootless and rootful mode support
- Socket path configuration for both modes
- Production-ready systemd integration notes

### 5. Documentation

**`docs/PODMAN_SUPPORT.md`** (New - Comprehensive Guide)
- Installation instructions for all platforms
- Configuration options and examples
- Rootless vs rootful mode comparison
- Migration guide from Docker
- Comprehensive troubleshooting section
- Performance comparison benchmarks
- Feature compatibility matrix

**`docker/PODMAN.md`** (New - Quick Reference)
- Quick start guide for Podman users
- Common commands and workflows
- Troubleshooting quick fixes

**`README.md`** (Updated)
- Added container deployment section
- Added Podman references
- Links to detailed documentation

**`MULTI_USER_ARCHITECTURE.md`** (Updated)
- Added Podman support notice
- Link to Podman guide

## Features

### ✅ Automatic Runtime Detection
- Detects Docker or Podman automatically
- No configuration required in most cases
- Falls back gracefully if neither is available

### ✅ Rootless Podman Support
- Fully supports rootless mode
- Auto-enables Podman socket service
- Handles user namespace differences
- Adjusts restart policies for compatibility

### ✅ Rootful Podman Support
- Works with system-level Podman daemon
- Full Docker feature parity
- Supports privileged operations

### ✅ Backward Compatibility
- Maintains 100% compatibility with existing Docker deployments
- No breaking changes to existing configurations
- Existing environment variables still work

### ✅ Runtime Information
- Shows active runtime in container status
- Displays runtime version and mode (rootless/rootful)
- Provides runtime capabilities information

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Container Manager (manager.js)          │
│  Orchestrates containers, volumes, networks     │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│      Runtime Abstraction (runtime.js)           │
│  Unified API for Docker & Podman                │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│    Runtime Detector (runtime-detector.js)       │
│  Auto-detects Docker/Podman & socket paths      │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
    ┌─────────┐      ┌──────────┐
    │  Docker │      │  Podman  │
    └─────────┘      └──────────┘
```

## Usage Examples

### Auto-Detection (Default)
```bash
# .env
CONTAINER_RUNTIME=auto
```

CloudCLI will automatically detect and use the first available runtime.

### Force Docker
```bash
# .env
CONTAINER_RUNTIME=docker
```

### Force Podman
```bash
# .env
CONTAINER_RUNTIME=podman
```

### Rootless Podman
```bash
# Enable socket
systemctl --user enable --now podman.socket

# Deploy
podman-compose -f podman-compose.yml up -d
```

### Rootful Podman
```bash
# Enable system socket
sudo systemctl enable --now podman.socket

# Deploy
sudo podman-compose -f podman-compose.yml up -d
```

## Testing Checklist

- [x] Auto-detection works for Docker
- [x] Auto-detection works for Podman
- [x] Rootless Podman socket activation
- [x] Container creation with both runtimes
- [x] Container start/stop/restart operations
- [x] Network isolation
- [x] Volume persistence
- [x] Credential injection
- [x] Health checks
- [x] Multi-user isolation
- [x] Runtime information in status API
- [x] Backward compatibility with existing Docker setups

## Migration Path

### For Existing Docker Users
1. No changes required - Docker continues to work
2. Optional: Can switch to Podman by setting `CONTAINER_RUNTIME=podman`

### For New Podman Users
1. Install Podman and podman-compose
2. Enable Podman socket (rootless mode)
3. Use `podman-compose.yml` for deployment
4. CloudCLI auto-detects Podman

## API Changes

### New Response Fields

**Container Status API (`/api/containers/status`)**
```json
{
  "status": "running",
  "runtime": "Podman (rootless)",
  ...
}
```

The `runtime` field indicates which container runtime is active.

### No Breaking Changes
All existing API endpoints and responses maintain backward compatibility.

## Performance Impact

- **Docker**: No performance impact
- **Podman Rootful**: Equivalent to Docker
- **Podman Rootless**: ~5-15% network overhead due to `slirp4netns`, negligible for typical workloads

## Security Improvements

### With Rootless Podman
- Containers run without root privileges
- Enhanced isolation from host system
- User namespace separation
- Reduced attack surface

## Known Limitations

### Rootless Podman
1. Cannot bind to privileged ports (< 1024) without sysctl configuration
2. Some advanced volume mount options may not work
3. Slightly slower network performance

### General
1. Podman Compose is a separate project with minor differences from Docker Compose
2. No Docker Swarm equivalent (use Kubernetes instead)

## Future Enhancements

Potential future improvements:
- [ ] GUI runtime switcher in settings
- [ ] Runtime-specific performance optimizations
- [ ] Advanced Podman features (pods, systemd integration)
- [ ] Kubernetes deployment support
- [ ] Container resource usage monitoring per runtime

## Files Modified

### Core Implementation
- `server/container/runtime-detector.js` (NEW)
- `server/container/runtime.js` (NEW)
- `server/container/config.js` (MODIFIED)
- `server/container/manager.js` (MODIFIED)

### Configuration
- `.env.example` (MODIFIED)
- `podman-compose.yml` (NEW)

### Documentation
- `docs/PODMAN_SUPPORT.md` (NEW)
- `docker/PODMAN.md` (NEW)
- `README.md` (MODIFIED)
- `MULTI_USER_ARCHITECTURE.md` (MODIFIED)
- `PODMAN_IMPLEMENTATION_SUMMARY.md` (NEW - this file)

## Dependencies

No new npm dependencies required. The implementation uses:
- Existing `dockerode` package (compatible with Podman's Docker API)
- Node.js built-in modules (`fs`, `child_process`, `os`, `path`)

## Compatibility Matrix

| Feature | Docker | Podman Rootful | Podman Rootless |
|---------|--------|----------------|-----------------|
| Container Management | ✅ | ✅ | ✅ |
| Network Isolation | ✅ | ✅ | ✅ |
| Volume Persistence | ✅ | ✅ | ✅ |
| Auto-restart | ✅ | ✅ | ✅* |
| Health Checks | ✅ | ✅ | ✅ |
| Resource Limits | ✅ | ✅ | ✅ |
| Privileged Ports | ✅ | ✅ | ⚠️** |
| Multi-user Mode | ✅ | ✅ | ✅ |
| Credential Injection | ✅ | ✅ | ✅ |

*Automatically converted to `always` for better compatibility
**Requires sysctl configuration

## Rollback Plan

If issues arise, you can:

1. **Force Docker Mode**:
   ```bash
   CONTAINER_RUNTIME=docker
   ```

2. **Revert Code Changes**:
   All changes are additive and don't modify core Docker functionality. Simply set `CONTAINER_RUNTIME=docker` to bypass the new runtime detection.

3. **Remove New Files** (if needed):
   - `server/container/runtime-detector.js`
   - `server/container/runtime.js`
   - `podman-compose.yml`
   - `docs/PODMAN_SUPPORT.md`
   - `docker/PODMAN.md`

## Support

For issues or questions:
1. Check [docs/PODMAN_SUPPORT.md](docs/PODMAN_SUPPORT.md) for troubleshooting
2. Verify your setup with `podman info` or `docker info`
3. Open an issue on GitHub with:
   - Container runtime version
   - Rootless/rootful mode
   - Error logs from CloudCLI

## Conclusion

This implementation successfully adds Podman support to CloudCLI while maintaining full backward compatibility with Docker. Users can now choose their preferred container runtime based on their security, performance, and operational requirements.

The auto-detection feature makes the transition seamless, and the comprehensive documentation ensures users can make informed decisions about which runtime to use.
