#!/usr/bin/env bash
# Test script for PAN-OS skill command validation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== PAN-OS Skill Validation Tests ==="
echo

test_command() {
    local expected="$1"
    local command="$2"
    local description="$3"

    echo -n "Testing: $description ... "

    if ./panos validate "$command" &>/dev/null; then
        result="PASS"
    else
        result="FAIL"
    fi

    if [ "$expected" == "$result" ]; then
        echo -e "${GREEN}✓ $result (expected)${NC}"
        return 0
    else
        echo -e "${RED}✗ $result (expected $expected)${NC}"
        return 1
    fi
}

echo "--- Valid Commands (should PASS) ---"
test_command "PASS" "show system info" "show command"
test_command "PASS" "show interface all" "show interfaces"
test_command "PASS" "show routing route" "show routing"
test_command "PASS" "show session all" "show sessions"
test_command "PASS" "test routing fib-lookup virtual-router default ip 8.8.8.8" "test routing"
test_command "PASS" "test security-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8 protocol 6 destination-port 443" "test policy match"
test_command "PASS" "test nat-policy-match from trust to untrust source 10.1.1.1 destination 8.8.8.8 protocol 6" "test NAT match"
test_command "PASS" "debug dataplane pool statistics" "debug command"
test_command "PASS" "request system software check" "safe request command"
test_command "PASS" "request support info" "request support info"
test_command "PASS" "request tech-support" "request tech-support"

echo
echo "--- Invalid Commands (should FAIL) ---"
test_command "FAIL" "configure" "config mode"
test_command "FAIL" "set system hostname test" "set command"
test_command "FAIL" "delete address test" "delete command"
test_command "FAIL" "commit" "commit command"
test_command "FAIL" "request restart" "request restart"
test_command "FAIL" "request reboot" "request reboot"
test_command "FAIL" "request shutdown" "request shutdown"
test_command "FAIL" "show system info; configure" "command chaining with ;"
test_command "FAIL" "show system info && configure" "command chaining with &&"
test_command "FAIL" "show system info | grep hostname" "pipe command"
test_command "FAIL" "show system info > /tmp/output" "redirect output"
test_command "FAIL" "invalid command" "invalid prefix"
test_command "FAIL" "request system private-data-reset" "dangerous request"

echo
echo "=== Test Summary ==="
echo "All tests completed. Review results above."
echo
echo "Note: Exit code 1 is expected for invalid commands in this test script."
