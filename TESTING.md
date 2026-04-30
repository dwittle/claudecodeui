# Multi-User Container Architecture - Testing Guide

This document provides comprehensive testing procedures for the multi-user container architecture.

## Prerequisites

Before testing, ensure:
- Docker Engine is running
- Environment variables are configured in `.env`
- Database is initialized
- Worker image is built

```bash
# Check Docker
docker info

# Set environment variables
export MULTI_USER_MODE=true
export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Build images
docker build -t cloudcliai/worker:latest -f docker/worker/Dockerfile .
```

## Automated Tests

### 1. Encryption Service Tests

Test the AES-256-GCM encryption implementation:

```bash
# Set master key
export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Run encryption tests
node server/container/test-encryption.js
```

**Expected output:**
```
✅ Test 1: Basic encryption/decryption - PASS
✅ Test 2: User isolation - PASS
✅ Test 3: Multiple users with same value - PASS
✅ Test 4: Tampering detection - PASS
✅ Test 5: Configuration validation - PASS
✅ Test 6: Roundtrip test - PASS
```

### 2. Database Tests

Verify database schema and operations:

```bash
# Check database exists
sqlite3 data/auth.db ".tables"

# Verify schema
sqlite3 data/auth.db ".schema user_containers"
sqlite3 data/auth.db ".schema user_credentials"
sqlite3 data/auth.db ".schema container_ports"
sqlite3 data/auth.db ".schema credential_audit_log"
```

## Manual Testing Checklist

### Phase 1: User Registration & Authentication

- [ ] **User Registration**
  - [ ] Open http://localhost:3001
  - [ ] Create new user account
  - [ ] Verify account creation success
  - [ ] Check database: `sqlite3 data/auth.db "SELECT * FROM users;"`

- [ ] **User Login**
  - [ ] Log in with created credentials
  - [ ] Verify JWT token in localStorage
  - [ ] Confirm redirect to main UI

### Phase 2: Container Lifecycle

- [ ] **Container Creation (Automatic on Login)**
  - [ ] Log in as user
  - [ ] Wait for container creation (check logs)
  - [ ] Verify container created: `docker ps | grep cloudcli-user`
  - [ ] Check database: `sqlite3 data/auth.db "SELECT * FROM user_containers;"`
  - [ ] Verify volume: `docker volume ls | grep cloudcli-data`
  - [ ] Verify network: `docker network ls | grep cloudcli-net`

- [ ] **Container Status Monitoring**
  - [ ] Open Settings → Container tab
  - [ ] Verify status shows "running"
  - [ ] Check container info displays correctly
  - [ ] Verify port number matches database

- [ ] **Container Controls**
  - [ ] Click "Stop" button
  - [ ] Wait for container to stop
  - [ ] Verify status changes to "stopped"
  - [ ] Check Docker: `docker ps -a | grep cloudcli-user`
  - [ ] Click "Start" button
  - [ ] Wait for container to start
  - [ ] Verify status returns to "running"

- [ ] **Container Restart**
  - [ ] Click "Restart" button
  - [ ] Verify container restarts
  - [ ] Check status returns to "running"
  - [ ] Verify data persists after restart

- [ ] **Container Logs**
  - [ ] Click "View Logs" button
  - [ ] Verify logs display in terminal format
  - [ ] Check for CloudCLI startup messages
  - [ ] Verify logs update on refresh

### Phase 3: Credential Management

- [ ] **Add API Key Credential**
  - [ ] Open Settings → Credentials tab
  - [ ] Click "Add Credential"
  - [ ] Name: `GITHUB_TOKEN`
  - [ ] Type: `api_key`
  - [ ] Value: `ghp_test123456789`
  - [ ] Description: `GitHub API token`
  - [ ] Click "Save Credential"
  - [ ] Verify success message appears
  - [ ] Check database: `sqlite3 data/auth.db "SELECT credential_name, credential_type FROM user_credentials;"`

- [ ] **Verify Encryption**
  - [ ] Check encrypted value in database
  - [ ] Verify value is NOT plaintext: `sqlite3 data/auth.db "SELECT credential_value FROM user_credentials WHERE credential_name='GITHUB_TOKEN';"`
  - [ ] Confirm IV and auth_tag fields populated

