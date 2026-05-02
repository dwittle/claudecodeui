# Network Switch SSH Tool

Secure SSH client for executing read-only "show" commands on network switches. Designed for safe automation with Claude Code and other tools.

## Features

- **Secure by Design**: Only read-only "show" commands allowed
- **Multi-Vendor Support**: Works with Cisco, Arista, Juniper, HP, Huawei, and more
- **Command Validation**: All commands validated before execution
- **Injection Prevention**: Blocks command chaining, pipes, redirects, and shell escapes
- **JSON Output**: Machine-readable output for automation
- **Batch Operations**: Execute multiple commands in a single session
- **Enable Mode Support**: Automatic privilege escalation when needed

## Security Features

This tool implements comprehensive security controls:

1. ✅ **Command Whitelist**: Only "show" and "display" commands permitted
2. ✅ **Injection Prevention**: Blocks `;`, `&&`, `||`, `|`, `>`, `<`, `` ` ``, `$()`
3. ✅ **Config Protection**: Blocks "configure", "write", "copy", "reload"
4. ✅ **Shell Escape Prevention**: Blocks `!bash` and similar escapes
5. ✅ **Input Validation**: Multi-layer validation before execution
6. ✅ **Read-Only Operations**: No configuration changes possible

## Installation

### Option 1: Automated Installation (Recommended)

```bash
cd netswitch
./install.sh ~/
cd ~/.claude/skills/netswitch
```

The install script will:
- Create a virtual environment
- Install all dependencies
- Run installation verification tests
- Show you setup instructions

### Option 2: Manual Installation

```bash
cd netswitch
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Verify Installation

After installation, run the check script to verify everything is working:

```bash
./check_install.sh
```

This will verify:
- Virtual environment is set up correctly
- Dependencies are installed
- CLI is executable
- Command validation works
- All 40 security tests pass

## Configuration

### Required Environment Variables

```bash
# SSH password (REQUIRED)
export NETSWITCH_PASSWORD=your-ssh-password
```

### Optional Environment Variables

```bash
# Default username (can be overridden with --username)
export NETSWITCH_USERNAME=admin

# Enable/privileged mode password (if needed)
export NETSWITCH_ENABLE_PASSWORD=your-enable-password
```

**IMPORTANT**: Never store passwords in files. Always use environment variables.

## Usage

### Basic Commands

Execute a single show command:
```bash
./netswitch_cli.py show 192.168.1.1 "show version"
./netswitch_cli.py show 192.168.1.1 "show interfaces status"
./netswitch_cli.py show 192.168.1.1 "show ip interface brief"
```

With custom username:
```bash
./netswitch_cli.py show 192.168.1.1 "show version" --username admin
```

JSON output:
```bash
./netswitch_cli.py show 192.168.1.1 "show version" --json
```

### Multiple Commands

Execute multiple commands in one session:
```bash
./netswitch_cli.py show-multiple 192.168.1.1 \
    "show version" \
    "show interfaces" \
    "show ip route"
```

From a command file:
```bash
./netswitch_cli.py show-multiple 192.168.1.1 --file commands.txt
```

### Command Validation

Validate commands without executing:
```bash
# Validate a single command
./netswitch_cli.py validate "show version"

# Validate multiple commands from file
./netswitch_cli.py validate --file commands.txt

# JSON output
./netswitch_cli.py validate "show version" --json
```

## Command File Format

Create a text file with one command per line:

```
# commands.txt
show version
show interfaces status
show ip interface brief
show vlan brief

# Comments start with #
show running-config interface
```

## Supported Vendors

- **Cisco**: IOS, IOS-XE, NX-OS, IOS-XR
- **Arista**: EOS
- **Juniper**: Junos (use "show" not "display" for compatibility)
- **HP/Aruba**: ProCurve, Aruba switches
- **Huawei**: VRP
- **Dell**: PowerConnect, OS9, OS10
- **And more**: Most SSH-capable network devices

## Examples

### Check Device Information

```bash
# Get device version and model
./netswitch_cli.py show 10.1.1.1 "show version"

# Check interface status
./netswitch_cli.py show 10.1.1.1 "show interfaces status"

# View IP addresses
./netswitch_cli.py show 10.1.1.1 "show ip interface brief"
```

### Troubleshooting

```bash
# Check for errors on interfaces
./netswitch_cli.py show 10.1.1.1 "show interfaces counters errors"

# View logging messages
./netswitch_cli.py show 10.1.1.1 "show logging"

# Check CDP/LLDP neighbors
./netswitch_cli.py show 10.1.1.1 "show cdp neighbors detail"
```

### Inventory Collection

```bash
# Collect comprehensive device info
./netswitch_cli.py show-multiple 10.1.1.1 \
    "show version" \
    "show inventory" \
    "show module" \
    "show serial-number"
```

### With Claude Code

When using this skill with Claude Code:

```
# In Claude Code conversation
@netswitch show 10.1.1.1 "show version"
@netswitch show-multiple 10.1.1.1 "show version" "show interfaces"
```

## Command-Line Options

### show command
```
./netswitch_cli.py show HOSTNAME COMMAND [options]

Positional Arguments:
  HOSTNAME              Switch hostname or IP address
  COMMAND               Show command to execute

Options:
  --username, -u USER   SSH username (or set NETSWITCH_USERNAME)
  --port, -p PORT       SSH port (default: 22)
  --timeout, -t SECS    Connection timeout (default: 30)
  --json, -j            Output in JSON format
```

