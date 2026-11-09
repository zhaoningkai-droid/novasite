#!/usr/bin/env bash
# Run on the new ECS as root. Installs runtime only; never initializes business data.
set -euo pipefail

if [[ $(id -u) != 0 ]]; then
  echo 'Run as root on the new ECS.' >&2
  exit 1
fi
. /etc/os-release
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != 24.04 || $(dpkg --print-architecture) != amd64 ]]; then
  echo 'This preparation script requires Ubuntu 24.04 amd64.' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  # Refuse to replace an existing container runtime or its data automatically.
  for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Existing runtime package $package: stop and review before replacement." >&2
      exit 1
    fi
  done
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<'DOCKER_REPOSITORY'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER_REPOSITORY
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

docker compose version
systemctl enable --now docker
systemctl is-active docker
docker --version

# Keep existing directories, contents and permissions untouched.
for directory in /srv/novasite /srv/novasite-config /srv/novasite-backups; do
  if [[ ! -e "$directory" && ! -L "$directory" ]]; then
    install -m 0700 -d "$directory"
  elif [[ ! -d "$directory" || -L "$directory" ]]; then
    echo "Unexpected path $directory: stop and review." >&2
    exit 1
  fi
done
for directory in /srv/novasite-media /srv/novasite-operations; do
  if [[ ! -e "$directory" && ! -L "$directory" ]]; then
    install -m 0750 -o 1001 -g 1001 -d "$directory"
  elif [[ ! -d "$directory" || -L "$directory" ]]; then
    echo "Unexpected path $directory: stop and review." >&2
    exit 1
  fi
done

echo 'Runtime preparation finished. No database, customer data or public website was created.'
free -m
df -h /
