# Multi-User Container Architecture: Diagnosis & Fix Plan

**Companion to:** `TROUBLESHOOTING_MULTI_USER.md`
**Date:** 2026-05-04
**Goal:** Container-only deployment with data permanence. Root permitted.

---

## TL;DR

The current design tries to do three hard things at once:

1. **Rootless** Podman on the host
2. **Per-user isolated networks** with the gateway dynamically joining each
3. **Trust-the-network** auth as a workaround for fragile JWT plumbing

Each one fights the runtime, and the fixes pile on top of each other. The
recently-applied "use container name when in gateway container" change is
also actively broken (see Bug A below) — that is why requests still 502 after
all the fixes in the troubleshooting doc.

The recommended path is to **simplify the topology**, not to add more
workarounds:

- Run the gateway as **rootful Podman** (you said this is acceptable). This
  removes the cgroup-delegation problem in one stroke.
- Use **one shared bridge network** (`cloudcli-workers`) for gateway + all
  workers. Drop dynamic per-user networks. Container-name DNS just works.
- Make **JWT_SECRET and ENCRYPTION_MASTER_KEY** required environment
  variables so they survive gateway recreation.
- **Remove the `TRUST_INTERNAL_NETWORK` bypass** from production paths — it
  silently collapses every request onto user #1 and breaks multi-tenancy.
- Persist data via bind-mounted directories + named volumes (already mostly
  in place; needs to be made explicit and enforced).

The rest of this doc walks through each bug and the corresponding change.

---

## 1. Bugs in the current code

### Bug A (CRITICAL — active 502 cause): proxy reads a field that is never set

`server/middleware/proxy.js:42-44` and `:157-159` read
`containerInfo.containerName`:

```js
const isGatewayContainer = process.env.HOSTNAME !== undefined;
const targetHost = isGatewayContainer ? containerInfo.containerName : 'localhost';
```

But `containerManager.ensureRunning()` (`server/container/manager.js:632-636`
and `:643-647`) only returns:

```js
return {
  internalPort: containerInfo.internal_port,
  containerId: containerInfo.container_id
};
```

`containerName` is **undefined**, so `target` becomes
`http://undefined:4007/`. That is the actual ECONNREFUSED you're seeing,
not a network-isolation problem. The dynamic-network-join workaround
cannot succeed while this is broken.

### Bug B: `process.env.HOSTNAME` is not a reliable in-container check

`HOSTNAME` is set by virtually every Linux shell (bash sets it from
`gethostname(2)`), and Node inherits it, so `process.env.HOSTNAME !==
undefined` is true on the host as well. The troubleshooting doc itself
notes this in "Lessons Learned":

> Reading `/etc/hostname` is more reliable than `process.env.HOSTNAME` in
> containers

…but the recently-applied fix uses `process.env.HOSTNAME`. So even after
fixing Bug A, this branch will be taken in non-container environments too.

### Bug C: dynamic per-user network joining is racy and unbounded

`manager.js:237-249` connects the gateway to each worker's isolated network
after the worker is created. This works in principle, but:

- **Race**: connect must complete before any request arrives. With Podman's
  network reload behavior, brief DNS gaps occur.
- **Unbounded growth**: with N users the gateway is on N+1 networks. There
  is no cleanup when a worker is removed (`removeUserContainer` doesn't
  disconnect the gateway).
- **Debugging tax**: every user-specific networking issue requires
  inspecting a different network.
- **Restart risk**: when the gateway restarts, network membership for
  pre-existing workers is rebuilt only when the next request triggers
  `ensureRunning` for that user. If the worker is already running, that
  branch isn't hit.

### Bug D: `TRUST_INTERNAL_NETWORK=true` collapses every user onto user #1

`server/middleware/auth.js:55-67` (HTTP) and `:150-162` (WebSocket) both do:

```js
const user = userDb.getFirstUser();
if (user) { return { id: user.id, ... }; }
```

In a multi-user system, this means **every request, regardless of who the
caller claims to be, is treated as user #1**. The proxy then routes all
traffic to user #1's container. This isn't a security weakness on a
trusted network — it's a *correctness* break that makes multi-user mode
non-functional. The doc lists it as "Working" but it only appears to work
because there's only one user in the test.

