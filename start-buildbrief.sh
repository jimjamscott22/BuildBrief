#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
FRONTEND_URL="http://localhost:5173"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Stopping BuildBrief..."

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$FRONTEND_URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$FRONTEND_URL" >/dev/null 2>&1 &
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$FRONTEND_URL" >/dev/null 2>&1 &
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    echo "Install it, then run this launcher again."
    exit 1
  fi
}

trap cleanup EXIT INT TERM

require_command uv
require_command npm

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing backend/.env. Create it from backend/.env.example before starting."
  exit 1
fi

echo "Preparing backend dependencies..."
(cd "$BACKEND_DIR" && uv sync)

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting BuildBrief backend on http://localhost:8001..."
(cd "$BACKEND_DIR" && uv run uvicorn app.main:app --reload --port 8001) &
BACKEND_PID=$!

echo "Starting BuildBrief frontend on $FRONTEND_URL..."
(cd "$FRONTEND_DIR" && npm run dev -- --host 127.0.0.1) &
FRONTEND_PID=$!

sleep 3
open_browser

echo
echo "BuildBrief is starting at $FRONTEND_URL"
echo "Keep this window open. Press Ctrl+C to stop both servers."

wait -n "$BACKEND_PID" "$FRONTEND_PID"
