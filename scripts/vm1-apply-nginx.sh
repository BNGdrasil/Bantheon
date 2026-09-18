#!/usr/bin/env bash
# Apply a staged Nginx configuration on VM1, or roll one back.
#
# This is the server side of the procedure that bngdrasil/deploy_vm1.sh runs
# over SSH, rewritten to run locally on VM1 so that the CD workflow only has to
# upload files and invoke one command. It follows section 6 of
# docs/nginx-baseline.md, including the pre-validation step that the reference
# script added:
#
#   1. capture the live configuration as one release under nginx-releases/
#   2. validate the staged files in a throwaway container
#   3. move snippets/ first, then nginx.conf, into the live path
#   4. place docker-compose.yml and recreate the container
#   5. run nginx -t inside the real container, then reload
#
# The caller uploads nginx.conf, snippets/ and docker-compose.yml into the
# staging directory beforehand. Nothing in the live path is touched until the
# pre-validation passes.
#
# A release directory holds nginx.conf, the whole snippets/ tree,
# docker-compose.yml and a manifest with the sha256 of every captured file plus
# the image digest the nginx container was running. Restoring one release puts
# all three components back together, which a per-file backup could not do once
# the previous nginx.conf also included snippets.
#
# Failure handling:
#   * pre-validation failure leaves the live path untouched and simply exits
#   * a failure after the live files have been replaced restores the release
#     captured at the start of this run, recreates the container, verifies
#     nginx -t, and exits 1
#
# Usage:
#   vm1-apply-nginx.sh [apply]
#   vm1-apply-nginx.sh rollback [<release>]
#   vm1-apply-nginx.sh list
#
# Environment:
#   BNBONG_ROOT       deployment root, default: /opt/bnbong
#   STAGE_DIR         staging directory, default: <BNBONG_ROOT>/nginx.next
#   RELEASES_DIR      release store, default: <BNBONG_ROOT>/nginx-releases
#   KEEP_NGINX_RELEASES  releases to retain, default: 5
#   NGINX_IMAGE       image used for pre-validation, default: nginx:alpine
#   NGINX_SERVICE     compose service name, default: nginx
#   SSL_DIR           certificate directory, default: /etc/ssl/cloudflare
#   DOCKER            docker command, default: docker
#   PREVALIDATE_ONLY  1 stops after step 2, leaving the live path untouched

# errtrace(-E)가 있어야 ERR trap이 함수 본문 안에서도 동작한다. 적용 절차가
# 함수로 들어가 있으므로 이 옵션이 없으면 실패해도 자동 복원이 시작되지 않는다.
set -Eeuo pipefail

BNBONG_ROOT="${BNBONG_ROOT:-/opt/bnbong}"
STAGE_DIR="${STAGE_DIR:-$BNBONG_ROOT/nginx.next}"
RELEASES_DIR="${RELEASES_DIR:-$BNBONG_ROOT/nginx-releases}"
KEEP_NGINX_RELEASES="${KEEP_NGINX_RELEASES:-5}"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:alpine}"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"
SSL_DIR="${SSL_DIR:-/etc/ssl/cloudflare}"
DOCKER="${DOCKER:-docker}"
PREVALIDATE_ONLY="${PREVALIDATE_ONLY:-0}"

log()  { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERROR] $*" >&2; }

usage() {
    cat >&2 <<USAGE
사용법:
  $0 [apply]                 staging 설정을 검증하고 운영 경로에 반영합니다
  $0 rollback [<release>]    보존한 release로 되돌립니다 (생략하면 가장 최근 release)
  $0 list                    보존 중인 release 목록을 출력합니다
USAGE
}

# 운영 컨테이너를 재생성한 시점부터는 실패했을 때 자동 복원을 수행한다.
CONFIG_APPLIED=0
RELEASE_PATH=""

# ---------------------------------------------------------------------------
# 공용 도구
# ---------------------------------------------------------------------------

