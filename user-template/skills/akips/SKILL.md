---
name: akips
version: 1.0.0
description: Query and monitor AKiPS network management systems
authors:
  - tucker28
tags:
  - network
  - monitoring
  - akips
  - snmp
command: ./akips
args: []
env: {}
---

## IMPORTANT - For Claude Code

**When this skill is invoked via the Skill tool, you will see:**
```
Base directory for this skill: <SKILL_BASE_DIR>
```

**ALWAYS use that base directory path! Do not hardcode paths.**

**To invoke this skill's commands:**

**Option 1: Use the base directory provided (RECOMMENDED)**
```bash
cd <SKILL_BASE_DIR>
./akips [command]
```

**Option 2: Use full path with environment variable**
```bash
# If SKILL_BASE_DIR is available:
${SKILL_BASE_DIR}/akips [command]

# Or construct from the base directory shown in output:
<SKILL_BASE_DIR>/akips [command]
```

**Example:**
If you see "Base directory for this skill: /opt/skills/akips"
Then use:
```bash
cd /opt/skills/akips && ./akips get-device-info sy2-307
```

**Do NOT hardcode paths like `/space/tucker28/...` - the skill may be installed elsewhere!**

# AKiPS Network Monitoring Tool

Direct CLI interface for querying and monitoring AKiPS network management systems.

## Available Commands

### list-devices
List devices in AKiPS with optional pattern and group filtering.

**Usage:** `list-devices [--pattern PATTERN] [--group GROUP]`

**Examples:**
- List all devices
- Filter by pattern: `--pattern "router*"`
- Filter by group: `--group production`

### list-interfaces
List interfaces on device(s) with filtering options.

**Usage:** `list-interfaces [--device DEVICE] [--interface INTERFACE] [--group GROUP]`

**Examples:**
- List all interfaces
- Filter by device: `--device "router01"`
- Filter by interface pattern: `--interface "GigabitEthernet*"`

### get-device-info
Get detailed information about a specific device including sysName, sysLocation, sysDescr, IP addresses, etc.

**Usage:** `get-device-info DEVICE`

**Example:** `get-device-info router01`

### get-top-interfaces
Get top N interfaces by traffic or utilization. Useful for finding busiest interfaces.

**Usage:** `get-top-interfaces N [--time-filter FILTER] [--attribute ATTR] [--group GROUP]`

**Parameters:**
- `N`: Number of results to return (required)
- `--time-filter`: Time period (e.g., yesterday, last1h, last24h, last7d)
- `--attribute`: Metric to measure (e.g., /ifHCInOctets/, /ifHCOutOctets/)
- `--group`: Optional group name to filter by

**Examples:**
- Top 10 interfaces: `get-top-interfaces 10`
- Last 24 hours: `get-top-interfaces 20 --time-filter last24h`
- Incoming traffic only: `get-top-interfaces 10 --attribute "/ifHCInOctets/"`

### get-events
Get events from AKiPS (interface down/up, threshold violations, uptime resets, etc.).

**Usage:** `get-events EVENT_TYPE TIME_FILTER [--device DEVICE] [--child CHILD] [--attribute ATTR] [--group GROUP]`

**Event Types:**
- `all` - All events
- `critical` - Critical events only
- `enum` - Status change events
- `threshold` - Threshold violation events
- `uptime` - Uptime reset events

**Time Filters:** last1h, last24h, yesterday, today, last7d, etc.

**Examples:**
- All recent events: `get-events all last1h`
- Critical events: `get-events critical last24h --device "router*"`
- Status changes today: `get-events enum today`

### get-series-data
Get time-series historical data for counters, gauges, or RTT.

**Usage:** `get-series-data INTERVAL TIME_FILTER ATTR_TYPE [--device DEVICE] [--child CHILD] [--attribute ATTR] [--group GROUP]`

**Parameters:**
- `INTERVAL`: Interval in seconds (300=5min, 3600=1hr, 86400=1day)
- `TIME_FILTER`: Time period (e.g., yesterday, last24h)
- `ATTR_TYPE`: Attribute type (counter, gauge, rtt)

**Examples:**
- Hourly data for yesterday: `get-series-data 3600 yesterday counter`
- 5-minute intervals: `get-series-data 300 last24h counter --device "router01" --attribute "/ifHCInOctets/"`

### list-groups
List available groups of a specific type.

**Usage:** `list-groups [--group-type TYPE]`

**Examples:**
- List device groups: `list-groups`
- List interface groups: `list-groups --group-type interface`

### execute
Execute a raw AKiPS command for advanced queries.

**Usage:** `execute "COMMAND"`

**Examples:**
- `execute "mlist device *"`
- `execute "list device group"`

## Configuration

### Hardcoded Defaults
The tool uses the following hardcoded default values:
```
AKIPS_SERVER=akipsdcm0001.llnl.gov
AKIPS_USERNAME=api-ro
AKIPS_VERIFY_SSL=false
```

These defaults can be overridden by setting environment variables or creating a `.env` file.

### Required Environment Variable
**IMPORTANT:** The API password MUST be set as a shell environment variable:
```bash
export AKIPS_API_PASSWORD=your-api-password-here
```

The password is intentionally NOT read from the `.env` file for security reasons.

### Optional Overrides
To override the defaults, set environment variables or create a `.env` file:
```
AKIPS_SERVER=your-custom-server.example.com
AKIPS_USERNAME=api-ro
AKIPS_VERIFY_SSL=false
```

## Output Format

All commands (except `execute`) return JSON-formatted output for easy parsing and integration.

## Pattern Matching


When searching for devices in AKiPS, always use regex pattern syntax `/pattern/` instead of wildcard patterns.

