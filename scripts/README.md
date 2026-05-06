# Scripts

Administrative scripts for managing the CloudCLI multi-user environment.

## manage.sh

Main management script for server and database operations.

### Usage

```bash
# Start the gateway server
./scripts/manage.sh start

# Stop gateway only (workers keep running)
./scripts/manage.sh stop

# Stop gateway AND all worker containers
./scripts/manage.sh stop --all

# Stop worker containers only (leave gateway running)
./scripts/manage.sh stop --containers

# Restart gateway (workers keep running)
./scripts/manage.sh restart

# Restart gateway and stop all workers
./scripts/manage.sh restart --all

# Check server and container status
./scripts/manage.sh status

# Show database info (users, containers)
./scripts/manage.sh db-info

# Delete user database (requires confirmation)
./scripts/manage.sh db-delete
```

### Commands

- **start** - Start the CloudCLI gateway server (frontend + backend)
- **stop** - Stop gateway processes (workers keep running by default)
- **stop --all** - Stop gateway AND all worker containers
- **stop --containers** - Stop only worker containers (leave gateway running)
- **restart** - Restart gateway server
- **restart --all** - Restart gateway and stop all worker containers
- **status** - Show gateway and worker container status
- **db-info** - Display users and containers from database
- **db-delete** - Delete the user database and all data (requires confirmation)

### Environment Variables

- `DATABASE_PATH` - Override database location (default: `~/.cloudcli/auth.db`)

### Notes

- Server logs are written to `/tmp/dev-server.log`
- Frontend runs on port 5173, backend on port 3001
- Database deletion requires typing "yes" to confirm

## manage-users.js

Comprehensive user management script for listing, adding, modifying, and deleting users.

### Usage

```bash
# List all users
node scripts/manage-users.js list

# Add a new user
node scripts/manage-users.js add <username> <password>

# Change password
node scripts/manage-users.js password <username> <new-password>

# Activate/deactivate user
node scripts/manage-users.js activate <username>
node scripts/manage-users.js deactivate <username>

# Delete user
node scripts/manage-users.js delete <username>

# Show user details
node scripts/manage-users.js info <username>

# Show help
node scripts/manage-users.js help
```

### Commands

- **list** - List all users with status, login history, and containers
- **add** - Create new user with persistent volume and template files
- **password** - Change a user's password
- **activate** - Enable user login
- **deactivate** - Disable user login (account remains in database)
- **delete** - Remove user from database (does not remove volumes/containers)
- **info** - Show detailed user information including credentials and container

### Examples

```bash
# List all users
node scripts/manage-users.js list

# Add user with bcrypt-hashed password
node scripts/manage-users.js add bob secretpass123

# Add user with plaintext password (testing only)
DISABLE_PASSWORD_HASHING=true node scripts/manage-users.js add alice pass123

# View user details
node scripts/manage-users.js info bob

# Change password
node scripts/manage-users.js password bob newpass456

# Deactivate user temporarily
node scripts/manage-users.js deactivate bob

# Delete user (WARNING: doesn't remove volumes)
node scripts/manage-users.js delete bob
```

### Environment Variables

- `DATABASE_PATH` - Override database location (default: `~/.cloudcli/auth.db`)
- `DISABLE_PASSWORD_HASHING` - Store plaintext passwords (testing only)

### Notes

- Passwords are hashed with bcrypt by default (saltRounds=12)
- Add command automatically creates volumes and copies template files
- Delete command does NOT remove containers/volumes (use `manage.sh db-delete` for full cleanup)
- Deactivated users cannot log in but remain in the database

## manage-credentials.js

Manage encrypted user credentials (API keys, environment variables, tokens, etc.)

### Usage

```bash
# List credentials
node scripts/manage-credentials.js list <username>

# Add credential
node scripts/manage-credentials.js add <username> <name> <type> <value> [description]

# Get credential (shows decrypted value)
node scripts/manage-credentials.js get <username> <name>

# Delete credential
node scripts/manage-credentials.js delete <username> <name>

# Export credentials to JSON
node scripts/manage-credentials.js export <username> [output-file]

# Import credentials from JSON
node scripts/manage-credentials.js import <username> <input-file>
```

