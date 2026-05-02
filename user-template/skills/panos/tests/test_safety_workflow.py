#!/usr/bin/env python3
"""Test the complete safety check workflow"""

import sys
sys.path.insert(0, '/space/tucker28/code/python/skills/netswitch/.claude/skills/panos')

from panos_client import PanosClient, SafetyCheckRequired, SecurityViolation

class MockShell:
    """Mock shell for testing without actual connection"""
    def send(self, cmd):
        pass

    def recv(self, size):
        return b"output\ntestuser@firewall> "

    def recv_ready(self):
        return False

    def settimeout(self, timeout):
        pass

    def gettimeout(self):
        return 30

def test_workflow(command, skip_safety=False, description=""):
    """Test the complete safety workflow for a command"""
    print(f"\n{'='*70}")
    print(f"Test: {description}")
    print(f"Command: {command}")
    print(f"Skip safety: {skip_safety}")
    print(f"{'-'*70}")

    client = PanosClient(
        hostname='test',
        username='test',
        password='test'
    )

    # Mock connection
    client.shell = MockShell()

    try:
        output = client.execute_command(command, skip_safety_check=skip_safety)
        print(f"✓ RESULT: Command would execute")
        print(f"  Status: SUCCESS")
        return "EXECUTED"
    except SafetyCheckRequired as e:
        print(f"✓ RESULT: Safety check required")
        print(f"  Status: SAFETY_CHECK_REQUIRED")
        print(f"  Message: {str(e)[:100]}...")
        return "SAFETY_CHECK_REQUIRED"
    except SecurityViolation as e:
        print(f"✓ RESULT: Security violation")
        print(f"  Status: BLOCKED")
        print(f"  Reason: {str(e)[:100]}...")
        return "BLOCKED"
    except Exception as e:
        print(f"✗ ERROR: {e}")
        return "ERROR"

print("="*70)
print("PAN-OS Safety Check Workflow Tests")
print("="*70)

# Test 1: Show commands bypass safety check
result1 = test_workflow(
    "show system info",
    skip_safety=False,
    description="Show command - should execute without safety check"
)
assert result1 == "EXECUTED", f"Expected EXECUTED, got {result1}"

# Test 2: Test command without confirmation requires safety check
result2 = test_workflow(
    "test routing fib-lookup virtual-router VR1 ip 10.1.1.1",
    skip_safety=False,
    description="Test command without --confirmed-safe"
)
assert result2 == "SAFETY_CHECK_REQUIRED", f"Expected SAFETY_CHECK_REQUIRED, got {result2}"

# Test 3: Test command with confirmation executes
result3 = test_workflow(
    "test routing fib-lookup virtual-router VR1 ip 10.1.1.1",
    skip_safety=True,
    description="Test command WITH --confirmed-safe"
)
assert result3 == "EXECUTED", f"Expected EXECUTED, got {result3}"

# Test 4: Debug command without confirmation requires safety check
result4 = test_workflow(
    "debug software status",
    skip_safety=False,
    description="Debug command without --confirmed-safe"
)
assert result4 == "SAFETY_CHECK_REQUIRED", f"Expected SAFETY_CHECK_REQUIRED, got {result4}"

# Test 5: Debug command with confirmation executes
result5 = test_workflow(
    "debug software status",
    skip_safety=True,
    description="Debug command WITH --confirmed-safe"
)
assert result5 == "EXECUTED", f"Expected EXECUTED, got {result5}"

# Test 6: Request command without confirmation requires safety check
result6 = test_workflow(
    "request system software check",
    skip_safety=False,
    description="Request command without --confirmed-safe"
)
assert result6 == "SAFETY_CHECK_REQUIRED", f"Expected SAFETY_CHECK_REQUIRED, got {result6}"

# Test 7: Dangerous command blocked regardless of safety flag
result7 = test_workflow(
    "debug software restart process routed",
    skip_safety=True,  # Even with skip, should be blocked
    description="Dangerous command (should be blocked)"
)
assert result7 == "BLOCKED", f"Expected BLOCKED, got {result7}"

# Test 8: Another dangerous command
result8 = test_workflow(
    "request restart",
    skip_safety=True,
    description="Restart command (should be blocked)"
)
assert result8 == "BLOCKED", f"Expected BLOCKED, got {result8}"

print("\n" + "="*70)
print("✓ ALL WORKFLOW TESTS PASSED!")
print("="*70)
print("\nSummary:")
print("- Show commands: Execute immediately (no safety check)")
print("- Test/Debug/Request commands: Require safety validation")
print("- With --confirmed-safe flag: Execute after validation")
print("- Dangerous commands: Always blocked (regardless of flag)")
