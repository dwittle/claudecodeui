# PAN-OS Skill for Claude Code

Secure SSH access to PAN-OS firewalls for read-only operational commands.

## Features

- ✅ **Read-only access** - Cannot make configuration changes
- ✅ **Multiple command types** - show, test, debug, safe request commands
- ✅ **Security focused** - Multiple layers of validation and command filtering
- ✅ **Easy to use** - Simple CLI interface
- ✅ **Environment variable support** - Configure via environment variables
- ✅ **Bastion/jump host support** - Connect through SSH tunnels
- ✅ **Claude Code integration** - Works seamlessly with Claude Code

## Quick Start

### 1. Installation

Run the setup script:
```bash
./setup.sh
```

This will:
- Create a Python virtual environment
- Install dependencies (paramiko)
- Create credentials template at `~/.panos_credentials`
- Set correct permissions

### 2. Configure Credentials

The tool supports configuration via environment variables. Edit `~/.panos_credentials`:
```bash
# Required
export PANOS_USERNAME='admin'
export PANOS_PASSWORD='your-password'

# Optional: Bastion/jump host
# export PANOS_BASTION_HOST='bastion.example.com'
# export NETSWITCH_USERNAME='bastion-user'
# export NETSWITCH_PASSWORD='bastion-password'
```

Ensure correct permissions:
```bash
chmod 600 ~/.panos_credentials
```

Then source it before using the tool:
```bash
source ~/.panos_credentials
```

**Supported Environment Variables:**
- `PANOS_USERNAME` - Firewall SSH username
- `PANOS_PASSWORD` - Firewall SSH password
- `PANOS_BASTION_HOST` - Optional bastion/jump host
- `NETSWITCH_USERNAME` - Bastion username (tried first)
- `NETSWITCH_PASSWORD` - Bastion password (tried first)
- `PANOS_BASTION_USERNAME` - Bastion username (fallback)
- `PANOS_BASTION_PASSWORD` - Bastion password (fallback)

See [docs/environment_variables.md](docs/environment_variables.md) for detailed configuration options.

### 3. Test It

Validate a command (doesn't connect):
```bash
./panos validate "show system info"
```

Execute on a firewall:
```bash
./panos show <firewall-ip> "show system info"
```

## Usage Examples

### System Information
```bash
./panos show 10.1.1.1 "show system info"
./panos show 10.1.1.1 "show system resources"
```

### Interfaces
```bash
./panos show 10.1.1.1 "show interface all"
./panos show 10.1.1.1 "show interface management"
```

### Routing
```bash
./panos show 10.1.1.1 "show routing route"
./panos show 10.1.1.1 "test routing fib-lookup virtual-router default ip 8.8.8.8"
```

### Security Policies
```bash
./panos show 10.1.1.1 "show running security-policy"
./panos show 10.1.1.1 "test security-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8 protocol 6 destination-port 443"
```

### Sessions
```bash
./panos show 10.1.1.1 "show session all"
./panos show 10.1.1.1 "show session all filter destination 10.1.1.1"
```

### Multiple Commands
```bash
./panos show-multiple 10.1.1.1 \
  "show system info" \
  "show interface all" \
  "show routing route"
```

### Commands from File
```bash
# Create command file
cat > commands.txt << 'EOF'
# System checks
show system info
show system resources
show system disk-space

# Network
show interface all
show routing route

# HA
show high-availability all
EOF

# Execute all commands
./panos show-multiple 10.1.1.1 --file commands.txt
```

## Allowed Commands

### ✅ Allowed
- `show` - All show commands
- `test` - Testing commands (routing, policy, NAT)
- `debug` - Read-only debug commands
- `request` - Safe request commands:
  - `request system software check/info`
  - `request support info`
  - `request tech-support`
  - `request system info`
  - `request license info`
  - `request high-availability state`

### ❌ Blocked
- Configuration: `configure`, `set`, `delete`, `commit`
- Destructive: `request restart`, `request reboot`, `request shutdown`
- Command chaining: `;`, `&&`, `||`, `|`
- Shell escapes: `!`, `` ` ``, `$()`

## Using with Claude Code

Claude Code automatically detects this skill. Use it like this:

**User:** "What PAN-OS version is running on fw1?"

**Claude will execute:**
```bash
cd /space/tucker28/code/python/skills/netswitch/.claude/skills/panos && \
  ./panos show fw1 "show system info"
```

See `CLAUDE.md` for full integration details.

## Troubleshooting

### Authentication Fails
- Check credentials in `~/.panos_credentials`
- Verify SSH is enabled on firewall
- Check username has SSH access

### Command Not Allowed
```bash
# Validate first
./panos validate "your command here"
```

### Connection Timeout
```bash
# Increase timeout
./panos show 10.1.1.1 "show system info" --timeout 60
```

### Permission Issues
```bash
# Fix credentials file permissions
chmod 600 ~/.panos_credentials
```

## Files

- `panos` - Main wrapper script (sources credentials)
- `panos_cli.py` - CLI implementation
- `panos_client.py` - SSH client library
- `SKILL.md` - Complete documentation
- `CLAUDE.md` - Claude Code integration guide
- `setup.sh` - Installation script
- `credentials.template` - Credentials template

## Security

This tool is designed with security as the top priority:

1. **Read-only by design** - Cannot make configuration changes
2. **Command validation** - All commands validated before execution
3. **Whitelist approach** - Only explicitly allowed commands
4. **Credential protection** - Credentials stored securely with mode 600
5. **No bypasses** - No way to circumvent security checks

## Documentation

- `SKILL.md` - Complete skill documentation with all commands
- `CLAUDE.md` - Claude Code integration instructions
- `README.md` - This file (quick start guide)

## License

Internal tool for network operations.

## Author

tucker28
