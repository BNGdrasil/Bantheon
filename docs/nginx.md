# Nginx 구성

VM1이 도메인별로 요청을 처리하는 방식과 `nginx/` 디렉터리의 설정 구조를 정리합니다.

## 도메인별 처리

| 도메인 | 처리 방식 |
|---|---|
| `bnbong.com`, `www.bnbong.com`, `dashboard.bnbong.com` | `client/` 빌드 결과를 정적으로 서비스하는 공개 포트폴리오 사이트입니다 |
| `admin.bnbong.com` | `admin/` 빌드 결과를 정적으로 서비스하는 관리자 콘솔입니다. `/admin/api/`는 Bifrost 게이트웨이로 프록시합니다 |
| `api.bnbong.com` | Bifrost 게이트웨이(`/`)와 Bidar 인증 서버(`/auth`)로 프록시합니다 |
| `monitoring.bnbong.com` | Grafana로 프록시합니다 |
| `ambiw.bnbong.com`, `overlock.bnbong.com` | 다른 저장소가 만든 정적 산출물을 서비스하고, 필요한 API 경로만 VM2로 프록시합니다 |

이 저장소는 client와 admin의 소스코드를 직접 소유하지만, ambiw와 overlock의 정적 파일은 소유하지 않습니다. 두 서비스는 각자의 저장소에서 빌드되며, VM1에는 `/opt/bnbong/ambiw`와 `/opt/bnbong/overlock` 경로로 이미 만들어진 결과물만 마운트됩니다. `client/dist`와 `admin/dist`는 이 저장소가 빌드한 결과물입니다. `docker-compose.yml`의 볼륨 마운트 목록을 보면 이 소유 구분을 그대로 확인할 수 있습니다.

## snippets 목록

`nginx/nginx.conf`는 VM1에서 실행하는 운영 Nginx 설정이고, `nginx/snippets/`는 여러 vhost가 함께 쓰는 조각을 모아 둡니다.

| 조각 | 용도 |
|---|---|
| `cloudflare-real-ip.conf` | Cloudflare edge 대역을 신뢰하고 `CF-Connecting-IP`로 실제 방문자 주소를 복원합니다 |
| `proxy-common.conf` | 연결 상대의 주소를 그대로 전달하는 프록시 헤더입니다. admin과 monitoring이 사용합니다 |
| `proxy-common-cf.conf` | Cloudflare가 전달한 방문자 주소를 그대로 전달하는 프록시 헤더입니다. api와 overlock이 사용합니다 |
| `proxy-websocket.conf` | Grafana Live처럼 WebSocket 업그레이드가 필요한 upstream에 사용합니다 |
| `static-immutable.conf` | 내용 해시가 붙은 Vite 빌드 asset을 1년 동안 캐시합니다 |
| `static-revalidate.conf` | 이름에 해시가 없는 파일과 `index.html`을 매 요청마다 재검증합니다 |
| `security-headers-deny.conf`, `security-headers-deny-hsts.conf`, `security-headers-sameorigin.conf` | vhost별로 다른 보안 헤더 조합을 정의합니다 |

## upstream 위치

VM2(백엔드 호스트)의 실제 주소는 파일 맨 위의 `upstream` 블록 네 개(`gateway`, `auth_server`, `overlock_server`, `grafana`)에만 등장합니다. VM2 주소가 바뀌면 이 블록만 고치면 되고, 그 아래의 각 `server` 블록은 upstream 이름만 참조합니다.

## 캐시 정책과 보안 헤더

Nginx의 `add_header`는 하위 location이 자신의 `add_header`를 선언하는 순간 상위에서 물려받던 보안 헤더를 모두 잃습니다. 그래서 캐시 정책을 설정하는 location마다 해당 vhost의 보안 헤더 조각을 함께 include하고 있습니다.

이 설정의 변경 이력과 검증 절차, 아직 반영하지 않은 항목은 [nginx-baseline.md](nginx-baseline.md)에 자세히 기록되어 있습니다. 운영 적용 절차는 같은 문서의 6절에 정리되어 있습니다.
