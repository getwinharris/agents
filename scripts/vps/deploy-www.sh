#!/usr/bin/env bash
set -euo pipefail

repository=${BAPX_PRODUCTION_REPOSITORY:-/root/bapx.in/project-packages-git/agents-production}
releases=${BAPX_RELEASE_ROOT:-/root/bapx.in/releases/agents}
compose_file=${BAPX_COMPOSE_FILE:-/docker/traefik-vmm1/docker-compose.yml}
lock_file=${BAPX_DEPLOY_LOCK:-/run/lock/bapx-www-deploy.lock}
requested_sha=${1:-}

exec 9>"$lock_file"
flock -n 9 || { echo 'bapX-www deployment already running'; exit 0; }

git -C "$repository" fetch --quiet origin main
sha=$(git -C "$repository" rev-parse origin/main)
short=${sha:0:8}
if [[ -n "$requested_sha" && "$sha" != "$requested_sha" ]]; then
  echo "origin/main moved from requested SHA $requested_sha to $sha; waiting for the next run"
  exit 0
fi

checks=$(mktemp /tmp/bapx-check-runs.XXXXXX)
gh api "repos/getwinharris/agents/commits/$sha/check-runs" > "$checks"
for required in 'apps/www tests and build' 'Map and OKF freshness'; do
  check=$(jq -r --arg name "$required" '[.check_runs[] | select(.name == $name)] | sort_by(.started_at) | last | [.status,.conclusion] | @tsv' "$checks")
  if [[ "$check" != $'completed\tsuccess' ]]; then
    echo "required check '$required' is not green for $sha (${check:-missing}); deployment deferred"
    rm -f "$checks"
    exit 0
  fi
done
rm -f "$checks"

if rg -q "/releases/agents/$short/apps/www/dist" "$compose_file"; then
  echo "bapX-www already points at $short"
  exit 0
fi

release="$releases/$short"
staging="$releases/.${short}.staging.$$"
compose_next=$(mktemp /tmp/bapx-compose-next.XXXXXX)
compose_previous=$(mktemp /tmp/bapx-compose-previous.XXXXXX)
cleanup() { rm -rf "$staging" "$compose_next" "$compose_previous"; }
trap cleanup EXIT

if [[ -f "$release/apps/www/server.mjs" && -d "$release/apps/www/dist/admin" ]]; then
  echo "reusing previously built immutable release $short"
else
  test ! -e "$release" || { echo "incomplete release path exists at $release" >&2; exit 1; }
  mkdir -p "$staging"
  git -C "$repository" archive "$sha" | tar -x -C "$staging"
  docker run --rm -v "$staging:/work" -w /work node:24-alpine sh -lc '
    apk add --no-cache git >/dev/null &&
    npm install --global npm@11.6.2 >/dev/null &&
    npm ci --no-audit --no-fund &&
    npm run build --workspace @bapX/runtime --workspace @bapX/sdk --workspace @bapX/react &&
    npm run test:server --workspace apps-www &&
    npm run build --workspace apps-www &&
    pages=$(find apps/www/dist -name "*.html" | wc -l) &&
    admin_mb=$(du -sm apps/www/dist/admin | cut -f1) &&
    test "$pages" -gt 100 && test "$admin_mb" -gt 10
  '
  rm -rf "$staging/node_modules"
  mv "$staging" "$release"
fi

cp "$compose_file" "$compose_previous"
awk -v release="$release" '
  /\/root\/bapx.in\/releases\/agents\/[0-9a-f]+\/apps\/www\// {
    sub(/\/root\/bapx.in\/releases\/agents\/[0-9a-f]+\/apps\/www\//, release "/apps/www/")
  }
  { print }
' "$compose_file" > "$compose_next"
install -m 600 "$compose_next" "$compose_file"

rollback() {
  echo "health verification failed for $short; restoring the previous Compose release" >&2
  install -m 600 "$compose_previous" "$compose_file"
  docker compose --project-directory /docker/traefik-vmm1 -f "$compose_file" up -d --force-recreate bapx-www
}
trap rollback ERR
docker compose --project-directory /docker/traefik-vmm1 -f "$compose_file" up -d --force-recreate bapx-www

for attempt in $(seq 1 30); do
  if docker exec traefik-vmm1-bapx-www-1 wget --quiet --output-document=/dev/null --header='Host: mediahub.bapx.in' http://127.0.0.1:3002/; then break; fi
  test "$attempt" -lt 30
  sleep 2
done
for host_path in \
  'bapx.in /' \
  'mediahub.bapx.in /' \
  'mediahub.bapx.in /clients/nebo-lifestyle-clinic/' \
  'docs.bapx.in /getting-started/quickstart/' \
  'blogs.bapx.in /' \
  'api.bapx.in /v1/models'; do
  read -r host path <<<"$host_path"
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "https://$host$path")
  case "$host $path $status" in
    'api.bapx.in /v1/models 401') ;;
    *' 200'|*' 302') ;;
    *) echo "unexpected $status from $host$path" >&2; false ;;
  esac
done
git -C "$repository" checkout --quiet --detach "$sha"
trap - ERR
echo "deployed bapX-www $sha"
