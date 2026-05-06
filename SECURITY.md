# Security Guidelines

## Credential Handling

### Overview
CloudCLI handles sensitive credentials (passwords, API keys, tokens) with encryption at rest and careful logging practices to prevent exposure.

### Encryption
- **Algorithm**: AES-256-GCM
- **Key Derivation**: HKDF with per-user salt
- **Master Key**: `ENCRYPTION_MASTER_KEY` environment variable (required)

### Logging Practices

#### ✅ SAFE - What we log:
- Credential names/keys (e.g., `PANOS_USERNAME`, `AKIPS_SERVER`)
- Credential types (e.g., `env_var`, `api_key`)
- Counts (e.g., "Copied 10 environment variables")
- Success/failure status
- Error messages (without credential values)

#### ❌ NEVER LOG:
- Credential values (passwords, tokens, keys)
- Decrypted credential content
- Environment variable values
- Full error objects that might contain sensitive data

### Code Review Checklist

When adding code that handles credentials:

1. **Console Logging**
   - ❌ `console.log(credential.value)`
   - ❌ `console.log(\`Password: ${password}\`)`
   - ❌ `console.error('Failed:', error)` (might contain credential in error object)
   - ✅ `console.log(\`Added credential: ${credential.name}\`)`
   - ✅ `console.log('Copied 5 environment variables from host')`
   - ✅ `console.error('Failed:', error.message)`

2. **Error Messages**
   - ❌ `throw new Error(\`Invalid password: ${password}\`)`
   - ✅ `throw new Error('Invalid password format')`
   - ✅ `console.error('Failed to decrypt credential:', error.message)`

3. **Debug Output**
   - Never use `console.dir()` or `JSON.stringify()` on credential objects
   - Sanitize objects before logging: `const safe = { ...obj, password: '[REDACTED]' }`

### Storage Security

#### Database
- Credentials stored encrypted in SQLite database
- Location: `~/.cloudcli/auth.db` (default)
- Permissions: Should be readable only by the user running the gateway

#### Container Environment
- Credentials injected as environment variables at container creation time
- Environment variables exist only in container process memory
- Not written to container filesystem (except process /proc/environ)

#### Files to Protect
```
.env                        # Contains ENCRYPTION_MASTER_KEY
~/.cloudcli/auth.db         # Contains encrypted credentials
.panos_credentials          # Credential files
*_credentials               # Pattern for credential files
*.key, *.pem                # SSH keys, certificates
credentials.json            # Exported credential backups
```

### Git Security

All sensitive files are excluded via `.gitignore`:
```gitignore
# Credentials files (NEVER commit)
.panos_credentials
*_credentials
*.key
*.pem
credentials.json
secrets.json
.env
.env.local
```

### Docker/Podman Security

All sensitive files are excluded from images via `.dockerignore`:
```dockerignore
# Credentials and secrets (NEVER include in image)
.panos_credentials
*_credentials
*.key
*.pem
credentials.json
secrets.json
.env
```

### Credential Export Security

The `manage-credentials.js export` command creates JSON files with **plaintext credentials**:

```bash
node scripts/manage-credentials.js export alice backup.json
# ⚠️ backup.json contains PLAINTEXT credentials!
```

**Security measures:**
- Export files should be protected (chmod 600)
- Warn user that export contains plaintext
- Delete export files after use
- Never commit export files to git

### Audit Commands

Check for accidental credential logging:

```bash
# Search for potential credential value logging
grep -r "console\.log.*password" server/
grep -r "console\.log.*\.value" server/
grep -r "console\.error.*error)" server/

# Check file permissions
ls -la ~/.cloudcli/auth.db
ls -la .env
```

### Best Practices Summary

1. ✅ Always encrypt credentials before storage
2. ✅ Log credential names/operations, never values
3. ✅ Use `error.message` not full `error` objects in logs
4. ✅ Use `.gitignore` and `.dockerignore` for sensitive files
5. ❌ Never log credential values in production code
6. ❌ Never commit credential files or .env to version control
7. ❌ Never include credentials in error messages
