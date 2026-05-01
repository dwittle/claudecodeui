#!/bin/bash
# Script to start CloudCLI in multi-user mode with authentication fix

echo "=========================================="
echo "Starting CloudCLI in Multi-User Mode"
echo "=========================================="
echo ""

# Kill any existing instances
echo "1. Cleaning up existing processes..."
lsof -ti:3333 -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -9 -f "npm.*dev" 2>/dev/null || true
sleep 2

# Verify environment
echo "2. Verifying configuration..."
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found!"
    exit 1
fi

MULTI_USER=$(grep "MULTI_USER_MODE" .env | cut -d= -f2)
IMAGE=$(grep "CONTAINER_BASE_IMAGE" .env | cut -d= -f2)

echo "   MULTI_USER_MODE: $MULTI_USER"
echo "   CONTAINER_BASE_IMAGE: $IMAGE"

if [ "$MULTI_USER" != "true" ]; then
    echo "   WARNING: MULTI_USER_MODE is not set to 'true'"
fi

if [ "$IMAGE" != "cloudcliai/worker:simple" ]; then
    echo "   WARNING: Using image $IMAGE instead of cloudcliai/worker:simple"
fi

# Check if worker image exists
echo "3. Checking worker image..."
if ! podman image exists localhost/cloudcliai/worker:simple; then
    echo "   Building worker image..."
    podman build -f docker/worker/Dockerfile.simple -t cloudcliai/worker:simple . || exit 1
fi
echo "   ✓ Worker image ready"

# Start server
echo "4. Starting server..."
npm run dev > /tmp/cloudcli-multiuser-$(date +%s).log 2>&1 &
SERVER_PID=$!

echo "   Server PID: $SERVER_PID"
echo "   Logs: /tmp/cloudcli-multiuser-*.log"
echo ""
echo "Waiting for server to start..."
sleep 10

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
    echo "✓ Server is running"
else
    echo "✗ Server failed to start"
    echo "Check logs: tail -50 /tmp/cloudcli-multiuser-*.log | tail -30"
    exit 1
fi

echo ""
echo "=========================================="
echo "Multi-User Mode Ready!"
echo "=========================================="
echo ""
echo "Gateway: http://localhost:3333"
echo "Frontend: http://localhost:5173"
echo ""
echo "To test:"
echo "  1. Login at http://localhost:5173"
echo "  2. Container will auto-create on first API request"
echo "  3. Check containers: podman ps | grep cloudcli"
echo ""
echo "To view logs:"
echo "  tail -f /tmp/cloudcli-multiuser-*.log"
echo ""
