# Best Practices for Parsing Network Device Output

## Executive Summary

This document captures lessons learned from a critical parsing bug that caused incorrect network analysis results. The bug silently excluded a port from analysis because its multi-word description shifted column positions beyond expected ranges.

**Key Principle:** Never use fixed column positions when parsing text output with variable-length fields.

---

## The Bug That Started This Document

### What Happened
- **Task:** Analyze 27 down optical ports on VLAN 4, find when each was last operational
- **Result:** Reported all 27 ports "never up in 6 months"
- **Reality:** One port (Gi2/0/4) was operational 2 days ago with 51 state-change events
- **Root Cause:** Parser silently excluded Gi2/0/4 due to position-based column detection

### The Parsing Failure

```python
# BAD CODE - This silently failed
for i, part in enumerate(parts):
    if part == '4':
        if i >= 2 and i <= 5:  # ← Hardcoded range
            vlan = '4'
```

**Test Input:**
```
Gi2/0/3   sentinel04 -33     notconnect   4            full    100 100BaseFX SFP
Gi2/0/4   JB3 - CRYO TARPOS  err-disabled 4            full    100 100BaseFX SFP
```

**What Happened:**
- **Gi2/0/3**: Description = 2 tokens → VLAN at index 4 → ✅ Passed (2 ≤ 4 ≤ 5)
- **Gi2/0/4**: Description = 4 tokens → VLAN at index 6 → ❌ Failed (6 > 5)

**Impact:**
- Gi2/0/4 silently excluded from analysis
- No error message, no warning
- Incorrect conclusion propagated through reports
- Required user skepticism ("are you looking at the akips history?") to catch

---

## Universal Parsing Principles

### 1. Use Anchor-Based Parsing

**Find fixed keywords first, then calculate positions relative to anchors.**

```python
# GOOD: Anchor-based parsing
parts = line.split()

# Find status keyword (fixed vocabulary)
status_idx = -1
for i, part in enumerate(parts):
    if part in ['connected', 'notconnect', 'disabled', 'err-disabled']:
        status_idx = i
        break

if status_idx == -1:
    return None  # Can't parse, exit gracefully

# Now work relative to the anchor
interface = parts[0]
description = ' '.join(parts[1:status_idx])
vlan = parts[status_idx + 1] if status_idx + 1 < len(parts) else None
```

### 2. Never Hardcode Column Indices

```python
# ❌ BAD: Assumes VLAN is always at index 4
vlan = parts[4]

# ❌ BAD: Assumes VLAN is within a range
if 2 <= vlan_index <= 5:
    vlan = parts[vlan_index]

# ✅ GOOD: Find by relationship to known anchor
status_idx = find_status_column(parts)
vlan = parts[status_idx + 1]  # VLAN follows status

# ✅ GOOD: Search for value matching criteria
vlan = next((p for p in parts if p.isdigit() and 1 <= int(p) <= 4094), None)
```

### 3. Handle Variable-Length Fields

```python
# ❌ BAD: Assumes single-token description
description = parts[1]

# ✅ GOOD: Join everything between known anchors
interface_idx = 0
status_idx = find_status_column(parts)
description = ' '.join(parts[interface_idx + 1:status_idx])
```

### 4. Validate Assumptions

```python
# ✅ Add validation checks
def parse_interface_line(line):
    parts = line.split()

    # Validate minimum column count
    if len(parts) < 5:
        raise ValueError(f"Insufficient columns: {len(parts)} < 5")

    # Validate interface name format
    if not re.match(r'^[A-Z][a-z]\d+/\d+(/\d+)?$', parts[0]):
        raise ValueError(f"Invalid interface format: {parts[0]}")

    # Find status with validation
    status = None
    for part in parts:
        if part in VALID_STATUSES:
            status = part
            break

    if not status:
        raise ValueError(f"No valid status found in: {line}")

    return parse_result
```

### 5. Add Diagnostic Output

```python
# ✅ Print parsing diagnostics during development
def parse_with_diagnostics(line, debug=False):
    parts = line.split()

    if debug:
        print(f"Input: {line}")
        print(f"Split: {parts}")
        for i, part in enumerate(parts):
            print(f"  [{i}] = {part}")

    result = parse_line_internal(parts)

    if debug:
        print(f"Result: {result}")

    return result
```

### 6. Test Edge Cases

