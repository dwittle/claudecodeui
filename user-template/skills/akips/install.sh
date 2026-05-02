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

INSTALL_DIR="$TARGET_DIR/.claude/skills/akips"

print_info "Installing akips skill to: $INSTALL_DIR"

# Create the installation directory
mkdir -p "$INSTALL_DIR"

# Copy necessary files
print_info "Copying skill files..."
cp "$SCRIPT_DIR/SKILL.md" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/akips_client.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/akips_cli.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/akips_graph.py" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/akips" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/akips_cli.py"
chmod +x "$INSTALL_DIR/akips_graph.py"
chmod +x "$INSTALL_DIR/akips"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/README.md" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/"

# Copy docs directory if it exists
if [ -d "$SCRIPT_DIR/docs" ]; then
    print_info "Copying documentation..."
    cp -r "$SCRIPT_DIR/docs" "$INSTALL_DIR/"
fi

# Copy tests directory if it exists
if [ -d "$SCRIPT_DIR/tests" ]; then
    print_info "Copying test files..."
    cp -r "$SCRIPT_DIR/tests" "$INSTALL_DIR/"
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

# Check if .env exists in the target install directory, if not prompt user
if [ ! -f "$INSTALL_DIR/.env" ]; then
    print_warning "No .env file found in $INSTALL_DIR"
    print_info "Please create a .env file with your AKiPS credentials:"
    echo "  AKIPS_URL=https://your-akips-server"
    echo "  AKIPS_USERNAME=your-username"
    echo "  AKIPS_PASSWORD=your-password"
    echo ""
    print_info "You can copy .env.example as a starting point:"
    echo "  cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env"
fi

print_info "✓ AKiPS CLI and Graphing tools installed successfully!"
print_info ""
print_info "To use the tools:"
echo "  1. cd $INSTALL_DIR"
echo "  2. Configure your .env file: cp .env.example .env && vim .env"
echo "  3. Set your API password: export AKIPS_API_PASSWORD=your-password"
echo "  4. Run CLI: ./akips_cli.py --help"
echo "  5. Generate graphs: ./akips_graph.py --help"
print_info ""
print_info "Example CLI commands:"
echo "  ./akips_cli.py list-devices"
echo "  ./akips_cli.py get-device-info router01"
echo "  ./akips_cli.py get-top-interfaces 10"
print_info ""
print_info "Example graphing commands:"
echo "  ./akips_graph.py 900 last12h counter --device router01 --rate -o traffic.png"
echo "  ./akips_graph.py 3600 yesterday counter --attribute /ifHCInOctets/ --rate"
print_info ""
print_info "Documentation:"
echo "  README.md           - General usage and CLI reference"
echo "  docs/GRAPHING.md    - Graph generation examples and tips"
print_info ""
print_info "Don't forget to set AKIPS_API_PASSWORD environment variable!"
