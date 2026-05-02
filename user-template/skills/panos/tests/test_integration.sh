#!/bin/bash
# Integration test for production safety check

echo "========================================================================"
echo "PAN-OS Production Safety Check - Integration Test"
echo "========================================================================"

# Set dummy credentials for testing
export PANOS_USERNAME="testuser"
export PANOS_PASSWORD="testpass"

# Test 1: Show command should execute without safety check
echo ""
echo "Test 1: Show command (should succeed without safety check)"
echo "Command: show system info"
./.venv/bin/python3 panos_cli.py show dummy "show system info" --json 2>&1 | head -5
EXIT_CODE=$?
if [ $EXIT_CODE -eq 1 ]; then
    echo "✓ Expected: Connection error (no actual firewall)"
else
    echo "✗ Unexpected exit code: $EXIT_CODE"
fi

# Test 2: Test command without --confirmed-safe should return exit code 2
echo ""
echo "Test 2: Test command WITHOUT --confirmed-safe (should require safety check)"
echo "Command: test routing fib-lookup virtual-router VR1 ip 10.1.1.1"
OUTPUT=$(./.venv/bin/python3 panos_cli.py show dummy "test routing fib-lookup virtual-router VR1 ip 10.1.1.1" 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -eq 2 ]; then
    echo "✓ PASS: Exit code 2 (SAFETY_CHECK_REQUIRED)"
    echo "$OUTPUT" | grep -q "SAFETY_CHECK_REQUIRED"
    if [ $? -eq 0 ]; then
        echo "✓ PASS: Error message contains SAFETY_CHECK_REQUIRED"
    else
        echo "✗ FAIL: Error message missing SAFETY_CHECK_REQUIRED"
    fi
else
    echo "✗ FAIL: Expected exit code 2, got $EXIT_CODE"
fi

# Test 3: Debug command without --confirmed-safe should return exit code 2
echo ""
echo "Test 3: Debug command WITHOUT --confirmed-safe (should require safety check)"
echo "Command: debug software status"
OUTPUT=$(./.venv/bin/python3 panos_cli.py show dummy "debug software status" 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -eq 2 ]; then
    echo "✓ PASS: Exit code 2 (SAFETY_CHECK_REQUIRED)"
else
    echo "✗ FAIL: Expected exit code 2, got $EXIT_CODE"
fi

# Test 4: Dangerous command should be blocked (exit code 1)
echo ""
echo "Test 4: Dangerous command (should be blocked before safety check)"
echo "Command: debug software restart process routed"
OUTPUT=$(./.venv/bin/python3 panos_cli.py show dummy "debug software restart process routed" 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -eq 1 ]; then
    echo "✓ PASS: Exit code 1 (SECURITY VIOLATION)"
    echo "$OUTPUT" | grep -q "SECURITY VIOLATION"
    if [ $? -eq 0 ]; then
        echo "✓ PASS: Error message contains SECURITY VIOLATION"
    else
        echo "✗ FAIL: Error message missing SECURITY VIOLATION"
    fi
else
    echo "✗ FAIL: Expected exit code 1, got $EXIT_CODE"
fi

# Test 5: Test command WITH --confirmed-safe should attempt execution
echo ""
echo "Test 5: Test command WITH --confirmed-safe (should bypass safety check)"
echo "Command: test routing fib-lookup virtual-router VR1 ip 10.1.1.1 --confirmed-safe"
OUTPUT=$(./.venv/bin/python3 panos_cli.py show dummy "test routing fib-lookup virtual-router VR1 ip 10.1.1.1" --confirmed-safe 2>&1)
EXIT_CODE=$?
# Will fail with connection error (1) not safety check error (2)
if [ $EXIT_CODE -eq 1 ]; then
    echo "✓ PASS: Bypassed safety check (got connection error as expected)"
    echo "$OUTPUT" | grep -q "SAFETY_CHECK_REQUIRED"
    if [ $? -ne 0 ]; then
        echo "✓ PASS: No SAFETY_CHECK_REQUIRED error"
    else
        echo "✗ FAIL: Still got SAFETY_CHECK_REQUIRED despite --confirmed-safe"
    fi
elif [ $EXIT_CODE -eq 2 ]; then
    echo "✗ FAIL: Still got exit code 2, safety check was not bypassed"
else
    echo "? Got exit code $EXIT_CODE (connection may have succeeded?)"
fi

echo ""
echo "========================================================================"
echo "Integration tests complete!"
echo "========================================================================"
