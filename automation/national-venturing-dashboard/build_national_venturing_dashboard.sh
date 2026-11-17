#!/usr/bin/env bash
set -euo pipefail

AUTOMATION_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi
exec "$PYTHON" "$AUTOMATION_DIR/build_national_venturing_dashboard.py" "$@"