- [ ] **Add Multiple Credential Types**
  - [ ] Add password credential
  - [ ] Add environment variable
  - [ ] Add SSH key (multi-line)
  - [ ] Verify all show in list

- [ ] **Credential in Container**
  - [ ] Wait for container restart (automatic)
  - [ ] Exec into container: `docker exec -it cloudcli-user-<id> bash`
  - [ ] Check environment variable: `echo $GITHUB_TOKEN`
  - [ ] Verify value matches what was entered
  - [ ] Exit container

- [ ] **Delete Credential**
  - [ ] Select a credential
  - [ ] Click delete button
  - [ ] Confirm deletion prompt
  - [ ] Verify credential removed from list
  - [ ] Wait for container restart
  - [ ] Check database: credential should have `is_active=0`

- [ ] **Audit Logging**
  - [ ] Check audit log: `sqlite3 data/auth.db "SELECT * FROM credential_audit_log;"`
  - [ ] Verify create/delete actions logged
  - [ ] Confirm user_id and timestamp recorded

### Phase 4: Proxy & Routing

- [ ] **Projects Access**
  - [ ] Navigate to Projects view
  - [ ] Create a new project
  - [ ] Verify project created in user's container
  - [ ] Check container filesystem: `docker exec cloudcli-user-<id> ls -la ~/.claude/projects/`

- [ ] **Git Operations**
  - [ ] Open a project
  - [ ] Make code changes
  - [ ] Open Git panel
  - [ ] Stage changes
  - [ ] Commit changes
  - [ ] Verify commit in container: `docker exec cloudcli-user-<id> git -C <project> log`

- [ ] **File Operations**
  - [ ] Create new file
  - [ ] Edit file content
  - [ ] Save file
  - [ ] Verify in container: `docker exec cloudcli-user-<id> cat <filepath>`

- [ ] **Session Management**
  - [ ] Start a chat session
  - [ ] Send messages
  - [ ] Verify responses
  - [ ] Check session persists in container

### Phase 5: Multi-User Isolation

- [ ] **Second User**
  - [ ] Log out from first user
  - [ ] Register second user
  - [ ] Log in as second user
  - [ ] Verify new container created: `docker ps | grep cloudcli-user`
  - [ ] Check database shows two containers

- [ ] **Container Isolation**
  - [ ] Both users logged in (different browsers/incognito)
  - [ ] User 1 creates project "project-a"
  - [ ] User 2 creates project "project-b"
  - [ ] Verify User 1 cannot see project-b
  - [ ] Verify User 2 cannot see project-a
  - [ ] Check container filesystems separately

- [ ] **Credential Isolation**
  - [ ] User 1 adds credential `USER1_KEY`
  - [ ] User 2 adds credential `USER2_KEY`
  - [ ] User 1 cannot access User 2's credentials (API level)
  - [ ] Check database: each credential tied to correct user_id

- [ ] **Network Isolation**
  - [ ] Check networks: `docker network ls | grep cloudcli-net`
  - [ ] Verify each user has separate network
  - [ ] Attempt cross-container access (should fail)

### Phase 6: Resource Management

- [ ] **Port Allocation**
  - [ ] Check port allocation: `sqlite3 data/auth.db "SELECT * FROM container_ports;"`
  - [ ] Verify sequential port assignment (4001, 4002, etc.)
  - [ ] Confirm no port conflicts

- [ ] **Resource Limits**
  - [ ] Check container resources: `docker stats cloudcli-user-<id>`
  - [ ] Verify memory limit: 2GB (or configured value)
  - [ ] Verify CPU limit: 1.0 (or configured value)

- [ ] **Volume Persistence**
  - [ ] Create project in container
  - [ ] Stop container: `docker stop cloudcli-user-<id>`
  - [ ] Start container: `docker start cloudcli-user-<id>`
  - [ ] Verify project still exists
  - [ ] Check files unchanged

### Phase 7: Error Handling

