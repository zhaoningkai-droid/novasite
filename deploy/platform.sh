#!/usr/bin/env bash
set -euo pipefail

task_deploy_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
task_root_dir="$(cd -- "$task_deploy_dir/.." && pwd)"
task_env_path="${PLATFORM_ENV_FILE:-$task_deploy_dir/.env.platform}"
task_command="${1:-help}"
case "$task_command" in
  backup-recovery-plan|backup-download|backup-unpack)
    # Defaults to separate read-only recovery configuration, never the application's env.
    task_recovery_env_path="${PLATFORM_ENV_FILE:-$task_deploy_dir/.env.backup-recovery}"
    case "$task_command" in
      backup-recovery-plan) task_recovery_action=plan ;;
      backup-download) task_recovery_action=download ;;
      backup-unpack) task_recovery_action=unpack ;;
    esac
    if [[ -f "$task_recovery_env_path" ]]; then
      node --env-file="$task_recovery_env_path" "$task_root_dir/scripts/platform-backup-recovery.mjs" "$task_recovery_action" "${@:2}"
    else
      node "$task_root_dir/scripts/platform-backup-recovery.mjs" "$task_recovery_action" "${@:2}"
    fi
    exit
    ;;
esac
case "$task_command" in
  backup-plan|backup-run|backup-status|backup-retention-plan)
    # These tools never initialize Compose or start/stop application services.
    if [[ -f "$task_env_path" ]]; then
      node --env-file="$task_env_path" "$task_root_dir/scripts/platform-backup.mjs" "${task_command#backup-}" "${@:2}"
    else
      node "$task_root_dir/scripts/platform-backup.mjs" "${task_command#backup-}" "${@:2}"
    fi
    exit
    ;;
esac
if [[ "$task_command" == 'backup-list' ]]; then
  if [[ -f "$task_env_path" ]]; then
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-database.mjs" list "${@:2}"
  else
    node "$task_root_dir/scripts/platform-database.mjs" list "${@:2}"
  fi
  exit
fi
if [[ "$task_command" == 'media-list' ]]; then
  if [[ -f "$task_env_path" ]]; then
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-media.mjs" list "${@:2}"
  else
    node "$task_root_dir/scripts/platform-media.mjs" list "${@:2}"
  fi
  exit
fi
if [[ "$task_command" == media-* ]]; then
  # File maintenance does not initialize Compose, the application or the database.
  case "$task_command" in
    media-backup-local|media-snapshot-local|media-snapshot-s3|media-backup-s3|media-restore-plan|media-restore-copy|media-restore-s3-plan|media-restore-s3-copy)
      if [[ -f "$task_env_path" ]]; then
        node --env-file="$task_env_path" "$task_root_dir/scripts/platform-media.mjs" "${task_command#media-}" "${@:2}"
      else
        node "$task_root_dir/scripts/platform-media.mjs" "${task_command#media-}" "${@:2}"
      fi
      exit
      ;;
    *) printf '%s\n' '未知文件维护命令；详见文件备份与恢复手册。'; exit 1 ;;
  esac
fi
if [[ ! -f "$task_env_path" ]]; then
  printf '%s\n' '请先复制 deploy/.env.platform.example 为 deploy/.env.platform 并填写配置。'
  exit 1
fi
export PLATFORM_ENV_FILE="$task_env_path"
task_compose=(docker compose --project-name novasite-platform --env-file "$task_env_path" -f "$task_deploy_dir/docker-compose.platform.yml")
task_compose+=(--profile notifications)
task_services=(app translation-worker caddy)
task_mail_enabled="$(node --env-file="$task_env_path" -e "process.stdout.write(process.env.INQUIRY_NOTIFICATIONS_ENABLED === 'true' ? 'true' : 'false')")"
if [[ "$task_mail_enabled" == 'true' ]]; then task_services+=(inquiry-notification-worker); fi

case "$task_command" in
  translation-usage)
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-translation-usage.mjs" "${@:2}"
    ;;
  backup|restore-plan|restore-copy)
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-database.mjs" "$task_command" "${@:2}"
    ;;
  preflight)
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-preflight.mjs"
    ;;
  build)
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-preflight.mjs"
    "${task_compose[@]}" --profile database-tools build app translation-worker migrator
    ;;
  start)
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-preflight.mjs"
    if [[ "$task_mail_enabled" != 'true' ]]; then "${task_compose[@]}" stop inquiry-notification-worker; fi
    "${task_compose[@]}" up -d --no-build "${task_services[@]}"
    ;;
  status)
    "${task_compose[@]}" ps
    ;;
  logs)
    "${task_compose[@]}" logs --tail=100 "${task_services[@]}"
    ;;
  restart)
    if [[ "$task_mail_enabled" != 'true' ]]; then "${task_compose[@]}" stop inquiry-notification-worker; fi
    "${task_compose[@]}" restart "${task_services[@]}"
    ;;
  stop)
    "${task_compose[@]}" stop app translation-worker inquiry-notification-worker caddy
    ;;
  migrate)
    if [[ "${2:-}" != '--approved-backup-and-rehearsal' ]]; then
      printf '%s\n' '迁移不会自动执行。完成备份、副本演练和人工确认后，才可使用 migrate --approved-backup-and-rehearsal。'
      exit 1
    fi
    node --env-file="$task_env_path" "$task_root_dir/scripts/platform-preflight.mjs"
    "${task_compose[@]}" --profile database-tools run --rm migrator
    ;;
  *)
    printf '%s\n' '用法：bash deploy/platform.sh preflight|build|start|status|logs|restart|stop'
    printf '%s\n' '翻译用量：translation-usage [--company 公司数字编号]；只读内部用量，不调用 AI。'
    printf '%s\n' '数据库维护：backup --confirm-database 源库名；backup-list；restore-plan/restore-copy --backup 目录 --target-database novasite_restore_副本名。'
    printf '%s\n' '文件维护：media-backup-local/media-backup-s3、media-snapshot-local/media-snapshot-s3（不停服务的文件副本）、media-list、media-restore-plan/media-restore-copy、media-restore-s3-plan/media-restore-s3-copy。详见文件备份与恢复手册。'
    printf '%s\n' '定时加密归档：backup-plan、backup-run、backup-status、backup-retention-plan；默认关闭，不安装定时器、不自动删除归档，使用独立 .env.backup。'
    printf '%s\n' '异地取回/解密：backup-recovery-plan、backup-download、backup-unpack；使用独立 .env.backup-recovery，只取回到新私有目录，不恢复原库或原媒体。'
    printf '%s\n' 'restore-copy 只有同时提供 --apply --isolated-target-approved 才会向空副本写入，绝不覆盖原库。详见数据库备份与恢复手册。'
    printf '%s\n' '迁移是单独受控命令；不会在 build/start/restart 中执行。没有删除数据库、删除证书卷或覆盖恢复命令。'
    ;;
esac
