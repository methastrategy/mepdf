#!/usr/bin/env bash
# ─── mePDF — Start Server ──────────────────────────────
set -e
cd "$(dirname "$0")/.."
echo "📄 mePDF — starting..."
source .venv/bin/activate
exec uvicorn backend:app --reload --host 0.0.0.0 --port 8000