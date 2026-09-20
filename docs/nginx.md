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
| `deny-metrics.conf` | 공개 vhost에서 Prometheus 수집 경로인 `/metrics`를 404로 막습니다 |
| `stub-status-server.conf` | 8080번 포트에 exporter 전용 `stub_status` server 블록을 선언합니다 |

다른 조각들은 `server` 블록 안에서 include하는 부분 설정이지만, `stub-status-server.conf`만은 `server` 블록 하나를 통째로 담고 있어서 `nginx.conf`의 `http` 수준에서 include합니다.

## upstream 위치

VM2(백엔드 호스트)의 실제 주소는 파일 맨 위의 `upstream` 블록 네 개(`gateway`, `auth_server`, `overlock_server`, `grafana`)에만 등장합니다. VM2 주소가 바뀌면 이 블록만 고치면 되고, 그 아래의 각 `server` 블록은 upstream 이름만 참조합니다.

## /metrics 차단

Bifrost 게이트웨이와 Bidar 인증 서버, Grafana는 모두 Prometheus 수집 경로인 `/metrics`를 인증 없이 노출합니다. Prometheus는 VM2의 docker 네트워크 안에서 이 세 서비스를 직접 수집하기 때문에, 공개 도메인을 거쳐서 같은 경로에 도달할 이유가 없습니다. 그래서 백엔드 애플리케이션으로 프록시하는 vhost 네 개(`api`, `admin`, `monitoring`, `overlock`)의 HTTP와 HTTPS 블록에 `deny-metrics.conf`를 include해 두었습니다. 응답 코드로 403이 아니라 404를 사용하는 이유는, 403이 "권한이 없을 뿐 그 경로는 존재한다"는 사실을 알려 주기 때문입니다.

이 조각은 세 가지 location을 선언합니다. 첫째로 `location = /metrics`는 정확히 일치하는 요청을 받아내며, 다른 모든 prefix location과 정규식 location보다 우선하기 때문에 include 위치와 무관하게 동작합니다. 둘째로 `location ^~ /metrics/`는 끝에 슬래시가 붙은 형태와 그 아래의 하위 경로를 함께 막으며, `^~`가 붙어 있으므로 정규식 location에 요청을 넘기지 않습니다. 셋째로 대소문자를 구분하지 않는 정규식 한 줄은 현재 백엔드가 아니라 앞으로 추가될 백엔드를 대비한 안전장치입니다. 정규식 location은 파일에 적힌 순서대로 평가되므로, 이 조각은 각 `server` 블록의 앞쪽에서 include해야 합니다.

Nginx는 location을 고르기 전에 퍼센트 인코딩을 해석하고 연속된 슬래시를 하나로 합치며 `.`과 `..`을 정리합니다. 따라서 `/%6Detrics`와 `//metrics`, `/a/../metrics`는 모두 `/metrics`로 정리된 다음 위 규칙에 걸립니다. 반대로 `api.bnbong.com`의 `/auth` location은 `proxy_pass`에 경로를 덧붙이지 않아서 요청 경로를 그대로 인증 서버에 전달하므로, 클라이언트가 이 vhost를 통해 인증 서버의 `/metrics`에 도달할 수 있는 경로는 없습니다.

Grafana의 상태 확인 경로인 `/api/health`는 배포 스모크 테스트가 사용하므로 막지 않았습니다. `deploy-nginx.yml`은 vhost 네 개의 `/metrics`와 `/metrics/`가 404인지 확인하고, 같은 단계에서 `monitoring.bnbong.com/api/health`가 여전히 200인지 함께 확인합니다.

## stub_status 엔드포인트

Prometheus가 VM1의 Nginx 지표를 수집하려면 `nginx-prometheus-exporter`가 필요하고, 이 exporter는 Nginx의 `stub_status` 모듈이 만드는 요약 정보를 읽어서 Prometheus 형식으로 바꿉니다. `stub_status`는 기본으로 켜져 있지 않기 때문에 전용 `server` 블록을 따로 선언해야 합니다. 이 블록이 돌려주는 정보는 활성 연결 수와 누적 요청 수 정도이며, 요청 경로나 호스트 이름이나 클라이언트 주소는 포함하지 않습니다.

`stub-status-server.conf`는 공개 vhost와 섞이지 않도록 별도의 `server` 블록으로 8080번 포트만 듣고, `server_name`은 `_`로 둡니다. 공개 vhost가 사용하는 80번과 443번 포트에는 이 블록이 전혀 관여하지 않으므로, 어떤 공개 도메인으로 `/stub_status`를 요청해도 해당 vhost의 일반 규칙에 걸려서 404나 정적 파일 처리로 끝납니다. 반대로 8080번 포트에서는 `/stub_status`를 제외한 모든 경로가 404입니다.

VM1의 Nginx는 호스트 패키지가 아니라 `nginx:alpine` 이미지로 만든 `vm1-nginx` 컨테이너입니다. 그래서 설정 조각만으로는 부족하고 `docker-compose.yml`의 포트 목록에 `127.0.0.1:8080:8080`을 함께 넣어야 합니다. 이 접두사가 빠지면 Docker가 8080번 포트를 모든 인터페이스에 게시하기 때문에, 호스트 방화벽이 막아 주지 않는 한 VM1 바깥에서도 닿을 수 있게 됩니다.

### 접근 제한

접근 제한은 `allow`와 `deny`를 `server` 수준에 선언해서, 나중에 location을 추가하더라도 같은 제한을 그대로 물려받도록 했습니다. 허용 대상은 `127.0.0.1`과 `172.16.0.0/12` 두 가지이며, 허용 범위 밖에서 온 요청은 `/stub_status`에 대해 403을 받습니다. 다만 나머지 경로를 받아내는 `location /`은 `return 404;`만 선언하고 있어서, 허용 여부와 무관하게 404를 돌려줍니다. `return` 지시어는 접근 제어 단계보다 앞선 rewrite 단계에서 처리되기 때문인데, 이 404는 어떤 정보도 알려 주지 않으므로 그대로 두었습니다.

