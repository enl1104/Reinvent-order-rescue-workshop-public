#!/usr/bin/env bash
# Double-click this file (Finder) to reset this seat to the broken state.
# It restores the 3-read defect, restarts the local app, redeploys the AWS
# seat if one is deployed, and checks both with a real Bedrock question.
# Needs AWS creds active.
cd "$(dirname "$0")"
bash scripts/reset.sh
echo ""
echo "Press Return to close this window."
read -r _
