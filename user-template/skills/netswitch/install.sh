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

INSTALL_DIR="$TARGET_DIR/.claude/skills/netswitch"

print_info "Installing netswitch skill to: $INSTALL_DIR"

# Create the installation directory
mkdir -p "$INSTALL_DIR"

# Copy necessary files
print_info "Copying skill files..."
cp "$SCRIPT_DIR/SKILL.md" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/netswitch_client.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/netswitch_cli.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/netswitch" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/netswitch_wrapper.sh" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/netswitch_cli.py"
chmod +x "$INSTALL_DIR/netswitch"
chmod +x "$INSTALL_DIR/netswitch_wrapper.sh"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/README.md" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/example_commands.txt" "$INSTALL_DIR/"

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
    # Make template scripts executable
    chmod +x "$INSTALL_DIR/templates/"*.py 2>/dev/null || true
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

# Check if .env exists in the target install directory, if not prompt user
if [ ! -f "$INSTALL_DIR/.env" ]; then
    print_warning "No .env file found in $INSTALL_DIR"
    print_info "Please create a .env file with your network device credentials:"
    echo "  NETSWITCH_USERNAME=your-username"
    echo "  NETSWITCH_PASSWORD=your-password"
    echo "  NETSWITCH_BASTION_HOST=your-bastion-host (optional)"
    echo ""
    print_info "You can copy .env.example as a starting point:"
    echo "  cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env"
fi

print_info "✓ Network Switch CLI tool installed successfully!"
print_info ""
print_info "To use the tool:"
echo "  1. cd $INSTALL_DIR"
echo "  2. Configure your .env file: cp .env.example .env && vim .env"
echo "  3. Run CLI: ./netswitch <hostname> \"<command>\""
echo ""
print_info "Example commands:"
echo "  ./netswitch switch01 \"show version\""
echo "  ./netswitch switch01 \"show interfaces status\""
echo "  ./netswitch switch01 \"show ip interface brief\""
echo ""
print_info "For more examples, see: example_commands.txt"
print_info "For detailed usage, see: docs/QUICKSTART.md"
print_info ""
