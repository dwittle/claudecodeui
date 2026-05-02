# Todo - Nice to Have Features

This document tracks enhancement ideas and nice-to-have features for future implementation.

## Current Date: 2026-03-17

---

## Claude Code Enhancements

### 🕐 Date/Time Tool
**Priority:** Low
**Status:** Proposed
**Date Added:** 2026-03-17

**Description:**
Add a dedicated tool for getting current date/time information without needing Bash commands.

**Use Cases:**
- Quick time references during analysis
- Calculating downtime/uptime durations
- Timestamp comparisons with AKiPS data
- Faster time-based calculations

**Current Workaround:**
```bash
date "+%Y-%m-%d %H:%M:%S"  # Current datetime
date +%s                    # Unix timestamp
```

**Proposed Tool Interface:**
```
GetTime() → {
  "datetime": "2026-03-17 15:31:57",
  "epoch": 1773786717,
  "timezone": "PDT",
  "date": "2026-03-17",
  "time": "15:31:57"
}
```

**Benefits:**
- Reduces Bash tool overhead for simple time queries
- Consistent timestamp format
- Less verbose conversations
- Instant time reference without command blocks

**Impact:** Low - Current Bash approach works fine, this is just convenience

---

## Skills Enhancements

### 📂 Skills PATH Configuration & Portability
**Priority:** High
**Status:** Completed (Portability for all skills) / Documented (PATH setup awaiting user decision)
**Date Added:** 2026-03-17
**Date Updated:** 2026-03-17

**Description:**
Claude Code frequently forgets to `cd` to the correct skill directory before running commands, causing "No such file or directory" errors.

**Problem:**
```bash
# This fails if not in the right directory:
./akips get-device-info sy2-307
# Error: ./akips: No such file or directory
```

**Current Workaround:**
- Always use full paths: `/space/tucker28/code/python/skills/tmp/.claude/skills/akips/akips`
- Or cd first: `cd /space/tucker28/code/python/skills/tmp/.claude/skills/akips && ./akips`
- Updated SKILL.md to remind Claude Code of correct paths

**Solutions Implemented:**
1. ✅ Updated all SKILL.md files (akips, netswitch, panos) with base directory instructions
2. ✅ Removed all hardcoded paths from documentation
3. ✅ Created self-locating helper script: `run-skill.sh`
4. ✅ Created setup guide: `SKILLS_PATH_SETUP.md`
5. ✅ Created comprehensive portability guide: `PORTABILITY.md`

**Recommended User Action:**
Add skills to PATH (see SKILLS_PATH_SETUP.md):
```bash
mkdir -p ~/.local/bin/skills
ln -sf /space/tucker28/code/python/skills/tmp/.claude/skills/akips/akips ~/.local/bin/skills/akips
ln -sf /space/tucker28/code/python/skills/tmp/.claude/skills/netswitch/netswitch ~/.local/bin/skills/netswitch
ln -sf /space/tucker28/code/python/skills/tmp/.claude/skills/panos/panos ~/.local/bin/skills/panos
echo 'export PATH="$HOME/.local/bin/skills:$PATH"' >> ~/.bashrc
```

**Benefits:**
- Skills work from any directory
- No more path-related errors
- Cleaner command syntax
- Standard Unix approach

**Impact:** High - Eliminates frequent source of errors

**Documentation:** See `SKILLS_PATH_SETUP.md` for complete guide

---

### 📊 AKiPS Skill Improvements

*(Placeholder for future AKiPS enhancement ideas)*

---

### 🔌 Network Switch Skill Improvements

*(Placeholder for future netswitch enhancement ideas)*

---

## Documentation Improvements

*(Track documentation enhancements here)*

---

## Template for New Entries

```markdown
### 📌 Feature Name
**Priority:** Low/Medium/High
**Status:** Proposed/In Progress/Completed
**Date Added:** YYYY-MM-DD

**Description:**
Brief description of the feature

**Use Cases:**
- Use case 1
- Use case 2

**Current Workaround:**
How we handle this now

**Proposed Solution:**
What the enhancement would look like

**Benefits:**
- Benefit 1
- Benefit 2

**Impact:** Low/Medium/High - explanation
```

---

## Completed Items

*(Move completed items here with completion date)*

---

## Notes

- Keep this file updated as new ideas emerge
- Prioritize based on frequency of need and impact
- Low priority items are "nice to have" but not blockers
- Medium/High priority should be considered for implementation
