#!/usr/bin/env bash
# Root-owned installed copy; never execute an SSH-supplied shell fragment.
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
BASE=/opt/notionnext
REPO=$BASE/repo
MODE=deploy
if [[ ${1:-} == --rollback ]]; then MODE=rollback; shift; fi
SHA=${1:-}
[[ $# == 1 && $SHA =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: deploy.sh [--rollback] FULL_COMMIT_SHA' >&2; exit 2; }
exec 9>"$BASE/state/deploy.lock"
flock -w 3600 9 || { echo 'Deployment lock timed out'; exit 1; }
exec > >(tee -a "$BASE/logs/$(date -u +%Y%m%dT%H%M%SZ)-$SHA.log") 2>&1
printf 'Deployment %s %s at %s\n' "$MODE" "$SHA" "$(date -u --iso-8601=seconds)"
CURRENT_SLOT=green
CURRENT_SHA=
if [[ -f $BASE/state/active ]]; then read -r CURRENT_SLOT CURRENT_SHA < "$BASE/state/active"; fi
if [[ $CURRENT_SLOT == blue ]]; then SLOT=green; PORT=3001; else SLOT=blue; PORT=3000; fi
CTX=$BASE/releases/$SHA
if [[ $MODE == deploy ]]; then
  git -C "$REPO" fetch --prune origin main
  git -C "$REPO" merge-base --is-ancestor "$SHA" origin/main || { echo 'Commit must belong to main'; exit 1; }
  mkdir -p "$CTX"
  # An archive never includes untracked files or server environment files.
  git -C "$REPO" archive "$SHA" | tar -x -C "$CTX"
  [[ -f $CTX/deploy/compose.yml ]] || { echo 'Commit lacks deployment configuration'; exit 1; }
  docker build --build-arg "DEPLOY_CONFIG_REV=$(sha256sum "$BASE/build.env" | cut -d' ' -f1)" --secret "id=build_env,src=$BASE/build.env" -t "notionnext:$SHA" "$CTX"
else
  docker image inspect "notionnext:$SHA" >/dev/null
  [[ -f $CTX/deploy/compose.yml ]] || { echo 'Retained compose file missing'; exit 1; }
fi
# Build completes before touching either running slot.
export IMAGE_TAG=$SHA APP_PORT=$PORT
COMPOSE=(docker compose -p "notionnext-$SLOT" -f "$CTX/deploy/compose.yml")
GATE=(docker compose -p notionnext-gateway -f "$BASE/gateway/compose.yml")
SWITCH_STARTED=0
COMMITTED=0
cp "$BASE/gateway/conf/route.conf" "$BASE/state/route.before"
cleanup() {
  rc=$?
  if (( COMMITTED == 0 )); then
    if (( SWITCH_STARTED == 1 )); then
      cp "$BASE/state/route.before" "$BASE/gateway/conf/route.conf.tmp"
      mv "$BASE/gateway/conf/route.conf.tmp" "$BASE/gateway/conf/route.conf"
      "${GATE[@]}" exec -T gateway nginx -s reload || true
    fi
    "${COMPOSE[@]}" stop app || true
    echo 'Deployment failed; previous production slot retained.'
  fi
  exit "$rc"
}
trap cleanup EXIT
"${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 240
python3 "$BASE/healthcheck.py" "http://127.0.0.1:$PORT"
cat > "$BASE/gateway/conf/route.conf.tmp" <<ROUTE
server {
  listen 127.0.0.1:3080;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
    proxy_read_timeout 180s;
    proxy_buffering off;
  }
}
ROUTE
SWITCH_STARTED=1
mv "$BASE/gateway/conf/route.conf.tmp" "$BASE/gateway/conf/route.conf"
"${GATE[@]}" up -d
"${GATE[@]}" exec -T gateway nginx -t
"${GATE[@]}" exec -T gateway nginx -s reload
python3 "$BASE/healthcheck.py" http://127.0.0.1:3080
printf '%s %s\n' "$SLOT" "$SHA" > "$BASE/state/active.tmp"
mv "$BASE/state/active.tmp" "$BASE/state/active"
printf '%s %s %s\n' "$(date -u --iso-8601=seconds)" "$SLOT" "$SHA" >> "$BASE/state/history"
COMMITTED=1
trap - EXIT
# Retain the five most recently deployed distinct versions, plus either running slot.
python3 "$BASE/prune.py" || echo 'Image cleanup skipped; deployment remains healthy.'
echo "Deployed $SHA in $SLOT; stable upstream is 127.0.0.1:3080"
