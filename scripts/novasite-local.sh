#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.codex-runtime"
PID_FILE="$RUNTIME_DIR/next-dev.pid"
LOG_FILE="$RUNTIME_DIR/next-dev.log"
PORT="${NOVASITE_PORT:-3100}"
BASE_URL="http://localhost:${PORT}"

say() { printf '\nNovaSite · %s\n' "$*"; }
fail() { printf '\nNovaSite 启动失败：%s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "未找到 $1。请先安装后重试。"
}

ensure_docker() {
  if docker info >/dev/null 2>&1; then return; fi
  if [[ "$(uname)" == "Darwin" ]]; then
    say "正在打开 Docker，首次启动可能需要一点时间…"
    open -a Docker >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 45); do
    docker info >/dev/null 2>&1 && return
    sleep 2
  done
  fail "Docker 尚未就绪。请打开 Docker Desktop，等待其显示“正在运行”后再执行此命令。"
}

ensure_database() {
  docker compose up -d postgres >/dev/null
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U novasite -d novasite >/dev/null 2>&1; then return; fi
    sleep 1
  done
  fail "PostgreSQL 未能在 30 秒内就绪。请执行 docker compose logs postgres 查看原因。"
}

listener_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

listener_is_this_project() {
  local pid="$1"
  local cwd
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
  [[ "$cwd" == "$PROJECT_DIR" ]]
}

health_is_ok() {
  curl --fail --silent --max-time 3 "$BASE_URL/health" >/dev/null 2>&1
}

start() {
  cd "$PROJECT_DIR"
  require_command docker
  require_command npm
  require_command curl
  require_command lsof
  [[ -f .env ]] || fail "缺少 .env。请从 .env.example 创建本地环境配置后再启动。"
  [[ -d node_modules ]] || fail "缺少 node_modules。请先执行 npm install。"
  mkdir -p "$RUNTIME_DIR"
  ensure_docker
  ensure_database

  if health_is_ok; then
    say "后台已在运行：$BASE_URL/admin"
    [[ "${NOVASITE_NO_OPEN:-}" == "1" ]] || open "$BASE_URL/admin" >/dev/null 2>&1 || true
    return
  fi

  local occupied
  occupied="$(listener_pid)"
  if [[ -n "$occupied" ]]; then
    if listener_is_this_project "$occupied"; then
      fail "本项目旧服务占用了端口 ${PORT}，但健康检查没有通过。请先执行 npm run local:stop，再执行 npm run local:start。"
    fi
    fail "端口 ${PORT} 被其他程序占用（进程 ${occupied}）。NovaSite 没有关闭它，请先释放该端口后再启动。"
  fi

  rm -f "$PID_FILE"
  say "正在启动后台。请保持此终端窗口打开；出现 Ready 后即可使用后台。"
  (
    for _ in $(seq 1 45); do
      if health_is_ok; then
        [[ "${NOVASITE_NO_OPEN:-}" == "1" ]] || open "$BASE_URL/admin" >/dev/null 2>&1 || true
        exit 0
      fi
      sleep 1
    done
  ) &
  # Local development must stay attached to the terminal. This prevents the OS or
  # an IDE from silently reaping a background Next.js process after the command exits.
  exec npm run dev
}

status() {
  cd "$PROJECT_DIR"
  printf '项目目录：%s\n' "$PROJECT_DIR"
  printf '数据库：'
  if docker compose exec -T postgres pg_isready -U novasite -d novasite >/dev/null 2>&1; then printf '正常\n'; else printf '不可用\n'; fi
  printf '后台：'
  if health_is_ok; then printf '正常（%s/admin）\n' "$BASE_URL"; else printf '未运行或不可用\n'; fi
}

stop() {
  local pid
  pid="$(listener_pid)"
  if [[ -z "$pid" ]]; then
    say "后台未运行。"
    return
  fi
  listener_is_this_project "$pid" || fail "端口 ${PORT} 属于其他项目（进程 ${pid}），NovaSite 不会关闭它。"
  kill "$pid"
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  kill -0 "$pid" 2>/dev/null && fail "后台未能正常停止，请查看 $LOG_FILE。"
  say "后台已停止；数据库数据未受影响。"
}

logs() {
  [[ -f "$LOG_FILE" ]] || fail "尚无启动日志。请先执行 npm run local:start。"
  tail -n 80 "$LOG_FILE"
}

case "${1:-start}" in
  start) start ;;
  status) status ;;
  stop) stop ;;
  logs) logs ;;
  *) printf '用法：npm run local:start | local:status | local:stop | local:logs\n' >&2; exit 2 ;;
esac
