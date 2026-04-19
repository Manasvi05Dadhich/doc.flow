#!/bin/sh
set -eu

celery -A app.workers.celery_app worker -l info &
CELERY_PID=$!

cleanup() {
  kill "$CELERY_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
