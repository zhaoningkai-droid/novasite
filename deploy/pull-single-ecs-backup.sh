#!/usr/bin/env bash
# Run on the owner's Mac. Keep the encrypted pair outside the server.
set -euo pipefail
umask 077
if [[ $# -ne 3 ]]; then
  printf '%s\n' 'Usage: pull-single-ecs-backup.sh <ssh-config> <host-alias> <backup-directory>' >&2
  exit 1
fi
config="$1"
host="$2"
destination="$3"
[[ -f "$config" && "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || {
  printf '%s\n' 'An SSH config file and a valid host alias are required.' >&2
  exit 1
}
mkdir -p "$destination"
chmod 700 "$destination"
remote="$(ssh -F "$config" "$host" 'find /srv/novasite-backups -maxdepth 1 -type f -name "paired-*.tar.gz.enc" | sort | tail -1')"
[[ "$remote" =~ ^/srv/novasite-backups/paired-[0-9]{8}T[0-9]{6}Z\.tar\.gz\.enc$ ]] || { printf '%s\n' 'No complete backup found.' >&2; exit 1; }
scp -F "$config" "$host:$remote" "$host:${remote}.sha256" "$destination/"
name="$(basename "$remote")"
expected="$(awk '{print $1}' "$destination/${name}.sha256")"
actual="$(shasum -a 256 "$destination/$name" | awk '{print $1}')"
[[ "$expected" == "$actual" ]] || { printf '%s\n' 'Backup checksum mismatch.' >&2; exit 1; }
printf '%s\n' "$destination/$name"