```python
# ✅ Comprehensive test suite
test_cases = [
    # Normal cases
    ("Gi1/0/1   device1    connected    10     full  100  SFP", {...}),

    # Edge cases
    ("Gi2/0/4   JB3 - CRYO TARPOS  err-disabled 4  full  100  SFP", {...}),  # Multi-word description
    ("Gi1/0/10              notconnect   4      auto  auto SFP", {...}),      # No description
    ("Te1/1/1   UPLINK     connected    trunk  full  10G  SFP+", {...}),      # Trunk port
    ("Gi3/0/34  sentinel04 29'6\"  notconnect  4  full  100  SFP", {...}),   # Special chars

    # Error cases
    ("Port      Name       Status       Vlan", None),                          # Header line
    ("", None),                                                                 # Empty line
    ("Gi1/0/1", None),                                                         # Insufficient columns
]

for line, expected in test_cases:
    result = parse_interface_line(line)
    assert result == expected, f"Failed for: {line}"
```

---

## Specific Parsing Patterns

### Pattern: Cisco IOS "show interfaces status"

**Format:**
```
Port      Name               Status       Vlan       Duplex  Speed Type
Gi1/0/1   description here   connected    10         a-full  a-100 10/100BaseTX
```

**Characteristics:**
- Interface name: Fixed position (column 0)
- Description: Variable length (columns 1 to N)
- Status: Fixed vocabulary (connected, notconnect, etc.)
- VLAN: After status
- Type: Last column

**Robust Parser:**
```python
def parse_ios_interface_status(line):
    """Parse Cisco IOS 'show interfaces status' output."""
    parts = line.strip().split()

    # Skip headers and empty lines
    if not parts or parts[0] == 'Port':
        return None

    # Minimum columns: Port Status VLAN
    if len(parts) < 3:
        return None

    # Find status anchor
    VALID_STATUSES = ['connected', 'notconnect', 'disabled', 'err-disabled',
                      'monitoring', 'faulty', 'inactive']
    status_idx = next((i for i, p in enumerate(parts) if p in VALID_STATUSES), None)

    if status_idx is None:
        return None

    # Extract fields relative to status anchor
    interface = parts[0]
    description = ' '.join(parts[1:status_idx]) if status_idx > 1 else ''
    status = parts[status_idx]

    # VLAN is after status (unless 'trunk')
    vlan = parts[status_idx + 1] if status_idx + 1 < len(parts) else ''

    # Last 3 columns are typically Duplex, Speed, Type
    port_type = parts[-1] if len(parts) >= 1 else ''
    speed = parts[-2] if len(parts) >= 2 else ''
    duplex = parts[-3] if len(parts) >= 3 else ''

    return {
        'interface': interface,
        'description': description,
        'status': status,
        'vlan': vlan,
        'duplex': duplex,
        'speed': speed,
        'type': port_type,
        'raw_line': line
    }
```

### Pattern: Cisco IOS "show cdp neighbors"

**Format:**
```
Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
switch1          Gig 1/0/1         150        R S I       WS-C3750  Gig 1/0/24
```

**Key Challenge:** Multi-word device names, variable-length fields

**Strategy:**
```python
def parse_cdp_neighbors(line):
    """Parse CDP neighbors with multi-word device names."""
    # Use regex with capture groups instead of split()
    pattern = r'^(\S+)\s+([A-Z][a-z]{1,2}\s?\d+/\d+(?:/\d+)?)\s+(\d+)\s+'
    match = re.match(pattern, line)

    if not match:
        return None

    device_id = match.group(1)
    local_intf = match.group(2)
    holdtime = int(match.group(3))

    # Rest of the line after holdtime
    remainder = line[match.end():]
    parts = remainder.split()

    capability = parts[0] if len(parts) > 0 else ''
    platform = parts[1] if len(parts) > 1 else ''
    remote_port = ' '.join(parts[2:]) if len(parts) > 2 else ''

    return {
        'device_id': device_id,
        'local_interface': local_intf,
        'holdtime': holdtime,
        'capability': capability,
        'platform': platform,
        'remote_port': remote_port
    }
```

---

## Alternative Approaches

When possible, avoid text parsing entirely:

### 1. Use Structured Output (if available)

```bash
# Cisco IOS-XE / NX-OS
show interfaces status | json

# Juniper
show interfaces | display json

# Arista EOS
show interfaces status | json
```

### 2. Use SNMP

```python
# Query IF-MIB directly
from pysnmp.hlapi import *

def get_interface_status(host, community):
    for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
        SnmpEngine(),
        CommunityData(community),
        UdpTransportTarget((host, 161)),
        ContextData(),
        ObjectType(ObjectIdentity('IF-MIB', 'ifOperStatus'))
    ):
        if errorIndication or errorStatus:
            break
        else:
            for varBind in varBinds:
                print(varBind)
```

### 3. Use TextFSM Templates

