# PAN-OS Skill Installation Guide

## Quick Installation

```bash
# 1. Run setup script
cd /space/tucker28/code/python/skills/netswitch/.claude/skills/panos
./setup.sh

# 2. Configure credentials
vi ~/.panos_credentials
# Add your PAN-OS credentials and save

# 3. Verify permissions
chmod 600 ~/.panos_credentials

# 4. Test it
./panos validate "show system info"
```

## Credentials Setup

Create `~/.panos_credentials` with mode 600:

```bash
export PANOS_PASSWORD='your-actual-password'
export PANOS_USERNAME='admin'
```

**Security Note:** This file MUST have permissions 600 (read/write for owner only).

## Verification

### Test validation (no connection required)
```bash
./panos validate "show system info"
# Should output: ✓ VALID: show system info
```

### Test security blocks
```bash
./panos validate "configure"
# Should output: ✗ INVALID: configure
```

### Test with actual firewall
```bash
./panos show <your-firewall-ip> "show system info"
```

## Integration with Claude Code

Once installed, Claude Code automatically detects this skill and can use it with the Bash tool:

```bash
cd /space/tucker28/code/python/skills/netswitch/.claude/skills/panos && \
  ./panos show fw1 "show system info"
```

See `CLAUDE.md` for complete integration details.

## Troubleshooting

### "ERROR: PANOS_PASSWORD environment variable must be set"
- Ensure `~/.panos_credentials` exists
- Ensure it has correct permissions: `chmod 600 ~/.panos_credentials`
- Verify wrapper script sources the file correctly

### "ERROR: Credentials file must have mode 600"
```bash
chmod 600 ~/.panos_credentials
```

### "Authentication failed"
- Verify credentials are correct in `~/.panos_credentials`
- Check SSH is enabled on the firewall
- Verify username has SSH access privileges

### "Connection error"
- Check network connectivity to firewall
- Verify firewall IP/hostname is correct
- Check SSH port (default 22)
- Try with increased timeout: `--timeout 60`

## File Structure

```
panos/
├── panos                    # Main wrapper script
├── panos_cli.py            # CLI implementation
├── panos_client.py         # SSH client library
├── requirements.txt        # Python dependencies
├── .venv/                  # Virtual environment
├── SKILL.md               # Complete documentation
├── CLAUDE.md              # Claude Code integration
├── README.md              # Quick start guide
├── INSTALLATION.md        # This file
├── credentials.template   # Credentials template
├── setup.sh               # Installation script
└── test_validation.sh     # Validation tests
```

## Next Steps

1. Read `README.md` for usage examples
2. Read `SKILL.md` for complete command reference
3. Try some commands on your firewalls
4. Configure Claude Code to use this skill (automatic)

## Support

For issues or questions, refer to:
- `SKILL.md` - Complete documentation
- `README.md` - Quick reference
- `CLAUDE.md` - Claude integration
