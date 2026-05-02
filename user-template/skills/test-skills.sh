#!/usr/bin/env bash
# Test script to validate all skills are working and portable
# This script can be run from any directory to test skill accessibility

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/.claude/skills"

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "Skills Portability Test"
echo "======================================"
echo ""
echo "Testing from directory: $(pwd)"
echo "Skills directory: $SKILLS_DIR"
echo ""

# Track results
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_skill() {
    local skill_name=$1
    local skill_path="$SKILLS_DIR/$skill_name/$skill_name"
    local test_command=$2

    echo -n "Testing $skill_name... "

    # Check if skill exists
    if [ ! -f "$skill_path" ]; then
        echo -e "${RED}FAIL${NC} - Skill not found at $skill_path"
        ((TESTS_FAILED++))
        return 1
    fi

    # Check if executable
    if [ ! -x "$skill_path" ]; then
        echo -e "${RED}FAIL${NC} - Skill not executable"
        ((TESTS_FAILED++))
        return 1
    fi

    # Run test command
    if cd "$SKILLS_DIR/$skill_name" && eval "./$skill_name $test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC} - Command failed: $test_command"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "======================================"
echo "Test 1: Skill Executables"
echo "======================================"
echo ""

# Test each skill exists and is executable
for skill in akips netswitch panos; do
    skill_path="$SKILLS_DIR/$skill/$skill"
    echo -n "  $skill executable: "
    if [ -x "$skill_path" ]; then
        echo -e "${GREEN}OK${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}FAIL${NC}"
        ((TESTS_FAILED++))
    fi
done

echo ""
echo "======================================"
echo "Test 2: Help/Validation Commands"
echo "======================================"
echo ""

# Test akips help
echo -n "  akips --help: "
if (cd "$SKILLS_DIR/akips" && ./akips --help > /dev/null 2>&1); then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test netswitch validate
echo -n "  netswitch validate: "
if (cd "$SKILLS_DIR/netswitch" && ./netswitch validate "show version" > /dev/null 2>&1); then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test panos validate
echo -n "  panos validate: "
if (cd "$SKILLS_DIR/panos" && ./panos validate "show system info" > /dev/null 2>&1); then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "======================================"
echo "Test 3: Run from Different Directory"
echo "======================================"
echo ""

# Create temp directory and test from there
TEMP_DIR=$(mktemp -d)
echo "  Testing from: $TEMP_DIR"
echo ""

cd "$TEMP_DIR"

# Test akips from different directory
echo -n "  akips (from temp dir): "
if "$SKILLS_DIR/akips/akips" --help > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test netswitch from different directory
echo -n "  netswitch (from temp dir): "
if "$SKILLS_DIR/netswitch/netswitch" validate "show version" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test panos from different directory
echo -n "  panos (from temp dir): "
if "$SKILLS_DIR/panos/panos" validate "show system info" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Cleanup
rm -rf "$TEMP_DIR"
cd "$SCRIPT_DIR"

echo ""
echo "======================================"
echo "Test 4: Helper Script"
echo "======================================"
echo ""

if [ -x "$SKILLS_DIR/run-skill.sh" ]; then
    echo -n "  run-skill.sh exists: ${GREEN}OK${NC}"
    echo ""
    ((TESTS_PASSED++))

    # Test helper script
    echo -n "  run-skill.sh functionality: "
    if "$SKILLS_DIR/run-skill.sh" > /dev/null 2>&1 || [ $? -eq 1 ]; then
        # Exit code 1 is expected (no skill name provided)
        echo -e "${GREEN}PASS${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}FAIL${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "  run-skill.sh: ${YELLOW}NOT FOUND${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "======================================"
echo "Test 5: Documentation"
echo "======================================"
echo ""

# Check for SKILL.md files
for skill in akips netswitch panos; do
    doc_path="$SKILLS_DIR/$skill/SKILL.md"
    echo -n "  $skill/SKILL.md: "
    if [ -f "$doc_path" ]; then
        # Check if it has portability instructions
        if grep -q "SKILL_BASE_DIR" "$doc_path" && grep -q "Do NOT hardcode paths" "$doc_path"; then
            echo -e "${GREEN}OK (Portable)${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${YELLOW}WARNING (Missing portability instructions)${NC}"
            ((TESTS_FAILED++))
        fi
    else
        echo -e "${RED}MISSING${NC}"
        ((TESTS_FAILED++))
    fi
done

# Check for portability guide
echo -n "  PORTABILITY.md: "
if [ -f "$SKILLS_DIR/PORTABILITY.md" ]; then
    echo -e "${GREEN}OK${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}NOT FOUND${NC}"
fi

# Check for setup guide
echo -n "  SKILLS_PATH_SETUP.md: "
if [ -f "$SCRIPT_DIR/SKILLS_PATH_SETUP.md" ]; then
    echo -e "${GREEN}OK${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}NOT FOUND${NC}"
fi

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo ""
echo "  Total tests: $((TESTS_PASSED + TESTS_FAILED))"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "Skills are properly configured and portable."
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Please review the failures above."
    exit 1
fi
