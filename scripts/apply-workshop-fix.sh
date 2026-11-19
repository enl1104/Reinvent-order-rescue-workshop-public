#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if cmp -s app/flow.js solution/flow.js; then
  echo "The one-read reference fix is already applied."
elif cmp -s app/flow.js solution/flow.defect.js; then
  cp solution/flow.js app/flow.js
  echo "Applied the one-read reference fix to app/flow.js."
else
  echo "app/flow.js has custom changes. Review git diff -- app/flow.js before restarting." >&2
  exit 1
fi
