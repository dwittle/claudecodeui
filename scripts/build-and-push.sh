#!/bin/bash
# Build and Push Script for CloudCLI Multi-User Container Images
# This script builds the gateway and worker images and pushes them to GitLab Container Registry

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_REGISTRY="registry.gitlab.com"
DEFAULT_PROJECT="cloudcli/cloudcli"  # Change this to your GitLab project path
VERSION="${1:-latest}"
RUNTIME="${CONTAINER_RUNTIME:-auto}"

# Detect container runtime
detect_runtime() {
    if [ "$RUNTIME" = "auto" ]; then
        if command -v podman &> /dev/null; then
            RUNTIME="podman"
        elif command -v docker &> /dev/null; then
            RUNTIME="docker"
        else
            echo -e "${RED}Error: Neither Docker nor Podman found${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}Using container runtime: $RUNTIME${NC}"
}

# Parse arguments
REGISTRY="${REGISTRY:-$DEFAULT_REGISTRY}"
PROJECT="${PROJECT:-$DEFAULT_PROJECT}"
FULL_PATH="${REGISTRY}/${PROJECT}"

echo "=================================="
echo "CloudCLI Build and Push Script"
echo "=================================="
echo "Registry: $REGISTRY"
echo "Project:  $PROJECT"
echo "Version:  $VERSION"
echo ""

# Detect runtime
detect_runtime

# Build gateway image
echo -e "${YELLOW}Building gateway image...${NC}"
$RUNTIME build \
    -t "${FULL_PATH}/gateway:${VERSION}" \
    -t "${FULL_PATH}/gateway:latest" \
    -f Dockerfile \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Gateway image built successfully${NC}"
else
    echo -e "${RED}✗ Gateway image build failed${NC}"
    exit 1
fi

# Build worker image
echo -e "${YELLOW}Building worker image...${NC}"
$RUNTIME build \
    -t "${FULL_PATH}/worker:${VERSION}" \
    -t "${FULL_PATH}/worker:latest" \
    -f docker/worker/Dockerfile \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Worker image built successfully${NC}"
else
    echo -e "${RED}✗ Worker image build failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Images built successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Login to GitLab Container Registry:"
echo "   $RUNTIME login ${REGISTRY}"
echo ""
echo "2. Push images to registry:"
echo "   $RUNTIME push ${FULL_PATH}/gateway:${VERSION}"
echo "   $RUNTIME push ${FULL_PATH}/gateway:latest"
echo "   $RUNTIME push ${FULL_PATH}/worker:${VERSION}"
echo "   $RUNTIME push ${FULL_PATH}/worker:latest"
echo ""
echo "Or run this script with --push flag to automatically push"

# Optional auto-push
if [ "$2" = "--push" ]; then
    echo ""
    echo -e "${YELLOW}Pushing images to registry...${NC}"

    # Check if already logged in
    if ! $RUNTIME login $REGISTRY --get-login 2>/dev/null; then
        echo -e "${YELLOW}Please login to GitLab Container Registry:${NC}"
        $RUNTIME login $REGISTRY
    fi

    echo -e "${YELLOW}Pushing gateway:${VERSION}...${NC}"
    $RUNTIME push "${FULL_PATH}/gateway:${VERSION}"

    echo -e "${YELLOW}Pushing gateway:latest...${NC}"
    $RUNTIME push "${FULL_PATH}/gateway:latest"

    echo -e "${YELLOW}Pushing worker:${VERSION}...${NC}"
    $RUNTIME push "${FULL_PATH}/worker:${VERSION}"

    echo -e "${YELLOW}Pushing worker:latest...${NC}"
    $RUNTIME push "${FULL_PATH}/worker:latest"

    echo ""
    echo -e "${GREEN}✓ All images pushed successfully!${NC}"
    echo ""
    echo "Images available at:"
    echo "  ${FULL_PATH}/gateway:${VERSION}"
    echo "  ${FULL_PATH}/gateway:latest"
    echo "  ${FULL_PATH}/worker:${VERSION}"
    echo "  ${FULL_PATH}/worker:latest"
fi

echo ""
echo "Done!"
