# AKiPS Templates

Templates for parsing and analyzing data from the AKiPS skill (network monitoring system).

---

## Available Templates

*No templates yet - contributions welcome!*

## Potential Templates

### event_analyzer.py
Parse and analyze AKiPS event JSON data:
- Filter events by attribute (ifOperStatus, icmpState, etc.)
- Calculate up/down durations
- Identify flapping interfaces
- Generate timeline reports

**Input format:**
```json
{
  "events": [
    {
      "timestamp": "1758344346",
      "device": "switch1",
      "child": "Gi2/0/4",
      "attribute": "IF-MIB.ifOperStatus",
      "type": "enum",
      "details": "none down JB3 - CRYO TARPOS"
    }
  ]
}
```

### time_series_parser.py
Parse AKiPS time-series data (interface counters, CPU, memory):
- Extract data points from series JSON
- Calculate rates and deltas
- Identify anomalies
- Generate graphs

### rtt_analyzer.py
Analyze RTT (round-trip time) data:
- Calculate min/max/avg/percentiles
- Detect latency spikes
- Correlate with events
- Generate latency reports

---

## Best Practices for AKiPS Parsers

### 1. Work with JSON Data
AKiPS returns JSON, so use proper JSON parsing:

```python
import json
from datetime import datetime

with open('events.json') as f:
    data = json.load(f)
    events = data.get('events', [])

# Don't try to parse JSON as text!
```

### 2. Handle Timestamps
AKiPS timestamps are Unix epoch strings:

```python
timestamp = int(event['timestamp'])
dt = datetime.fromtimestamp(timestamp)
```

### 3. Filter Events Efficiently
Use list comprehensions with specific filters:

```python
# Filter by device and attribute
port_events = [e for e in events
               if e.get('child') == interface
               and 'ifOperStatus' in e.get('attribute', '')]
```

### 4. Parse Details Field Carefully
The 'details' field contains human-readable state changes:

```python
details = event.get('details', '').lower()

# Common patterns
if 'up' in details and 'down' not in details:
    state = 'up'
elif 'down' in details:
    state = 'down'
```

### 5. Sort Events Before Analysis
Events may not be in chronological order:

```python
events.sort(key=lambda x: int(x['timestamp']))
```

---

## Contributing

To add an AKiPS template:

1. Create parser that follows best practices above
2. Add validation (check event counts, required fields)
3. Test with real AKiPS data
4. Document usage and test results
5. Update this README

---

## Related Documentation

- **AKiPS skill usage:** `../SKILL.md`
- **General parsing principles:** `../../templates/PARSING_BEST_PRACTICES.md`
- **Project guide:** `/CLAUDE.md`

---

**Last Updated:** March 17, 2026
**Status:** Templates directory created, awaiting first template
