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

## add-user.js

Legacy script for adding users. **Use manage-users.js instead** for full functionality.

### Usage

```bash
# Add a new user
node scripts/add-user.js <username> <password>

# Reinitialize existing user from template
node scripts/add-user.js --template-only <username>
```
