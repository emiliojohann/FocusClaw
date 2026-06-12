#!/bin/bash
# FocusClaw Startup Script
# Runs both API (port 3001) and Web UI (port 5173).
# Default is local-only. Use --tailscale to publish the local web app through Tailscale Serve.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/tmp/focusclaw"
DATA_DIR="$SCRIPT_DIR/data"
MODE="local"

usage() {
  cat <<EOF
Usage:
  ./start.sh
  ./start.sh --tailscale

Environment overrides:
  FOCUSCLAW_HOST       Bind API and web to this host/IP
  API_HOST             Bind API to this host/IP
  WEB_HOST             Bind Vite web server to this host/IP
  FOCUSCLAW_PUBLIC_URL Full private URL printed for laptop access and Settings display
  TAILSCALE_SERVE_PORT HTTPS port used by Tailscale Serve in --tailscale mode (default: 8443)
  PORT                 API port (default: 3001)
  VITE_DEV_PORT        Web port (default: 5173)

Examples:
  ./start.sh
  ./start.sh --tailscale
  FOCUSCLAW_PUBLIC_URL=https://your-host.your-tailnet.ts.net:8443 ./start.sh --tailscale
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tailscale)
      MODE="tailscale"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

detect_tailscale_ip() {
  if ! command -v tailscale >/dev/null 2>&1; then
    echo ""
    return
  fi

  tailscale ip -4 2>/dev/null | head -n 1
}

detect_tailscale_dns() {
  if ! command -v tailscale >/dev/null 2>&1; then
    echo ""
    return
  fi

  tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' 2>/dev/null | sed 's/\.$//'
}

if [ "$MODE" = "tailscale" ]; then
  TAILSCALE_SERVE_PORT="${TAILSCALE_SERVE_PORT:-8443}"
  DETECTED_TAILSCALE_IP="$(detect_tailscale_ip)"
  DETECTED_TAILSCALE_DNS="$(detect_tailscale_dns)"
  if [ -z "${FOCUSCLAW_PUBLIC_URL:-}" ] && [ -z "${VITE_PRIVATE_APP_URL:-}" ] && [ -z "$DETECTED_TAILSCALE_DNS" ] && [ -z "$DETECTED_TAILSCALE_IP" ]; then
    echo "Could not detect a Tailscale IPv4 address."
    echo "Run 'tailscale ip -4' to verify Tailscale, or start with:"
    echo "  FOCUSCLAW_PUBLIC_URL=https://<HOST_TAILSCALE_DNS_NAME>:$TAILSCALE_SERVE_PORT ./start.sh --tailscale"
    exit 1
  fi
  DEFAULT_HOST="${FOCUSCLAW_HOST:-${HOST:-127.0.0.1}}"
  DEFAULT_PUBLIC_URL="${FOCUSCLAW_PUBLIC_URL:-${VITE_PRIVATE_APP_URL:-https://${DETECTED_TAILSCALE_DNS:-$DETECTED_TAILSCALE_IP}:$TAILSCALE_SERVE_PORT}}"
else
  DEFAULT_HOST="${FOCUSCLAW_HOST:-${HOST:-127.0.0.1}}"
  DEFAULT_PUBLIC_URL="${FOCUSCLAW_PUBLIC_URL:-${VITE_PRIVATE_APP_URL:-http://$DEFAULT_HOST:${VITE_DEV_PORT:-5173}}}"
fi

API_PORT="${PORT:-3001}"
WEB_PORT="${VITE_DEV_PORT:-5173}"
API_BIND_HOST="${API_HOST:-$DEFAULT_HOST}"
WEB_BIND_HOST="${WEB_HOST:-${VITE_DEV_HOST:-$DEFAULT_HOST}}"
PUBLIC_URL="$DEFAULT_PUBLIC_URL"
PUBLIC_HOST="$(printf '%s' "$PUBLIC_URL" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s/:.*$//')"
API_PROXY_HOST="$API_BIND_HOST"

