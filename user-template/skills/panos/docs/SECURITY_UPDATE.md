# PAN-OS Skill Security Update

## Incident
The command `debug software restart process routed` was accidentally executed on ngfw2-1-mgt, restarting the routing daemon and causing routing protocol adjacencies to flap. This was NOT a read-only command despite starting with "debug".

## Changes Made

### 1. Added Destructive Commands to Block List

Updated `FORBIDDEN_COMMANDS` in `panos_client.py` to block:
- `debug software restart`
- `debug software crash`
- `debug software reset`
- `debug dataplane restart`
- `debug dataplane reset`
- `clear session all`
- `clear routing protocol`
- `clear arp all`

### 2. Implemented Whitelist for Debug Commands

Added `ALLOWED_DEBUG_COMMANDS` whitelist:
- `debug software status`
- `debug dataplane packet-diag show`

### 3. Implemented Whitelist for Test Commands

Added `ALLOWED_TEST_COMMANDS` whitelist:
- `test routing fib-lookup`
- `test security-policy-match`
- `test nat-policy-match`
- `test url`
- `test vpn`

### 4. Updated Validation Logic

- **debug commands:** Must match whitelist or be blocked
- **test commands:** Must match whitelist or be blocked
- **request commands:** Already had whitelist (now consistently enforced)
- **show commands:** Still fully allowed (read-only by nature)

## Testing

All security tests pass (see `test_security.py`):
- ✓ Allows safe commands (show, whitelisted test/debug/request)
- ✓ Blocks destructive commands (restart, reboot, crash, etc.)
- ✓ Blocks non-whitelisted debug/test commands

## Impact

**Before:**
- `debug software restart` would execute and restart services
- Any debug command was allowed

**After:**
- `debug software restart` is blocked with clear error message
- Only explicitly whitelisted debug/test commands are allowed
- Claude will receive SecurityViolation exception preventing execution

## Future Enhancement: LLM-Based Safety Check

User requested: "For any command other than 'show', query an LLM to ask if there's a chance of service interruption."

### Proposed Implementation:

1. **Add LLM Safety Check Function:**
```python
def check_command_safety_with_llm(self, command: str) -> dict:
    """
    Use LLM to assess if a command might cause service disruption

    Returns:
        {
            'safe': bool,
            'risk_level': 'none'|'low'|'medium'|'high',
            'explanation': str,
            'requires_confirmation': bool
        }
    """
```

2. **Integration Point:**
   - Call after whitelist validation passes
   - Before actual command execution
   - Return assessment to CLI layer for user confirmation if needed

3. **Benefits:**
   - Catches unknown dangerous commands not in block/whitelist
   - Provides context-aware safety assessment
   - Educational feedback about command risks

4. **Challenges:**
   - Requires API access to Claude/LLM
   - Adds latency to command execution
   - Need caching to avoid repeated queries for same command
   - False positives/negatives possible

### Would you like me to implement this LLM-based safety check?

It would add an extra layer of protection beyond whitelists, but requires:
- Anthropic API key configuration
- ~500ms latency per unique command
- Error handling for API failures
