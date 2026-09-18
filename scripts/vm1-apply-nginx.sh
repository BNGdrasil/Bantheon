#!/usr/bin/env bash
# Apply a staged Nginx configuration on VM1.
#
# This is the server side of the procedure that bngdrasil/deploy_vm1.sh runs
# over SSH, rewritten to run locally on VM1 so that the CD workflow only has to
# upload files and invoke one command. It follows section 6 of
# docs/nginx-baseline.md, including the pre-validation step that the reference
# script added:
#
#   1. back up the live nginx.conf and docker-compose.yml
#   2. validate the staged files in a throwaway container
#   3. move snippets/ first, then nginx.conf, into the live path
#   4. place docker-compose.yml and recreate the container
#   5. run nginx -t inside the real container, then reload
#
# The caller uploads nginx.conf, snippets/ and docker-compose.yml into the
# staging directory beforehand. Nothing in the live path is touched until the
# pre-validation passes.
#
# The script never rolls back on its own, because baseline step 10 is a manual
# decision. A failure prints the backup paths and the restore commands.
#
# Usage:
#   vm1-apply-nginx.sh
#
# Environment:
#   BNBONG_ROOT       deployment root, default: /opt/bnbong
#   STAGE_DIR         staging directory, default: <BNBONG_ROOT>/nginx.next
#   NGINX_IMAGE       image used for pre-validation, default: nginx:alpine
#   SSL_DIR           certificate directory, default: /etc/ssl/cloudflare
#   DOCKER            docker command, default: docker
#   PREVALIDATE_ONLY  1 stops after step 2, leaving the live path untouched

set -euo pipefail

BNBONG_ROOT="${BNBONG_ROOT:-/opt/bnbong}"
STAGE_DIR="${STAGE_DIR:-$BNBONG_ROOT/nginx.next}"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:alpine}"
SSL_DIR="${SSL_DIR:-/etc/ssl/cloudflare}"
DOCKER="${DOCKER:-docker}"
PREVALIDATE_ONLY="${PREVALIDATE_ONLY:-0}"

log()  { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERROR] $*" >&2; }

STAMP="$(date +%Y%m%dT%H%M%S)"
BACKUP_SUFFIX="bak-${STAMP}"

# 운영 컨테이너를 재생성한 시점부터는 실패했을 때 수동 복구 절차가 필요하다.
CONFIG_APPLIED=0

rollback_notice() {
    echo ""
    err "설정 적용이 실패했습니다. 아래 절차로 이전 설정을 되돌릴 수 있습니다."
    cat <<ROLLBACK

  cd $BNBONG_ROOT
  cp nginx/nginx.conf.$BACKUP_SUFFIX     nginx/nginx.conf
  cp docker-compose.yml.$BACKUP_SUFFIX   docker-compose.yml
  $DOCKER compose up -d
  $DOCKER compose exec -T nginx nginx -t
  $DOCKER compose exec -T nginx nginx -s reload

이전 설정에는 include가 없으므로 $BNBONG_ROOT/nginx/snippets 디렉터리가 남아 있어도
문제가 되지 않습니다. 정적 파일은 이 스크립트가 건드리지 않으므로 그대로 유지됩니다.

ROLLBACK
}

on_error() {
    local code=$?
    if [ "$CONFIG_APPLIED" -eq 1 ]; then
        rollback_notice
    else
        err "설정 적용이 실패했습니다. 운영 설정은 아직 교체하지 않았습니다."
        err "staging 디렉터리를 남겨 두었으니 내용을 확인하시기 바랍니다: $STAGE_DIR"
    fi
    exit "$code"
}
trap on_error ERR

# ---------------------------------------------------------------------------
# Step 0. staging 내용 확인
# ---------------------------------------------------------------------------
log "[0/5] staging 디렉터리를 확인합니다: $STAGE_DIR"

for path in "$STAGE_DIR/nginx.conf" "$STAGE_DIR/docker-compose.yml"; do
    if [ ! -f "$path" ]; then
        err "필요한 파일이 staging에 없습니다: $path"
        exit 1
    fi
done

if [ ! -d "$STAGE_DIR/snippets" ]; then
    err "snippets 디렉터리가 staging에 없습니다: $STAGE_DIR/snippets"
    exit 1
fi

# compose와 선검증이 모두 아래 경로를 mount하므로 존재만 보장한다. ambiw와
# overlock의 내용은 다른 저장소가 소유하므로 여기에서 건드리지 않는다.
mkdir -p \
    "$BNBONG_ROOT/nginx/snippets" \
    "$BNBONG_ROOT/client/dist" \
    "$BNBONG_ROOT/admin/dist" \
    "$BNBONG_ROOT/playground/dist" \
    "$BNBONG_ROOT/ambiw" \
    "$BNBONG_ROOT/overlock"

# ---------------------------------------------------------------------------
# Step 1. 현재 설정 백업 (기준선 6절 1번)
# ---------------------------------------------------------------------------
log "[1/5] 현재 설정을 백업합니다. 접미사: .$BACKUP_SUFFIX"