# sha256sum은 GNU coreutils, shasum은 macOS 기본 도구다. 두 환경 모두에서
# 같은 형식의 해시를 얻기 위해 둘 중 존재하는 쪽을 사용한다.
sha256_of() {
    if command -v sha256sum > /dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

compose() {
    (cd "$BNBONG_ROOT" && "$DOCKER" compose "$@")
}

# 실행 중인 nginx 컨테이너가 실제로 사용하는 이미지 참조와 digest를 돌려준다.
# 컨테이너나 compose 파일이 없을 수도 있으므로 실패는 값이 없는 것으로 취급한다.
running_image_info() {
    local container image_ref image_id repo_digests
    container="$(compose ps -q "$NGINX_SERVICE" 2> /dev/null | head -n 1 || true)"
    if [ -z "$container" ]; then
        echo "- -"
        return 0
    fi
    image_ref="$("$DOCKER" inspect -f '{{.Config.Image}}' "$container" 2> /dev/null || echo '-')"
    image_id="$("$DOCKER" inspect -f '{{.Image}}' "$container" 2> /dev/null || echo '')"
    repo_digests=""
    if [ -n "$image_id" ]; then
        repo_digests="$("$DOCKER" inspect -f '{{range .RepoDigests}}{{.}}{{end}}' "$image_id" 2> /dev/null || true)"
    fi
    if [ -z "$repo_digests" ]; then
        repo_digests="${image_id:--}"
    fi
    echo "${image_ref:--} ${repo_digests}"
}

# 현재 운영 중인 설정 일습을 release 디렉터리 하나로 보존한다. nginx.conf,
# snippets/ 전체, docker-compose.yml, 이미지 digest를 함께 남겨야 나중에 세
# 구성 요소를 같은 시점의 상태로 되돌릴 수 있다.
capture_release() {
    local stamp base path manifest info image_ref image_digest suffix
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    base="$RELEASES_DIR/$stamp"
    path="$base"
    suffix=1
    while [ -e "$path" ]; do
        path="${base}-${suffix}"
        suffix=$((suffix + 1))
    done

    mkdir -p "$path/snippets"

    if [ -f "$BNBONG_ROOT/nginx/nginx.conf" ]; then
        cp -p "$BNBONG_ROOT/nginx/nginx.conf" "$path/nginx.conf"
    fi
    if [ -d "$BNBONG_ROOT/nginx/snippets" ]; then
        rsync -a --delete "$BNBONG_ROOT/nginx/snippets/" "$path/snippets/"
    fi
    if [ -f "$BNBONG_ROOT/docker-compose.yml" ]; then
        cp -p "$BNBONG_ROOT/docker-compose.yml" "$path/docker-compose.yml"
    fi

    info="$(running_image_info)"
    image_ref="${info%% *}"
    image_digest="${info#* }"

    manifest="$path/manifest"
    {
        echo "release $(basename "$path")"
        echo "captured-at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "root $BNBONG_ROOT"
        echo "image-ref $image_ref"
        echo "image-digest $image_digest"
        if [ -f "$path/nginx.conf" ]; then
            echo "sha256 nginx.conf $(sha256_of "$path/nginx.conf")"
        else
            echo "absent nginx.conf"
        fi
        if [ -f "$path/docker-compose.yml" ]; then
            echo "sha256 docker-compose.yml $(sha256_of "$path/docker-compose.yml")"
        else
            echo "absent docker-compose.yml"
        fi
        find "$path/snippets" -type f | LC_ALL=C sort | while IFS= read -r snippet; do
            echo "sha256 snippets/$(basename "$snippet") $(sha256_of "$snippet")"
        done
    } > "$manifest"

    RELEASE_PATH="$path"
}

prune_releases() {
    local kept=0 entry
    [ -d "$RELEASES_DIR" ] || return 0
    # 디렉터리 이름이 UTC 타임스탬프이므로 이름 역순이 곧 최신 순서다.
    while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        kept=$((kept + 1))
        if [ "$kept" -le "$KEEP_NGINX_RELEASES" ]; then
            continue
        fi
        log "  오래된 release를 삭제합니다: $entry"
        rm -rf "$entry"
    done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort -r)
}

latest_release() {
    [ -d "$RELEASES_DIR" ] || return 1
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort -r | head -n 1
}