This bypass should be removed (or scoped only to the `IS_PLATFORM`
single-user mode, where it already exists separately).

### Bug E: JWT secret rotates whenever the gateway DB is wiped

`server/middleware/auth.js:6`:

```js
const JWT_SECRET = process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();
```

If `JWT_SECRET` isn't set, the secret is generated and stored in `auth.db`.
Every `rm /data/gateway/auth.db` regenerates it. Browser tokens signed by
the old secret then fail with "invalid signature" — exactly Issue #7 in
the troubleshooting doc.

### Bug F: resource limits removed unconditionally

`manager.js:201-204` skips `Memory` and `NanoCpus` for *all* runtimes.
The cgroup delegation problem is specific to **rootless** Podman in
nested-container scenarios. With rootful Podman, cgroup v2 delegation
works and limits should be applied.

### Bug G: worker image builds the frontend it never serves

`docker/worker/Dockerfile:37` runs `npm run build`, which builds both
client (`dist/`) and server (`dist-server/`). Workers only run the API
(`dist-server/`). The client bundle is dead weight — slower builds,
larger images, more attack surface. Workers should build server only.

### Bug H: Podman socket auto-detection is bypassed

`docker-compose.yml:18` and the gateway env in `TROUBLESHOOTING.md` set
`DOCKER_HOST=unix:///var/run/docker.sock` and
`CONTAINER_RUNTIME=docker`. This forces the runtime detector to skip its
Podman path and treat the socket as Docker. It works (because Podman's
socket is Docker-API-compatible), but it disables the rootless detection
in `runtime.js`, which is one of the reasons `isRootless()` returned the
wrong answer in Issue #4 (Attempt 3 in the doc).

---

## 2. Recommended architecture

### 2.1 Topology

```
┌─────────────────────────────────────────────────────────────────┐
│ Host (rootful Podman)                                           │
│                                                                 │
│   /run/podman/podman.sock                                       │
│                                                                 │
│   Network: cloudcli-workers (single shared bridge)              │
│   ├── cloudcli-gateway   (DNS name: cloudcli-gateway)           │
│   ├── cloudcli-user-1    (DNS name: cloudcli-user-1)            │
│   ├── cloudcli-user-2    (DNS name: cloudcli-user-2)            │
│   └── cloudcli-user-N    (DNS name: cloudcli-user-N)            │
│                                                                 │
│   Volumes (named, persistent):                                  │
│   ├── cloudcli-gateway-data  → /data inside gateway             │
│   ├── cloudcli-data-user-1   → /home/agent inside user-1        │
│   ├── cloudcli-data-user-2   → /home/agent inside user-2        │
│   └── cloudcli-data-user-N   → /home/agent inside user-N        │
└─────────────────────────────────────────────────────────────────┘
```

Why this works:

- **DNS resolution is automatic**: `cloudcli-user-1` resolves to the
  worker's IP from anywhere on `cloudcli-workers`. No connect-after-create
  step.
- **Per-user isolation comes from**: separate containers (process / FS /
  PID / mount namespaces), separate volumes, and the gateway's own
  routing logic — not from network segmentation. Workers don't expose
  ports to the outside world; only the gateway does.
- **Defense-in-depth network rules** (optional) can still be applied
  via Podman/Docker firewall rules or `iptables` on the bridge to block
  worker-to-worker traffic. This is a small follow-up, not a blocker.

### 2.2 Gateway runs rootful

```
podman run -d \
  --name cloudcli-gateway \
  --network cloudcli-workers \
  --restart unless-stopped \
  -p 3001:3001 \
  -v /run/podman/podman.sock:/var/run/docker.sock \
  -v cloudcli-gateway-data:/data \
  --env-file ./gateway.env \
  cloudcliai/gateway:latest
```

Notes:

