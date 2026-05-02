---
name: netswitch
version: 1.0.0
description: Secure SSH access to network switches for read-only show commands
authors:
  - tucker28
tags:
  - network
  - switch
  - ssh
  - cisco
  - show
command: ./netswitch_wrapper.sh
args: []
env:
  - NETSWITCH_PASSWORD
  - NETSWITCH_USERNAME
  - NETSWITCH_ENABLE_PASSWORD
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
./netswitch [command]
```

**Option 2: Use full path**
```bash
<SKILL_BASE_DIR>/netswitch [command]
```

**Example:**
If you see "Base directory for this skill: /opt/skills/netswitch"
Then use:
```bash
cd /opt/skills/netswitch && ./netswitch show switch1 "show version"
```

**Do NOT hardcode paths like `/space/tucker28/...` - the skill may be installed elsewhere!**

# Network Switch SSH Tool

Secure SSH interface for executing read-only "show" commands on network switches.

## Security Features

This tool implements multiple layers of security to ensure ONLY read-only "show" commands can be executed:

1. **Command Whitelist**: Only commands starting with "show" or "display" are allowed
2. **Injection Prevention**: Blocks command chaining (;, &&, ||), pipes (|), redirects (>, <)
3. **Shell Escape Prevention**: Blocks shell escapes (!bash, ``, $())
4. **Configuration Protection**: Blocks config mode commands (configure, write, copy, reload)
5. **Input Validation**: All commands are validated before execution
6. **No Privilege Escalation**: Enable mode is only used for show commands, never for config

## Available Commands

### show
Execute a single show command on a network switch.

**Usage:** `show HOSTNAME COMMAND [options]`

**Parameters:**
- `HOSTNAME`: Switch hostname or IP address
- `COMMAND`: Show command to execute (must start with "show" or "display")

**Options:**
- `--username, -u`: SSH username (or set NETSWITCH_USERNAME env var)
- `--port, -p`: SSH port (default: 22)
- `--timeout, -t`: Connection timeout in seconds (default: 30)
- `--json, -j`: Output in JSON format

**Examples:**
- Basic command: `show 192.168.1.1 "show version"`
- With username: `show 192.168.1.1 "show interfaces" --username admin`
- JSON output: `show 192.168.1.1 "show ip interface brief" --json`

### show-multiple
Execute multiple show commands in a single session.

**Usage:** `show-multiple HOSTNAME [COMMANDS...] [options]`

**Parameters:**
- `HOSTNAME`: Switch hostname or IP address
- `COMMANDS`: One or more show commands (if not using --file)

**Options:**
- `--file, -f`: Read commands from file (one command per line, # for comments)
- `--username, -u`: SSH username
- `--port, -p`: SSH port (default: 22)
- `--timeout, -t`: Connection timeout in seconds (default: 30)
- `--json, -j`: Output in JSON format

**Examples:**
- Multiple commands: `show-multiple 192.168.1.1 "show version" "show interfaces" "show ip route"`
- From file: `show-multiple 192.168.1.1 --file commands.txt`
- JSON output: `show-multiple 192.168.1.1 --file commands.txt --json`

### validate
Validate command(s) without executing them. Useful for testing command syntax.

**Usage:** `validate COMMAND [options]`

**Options:**
- `--file, -f`: Read commands from file to validate
- `--json, -j`: Output in JSON format

**Examples:**
- Single command: `validate "show version"`
- From file: `validate --file commands.txt`
- JSON output: `validate "show interfaces" --json`

## Configuration

### Secure Credential Storage (Recommended)

Create a credentials file at `~/.netswitch_credentials` with mode 600:

```bash
# Create the credentials file
cat > ~/.netswitch_credentials << 'EOF'
export NETSWITCH_PASSWORD='your-ssh-password'
export NETSWITCH_USERNAME='admin'
export NETSWITCH_ENABLE_PASSWORD='your-enable-password'
EOF

