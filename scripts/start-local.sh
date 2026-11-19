#!/usr/bin/env bash
# ======================================================================
#  Order Rescue Lite - (re)start the LOCAL app on http://127.0.0.1:8080.
#  Loopback only. Always real Claude on Bedrock (MODEL_MODE=bedrock).
#  Stops a running Order Rescue server on the port, starts a fresh one in
#  the background with this laptop's .env, and waits for /health.
#  Log: /tmp/order-rescue-local.log
#
#  Needs: node + npm, AWS credentials with Bedrock access.
# ======================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

PORT="${PORT:-8080}"
LOG=/tmp/order-rescue-local.log

ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || {
  echo "ERROR: no AWS credentials (Bedrock needs them). Run 'aws sso login' or ada, then retry."; exit 1; }

if [ -n "${AWS_EXPECTED_ACCOUNT_ID:-}" ] && [ "$ACCOUNT" != "$AWS_EXPECTED_ACCOUNT_ID" ]; then
  echo "ERROR: active AWS credentials do not match AWS_EXPECTED_ACCOUNT_ID." >&2
  exit 1
fi

# Stop the old server - but only if the port is held by this app.
PID="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [ -n "$PID" ]; then
  CWD="$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
  CMD="$(ps -o command= -p "$PID" 2>/dev/null || true)"
  case "$CWD:$CMD" in
    "$ROOT/app:"*node*server.js*)
      echo "Stopping the running local app (pid $PID) ..."
      kill "$PID"
      for _ in $(seq 1 20); do lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.25; done ;;
    *) echo "ERROR: port $PORT is used by another program: $CMD"; exit 1 ;;
  esac
fi

[ -d app/node_modules ] || { echo "Installing dependencies ..."; ( cd app && npm ci >/dev/null ); }

echo "Starting the local app on http://127.0.0.1:$PORT (Claude on Bedrock) ..."
( cd app && MODEL_MODE=bedrock SERVICE_NAMESPACE="${LANE:-local}" AWS_ACCOUNT="$ACCOUNT" PORT="$PORT" \
    nohup node local-supervisor.js >"$LOG" 2>&1 & )

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "Local app is up: http://127.0.0.1:$PORT/workshop"; exit 0
  fi
  sleep 0.25
done
echo "ERROR: the local app did not start. Last log lines:"; tail -20 "$LOG"; exit 1