- `/run/podman/podman.sock` is the **rootful** socket. It requires the
  gateway container itself to run as root (default for `--user root`
  and Dockerfile's `USER node` reverted — see §3.2).
- `cloudcli-gateway-data` is a named volume, but a host bind-mount
  (`./data/gateway:/data`) is equivalent if you prefer host visibility.
  Both give data permanence across container removal.
- `--security-opt label=disable` is no longer needed for socket access
  in rootful mode but doesn't hurt.

### 2.3 Workers join the shared network

Workers are created by the gateway, not by compose. The gateway's
`createUserContainer` should set `NetworkMode: 'cloudcli-workers'` (one
constant) instead of creating a per-user network.

---

## 3. Concrete code changes

### 3.1 `server/container/manager.js`

**(a) Drop per-user network creation; use the shared workers network.**

```js
// Replace getNetworkName(userId) usage with a single shared name.
import { CONTAINER_CONFIG } from './config.js';

const SHARED_WORKER_NETWORK =
  process.env.WORKER_NETWORK || 'cloudcli-workers';

// In createUserContainer:
//   - delete the createUserNetwork(networkName) call
//   - delete the gateway-connect-to-network block (lines 237-249)
//   - set HostConfig.NetworkMode = SHARED_WORKER_NETWORK
//   - persist networkName: SHARED_WORKER_NETWORK in containerDb
```

Add a one-time bootstrap that ensures the shared network exists when
the gateway starts:

```js
async ensureSharedNetwork() {
  const existing = await this.runtime.listNetworks({
    filters: { name: [SHARED_WORKER_NETWORK] }
  });
  if (existing.length === 0) {
    await this.runtime.createNetwork({
      Name: SHARED_WORKER_NETWORK,
      Driver: 'bridge',
      Labels: { 'cloudcli.managed': 'true' }
    });
  }
}
```

Call it from `initialize()` after the runtime is ready.

**(b) Re-enable resource limits when running rootful.**

```js
// Replaces lines 201-204
const isRootless = this.runtime.isRootless();
if (!isRootless) {
  hostConfig.Memory = parseMemoryLimit(CONTAINER_CONFIG.CONTAINER_MEMORY);
  hostConfig.NanoCpus = Math.round(CONTAINER_CONFIG.CONTAINER_CPU * 1e9);
} else {
  console.log('[ContainerManager] Rootless mode — skipping cgroup limits');
}
```

If a user explicitly opts out (e.g. for debugging), they can set
`CONTAINER_MEMORY_LIMIT=` (empty) in the gateway env and the
`parseMemoryLimit` call should be guarded for the empty-string case.

**(c) Always return `containerName` from `ensureRunning`.**

```js
// Two places, lines 632-636 and 643-647
return {
  internalPort: containerInfo.internal_port,
  containerId: containerInfo.container_id,
  containerName: containerInfo.container_name,   // <-- add
};
```

The DB column already exists (`createContainer` writes it at line 568).
This unblocks the proxy fix (Bug A).

**(d) Disconnect the gateway-connect-to-network block (now unused).**

Remove the `try { fs.readFile('/etc/hostname') ... }` block entirely.
It's a workaround for the abandoned per-user-network model.

### 3.2 `server/middleware/proxy.js`

**(a) Fix container detection.**

Instead of `process.env.HOSTNAME`, set an explicit env var in the
gateway Dockerfile (`ENV IN_CONTAINER=1`) and check that:

```js
const isGatewayContainer = process.env.IN_CONTAINER === '1';
```

Alternative: check for `/.dockerenv` or `/run/.containerenv` at module
load. Either is fine; the env-var approach is cheaper and more explicit.

**(b) Always prefer container-name addressing in container, fall back
to localhost only when running on host.**

```js
const targetHost = isGatewayContainer
  ? containerInfo.containerName              // works on shared network
  : 'localhost';
const targetPort = containerInfo.internalPort;
```

With Bug A fixed (containerName now populated) and the shared-network
topology in place, this resolves cleanly.

**(c) Apply the same to `setupWebSocketProxy`.**

### 3.3 `server/middleware/auth.js`

**Remove the `TRUST_INTERNAL_NETWORK` bypass entirely** (lines 54-67 and
148-162). It was a debugging shortcut and breaks multi-user routing
(Bug D).

The remaining auth paths are:

1. **Worker-trust path** (`USER_ID` env var present + `X-CloudCLI-User-ID`
   header) — this is the correct path for worker containers and it
   already exists.
2. **Platform mode** (`IS_PLATFORM`) — single-user collapse for
   single-tenant deployments. Keep as-is.
3. **Normal JWT validation** — used by browser → gateway. Keep as-is.

If you genuinely want JWT-less internal traffic, the worker-trust path
is already that — it's selected automatically inside workers. No bypass
flag is needed.

### 3.4 `server/container/runtime-detector.js`

The detector already supports rootful Podman at `/run/podman/podman.sock`.
The fix is just to use it correctly:

- **Don't** set `CONTAINER_RUNTIME=docker` in the gateway env. Let
  detection run.
- **Don't** set `DOCKER_HOST`. Mount the rootful Podman socket at the
  detector's expected path (`/var/run/docker.sock` is fine — it's
  one of the docker locations and rootful Podman provides a
  Docker-compatible API there if installed via the `podman-docker`
  shim, or you can mount it at `/run/podman/podman.sock` and let the
  Podman branch hit).

