# Network Switch SSH Security

This document details the security controls implemented in the Network Switch SSH tool.

## Security Principles

1. **Defense in Depth**: Multiple layers of validation and control
2. **Whitelist Approach**: Only explicitly allowed commands are permitted
3. **Fail Secure**: Any ambiguity results in command rejection
4. **No Bypass**: No mechanisms to override security controls
5. **Least Privilege**: Read-only operations only

## Security Controls

### 1. Command Whitelist

Only commands starting with these prefixes are allowed:
- `show` (all vendors)
- `display` (some vendors like Huawei)

**Implementation:**
```python
ALLOWED_COMMAND_PREFIXES = ['show', 'display']
```

**Tests:**
```bash
✓ show version              # Allowed
✓ show interfaces           # Allowed
✓ display version           # Allowed
✗ configure terminal        # Blocked
✗ interface gi1/0/1         # Blocked
```

### 2. Command Chaining Prevention

Blocks all command separators and control operators:
- `;` - Sequential command separator
- `&&` - AND operator
- `||` - OR operator
- `|` - Pipe operator
- `\n` - Newline
- `\r` - Carriage return

**Implementation:**
```python
FORBIDDEN_PATTERNS = [r';', r'\|\|', r'&&', r'\|', r'\n', r'\r']
```

**Tests:**
```bash
✗ show version; configure terminal     # Blocked
✗ show version && configure terminal   # Blocked
✗ show version || configure terminal   # Blocked
✗ show version | grep cisco            # Blocked
```

### 3. Shell Escape Prevention

Blocks shell escape and command substitution:
- `` ` `` - Backtick command substitution
- `$()` - Command substitution
- `!` - Shell escape or history expansion

**Implementation:**
```python
FORBIDDEN_PATTERNS = [r'`', r'\$\(', r'!']
```

**Tests:**
```bash
✗ show version `cat /etc/passwd`       # Blocked
✗ show version $(cat /etc/passwd)      # Blocked
✗ !bash                                 # Blocked
✗ show version!bash                     # Blocked
```

### 4. Output Redirection Prevention

Blocks all output redirection operators:
- `>` - Redirect output
- `>>` - Append output
- `<` - Redirect input
- `2>` - Redirect stderr
- `2>&1` - Redirect stderr to stdout

**Implementation:**
```python
FORBIDDEN_PATTERNS = [r'>', r'<']
```

**Tests:**
```bash
✗ show version > output.txt            # Blocked
✗ show version >> output.txt           # Blocked
✗ show version < input.txt             # Blocked
```

### 5. Configuration Command Protection

Explicitly blocks configuration-related commands:
- `configure` - Enter config mode
- `write` - Save configuration
- `copy` - Copy files/config
- `reload` - Restart device
- `enable` - Privilege escalation (when not standalone)

**Implementation:**
```python
FORBIDDEN_PATTERNS = [r'configure', r'write', r'copy', r'reload', r'enable']
```

**Tests:**
```bash
✗ configure terminal                   # Blocked
✗ conf t                               # Blocked (contains 'conf')
✗ write memory                         # Blocked
✗ copy running-config startup-config   # Blocked
✗ reload                               # Blocked
```

### 6. Multi-Layer Validation

Commands are validated at multiple stages:

**Stage 1: Empty Check**
```python
if not command or not command.strip():
    raise SecurityViolation("Empty command not allowed")
```

**Stage 2: Pattern Matching**
```python
for pattern in FORBIDDEN_PATTERNS:
    if re.search(pattern, command, re.IGNORECASE):
        raise SecurityViolation(f"Command contains forbidden pattern: {pattern}")
```

**Stage 3: Prefix Validation**
```python
cmd_lower = cmd_normalized.lower()
if not cmd_lower.startswith(allowed_prefix):
    raise SecurityViolation(f"Command must start with: {allowed_prefix}")
```

**Stage 4: First Word Check**
```python
first_word = cmd_normalized.split()[0].lower()
if first_word not in ALLOWED_COMMAND_PREFIXES:
    raise SecurityViolation(f"First word must be a valid command")
```

## Credential Security

### Password Management

**Passwords MUST be stored as environment variables:**
```bash
export NETSWITCH_PASSWORD=your-password
export NETSWITCH_ENABLE_PASSWORD=your-enable-password
```

**Passwords are NEVER:**
- Stored in files
- Logged to console
- Included in error messages
- Passed as command-line arguments

### Username Handling

Username can be provided via:
1. Command-line argument: `--username admin`
2. Environment variable: `NETSWITCH_USERNAME=admin`

## SSH Security

### Connection Security

- **No Telnet**: Only SSH connections supported
- **Key Exchange**: Uses paramiko with secure defaults
- **Host Key Validation**: Configurable (AutoAddPolicy by default)
- **Agent Disabled**: `allow_agent=False` prevents SSH agent access
- **Key Lookup Disabled**: `look_for_keys=False` prevents key-based auth side effects

### Timeout Controls

- **Connection Timeout**: Configurable (default: 30 seconds)
- **Command Timeout**: Configurable per command
- **Read Timeout**: Prevents hanging on slow devices

## Operational Security

### Read-Only Operations

The tool is designed to be read-only:
1. No configuration commands allowed
2. No file operations (read/write)
3. No privilege escalation for config changes
4. Enable mode only used for show commands

### Enable Mode

When `NETSWITCH_ENABLE_PASSWORD` is provided:
- Used only to access privileged show commands
- Never used to enter configuration mode
- All config commands still blocked

### Error Handling

Security violations result in:
- Clear error messages
- Non-zero exit code (1)
- No command execution
- JSON error format (when `--json` used)

## Validation Testing

Run security tests:
```bash
./test_security.py
```

Validate commands before execution:
```bash
./netswitch_cli.py validate "your-command"
./netswitch_cli.py validate --file commands.txt
```

## Threat Model

### Protected Against

✅ Command injection via separators
✅ Shell escapes and command substitution
✅ Configuration changes
✅ File operations
✅ Output redirection
✅ Privilege escalation for config
✅ Malicious batch commands

### Not Protected Against

⚠️ Social engineering (valid but malicious show commands)
⚠️ Device-specific vulnerabilities
⚠️ Man-in-the-middle attacks (if SSH is compromised)
⚠️ Credential theft (protect your passwords!)

### Limitations

This tool provides security controls for command execution, but:
- Cannot prevent network-level attacks
- Relies on SSH security
- Depends on proper credential management
- Show commands may still reveal sensitive data

## Best Practices

1. **Protect Credentials**: Use environment variables, never files
2. **Validate Commands**: Use `validate` before execution
3. **Limit Access**: Only provide credentials to authorized users
4. **Monitor Usage**: Log all command executions
5. **Update Regularly**: Keep dependencies up to date
6. **Test Security**: Run `test_security.py` after changes

## Compliance

This tool helps with:
- **PCI-DSS**: Read-only network device access
- **SOC 2**: Security controls and audit logging
- **ISO 27001**: Access control and change management
- **Network Security**: Prevents unauthorized config changes

## Reporting Security Issues

If you discover a security vulnerability:
1. Do NOT create a public issue
2. Contact the maintainer directly
3. Provide detailed reproduction steps
4. Allow time for patch before disclosure

## Security Audit Log

| Date | Version | Audit Result | Notes |
|------|---------|--------------|-------|
| 2026-03-07 | 1.0.0 | Initial security review | All tests passing |

## References

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Paramiko Security](https://www.paramiko.org/security.html)
- [Network Device Security Best Practices](https://www.cisco.com/c/en/us/support/docs/ip/access-lists/13608-21.html)
