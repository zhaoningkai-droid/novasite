#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.codex-runtime/localhost-run-tunnel.log"
TUNNEL_TARGET="${NOVASITE_TUNNEL_TARGET:?Set NOVASITE_TUNNEL_TARGET to an authorized SSH target}"

mkdir -p "$PROJECT_DIR/.codex-runtime"
exec ssh \
  -o ServerAliveInterval=30 \
  -o ExitOnForwardFailure=yes \
  -R 80:localhost:3100 \
  "$TUNNEL_TARGET" >> "$LOG_FILE" 2>&1
