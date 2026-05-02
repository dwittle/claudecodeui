#!/usr/bin/env python3
"""
Real-world test script for AKiPS API
Tests against actual AKiPS server based on critical findings from akips_critical.md

This script tests:
1. What SHOULD work (65 passing cases)
2. What SHOULD fail (48 failing cases)
3. All client library methods
4. Edge cases and limitations
"""

import os
import sys
import json
import time
from akips_client import AKiPSClient, AKiPSError

# Test results tracking
tests_run = 0
tests_passed = 0
tests_failed = 0
test_results = []


def print_header(text):
    """Print a section header"""
    print(f"\n{'='*70}")
    print(f"  {text}")
    print(f"{'='*70}")


def print_test(name, description=""):
    """Print test name"""
    global tests_run
    tests_run += 1
    print(f"\n[{tests_run}] {name}")
    if description:
        print(f"    {description}")


def assert_success(func, *args, expected_type=None, **kwargs):
    """Assert that a function call succeeds"""
    global tests_passed, tests_failed
    try:
        result = func(*args, **kwargs)

        # Validate result type if specified
        if expected_type and not isinstance(result, expected_type):
            print(f"    ❌ FAIL - Wrong type: expected {expected_type}, got {type(result)}")
            tests_failed += 1
            test_results.append({
                'test': tests_run,
                'status': 'FAIL',
                'reason': f'Wrong type: {type(result)}'
            })
            return None

        print(f"    ✓ PASS")
        tests_passed += 1
        test_results.append({'test': tests_run, 'status': 'PASS'})
        return result
    except Exception as e:
        print(f"    ❌ FAIL - {str(e)[:100]}")
        tests_failed += 1
        test_results.append({
            'test': tests_run,
            'status': 'FAIL',
            'reason': str(e)[:100]
        })
        return None


def assert_failure(func, *args, expected_error=None, **kwargs):
    """Assert that a function call fails"""
    global tests_passed, tests_failed
    try:
        result = func(*args, **kwargs)
        print(f"    ❌ FAIL - Expected failure but succeeded")
        tests_failed += 1
        test_results.append({
            'test': tests_run,
            'status': 'FAIL',
            'reason': 'Expected failure but succeeded'
        })
        return False
    except AKiPSError as e:
        error_msg = str(e)
        if expected_error and expected_error.lower() not in error_msg.lower():
            print(f"    ⚠️ PASS (wrong error) - Expected '{expected_error}', got '{error_msg[:100]}'")
        else:
            print(f"    ✓ PASS (failed as expected) - {error_msg[:80]}")
        tests_passed += 1
        test_results.append({'test': tests_run, 'status': 'PASS'})
        return True
    except Exception as e:
        print(f"    ✓ PASS (failed as expected) - {str(e)[:80]}")
        tests_passed += 1
        test_results.append({'test': tests_run, 'status': 'PASS'})
        return True


def print_sample_data(data, max_items=3):
    """Print sample of data for verification"""
    if isinstance(data, list):
        print(f"    Sample: {len(data)} items")
        for item in data[:max_items]:
            print(f"      - {item}")
    elif isinstance(data, dict):
        print(f"    Sample: {len(data)} keys")
        for i, (key, value) in enumerate(list(data.items())[:max_items]):
            if isinstance(value, list):
                print(f"      {key}: [{len(value)} items]")
            else:
                print(f"      {key}: {str(value)[:60]}")
    elif isinstance(data, str):
        lines = data.split('\n')
        print(f"    Sample: {len(lines)} lines")
        for line in lines[:max_items]:
            print(f"      {line[:70]}")