```python
import textfsm

# Use community-maintained templates
template = """
Value Required INTERFACE (\S+)
Value NAME (.+?)
Value STATUS (connected|notconnect|disabled|err-disabled)
Value VLAN (\S+)
Value DUPLEX (\S+)
Value SPEED (\S+)
Value TYPE (\S+)

Start
  ^${INTERFACE}\s+${NAME}\s+${STATUS}\s+${VLAN}\s+${DUPLEX}\s+${SPEED}\s+${TYPE} -> Record
"""

with open('template.textfsm', 'w') as f:
    f.write(template)

# Parse with TextFSM
results = textfsm.TextFSM(open('template.textfsm')).ParseText(output)
```

### 4. Use NETCONF/RESTCONF APIs

```python
from ncclient import manager

# NETCONF query
with manager.connect(host='switch1', port=830, username='admin',
                     password='pass', hostkey_verify=False) as m:
    result = m.get_config(source='running',
                          filter=('subtree', '<interfaces/>'))
    print(result)
```

---

## Checklist for Parser Development

### Before Writing Parser

- [ ] Check if structured output format is available (JSON, XML)
- [ ] Check if SNMP MIB provides the data
- [ ] Check if TextFSM template exists
- [ ] Review actual output samples with edge cases

### While Writing Parser

- [ ] Identify fixed keywords that can serve as anchors
- [ ] Use anchor-based positioning, not absolute indices
- [ ] Join variable-length fields correctly
- [ ] Add length and format validation
- [ ] Handle missing/empty fields gracefully
- [ ] Add diagnostic output for debugging

### After Writing Parser

- [ ] Test with normal cases
- [ ] Test with edge cases (long descriptions, special chars, empty fields)
- [ ] Test with malformed input (missing columns, wrong format)
- [ ] Verify counts match expected totals
- [ ] Document assumptions and limitations

---

## Error Detection Strategies

### 1. Count Validation

```python
# Count parsed items vs expected
parsed_ports = parse_all_interfaces(output)
total_lines = len([l for l in output.split('\n') if l and not l.startswith('Port')])

if len(parsed_ports) < total_lines * 0.9:  # Missing >10% of lines
    print(f"WARNING: Only parsed {len(parsed_ports)}/{total_lines} lines")
    print("Review parser for edge cases")
```

### 2. Field Distribution Analysis

```python
# Analyze field patterns
descriptions = [p['description'] for p in parsed_ports]
empty_desc = sum(1 for d in descriptions if not d)
multi_word = sum(1 for d in descriptions if ' ' in d)

print(f"Empty descriptions: {empty_desc}/{len(descriptions)}")
print(f"Multi-word descriptions: {multi_word}/{len(descriptions)}")

# If ALL descriptions are empty, parser might be broken
if empty_desc == len(descriptions):
    print("ERROR: All descriptions empty - parser may be broken")
```

### 3. Sample Output Verification

```python
# Always print first few parsed results for manual verification
print("\nFirst 5 parsed results:")
for i, port in enumerate(parsed_ports[:5], 1):
    print(f"{i}. {port}")

print("\nLast 5 parsed results:")
for i, port in enumerate(parsed_ports[-5:], len(parsed_ports)-4):
    print(f"{i}. {port}")
```

---

## Lessons Learned from the Gi2/0/4 Bug

### What Went Wrong
1. ✗ Used hardcoded column range (2-5) for VLAN detection
2. ✗ Didn't test with multi-word descriptions
3. ✗ Silent failure - no error message when port excluded
4. ✗ Didn't validate parsed count vs input count
5. ✗ Propagated incomplete list through multiple scripts

### What Worked
1. ✓ User skepticism caught the error ("are you looking at akips history?")
2. ✓ Manual verification of raw data revealed discrepancy
3. ✓ Adding event counts exposed the missing port
4. ✓ Anchor-based rewrite fixed the issue

### How to Prevent
1. ✓ Always use anchor-based parsing
2. ✓ Test with edge cases before production use
3. ✓ Add count validation (parsed vs total lines)
4. ✓ Print diagnostic summaries (event counts, ports analyzed)
5. ✓ Document assumptions and test cases

---

## Conclusion

> **Text parsing of network device output is inherently fragile.**
>
> When you must parse text:
> 1. Use anchor-based positioning
> 2. Validate aggressively
> 3. Test edge cases
> 4. Add diagnostic output
> 5. Never assume fixed column positions
>
> When possible, use structured APIs instead.

**Remember:** One silently excluded port led to incorrect analysis that almost went unnoticed. Robust parsing isn't optional—it's essential for accurate network analysis.
