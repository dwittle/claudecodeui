# Netswitch Templates

Templates for parsing and analyzing output from the netswitch skill (Cisco IOS/IOS-XE switches).

---

## Available Templates

### port_investigation.sh

**Use when:** Investigating port configuration or troubleshooting port issues

**Why this exists:** Demonstrates the MANDATORY protocol for answering port-related questions. Prevents the mistake of relying solely on `show interfaces status` output, which can be misleading when ports are down.

**Features:**
- ✅ Shows correct command sequence (running-config → status → details)
- ✅ Includes interpretation guidelines
- ✅ Demonstrates cross-validation between config and status
- ✅ Production-ready investigation script

**Usage:**
```bash
./port_investigation.sh b671-2235-sw1 Gi2/0/17
```

**What it does:**
1. **Step 1:** Gets running-config (source of truth)
2. **Step 2:** Gets operational status
3. **Step 3:** Gets detailed interface info
4. **Step 4:** Gets switchport details
5. **Analysis:** Provides interpretation guidelines

**Critical lesson:**
- Trunk ports show native VLAN (usually "1") when DOWN in status output
- Always check running-config FIRST to see actual configuration
- Cross-validate config vs status to understand true port state

**Related:** See "PORT INVESTIGATION PROTOCOL - MANDATORY" section in `../SKILL.md`

---

### interface_parser.py

**Use when:** Parsing `show interfaces status` output

**Why this exists:** Prevents the "Gi2/0/4 bug" - a position-based parsing error that silently excluded ports with multi-word descriptions, leading to incorrect network analysis.

**Features:**
- ✅ Anchor-based parsing (immune to variable-length descriptions)
- ✅ Built-in validation (warns if <90% of lines parsed)
- ✅ Diagnostic output (shows sample results, statistics)
- ✅ Production-tested (99% success rate)

**Usage:**
```bash
# Direct usage
python3 interface_parser.py switch_interfaces_status.txt

# As a template for custom parser
cp interface_parser.py my_custom_parser.py
# Edit parse_interface_status_line() for your format
# Keep the anchor-based approach and validation
```

**Input format expected:**
```
Port      Name               Status       Vlan       Duplex  Speed Type
Gi1/0/1   device1           connected    10         a-full  a-100 10/100BaseTX
Gi2/0/4   JB3 - CRYO TARPOS err-disabled 4          full    100   100BaseFX SFP
```

**Output:**
```
PARSING SUMMARY
Total interfaces parsed: 96
Status Distribution:
  disabled               61 ports
  notconnect             18 ports
  connected              16 ports
  err-disabled            1 ports
...
✓ Parsing completed successfully
```

**Test results:**
- Tested on: b581-diag-bdf switch (97 lines)
- Success rate: 96/97 (99%)
- Found: Gi2/0/4 with multi-word description "JB3 - CRYO TARPOS"
- Validation: All 11 multi-word descriptions parsed correctly

---

## Coming Soon

### cdp_parser.py
Parse `show cdp neighbors detail` output with proper handling of multi-word device names.

### trunk_parser.py
Parse `show interfaces trunk` with VLAN list extraction.

### vlan_parser.py
Parse `show vlan brief` output.

---

## Best Practices

Before writing a new netswitch parser:

1. **Read the general parsing guide:**
   ```bash
   cat ../../templates/PARSING_BEST_PRACTICES.md
   ```

2. **Use this template as starting point:**
   ```bash
   cp interface_parser.py my_new_parser.py
   ```

3. **Keep these patterns:**
   - Anchor-based parsing (find keywords first)
   - Validation (count checks, sample output)
   - Diagnostics (show what was parsed)
   - Error handling (graceful failures)

4. **Test with edge cases:**
   - Multi-word descriptions
   - Special characters (', ", -, /)
   - Empty fields
   - Malformed lines

---

## The Gi2/0/4 Bug Story

**What happened:** A parser used hardcoded column ranges (`if 2 <= index <= 5`) to detect VLAN numbers. Port Gi2/0/4 had description "JB3 - CRYO TARPOS" (4 tokens after split), which pushed the VLAN column from index 4 → 6, outside the expected range. Port was silently excluded from analysis.

**Impact:** Incorrectly reported "port never operational in 6 months" when it actually had 51 state-change events and was operational 2 days ago.

**Prevention:** This template uses anchor-based parsing (finds status keyword first, calculates positions relative to that anchor), making it immune to variable-length fields.

**Full case study:** See `ANALYSIS_OF_6MONTH_HISTORY_ERROR.md` in project root.

---

## Contributing New Templates

When adding a new netswitch template:

1. Create the parser with anchor-based approach
2. Add validation and diagnostics
3. Test with real switch output (edge cases!)
4. Document in this README:
   - What command output it parses
   - Why it exists / what problem it solves
   - Usage examples
   - Test results
5. Update the "Available Templates" section above

---

## Related Documentation

- **General parsing principles:** `../../templates/PARSING_BEST_PRACTICES.md`
- **Netswitch skill usage:** `../SKILL.md`
- **Project guide:** `/CLAUDE.md`

---

**Last Updated:** March 17, 2026
**Maintained by:** Network analysis team