**Why:** Wildcard patterns like `b391*` or `*b391*` may return empty results even when matching devices exist. Regex patterns like `/^b391/` work reliably.

**How to apply:** 
- Use `--pattern "/^prefix/"` for devices starting with a prefix
- Use `--pattern "/pattern/"` for devices containing a pattern
- Don't use wildcard syntax like `prefix*` - use regex instead

**Example:**
```bash
# ❌ WRONG - May return empty results
./akips list-devices --pattern "b391*"

# ✅ CORRECT - Returns all devices starting with b391
./akips list-devices --pattern "/^b391/"

## Determining Current Device Status

**CRITICAL:** Time-series data shows historical values in chronological order. The presence of data does NOT mean a device is currently up!

### Best Practice Workflow

To determine if a device is **currently** up or down:

1. **Check Recent Events First** (get-events)
   ```bash
   get-events enum last1h --device "devicename"
   ```
   - Look for recent `SNMP.snmpState` or `PING.icmpState` events
   - Events show state **changes** with timestamps
   - If last event shows "down" with no subsequent "up", device is likely down

2. **Verify with Time-Series Data** (get-series-data)
   ```bash
   get-series-data 300 last3h rtt --device "devicename"
   ```
   - **IMPORTANT:** Check the **LAST** values in the array, not just presence of data
   - Empty string `""` = failed ping attempt
   - Numeric value = successful ping with RTT in microseconds
   - If last 10-20 values are all empty, device is DOWN

3. **Cross-Reference Both Sources**
   - Events tell you WHEN status changed
   - Series data confirms CURRENT status
   - Both should align for accurate assessment

### Common Mistakes to Avoid

❌ **WRONG:** "Series data has RTT values, so device is up"
- Values may be from hours ago; check the **last** values

❌ **WRONG:** "No recent events means device is down"
- No events may mean device is stable; check series data

✅ **CORRECT:** Check last 10-20 data points in series data for current status

### Example: Checking if a Switch is Down

```python
# After getting series data, check the LAST values:
{
  "series_data": {
    "switch-1 ping4 PING.icmpRtt": [
      "12000",  # Historical - device was up
      "11500",  # Historical - device was up
      "",       # Device went down
      "",       # Still down
      "",       # Still down (most recent)
    ]
  }
}
```

**Interpretation:** Last 3 values are empty = Device is **DOWN**

### Time-Series Data Format

- **Array Order:** Chronological (oldest to newest)
- **Empty Values:** `""` indicates no data/failure
- **RTT Values:** Microseconds (e.g., "12000" = 12ms)
- **Interval:** Specified in your query (300s = 5min, 3600s = 1hr)

### Quick Status Check Commands

**Is device responding to ping?**
```bash
# Check last hour of ping data
get-series-data 300 last1h rtt --device "devicename"
# Look at the LAST 5-10 values in PING.icmpRtt array
```

**When did device go down?**
```bash
# Check events for state changes
get-events enum last24h --device "devicename"
# Look for PING.icmpState or SNMP.snmpState "down" events
```

## API Limitations

Based on comprehensive testing, be aware that:
- **NO `limit` parameter** - The AKiPS API does not support limiting results server-side
- **Only `total` and `avg` aggregations** - `max`, `min`, and `median` are NOT supported
- **Group names must be exact** - Wildcards in group names don't work. Query available groups first
- **Strict command syntax** - Follow the documented patterns exactly

## Troubleshooting Examples

### Example 1: Device Appears Down But Has RTT Data

**Scenario:** You see RTT values in series data but device is actually down.

**Problem:**
```json
{
  "series_data": {
    "sy2-307 ping4 PING.icmpRtt": [
      "14608", "21192", "22240", ... (107 values), "", "", "", ""
    ]
  }
}
```

**Mistake:** Seeing 107 RTT values and concluding device is up.

**Correct Analysis:**
- Total data points: 288 (full day at 5-min intervals)
- Successful pings: 107 (early morning)
- Failed pings: 181 (rest of day)
- **Last 20 values:** All empty `""` = Device is DOWN
- **Conclusion:** Device was up until ~8:50 AM, has been down since

**Lesson:** Always check the **last** values in the array, not just the count of non-empty values.

### Example 2: Finding Exact Downtime

**Step 1:** Check events for when device went down
```bash
get-events enum last24h --device "sy2-307"
```
Result: `08:49:15 - SNMP.snmpState: warning down`

**Step 2:** Verify with series data
```bash
get-series-data 300 today rtt --device "sy2-307"
```
Result: Last 181 values are empty

**Step 3:** Calculate downtime
- 181 failed attempts × 5 minutes = 905 minutes = ~15 hours
- Confirms device has been down since morning

### Example 3: Device is Up But No Recent Events

**Scenario:** Device shows no events in last hour, is it down?

**Check series data:**
```bash
get-series-data 300 last1h rtt --device "pam-sw-q36b"
```
```json
{
  "sy2-307 ping4 PING.icmpRtt": [
    "1840", "2688", "1816", "4512", "1872", "2032"
  ]
}
```

**Analysis:**
- All recent values have RTT data (no empty strings)
- Device is responding normally (1.8-4.5ms RTT)
- **Conclusion:** Device is UP and stable
- No events = Good (stable device doesn't generate state change events)

### Key Takeaways

1. **Time-series arrays are chronological** - last values = most recent
2. **Empty strings = failures** - check the tail of the array
3. **Events show CHANGES** - no events can mean stability
4. **Always correlate** events (when) + series data (current status)
5. **Don't assume** - verify device status with multiple data points

## Documentation

See the `docs/` directory for comprehensive AKiPS API documentation:
- `akips_critical.md` - Critical findings and limitations
- `akips-docs.txt` - Full API reference
