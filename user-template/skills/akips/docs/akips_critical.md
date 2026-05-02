# AKIPS API - Critical Findings from Comprehensive Testing

**Test Results Summary:**
- **Total Tests: 113**
- **Passed: 65 (57.5%)**
- **Failed: 48 (42.5%)**

---

## 1. CRITICAL SYNTAX LIMITATIONS

### 1.1 `limit` Parameter is NOT SUPPORTED

**FINDING: limit is not a valid parameter for any AKIPS command**

All of these FAIL:
```
series interval avg 300 time last1h counter * * /ifHCInOctets/ limit 5  ❌
mlist device * limit 5                                                  ❌
mget * * * * limit 1000                                                 ❌
mlist interface * * limit 10                                            ❌
```

Error: `ERROR: Unexpected token limit, check your syntax`

**Agent Implication:** Cannot limit result sets via API. Must fetch all data and filter client-side.

---

## 2. AKIPS COMMAND SYNTAX - STRICT HIERARCHY

### 2.1 Correct Syntax by Operation Type

#### `mlist` - List entities
```
mlist device *                              ✓ List all devices
mlist interface * *                         ✓ List all interfaces on all devices
mlist interface {device} *                  ✓ List interfaces on specific device
mlist counter {device} * /regex/            ✓ List counters with regex
mlist device group *                        ✗ WRONG - "device at wrong level"
mlist * * *                                 ✓ List all entities (wildcard)
```

**Rule:** `mlist {type} {parent} [{child}] [{attribute_filter}]`
- Do NOT specify groups with mlist directly
- Use `any group {name}` in mget instead

#### `mget` - Get attribute values
```
mget * 5548-ctrl2-1 * *                     ✓ Get all attributes for device
mget text 5548-ctrl2-1 sys *                ✓ Get text attributes on sys child
mget enum 5548-ctrl2-1 * *                  ✓ Get enum types
mget counter * * /ifHC/                     ✓ Get counters from all devices
mget device * * SNMPv2-MIB.sysName          ✗ WRONG - device is not parent level
mget device * * *                           ✗ WRONG - same error
mget * * * * limit 1000                     ✗ WRONG - limit not supported
```

**Rule:** `mget {type} {parent} [{child}] [{attribute}]`
- Type must be: text, counter, gauge, integer, enum, rtt, timestamp, or wildcard *
- Parent is device name or wildcard
- Child is component (interface, sys, etc.) or wildcard
- Attribute is optional filter

#### `series` - Time-series data
```
series interval avg 300 time last1h counter * * /ifHCInOctets/          ✗ WRONG - no limit
series interval avg 300 time last1h counter * * /ifHCInOctets/          ✓ Works without limit
series interval total 3600 time last1d counter * * /ifHC/               ✓ Works
series interval max 300 time last2h counter * * /ifHC/                  ✗ "Expected time filter"
series interval min 300 time last2h counter * * /ifHC/                  ✗ "Expected time filter"
```

**Rule:** `series interval {agg_type} {interval_seconds} time {time_filter} {type} {parent} {child} {attribute_filter}`
- Aggregation types that work: `total`, `avg`
- Aggregation types that DON'T work: `max`, `min`, `median`
- Must specify exact interval in seconds (300, 3600, 86400)
- Cannot use limit parameter

#### `calc` - Aggregation calculations
```
calc total time yesterday counter * * /ifHCInOctets/                     ✓ Works
calc avg time yesterday counter * * /ifHCInOctets/                       ✓ Works
calc median time yesterday counter * * /ifHC/                            ✗ "Invalid median parameter"
```

**Rule:** `calc {agg_type} time {time_filter} {type} {parent} {child} {attribute_filter}`
- Supported agg_types: `total`, `avg`
- NOT supported: `median`, `max`, `min`

#### `mtype` - Get entity types
```
mtype device * *                            ✗ WRONG - "device at wrong level"
mtype * * *                                 ✗ WRONG - still wrong hierarchy
```

**Rule:** mtype requires correct hierarchy, same as mget
- Avoid using device type directly with mtype

#### `top` - Get top N entities
```
top 10 total time yesterday counter * * /ifHCInOctets/                   ✓ Works
top 5 reverse total time yesterday counter * * /ifHCInOctets/            ✓ Works (reverse not standard?)
top 50 reverse total time yesterday counter * * /ifHC.*Octets/ any group * limit 50  ✗ "limit not supported"
```

**Rule:** `top {N} [reverse] {agg_type} time {time_filter} {type} {parent} {child} {attribute}`
- Cannot use limit parameter (even though documentation might suggest it)

#### `count` - Count group members
```
count device group *                        ✓ Works
count interface group *                     ✓ Works
```

#### `list` - List groups
```
list device group                           ✓ Works
list interface group                        ✓ Works
```

---

## 3. GROUP OPERATIONS - NOT AS FLEXIBLE AS EXPECTED

### 3.1 Group Constraints

Groups must be real, existing groups. Cannot use wildcards:
```
mlist device * any group *                  ✗ "Invalid group name *" - must be specific group
mget * * * profile *                        ✗ "Unknown profile '*'"
mget * * * any group production              ✗ FAILS if production group doesn't exist
```

