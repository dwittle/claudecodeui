#!/usr/bin/env bash

# Note: Not using 'set -e' so we can continue installing other skills if one fails

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_section() {
    echo -e "\n${BLUE}===${NC} $1 ${BLUE}===${NC}\n"
}

# Check if target directory is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <target_directory>"
    echo "Example: $0 ~/projects/myproject"
    echo ""
    echo "This script will install all skills to the target directory:"
    echo "  - akips"
    echo "  - netswitch"
    echo "  - panos"
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

# Track installation status
INSTALLED=0
FAILED=0
SKILLS=("akips" "netswitch" "panos")

print_section "Installing Skills to $TARGET_DIR"

# Install top-level .claude directory structure
print_section "Setting up .claude directory"
CLAUDE_DIR="$TARGET_DIR/.claude"
mkdir -p "$CLAUDE_DIR"

# Copy settings.local.json if it exists
if [ -f "$SCRIPT_DIR/.claude/settings.local.json" ]; then
    print_info "Copying settings.local.json..."
    cp "$SCRIPT_DIR/.claude/settings.local.json" "$CLAUDE_DIR/"
    print_info "✓ settings.local.json installed successfully"
else
    print_warning "⊘ settings.local.json not found: $SCRIPT_DIR/.claude/settings.local.json"
fi

# Install top-level templates directory
if [ -d "$SCRIPT_DIR/templates" ]; then
    TEMPLATES_DIR="$CLAUDE_DIR/templates"
    mkdir -p "$TEMPLATES_DIR"
    print_info "Copying project templates..."
    cp -r "$SCRIPT_DIR/templates/"* "$TEMPLATES_DIR/"
    print_info "✓ Project templates installed successfully"
else
    print_warning "⊘ Templates directory not found: $SCRIPT_DIR/templates"
fi
echo ""

# Install each skill
for skill in "${SKILLS[@]}"; do
    print_section "Installing $skill skill"

    if [ -f "$SCRIPT_DIR/$skill/install.sh" ]; then
        if bash "$SCRIPT_DIR/$skill/install.sh" "$TARGET_DIR"; then
            print_info "✓ $skill installed successfully"
            ((INSTALLED++))
        else
            print_error "✗ Failed to install $skill"
            ((FAILED++))
        fi
    else
        print_warning "⊘ Install script not found: $SCRIPT_DIR/$skill/install.sh"
        ((FAILED++))
    fi

    echo ""
done

# Print summary
print_section "Installation Summary"
echo "Target directory: $TARGET_DIR"
echo "Skills installed: $INSTALLED"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Skills failed: $FAILED${NC}"
else
    echo -e "${GREEN}Skills failed: 0${NC}"
fi

echo ""
print_info "All skills have been installed to: $TARGET_DIR/.claude/skills/"
echo ""
print_info "Next steps:"
echo "  1. Configure credentials for each skill (see individual READMEs)"
echo "  2. Test each skill's CLI tools"
echo "  3. Review the SKILL.md files for usage in Claude Code"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
