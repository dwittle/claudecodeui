#!/usr/bin/env python3
"""Test security validations for PAN-OS client"""

import sys
sys.path.insert(0, '/space/tucker28/code/python/skills/netswitch/.claude/skills/panos')

from panos_client import PanosClient, SecurityViolation

def test_command(cmd, should_pass=True):
    """Test a command and report result"""
    client = PanosClient(
        hostname='test',
        username='test',
        password='test'
    )

    try:
        client.validate_command(cmd)
        if should_pass:
            print(f"✓ PASS (allowed): {cmd}")
        else:
            print(f"✗ FAIL (should be blocked): {cmd}")
            return False
    except SecurityViolation as e:
        if not should_pass:
            print(f"✓ PASS (blocked): {cmd}")
            print(f"  Reason: {str(e)}")
        else:
            print(f"✗ FAIL (should be allowed): {cmd}")
            print(f"  Reason: {str(e)}")
            return False
    return True

print("=" * 80)
print("PAN-OS Security Validation Tests")
print("=" * 80)

all_passed = True

print("\n--- Commands that SHOULD BE ALLOWED ---")
all_passed &= test_command("show system info", should_pass=True)
all_passed &= test_command("show interface all", should_pass=True)
all_passed &= test_command("test security-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8", should_pass=True)
all_passed &= test_command("test routing fib-lookup virtual-router VR1 ip 10.1.1.1", should_pass=True)
all_passed &= test_command("request system software check", should_pass=True)
all_passed &= test_command("request support info", should_pass=True)
all_passed &= test_command("debug software status", should_pass=True)

print("\n--- Commands that SHOULD BE BLOCKED ---")
all_passed &= test_command("debug software restart process routed", should_pass=False)
all_passed &= test_command("debug software crash", should_pass=False)
all_passed &= test_command("debug dataplane restart", should_pass=False)
all_passed &= test_command("request restart", should_pass=False)
all_passed &= test_command("request reboot", should_pass=False)
all_passed &= test_command("configure", should_pass=False)
all_passed &= test_command("set deviceconfig", should_pass=False)
all_passed &= test_command("commit", should_pass=False)
all_passed &= test_command("clear session all", should_pass=False)
all_passed &= test_command("clear routing protocol", should_pass=False)
all_passed &= test_command("test some-unknown-test-command", should_pass=False)
all_passed &= test_command("debug some-unknown-debug-command", should_pass=False)

print("\n" + "=" * 80)
if all_passed:
    print("✓ ALL TESTS PASSED")
    sys.exit(0)
else:
    print("✗ SOME TESTS FAILED")
    sys.exit(1)
