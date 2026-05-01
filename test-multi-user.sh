#!/bin/bash
# Test script for multi-user mode

set -e

echo "==================================="
echo "Multi-User Mode Test"
echo "==================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
GATEWAY_URL="http://localhost:3333"
TEST_USER="testuser"
TEST_PASS="testpass123"

echo "Step 1: Check if gateway is running..."
if curl -s "${GATEWAY_URL}/api/health" > /dev/null; then
    echo -e "${GREEN}✓ Gateway is running${NC}"
else
    echo -e "${RED}✗ Gateway is not responding${NC}"
    exit 1
fi
echo ""

echo "Step 2: Register test user..."
REGISTER_RESPONSE=$(curl -s -X POST "${GATEWAY_URL}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}" \
    2>/dev/null || echo '{"error":"already exists"}')

if echo "$REGISTER_RESPONSE" | grep -q "token\|already exists"; then
    echo -e "${GREEN}✓ User registered or already exists${NC}"
else
    echo -e "${YELLOW}⚠ Registration response: $REGISTER_RESPONSE${NC}"
fi
echo ""

echo "Step 3: Login to get JWT token..."
LOGIN_RESPONSE=$(curl -s -X POST "${GATEWAY_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ Failed to get token${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✓ Successfully logged in${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

echo "Step 4: Check if container is created/running..."
sleep 2  # Give container time to start
if podman ps | grep -q "cloudcli-user"; then
    echo -e "${GREEN}✓ Container is running${NC}"
    podman ps | grep cloudcli-user
else
    echo -e "${YELLOW}⚠ No container running yet, it may be starting...${NC}"
fi
echo ""

echo "Step 5: Test API request through proxy..."
API_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${GATEWAY_URL}/api/projects")

HTTP_STATUS=$(echo "$API_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$API_RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo "Response body: ${BODY:0:200}"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ API request successful through proxy!${NC}"
else
    echo -e "${RED}✗ API request failed with status $HTTP_STATUS${NC}"
fi
echo ""

echo "Step 6: Verify container details..."
if podman ps | grep -q "cloudcli-user"; then
    CONTAINER_ID=$(podman ps | grep cloudcli-user | awk '{print $1}')
    echo "Container ID: $CONTAINER_ID"

    # Check port mapping
    PORT_MAP=$(podman ps | grep cloudcli-user | awk '{print $5}')
    echo "Port mapping: $PORT_MAP"

    # Check JWT secret matches
    CONTAINER_JWT=$(podman exec cloudcli-user-1 printenv JWT_SECRET 2>/dev/null || echo "N/A")
    if [ -n "$CONTAINER_JWT" ] && [ "$CONTAINER_JWT" != "N/A" ]; then
        echo -e "${GREEN}✓ JWT secret is set in container${NC}"
    else
        echo -e "${YELLOW}⚠ Could not verify JWT secret${NC}"
    fi
fi
echo ""

echo "==================================="
echo "Test Complete!"
echo "==================================="
