#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
env_file="${PLATFORM_ENV_FILE:-/srv/novasite-config/runtime.env}"
[[ -f "$env_file" ]] || { printf '%s\n' 'Private runtime env file missing.' >&2; exit 1; }
compose=(docker compose --env-file "$env_file" -f docker-compose.single-ecs.yml)
case "${1:-help}" in
  status) "${compose[@]}" ps ;;
  preflight) "${compose[@]}" run --rm --no-deps migrator node scripts/platform-preflight.mjs ;;
  up)
    "${compose[@]}" config --quiet
    "${compose[@]}" run --rm --no-deps migrator node scripts/platform-preflight.mjs
    "${compose[@]}" up -d --no-build postgres app translation-worker caddy ;;
  migrate)
    [[ "${2:-}" == '--approved-backup-and-rehearsal' ]] || { printf '%s\n' 'Migrations require a backup and an isolated rehearsal.' >&2; exit 1; }
    "${compose[@]}" run --rm --no-deps migrator node scripts/platform-preflight.mjs
    "${compose[@]}" run --rm migrator ;;
  logs) "${compose[@]}" logs --tail 80 "${2:-app}" ;;
  *) printf '%s\n' 'Usage: single-ecs.sh preflight|status|up|logs [service]|migrate --approved-backup-and-rehearsal' ;;
esac
