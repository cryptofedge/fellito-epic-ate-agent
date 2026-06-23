#!/bin/bash
# FELLITO startup — server + auto-restarting serveo tunnel

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
LOG_DIR="$SCRIPT_DIR/backend"

echo "Starting FELLITO backend..."
pkill -f "node server.js" 2>/dev/null
pkill -f "ssh.*serveo" 2>/dev/null
sleep 1

# Start Node server
cd "$SCRIPT_DIR/backend"
node server.js > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 4

if ! curl -s http://localhost:3001/health > /dev/null; then
  echo "ERROR: Server failed to start. Check backend/server.log"
  exit 1
fi
echo "Server up on http://localhost:3001"

# ── Tunnel watchdog ────────────────────────────────────────────────────────────
start_tunnel() {
  local LOG=/tmp/serveo-$$.log
  ssh -o StrictHostKeyChecking=no \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -R 80:localhost:3001 \
      serveo.net > "$LOG" 2>&1 &
  TUNNEL_PID=$!
  echo "$LOG"
}

update_base_url() {
  local url="$1"
  if grep -q "^BASE_URL=" "$ENV_FILE"; then
    sed -i "s|^BASE_URL=.*|BASE_URL=$url|" "$ENV_FILE"
  else
    echo "BASE_URL=$url" >> "$ENV_FILE"
  fi
}

run_tunnel() {
  local LOG
  LOG=$(start_tunnel)
  sleep 8

  local URL
  URL=$(grep -o 'https://[^ ]*serveousercontent\.com' "$LOG" | head -1)

  if [ -z "$URL" ]; then
    echo "Tunnel failed to start. Retrying in 10s..."
    sleep 10
    return 1
  fi

  update_base_url "$URL"

  echo ""
  echo "================================================"
  echo " FELLITO is LIVE"
  echo " Public URL: $URL"
  echo " Admin:      $URL/admin"
  echo "================================================"

  cd "$SCRIPT_DIR"
  node -e "
require('dotenv').config({ path: '.env' });
const { createTempLink } = require('./backend/tempLinkStore');
console.log('Fresh link: $URL/temp/' + createTempLink({ label: 'Consultant' }).token);
"
  echo ""

  # Wait for tunnel to die
  wait $TUNNEL_PID
  echo "Tunnel dropped. Restarting..."
  sleep 5
  return 0
}

# ── Main watchdog loop ─────────────────────────────────────────────────────────
echo "Press Ctrl+C to stop"
trap 'echo "Shutting down..."; kill $SERVER_PID 2>/dev/null; exit 0' INT TERM

while true; do
  run_tunnel
done
