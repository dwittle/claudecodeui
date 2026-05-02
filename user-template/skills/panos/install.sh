#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if target directory is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <target_directory>"
    echo "Example: $0 ~/projects/myproject"
    exit 1
fi

TARGET_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve target directory to absolute path
TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || echo "$TARGET_DIR")"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    print_error "Target directory does not exist: $TARGET_DIR"
    exit 1
fi

INSTALL_DIR="$TARGET_DIR/.claude/skills/panos"
CREDS_FILE="$HOME/.panos_credentials"

print_info "Installing PAN-OS skill to: $INSTALL_DIR"

# Create the installation directory
mkdir -p "$INSTALL_DIR"

# Copy necessary files
print_info "Copying skill files..."
cp "$SCRIPT_DIR/SKILL.md" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/panos_client.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/panos_cli.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/panos" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/panos_cli.py"
chmod +x "$INSTALL_DIR/panos"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/README.md" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/credentials.template" "$INSTALL_DIR/"

# Copy docs directory if it exists
if [ -d "$SCRIPT_DIR/docs" ]; then
    print_info "Copying documentation..."
    cp -r "$SCRIPT_DIR/docs" "$INSTALL_DIR/"
fi

# Copy tests directory if it exists
if [ -d "$SCRIPT_DIR/tests" ]; then
    print_info "Copying test files..."
    cp -r "$SCRIPT_DIR/tests" "$INSTALL_DIR/"
    # Make test scripts executable
    chmod +x "$INSTALL_DIR/tests/"*.sh 2>/dev/null || true
fi

# Copy templates directory if it exists
if [ -d "$SCRIPT_DIR/templates" ]; then
    print_info "Copying templates..."
    cp -r "$SCRIPT_DIR/templates" "$INSTALL_DIR/"
fi

# Create virtual environment in the skill directory
print_info "Creating virtual environment..."
cd "$INSTALL_DIR"
python3 -m venv .venv

# Activate venv and install dependencies
print_info "Installing dependencies..."
source .venv/bin/activate
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt

# Setup credentials file if it doesn't exist
if [ ! -f "$CREDS_FILE" ]; then
    print_info "Setting up credentials file..."
    cp "$INSTALL_DIR/credentials.template" "$CREDS_FILE"
    chmod 600 "$CREDS_FILE"
    print_info "✓ Created $CREDS_FILE with mode 600"
    print_warning "IMPORTANT: Edit $CREDS_FILE and add your PAN-OS credentials!"
else
    print_info "✓ Credentials file already exists: $CREDS_FILE"

    # Check permissions
    PERMS=$(stat -c "%a" "$CREDS_FILE" 2>/dev/null || stat -f "%A" "$CREDS_FILE" 2>/dev/null)
    if [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
        print_warning "Credentials file has permissions $PERMS, should be 600"
        echo "   Run: chmod 600 $CREDS_FILE"
    else
        print_info "✓ Credentials file has correct permissions ($PERMS)"
    fi
fi

print_info "✓ PAN-OS CLI tool installed successfully!"
print_info ""
print_info "To use the tool:"
echo "  1. cd $INSTALL_DIR"
echo "  2. Edit credentials: vim $CREDS_FILE"
echo "  3. Test validation: ./panos validate \"show system info\""
echo "  4. Run command: ./panos show <firewall> \"show system info\" --bastion-host <jump-host>"
echo ""
print_info "Example commands:"
echo "  ./panos show fw1 \"show system info\" --bastion-host netprod0001"
echo "  ./panos show fw1 \"show interface all\" --bastion-host netprod0001"
echo "  ./panos show fw1 \"show routing route\" --bastion-host netprod0001"
echo ""
print_info "Documentation:"
echo "  SKILL.md                        - Complete skill documentation"
echo "  docs/INSTALLATION.md            - Installation and setup guide"
echo "  docs/CLAUDE.md                  - Claude Code integration guide"
echo "  docs/PRODUCTION_SAFETY.md       - Safety features and LLM validation"
echo ""
print_info "IMPORTANT: This tool requires a bastion host for connectivity."
print_info "Make sure your ~/.panos_credentials file has both PAN-OS and bastion credentials."
print_info ""
