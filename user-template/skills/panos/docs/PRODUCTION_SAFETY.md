# Production Safety Check - PAN-OS Skill

## Overview

The PAN-OS skill implements a **two-layer safety system** for production firewall access:

1. **Whitelist/Blacklist Layer** - Blocks obviously dangerous commands
2. **LLM Safety Layer** - Requires validation for all non-show commands

## How It Works

### Layer 1: Command Validation (Always Active)

**Blocks destructive commands:**
- Configuration changes (configure, set, delete, commit)
- Service restarts (debug software restart, request restart)
- State clearing (clear session all, clear routing protocol)

**Whitelists safe commands:**
- All "show" commands (read-only by design)
- Specific "test" commands (test routing, test security-policy-match, etc.)
- Specific "debug" commands (debug software status, etc.)
- Specific "request" commands (request system software check, etc.)

### Layer 2: LLM Safety Check (Non-Show Commands Only)

**For ANY command that is NOT a "show" command:**

1. **First execution attempt returns:**
   ```
   Exit Code: 2
   Error: SAFETY_CHECK_REQUIRED: Command 'test routing fib-lookup ...' requires safety validation.
   This is a production firewall. Non-'show' commands (test, debug, request) could potentially
   impact services. Please validate this command is safe and will not cause service interruption,
   then retry with --confirmed-safe flag.
   ```

2. **Claude (the agent) must:**
   - Analyze the command using LLM knowledge
   - Assess if it will cause service interruption
   - Determine risk level (safe / risky / dangerous)

3. **Claude's decision tree:**
   - **SAFE:** Automatically retry with `--confirmed-safe`
   - **RISKY:** Ask user for explicit confirmation before retrying
   - **DANGEROUS:** Refuse and explain the risk to the user

4. **Second attempt with confirmation:**
   ```bash
   ./panos show ngfw2-1-mgt "test routing fib-lookup ..." --bastion-host netprod0001 --confirmed-safe
   ```
   Command executes successfully.

## Example Workflows

### Example 1: Safe Test Command (Auto-Approved)

```bash
# Claude receives request: "Test route lookup for 10.1.1.1 on ngfw2-1-mgt"

# Claude attempts execution:
$ ./panos show ngfw2-1-mgt "test routing fib-lookup virtual-router VR1 ip 10.1.1.1" --bastion-host netprod0001

# Returns: SAFETY_CHECK_REQUIRED (exit code 2)

# Claude analyzes internally:
# - "test routing fib-lookup" performs a route table lookup
# - This is a read-only query operation
# - Does NOT modify state, restart services, or affect traffic
# - Risk assessment: SAFE

# Claude automatically retries with confirmation:
$ ./panos show ngfw2-1-mgt "test routing fib-lookup virtual-router VR1 ip 10.1.1.1" --bastion-host netprod0001 --confirmed-safe

# Executes successfully, returns route information
```

### Example 2: Risky Command (User Confirmation Required)

```bash
# Claude receives request: "Clear the BGP session with 10.11.253.58 on ngfw2-1-mgt"

# Claude attempts validation and realizes:
# - "clear bgp" is not in whitelist
# - If it were, clearing a BGP session drops the peering and causes routing changes
# - This WILL cause traffic disruption during BGP reconvergence
# - Risk assessment: RISKY

# Claude asks user:
"Warning: The command 'clear bgp neighbor 10.11.253.58' will reset the BGP session with
10.11.253.58, causing routing adjacency to flap and potentially dropping traffic during
reconvergence. This is a production firewall.

Are you sure you want to proceed? (yes/no)"

# If user confirms "yes", Claude retries with --confirmed-safe
# If user says "no", Claude stops and doesn't execute
```

### Example 3: Dangerous Command (Refused)

```bash
# Claude receives request: "Restart the routing daemon on ngfw2-1-mgt"

# Claude attempts:
$ ./panos show ngfw2-1-mgt "debug software restart process routed" --bastion-host netprod0001

# Returns: SECURITY VIOLATION (exit code 1)
# Error: Command contains forbidden operation: \bdebug\s+software\s+restart\b

# Claude responds to user:
"I cannot execute this command. 'debug software restart process routed' is blocked because
it restarts the routing daemon, causing all routing protocols (OSPF, BGP, PIM) to flap
and resulting in significant traffic disruption. This is a production firewall.

If you need to restart routing, please use the PAN-OS web interface with proper change
control procedures, or contact your firewall administrator."
```

## Command Categories and Risk Levels

| Command Type | Examples | Safety Check | Risk Level |
|--------------|----------|--------------|------------|
| **show** | `show system info`<br>`show interface all` | ❌ Bypassed | None - Always safe |
| **test** (whitelisted) | `test routing fib-lookup`<br>`test security-policy-match` | ✅ Required | Safe - Read-only lookups |
| **debug** (whitelisted) | `debug software status` | ✅ Required | Safe - Status queries |
| **request** (whitelisted) | `request system software check` | ✅ Required | Safe - Info queries |
| **test** (not whitelisted) | `test some-unknown-command` | 🚫 Blocked | Unknown - Rejected |
| **debug** (destructive) | `debug software restart` | 🚫 Blocked | High - Service interruption |
| **request** (destructive) | `request restart` | 🚫 Blocked | Critical - System restart |
| **clear** | `clear session all` | 🚫 Blocked | High - Drops all sessions |
| **configure** | `configure`, `set`, `commit` | 🚫 Blocked | Critical - Config changes |

## Benefits

1. **Prevents Accidents:** Blocks obviously dangerous commands before execution
2. **Context-Aware:** LLM analyzes intent and impact of commands
3. **Production-Safe:** Requires explicit validation for non-show commands
4. **Transparent:** Clear error messages explain why commands are blocked
5. **Flexible:** Allows safe commands after validation
6. **Auditable:** Exit codes indicate why execution was blocked

## Technical Details

### Exit Codes

- **0:** Command executed successfully
- **1:** Security violation or command error (command blocked)
- **2:** Safety check required (retry with --confirmed-safe)

### Error Response Format

```json
{
  "hostname": "ngfw2-1-mgt",
  "command": "test routing fib-lookup ...",
  "error": "SAFETY_CHECK_REQUIRED: ...",
  "success": false,
  "safety_check_required": true,
  "requires_confirmation": true
}
```

### Implementation

- `panos_client.py`: Core validation logic
- `panos_cli.py`: CLI argument handling and error responses
- `SafetyCheckRequired` exception: Signals need for validation

## Testing

Run comprehensive tests:
```bash
# Security validation tests
.venv/bin/python3 test_security.py

# Safety check mechanism tests
.venv/bin/python3 test_safety_check.py
```

## For Claude Agents

**When executing non-show commands:**

1. Expect `SAFETY_CHECK_REQUIRED` error (exit code 2)
2. Analyze command using your knowledge:
   - Does it modify state?
   - Does it restart services?
   - Does it clear sessions/routes/ARP?
   - Does it affect traffic flow?
3. Make decision:
   - **SAFE:** Retry with `--confirmed-safe` automatically
   - **RISKY:** Ask user for confirmation
   - **DANGEROUS:** Refuse and explain
4. Document your reasoning in response to user

**Remember:** These are production firewalls. When in doubt, ask the user.
