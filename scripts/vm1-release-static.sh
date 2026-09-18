#!/usr/bin/env bash
# Publish one uploaded static release on VM1, or roll one back.
#
# The CD workflow uploads a build to /opt/bnbong/releases/<sha>/<app>/ and then
# runs this script on VM1. The Nginx container bind mounts
# /opt/bnbong/<app>/dist, so the release is published by syncing the uploaded
# directory into that path. The mount target itself never changes, which is why
# the container needs neither a restart nor a reload.
#
# releases/ is shared by every app, so retention is counted per app over the
# releases/<sha>/<app> directories. A release directory is never removed while
# some current-<app> or previous-<app> link points at it, which keeps both the
# serving release and the rollback point of every other app intact. Only a
# releases/<sha> directory that has become empty is removed.
#
# Two links per app record the state:
#   current-<app>   the release that was synced into <app>/dist last
#   previous-<app>  the release that was serving before that, the rollback point
#
# Usage:
#   vm1-release-static.sh <app: client|admin> <release_dir>
#   vm1-release-static.sh rollback <app: client|admin>
#
# Environment:
#   BNBONG_ROOT    deployment root, default: /opt/bnbong
#   KEEP_RELEASES  release directories to retain per app, default: 5

set -euo pipefail

BNBONG_ROOT="${BNBONG_ROOT:-/opt/bnbong}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
RELEASES_ROOT="$BNBONG_ROOT/releases"

log()  { echo "[INFO] $*"; }
err()  { echo "[ERROR] $*" >&2; }

usage() {
    cat >&2 <<USAGE
사용법:
  $0 <client|admin> <release_dir>   release를 반영합니다
  $0 rollback <client|admin>        직전 release로 되돌립니다
예시:
  $0 client $RELEASES_ROOT/abc1234/client
  $0 rollback client
USAGE
}

check_app() {
    case "$1" in
        client|admin) ;;
        *)
            err "지원하지 않는 app 이름입니다: $1"
            usage
            exit 2
            ;;
    esac
}

