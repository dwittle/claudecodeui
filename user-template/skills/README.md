# Claude Code Skills Collection

A curated collection of useful Claude Code Skills for various automation and integration tasks.

## Overview

This repository contains reusable Claude Code Skills that extend Claude's capabilities for specific domains and integrations. Each skill is self-contained in its own directory with dedicated documentation, dependencies, and installation instructions.

## Available Skills

### 1. AKiPS Network Management (`akips/`)

Command-line interface for querying AKiPS network management systems.

**Features:**
- List devices and interfaces with pattern matching
- Get detailed device information (sysName, location, IPs)
- Find top interfaces by traffic/utilization
- Query events (interface status, threshold violations, uptime)
- Retrieve time-series data for network metrics
- Manage device/interface groups
- Execute raw AKiPS commands
- JSON output for easy automation

**Quick Start:**
```bash
# Option 1: Use install script (recommended)
cd akips
./install.sh ~/
cd ~/.claude/skills/akips
cp .env.example .env
# Edit .env with your credentials
./akips_cli.py list-devices

# Option 2: Manual installation
cd akips
pip install -r requirements.txt
export AKIPS_API_PASSWORD=your-password
./akips_cli.py list-devices
```

See [akips/README.md](akips/README.md) for detailed documentation.

### 2. Network Switch SSH (`netswitch/`)

Secure SSH interface for executing read-only "show" commands on network switches.

**Features:**
- Secure SSH access with strict command validation
- Only "show" commands allowed (multi-layer security)
- Prevents command injection and chaining
- Multi-vendor support (Cisco, Arista, Juniper, HP, Huawei, etc.)
- Enable mode support for privileged show commands
- Batch command execution
- JSON output for automation
- Command validation without execution

**Security Features:**
- ✅ Command whitelist (only "show"/"display" allowed)
- ✅ Injection prevention (blocks ;, &&, ||, |, >, <, etc.)
- ✅ Shell escape prevention (blocks `, $(), !)
- ✅ Config protection (blocks configure, write, copy, reload)
- ✅ Multi-layer validation before execution
- ✅ Read-only operations only

**Quick Start:**
```bash
# Option 1: Use install script (recommended)
cd netswitch
./install.sh ~/
cd ~/.claude/skills/netswitch
export NETSWITCH_PASSWORD=your-password
./netswitch_cli.py show 192.168.1.1 "show version"

# Option 2: Manual installation
cd netswitch
pip install -r requirements.txt
export NETSWITCH_PASSWORD=your-password
./netswitch_cli.py show 192.168.1.1 "show version"

# Run security tests
./test_security.py
```

See [netswitch/README.md](netswitch/README.md) for detailed documentation.

## Project Structure

```
skills/
├── README.md              # This file
├── .gitignore            # Python project gitignore
├── akips/                # AKiPS network management skill
│   ├── README.md         # Skill-specific documentation
│   ├── SKILL.md          # Claude Code skill definition
│   ├── requirements.txt  # Python dependencies
│   ├── .env.example      # Environment variable template
│   ├── akips_client.py   # Core client library
│   ├── akips_cli.py      # CLI interface
│   └── docs/             # Additional documentation
└── netswitch/            # Network switch SSH skill
    ├── README.md         # Skill-specific documentation
    ├── SKILL.md          # Claude Code skill definition
    ├── requirements.txt  # Python dependencies
    ├── .env.example      # Environment variable template
    ├── netswitch_client.py   # Core SSH client library
    ├── netswitch_cli.py      # CLI interface
    ├── test_security.py      # Security validation tests
    └── docs/
        └── SECURITY.md   # Detailed security documentation
```

## Using Skills with Claude Code

Each skill directory contains a `SKILL.md` file that defines how Claude Code can interact with the skill. When working in Claude Code, you can reference these skills for automated workflows and integrations.

### Installing Skills

Most skills include an `install.sh` script for easy installation to any directory:

```bash
# Install to home directory (for personal use)
cd <skill-name>
./install.sh ~/

# Install to a project directory
./install.sh /path/to/project

# Install to current directory
./install.sh .
```

The install script will:
- Create a `.claude/skills/<skill-name>` subdirectory
- Set up a virtual environment
- Install all dependencies automatically
- Copy all necessary files

After installation, skills are accessible at `<target>/.claude/skills/<skill-name>/`.

### General Skill Usage Pattern

**Automated Installation (Recommended):**
1. Navigate to the skill directory
2. Run: `./install.sh <target-directory>`
3. Navigate to installed location: `cd <target>/.claude/skills/<skill-name>`
4. Configure environment: `cp .env.example .env` and edit
5. Run the skill's CLI or import its modules

**Manual Installation:**
1. Navigate to the skill directory
2. Install dependencies: `pip install -r requirements.txt`
3. Configure environment variables (see skill's `.env.example`)
4. Run the skill's CLI or import its modules

## Adding New Skills

When adding new skills to this collection:

1. Create a new directory with a descriptive name
2. Include these essential files:
   - `README.md` - Comprehensive documentation
   - `SKILL.md` - Claude Code skill definition
   - `requirements.txt` - Python dependencies
   - `.env.example` - Environment variable template
3. Follow the existing structure for consistency
4. Update this README to list the new skill

### Skill Directory Template

```
new-skill/
├── README.md           # What it does, how to use it
├── SKILL.md            # Claude Code integration
├── requirements.txt    # Dependencies
├── .env.example        # Config template
├── install.sh          # Optional setup script
├── *_client.py         # Core library
├── *_cli.py            # CLI interface
└── docs/               # Extended documentation
```

## Requirements

- Python 3.7 or higher
- Virtual environment recommended for each skill
- Skill-specific requirements listed in each skill's directory

## Contributing

Skills in this collection should be:
- **Self-contained**: All dependencies and config in the skill directory
- **Well-documented**: Clear README with examples
- **Production-ready**: Error handling, validation, security considerations
- **CLI-friendly**: JSON output, standard exit codes, helpful messages

## License

See individual skill directories for licensing information.

## Support

For issues with specific skills, refer to the skill's README documentation. For general repository questions, open an issue in the project tracker.
