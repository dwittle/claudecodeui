# Network Switch SSH - Quick Start Guide

Get started with the Network Switch SSH tool in under 5 minutes.

## Prerequisites

- Python 3.7 or higher
- SSH access to network switches
- Switch credentials

## Installation (2 minutes)

### Automated Installation (Recommended)

```bash
cd netswitch
./install.sh ~/
cd ~/.claude/skills/netswitch
```

This creates a virtual environment and installs all dependencies automatically.

### Verify Installation

After installation, verify everything is working:

```bash
./check_install.sh
```

This runs comprehensive checks and security tests.

### Manual Installation

```bash
cd netswitch
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Verify installation
./check_install.sh
```

## Configuration (1 minute)

Set your SSH password as an environment variable:

```bash
export NETSWITCH_PASSWORD=your-ssh-password

# Optional: Set default username
export NETSWITCH_USERNAME=admin

# Optional: Set enable password
export NETSWITCH_ENABLE_PASSWORD=your-enable-password
```

**Important:** Never store passwords in files!

## Basic Usage (2 minutes)

### 1. Execute a Single Command

```bash
./netswitch_cli.py show 192.168.1.1 "show version"
```

### 2. Execute Multiple Commands

```bash
./netswitch_cli.py show-multiple 192.168.1.1 \
    "show version" \
    "show interfaces" \
    "show ip route"
```

### 3. Use a Command File

Create a file `my_commands.txt`:
```
show version
show interfaces status
show ip interface brief
```

Run it:
```bash
./netswitch_cli.py show-multiple 192.168.1.1 --file my_commands.txt
```

### 4. Validate Commands

Test commands before executing:
```bash
./netswitch_cli.py validate "show version"
./netswitch_cli.py validate --file my_commands.txt
```

### 5. JSON Output

Get machine-readable output:
```bash
./netswitch_cli.py show 192.168.1.1 "show version" --json
```

## Security Validation

Run the security test suite:
```bash
./test_security.py
```

Expected output: `✓ All security tests passed!`

## Common Use Cases

### Check Device Status
```bash
./netswitch_cli.py show 192.168.1.1 "show version"
./netswitch_cli.py show 192.168.1.1 "show processes cpu"
./netswitch_cli.py show 192.168.1.1 "show memory statistics"
```

### Interface Troubleshooting
```bash
./netswitch_cli.py show 192.168.1.1 "show interfaces status"
./netswitch_cli.py show 192.168.1.1 "show interfaces counters errors"
./netswitch_cli.py show 192.168.1.1 "show ip interface brief"
```

### Network Topology
```bash
./netswitch_cli.py show 192.168.1.1 "show cdp neighbors detail"
./netswitch_cli.py show 192.168.1.1 "show lldp neighbors"
```

### Batch Information Gathering
```bash
# Use the included example_commands.txt
./netswitch_cli.py show-multiple 192.168.1.1 --file example_commands.txt
```

## Command-Line Options

```bash
# Specify username
./netswitch_cli.py show 192.168.1.1 "show version" --username admin

# Custom SSH port
./netswitch_cli.py show 192.168.1.1 "show version" --port 2222

# Increase timeout
./netswitch_cli.py show 192.168.1.1 "show version" --timeout 60

# JSON output
./netswitch_cli.py show 192.168.1.1 "show version" --json
```

## Security Features

This tool is secure by design:

✅ **Only "show" commands allowed** - Configuration changes blocked
✅ **Injection prevention** - Command chaining blocked
✅ **No shell escapes** - Can't break out to shell
✅ **Multi-layer validation** - Commands validated before execution
✅ **Read-only operations** - No config mode access

## Troubleshooting

### Skill Not Working

First, run the installation check:
```bash
./check_install.sh
```

If you see `ModuleNotFoundError: No module named 'paramiko'`:
```bash
# Install dependencies
.venv/bin/pip install -r requirements.txt
```

### Authentication Failed
```bash
# Check password is set
echo $NETSWITCH_PASSWORD

# Try with explicit username
./netswitch_cli.py show 192.168.1.1 "show version" --username admin
```

### Connection Timeout
```bash
# Increase timeout
./netswitch_cli.py show 192.168.1.1 "show version" --timeout 60

# Check connectivity
ping 192.168.1.1
```

### Command Validation Failed
```bash
# Use validate to check
./netswitch_cli.py validate "your-command"

# Ensure command starts with "show"
./netswitch_cli.py validate "show version"  # ✓ Valid
./netswitch_cli.py validate "config t"      # ✗ Invalid
```

## Next Steps

- Read [README.md](README.md) for comprehensive documentation
- Check [docs/SECURITY.md](docs/SECURITY.md) for security details
- Review [example_commands.txt](example_commands.txt) for command ideas
- Run `./test_security.py` to verify security controls

## Getting Help

```bash
# Show help for all commands
./netswitch_cli.py --help

# Show help for specific command
./netswitch_cli.py show --help
./netswitch_cli.py show-multiple --help
./netswitch_cli.py validate --help
```

## Integration with Claude Code

When using as a Claude Code skill, reference it with:
```
@netswitch show 192.168.1.1 "show version"
```

## Summary

- **Install**: `./install.sh ~/`
- **Configure**: `export NETSWITCH_PASSWORD=password`
- **Run**: `./netswitch_cli.py show <host> "show version"`
- **Validate**: `./netswitch_cli.py validate "command"`
- **Test Security**: `./test_security.py`

That's it! You're ready to securely query network switches.