### show-multiple command
```
./netswitch_cli.py show-multiple HOSTNAME [COMMANDS...] [options]

Positional Arguments:
  HOSTNAME              Switch hostname or IP address
  COMMANDS              Show commands to execute (if not using --file)

Options:
  --file, -f FILE       Read commands from file
  --username, -u USER   SSH username
  --port, -p PORT       SSH port (default: 22)
  --timeout, -t SECS    Connection timeout (default: 30)
  --json, -j            Output in JSON format
```

### validate command
```
./netswitch_cli.py validate COMMAND [options]

Positional Arguments:
  COMMAND               Command to validate

Options:
  --file, -f FILE       Read commands from file to validate
  --json, -j            Output in JSON format
```

## Security Validation Examples

```bash
# These commands will be BLOCKED:

# Command chaining
./netswitch_cli.py validate "show version; configure terminal"
# ✗ INVALID: Command contains forbidden pattern: ;

# Shell escape
./netswitch_cli.py validate "show version | grep cisco"
# ✗ INVALID: Command contains forbidden pattern: \|

# Config mode
./netswitch_cli.py validate "configure terminal"
# ✗ INVALID: Command must start with one of: show, display

# Output redirection
./netswitch_cli.py validate "show run > file.txt"
# ✗ INVALID: Command contains forbidden pattern: >

# These commands will be ALLOWED:

./netswitch_cli.py validate "show version"
# ✓ VALID: show version

./netswitch_cli.py validate "show running-config"
# ✓ VALID: show running-config

./netswitch_cli.py validate "show interfaces GigabitEthernet1/0/1"
# ✓ VALID: show interfaces GigabitEthernet1/0/1
```

## Error Handling

The tool provides detailed error messages:

- **SecurityViolation**: Command violates security policy (blocked command, injection attempt)
- **AuthenticationException**: Username or password is incorrect
- **SSHException**: SSH connection failed (network issue, wrong port, SSH disabled)
- **NetSwitchError**: General errors (timeout, device not responding)

## Exit Codes

- `0`: Success
- `1`: Error or security violation
- `130`: User interrupt (Ctrl+C)

## Troubleshooting

### Installation Issues

If the skill doesn't work, first run the installation check:

```bash
./check_install.sh
```

**ModuleNotFoundError: No module named 'paramiko':**
```bash
# Install dependencies in the virtual environment
.venv/bin/pip install -r requirements.txt

# Or reinstall everything
./install.sh ~/
```

**Virtual environment not found:**
```bash
# Create virtual environment
python3 -m venv .venv

# Install dependencies
.venv/bin/pip install -r requirements.txt
```

**Skill fails in Claude Code:**
```bash
# Ensure you're in the skill directory
cd ~/.claude/skills/netswitch  # or wherever you installed it

# Verify the venv has paramiko
.venv/bin/python3 -c "import paramiko; print('OK')"

# Run the installation check
./check_install.sh
```

### Authentication Failures

```bash
# Verify password is set
echo $NETSWITCH_PASSWORD

# Check username
./netswitch_cli.py show 10.1.1.1 "show version" --username correct-username

# Verify SSH is enabled on switch
ssh admin@10.1.1.1
```

### Connection Issues

```bash
# Check network connectivity
ping 10.1.1.1

# Try custom port
./netswitch_cli.py show 10.1.1.1 "show version" --port 2222

# Increase timeout
./netswitch_cli.py show 10.1.1.1 "show version" --timeout 60
```

### Command Validation Failures

```bash
# Use validate to check command before executing
./netswitch_cli.py validate "your-command"

# Ensure command starts with "show"
./netswitch_cli.py show 10.1.1.1 "show version"  # ✓ Valid

# Remove any command separators or special characters
./netswitch_cli.py show 10.1.1.1 "show version"  # ✓ Valid
./netswitch_cli.py show 10.1.1.1 "show version; show run"  # ✗ Invalid
```

## API Usage

You can also use the client library directly in Python:

```python
from netswitch_client import NetSwitchClient, SecurityViolation

# Connect and execute commands
with NetSwitchClient(
    hostname='192.168.1.1',
    username='admin',
    password='your-password',
    enable_password='your-enable-password'
) as client:
    # Single command
    output = client.execute_command('show version')
    print(output)

    # Multiple commands
    commands = ['show version', 'show interfaces', 'show ip route']
    results = client.execute_multiple_commands(commands)
    for cmd, output in results.items():
        print(f"\n{cmd}:\n{output}")

# Validate commands
client = NetSwitchClient('dummy', 'dummy', 'dummy')
try:
    client.validate_command('show version')
    print("Valid command")
except SecurityViolation as e:
    print(f"Invalid: {e}")
```

## Best Practices

1. **Use Environment Variables**: Never hardcode passwords
2. **Validate First**: Use `validate` command to test commands before execution
3. **Batch Operations**: Use `show-multiple` for efficiency
4. **Error Handling**: Check exit codes in scripts
5. **Timeouts**: Adjust timeout for slow devices or long commands
6. **JSON Output**: Use `--json` for parsing in automation scripts

## Limitations

- SSH only (no Telnet for security)
- Read-only operations only
- Commands must start with "show" or "display"
- No configuration mode access
- No command chaining or piping

## Requirements

- Python 3.7 or higher
- paramiko 3.0.0 or higher
- SSH access to network switches
- Network connectivity to target devices

## License

See LICENSE file for details.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Validate your commands with `validate` command
3. Verify environment variables are set correctly
4. Check SSH connectivity with standard SSH client

## Contributing

Contributions welcome! Please ensure:
- Security controls are maintained
- New features include validation tests
- Documentation is updated
- Code follows existing style
