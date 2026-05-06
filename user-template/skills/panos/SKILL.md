---
name: panos
version: 1.0.1
description: Secure SSH access to PAN-OS firewalls for read-only operational commands
authors:
  - tucker28
tags:
  - network
  - firewall
  - panos
  - palo-alto
  - ssh
  - security
command: ./panos
args: []
env:
  - PANOS_PASSWORD
  - PANOS_USERNAME
  - PANOS_BASTION_HOST
---

## IMPORTANT - For Claude Code

**When this skill is invoked via the Skill tool, you will see:**
```
Base directory for this skill: <SKILL_BASE_DIR>
```

**ALWAYS use that base directory path! Do not hardcode paths.**

**To invoke this skill's commands:**

**Option 1: Use the base directory provided (RECOMMENDED)**
```bash
cd <SKILL_BASE_DIR>
./panos [command]
```

**Option 2: Use full path**
```bash
<SKILL_BASE_DIR>/panos [command]
```

**Example:**
If you see "Base directory for this skill: /opt/skills/panos"
Then use:
```bash
cd /opt/skills/panos && ./panos show fw1 "show system info"
```

**Do NOT hardcode paths like `/space/tucker28/...` - the skill may be installed elsewhere!**

# PAN-OS Firewall SSH Tool

Secure SSH interface for executing read-only operational commands on PAN-OS firewalls.

## Security Features

This tool implements multiple layers of security to ensure ONLY read-only operational commands can be executed:

1. **Command Whitelist**: Only commands starting with "show", "test", "debug", or safe "request" commands
2. **Request Command Restrictions**: Only safe request commands allowed (no restart, reboot, shutdown, commit)
3. **Configuration Protection**: Blocks config mode commands (configure, set, delete, commit)
4. **Injection Prevention**: Blocks command chaining (;, &&, ||), pipes (|), redirects (>, <)
5. **Shell Escape Prevention**: Blocks shell escapes (!bash, ``, $())
6. **Input Validation**: All commands are validated before execution

## Available Commands

### show
Execute a single operational command on a PAN-OS firewall.

**Usage:** `show HOSTNAME COMMAND [options]`

**Parameters:**
- `HOSTNAME`: Firewall hostname or IP address
- `COMMAND`: Operational command to execute (show, test, debug, or safe request)

**Options:**
- `--username, -u`: SSH username (or set PANOS_USERNAME env var)
- `--port, -p`: SSH port (default: 22)
- `--timeout, -t`: Connection timeout in seconds (default: 30)
- `--json, -j`: Output in JSON format

**Examples:**
- System info: `show 192.168.1.1 "show system info"`
- Interface status: `show 192.168.1.1 "show interface all"`
- Routing table: `show 10.1.1.1 "show routing route"`
- Security policies: `show 10.1.1.1 "show running security-policy"`
- Active sessions: `show 10.1.1.1 "show session all"`
- JSON output: `show 10.1.1.1 "show system info" --json`

### show-multiple
Execute multiple operational commands in a single session.

**Usage:** `show-multiple HOSTNAME [COMMANDS...] [options]`

**Parameters:**
- `HOSTNAME`: Firewall hostname or IP address
- `COMMANDS`: One or more operational commands (if not using --file)