Cleanest:

```
-v /run/podman/podman.sock:/run/podman/podman.sock
```

…and unset `DOCKER_HOST`/`CONTAINER_RUNTIME`. The detector will find
the socket, identify it as rootful Podman, and `isRootless()` returns
false correctly.

### 3.5 `Dockerfile` (gateway)

Two small changes:

```dockerfile
# Add an explicit container-mode marker for proxy.js detection
ENV IN_CONTAINER=1

# Run as root so the gateway can talk to the rootful Podman socket
# (or at least so it can be in a group with access to it). Removing
# the USER directive makes it run as root by default.
# USER node    <-- delete this line
```

If you'd rather keep a non-root user, add the user to a `podman` group
with read/write on the socket and grant that explicitly. For now,
`--user root` is the simplest path you accepted.

### 3.6 `docker/worker/Dockerfile`

Stop building the client in workers:

```dockerfile
# Replace:
RUN npm run build && chown -R agent:agent /opt/cloudcli
# With:
RUN npm run build:server && chown -R agent:agent /opt/cloudcli
```

Workers only need `dist-server/`. This shaves build time and image size.

### 3.7 Compose / runbook

Replace the multi-network setup with a single shared network. Example
`podman-compose.yml` skeleton:

```yaml
version: '3.8'

services:
  gateway:
    build: { context: ., dockerfile: Dockerfile }
    user: root
    ports: ["3001:3001"]
    volumes:
      - /run/podman/podman.sock:/run/podman/podman.sock
      - gateway-data:/data
    env_file: ./gateway.env
    networks: [cloudcli-workers]
    restart: unless-stopped

networks:
  cloudcli-workers:
    name: cloudcli-workers
    driver: bridge

volumes:
  gateway-data:
    name: cloudcli-gateway-data
```

`gateway.env` (committed *template*, real values stay out of git):

```
JWT_SECRET=<256-bit hex>
ENCRYPTION_MASTER_KEY=<256-bit hex>
MULTI_USER_MODE=true
CONTAINER_BASE_IMAGE=cloudcliai/worker:latest
CONTAINER_PORT_START=4001
CONTAINER_PORT_END=5000
WORKER_NETWORK=cloudcli-workers
SERVER_PORT=3001
HOST=0.0.0.0
DATABASE_PATH=/data/auth.db
```

Note **what's no longer here**: `TRUST_INTERNAL_NETWORK`, `DOCKER_HOST`,
`CONTAINER_RUNTIME`, `CONTAINER_MEMORY_LIMIT=""`,
`CONTAINER_CPU_LIMIT=""`. They were workarounds for the bugs above.

---

## 4. Data permanence

Two storage layers, both already designed for permanence — this just
makes the contract explicit.

### Gateway state — host bind or named volume

Choose one:

- **Bind mount** (recommended for ops visibility):
  `./data/gateway:/data` — `auth.db` is on the host filesystem, easy to
  back up with `cp` or `restic`.
- **Named volume**: `cloudcli-gateway-data:/data` — managed by Podman,
  inspect with `podman volume inspect`.

`auth.db` contains: users, hashed passwords, encrypted credentials,
container records, JWT secret (if not provided via env). Surviving
container removal is mandatory.

