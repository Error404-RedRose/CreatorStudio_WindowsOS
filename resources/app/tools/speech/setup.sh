#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python 3 is required. Install it with your distribution package manager, then run this script again."
  exit 1
fi

if [ ! -d .venv ]; then
  "$PYTHON" -m venv .venv
fi

./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt
echo
echo "Creator Studio speech environment ready: tools/speech/.venv"
echo "Restart Creator Studio to load it."
