#!/bin/bash
# Lens /cu — thin wrapper around cu.py
#
# Usage:
#   bash cu.sh scan              # emit JSON inventory
#   bash cu.sh upgrade <id>      # run upgrade for one item
#
# Exit codes propagated from cu.py.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY_SCRIPT="$SCRIPT_DIR/cu.py"

if [ ! -f "$PY_SCRIPT" ]; then
  echo "ERROR: cu.py not found at $PY_SCRIPT" >&2
  exit 1
fi

# Windows ships a Microsoft Store "python3" stub on PATH that exits 49.
# Probe by actually running --version, not by command -v.
PY=""
for candidate in python3 python py; do
  if "$candidate" --version >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "ERROR: Python 3 is required but not found in PATH." >&2
  exit 1
fi

exec "$PY" "$PY_SCRIPT" "$@"
