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

## add-user.js

Add new users with initialized home directories from a template.

### Usage

```bash
# Add a new user
node scripts/add-user.js <username> <password>

# Example
node scripts/add-user.js alice secretpassword123

# Reinitialize existing user from template
node scripts/add-user.js --template-only alice
```

### What it does

1. Creates user in the database with hashed password
2. Creates a persistent podman volume: `cloudcli-data-user-{userId}`
3. Copies all files from `user-template/` to the user's volume
4. Sets proper ownership (UID 100999 for container user)

### Template Directory

The template at `user-template/` contains:
- `.claude/settings.json` - Custom API configuration
- `workspace/` - Default workspace directory

Edit the template to customize the default environment for new users.

### Environment Variables

- `DATABASE_PATH` - Override database location (default: `server/database/auth.db`)

### Requirements

- podman CLI available in PATH
- Access to the database file
- Permissions to create/modify volumes (or run with appropriate privileges)

### Notes

- Passwords are hashed with SHA-256 before storage
- Volume data persists across container restarts
- Use `--template-only` to refresh an existing user's home directory without changing their password
