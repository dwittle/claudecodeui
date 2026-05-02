# Scripts

Administrative scripts for managing the CloudCLI multi-user environment.

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