- [ ] **Docker Daemon Down**
  - [ ] Stop Docker daemon: `sudo systemctl stop docker`
  - [ ] Attempt to start container via UI
  - [ ] Verify error message displayed
  - [ ] Check gateway logs for error handling
  - [ ] Restart Docker: `sudo systemctl start docker`
  - [ ] Verify recovery

- [ ] **Container Startup Failure**
  - [ ] Use invalid base image in config
  - [ ] Attempt container creation
  - [ ] Verify error status in UI
  - [ ] Check error message in database
  - [ ] Fix configuration and retry

- [ ] **Port Exhaustion**
  - [ ] Set PORT_RANGE_END to small value (e.g., 4003)
  - [ ] Create users until ports exhausted
  - [ ] Verify appropriate error handling
  - [ ] Check logs for port exhaustion message

- [ ] **Missing Encryption Key**
  - [ ] Unset ENCRYPTION_MASTER_KEY
  - [ ] Restart server
  - [ ] Verify credentials API returns error
  - [ ] Check logs for configuration error

### Phase 8: Health & Monitoring

- [ ] **Health Endpoints**
  - [ ] Gateway: `curl http://localhost:3001/health`
  - [ ] Verify JSON response with status
  - [ ] Check multiUserMode flag

- [ ] **Container Logs**
  - [ ] Gateway logs: `docker logs cloudcli-gateway` (if using Docker Compose)
  - [ ] Worker logs: `docker logs cloudcli-user-<id>`
  - [ ] Check for errors or warnings

- [ ] **Database Integrity**
  - [ ] Run integrity check: `sqlite3 data/auth.db "PRAGMA integrity_check;"`
  - [ ] Verify foreign key constraints
  - [ ] Check for orphaned records

### Phase 9: Security Testing

- [ ] **Authentication Bypass Attempts**
  - [ ] Attempt to access `/api/containers/status` without token
  - [ ] Verify 401 Unauthorized response
  - [ ] Try invalid token
  - [ ] Confirm proper rejection

- [ ] **Cross-User Access Attempts**
  - [ ] User 1 gets their container ID from database
  - [ ] User 2 tries to access User 1's container via API
  - [ ] Verify blocked (should only see own container)
  - [ ] Check audit logs

- [ ] **Credential Security**
  - [ ] Inspect database credential values
  - [ ] Verify all encrypted (no plaintext)
  - [ ] Attempt to decrypt with wrong user ID (should fail)
  - [ ] Check file permissions on database: `ls -la data/auth.db`

- [ ] **Container Escape Attempts**
  - [ ] Exec into container
  - [ ] Try to access Docker socket
  - [ ] Attempt to access other containers
  - [ ] Verify isolation enforced

### Phase 10: Performance Testing

- [ ] **Container Startup Time**
  - [ ] Time container creation: start to "running" status
  - [ ] Target: < 60 seconds
  - [ ] Record actual time: _____ seconds

- [ ] **Proxy Latency**
  - [ ] Measure request time: `curl -w "@curl-format.txt" -H "Authorization: Bearer <token>" http://localhost:3001/api/containers/status`
  - [ ] Target: < 100ms overhead
  - [ ] Record latency: _____ ms

- [ ] **Concurrent Users**
  - [ ] Create 10 users simultaneously
  - [ ] Verify all containers start successfully
  - [ ] Check resource usage: `docker stats`
  - [ ] Monitor gateway CPU/memory

### Phase 11: Backup & Recovery

- [ ] **Database Backup**
  - [ ] Create backup: `cp data/auth.db data/auth.db.backup`
  - [ ] Delete a user's container
  - [ ] Restore database: `cp data/auth.db.backup data/auth.db`
  - [ ] Verify data restored

- [ ] **Volume Backup**
  - [ ] Backup volume: `docker run --rm -v cloudcli-data-user-1:/data -v $(pwd):/backup alpine tar czf /backup/user1-backup.tar.gz -C /data .`
  - [ ] Delete volume
  - [ ] Restore volume
  - [ ] Verify files intact

### Phase 12: Cleanup Testing

