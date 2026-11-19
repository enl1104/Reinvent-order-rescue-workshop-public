#!/usr/bin/env bash
# ======================================================================
#  Order Rescue Lite - build + deploy ONE demo lane with the native
#  `aws lambda-web deploy` CLI (no CloudFormation). Idempotent: re-run to
#  ship a code change. The CLI creates/updates the function, revision, and
#  endpoint, manages its own S3 bucket, and returns the endpoint URL.
#
#  Reads config from .env (or the shell environment):
#    LANE                                 (required) e.g. laptop01
#    BEDROCK_MODEL_ID                     (optional)
#    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT   (optional) this lane's Dynatrace tenant
#    OTEL_EXPORTER_OTLP_TRACES_HEADERS    (optional) Authorization=Api-Token%20dt0c01...
#
#  Needs: aws CLI v2 (configured), node + npm.
# ======================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

for c in aws node npm; do
  command -v "$c" >/dev/null 2>&1 || { echo "ERROR: '$c' not found on PATH."; exit 1; }
done

: "${LANE:?ERROR: LANE is not set. Put LANE=... in .env (or run scripts/setup.sh).}"
printf '%s' "$LANE" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' || {
  echo "ERROR: LANE '$LANE' is invalid (lowercase/digits/dashes, 2-40 chars, no leading/trailing dash)."; exit 1; }

BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-us.anthropic.claude-haiku-4-5-20251001-v1:0}"
OTEL_ENDPOINT="${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}"
OTEL_HEADERS="${OTEL_EXPORTER_OTLP_TRACES_HEADERS:-}"
FUNCTION="order-rescue-lite-${LANE}"
ROLE_NAME="order-rescue-lite-exec"   # one shared execution role per account

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || {
  echo "ERROR: no AWS credentials. Run 'aws configure' or 'aws sso login' first."; exit 1; }
if [ -n "${AWS_EXPECTED_ACCOUNT_ID:-}" ] && [ "$ACCOUNT_ID" != "$AWS_EXPECTED_ACCOUNT_ID" ]; then
  echo "ERROR: active AWS credentials do not match AWS_EXPECTED_ACCOUNT_ID." >&2
  exit 1
fi

REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || true)}"
[ -n "$REGION" ] || { echo "ERROR: no region. Set AWS_REGION or run 'aws configure'."; exit 1; }

echo "Lane: $LANE   Function: $FUNCTION   Account: $ACCOUNT_ID   Region: $REGION"
[ -n "$OTEL_ENDPOINT" ] && echo "Tracing: ON ($OTEL_ENDPOINT)" || echo "Tracing: off (no OTEL endpoint set)"

# --- shared execution role (create once, reuse across lanes) ----------------
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text 2>/dev/null || true)"
if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" = "None" ]; then
  echo "Creating execution role $ROLE_NAME ..."
  ROLE_ARN="$(aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --query Role.Arn --output text)"
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name order-rescue-lite-runtime \
    --policy-document '{"Version":"2012-10-17","Statement":[{"Sid":"InvokeBedrock","Effect":"Allow","Action":"bedrock:InvokeModel","Resource":"*"},{"Sid":"Logs","Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"*"}]}'
  echo "Waiting 10s for IAM role to propagate ..."
  sleep 10
fi
echo "Execution role: $ROLE_ARN"

# --- build production dependencies into the package ------------------------
echo "Installing production dependencies ..."
( cd app && npm ci --omit=dev >/dev/null )

# --- env vars (OTEL only when set; empty values are not valid) -------------
ENV_ARGS=(--env "MODEL_MODE=bedrock" --env "ORDER_DELAY_MS=${ORDER_DELAY_MS:-400}" --env "BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID}" --env "DEPLOY_PLATFORM=lambda-web" --env "SERVICE_NAMESPACE=${LANE}" --env "AWS_ACCOUNT=${ACCOUNT_ID}" --env "REPO_DIR=${ROOT}")
if [ -n "$OTEL_ENDPOINT" ]; then
  ENV_ARGS+=(--env "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${OTEL_ENDPOINT}")
  ENV_ARGS+=(--env "OTEL_EXPORTER_OTLP_TRACES_HEADERS=${OTEL_HEADERS}")
fi

# --- deploy (creates or updates the function, revision, and endpoint) ------
echo "Deploying with aws lambda-web deploy ..."
RESULT="$(aws lambda-web deploy \
  --name "$FUNCTION" \
  --code app \
  --create \
  --runtime nodejs24.x \
  --execution-role-arn "$ROLE_ARN" \
  "${ENV_ARGS[@]}" \
  --timeout-seconds 30 \
  --max-concurrency-per-environment 64 \
  --application-log-level INFO \
  --system-log-level INFO \
  --endpoint-name live \
  --endpoint-type HomeRegion \
  --auth-type ApplicationManaged \
  --max-environments 2 \
  --rate-limit 100 \
  --region "$REGION" --no-cli-pager --output json)"

# Pull the endpoint URL out of the response (defensive: match the host form).
URL="$(printf '%s' "$RESULT" | grep -oE 'https://[a-zA-Z0-9.-]+\.on\.aws[^"]*' | head -1 || true)"

echo ""
echo "============================================================"
echo "  Deployed lane '$LANE'"
if [ -n "$URL" ]; then
  echo "  Demo page: $URL"
else
  echo "  Deploy returned (could not auto-extract URL):"
  printf '%s\n' "$RESULT"
fi
echo "============================================================"