### Credential Types

- **env_var** - Environment variables
- **api_key** - API keys and tokens
- **token** - OAuth tokens, JWT tokens
- **password** - Passwords
- **ssh_key** - SSH private keys
- **certificate** - TLS/SSL certificates
- **other** - Other credential types

### Examples

```bash
# Add environment variable
node scripts/manage-credentials.js add alice DATABASE_URL env_var "postgres://..." "Production DB"

# Add API key
node scripts/manage-credentials.js add alice OPENAI_KEY api_key "sk-..." "OpenAI API Key"

# List all credentials
node scripts/manage-credentials.js list alice

# View credential value (plaintext)
node scripts/manage-credentials.js get alice DATABASE_URL

# Export for backup
node scripts/manage-credentials.js export alice backup.json

# Import from backup
node scripts/manage-credentials.js import bob backup.json

# Delete credential
node scripts/manage-credentials.js delete alice OLD_KEY
```

### Security

- All credentials are encrypted with AES-256-GCM
- Each user has a unique encryption key derived from ENCRYPTION_MASTER_KEY
- Export files contain plaintext credentials - keep them secure!
- Requires ENCRYPTION_MASTER_KEY environment variable (must match server)

### Environment Variables

- `ENCRYPTION_MASTER_KEY` - Required for encryption/decryption
- `DATABASE_PATH` - Override database location (default: `~/.cloudcli/auth.db`)

### Notes

- Delete is a soft delete (credential remains in database with is_active=0)
- Get command displays plaintext values - use with caution
- Export creates JSON with decrypted credentials - protect these files

## import-env.js

Import environment variables from your shell environment into user credentials.

### Usage

```bash
# Import for specific user
node scripts/import-env.js <username>

# Import for all active users
node scripts/import-env.js --all

# Update existing credentials
node scripts/import-env.js <username> --force
```

### Environment Variables Imported

**PAN-OS Firewall:**
- `PANOS_USERNAME` - Admin username
- `PANOS_PASSWORD` - Admin password
- `PANOS_BASTION_HOST` - Bastion host for SSH access

**Network Switch:**
- `NETSWITCH_USERNAME` - Switch username
- `NETSWITCH_PASSWORD` - Switch password
- `NETSWITCH_ENABLE_PASSWORD` - Enable mode password

**AKiPS Monitoring:**
- `AKIPS_API_PASSWORD` - API password
- `AKIPS_SERVER` - Server hostname
- `AKIPS_USERNAME` - API username
- `AKIPS_VERIFY_SSL` - SSL verification flag

### Workflow

1. Add variables to `~/.bash_profile`:
   ```bash
   export PANOS_USERNAME='admin'
   export PANOS_PASSWORD='your-password'
   export PANOS_BASTION_HOST='netprod0001'
   # ... etc
   ```

2. Source your profile:
   ```bash
   source ~/.bash_profile
   ```

3. Run import script:
   ```bash
   node scripts/import-env.js alice
   ```

4. Container automatically restarts on next login to apply credentials

### Examples

```bash
# Import for one user
node scripts/import-env.js bob

# Import for all users
node scripts/import-env.js --all

# Update existing credentials
node scripts/import-env.js bob --force

# Import after sourcing profile
source ~/.bash_profile && node scripts/import-env.js bob
```

### Environment Variables Required

- `ENCRYPTION_MASTER_KEY` - Required for encryption/decryption
- `DATABASE_PATH` - Override database location (default: `~/.cloudcli/auth.db`)

### Notes

- Variables are only imported if they are set in your current shell environment
- Existing credentials are skipped unless `--force` is used
- All values are encrypted with AES-256-GCM before storage
- Containers must be restarted for changes to take effect
- Variables are automatically injected into containers at runtime
- To add custom variables, edit the `ENV_VARS_TO_IMPORT` array in the script

## add-user.js

Legacy script for adding users. **Use manage-users.js instead** for full functionality.

### Usage

```bash
# Add a new user
node scripts/add-user.js <username> <password>

# Reinitialize existing user from template
node scripts/add-user.js --template-only <username>
```
