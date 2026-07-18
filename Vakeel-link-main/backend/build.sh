#!/usr/bin/env bash
# Render build script — keep as one file so the dashboard cannot mangle multi-line commands.
set -euo pipefail

python -m pip install --upgrade pip
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements-render.txt
