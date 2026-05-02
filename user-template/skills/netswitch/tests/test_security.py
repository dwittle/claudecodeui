#!/usr/bin/env python3
"""
Security validation tests for NetSwitch client.

Demonstrates and validates the security controls that prevent
command injection and unauthorized operations.
"""

from netswitch_client import NetSwitchClient, SecurityViolation


def test_command(command: str, should_pass: bool = True):
    """Test a command and print result"""
    client = NetSwitchClient('dummy', 'dummy', 'dummy')

    try:
        client.validate_command(command)
        status = "✓ PASS" if should_pass else "✗ FAIL (should have been blocked)"
        color = "\033[92m" if should_pass else "\033[91m"
        print(f"{color}{status}\033[0m: {command}")
        return should_pass
    except SecurityViolation as e:
        status = "✓ PASS (blocked)" if not should_pass else "✗ FAIL (should have passed)"
        color = "\033[92m" if not should_pass else "\033[91m"
        print(f"{color}{status}\033[0m: {command}")
        print(f"  Reason: {e}")
        return not should_pass


def main():
    """Run security validation tests"""
    print("=" * 80)
    print("Network Switch Security Validation Tests")
    print("=" * 80)

    passed = 0
    failed = 0

    print("\n1. VALID COMMANDS (should pass)")
    print("-" * 80)
    valid_commands = [
        "show version",
        "show interfaces",
        "show ip interface brief",
        "show running-config",
        "show vlan brief",
        "show mac address-table",
        "show ip route",
        "show cdp neighbors detail",
        "show interfaces GigabitEthernet1/0/1",
        "show spanning-tree",
        "display version",  # Alternative command word
        "SHOW VERSION",  # Case insensitive
    ]

    for cmd in valid_commands:
        if test_command(cmd, should_pass=True):
            passed += 1
        else:
            failed += 1

    print("\n2. COMMAND CHAINING ATTEMPTS (should be blocked)")
    print("-" * 80)
    chaining_attempts = [
        "show version; configure terminal",
        "show version && configure terminal",
        "show version || configure terminal",
        "show version | grep cisco",
        "show version\nconfigure terminal",
    ]

    for cmd in chaining_attempts:
        if test_command(cmd, should_pass=False):
            passed += 1
        else:
            failed += 1

    print("\n3. COMMAND INJECTION ATTEMPTS (should be blocked)")
    print("-" * 80)
    injection_attempts = [
        "show version `cat /etc/passwd`",
        "show version $(cat /etc/passwd)",
        "show version > /tmp/output.txt",
        "show version < input.txt",
        "show version; rm -rf /",
    ]

    for cmd in injection_attempts:
        if test_command(cmd, should_pass=False):
            passed += 1
        else:
            failed += 1

    print("\n4. CONFIGURATION COMMANDS (should be blocked)")
    print("-" * 80)
    config_commands = [
        "configure terminal",
        "conf t",
        "write memory",
        "copy running-config startup-config",
        "reload",
        "enable",  # When used with other commands
    ]

    for cmd in config_commands:
        if test_command(cmd, should_pass=False):
            passed += 1
        else:
            failed += 1

    print("\n5. SHELL ESCAPE ATTEMPTS (should be blocked)")
    print("-" * 80)
    shell_escapes = [
        "!bash",
        "show version!bash",
        "! cat /etc/passwd",
    ]

    for cmd in shell_escapes:
        if test_command(cmd, should_pass=False):
            passed += 1
        else:
            failed += 1

    print("\n6. REDIRECT ATTEMPTS (should be blocked)")
    print("-" * 80)
    redirect_attempts = [
        "show version > output.txt",
        "show version >> output.txt",
        "show version 2> errors.txt",
        "show version 2>&1",
    ]

    for cmd in redirect_attempts:
        if test_command(cmd, should_pass=False):
            passed += 1
        else:
            failed += 1

    print("\n7. INVALID COMMAND PREFIXES (should be blocked)")
    print("-" * 80)
    invalid_prefixes = [
        "config terminal",
        "interface gi1/0/1",
        "ip route 0.0.0.0 0.0.0.0 10.1.1.1",
        "no shutdown",
        "shutdown",
    ]

    for cmd in invalid_prefixes:
        if test_command(cmd, should_pass=False):
            passed += 1
        else:
            failed += 1

    print("\n" + "=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
    print("=" * 80)

    if failed > 0:
        print("\n\033[91m⚠ WARNING: Some security tests failed!\033[0m")
        return 1
    else:
        print("\n\033[92m✓ All security tests passed!\033[0m")
        return 0


if __name__ == '__main__':
    import sys
    sys.exit(main())
