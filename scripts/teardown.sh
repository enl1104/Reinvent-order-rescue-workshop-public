#!/usr/bin/env bash
# ======================================================================
#  Order Rescue Lite - teardown / cleanup.
#  Seat names are random, so this DISCOVERS what to delete rather than
#  relying on a list of seats.
#
#    bash scripts/teardown.sh                 # tear down THIS laptop's seat (from .env)
#    bash scripts/teardown.sh <seat>          # tear down one named seat
#    bash scripts/teardown.sh --all           # tear down EVERY order-rescue-lite seat in the account
#    bash scripts/teardown.sh --all --role    # ...and remove the shared execution role too
#    add --yes to any of the above to skip the confirmation prompt
#
#  Needs: aws CLI v2, configured credentials.
# ======================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PREFIX="order-rescue-lite-"
ROLE_NAME="order-rescue-lite-exec"
ALL=0; WITH_ROLE=0; YES=0; SEAT_ARG=""
for a in "$@"; do
  case "$a" in
    --all) ALL=1 ;;
    --role) WITH_ROLE=1 ;;
    --yes|-y) YES=1 ;;
    -*) echo "ERROR: unknown option '$a'"; exit 1 ;;
    *) SEAT_ARG="$a" ;;
  esac
done

command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not found."; exit 1; }
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || {
  echo "ERROR: no AWS credentials. Run 'aws configure' or 'aws sso login' first."; exit 1; }
REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || true)}"
[ -n "$REGION" ] || { echo "ERROR: no region. Set AWS_REGION or run 'aws configure'."; exit 1; }
echo "Account: $ACCOUNT_ID   Region: $REGION"

# --- decide which functions to delete --------------------------------------
TARGETS=()
if [ "$ALL" = "1" ]; then
  echo "Discovering all '$PREFIX*' web functions ..."
  while IFS= read -r fn; do [ -n "$fn" ] && TARGETS+=("$fn"); done < <(
    aws lambda-web list-web-functions --region "$REGION" --no-cli-pager \
      --query "functions[?starts_with(functionName, '${PREFIX}')].functionName" --output text 2>/dev/null | tr '\t' '\n')
else
  SEAT="$SEAT_ARG"
  if [ -z "$SEAT" ] && [ -f .env ]; then SEAT="$(grep -E '^LANE=' .env | head -1 | cut -d= -f2)"; fi
  [ -n "$SEAT" ] || { echo "ERROR: no seat given and no LANE in .env. Pass a seat name or use --all."; exit 1; }
  TARGETS+=("${PREFIX}${SEAT}")
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
  echo "Nothing to delete (no matching web functions)."
else
  echo "Will DELETE these web functions (and their endpoints/revisions):"
  printf '  - %s\n' "${TARGETS[@]}"
  [ "$WITH_ROLE" = "1" ] && echo "  - IAM role: $ROLE_NAME"
  if [ "$YES" != "1" ]; then
    printf "Proceed? [y/N] "; read -r ans; [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "Aborted."; exit 0; }
  fi
  for fn in "${TARGETS[@]}"; do
    echo "Deleting $fn ..."
    aws lambda-web delete-web-function --function-name "$fn" --region "$REGION" --no-cli-pager >/dev/null \
      && echo "  deleted" || echo "  WARN: delete failed for $fn"
  done
fi

# --- optional shared execution role ----------------------------------------
if [ "$WITH_ROLE" = "1" ]; then
  if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    echo "Removing shared execution role $ROLE_NAME ..."
    aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name order-rescue-lite-runtime 2>/dev/null || true
    aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null \
      && echo "  role deleted" || echo "  WARN: could not delete role (still used by a remaining seat?)"
  else
    echo "Shared role $ROLE_NAME not found; skipping."
  fi
fi

echo "Done. (The CLI's managed deployment bucket, awscli-lambdaweb-${ACCOUNT_ID}-${REGION}-an, is left in place.)"
