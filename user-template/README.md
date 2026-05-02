# User Home Directory Template

This directory serves as a template for new user home directories.

When a new user is created using `scripts/add-user.js`, all files in this directory are copied to the user's persistent volume.

## Structure

```
user-template/
├── .claude/
│   └── settings.json      # Claude Code configuration (API endpoint, auth token, models)
├── workspace/             # User workspace for projects
│   └── .gitkeep
└── README.md             # This file
```

## Customization

Edit the files in this directory to customize the default environment for new users:

- `.claude/settings.json` - Configure custom API endpoints and authentication
- Add any other default files, configs, or directories you want new users to start with

## Usage

The template is automatically used when running:

```bash
node scripts/add-user.js <username> <password>
```

To reinitialize an existing user's home from the template:

```bash
node scripts/add-user.js --template-only <username>
```
