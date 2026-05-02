# Skills Repository Reorganization Plan

## Objective

Reorganize the project layout so that source code lives at the root level of the repository, and the `install.sh` scripts install from the root into a target directory's `.claude/skills/` location.

## Current Structure (Before Reorganization)

```
/space/tucker28/code/python/skills/
├── README.md
├── .gitignore
├── akips/                              # ✓ Already at root - CORRECT
│   ├── akips_cli.py
│   ├── akips_client.py
│   ├── SKILL.md
│   └── ...
├── netswitch/                          # Container directory (OLD)
│   ├── .claude/
│   │   └── skills/
│   │       ├── netswitch/             # ← Actual source code (NEEDS MOVING)
│   │       │   ├── netswitch_cli.py
│   │       │   ├── netswitch_client.py
│   │       │   ├── SKILL.md
│   │       │   └── ...
│   │       └── panos/                 # ← Actual source code (NEEDS MOVING)
│   │           ├── panos_cli.py
│   │           ├── panos_client.py
│   │           ├── SKILL.md
│   │           └── ...
│   ├── netswitch_cli.py               # Old duplicate files
│   ├── netswitch_client.py            # Old duplicate files
│   ├── install.sh                     # Old installer
│   └── ...
```

## Target Structure (After Reorganization)

```
/space/tucker28/code/python/skills/
├── README.md
├── .gitignore
├── akips/                              # Source code ✓
│   ├── akips_cli.py
│   ├── akips_client.py
│   ├── SKILL.md
│   ├── install.sh
│   └── ...
├── netswitch/                          # Source code (moved)
│   ├── netswitch_cli.py
│   ├── netswitch_client.py
│   ├── SKILL.md
│   ├── install.sh
│   └── ...
└── panos/                              # Source code (moved)
    ├── panos_cli.py
    ├── panos_client.py
    ├── SKILL.md
    ├── setup.sh
    └── ...
```

## After Installation (How Users Use It)

When a user runs the install script:

```bash
cd /space/tucker28/code/python/skills/netswitch
./install.sh ~/myproject
```

It creates:

```
~/myproject/.claude/skills/netswitch/
├── netswitch_cli.py
├── netswitch_client.py
├── SKILL.md
├── .venv/
└── ...
```

## Benefits of This Structure

1. **Cleaner Repository**: Source code is at the root, not nested in `.claude/skills/`
2. **Better for Development**: Developers work directly in the skill directories
3. **Clearer Separation**: Repository structure ≠ Installation structure
4. **Standard Pattern**: Each skill is a top-level directory with its own `install.sh`
5. **Matches Existing Pattern**: `akips/` already follows this structure

## Steps to Complete Reorganization

### Current Progress

- ✅ **Step 1**: Moved `netswitch/.claude/skills/panos/` → `skills/panos/`
- ✅ **Step 2**: Renamed `netswitch/` → `netswitch_old/`
- ⏳ **Step 3**: Move `netswitch_old/.claude/skills/netswitch/` → `skills/netswitch/` (IN PROGRESS)

### Remaining Steps

```bash
cd /space/tucker28/code/python/skills

# Step 3: Remove empty netswitch directory (created accidentally)
rmdir netswitch

# Step 4: Move netswitch source code to root
mv netswitch_old/.claude/skills/netswitch ./netswitch

# Step 5: Verify the move worked
ls -la netswitch/

# Step 6: Clean up old directory structure
rm -rf netswitch_old

# Step 7: Verify final structure
ls -la
# Should show: akips/ netswitch/ panos/ README.md .gitignore .git/
```

## Files That Need Updating After Reorganization

### 1. netswitch/install.sh
Update to install FROM root TO target:
```bash
# OLD: Assumes running from nested location
# NEW: Install from /skills/netswitch/ to target/.claude/skills/netswitch/
```

### 2. panos/setup.sh (or create panos/install.sh)
Update to install FROM root TO target:
```bash
# Install from /skills/panos/ to target/.claude/skills/panos/
```

### 3. Root CLAUDE.md
Update paths in examples:
```bash
# OLD: cd /space/tucker28/code/python/skills/netswitch/.claude/skills/netswitch
# NEW: cd /space/tucker28/code/python/skills/netswitch
```

### 4. Individual skill CLAUDE.md files
Update paths to reflect new structure

### 5. Root README.md
Already correct - documents the install pattern properly

## Current Verified State

As of 2026-03-10 19:24:

```
/space/tucker28/code/python/skills/
├── akips/                              ✓ Correct location
├── panos/                              ✓ Moved successfully
├── netswitch/                          ⚠️  Empty directory (needs to be replaced)
├── netswitch_old/                      ⚠️  Contains:
│   └── .claude/skills/netswitch/      ⚠️  Source code here (needs to move up)
└── README.md
```

## Why This Change?

The original structure had source code living in `.claude/skills/` which is confusing because:

1. **`.claude/` is for installed skills**, not source code
2. **Repository should contain source**, not pre-installed structure
3. **Makes it unclear where to edit code** when developing
4. **`akips/` was already at root level**, creating inconsistency
5. **Install scripts should create the `.claude/skills/` structure**, not the repository

## Expected Git Changes After Completion

```
renamed: netswitch/.claude/skills/panos/* -> panos/*
renamed: netswitch/.claude/skills/netswitch/* -> netswitch/*
deleted: netswitch/.claude/
deleted: netswitch/<old files>
```

## Troubleshooting Note

The Bash tool is currently having issues because the working directory (netswitch/) was renamed while operations were in progress. The commands above can be run manually to complete the reorganization.