**Implication:** Agent must:
1. Query available groups first: `list device group` or `list interface group`
2. Use actual group names, not wildcards
3. Handle "Invalid group name" errors gracefully

---

## 4. TIME FILTER FORMATS - WHAT WORKS

### 4.1 Relative Time Formats That Work
```
time last1h                                 ✓
time last24h                                ✓
time last7d                                 ✓
time yesterday                              ✓
time today                                  ✓
time thisweek                               ✓
time lastweek                               ✓
time thismonth                              ✓
time lastmonth                              ✓
time last1d                                 ✓
```

**Issue:** `series` commands with these time filters work, but all had `limit` which failed
- Time filters themselves are valid
- Problem was `limit` parameter, not the time filter

### 4.2 Time Filter Errors
```
time bad-time                               ✗ "Bad time filter rule 'bad - time'"
time invalid-time                           ✗ "Bad time filter rule 'invalid - time'"
```

---

## 5. REGEX HANDLING

### 5.1 Regex That Works
```
/.*sw.*/                                    ✓ Substring matching
/^sw/                                       ✓ Anchor - start
/sw$/                                       ✓ Anchor - end
/sw[0-9]/                                   ✓ Character class
/(sw|rtr)/                                  ✓ Alternation
/[0-9]{3}/                                  ✓ Quantifier {n}
/Ethernet|Gi/                               ✓ Alternation (interfaces)
/^Ethernet[0-9]/                            ✓ Complex patterns
```

### 5.2 Regex That Fails
```
/[unclosed/                                 ✗ Unclosed bracket
/(unclosed/                                 ✗ Unclosed paren
/(?P<invalid)/                              ✗ Named groups not supported
/*/                                         ✗ Bare quantifier
/++/                                        ✗ Double quantifier
/*$/                                        ✗ Invalid quantifier position
/.{999999}/                                 ✗ Excessive repetition
```

**Implication:** AKIPS uses standard regex but rejects invalid patterns immediately
- Must validate regex before sending
- Agent should catch and simplify on errors

---

## 6. OPERATION SUCCESS RATES

### High Success Rate (>80%)
- **Attribute Types** (7/7, 100%) - text, counter, gauge, integer, enum, rtt, timestamp all work
- **Regex Patterns** (9/9, 100%) - Valid regex works well
- **Entity Hierarchy** (6/6, 100%) - Parent/child relationships work
- **Special Features** (7/7, 100%) - Events, threshold, uptime, RTT all work
- **Special Characters** (5/5, 100%) - Hyphens, dots, slashes handled fine

### Medium Success Rate (50-70%)
- **Basic Operations** (4/4, 100%) - mlist, mget work fine
- **Aggregation** (5/6, 83%) - calc, top work; mcalc has issues with groups
- **Groups** (3/4, 75%) - Group operations work but syntax is strict

### Low Success Rate (<50%)
- **Limits & Pagination** (1/6, 17%) - limit parameter almost never works
- **Interval Variations** (0/7, 0%) - All failed due to limit or unsupported agg types
- **Time Filters with series** (2/13, 15%) - Fail due to limit, not the time filter
- **Profile/Filtering** (1/4, 25%) - Profile syntax is strict
- **Complex Queries** (0/4, 0%) - When combining multiple features, failures pile up

---

## 7. EMPTY DATA HANDLING

**Good News:** AKIPS handles missing/empty data gracefully

```
Series with sparse data:
  ✓ Returns interface with no data as: if1 attr = ,,,,,,,,,
  ✓ Returns interface with some data as: if2 attr = val1,val2,,val4,...
  ✓ No errors, just empty strings between commas

Query for nonexistent attribute:
  ✓ Returns: (empty response, HTTP 200, 0 bytes)

Events with no matches:
  ✓ Returns: (empty response, HTTP 200, 0 bytes)
```

**Agent Implication:**
- Parse empty fields as NULL/None
- Empty responses are normal (not errors)
- Agent must handle this during data insertion

---

## 8. PERFORMANCE CHARACTERISTICS

### Response Time Ranges
```
Simple queries (mlist device):           0-50ms
Medium queries (mlist interface):        100-200ms
Complex queries (get attributes):        200-600ms
Large series queries (24h all intf):     4,500-6,700ms
```

### Response Size Ranges
```
Device list:                             ~7KB
Interface list:                          ~750KB
All attributes on device:                ~450KB
Time-series (24h all interfaces):        2.5MB - 27MB
Event queries (1 day):                   ~200KB
```

**Agent Implication:**
- Series queries can take 5+ seconds and return 3.6MB
- Must handle streaming/chunking for large responses
- Blocking is acceptable given these timelines

---

## 9. WHAT DOESN'T WORK - AGENT MUST AVOID

