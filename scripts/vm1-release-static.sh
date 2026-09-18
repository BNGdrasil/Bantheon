#!/usr/bin/env bash
# Publish one uploaded static release on VM1.
#
# The CD workflow uploads a build to /opt/bnbong/releases/<sha>/<app>/ and then
# runs this script on VM1. The Nginx container bind mounts
# /opt/bnbong/<app>/dist, so the release is published by syncing the uploaded
# directory into that path. The mount target itself never changes, which is why
# the container needs neither a restart nor a reload.
#
# Usage:
#   vm1-release-static.sh <app: client|admin> <release_dir>
#
# Environment:
#   BNBONG_ROOT    deployment root, default: /opt/bnbong
#   KEEP_RELEASES  number of release directories to retain, default: 5

set -euo pipefail

BNBONG_ROOT="${BNBONG_ROOT:-/opt/bnbong}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log() { echo "[INFO] $*"; }
err() { echo "[ERROR] $*" >&2; }

usage() {
    echo "사용법: $0 <client|admin> <release_dir>" >&2
    echo "예시:   $0 client $BNBONG_ROOT/releases/abc1234/client" >&2
}

if [ "$#" -ne 2 ]; then
    err "인자 두 개가 필요합니다."
    usage
    exit 2
fi

APP="$1"
RELEASE_DIR="$2"

case "$APP" in
    client|admin) ;;
    *)
        err "지원하지 않는 app 이름입니다: $APP"
        usage
        exit 2
        ;;
esac

if [ ! -d "$RELEASE_DIR" ]; then
    err "release 디렉터리가 없습니다: $RELEASE_DIR"
    exit 1
fi

# 절대 경로로 정규화해 두어야 심볼릭 링크가 상대 경로로 깨지지 않는다.
RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"

if [ ! -f "$RELEASE_DIR/index.html" ]; then
    err "index.html이 없어 정상적인 빌드 결과물로 볼 수 없습니다: $RELEASE_DIR/index.html"
    exit 1
fi

TARGET_DIR="$BNBONG_ROOT/$APP/dist"
RELEASES_ROOT="$BNBONG_ROOT/releases"

log "app:     $APP"
log "release: $RELEASE_DIR"
log "target:  $TARGET_DIR"

mkdir -p "$TARGET_DIR"

# bind mount의 대상 경로를 그대로 두고 내용만 교체한다. --delete 때문에 이전
# 릴리스에만 있던 파일은 사라지므로, 동기화가 진행되는 짧은 순간에는 이전 HTML이
# 이미 삭제된 asset을 참조할 수 있다. 이 위험은 README의 배포 절에 적어 두었다.
rsync -a --delete "$RELEASE_DIR/" "$TARGET_DIR/"
log "정적 파일을 반영했습니다."

# 어떤 릴리스가 현재 서비스되고 있는지 남기는 기록용 링크다. Nginx는 이 링크를
# 읽지 않으므로, 링크가 없거나 갱신에 실패해도 서비스에는 영향이 없다.
ln -sfn "$RELEASE_DIR" "$BNBONG_ROOT/current-$APP"
log "current-$APP 링크를 갱신했습니다: $BNBONG_ROOT/current-$APP -> $RELEASE_DIR"

# releases/ 는 <sha>/<app> 구조이므로 보존 단위는 sha 디렉터리다. 최근 것부터
# KEEP_RELEASES 개를 남기고 나머지를 지우되, 지금 배포한 릴리스는 항상 남긴다.
if [ -d "$RELEASES_ROOT" ]; then
    CURRENT_SHA_DIR="$(dirname "$RELEASE_DIR")"

    shopt -s nullglob
    release_dirs=()
    for candidate in "$RELEASES_ROOT"/*/; do
        release_dirs+=("${candidate%/}")
    done
    shopt -u nullglob

    if [ "${#release_dirs[@]}" -gt "$KEEP_RELEASES" ]; then
        index=0
        # ls -t 는 변경 시각이 최근인 순서로 정렬하므로, 앞의 KEEP_RELEASES 개가
        # 남길 릴리스이고 그 뒤가 삭제 대상이다.
        while IFS= read -r sha_dir; do
            [ -n "$sha_dir" ] || continue
            index=$((index + 1))
            if [ "$index" -le "$KEEP_RELEASES" ]; then
                continue
            fi
            if [ "$sha_dir" = "$CURRENT_SHA_DIR" ]; then
                log "보존 개수를 넘었지만 방금 배포한 릴리스이므로 남깁니다: $sha_dir"
                continue
            fi
            log "오래된 릴리스를 삭제합니다: $sha_dir"
            rm -rf "$sha_dir"
        done < <(ls -dt "${release_dirs[@]}")
    fi
fi

log "=== $APP 릴리스를 마쳤습니다 ==="
