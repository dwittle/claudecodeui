# Environment Variable Configuration

The PAN-OS skill supports configuration via environment variables, allowing you to avoid hardcoding credentials in your scripts.

## Supported Environment Variables

### Firewall Credentials

- **PANOS_USERNAME** - SSH username for the firewall
- **PANOS_PASSWORD** - SSH password for the firewall

### Bastion/Jump Host Configuration

- **PANOS_BASTION_HOST** - Hostname or IP of the bastion/jump host
- **NETSWITCH_USERNAME** - Bastion username (tried first)
- **NETSWITCH_PASSWORD** - Bastion password (tried first)
- **PANOS_BASTION_USERNAME** - Bastion username (fallback)
- **PANOS_BASTION_PASSWORD** - Bastion password (fallback)

## Usage

### Setup Credentials File

1. Copy the template:
   ```bash
   cp credentials.template ~/.panos_credentials
   chmod 600 ~/.panos_credentials
   ```

2. Edit `~/.panos_credentials` with your credentials

3. Source the file before running commands:
   ```bash
   source ~/.panos_credentials
   panos show <hostname> "show system info"
   ```

### CLI Usage with Environment Variables

Once environment variables are set, you can omit credentials from the command line:

```bash
# Set environment variables
export PANOS_USERNAME='admin'
export PANOS_PASSWORD='your-password'

# Run commands without specifying credentials
panos show firewall.example.com "show system info"
```

### Bastion Host Configuration

If you need to connect through a bastion host:

```bash
# Set bastion configuration
export PANOS_BASTION_HOST='bastion.example.com'
export NETSWITCH_USERNAME='bastion-user'
export NETSWITCH_PASSWORD='bastion-password'

# Now all connections will tunnel through the bastion
panos show firewall.example.com "show system info"
```

### Python API Usage

When using the Python API directly, credentials are loaded automatically from environment variables:

```python
from panos_client import PanosClient

# Set environment variables first
# export PANOS_USERNAME='admin'
# export PANOS_PASSWORD='your-password'

# Create client - credentials loaded from environment
client = PanosClient(hostname='firewall.example.com')
client.connect()
output = client.execute_command('show system info')
client.disconnect()
```

You can also override environment variables by passing explicit values:

```python
# Explicit credentials override environment variables
client = PanosClient(
    hostname='firewall.example.com',
    username='admin',  # Overrides PANOS_USERNAME
    password='secret'  # Overrides PANOS_PASSWORD
)
```

## Priority Order

The client uses the following priority order for configuration:

1. **Explicit parameters** passed to `PanosClient()` constructor
2. **Environment variables**
3. **Error if not found** - required credentials must be provided

## Security Best Practices

1. **Never hardcode credentials** in scripts
2. **Use environment variables** for sensitive data
3. **Set proper file permissions** on credentials files (`chmod 600`)
4. **Use separate credentials** for production vs. development
5. **Rotate passwords regularly**
6. **Consider using a secrets manager** for production deployments

## Examples

### Example 1: Basic Setup

```bash
# Set credentials
export PANOS_USERNAME='admin'
export PANOS_PASSWORD='MySecureP@ss123'

# Run command
panos show 192.168.1.1 "show interface all"
```

### Example 2: With Bastion Host

```bash
# Set all credentials
export PANOS_USERNAME='admin'
export PANOS_PASSWORD='MySecureP@ss123'
export PANOS_BASTION_HOST='bastion.corp.com'
export NETSWITCH_USERNAME='jumpuser'
export NETSWITCH_PASSWORD='JumpP@ss456'

# Commands will tunnel through bastion
panos show 10.0.1.1 "show system info"
```

### Example 3: Multiple Environments

```bash
# Development credentials
cat > ~/.panos_dev <<EOF
export PANOS_USERNAME='admin'
export PANOS_PASSWORD='dev-password'
EOF
chmod 600 ~/.panos_dev

# Production credentials
cat > ~/.panos_prod <<EOF
export PANOS_USERNAME='admin'
export PANOS_PASSWORD='prod-password'
export PANOS_BASTION_HOST='prod-bastion.corp.com'
export NETSWITCH_USERNAME='prod-jumpuser'
export NETSWITCH_PASSWORD='prod-jump-password'
EOF
chmod 600 ~/.panos_prod

# Use development
source ~/.panos_dev
panos show dev-firewall.example.com "show system info"

# Switch to production
source ~/.panos_prod
panos show prod-firewall.example.com "show system info"
```

### Example 4: Python Script with Environment Variables

```python
#!/usr/bin/env python3
"""
Example script using environment variables for configuration
"""
import os
from panos_client import PanosClient

# Verify credentials are set
if not os.environ.get('PANOS_PASSWORD'):
    print("ERROR: Please set PANOS_PASSWORD environment variable")
    exit(1)

# Create client using environment variables
with PanosClient(hostname='firewall.example.com') as client:
    # Execute commands
    system_info = client.execute_command('show system info')
    print(system_info)

    interfaces = client.execute_command('show interface all')
    print(interfaces)
```

## Troubleshooting

### Missing Credentials Error

```
PanosError: Username required: provide as argument or set PANOS_USERNAME environment variable
```

**Solution**: Set the required environment variable:
```bash
export PANOS_USERNAME='admin'
```

### Missing Bastion Credentials

```
PanosError: Bastion credentials required when using bastion host
```

**Solution**: Set bastion credentials:
```bash
export NETSWITCH_USERNAME='user'
export NETSWITCH_PASSWORD='password'
```

### Verify Environment Variables

Check what's currently set:
```bash
env | grep PANOS
env | grep NETSWITCH
```