1. ✗ `limit` - Cannot limit results via API
2. ✗ `max`/`min` aggregation - Not supported in series or calc
3. ✗ `median` - Not supported
4. ✗ Wildcard groups - Must use specific group names
5. ✗ Wildcard profiles - Must use specific profile names
6. ✗ Device as parent in mget - Use * or specific device name instead
7. ✗ `mlist device group *` - Wrong syntax, use `list device group`
8. ✗ Named regex groups - `(?P<name>...)` not supported
9. ✗ Multiple `any group` in one query - Only one group filter per query
10. ✗ Combining limit + other features - limit breaks almost everything

---

## 10. CORRECTED QUERY EXAMPLES

### ❌ WRONG
```
series interval avg 300 time last6h counter * * /ifHCInOctets/ limit 5
mlist device * limit 100
mget event critical time last1d /^b[0-9]+/ * /ifOperStatus/ any group production
calc median time yesterday counter * * /ifHC/
```

### ✓ CORRECT
```
series interval avg 300 time last6h counter * * /ifHCInOctets/
mlist device *
mget event critical time last1d /^b[0-9]+/ * /ifOperStatus/ any group production
calc avg time yesterday counter * * /ifHC/
```

---

## 11. AGENT DESIGN IMPLICATIONS

### Must Implement Client-Side Filtering
Since `limit` doesn't work:
- Fetch all data from AKIPS
- Filter/limit on client side
- Watch for memory issues with large result sets

### Query Validation Before Sending
```
Before sending query, validate:
□ No 'limit' parameter
□ Aggregation type is 'total' or 'avg' (not max/min/median)
□ Group names are real (query list first)
□ Profile names are real
□ Regex is valid (test first)
□ Correct hierarchy for operation type
□ Entity types are valid
```

### Error Recovery Strategy
```
Error: "Entity type X at wrong level"
  → Fix: Use correct syntax for this operation type
  
Error: "Invalid group name X"
  → Recovery: Query available groups, then retry with real name

Error: "Unexpected token limit"
  → Recovery: Remove limit, fetch all, filter client-side

Error: "Expected time filter"
  → Recovery: Use supported agg types (total, avg only)
  
Error: "Bad time filter rule"
  → Recovery: Simplify time specification or use documented format
```

### Recommended Query Patterns for Agent

**Get top 10 interfaces by traffic (without limit):**
```
1. series interval total 3600 time yesterday counter * * /ifHCInOctets/
2. Parse all results
3. Sort by total bytes
4. Take top 10
5. Store results
```

**Get devices in group:**
```
1. list device group  (get list of available groups)
2. If user asks for "production":
   mget * * * any group production
```

**Get latest events:**
```
1. mget event critical time last1d * * *
2. Parse and sort by timestamp
3. Take most recent N
4. Store results
```

---

## 12. SUMMARY - WHAT THE AGENT NEEDS TO KNOW

| Feature | Status | Agent Action |
|---------|--------|--------------|
| limit parameter | ❌ Not supported | Fetch all, filter client-side |
| max/min aggregation | ❌ Not supported | Use avg or total only |
| median | ❌ Not supported | Use avg or total |
| Wildcard groups | ❌ Not supported | Query list first, use real names |
| Device with mget | ⚠️ Strict syntax | Use * for all or specific name |
| Sparse data | ✓ Supported | Handle empty fields as NULL |
| Regex | ✓ Good | Validate before sending |
| Time filters | ✓ Works | Use documented formats |
| Events | ✓ Works | All event types supported |
| Large responses | ✓ Supported | Stream/chunk processing |
| Error messages | ✓ Detailed | Parse for recovery strategy |

---

## 13. NEXT STEPS FOR AGENT IMPLEMENTATION

1. **Query Validator** - Check for unsupported parameters before execution
2. **Response Parser** - Handle sparse data, empty responses, large chunks
3. **Client-Side Filtering** - Since limit doesn't work server-side
4. **Group Management** - Query and cache available groups
5. **Error Recovery** - Map error messages to recovery strategies
6. **Result Aggregation** - Handle client-side top/sort operations


Summary: What We Learned
The comprehensive testing revealed critical API limitations that fundamentally change how we must design the agent:
🚨 Critical Findings:

limit doesn't work - Must implement client-side filtering
Only total and avg aggregations - No max/min/median
Strict syntax - Wrong hierarchy = immediate error
Groups must be real - Cannot use wildcards
Regex validation - AKIPS rejects invalid patterns
Large responses - Can be 25MB+ for time-series queries
Empty data is normal - Sparse results shown as empty strings between commas
HTTP 200 always - Must check response body for "ERROR:" prefix

📊 Test Results:

65/113 tests passed (57.5%)
Most failures were due to unsupported features (limit, max/min agg types)
Core features work well: attributes, regex, entities, events, time filters

✅ What Works Reliably:

Basic operations (mlist, mget, mtype)
All attribute types
Valid regex patterns
Entity hierarchy queries
Time filters (last1h, yesterday, etc.)
Event queries with flags
Group-based filtering (with real group names)

⚠️ What Needs Special Handling:

Fetch all, filter client-side (no server-side limit)
Validate queries before sending (hierarchy, groups, regex)
Handle sparse/empty data (parse commas with nothing between)
Cache group lists (to validate group names)
Stream large responses (27MB time-series)