루프백만 허용하지 않고 `172.16.0.0/12`까지 넣은 이유는 Docker가 loopback에 게시한 포트를 처리하는 방식 때문입니다. Docker는 목적지가 `127.0.0.0/8`인 트래픽에는 DNAT 규칙을 적용하지 않고 userland 프로세스인 `docker-proxy`가 중계하도록 두는데, 이 중계를 거치면 컨테이너 안에서 관측되는 출발지 주소가 `127.0.0.1`이 아니라 `bnbong_frontend-network`의 bridge 게이트웨이 주소로 바뀝니다. 그 게이트웨이 주소는 Docker가 자동으로 배정하고 어느 문서에도 기록되어 있지 않기 때문에, 한 주소 대신 Docker가 bridge 네트워크에 사용하는 대역 전체를 허용했습니다.

이 대역을 실제 게이트웨이 주소 하나로 좁히려면 VM1에서 먼저 값을 확인해야 합니다.

```bash
docker network inspect bnbong_frontend-network \
  -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
```

확인한 주소를 `stub-status-server.conf`의 `allow 172.16.0.0/12;` 자리에 `allow <게이트웨이 주소>;`로 바꾸어 넣으면 됩니다. 다만 이 주소는 네트워크를 다시 만들면 달라지고, 달라지는 순간 exporter의 요청이 403으로 막히면서 `nginx_up`이 0으로 떨어집니다. 주소를 고정하고 싶다면 `docker-compose.yml`에서 `frontend-network`의 `ipam` 설정에 subnet과 gateway를 직접 지정해야 하는데, 이 변경은 기존 네트워크를 지우고 다시 만들어야 반영되기 때문에 `docker compose up -d`만으로는 실패합니다. `scripts/vm1-apply-nginx.sh`가 그 단계에서 멈추고 직전 설정으로 자동 복원하므로, 네트워크를 고정하기로 결정한다면 배포 전에 `docker compose down`을 먼저 실행하는 절차를 따로 잡아야 합니다.

현재 `bnbong_frontend-network`에는 `vm1-nginx` 컨테이너 하나만 연결되어 있으므로, 대역을 넓게 허용해도 실제로 접근할 수 있는 주체는 호스트의 `docker-proxy`밖에 없습니다. 이 네트워크에 다른 컨테이너를 붙이게 되면 그때 위의 방법으로 허용 범위를 좁히시기 바랍니다.

### exporter 연계

exporter 자체는 이 저장소가 아니라 baedalus 저장소의 `monitoring/remote-exporters/`가 소유합니다. `install-nginx-exporter.sh`가 systemd 유닛으로 `nginx-prometheus-exporter`를 VM1 호스트에 설치하고, 기본 수집 주소로 `http://127.0.0.1:8080/stub_status`를 사용하며, 변환한 지표를 `10.0.1.133:9113`에 노출합니다. VM2의 Prometheus는 그 주소를 `vm1-nginx` job으로 수집합니다. 포트 번호나 경로를 이 문서와 다르게 바꾸려면 baedalus의 설치 스크립트와 README도 함께 고쳐야 합니다.

### 적용 순서

Nginx 설정을 먼저 반영하고 exporter를 나중에 설치합니다. 순서를 바꾸면 exporter가 기동한 직후부터 수집에 실패하면서 `nginx_up`이 0인 구간이 생깁니다.

1. 이 저장소에서 `CD (VM1 nginx config)` 워크플로를 수동으로 실행합니다. 이 워크플로가 `nginx.conf`와 `snippets/`와 `docker-compose.yml`을 함께 올리기 때문에, 포트 게시 변경이 설정 조각과 같은 시점에 반영됩니다. 포트 목록이 바뀌었으므로 `vm1-apply-nginx.sh`는 reload가 아니라 컨테이너 재생성으로 처리하며, 이 과정에서 수 초 동안 요청이 끊깁니다.
2. 워크플로의 오리진 스모크 테스트가 통과하는지 확인합니다. 이 단계는 VM1 안에서 실행되므로 `http://127.0.0.1:8080/stub_status`를 직접 확인할 수 있습니다. 상태 코드 200과 첫 줄의 `Active connections`, 그리고 8080번 포트가 loopback에만 바인딩되어 있는지까지 함께 검사합니다.
3. VM1에서 같은 내용을 사람이 한 번 더 확인합니다.

   ```bash
   curl -s http://127.0.0.1:8080/stub_status
   ss -lnt | grep 8080
   ```

4. baedalus의 `install-nginx-exporter.sh`를 VM1에 설치하고, `curl -s http://10.0.1.133:9113/metrics | grep -m1 nginx_up`의 값이 1인지 확인합니다. 설치 절차와 방화벽 규칙은 baedalus의 `monitoring/remote-exporters/README.md`에 정리되어 있습니다.

## 캐시 정책과 보안 헤더

Nginx의 `add_header`는 하위 location이 자신의 `add_header`를 선언하는 순간 상위에서 물려받던 보안 헤더를 모두 잃습니다. 그래서 캐시 정책을 설정하는 location마다 해당 vhost의 보안 헤더 조각을 함께 include하고 있습니다.

이 설정의 변경 이력과 검증 절차, 아직 반영하지 않은 항목은 [nginx-baseline.md](nginx-baseline.md)에 자세히 기록되어 있습니다. 운영 적용 절차는 같은 문서의 6절에 정리되어 있습니다.
