#!/usr/bin/env bash
# ======================================================================
#  Order Rescue Lite - RESET this laptop for the next visitor.
#  Run between visitors, or double-click reset-seat.command in Finder.
#
#    1. restores the original 3-read defect into app/flow.js
#    2. leaves a demo/<seat> branch if the last visitor's fix made one
#       (the branch is kept, not deleted)
#    3. checks the defect is back (npm test)
#    4. AWS seat (optional): redeploys it ONLY if this seat is already
#       deployed - reset never creates one. Skip with --local-only.
#    5. restarts the local app on http://127.0.0.1:8080
#    6. asks the agent once on each, for real (Claude on Bedrock), and
#       requires backend reads = 3
#    7. opens a fresh /workshop page at Step 1
#
#  Needs: aws CLI (configured), node + npm. Reads the seat from .env.
# ======================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${LANE:?ERROR: LANE is not set. Put LANE=... in .env (or run scripts/setup.sh).}"

AWS_STEP=auto
for a in "$@"; do
  case "$a" in
    --local-only) AWS_STEP=skip ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a (use --local-only or --help)"; exit 1 ;;
  esac
done

WORKSHOP_BRANCH="${WORKSHOP_BRANCH:-lambda-web-node}"
FUNCTION="order-rescue-lite-${LANE}"
REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || true)}"
LOCAL_URL="http://127.0.0.1:${PORT:-8080}"

echo "== Order Rescue — reset seat '$LANE' to the BROKEN state =="

aws sts get-caller-identity >/dev/null 2>&1 || {
  echo "ERROR: no AWS credentials (Bedrock needs them). Run 'aws sso login' or ada, then reset again."; exit 1; }

# --- 1-2. code + branch -------------------------------------------------
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" == demo/* ]]; then
    echo "Leaving branch $BRANCH (kept) -> $WORKSHOP_BRANCH"
    git checkout -q -- app/flow.js
    git checkout -q "$WORKSHOP_BRANCH" || echo "WARN: could not switch to $WORKSHOP_BRANCH (uncommitted changes?). Staying on $BRANCH."
  fi
fi
echo "Restoring the 3-read defect into app/flow.js ..."
cp solution/flow.defect.js app/flow.js

# --- 3. the defect is back ---------------------------------------------
[ -d app/node_modules ] || ( cd app && npm ci >/dev/null )
( cd app && npm test >/tmp/order-rescue-reset-test.log 2>&1 ) || {
  echo "ERROR: tests do not see the defect in app/flow.js. Details:"; tail -20 /tmp/order-rescue-reset-test.log; exit 1; }

# Ask the agent once (real Bedrock call) and print backend_reads, or "error".
reads_at() {
  curl -s -m 30 -X POST "$1/chat" -H 'content-type: application/json' -d '{}' 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const d=JSON.parse(s);
      console.log(d.mode==="bedrock"?d.backend_reads:"not-bedrock:"+d.mode)}catch(e){console.log("error")}})'
}
expect_three() {  # $1 label, $2 url; retries while a new revision rolls out
  local r
  for _ in $(seq 1 12); do
    r="$(reads_at "$2" || true)"
    [ "$r" = "3" ] && { echo "  $1: backend reads = 3 (Claude on Bedrock) - ready"; return 0; }
    sleep 5
  done
  echo "ERROR: $1 at $2 answered '$r', expected backend reads = 3."; return 1
}

# --- 4. AWS seat (optional) ---------------------------------------------
AWS_URL=""
if [ "$AWS_STEP" = auto ]; then
  if aws lambda-web get-web-function --function-name "$FUNCTION" --region "$REGION" --no-cli-pager >/dev/null 2>&1; then
    echo "AWS seat $FUNCTION is deployed - redeploying it with the defect ..."
    bash scripts/deploy.sh
    HOST="$(aws lambda-web get-web-function-endpoint --function-name "$FUNCTION" --endpoint-name live \
      --region "$REGION" --no-cli-pager --query domainName --output text 2>/dev/null || true)"
    [ -n "$HOST" ] && [ "$HOST" != "None" ] && AWS_URL="https://$HOST"
  else
    echo "No AWS seat deployed for '$LANE' - local only (that's fine)."
  fi
fi

# --- 5. local app ---------------------------------------------------------
bash scripts/start-local.sh

# --- 6. prove both are broken again ---------------------------------------
echo "Checking with a real question ..."
expect_three "local app" "$LOCAL_URL"
[ -n "$AWS_URL" ] && expect_three "AWS seat " "$AWS_URL"

# --- 7. fresh page --------------------------------------------------------
if command -v open >/dev/null 2>&1; then
  open "$LOCAL_URL/workshop"
  [ -n "$AWS_URL" ] && open "$AWS_URL/workshop"
fi

echo ""
echo "Reset complete - seat '$LANE' is back to 3 backend reads."
echo "  Local:  $LOCAL_URL/workshop"
[ -n "$AWS_URL" ] && echo "  AWS:    $AWS_URL/workshop"
echo "Before the next visitor: close the old workshop tabs and start a NEW KiroCrew chat"
echo "(the previous chat already knows the fix)."
