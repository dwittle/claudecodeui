#!/usr/bin/env bash
# Port Investigation Protocol Template
# Demonstrates the correct order of commands for investigating port configuration
#
# Usage: ./port_investigation.sh <hostname> <interface>
# Example: ./port_investigation.sh b671-2235-sw1 Gi2/0/17

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <hostname> <interface>"
    echo "Example: $0 b671-2235-sw1 Gi2/0/17"
    exit 1
fi

HOSTNAME="$1"
INTERFACE="$2"

# Get to the skill directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "========================================"
echo "PORT INVESTIGATION: $INTERFACE on $HOSTNAME"
echo "========================================"
echo ""

# STEP 1: Running Configuration (SOURCE OF TRUTH)
echo "========== STEP 1: RUNNING CONFIGURATION (SOURCE OF TRUTH) =========="
echo "Command: show running-config interface $INTERFACE"
echo ""
./netswitch show "$HOSTNAME" "show running-config interface $INTERFACE"
echo ""
echo ""

# STEP 2: Operational Status
echo "========== STEP 2: OPERATIONAL STATUS =========="
echo "Command: show interfaces $INTERFACE status"
echo ""
./netswitch show "$HOSTNAME" "show interfaces $INTERFACE status"
echo ""
echo ""

# STEP 3: Detailed Interface Info
echo "========== STEP 3: DETAILED INTERFACE INFO =========="
echo "Command: show interfaces $INTERFACE"
echo ""
./netswitch show "$HOSTNAME" "show interfaces $INTERFACE"
echo ""
echo ""

# STEP 4: Switchport Details (if applicable)
echo "========== STEP 4: SWITCHPORT DETAILS =========="
echo "Command: show interfaces $INTERFACE switchport"
echo ""
./netswitch show "$HOSTNAME" "show interfaces $INTERFACE switchport" 2>/dev/null || echo "(Not a switchport or command not supported)"
echo ""
echo ""

echo "========================================"
echo "INVESTIGATION COMPLETE"
echo "========================================"
echo ""
echo "ANALYSIS GUIDELINES:"
echo "1. Check running-config for 'switchport mode' - this is the configured mode"
echo "2. If config shows 'trunk' but status shows VLAN number (not 'trunk'):"
echo "   → Port is DOWN and showing native VLAN"
echo "3. If config shows 'access vlan X' and status shows 'X':"
echo "   → Port is configured correctly as access port"
echo "4. If config doesn't match status → investigate DTP negotiation or misconfiguration"
