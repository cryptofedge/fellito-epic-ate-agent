#!/bin/bash
# FELLITO startup script — runs server + tunnel, auto-restarts if either dies

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/backend"

echo "Starting FELLITO backend..."
pkill -f "node server.js" 2>/dev/null
pkill -f "ssh.*serveo" 2>/dev/null
sleep 1

# Start server
cd "$SCRIPT_DIR/backend"
node server.js > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 4

# Check server is up
if ! curl -s http://localhost:3001/health > /dev/null; then
  echo "ERROR: Server failed to start. Check backend/server.log"
  exit 1
fi
echo "Server running on http://localhost:3001"

# Start serveo tunnel
cd "$SCRIPT_DIR"
ssh -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -R 80:localhost:3001 \
    serveo.net 2>&1 | tee /tmp/serveo.log &
TUNNEL_PID=$!
sleep 8

# Extract URL
TUNNEL_URL=$(grep -o 'https://[^ ]*serveousercontent\.com' /tmp/serveo.log | head -1)
if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Tunnel failed. Check /tmp/serveo.log"
  exit 1
fi

echo ""
echo "================================================"
echo " FELLITO is LIVE"
echo " Public URL: $TUNNEL_URL"
echo " Admin:      $TUNNEL_URL/admin"
echo "================================================"
echo ""

# Generate a fresh temp link
node -e "
require('dotenv').config({ path: '.env' });
const { createTempLink } = require('./backend/tempLinkStore');
const link = createTempLink({ label: 'Consultant' });
console.log('Test link: $TUNNEL_URL/temp/' + link.token);
"

echo ""
echo "Press Ctrl+C to stop"
wait $TUNNEL_PID