**Options:**
- `--file, -f`: Read commands from file (one command per line, # for comments)
- `--username, -u`: SSH username
- `--port, -p`: SSH port (default: 22)
- `--timeout, -t`: Connection timeout in seconds (default: 30)
- `--json, -j`: Output in JSON format

**Examples:**
- Multiple commands: `show-multiple 10.1.1.1 "show system info" "show interface all" "show routing route"`
- From file: `show-multiple 10.1.1.1 --file commands.txt`
- JSON output: `show-multiple 10.1.1.1 --file commands.txt --json`

### validate
Validate command(s) without executing them. Useful for testing command syntax and security policies.

**Usage:** `validate COMMAND [options]`

**Options:**
- `--file, -f`: Read commands from file to validate
- `--json, -j`: Output in JSON format

**Examples:**
- Single command: `validate "show system info"`
- From file: `validate --file commands.txt`
- JSON output: `validate "show interface all" --json`

## Firewall Inventory

### Current Firewall Pairs

The following firewall HA pairs are currently deployed:

| Primary | Secondary | Purpose |
|---------|-----------|---------|
| ngfw1-1 | ngfw1-2 | Firewall Pair 1 |
| ngfw2-1 | ngfw2-2 | Firewall Pair 2 |
| ngfw3-1 | ngfw3-2 | Firewall Pair 3 |
| ngfw4-1 | ngfw4-2 | Firewall Pair 4 |
| ngfw5-1 | ngfw5-2 | Firewall Pair 5 |
| ngfw6-1 | ngfw6-2 | Firewall Pair 6 |

**Example usage:**
```bash
# Check primary firewall
./panos show ngfw1-1 "show system info"

# Check secondary firewall
./panos show ngfw1-2 "show high-availability all"

# Check multiple pairs
./panos show-multiple ngfw1-1 "show system info" "show high-availability all"
```

## Configuration

### Secure Credential Storage (Recommended)

Create a credentials file at `~/.panos_credentials` with mode 600:

```bash
# Create the credentials file
cat > ~/.panos_credentials << 'EOF'
export PANOS_PASSWORD='your-panos-password'
export PANOS_USERNAME='admin'

# Optional: Bastion/jump host for SSH tunneling (default: netprod0001)
# export PANOS_BASTION_HOST='netprod0001'
EOF

# Set secure permissions (REQUIRED)
chmod 600 ~/.panos_credentials
```

The wrapper script will automatically source this file and validate permissions.

**Bastion Host:** By default, connections tunnel through `netprod0001` bastion host. This can be overridden with the `--bastion-host` option or by setting `PANOS_BASTION_HOST` in your credentials file.

### Alternative: Environment Variables

You can also set these in your shell environment:

**PANOS_PASSWORD** - SSH password (REQUIRED)
```bash
export PANOS_PASSWORD=your-panos-password
```

**PANOS_USERNAME** - Default SSH username
```bash
export PANOS_USERNAME=admin
```

**Note:** When using Claude Code, the credentials file approach is required since Claude Code runs in an isolated environment.

## Command File Format

When using `--file` option, create a text file with one command per line:

```
# System information
show system info
show system state

# Network interfaces
show interface all
show interface management

# Routing
show routing route
show routing protocol bgp summary

# Security
show running security-policy
show session all filter destination 10.1.1.1

# High availability
show high-availability all
```

## Allowed Command Types

### 1. Show Commands (All allowed)
All PAN-OS show commands are allowed:
- `show system info` - System information
- `show interface all` - Interface status
- `show routing route` - Routing table
- `show session all` - Active sessions
- `show running security-policy` - Security policies
- `show high-availability all` - HA status
- `show jobs all` - Running jobs
- `show log system` - System logs
- And many more...

### 2. Test Commands (All allowed)
Testing and diagnostic commands:
- `test routing fib-lookup` - Test routing lookup
- `test security-policy-match` - Test policy matching
- `test nat-policy-match` - Test NAT policy matching
- `test vpn ipsec-sa` - Test IPsec SA

### 3. Debug Commands (Read-only allowed)
Read-only debug commands:
- `debug dataplane pool statistics` - Dataplane statistics
- `debug software disk-usage` - Disk usage info

### 4. Request Commands (Safe ones only - WHITELIST)
Only these request commands are allowed:
- `request system software check` - Check for software updates
- `request system software info` - Software version info
- `request support info` - Generate support info
- `request tech-support` - Generate tech support file
- `request system info` - System information
- `request license info` - License information
- `request high-availability state` - HA state
- `request session info` - Session information
- `request stats` - Various statistics

**BLOCKED request commands** (for safety):
- `request restart` - Restart services/firewall
- `request reboot` - Reboot firewall
- `request shutdown` - Shutdown firewall
- `request system private-data-reset` - Reset data
- `request commit` - Commit changes

## Security Notes

1. **Read-Only**: This tool CANNOT make configuration changes by design
2. **No Config Mode**: Cannot enter configuration mode
3. **No Commits**: Cannot commit changes
4. **No Restarts**: Cannot restart, reboot, or shutdown the firewall
5. **Command Validation**: All commands are validated before execution
6. **No Bypasses**: There is no way to execute blocked commands

## Error Handling

The tool provides clear error messages for:
- **SecurityViolation**: Command violates security policy
- **AuthenticationError**: Login credentials are incorrect
- **ConnectionError**: Cannot connect to firewall
- **TimeoutError**: Command execution timed out

## Exit Codes

- `0`: Success
- `1`: Error (command failed, validation failed, or security violation)
- `130`: Interrupted by user (Ctrl+C)

## Examples for Claude Code

When using this skill in Claude Code, you can:

1. **Check firewall system info**: `show 10.1.1.1 "show system info"`
2. **View interface status**: `show 10.1.1.1 "show interface all"`
3. **Check routing table**: `show 10.1.1.1 "show routing route"`
4. **View active sessions**: `show 10.1.1.1 "show session all"`
5. **Test security policy**: `show 10.1.1.1 "test security-policy-match"`
6. **Multiple queries**: `show-multiple 10.1.1.1 "show system info" "show interface all" "show routing route"`
7. **Validate before running**: `validate "show system info"`

## Important: How to Invoke This Skill

**CRITICAL:** Due to output capture issues with the Skill tool, use the Bash tool to invoke this skill directly.

### Correct Invocation Format

When the Skill tool loads this skill, you'll see:
```
Base directory for this skill: <SKILL_BASE_DIR>
```

Use that exact path with the Bash tool:

```bash
cd <SKILL_BASE_DIR> && ./panos show <HOSTNAME> "<command>"
```

**DO NOT use the Skill tool** - it loads successfully but does not capture subprocess output.

**DO NOT hardcode paths** - always use the base directory shown in the Skill tool output.

### Translating User Requests to Commands

**First, note the base directory shown when the skill loads:**
```
Base directory for this skill: <SKILL_BASE_DIR>
```

**Then translate user requests:**

| User Request | Correct Bash Command |
|-------------|------------------------|
| "What PAN-OS version is running on fw1?" | `cd <SKILL_BASE_DIR> && ./panos show fw1 "show system info"` |
| "Check interfaces on 10.1.1.1" | `cd <SKILL_BASE_DIR> && ./panos show 10.1.1.1 "show interface all"` |
| "Get routing table from firewall1" | `cd <SKILL_BASE_DIR> && ./panos show firewall1 "show routing route"` |
| "Show active sessions on fw2" | `cd <SKILL_BASE_DIR> && ./panos show fw2 "show session all"` |
| "Test security policy match" | `cd <SKILL_BASE_DIR> && ./panos show fw1 "test security-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8 protocol 6 destination-port 443"` |

### Common Mistakes to Avoid

❌ **WRONG:** Using natural language: `Skill(panos, args: "what os version is running on fw1")`
❌ **WRONG:** Using Skill tool at all (output not captured)
❌ **WRONG:** Hardcoding paths: `cd /space/tucker28/code/python/... && ./panos`
✅ **CORRECT:** Use base directory from Skill tool output: `cd <SKILL_BASE_DIR> && ./panos show fw1 "show system info"`

### Pattern for Different User Queries

- **"What version..."** → `show <hostname> "show system info"`
- **"Check interfaces..."** → `show <hostname> "show interface all"`
- **"Get routing table..."** → `show <hostname> "show routing route"`
- **"Show sessions..."** → `show <hostname> "show session all"`
- **"Check HA status..."** → `show <hostname> "show high-availability all"`
- **"View security policies..."** → `show <hostname> "show running security-policy"`
- **"Test policy match..."** → `show <hostname> "test security-policy-match ..."`
- **"Check NAT..."** → `show <hostname> "test nat-policy-match ..."`

### Multiple Commands

For multiple queries about the same firewall:
```bash
cd <SKILL_BASE_DIR> && ./panos show-multiple fw1 "show system info" "show interface all" "show routing route"
```

(Replace `<SKILL_BASE_DIR>` with the base directory shown when the skill is loaded)

## Common PAN-OS Commands Reference

### System Information
```
show system info                    # System info, version, serial
show system state                   # System state
show system resources               # CPU, memory usage
show system disk-space              # Disk usage
```

### Interfaces
```
show interface all                  # All interfaces
show interface management          # Management interface
show interface <name>              # Specific interface
show counter interface all         # Interface counters
```

### Routing
```
show routing route                  # Routing table
show routing protocol bgp summary  # BGP summary
show routing protocol ospf neighbor # OSPF neighbors
show routing fib                   # Forwarding table
```

### Sessions
```
show session all                    # All sessions
show session all filter destination 10.1.1.1
show session info                   # Session stats
```

### Security
```
show running security-policy        # Security policies
show running nat-policy            # NAT policies
show zone all                      # Security zones
show address all                   # Address objects
```

### High Availability
```
show high-availability all         # HA status
show high-availability state       # HA state details
```

### VPN
```
show vpn flow                      # VPN flows
show vpn ipsec-sa                  # IPsec SAs
show vpn gateway                   # VPN gateways
```

### Testing/Diagnostics
```
test routing fib-lookup virtual-router default ip 8.8.8.8
test security-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8 protocol 6 destination-port 443
test nat-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8 protocol 6 destination-port 80
```

## Limitations

- SSH access only (no API access in this version)
- Read-only operations only
- Commands must start with "show", "test", "debug", or safe "request"
- Cannot execute configuration commands
- Cannot commit changes
- Cannot restart or reboot firewall
- Cannot chain multiple commands with separators

## Troubleshooting

### Authentication Fails
- Verify credentials in `~/.panos_credentials`
- Check username has SSH access enabled on firewall
- Verify firewall SSH service is enabled

### Connection Timeout
- Check network connectivity to firewall
- Verify SSH port (default 22)
- Increase timeout: `--timeout 60`

### Command Not Allowed
- Use `validate` command to check syntax
- Ensure command starts with allowed prefix
- Check if it's a safe request command

### Permission Issues
- Ensure credentials file has mode 600: `chmod 600 ~/.panos_credentials`
- Check SSH user has appropriate privileges on firewall
