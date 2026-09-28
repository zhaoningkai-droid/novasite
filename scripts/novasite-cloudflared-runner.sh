#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.codex-runtime/cloudflared-quick-tunnel.log"
PORT="${NOVASITE_PORT:-3100}"

mkdir -p "$PROJECT_DIR/.codex-runtime"

if command -v cloudflared >/dev/null 2>&1; then
  bin="$(command -v cloudflared)"
elif [[ -x "$HOME/.local/bin/cloudflared" ]]; then
  bin="$HOME/.local/bin/cloudflared"
else
  printf 'cloudflared not found\n' >> "$LOG_FILE"
  exit 127
fi

exec "$bin" --no-autoupdate --protocol http2 tunnel --url "http://127.0.0.1:${PORT}" >> "$LOG_FILE" 2>&1