### Per-user state — named volume per user

`cloudcli-data-user-N` mounted at `/home/agent`. The current code
already creates these in `createUserVolume`. Important properties:

- `removeUserContainer` already does **not** remove the volume
  (`manager.js:771-772` comment). Good — keep it that way.
- Add an explicit "delete user data" admin operation that removes
  both the container and the volume. Document that this is destructive.

### Backup story

Document for operators:

```bash
# Backup gateway DB and all user volumes
podman volume export cloudcli-gateway-data > backups/gateway-$(date +%F).tar
for v in $(podman volume ls -q | grep cloudcli-data-user-); do
  podman volume export "$v" > "backups/${v}-$(date +%F).tar"
done
```

(Or use the bind-mount path directly with `tar`/`rsync` if you went
that route for the gateway.)

---

## 5. Order of execution

A safe sequence to apply this without breaking the running deployment:

1. **Persist secrets first.** Generate `JWT_SECRET` and
   `ENCRYPTION_MASTER_KEY`, write them to `gateway.env`. This stops the
   "lose tokens on every restart" loop (Bug E) before changing anything
   else.
2. **Fix Bug A** (return `containerName` from `ensureRunning`,
   correct the `IN_CONTAINER` detection). Rebuild gateway. Verify HTTP
   and WebSocket reach the worker via container name on the *current*
   per-user network.
3. **Switch to shared network.** Create `cloudcli-workers`, change
   `createUserContainer` to use it, attach the gateway to it. Stop
   creating per-user networks. Tear down old per-user networks at your
   leisure (`podman network rm cloudcli-net-user-*`).
4. **Switch socket to rootful Podman**, remove `DOCKER_HOST` /
   `CONTAINER_RUNTIME=docker` overrides, restart gateway as
   `--user root`. Confirm `isRootless()` reports false in logs.
5. **Re-enable resource limits.** With rootful Podman this should now
   succeed without cgroup errors.
6. **Remove `TRUST_INTERNAL_NETWORK` bypass.** Real auth resumes.
7. **Trim worker image** to `build:server`. Rebuild worker. Push.

Each step is independently reversible until step 6.

---

## 6. What the troubleshooting doc had right vs wrong

Right:
- Native module rebuild after `npm prune --production` (Issue #1).
- Building both client and server in the gateway (Issue #2).
- Worker entrypoint must run the built server, not `tsx` (Issue #6).
- The diagnosis in Issue #8 ("network isolation between gateway and
  worker") was correctly identified at the architectural level.

Wrong:
- Issue #3's fix (force `CONTAINER_RUNTIME=docker`) papered over the
  rootless-detection problem instead of fixing it. With proper rootful
  Podman + correct socket mount, detection works.
- Issue #4's final solution (remove all resource limits unconditionally)
  is too broad — only needed in rootless.
- Issue #7's fix (`TRUST_INTERNAL_NETWORK`) is a correctness regression,
  not a fix. The underlying JWT-rotation problem (Bug E) is what should
  have been addressed.
- Issue #8's fix (dynamic per-user network joining + container-name
  addressing) is architecturally heavier than necessary, and the code
  as written has a critical typo (Bug A) that prevents it from ever
  working.

---

## 7. Open questions / follow-ups (non-blocking)

- **Worker-to-worker isolation on shared network.** If your threat
  model assumes hostile users, add a Podman network policy or `iptables`
  rules on the bridge to block worker→worker traffic while allowing
  gateway→worker. The auth layer makes worker→worker requests
  impossible to abuse from the application side (workers don't trust
  arbitrary callers) but defense-in-depth is cheap here.
- **Health checks during proxy routing.** The current `waitForHealthy`
  only checks `State.Running`. A real HTTP health probe to
  `http://<containerName>:<port>/api/health` before reporting "ready"
  would catch the production-vs-dev-mode regression earlier (the kind
  of thing Issue #6 was).
- **Container teardown on user delete.** Add an admin endpoint that
  removes container + volume + network membership atomically.
- **Observability.** Structured logs from the gateway proxy with
  `userId` + `target` would have made Bug A obvious in two minutes.
