# PAN-OS Templates

Templates for parsing and analyzing output from the panos skill (PAN-OS firewalls).

---

## Available Templates

*No templates yet - contributions welcome!*

## Potential Templates

### session_parser.py
Parse `show session all` output:
- Extract active sessions
- Group by source/destination/application
- Identify top talkers
- Calculate session statistics

### log_parser.py
Parse PAN-OS log output:
- Traffic logs
- Threat logs
- URL filtering logs
- Authentication logs

### policy_parser.py
Parse `show running security-policy` output:
- Extract policy rules
- Identify unused policies
- Analyze rule order/efficiency
- Generate policy documentation

### interface_parser.py
Parse `show interface all` output:
- Interface status and statistics
- Link state tracking
- Throughput analysis
- Error rate monitoring

---

## Best Practices for PAN-OS Parsers

### 1. Use Structured Output When Available
PAN-OS supports XML output for many commands:

```bash
# Better: Use XML mode
./panos show fw1 "show system info" --format xml

# Parse XML instead of text
import xml.etree.ElementTree as ET
```

### 2. Handle Multi-Line Output
PAN-OS output often spans multiple lines per entry:

```python
# Buffer lines that belong together
current_entry = []
for line in output:
    if line.startswith('Session'): # Start of new entry
        if current_entry:
            process_entry(current_entry)
        current_entry = [line]
    else:
        current_entry.append(line)
```

### 3. Parse Tables Carefully
PAN-OS tables have varying column widths:

```python
# Don't rely on column positions
# Use column headers to identify fields
header_line = lines[0]
data_lines = lines[1:]

# Find column positions from header
col_positions = [header_line.find(col) for col in columns]
```

### 4. Handle Continuation Lines
Long values may wrap to next line:

```python
# Look for indentation patterns
if line.startswith('  '):  # Continuation
    previous_field += ' ' + line.strip()
```

---

## PAN-OS Output Characteristics

Unlike Cisco IOS:
- More verbose output
- Multi-line entries common
- XML/JSON often available (prefer these!)
- Hierarchical structure in config output
- Some commands require explicit paging

---

## Contributing

To add a PAN-OS template:

1. Create parser following best practices above
2. Prefer XML/JSON parsing over text when available
3. Test with real firewall output
4. Document which PAN-OS versions tested
5. Update this README

---

## Related Documentation

- **PAN-OS skill usage:** `../SKILL.md`
- **General parsing principles:** `../../templates/PARSING_BEST_PRACTICES.md`
- **Project guide:** `/CLAUDE.md`

---

**Last Updated:** March 17, 2026
**Status:** Templates directory created, awaiting first template
