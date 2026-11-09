#!/usr/bin/env bash
# Pair the database and private uploads while writes are paused. No customer
# data is removed, and services are restarted even when a backup fails.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")"
compose=(docker compose --env-file /srv/novasite-config/runtime.env -f docker-compose.single-ecs.yml)
exec 9>/srv/novasite-backups/backup.lock
flock -n 9 || exit 0
[[ -s /srv/novasite-config/backup-passphrase ]] || { printf '%s\n' 'Backup key missing.' >&2; exit 1; }
available_kib="$(df -Pk /srv/novasite-backups | awk 'NR==2 {print $4}')"
((available_kib >= 2097152)) || { printf '%s\n' 'Less than 2GiB free; backup stopped before pausing services. Extend disk or move old backups.' >&2; exit 1; }
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d /srv/novasite-backups/.working.XXXXXX)"
output="/srv/novasite-backups/paired-${timestamp}.tar.gz.enc"
services=()
for service in app translation-worker; do
  if [[ -n "$("${compose[@]}" ps --status running -q "$service")" ]]; then services+=("$service"); fi
done
paused=false
cleanup() {
  if $paused && ((${#services[@]})); then "${compose[@]}" start "${services[@]}" >&2 || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
if ((${#services[@]})); then paused=true; "${compose[@]}" stop "${services[@]}" >&2; fi
"${compose[@]}" exec -T postgres pg_dump -U postgres -d novasite -Fc > "$work/database.dump"
"${compose[@]}" exec -T postgres pg_restore --list < "$work/database.dump" > "$work/database-contents.txt"
tar -C /srv/novasite-media -czf "$work/media.tar.gz" .
cp /srv/novasite-config/runtime.env /srv/novasite-config/postgres.env "$work/"
cp -a /srv/novasite-config/tls "$work/tls"
cp docker-compose.single-ecs.yml Caddyfile.platform pg_hba.single-ecs.conf "$work/"
(cd "$work" && sha256sum database.dump media.tar.gz > checksums.txt)
tar -C "$work" -czf - . | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:/srv/novasite-config/backup-passphrase -out "${output}.partial"
[[ -s "${output}.partial" ]]
mv "${output}.partial" "$output"
sha256sum "$output" > "${output}.sha256"
# Keep seven complete daily pairs. Copies outside this ECS are still required.
find /srv/novasite-backups -maxdepth 1 -type f -name 'paired-*.tar.gz.enc*' -mtime +7 -delete
printf '%s\n' "$output"
