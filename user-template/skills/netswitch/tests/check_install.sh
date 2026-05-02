#!/usr/bin/env bash
#
# Check if the netswitch skill is properly installed
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Checking netswitch skill installation..."
echo ""

# Check if we're in the right directory
if [ ! -f "netswitch_cli.py" ]; then
    echo -e "${RED}✗${NC} Not in netswitch directory"
    echo "  Run this script from the netswitch skill directory"
    exit 1
fi
echo -e "${GREEN}✓${NC} In netswitch directory"

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo -e "${RED}✗${NC} Virtual environment not found"
    echo "  Run: python3 -m venv .venv"
    exit 1
fi
echo -e "${GREEN}✓${NC} Virtual environment exists"

# Check if Python executable exists
if [ ! -f ".venv/bin/python3" ]; then
    echo -e "${RED}✗${NC} Python executable not found in venv"
    echo "  Try recreating: python3 -m venv .venv"
    exit 1
fi
echo -e "${GREEN}✓${NC} Python executable exists"

# Check if paramiko is installed
if ! .venv/bin/python3 -c "import paramiko" 2>/dev/null; then
    echo -e "${RED}✗${NC} paramiko not installed"
    echo "  Run: .venv/bin/pip install -r requirements.txt"
    exit 1
fi
echo -e "${GREEN}✓${NC} paramiko installed"

# Check if CLI is executable
if [ ! -x "netswitch_cli.py" ]; then
    echo -e "${YELLOW}⚠${NC} netswitch_cli.py not executable"
    echo "  Run: chmod +x netswitch_cli.py"
    chmod +x netswitch_cli.py
    echo -e "${GREEN}✓${NC} Fixed: netswitch_cli.py is now executable"
else
    echo -e "${GREEN}✓${NC} netswitch_cli.py is executable"
fi

# Check environment variables
echo ""
echo "Environment variable check:"
if [ -z "$NETSWITCH_PASSWORD" ]; then
    echo -e "${YELLOW}⚠${NC} NETSWITCH_PASSWORD not set (required for operation)"
    echo "  Set with: export NETSWITCH_PASSWORD=your-password"
else
    echo -e "${GREEN}✓${NC} NETSWITCH_PASSWORD is set"
fi

if [ -z "$NETSWITCH_USERNAME" ]; then
    echo -e "${YELLOW}⚠${NC} NETSWITCH_USERNAME not set (optional, can use --username)"
else
    echo -e "${GREEN}✓${NC} NETSWITCH_USERNAME is set to: $NETSWITCH_USERNAME"
fi

# Test command validation
echo ""
echo "Testing command validation..."
if .venv/bin/python3 netswitch_cli.py validate "show version" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Command validation working"
else
    echo -e "${RED}✗${NC} Command validation failed"
    exit 1
fi

# Test security
echo ""
echo "Testing security controls..."
if .venv/bin/python3 test_security.py >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} All 40 security tests passed"
else
    echo -e "${RED}✗${NC} Security tests failed"
    echo "  Run: .venv/bin/python3 test_security.py"
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Installation check passed!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "You can now use the skill:"
echo "  .venv/bin/python3 netswitch_cli.py show <hostname> \"show version\""
echo ""
echo "Or with Claude Code:"
echo "  /netswitch show <hostname> \"show version\""