if [ -f "$BNBONG_ROOT/nginx/nginx.conf" ]; then
    cp -p "$BNBONG_ROOT/nginx/nginx.conf" "$BNBONG_ROOT/nginx/nginx.conf.$BACKUP_SUFFIX"
    log "  backed up: $BNBONG_ROOT/nginx/nginx.conf.$BACKUP_SUFFIX"
else
    warn "  nginx/nginx.conf 가 없어 백업을 건너뜁니다."
fi

if [ -f "$BNBONG_ROOT/docker-compose.yml" ]; then
    cp -p "$BNBONG_ROOT/docker-compose.yml" "$BNBONG_ROOT/docker-compose.yml.$BACKUP_SUFFIX"
    log "  backed up: $BNBONG_ROOT/docker-compose.yml.$BACKUP_SUFFIX"
else
    warn "  docker-compose.yml 이 없어 백업을 건너뜁니다."
fi

# ---------------------------------------------------------------------------
# Step 2. 임시 컨테이너로 선검증 (기준선 6절 3번)
#
# 실제 배포와 같은 mount 구성을 재현한다. 여기에서 실패하면 운영 파일은 아직
# 그대로이므로 trap이 staging 경로만 안내하고 종료한다.
# ---------------------------------------------------------------------------
log "[2/5] 임시 컨테이너로 staging 설정의 문법을 먼저 검사합니다."
"$DOCKER" run --rm \
    -v "$STAGE_DIR/nginx.conf":/etc/nginx/nginx.conf:ro \
    -v "$STAGE_DIR/snippets":/etc/nginx/snippets:ro \
    -v "$BNBONG_ROOT/client/dist":/usr/share/nginx/html/client:ro \
    -v "$BNBONG_ROOT/admin/dist":/usr/share/nginx/html/bifrost-admin:ro \
    -v "$BNBONG_ROOT/playground/dist":/usr/share/nginx/html/playground:ro \
    -v "$BNBONG_ROOT/ambiw":/usr/share/nginx/html/ambiw:ro \
    -v "$BNBONG_ROOT/overlock":/usr/share/nginx/html/overlock:ro \
    -v "$SSL_DIR":/etc/ssl/cloudflare:ro \
    "$NGINX_IMAGE" nginx -t
log "  선검증을 통과했습니다."

if [ "$PREVALIDATE_ONLY" = "1" ]; then
    warn "PREVALIDATE_ONLY=1 이므로 여기에서 멈춥니다. 운영 경로는 교체하지 않았습니다."
    exit 0
fi

# ---------------------------------------------------------------------------
# Step 3. 검증한 설정을 운영 경로로 옮긴다 (기준선 6절 4번)
#
# snippets를 먼저 옮기고 nginx.conf를 나중에 옮겨야, include 대상이 없는 상태로
# 설정 파일만 먼저 놓이는 구간이 생기지 않는다.
# ---------------------------------------------------------------------------
log "[3/5] 검증한 설정을 운영 경로로 옮깁니다."
CONFIG_APPLIED=1
rsync -a --delete "$STAGE_DIR/snippets/" "$BNBONG_ROOT/nginx/snippets/"
cp "$STAGE_DIR/nginx.conf" "$BNBONG_ROOT/nginx/nginx.conf"

# ---------------------------------------------------------------------------
# Step 4. compose 반영과 컨테이너 재생성 (기준선 6절 5번)
#
# mount 목록이 바뀔 수 있으므로 reload만으로는 반영되지 않는다.
# ---------------------------------------------------------------------------
log "[4/5] docker-compose.yml을 반영하고 컨테이너를 재생성합니다."
cp "$STAGE_DIR/docker-compose.yml" "$BNBONG_ROOT/docker-compose.yml"
rm -rf "$STAGE_DIR"

cd "$BNBONG_ROOT"
"$DOCKER" compose up -d

# ---------------------------------------------------------------------------
# Step 5. 문법 검사와 reload (기준선 6절 6번과 7번)
#
# 2단계는 파일 내용을, 이 단계는 실제 mount가 연결된 상태를 확인한다.
# ---------------------------------------------------------------------------
log "[5/5] 컨테이너 안에서 nginx -t로 문법을 다시 검사합니다."
"$DOCKER" compose exec -T nginx nginx -t

log "  검사를 통과했습니다. reload로 적용합니다."
"$DOCKER" compose exec -T nginx nginx -s reload
"$DOCKER" compose ps

echo ""
log "=== Nginx 설정 적용을 마쳤습니다 ==="
cat <<NEXT

이전 설정 백업은 아래 경로에 있습니다.

  $BNBONG_ROOT/nginx/nginx.conf.$BACKUP_SUFFIX
  $BNBONG_ROOT/docker-compose.yml.$BACKUP_SUFFIX

문제가 발견되면 아래 명령으로 이전 설정을 되돌릴 수 있습니다.

  cd $BNBONG_ROOT
  cp nginx/nginx.conf.$BACKUP_SUFFIX     nginx/nginx.conf
  cp docker-compose.yml.$BACKUP_SUFFIX   docker-compose.yml
  $DOCKER compose up -d
  $DOCKER compose exec -T nginx nginx -t
  $DOCKER compose exec -T nginx nginx -s reload

NEXT
