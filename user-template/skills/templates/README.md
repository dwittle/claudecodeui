# Templates Index

This directory contains **project-level, cross-cutting templates and documentation**.

For **skill-specific templates**, see the templates directory within each skill:
- **Netswitch templates:** `.claude/skills/netswitch/templates/`
- **AKiPS templates:** `.claude/skills/akips/templates/`
- **PAN-OS templates:** `.claude/skills/panos/templates/`

---

## Project-Level Resources

### PARSING_BEST_PRACTICES.md

**Comprehensive guide to parsing network device text output.**

**Read this before writing any parser.**

**Contents:**
- Why position-based parsing fails
- Anchor-based parsing strategy (the right way)
- The Gi2/0/4 bug case study (real production incident)
- Universal parsing principles
- Validation and testing checklists
- Alternative approaches (JSON, SNMP, TextFSM, NETCONF)
- Common parsing patterns for different output types

**When to read:**
- Before writing any text parser
- When parser is silently excluding data
- When encountering parse errors with variable-length fields
- To understand why anchor-based parsing is critical

---

## Skill-Specific Templates

### Netswitch Templates
**Location:** `.claude/skills/netswitch/templates/`

**Available:**
- `interface_parser.py` - Parse `show interfaces status` (production-tested, 99% success)

**Use for:**
- Cisco IOS/IOS-XE switch output
- Columnar data with variable-length descriptions
- Interface status, CDP neighbors, VLAN configs, etc.

[See Netswitch Templates README](./../skills/netswitch/templates/README.md)

---

### AKiPS Templates
**Location:** `.claude/skills/akips/templates/`

**Available:**
- *Coming soon - contributions welcome*

**Use for:**
- AKiPS event JSON parsing
- Time-series data analysis
- RTT/latency analysis
- Event correlation and timeline generation

[See AKiPS Templates README](./../skills/akips/templates/README.md)

---

### PAN-OS Templates
**Location:** `.claude/skills/panos/templates/`

**Available:**
- *Coming soon - contributions welcome*

**Use for:**
- PAN-OS firewall output
- Session analysis
- Log parsing
- Security policy analysis

[See PAN-OS Templates README](./../skills/panos/templates/README.md)

---

## For Claude Code: Template Discovery Pattern

### Step 1: Identify the Data Source

```python
# What tool are you using?
netswitch_output = ...   # → Check .claude/skills/netswitch/templates/
akips_data = ...         # → Check .claude/skills/akips/templates/
panos_output = ...       # → Check .claude/skills/panos/templates/
```

### Step 2: Check Skill Templates

```bash
# List templates for specific skill
ls .claude/skills/netswitch/templates/
ls .claude/skills/akips/templates/
ls .claude/skills/panos/templates/

# Read skill's template README
cat .claude/skills/netswitch/templates/README.md
```

### Step 3: Read Best Practices

```bash
# If creating new parser, read general principles first
cat .claude/templates/PARSING_BEST_PRACTICES.md
```

### Step 4: Use or Adapt Template

```bash
# Use existing template
python3 .claude/skills/netswitch/templates/interface_parser.py data.txt

# Or adapt for your needs
cp .claude/skills/netswitch/templates/interface_parser.py my_parser.py
# Edit parse function, keep validation and anchor-based approach
```

---

## Directory Structure

```
.claude/
├── templates/                           # ← You are here
│   ├── README.md                        # This file (index)
│   └── PARSING_BEST_PRACTICES.md        # General parsing guide
└── skills/
    ├── netswitch/
    │   ├── SKILL.md
    │   └── templates/                   # Netswitch-specific
    │       ├── README.md
    │       └── interface_parser.py
    ├── akips/
    │   ├── SKILL.md
    │   └── templates/                   # AKiPS-specific
    │       └── README.md
    └── panos/
        ├── SKILL.md
        └── templates/                   # PAN-OS-specific
            └── README.md
```

---

## Why This Structure?

### Per-Skill Templates
**Benefits:**
- Templates grouped with related skill
- Clear ownership and context
- Self-contained skill bundles
- Better scalability (each skill grows independently)
- Easier to maintain and distribute

**Example:**
If you're using netswitch skill, check `netswitch/templates/` first. If you're using akips skill, check `akips/templates/`. Clear association between tool and templates.

### Project-Level Resources
**Use for:**
- Cross-cutting documentation (parsing best practices)
- General principles applicable to all skills
- Index to skill-specific resources
- Project-wide conventions

---

## Quick Reference

| If you need... | Check here... |
|----------------|---------------|
| Parse switch output | `.claude/skills/netswitch/templates/` |
| Parse AKiPS data | `.claude/skills/akips/templates/` |
| Parse firewall output | `.claude/skills/panos/templates/` |
| General parsing principles | `.claude/templates/PARSING_BEST_PRACTICES.md` |
| Project overview | `/CLAUDE.md` |

---

## Contributing Templates

### Adding to Existing Skill
1. Navigate to skill's templates directory
2. Create template following skill's best practices
3. Test with real data
4. Update skill's templates/README.md
5. Reference from skill's SKILL.md

### Creating New Cross-Cutting Template
1. If template applies to multiple skills → put here
2. If template is skill-specific → put in skill/templates/
3. When in doubt → start skill-specific, move here if reused

---

**Last Updated:** March 17, 2026
**Structure:** Per-skill templates with project-level index