export PORT="$API_PORT"
export API_HOST="$API_BIND_HOST"
export VITE_DEV_HOST="$WEB_BIND_HOST"
export VITE_DEV_PORT="$WEB_PORT"
export VITE_API_PORT="$API_PORT"
export VITE_API_URL="${VITE_API_URL:-/api}"
export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://$API_PROXY_HOST:$API_PORT}"
export VITE_PRIVATE_APP_HOST="${VITE_PRIVATE_APP_HOST:-$PUBLIC_HOST}"
export VITE_PRIVATE_APP_URL="${VITE_PRIVATE_APP_URL:-$PUBLIC_URL}"
export VITE_PRIVATE_API_URL="${VITE_PRIVATE_API_URL:-/api}"

if [ "$MODE" = "tailscale" ]; then
  export CORS_ORIGINS="${CORS_ORIGINS:-$PUBLIC_URL,http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT}"
elif { [ "$DEFAULT_HOST" != "127.0.0.1" ] && [ "$DEFAULT_HOST" != "localhost" ]; }; then
  export CORS_ORIGINS="${CORS_ORIGINS:-http://$PUBLIC_HOST:$WEB_PORT,http://$WEB_BIND_HOST:$WEB_PORT,http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT}"
fi

mkdir -p "$LOG_DIR"
mkdir -p "$DATA_DIR"

echo "🚀 Starting FocusClaw..."
echo "Mode: $MODE"
echo "API bind: $API_BIND_HOST:$API_PORT"
echo "Web bind: $WEB_BIND_HOST:$WEB_PORT"

clear_port() {
  local port="$1"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi

  echo "Stopping existing process on port $port: $pids"
  kill $pids 2>/dev/null || true

  for _ in 1 2 3 4 5; do
    sleep 1
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [ -z "$pids" ] && echo "Cleared port $port" && return
  done

  echo "Process on port $port did not exit after SIGTERM; forcing stop"
  kill -KILL $pids 2>/dev/null || true
}

# Stop existing local dev instances before starting new ones
clear_port "$API_PORT"
clear_port "$WEB_PORT"

# Start API
cd "$SCRIPT_DIR/apps/api"
export DATABASE_URL="$DATA_DIR/focusclaw.db"
nohup npm run dev > "$LOG_DIR/api.log" 2>&1 < /dev/null &
API_PID=$!
echo "API started (PID: $API_PID) → $LOG_DIR/api.log"

# Wait for API to be ready
sleep 5

# Start Web UI
cd "$SCRIPT_DIR/apps/web"
nohup npm run dev > "$LOG_DIR/web.log" 2>&1 < /dev/null &
WEB_PID=$!
echo "Web UI started (PID: $WEB_PID) → $LOG_DIR/web.log"

if [ "$MODE" = "tailscale" ]; then
  echo "Publishing Web UI through Tailscale Serve on HTTPS port $TAILSCALE_SERVE_PORT..."
  if ! perl -e 'alarm 5; exec @ARGV' tailscale serve --bg --yes --https "$TAILSCALE_SERVE_PORT" "$WEB_PORT"; then
    echo ""
    echo "Tailscale Serve could not be enabled. FocusClaw is still running locally."
    echo "Enable Tailscale Serve for this tailnet, then rerun: ./start.sh --tailscale"
  fi
fi

echo ""
echo "✅ FocusClaw is running:"
echo "   Local API:      http://127.0.0.1:$API_PORT"
echo "   Local Web:      http://127.0.0.1:$WEB_PORT"
if [ "$MODE" = "tailscale" ]; then
  echo "   Tailscale Web:  $PUBLIC_URL"
  echo "   Calendar:       $PUBLIC_URL/calendar"
else
  echo "   Calendar:       http://127.0.0.1:$WEB_PORT/calendar"
fi
echo ""
echo "Logs: $LOG_DIR/{api,web}.log"
echo "Stop: press Ctrl+C or run: kill $API_PID $WEB_PID"

cleanup() {
  echo ""
  echo "Stopping FocusClaw..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait "$API_PID" "$WEB_PID"