# release 하나를 그대로 되돌린다. nginx.conf, snippets/, docker-compose.yml을
# 함께 되돌린 다음 컨테이너를 재생성하고 nginx -t까지 확인한다.
# errexit가 적용되지 않는 자리에서도 호출되므로 단계마다 직접 실패를 확인한다.
restore_release() {
    local dir="$1"

    if [ ! -d "$dir" ]; then
        err "release 디렉터리가 없습니다: $dir"
        return 1
    fi
    if [ ! -f "$dir/manifest" ]; then
        err "manifest가 없어 온전한 release로 볼 수 없습니다: $dir/manifest"
        return 1
    fi

    log "release로 되돌립니다: $dir"
    # BSD sed에는 기본 정규식 대체 문법이 없으므로 grep으로 골라낸다.
    grep -E '^image-(ref|digest) ' "$dir/manifest" | sed 's/^/  기록된 /' || true

    mkdir -p "$BNBONG_ROOT/nginx/snippets" || return 1

    # snippets를 정확히 그때 상태로 맞춘다. --delete가 있어야 그 뒤에 추가된
    # snippet이 남아서 되돌린 nginx.conf와 섞이는 일이 생기지 않는다.
    rsync -a --delete "$dir/snippets/" "$BNBONG_ROOT/nginx/snippets/" || return 1

    if [ -f "$dir/nginx.conf" ]; then
        cp "$dir/nginx.conf" "$BNBONG_ROOT/nginx/nginx.conf" || return 1
    else
        warn "  보존 시점에 nginx.conf가 없었으므로 현재 파일을 제거합니다."
        rm -f "$BNBONG_ROOT/nginx/nginx.conf" || return 1
    fi

    if [ -f "$dir/docker-compose.yml" ]; then
        cp "$dir/docker-compose.yml" "$BNBONG_ROOT/docker-compose.yml" || return 1
    else
        warn "  보존 시점에 docker-compose.yml이 없었으므로 현재 파일을 유지합니다."
    fi

    compose up -d || return 1
    compose exec -T "$NGINX_SERVICE" nginx -t || return 1
    compose exec -T "$NGINX_SERVICE" nginx -s reload || return 1

    log "되돌리기를 마쳤습니다: $dir"
    return 0
}

verify_release() {
    local dir="$1" failed=0 kind rel expected actual
    while read -r kind rel expected; do
        case "$kind" in
            sha256)
                if [ ! -f "$dir/$rel" ]; then
                    err "  manifest에 있는 파일이 없습니다: $rel"
                    failed=1
                    continue
                fi
                actual="$(sha256_of "$dir/$rel")"
                if [ "$actual" != "$expected" ]; then
                    err "  해시가 다릅니다: $rel"
                    failed=1
                fi
                ;;
            *) ;;
        esac
    done < "$dir/manifest"
    return "$failed"
}

# ---------------------------------------------------------------------------
# 서브커맨드
# ---------------------------------------------------------------------------

cmd_list() {
    if [ ! -d "$RELEASES_DIR" ]; then
        log "보존된 release가 없습니다: $RELEASES_DIR"
        return 0
    fi
    local entry
    while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        echo "== $(basename "$entry")"
        sed 's/^/   /' "$entry/manifest" 2> /dev/null || echo "   manifest 없음"
    done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort -r)
}

cmd_rollback() {
    local target="${1:-}"

    if [ -z "$target" ]; then
        target="$(latest_release || true)"
        if [ -z "$target" ]; then
            err "되돌릴 release가 없습니다: $RELEASES_DIR"
            exit 1
        fi
    elif [ ! -d "$target" ]; then
        target="$RELEASES_DIR/$target"
    fi

    if [ ! -d "$target" ]; then
        err "release를 찾을 수 없습니다: $target"
        exit 1
    fi

    log "release 내용을 확인합니다: $target"
    if ! verify_release "$target"; then
        err "보존된 release의 해시가 manifest와 다릅니다. 내용을 먼저 확인하시기 바랍니다."
        exit 1
    fi

    if ! restore_release "$target"; then
        err "되돌리기에 실패했습니다. 컨테이너 상태를 직접 확인하시기 바랍니다."
        exit 1
    fi

    compose ps || true
    log "=== rollback을 마쳤습니다 ==="
}

