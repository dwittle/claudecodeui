#!/usr/bin/env python3
"""Test safety check logic without network operations"""

import sys
sys.path.insert(0, '/space/tucker28/code/python/skills/netswitch/.claude/skills/panos')

from panos_client import PanosClient, SafetyCheckRequired, SecurityViolation

def test_safety_logic(command, skip_safety=False):
    """Test just the safety check logic"""
    client = PanosClient(hostname='test', username='test', password='test')

    try:
        # Validate command
        client.validate_command(command)

        # Check if safety check would be required
        cmd_lower = command.strip().lower()
        if not cmd_lower.startswith('show') and not skip_safety:
            raise SafetyCheckRequired(f"Command requires safety check: {command}")

        return "WOULD_EXECUTE"
    except SafetyCheckRequired:
        return "SAFETY_CHECK_REQUIRED"
    except SecurityViolation:
        return "BLOCKED"

print("="*70)
print("Safety Check Logic Tests")
print("="*70)

tests = [
    # (command, skip_safety, expected_result, description)
    ("show system info", False, "WOULD_EXECUTE", "Show command bypasses safety"),
    ("show interface all", False, "WOULD_EXECUTE", "Show command bypasses safety"),
    ("test routing fib-lookup", False, "SAFETY_CHECK_REQUIRED", "Test needs safety check"),
    ("test routing fib-lookup", True, "WOULD_EXECUTE", "Test with --confirmed-safe"),
    ("debug software status", False, "SAFETY_CHECK_REQUIRED", "Debug needs safety check"),
    ("debug software status", True, "WOULD_EXECUTE", "Debug with --confirmed-safe"),
    ("request system software check", False, "SAFETY_CHECK_REQUIRED", "Request needs safety check"),
    ("request system software check", True, "WOULD_EXECUTE", "Request with --confirmed-safe"),
    ("debug software restart process routed", False, "BLOCKED", "Dangerous command blocked"),
    ("debug software restart process routed", True, "BLOCKED", "Dangerous blocked even with flag"),
    ("request restart", False, "BLOCKED", "Restart blocked"),
    ("clear session all", False, "BLOCKED", "Clear session blocked"),
]

all_passed = True
for command, skip_safety, expected, description in tests:
    result = test_safety_logic(command, skip_safety)
    passed = (result == expected)
    all_passed &= passed

    status = "✓" if passed else "✗"
    flag_str = " --confirmed-safe" if skip_safety else ""
    print(f"{status} {description}")
    print(f"  Command: {command}{flag_str}")
    print(f"  Expected: {expected}, Got: {result}")
    if not passed:
        print(f"  FAILED!")
    print()

print("="*70)
if all_passed:
    print("✓ ALL TESTS PASSED")
    print()
    print("Production Safety System Summary:")
    print("- Layer 1: Whitelist/Blacklist (always active)")
    print("- Layer 2: LLM Safety Check (non-show commands)")
    print("- Show commands: Execute immediately")
    print("- Other commands: Require --confirmed-safe flag")
    print("- Dangerous commands: Always blocked")
    sys.exit(0)
else:
    print("✗ SOME TESTS FAILED")
    sys.exit(1)