- [ ] **User Deletion**
  - [ ] Delete user account from database
  - [ ] Verify container stopped (CASCADE)
  - [ ] Check container removed
  - [ ] Verify credentials deleted (CASCADE)
  - [ ] Volume and network may remain (design choice)

- [ ] **Stale Container Cleanup**
  - [ ] Stop a container for 25+ hours
  - [ ] Run cleanup: Check if automatic or manual
  - [ ] Verify old containers removed
  - [ ] Check database updated

## Integration Test Script

Create a simple integration test script:

```bash
#!/bin/bash
# integration-test.sh

set -e

echo "Starting integration tests..."

# Test 1: Health check
echo "Test 1: Health check"
HEALTH=$(curl -s http://localhost:3001/health | jq -r '.status')
if [ "$HEALTH" = "ok" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL"
  exit 1
fi

# Test 2: Authentication required
echo "Test 2: Authentication required"
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/containers/status)
if [ "$STATUS_CODE" = "401" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL: Expected 401, got $STATUS_CODE"
  exit 1
fi

# Test 3: User registration
echo "Test 3: User registration"
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser'$RANDOM'","password":"testpass123"}')
TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.token')
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL"
  exit 1
fi

# Test 4: Container status (with auth)
echo "Test 4: Container status"
CONTAINER_STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/containers/status | jq -r '.status.status')
if [ -n "$CONTAINER_STATUS" ]; then
  echo "✅ PASS: Status is $CONTAINER_STATUS"
else
  echo "❌ FAIL"
  exit 1
fi

echo ""
echo "✅ All integration tests passed!"
```

## Performance Benchmarks

Expected performance metrics:

| Metric | Target | Notes |
|--------|--------|-------|
| Container startup | < 60s | From creation to running |
| Container stop | < 10s | Graceful shutdown |
| Container restart | < 20s | Stop + start |
| Proxy request latency | < 100ms | Added overhead |
| Credential encryption | < 10ms | Single credential |
| Database query time | < 50ms | Status lookup |
| Concurrent users | 30+ | On 64GB server |

## Troubleshooting Common Issues

### Container won't start
```bash
# Check logs
docker logs cloudcli-user-<id>

# Verify image exists
docker images | grep cloudcliai/worker

# Check port availability
netstat -tuln | grep 400[0-9]
```

### Credentials not in container
```bash
# Check if credential exists
sqlite3 data/auth.db "SELECT * FROM user_credentials;"

# Verify container restarted after adding
docker ps -a | grep cloudcli-user-<id>

# Check environment in container
docker exec cloudcli-user-<id> env | grep <CREDENTIAL_NAME>
```

### Proxy errors
```bash
# Check gateway logs
docker logs cloudcli-gateway

# Verify container is running
docker ps | grep cloudcli-user

# Test direct container access
curl http://localhost:<container-port>/health
```

## Test Results Template

```
Test Date: _______________
Tester: _______________
Environment: _______________

Phase 1: User Authentication      [ ] Pass [ ] Fail
Phase 2: Container Lifecycle      [ ] Pass [ ] Fail
Phase 3: Credential Management    [ ] Pass [ ] Fail
Phase 4: Proxy & Routing          [ ] Pass [ ] Fail
Phase 5: Multi-User Isolation     [ ] Pass [ ] Fail
Phase 6: Resource Management      [ ] Pass [ ] Fail
Phase 7: Error Handling           [ ] Pass [ ] Fail
Phase 8: Health & Monitoring      [ ] Pass [ ] Fail
Phase 9: Security Testing         [ ] Pass [ ] Fail
Phase 10: Performance Testing     [ ] Pass [ ] Fail
Phase 11: Backup & Recovery       [ ] Pass [ ] Fail
Phase 12: Cleanup Testing         [ ] Pass [ ] Fail

Overall Result: [ ] Pass [ ] Fail

Notes:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

## Continuous Testing

For ongoing development:

1. Run encryption tests before each commit
2. Perform integration tests after merging features
3. Run full manual test suite before releases
4. Monitor production metrics continuously

## Next Steps

After completing all tests:
1. Document any issues found
2. Create GitHub issues for bugs
3. Update documentation with findings
4. Create deployment checklist