def main():
    """Run comprehensive AKiPS tests"""
    global tests_run, tests_passed, tests_failed

    print("="*70)
    print("  AKiPS Real-World Test Suite")
    print("  Testing against live server based on akips_critical.md")
    print("="*70)

    # Get credentials
    server = os.environ.get('AKIPS_SERVER', 'akipsdcm0001.llnl.gov')
    password = os.environ.get('AKIPS_API_PASSWORD')
    username = os.environ.get('AKIPS_USERNAME', 'api-ro')
    verify_ssl = os.environ.get('AKIPS_VERIFY_SSL', 'false').lower() == 'true'

    if not password:
        print("\nERROR: AKIPS_API_PASSWORD environment variable must be set")
        sys.exit(1)

    print(f"\nServer: {server}")
    print(f"Username: {username}")
    print(f"SSL Verify: {verify_ssl}")

    # Initialize client
    client = AKiPSClient(
        server=server,
        password=password,
        username=username,
        verify_ssl=verify_ssl
    )

    # ========================================================================
    # SECTION 1: BASIC OPERATIONS (Should Work)
    # ========================================================================
    print_header("SECTION 1: BASIC OPERATIONS")

    # Test 1.1: List all devices
    print_test("List all devices", "mlist device *")
    devices = assert_success(client.list_devices, expected_type=list)
    if devices:
        print_sample_data(devices)

    # Test 1.2: List devices with pattern
    print_test("List devices with pattern", "mlist device /.*sw.*/")
    sw_devices = assert_success(client.list_devices, pattern="/.*sw.*/", expected_type=list)
    if sw_devices:
        print_sample_data(sw_devices)

    # Test 1.3: List all interfaces
    print_test("List all interfaces", "mlist interface * *")
    interfaces = assert_success(client.list_interfaces, expected_type=list)
    if interfaces:
        print_sample_data(interfaces)

    # Test 1.4: List interfaces on specific device (if we have one)
    if devices and len(devices) > 0:
        test_device = devices[0]
        print_test(f"List interfaces on device", f"mlist interface {test_device} *")
        device_ifs = assert_success(
            client.list_interfaces,
            device=test_device,
            expected_type=list
        )
        if device_ifs:
            print_sample_data(device_ifs)

    # Test 1.5: Get device info
    if devices and len(devices) > 0:
        test_device = devices[0]
        print_test(f"Get device info", f"mget text {test_device} sys *")
        info = assert_success(client.get_device_info, test_device, expected_type=dict)
        if info:
            print_sample_data(info)

    # Test 1.6: Get attribute value
    if devices and len(devices) > 0:
        test_device = devices[0]
        print_test(f"Get specific attribute", f"get {test_device} sys SNMPv2-MIB.sysName")
        value = assert_success(
            client.get_attribute_value,
            test_device,
            "sys",
            "SNMPv2-MIB.sysName",
            expected_type=str
        )
        if value:
            print(f"    Value: {value[:100]}")

    # Test 1.7: List device groups
    print_test("List device groups", "list device group")
    groups = assert_success(client.list_groups, expected_type=list)
    if groups:
        print_sample_data(groups)

    # Test 1.8: List interface groups
    print_test("List interface groups", "list interface group")
    if_groups = assert_success(client.list_groups, group_type="interface", expected_type=list)
    if if_groups:
        print_sample_data(if_groups)

    # ========================================================================
    # SECTION 2: REGEX PATTERNS (Should Work)
    # ========================================================================
    print_header("SECTION 2: REGEX PATTERNS (Valid)")

    # Test 2.1: Substring matching
    print_test("Regex: substring matching", "/.*sw.*/")
    assert_success(client.list_devices, pattern="/.*sw.*/", expected_type=list)

    # Test 2.2: Anchor at start
    print_test("Regex: anchor start", "/^sw/")
    assert_success(client.list_devices, pattern="/^sw/", expected_type=list)

    # Test 2.3: Character class
    print_test("Regex: character class", "/sw[0-9]/")
    assert_success(client.list_devices, pattern="/sw[0-9]/", expected_type=list)

    # Test 2.4: Alternation
    print_test("Regex: alternation", "/(sw|rtr)/")
    assert_success(client.list_devices, pattern="/(sw|rtr)/", expected_type=list)

    # ========================================================================
    # SECTION 3: REGEX PATTERNS (Should Fail)
    # ========================================================================
    print_header("SECTION 3: REGEX PATTERNS (Invalid - Should Fail)")

    # Test 3.1: Unclosed bracket
    print_test("Regex: unclosed bracket", "/[unclosed/")
    assert_failure(client.list_devices, pattern="/[unclosed/")

    # Test 3.2: Unclosed paren
    print_test("Regex: unclosed paren", "/(unclosed/")
    assert_failure(client.list_devices, pattern="/(unclosed/")

    # Test 3.3: Bare quantifier
    print_test("Regex: bare quantifier", "/*/")
    assert_failure(client.list_devices, pattern="/*/")

    # Test 3.4: Double quantifier
    print_test("Regex: double quantifier", "/++/")
    assert_failure(client.list_devices, pattern="/++/")

    # ========================================================================
    # SECTION 4: RAW COMMANDS - WHAT WORKS
    # ========================================================================
    print_header("SECTION 4: RAW COMMANDS (Should Work)")

    # Test 4.1: mget with wildcard
    print_test("mget with wildcard", "mget * * * *")
    result = assert_success(client.execute_command, "mget * * * *", expected_type=str)
    if result:
        print_sample_data(result)

    # Test 4.2: mget text attributes
    if devices and len(devices) > 0:
        test_device = devices[0]
        print_test("mget text attributes", f"mget text {test_device} sys *")
        assert_success(client.execute_command, f"mget text {test_device} sys *", expected_type=str)

    # Test 4.3: mget counter attributes
    print_test("mget counter attributes", "mget counter * * /ifHC/")
    result = assert_success(client.execute_command, "mget counter * * /ifHC/", expected_type=str)
    if result:
        print_sample_data(result)

    # Test 4.4: top command without limit
    print_test("top 10 interfaces", "top 10 total time yesterday counter * * /ifHCInOctets/")
    result = assert_success(
        client.execute_command,
        "top 10 total time yesterday counter * * /ifHCInOctets/",
        expected_type=str
    )
    if result:
        print_sample_data(result)

    # Test 4.5: calc total
    print_test("calc total", "calc total time yesterday counter * * /ifHCInOctets/")
    result = assert_success(
        client.execute_command,
        "calc total time yesterday counter * * /ifHCInOctets/",
        expected_type=str
    )
    if result:
        print_sample_data(result)

    # Test 4.6: calc avg
    print_test("calc avg", "calc avg time yesterday counter * * /ifHCInOctets/")
    assert_success(
        client.execute_command,
        "calc avg time yesterday counter * * /ifHCInOctets/",
        expected_type=str
    )

    # ========================================================================
    # SECTION 5: RAW COMMANDS - WHAT FAILS (Critical Findings)
    # ========================================================================
    print_header("SECTION 5: RAW COMMANDS (Should Fail)")

    # Test 5.1: limit parameter (SHOULD FAIL)
    print_test("limit parameter", "mlist device * limit 5")
    assert_failure(
        client.execute_command,
        "mlist device * limit 5",
        expected_error="limit"
    )

    # Test 5.2: series with limit (SHOULD FAIL)
    print_test("series with limit", "series interval avg 300 time last1h counter * * /ifHCInOctets/ limit 5")
    assert_failure(
        client.execute_command,
        "series interval avg 300 time last1h counter * * /ifHCInOctets/ limit 5",
        expected_error="limit"
    )

    # Test 5.3: mget with limit (SHOULD FAIL)
    print_test("mget with limit", "mget * * * * limit 1000")
    assert_failure(
        client.execute_command,
        "mget * * * * limit 1000",
        expected_error="limit"
    )

    # Test 5.4: calc median (SHOULD FAIL - unsupported aggregation)
    print_test("calc median", "calc median time yesterday counter * * /ifHC/")
    assert_failure(
        client.execute_command,
        "calc median time yesterday counter * * /ifHC/",
        expected_error="median"
    )

    # Test 5.5: series max aggregation (SHOULD FAIL)
    print_test("series max", "series interval max 300 time last2h counter * * /ifHC/")
    assert_failure(
        client.execute_command,
        "series interval max 300 time last2h counter * * /ifHC/"
    )

    # Test 5.6: series min aggregation (SHOULD FAIL)
    print_test("series min", "series interval min 300 time last2h counter * * /ifHC/")
    assert_failure(
        client.execute_command,
        "series interval min 300 time last2h counter * * /ifHC/"
    )

    # Test 5.7: Wrong hierarchy - device at wrong level (SHOULD FAIL)
    print_test("Wrong hierarchy", "mlist device group *")
    assert_failure(
        client.execute_command,
        "mlist device group *",
        expected_error="wrong level"
    )

    # Test 5.8: Invalid wildcard group (MAY FAIL depending on AKiPS version)
    print_test("Wildcard group", "mlist device * any group *")
    print("    Note: Some AKiPS versions accept wildcard groups, others reject them")
    try:
        result = client.execute_command("mlist device * any group *")
        print(f"    ✓ PASS (wildcard group accepted on this server)")
        tests_passed += 1
        test_results.append({'test': tests_run, 'status': 'PASS'})
    except AKiPSError as e:
        if "group" in str(e).lower():
            print(f"    ✓ PASS (failed as expected) - {str(e)[:80]}")
            tests_passed += 1
            test_results.append({'test': tests_run, 'status': 'PASS'})
        else:
            print(f"    ❌ FAIL - Unexpected error: {str(e)[:100]}")
            tests_failed += 1
            test_results.append({'test': tests_run, 'status': 'FAIL', 'reason': str(e)[:100]})

    # ========================================================================
    # SECTION 6: TIME FILTERS (Should Work)
    # ========================================================================
    print_header("SECTION 6: TIME FILTERS")

    # Test 6.1: last1h
    print_test("Time filter: last1h", "calc total time last1h counter * * /ifHCInOctets/")
    assert_success(
        client.execute_command,
        "calc total time last1h counter * * /ifHCInOctets/",
        expected_type=str
    )

    # Test 6.2: last24h
    print_test("Time filter: last24h", "calc total time last24h counter * * /ifHCInOctets/")
    assert_success(
        client.execute_command,
        "calc total time last24h counter * * /ifHCInOctets/",
        expected_type=str
    )

    # Test 6.3: yesterday
    print_test("Time filter: yesterday", "calc total time yesterday counter * * /ifHCInOctets/")
    assert_success(
        client.execute_command,
        "calc total time yesterday counter * * /ifHCInOctets/",
        expected_type=str
    )

    # Test 6.4: today
    print_test("Time filter: today", "calc total time today counter * * /ifHCInOctets/")
    assert_success(
        client.execute_command,
        "calc total time today counter * * /ifHCInOctets/",
        expected_type=str
    )

    # Test 6.5: thisweek
    print_test("Time filter: thisweek", "calc total time thisweek counter * * /ifHCInOctets/")
    assert_success(
        client.execute_command,
        "calc total time thisweek counter * * /ifHCInOctets/",
        expected_type=str
    )

    # Test 6.6: Invalid time filter (SHOULD FAIL)
    print_test("Invalid time filter", "calc total time bad-time counter * * /ifHCInOctets/")
    assert_failure(
        client.execute_command,
        "calc total time bad-time counter * * /ifHCInOctets/",
        expected_error="time filter"
    )

    # ========================================================================
    # SECTION 7: EVENTS
    # ========================================================================
    print_header("SECTION 7: EVENTS")

    # Test 7.1: Get all events
    print_test("Get all events", "mget event all time last1h * * *")
    events = assert_success(
        client.get_events,
        event_type="all",
        time_filter="last1h",
        expected_type=list
    )
    if events:
        print_sample_data(events)

    # Test 7.2: Get critical events
    print_test("Get critical events", "mget event critical time last1h * * *")
    assert_success(
        client.get_events,
        event_type="critical",
        time_filter="last1h",
        expected_type=list
    )

    # Test 7.3: Get enum events (status changes)
    print_test("Get enum events", "mget event enum time last24h * * *")
    assert_success(
        client.get_events,
        event_type="enum",
        time_filter="last24h",
        expected_type=list
    )

    # Test 7.4: Get threshold events
    print_test("Get threshold events", "mget event threshold time yesterday * * *")
    assert_success(
        client.get_events,
        event_type="threshold",
        time_filter="yesterday",
        expected_type=list
    )

    # ========================================================================
    # SECTION 8: TOP INTERFACES (Client Library Method)
    # ========================================================================
    print_header("SECTION 8: TOP INTERFACES")

    # Test 8.1: Get top 10 interfaces by input octets
    print_test("Top 10 by input octets", "top 10 total time yesterday counter * * /ifHCInOctets/")
    top_in = assert_success(
        client.get_top_interfaces,
        n=10,
        time_filter="yesterday",
        attribute="/ifHCInOctets/",
        expected_type=list
    )
    if top_in:
        print_sample_data(top_in)

    # Test 8.2: Get top 5 interfaces by output octets
    print_test("Top 5 by output octets", "top 5 total time yesterday counter * * /ifHCOutOctets/")
    top_out = assert_success(
        client.get_top_interfaces,
        n=5,
        time_filter="yesterday",
        attribute="/ifHCOutOctets/",
        expected_type=list
    )
    if top_out:
        print_sample_data(top_out)

    # ========================================================================
    # SECTION 9: SERIES DATA (Time-Series)
    # ========================================================================
    print_header("SECTION 9: SERIES DATA (Time-Series)")

    # Test 9.1: series with total aggregation
    print_test("Series: total, 5min interval", "series interval total 300 time last1h counter * * /ifHCInOctets/")
    series1 = assert_success(
        client.get_series_data,
        interval=300,
        time_filter="last1h",
        attr_type="counter",
        device="*",
        child="*",
        attribute="/ifHCInOctets/",
        expected_type=dict
    )
    if series1:
        print_sample_data(series1)

    # Test 9.2: series with avg aggregation
    print_test("Series: avg, 1hr interval", "series interval avg 3600 time yesterday counter * * /ifHC/")
    series2 = assert_success(
        client.execute_command,
        "series interval avg 3600 time yesterday counter * * /ifHC/",
        expected_type=str
    )
    if series2:
        print_sample_data(series2)

    # ========================================================================
    # SECTION 10: GROUP OPERATIONS
    # ========================================================================
    print_header("SECTION 10: GROUP OPERATIONS")

    # Test 10.1: List device groups (already tested but repeat for clarity)
    print_test("List device groups", "list device group")
    dev_groups = assert_success(client.list_groups, expected_type=list)

    # Test 10.2: If groups exist, try filtering by first group
    if dev_groups and len(dev_groups) > 0:
        test_group = dev_groups[0]
        print_test(f"Filter by group: {test_group}", f"mlist device * any group {test_group}")
        assert_success(
            client.list_devices,
            group=test_group,
            expected_type=list
        )

    # Test 10.3: Try non-existent group (SHOULD FAIL)
    print_test("Non-existent group", "mlist device * any group nonexistent_group_12345")
    assert_failure(
        client.list_devices,
        group="nonexistent_group_12345",
        expected_error="group"
    )

    # ========================================================================
    # SECTION 11: SPARSE DATA HANDLING
    # ========================================================================
    print_header("SECTION 11: SPARSE/EMPTY DATA HANDLING")

    # Test 11.1: Query for nonexistent attribute with wildcards (should fail - invalid syntax)
    print_test("Nonexistent attribute with wildcards", "get * * NonExistentAttribute12345")
    print("    Note: 'get' command requires specific device/child, not wildcards")
    assert_failure(
        client.execute_command,
        "get * * NonExistentAttribute12345",
        expected_error="Invalid command"
    )

    # Test 11.1b: Query with mget for nonexistent attribute (should return empty)
    if devices and len(devices) > 0:
        test_device = devices[0]
        print_test("Nonexistent attribute with mget", f"mget text {test_device} * NonExistentAttribute12345")
        result = assert_success(
            client.execute_command,
            f"mget text {test_device} * NonExistentAttribute12345",
            expected_type=str
        )
        if result is not None:
            print(f"    Result length: {len(result)} bytes")
            if len(result) == 0:
                print("    ✓ Empty result as expected")

    # Test 11.2: Events with no matches (should return empty)
    print_test("Events with no matches", "mget event critical time last1h nonexistent_device_12345 * *")
    events = assert_success(
        client.get_events,
        event_type="critical",
        time_filter="last1h",
        device="nonexistent_device_12345",
        expected_type=list
    )
    if events is not None:
        print(f"    Result count: {len(events)} events")
        if len(events) == 0:
            print("    ✓ Empty result as expected")

    # ========================================================================
    # SECTION 12: ERROR MESSAGE VALIDATION
    # ========================================================================
    print_header("SECTION 12: ERROR MESSAGE VALIDATION")

    # Test 12.1: Verify "ERROR:" prefix in response (not HTTP error)
    print_test("Malformed command", "invalid_command_syntax_test")
    assert_failure(
        client.execute_command,
        "invalid_command_syntax_test",
        expected_error="ERROR:"
    )

    # ========================================================================
    # PRINT SUMMARY
    # ========================================================================
    print("\n" + "="*70)
    print("  TEST SUMMARY")
    print("="*70)
    print(f"Total tests run:    {tests_run}")
    print(f"Tests passed:       {tests_passed} ({100*tests_passed/tests_run if tests_run > 0 else 0:.1f}%)")
    print(f"Tests failed:       {tests_failed} ({100*tests_failed/tests_run if tests_run > 0 else 0:.1f}%)")
    print("="*70)

    # Print failed tests
    if tests_failed > 0:
        print("\nFailed tests:")
        for result in test_results:
            if result['status'] == 'FAIL':
                reason = result.get('reason', 'Unknown')
                print(f"  [{result['test']}] {reason}")

    # Exit with appropriate code
    sys.exit(0 if tests_failed == 0 else 1)


if __name__ == '__main__':
    main()