# Set secure permissions (REQUIRED)
chmod 600 ~/.netswitch_credentials
```

The wrapper script will automatically source this file and validate permissions.

### Alternative: Environment Variables

You can also set these in your shell environment:

**NETSWITCH_PASSWORD** - SSH password (REQUIRED)
```bash
export NETSWITCH_PASSWORD=your-ssh-password
```

**NETSWITCH_USERNAME** - Default SSH username
```bash
export NETSWITCH_USERNAME=admin
```

**NETSWITCH_ENABLE_PASSWORD** - Enable/privileged mode password
```bash
export NETSWITCH_ENABLE_PASSWORD=your-enable-password
```

**Note:** When using Claude Code, the credentials file approach is required since Claude Code runs in an isolated environment.

## Command File Format

When using `--file` option, create a text file with one command per line:

```
# This is a comment
show version
show interfaces status
show ip interface brief
show vlan brief

# Another comment
show running-config interface
```

## Supported Vendors

This tool is designed to work with most network switch vendors that use SSH, including:
- Cisco IOS/IOS-XE
- Cisco NX-OS
- Arista EOS
- Juniper Junos (use "show" commands, not "display")
- HP/Aruba
- Huawei

## Security Notes

1. **Passwords**: Always set passwords as environment variables, NEVER store them in files
2. **Read-Only**: This tool CANNOT make configuration changes by design
3. **Command Validation**: All commands are validated before execution
4. **No Bypasses**: There is no way to execute non-show commands

## Error Handling

The tool provides clear error messages for:
- **SecurityViolation**: Command violates security policy
- **AuthenticationError**: Login credentials are incorrect
- **ConnectionError**: Cannot connect to switch
- **TimeoutError**: Command execution timed out

## Exit Codes

- `0`: Success
- `1`: Error (command failed, validation failed, or security violation)
- `130`: Interrupted by user (Ctrl+C)

## Examples for Claude Code

When using this skill in Claude Code, you can:

1. **Check switch version**: `show 10.1.1.1 "show version"`
2. **View interface status**: `show 10.1.1.1 "show interfaces status"`
3. **Get routing table**: `show 10.1.1.1 "show ip route"`
4. **Multiple queries**: `show-multiple 10.1.1.1 "show version" "show interfaces" "show ip route"`
5. **Validate before running**: `validate "show vlan brief"`

## Important: How to Invoke This Skill

**CRITICAL:** Due to output capture issues with the Skill tool, use the Bash tool to invoke this skill directly.

### Correct Invocation Format

When the Skill tool loads this skill, you'll see:
```
Base directory for this skill: <SKILL_BASE_DIR>
```

Use that exact path with the Bash tool:

```bash
cd <SKILL_BASE_DIR> && ./netswitch show <HOSTNAME> "show <command>"
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
| "What OS version is running on switch1?" | `cd <SKILL_BASE_DIR> && ./netswitch show switch1 "show version"` |
| "Check interfaces on 10.1.1.1" | `cd <SKILL_BASE_DIR> && ./netswitch show 10.1.1.1 "show interfaces"` |
| "Get IP routing table from core-sw1" | `cd <SKILL_BASE_DIR> && ./netswitch show core-sw1 "show ip route"` |
| "Show VLAN config on switch2" | `cd <SKILL_BASE_DIR> && ./netswitch show switch2 "show vlan brief"` |

### Common Mistakes to Avoid

❌ **WRONG:** Using natural language: `Skill(netswitch, args: "what os version is running on switch1")`
❌ **WRONG:** Using Skill tool at all (output not captured)
❌ **WRONG:** Hardcoding paths: `cd /space/tucker28/code/python/... && ./netswitch`
✅ **CORRECT:** Use base directory from Skill tool output: `cd <SKILL_BASE_DIR> && ./netswitch show switch1 "show version"`

### Pattern for Different User Queries

- **"What version..."** → `show <hostname> "show version"`
- **"Check interfaces..."** → `show <hostname> "show interfaces [details]"`
- **"Get routing table..."** → `show <hostname> "show ip route"`
- **"Show VLANs..."** → `show <hostname> "show vlan brief"`
- **"Check interface status..."** → `show <hostname> "show interfaces status"`
- **"Get running config..."** → `show <hostname> "show running-config"`

### Multiple Commands

For multiple queries about the same switch:
```
Skill(netswitch, args: 'show-multiple switch1 "show version" "show interfaces" "show ip route"')
```

## 🚨 PORT INVESTIGATION PROTOCOL - MANDATORY 🚨

**CRITICAL: When answering ANY question about port configuration, ALWAYS follow this protocol:**