cmd_apply() {
    trap on_error ERR

    # -----------------------------------------------------------------------
    # Step 0. staging 내용 확인
    # -----------------------------------------------------------------------
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
        "$BNBONG_ROOT/overlock" \
        "$RELEASES_DIR"

    # -----------------------------------------------------------------------
    # Step 1. 현재 설정을 release 단위로 보존 (기준선 6절 1번)
    # -----------------------------------------------------------------------
    log "[1/5] 현재 설정 일습을 release로 보존합니다."
    capture_release
    log "  보존 위치: $RELEASE_PATH"
    sed 's/^/    /' "$RELEASE_PATH/manifest"
    prune_releases

    # -----------------------------------------------------------------------
    # Step 2. 임시 컨테이너로 선검증 (기준선 6절 3번)
    #
    # 실제 배포와 같은 mount 구성을 재현한다. 여기에서 실패하면 운영 파일은 아직
    # 그대로이므로 trap이 staging 경로만 안내하고 종료한다.
    # -----------------------------------------------------------------------
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

    # -----------------------------------------------------------------------
    # Step 3. 검증한 설정을 운영 경로로 옮긴다 (기준선 6절 4번)
    #
    # snippets를 먼저 옮기고 nginx.conf를 나중에 옮겨야, include 대상이 없는 상태로
    # 설정 파일만 먼저 놓이는 구간이 생기지 않는다.
    # -----------------------------------------------------------------------
    log "[3/5] 검증한 설정을 운영 경로로 옮깁니다."
    CONFIG_APPLIED=1
    rsync -a --delete "$STAGE_DIR/snippets/" "$BNBONG_ROOT/nginx/snippets/"
    cp "$STAGE_DIR/nginx.conf" "$BNBONG_ROOT/nginx/nginx.conf"

    # -----------------------------------------------------------------------
    # Step 4. compose 반영과 컨테이너 재생성 (기준선 6절 5번)
    #
    # mount 목록이 바뀔 수 있으므로 reload만으로는 반영되지 않는다.
    # -----------------------------------------------------------------------
    log "[4/5] docker-compose.yml을 반영하고 컨테이너를 재생성합니다."
    cp "$STAGE_DIR/docker-compose.yml" "$BNBONG_ROOT/docker-compose.yml"

    compose up -d

    # -----------------------------------------------------------------------
    # Step 5. 문법 검사와 reload (기준선 6절 6번과 7번)
    #
    # 2단계는 파일 내용을, 이 단계는 실제 mount가 연결된 상태를 확인한다.
    # -----------------------------------------------------------------------
    log "[5/5] 컨테이너 안에서 nginx -t로 문법을 다시 검사합니다."
    compose exec -T "$NGINX_SERVICE" nginx -t

    log "  검사를 통과했습니다. reload로 적용합니다."
    compose exec -T "$NGINX_SERVICE" nginx -s reload
    compose ps

    # 여기까지 왔을 때에만 staging을 정리한다. 중간에 실패하면 올린 내용을
    # 그대로 두어야 원인을 확인할 수 있다.
    rm -rf "$STAGE_DIR"

    trap - ERR

    echo ""
    log "=== Nginx 설정 적용을 마쳤습니다 ==="
    cat <<NEXT

이전 설정 일습은 아래 release 디렉터리에 보존되어 있습니다.

  $RELEASE_PATH

문제가 발견되면 아래 명령으로 nginx.conf, snippets/, docker-compose.yml을
함께 되돌릴 수 있습니다. 이 명령은 컨테이너를 재생성하고 nginx -t까지 확인합니다.

  sudo $0 rollback $(basename "$RELEASE_PATH")

보존 중인 release 목록은 아래 명령으로 확인합니다.

  sudo $0 list

NEXT
}

on_error() {
    local code=$?
    trap - ERR

    if [ "$CONFIG_APPLIED" -eq 1 ] && [ -n "$RELEASE_PATH" ]; then
        err "운영 경로를 교체한 뒤에 실패했습니다. 이번 실행 직전의 설정으로 자동 복원합니다."
        if restore_release "$RELEASE_PATH"; then
            err "이전 설정으로 복원했고 nginx -t를 통과했습니다: $RELEASE_PATH"
            err "staging 디렉터리를 남겨 두었으니 실패 원인을 확인하시기 바랍니다: $STAGE_DIR"
        else
            err "자동 복원에도 실패했습니다. 아래 명령으로 직접 되돌리시기 바랍니다."
            err "  sudo $0 rollback $(basename "$RELEASE_PATH")"
        fi
        exit 1
    fi

    err "설정 적용이 실패했습니다. 운영 설정은 아직 교체하지 않았습니다."
    err "staging 디렉터리를 남겨 두었으니 내용을 확인하시기 바랍니다: $STAGE_DIR"
    exit "$code"
}

# ---------------------------------------------------------------------------
# 진입점
# ---------------------------------------------------------------------------
COMMAND="${1:-apply}"
case "$COMMAND" in
    apply)
        cmd_apply
        ;;
    rollback)
        shift
        cmd_rollback "${1:-}"
        ;;
    list)
        cmd_list
        ;;
    -h|--help|help)
        usage
        ;;
    *)
        err "알 수 없는 서브커맨드입니다: $COMMAND"
        usage
        exit 2
        ;;
esac