# 링크가 가리키는 절대 경로를 돌려준다. 링크가 없거나 대상이 사라졌으면 빈 값이다.
link_target() {
    local link="$1" target
    [ -L "$link" ] || return 0
    target="$(readlink "$link")" || return 0
    case "$target" in
        /*) ;;
        *) target="$BNBONG_ROOT/$target" ;;
    esac
    printf '%s\n' "$target"
}

# 빌드 산출물로 볼 수 있는지 확인한다. index.html이 없으면 반영하지 않는다.
check_release_dir() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        err "release 디렉터리가 없습니다: $dir"
        return 1
    fi
    if [ ! -f "$dir/index.html" ]; then
        err "index.html이 없어 정상적인 빌드 결과물로 볼 수 없습니다: $dir/index.html"
        return 1
    fi
    return 0
}

# bind mount의 대상 경로를 그대로 두고 내용만 교체한다. --delete 때문에 이전
# 릴리스에만 있던 파일은 사라지므로, 동기화가 진행되는 짧은 순간에는 이전 HTML이
# 이미 삭제된 asset을 참조할 수 있다. 이 위험은 README의 배포 절에 적어 두었다.
sync_release() {
    local src="$1" dst="$2"
    mkdir -p "$dst"
    rsync -a --delete "$src/" "$dst/"
}

# current-<app>과 previous-<app>이 가리키는 release를 모두 모은다. 다른 앱의
# 링크까지 포함해야 한 앱의 배포가 다른 앱의 보관본을 지우지 않는다.
protected_releases() {
    local link target
    shopt -s nullglob
    for link in "$BNBONG_ROOT"/current-* "$BNBONG_ROOT"/previous-*; do
        target="$(link_target "$link")"
        [ -n "$target" ] && printf '%s\n' "$target"
    done
    shopt -u nullglob
}

# 앱 단위로 보존 개수를 적용한다. 정리 대상은 releases/<sha>/<app> 디렉터리이며,
# 보호 목록에 있는 release와 방금 배포한 release는 개수와 무관하게 남긴다.
prune_app_releases() {
    local app="$1" keep_extra="$2"
    local protected index=0 candidate sha_dir

    [ -d "$RELEASES_ROOT" ] || return 0

    protected="$(protected_releases)"
    if [ -n "$keep_extra" ]; then
        protected="$protected
$keep_extra"
    fi

    shopt -s nullglob
    local app_dirs=()
    for candidate in "$RELEASES_ROOT"/*/"$app"/; do
        app_dirs+=("${candidate%/}")
    done
    shopt -u nullglob

    if [ "${#app_dirs[@]}" -gt "$KEEP_RELEASES" ]; then
        # ls -t 는 변경 시각이 최근인 순서로 정렬하므로, 앞의 KEEP_RELEASES 개가
        # 남길 릴리스이고 그 뒤가 삭제 후보다.
        while IFS= read -r candidate; do
            [ -n "$candidate" ] || continue
            index=$((index + 1))
            if [ "$index" -le "$KEEP_RELEASES" ]; then
                continue
            fi
            if printf '%s\n' "$protected" | grep -Fxq "$candidate"; then
                log "  보존 개수를 넘었지만 현재 또는 직전 release이므로 남깁니다: $candidate"
                continue
            fi
            log "  오래된 $app release를 삭제합니다: $candidate"
            rm -rf "$candidate"
        done < <(ls -dt "${app_dirs[@]}")
    fi

    # 어떤 앱의 release도 남지 않은 sha 디렉터리만 정리한다. 다른 앱의 release가
    # 남아 있으면 그 디렉터리는 건드리지 않는다.
    shopt -s nullglob
    for sha_dir in "$RELEASES_ROOT"/*/; do
        sha_dir="${sha_dir%/}"
        if [ -z "$(ls -A "$sha_dir")" ]; then
            log "  비어 있는 release 디렉터리를 정리합니다: $sha_dir"
            rmdir "$sha_dir"
        fi
    done
    shopt -u nullglob
}

# ---------------------------------------------------------------------------
# rollback 서브커맨드
# ---------------------------------------------------------------------------
cmd_rollback() {
    local app="$1"
    check_app "$app"

    local previous current target_dir
    previous="$(link_target "$BNBONG_ROOT/previous-$app")"
    current="$(link_target "$BNBONG_ROOT/current-$app")"
    target_dir="$BNBONG_ROOT/$app/dist"

    if [ -z "$previous" ]; then
        err "$app 의 직전 release 기록이 없습니다: $BNBONG_ROOT/previous-$app"
        exit 1
    fi
    if ! check_release_dir "$previous"; then
        err "직전 release를 사용할 수 없어 되돌릴 수 없습니다: $previous"
        exit 1
    fi

    log "app:      $app"
    log "rollback: $previous"
    log "target:   $target_dir"

    sync_release "$previous" "$target_dir"
    log "직전 release의 정적 파일을 반영했습니다."

    # 두 링크를 맞바꾸면 되돌린 뒤에도 방금 물러난 release가 보호 대상으로 남고,
    # 같은 명령으로 다시 앞으로 돌아갈 수 있다.
    ln -sfn "$previous" "$BNBONG_ROOT/current-$app"
    if [ -n "$current" ] && [ "$current" != "$previous" ]; then
        ln -sfn "$current" "$BNBONG_ROOT/previous-$app"
    else
        rm -f "$BNBONG_ROOT/previous-$app"
    fi
    log "current-$app 링크를 갱신했습니다: $BNBONG_ROOT/current-$app -> $previous"

    log "=== $app 롤백을 마쳤습니다 ==="
}

# ---------------------------------------------------------------------------
# 배포 (기본 동작)
# ---------------------------------------------------------------------------
cmd_release() {
    local app="$1" release_dir="$2"
    check_app "$app"

    if ! check_release_dir "$release_dir"; then
        exit 1
    fi

    # 절대 경로로 정규화해 두어야 심볼릭 링크가 상대 경로로 깨지지 않는다.
    release_dir="$(cd "$release_dir" && pwd)"

    local target_dir="$BNBONG_ROOT/$app/dist"
    local previous
    previous="$(link_target "$BNBONG_ROOT/current-$app")"

    log "app:      $app"
    log "release:  $release_dir"
    log "target:   $target_dir"
    if [ -n "$previous" ]; then
        log "previous: $previous"
    fi

    # 부분 동기화 상태로 끝나면 이전 HTML과 새 asset이 섞이므로, rsync가 실패하면
    # 곧바로 직전 release로 되돌려 서비스 내용을 하나의 판본으로 맞춘다.
    if ! sync_release "$release_dir" "$target_dir"; then
        err "정적 파일 동기화에 실패했습니다: $release_dir -> $target_dir"
        if [ -n "$previous" ] && [ "$previous" != "$release_dir" ] && check_release_dir "$previous"; then
            err "직전 release로 다시 동기화합니다: $previous"
            if sync_release "$previous" "$target_dir"; then
                err "직전 release로 되돌렸습니다. current-$app 링크는 그대로 둡니다."
            else
                err "되돌리기에도 실패했습니다. $target_dir 내용을 직접 확인하시기 바랍니다."
            fi
        else
            err "되돌릴 직전 release가 없습니다. $target_dir 내용을 직접 확인하시기 바랍니다."
        fi
        exit 1
    fi
    log "정적 파일을 반영했습니다."

    # 어떤 릴리스가 현재 서비스되고 있는지 남기는 기록용 링크다. Nginx는 이 링크를
    # 읽지 않으므로, 링크가 없거나 갱신에 실패해도 서비스에는 영향이 없다.
    if [ -n "$previous" ] && [ "$previous" != "$release_dir" ]; then
        ln -sfn "$previous" "$BNBONG_ROOT/previous-$app"
        log "previous-$app 링크를 갱신했습니다: $BNBONG_ROOT/previous-$app -> $previous"
    fi
    ln -sfn "$release_dir" "$BNBONG_ROOT/current-$app"
    log "current-$app 링크를 갱신했습니다: $BNBONG_ROOT/current-$app -> $release_dir"

    log "오래된 $app release를 정리합니다. 보존 개수: $KEEP_RELEASES"
    prune_app_releases "$app" "$release_dir"

    log "=== $app 릴리스를 마쳤습니다 ==="
}

# ---------------------------------------------------------------------------
# 진입점
# ---------------------------------------------------------------------------
if [ "$#" -lt 1 ]; then
    err "인자가 필요합니다."
    usage
    exit 2
fi

case "$1" in
    rollback)
        if [ "$#" -ne 2 ]; then
            err "rollback 은 app 이름 하나가 필요합니다."
            usage
            exit 2
        fi
        cmd_rollback "$2"
        ;;
    -h|--help|help)
        usage
        ;;
    *)
        if [ "$#" -ne 2 ]; then
            err "인자 두 개가 필요합니다."
            usage
            exit 2
        fi
        cmd_release "$1" "$2"
        ;;
esac
