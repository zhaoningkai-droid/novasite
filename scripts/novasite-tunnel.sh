#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.codex-runtime"
PID_FILE="$RUNTIME_DIR/cloudflared-quick-tunnel.pid"
LOG_FILE="$RUNTIME_DIR/cloudflared-quick-tunnel.log"
LAUNCH_LABEL="com.novasite.quick-tunnel"
SCREEN_SESSION="novasite-quick-tunnel"
PORT="${NOVASITE_PORT:-3100}"
ORIGIN="http://127.0.0.1:${PORT}"

say() { printf '\nNovaSite 临时公网映射 · %s\n' "$*"; }
fail() { printf '\nNovaSite 临时公网映射失败：%s\n' "$*" >&2; exit 1; }

cloudflared_bin() {
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
  elif [[ -x "$HOME/.local/bin/cloudflared" ]]; then
    printf '%s\n' "$HOME/.local/bin/cloudflared"
  else
    return 1
  fi
}

quick_tunnel_pids() {
  pgrep -f 'cloudflared.*tunnel.*--url.*127\.0\.0\.1:3100' 2>/dev/null || true
}

has_quick_tunnel() {
  [[ -n "$(quick_tunnel_pids)" ]]
}

current_url() {
  [[ -f "$LOG_FILE" ]] || return 1
  grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$LOG_FILE" | tail -n 1
}

local_service_ready() {
  curl --fail --silent --max-time 4 "$ORIGIN/health" >/dev/null 2>&1
}

tunnel_works() {
  local url="$1"
  [[ -n "$url" ]] && curl --fail --silent --max-time 8 "$url/health" >/dev/null 2>&1
}

stop_stale_tunnel() {
  local pid
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 5); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
  done < <(quick_tunnel_pids)
  launchctl remove "$LAUNCH_LABEL" 2>/dev/null || true
  screen -S "$SCREEN_SESSION" -X quit >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

start() {
  local bin pid url
  cd "$PROJECT_DIR"
  bin="$(cloudflared_bin)" || fail "未找到 cloudflared。请先安装 Cloudflare Tunnel 客户端。"
  local_service_ready || fail "本地 NovaSite 尚未启动。请先执行 npm run local:start，确认 http://localhost:${PORT}/admin 可打开后再试。"
  mkdir -p "$RUNTIME_DIR"

  url="$(current_url 2>/dev/null || true)"
  if has_quick_tunnel && tunnel_works "$url"; then
    say "映射已可用：${url}"
    printf '后台：%s/admin\n前台示例：%s/s/volttrans/en\n' "$url" "$url"
    return
  fi

  stop_stale_tunnel
  : > "$LOG_FILE"
  say "正在创建临时地址。映射会在后台保持运行，本机服务停止或电脑休眠后才会失效。"
  # screen owns the tunnel in a detached user session, so it survives the
  # terminal that requested the start command.
  screen -dmS "$SCREEN_SESSION" /bin/bash "$PROJECT_DIR/scripts/novasite-cloudflared-runner.sh"
  printf '%s\n' "$SCREEN_SESSION" > "$PID_FILE"

  for _ in $(seq 1 20); do
    url="$(current_url 2>/dev/null || true)"
    if tunnel_works "$url"; then
      printf '临时公网地址：%s\n后台地址：%s/admin\n前台示例：%s/s/volttrans/en\n' "$url" "$url" "$url"
      return
    fi
    sleep 1
  done

  fail "地址已创建但尚未可访问，请稍后执行 npm run tunnel:status 查看。"
}

status() {
  local url
  url="$(current_url 2>/dev/null || true)"
  if has_quick_tunnel && tunnel_works "$url"; then
    printf '临时公网地址：%s\n后台地址：%s/admin\n' "$url" "$url"
    return
  fi
  printf '临时公网映射：未运行或已失效。执行 npm run tunnel:start 创建新的地址。\n'
  return 1
}

stop() {
  stop_stale_tunnel
  say '临时公网映射已停止；本地后台和数据库未受影响。'
}

case "${1:-start}" in
  start) start ;;
  status) status ;;
  stop) stop ;;
  *) printf '用法：npm run tunnel:start | tunnel:status | tunnel:stop\n' >&2; exit 2 ;;
esac
