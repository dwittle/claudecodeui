# Available Skills

This project includes three custom network management skills for Claude Code.

## /akips - AKiPS Network Monitoring

Query and monitor AKiPS network management systems.

**Usage:** `/akips` (then follow instructions to use commands)

**Key Commands:**
- `list-devices` - List devices with filtering
- `list-interfaces` - List network interfaces
- `get-device-info DEVICE` - Get detailed device information
- `get-top-interfaces N` - Get top N interfaces by traffic
- `get-events EVENT_TYPE TIME_FILTER` - Get events (critical, enum, threshold, uptime)
- `get-series-data INTERVAL TIME_FILTER ATTR_TYPE` - Get historical time-series data

**Examples:**
- List all devices: `list-devices`
- Get device info: `get-device-info router01`
- Check recent critical events: `get-events critical last24h`
- Get hourly data: `get-series-data 3600 yesterday counter`

**Important Notes:**
- When checking device status, ALWAYS check both events AND series data
- Time-series data is chronological - check the LAST values for current status
- Empty strings in RTT data indicate device is down
- See full documentation for determining current device up/down status

---

## /netswitch - Network Switch Access

Secure SSH access to network switches for read-only show commands.

**Usage:** `/netswitch` (then follow instructions to use commands)

**Key Commands:**
- `show HOSTNAME COMMAND` - Execute a single show command
- `show-multiple HOSTNAME [COMMANDS...]` - Execute multiple commands
- `validate COMMAND` - Validate command syntax

**Examples:**
- Check version: `show 192.168.1.1 "show version"`
- View interfaces: `show switch1 "show interfaces status"`
- Multiple commands: `show-multiple switch1 "show version" "show interfaces"`

**Security:**
- Only "show" and "display" commands allowed
- Blocks command chaining, pipes, redirects, and config mode
- Read-only operations only

**CRITICAL PORT INVESTIGATION PROTOCOL:**
When answering ANY question about port configuration:
1. ALWAYS check `show running-config interface` FIRST (source of truth)
2. Then check `show interfaces status` (operational state)
3. Cross-validate: running-config shows intent, status shows current state
4. Never conclude port configuration from status output alone

---

## /panos - PAN-OS Firewall Access

Secure SSH access to PAN-OS firewalls for read-only operational commands.

**Usage:** `/panos` (then follow instructions to use commands)

**Key Commands:**
- `show HOSTNAME COMMAND` - Execute a single operational command
- `show-multiple HOSTNAME [COMMANDS...]` - Execute multiple commands
- `validate COMMAND` - Validate command syntax

**Examples:**
- System info: `show ngfw1-1 "show system info"`
- Interface status: `show ngfw1-1 "show interface all"`
- Routing table: `show ngfw1-1 "show routing route"`
- Active sessions: `show ngfw1-1 "show session all"`
- HA status: `show ngfw1-1 "show high-availability all"`

**Allowed Commands:**
- All `show` commands
- All `test` commands (diagnostics)
- Read-only `debug` commands
- Safe `request` commands only (no restart/reboot/shutdown/commit)

**Security:**
- Read-only operations only
- Cannot enter config mode or commit changes
- Cannot restart/reboot firewall
- All commands validated before execution

**Current Firewall Pairs:**
- ngfw1-1 / ngfw1-2
- ngfw2-1 / ngfw2-2
- ngfw3-1 / ngfw3-2
- ngfw4-1 / ngfw4-2
- ngfw5-1 / ngfw5-2
- ngfw6-1 / ngfw6-2

---

## General Notes

All three skills:
- Use secure credential storage in home directory
- Require proper environment variables for authentication
- Support JSON output with `--json` flag
- Provide command validation before execution
- Include comprehensive error handling

For detailed documentation on any skill, see `user-template/skills/<skill-name>/SKILL.md`
