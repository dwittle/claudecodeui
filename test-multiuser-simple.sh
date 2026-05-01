#!/bin/bash
# Simple multi-user mode test

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=================================================="
echo "Multi-User Container Mode Test"
echo "=================================================="
echo ""

# Get JWT secret from database
echo -e "${BLUE}1️⃣  Getting JWT secret from database...${NC}"
JWT_SECRET=$(sqlite3 ~/.cloudcli/auth.db "SELECT value FROM app_config WHERE key='jwt_secret';")
if [ -z "$JWT_SECRET" ]; then
    echo -e "${RED}✗ No JWT secret found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ JWT secret found: ${JWT_SECRET:0:20}...${NC}"
echo ""

# Get user ID
echo -e "${BLUE}2️⃣  Getting user ID...${NC}"
USER_ID=$(sqlite3 ~/.cloudcli/auth.db "SELECT id FROM users LIMIT 1;")
if [ -z "$USER_ID" ]; then
    echo -e "${RED}✗ No users found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ User ID: $USER_ID${NC}"
echo ""

# Create JWT token using Node
echo -e "${BLUE}3️⃣  Creating JWT token...${NC}"
TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId: $USER_ID }, '$JWT_SECRET', { expiresIn: '1h' });
console.log(token);
")
echo -e "${GREEN}✓ Token created: ${TOKEN:0:30}...${NC}"
echo ""

# Check containers before
echo -e "${BLUE}4️⃣  Checking containers BEFORE API request...${NC}"
BEFORE_COUNT=$(podman ps | grep -c cloudcli-user || echo "0")
echo -e "${YELLOW}ℹ Containers running: $BEFORE_COUNT${NC}"
if [ "$BEFORE_COUNT" -gt "0" ]; then
    podman ps | grep cloudcli-user || true
fi
echo ""

# Make API request
echo -e "${BLUE}5️⃣  Making API request (should trigger container creation)...${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "http://localhost:3333/api/projects")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "   HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ API request successful!${NC}"
    echo "   Response: ${BODY:0:100}..."
else
    echo -e "${YELLOW}⚠ Response: ${BODY:0:200}${NC}"
fi
echo ""

# Wait for container to start
echo -e "${BLUE}6️⃣  Waiting for container to start (5 seconds)...${NC}"
sleep 5
echo ""

# Check containers after
echo -e "${BLUE}7️⃣  Checking containers AFTER API request...${NC}"
AFTER_COUNT=$(podman ps | grep -c cloudcli-user || echo "0")
echo -e "${YELLOW}ℹ Containers running: $AFTER_COUNT${NC}"

if [ "$AFTER_COUNT" -gt "0" ]; then
    echo ""
    echo "Container details:"
    podman ps | grep cloudcli-user || true
    echo ""

    if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
        echo -e "${GREEN}✓✓✓ NEW CONTAINER CREATED! Multi-user mode is working! ✓✓✓${NC}"
    else
        echo -e "${GREEN}✓ Container was already running${NC}"
    fi

    # Get container port
    CONTAINER_PORT=$(podman ps --format "{{.Ports}}" | grep -o '0.0.0.0:[0-9]*' | head -1 | cut -d: -f2)
    if [ -n "$CONTAINER_PORT" ]; then
        echo ""
        echo -e "${BLUE}8️⃣  Testing direct container access on port $CONTAINER_PORT...${NC}"
        CONTAINER_HEALTH=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:$CONTAINER_PORT/api/health")
        if [ "$CONTAINER_HEALTH" = "200" ] || [ "$CONTAINER_HEALTH" = "302" ]; then
            echo -e "${GREEN}✓ Container is responding directly${NC}"
        else
            echo -e "${YELLOW}⚠ Container returned status: $CONTAINER_HEALTH${NC}"
        fi

        # Check JWT secret in container
        echo ""
        echo -e "${BLUE}9️⃣  Verifying JWT secret in container...${NC}"
        CONTAINER_JWT=$(podman exec cloudcli-user-$USER_ID printenv JWT_SECRET 2>/dev/null || echo "N/A")
        if [ "$CONTAINER_JWT" = "$JWT_SECRET" ]; then
            echo -e "${GREEN}✓ JWT secrets match! Authentication will work!${NC}"
        else
            echo -e "${YELLOW}⚠ JWT secret mismatch or not accessible${NC}"
        fi
    fi
else
    echo -e "${RED}✗ No containers found - check server logs for errors${NC}"
    echo ""
    echo "Server logs:"
    tail -50 /tmp/cloudcli-test.log | grep -E "(Error|ContainerManager|ProxyMiddleware)" || echo "No relevant logs found"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}Test complete!${NC}"
echo "=================================================="