### Required Steps for Port Questions

For ANY query about:
- Port VLAN assignment ("which VLAN is port X on?")
- Port mode (trunk vs access)
- Port configuration
- Port status/state

**YOU MUST execute commands in this order:**

#### Step 1: Get Running Configuration FIRST (Source of Truth)
```bash
./netswitch show <hostname> "show running-config interface <interface>"
```

This shows the **intended configuration** - what the administrator configured.

#### Step 2: Get Operational Status SECOND
```bash
./netswitch show <hostname> "show interfaces <interface> status"
```

This shows the **current operational state** - what's actually happening right now.

#### Step 3: Cross-Validate and Interpret

**CRITICAL Cisco IOS Behavior:**
- ✅ **Running-config shows "switchport mode trunk"** → Port IS configured as a trunk
- ⚠️ **Status shows VLAN number (e.g., "1") but config shows trunk** → Port is DOWN (trunk shows native VLAN when down)
- ⚠️ **Status shows "trunk" but config shows access mode** → DTP auto-negotiated (investigate further)
- ✅ **Both show same mode** → Port is operating as configured

### Why This Matters

**Common mistake that MUST be avoided:**
```
User: "Which VLAN is port 17 on?"
❌ WRONG: Check only "show interfaces status" → See VLAN 1 → Answer "VLAN 1"
✅ CORRECT: Check running-config FIRST → See "switchport mode trunk" → Answer "It's a trunk port carrying VLANs X,Y,Z (currently down, showing native VLAN 1)"
```

### Real-World Example (This Exact Mistake)

**Scenario:** User asks "which VLAN is port Gi2/0/17 on?"

**What happened:**
1. ❌ Checked `show interfaces status` only
2. ❌ Saw "VLAN: 1" in output
3. ❌ Concluded: "Port is on VLAN 1, it's an access port"

**What should have happened:**
1. ✅ Checked `show running-config interface Gi2/0/17` FIRST
2. ✅ Saw "switchport mode trunk" and "switchport trunk allowed vlan 95,671"
3. ✅ Concluded: "Port is configured as trunk carrying VLANs 95,671, currently down"

### Key Principle

> **Running-config = Truth. Status output = Current state (which can be misleading when port is down).**

**NEVER conclude port configuration from status output alone.** Always verify with running-config first.

### Additional Verification (Optional)

For complex scenarios, also check:
```bash
./netswitch show <hostname> "show interfaces <interface> switchport"
```

This provides detailed switchport information including:
- Administrative mode vs operational mode
- Native VLAN
- Allowed VLANs on trunk
- Trunking negotiation status

## Limitations

- SSH access only (no Telnet for security reasons)
- Read-only operations only
- Commands must start with "show" or "display"
- Cannot execute config mode commands
- Cannot chain multiple commands with separators

---

## Parsing Switch Output

⚠️ **CRITICAL:** Never use fixed column positions when parsing switch output. Variable-length fields (descriptions) will break position-based parsing.

### Before Writing a Parser

1. **Check for existing templates:** `./templates/` directory
   - `interface_parser.py` - Production-tested (99% success rate) for `show interfaces status`

2. **Read comprehensive guide:** `../../templates/PARSING_BEST_PRACTICES.md`
   - Anchor-based parsing methodology
   - The Gi2/0/4 bug case study (real production incident)
   - Validation strategies and test patterns
   - Alternative approaches (JSON, SNMP, TextFSM, NETCONF)

3. **Review templates documentation:** `./templates/README.md`

### Quick Principle

**Use anchor-based parsing:** Find known keywords first (like "connected", "notconnect"), then calculate positions relative to those anchors.

**Real-world failure:** A parser used hardcoded column ranges and silently excluded port Gi2/0/4 because its multi-word description "JB3 - CRYO TARPOS" shifted the VLAN column from index 4 to 6. This caused incorrect analysis showing "port never operational in 6 months" when it actually had 51 state-change events.

**The fix:** Anchor on the status keyword, work relative to that position. See full case study in PARSING_BEST_PRACTICES.md.

### Alternative to Text Parsing

When possible, use structured output:
- `show interfaces status | json` (Cisco IOS-XE/NX-OS)
- SNMP queries (IF-MIB)
- NETCONF/RESTCONF APIs
- TextFSM templates
