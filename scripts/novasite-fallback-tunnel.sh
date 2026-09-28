#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.codex-runtime/localhost-run-tunnel.log"

mkdir -p "$PROJECT_DIR/.codex-runtime"
exec ssh \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 \
  -o ExitOnForwardFailure=yes \
  -R 80:localhost:3100 \
  nokey@localhost.run >> "$LOG_FILE" 2>&1
