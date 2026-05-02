#!/usr/bin/env bash
# Setup script for PAN-OS skill

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREDS_FILE="$HOME/.panos_credentials"

echo "=== PAN-OS Skill Setup ==="
echo

# Check if virtual environment exists
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$SCRIPT_DIR/.venv"
else
    echo "✓ Virtual environment already exists"
fi

# Install dependencies
echo "Installing dependencies..."
"$SCRIPT_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$SCRIPT_DIR/.venv/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"
echo "✓ Dependencies installed"

# Make wrapper executable
chmod +x "$SCRIPT_DIR/panos"
echo "✓ Wrapper script is executable"

# Setup credentials
if [ ! -f "$CREDS_FILE" ]; then
    echo
    echo "Setting up credentials file..."
    cp "$SCRIPT_DIR/credentials.template" "$CREDS_FILE"
    chmod 600 "$CREDS_FILE"
    echo "✓ Created $CREDS_FILE with mode 600"
    echo
    echo "⚠️  IMPORTANT: Edit $CREDS_FILE and add your PAN-OS credentials!"
    echo "   Then run: chmod 600 $CREDS_FILE"
else
    echo "✓ Credentials file already exists: $CREDS_FILE"

    # Check permissions
    PERMS=$(stat -c "%a" "$CREDS_FILE" 2>/dev/null || stat -f "%A" "$CREDS_FILE" 2>/dev/null)
    if [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
        echo "⚠️  WARNING: Credentials file has permissions $PERMS, should be 600"
        echo "   Run: chmod 600 $CREDS_FILE"
    else
        echo "✓ Credentials file has correct permissions ($PERMS)"
    fi
fi

echo
echo "=== Setup Complete ==="
echo
echo "Next steps:"
echo "1. Edit $CREDS_FILE with your PAN-OS credentials"
echo "2. Test the skill: $SCRIPT_DIR/panos validate \"show system info\""
echo "3. Try it: $SCRIPT_DIR/panos show <firewall-hostname> \"show system info\""
echo
echo "For usage instructions, see: $SCRIPT_DIR/SKILL.md"
