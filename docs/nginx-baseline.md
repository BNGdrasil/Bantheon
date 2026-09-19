# 운영 Nginx 기준선 병합 기록

이 문서는 VM1에서 실제로 동작하고 있는 Nginx 설정과 이 저장소가 관리하는 설정을 삼자 비교한 결과를 기록합니다. 비교 기준 시각은 2026-09-18 KST이며, 근거 자료는 `backups/20260918T011337+0900/vm1/` 아래에 보관된 백업입니다. 이 문서를 작성하는 동안 운영 VM에는 아무것도 적용하지 않았습니다.

## 1. 비교한 세 가지 판본

| 판본 | 출처 | 규모 |
|---|---|---|
| Git HEAD | `git show HEAD:nginx/nginx.conf` (커밋 `92b1ac1`) | 401줄 |
| 로컬 작업 트리 | 병합 직전의 `nginx/nginx.conf` | 555줄 |
| 운영 원본 | `deployment-config.tar.gz` 안의 `opt/bnbong/nginx/nginx.conf` | 557줄 |

운영 컨테이너에서 수집한 `nginx-effective.conf`(24,593 바이트)도 함께 확인했습니다. 이 파일은 `nginx -T`의 출력이며, 내용을 확인해 보면 `/etc/nginx/nginx.conf`와 `/etc/nginx/mime.types` 두 개만 읽고 있습니다. 즉 운영 Nginx에는 `conf.d`나 그 밖의 include 파일이 존재하지 않으며, 운영 원본 한 파일이 곧 전체 설정입니다.

인증서 파일(`etc/ssl/cloudflare/*`)과 컨테이너 환경 변수는 읽지 않았고, 이 문서에도 옮기지 않았습니다.

## 2. 삼자 비교 결과

### 2.1 로컬 작업 트리와 운영 원본은 사실상 같았습니다

두 파일을 줄 단위로 비교하면 차이가 두 가지밖에 없었습니다. 첫째, 작업 트리 파일의 줄바꿈이 CRLF였습니다. 둘째, 작업 트리 파일에는 마지막 줄바꿈 문자가 없었습니다. 설정 지시자는 한 줄도 다르지 않았습니다.

CRLF는 사용자가 직접 편집해서 생긴 결과가 아니라, 이 저장소의 `core.autocrlf` 설정이 `true`로 지정되어 있어서 checkout 과정에서 변환된 결과입니다. 저장소에는 `.gitattributes`가 없습니다. 따라서 Git에 기록되는 내용은 LF로 유지되며, 이 변환 자체는 운영 동작에 영향을 주지 않습니다.

결론적으로 "로컬에만 있던 변경"은 존재하지 않았습니다. 작업 트리의 미커밋 수정은 운영 원본을 그대로 가져온 결과였습니다.

### 2.2 운영 원본에만 있고 Git HEAD에는 없던 것

HEAD를 그대로 배포했다면 아래 항목이 모두 사라졌을 것입니다.

- `ambiw.bnbong.com` vhost 두 개. HTTP는 HTTPS로 301 redirect를 보내고, HTTPS는 `/usr/share/nginx/html/ambiw/current`를 root로 삼아 정적 파일을 제공합니다.
- `overlock.bnbong.com` vhost 두 개. HTTP(:80)는 Cloudflare가 TLS를 종료한 트래픽을 받고, HTTPS(:443)는 origin 인증서로 직접 종료합니다. 두 블록 모두 `/api/`를 VM2의 리더보드 서버로 프록시합니다.
- `upstream overlock_server`(`10.0.1.60:8010`) 정의.
- `application/wasm`을 gzip 대상에 추가한 항목과 `types { application/wasm wasm; }` 선언. Godot 웹 빌드가 `.wasm` 파일을 올바른 MIME 타입으로 받기 위해 필요합니다.
- 공개 client 사이트의 호스트 이름. 운영 원본은 `dashboard.bnbong.com`을 사용하고, HEAD는 `bnbong.com www.bnbong.com`을 사용합니다.

### 2.3 Git HEAD에만 있던 것

HEAD의 커밋 `afc3bde`("move to bnbong.com")가 공개 client vhost의 `server_name`을 `bnbong.com www.bnbong.com`으로 바꾸어 놓았습니다. 운영 원본에는 이 변경이 반영되어 있지 않습니다. 두 판본 사이에서 이 항목만 실제로 충돌했습니다.

### 2.4 Compose 파일

운영 VM1의 `opt/bnbong/docker-compose.yml`과 로컬 작업 트리의 `docker-compose.yml`은 완전히 같았습니다. `docker-inspect.json`의 Mounts 목록도 이 compose 파일과 일치하며, 실제로 연결된 bind mount는 다음 일곱 개입니다.

| 호스트 경로 | 컨테이너 경로 |
|---|---|
| `/opt/bnbong/nginx/nginx.conf` | `/etc/nginx/nginx.conf` |
| `/opt/bnbong/client/dist` | `/usr/share/nginx/html/client` |
| `/opt/bnbong/playground/dist` | `/usr/share/nginx/html/playground` |
| `/opt/bnbong/admin/dist` | `/usr/share/nginx/html/bifrost-admin` |
| `/opt/bnbong/ambiw` | `/usr/share/nginx/html/ambiw` |
| `/opt/bnbong/overlock` | `/usr/share/nginx/html/overlock` |
| `/etc/ssl/cloudflare` | `/etc/ssl/cloudflare` |

`playground/dist`는 mount되어 있지만 이를 root로 사용하는 vhost가 설정 파일에 없습니다. 현재는 사용되지 않는 mount로 보이며, 정리 여부는 별도로 판단해야 합니다.

## 3. 이번에 반영한 변경

운영 원본을 기준선으로 삼고, 아래 항목만 추가로 정리했습니다. 정리 전후의 지시자 집합을 include까지 펼쳐서 비교했으며, 아래에 적은 것 외의 차이는 발생하지 않았습니다.

### 3.1 도메인 병합

공개 client vhost의 `server_name`을 `bnbong.com www.bnbong.com dashboard.bnbong.com`으로 합쳤습니다. HEAD가 의도한 apex 도메인 전환을 반영하면서도, 운영에서 실제로 서비스되고 있는 `dashboard.bnbong.com`을 계속 받아들이도록 남겨 두었습니다. 기존 주소를 제거하면 회귀가 발생하므로 교체하지 않고 추가했습니다.

### 3.2 공통 설정을 include로 추출

`nginx/snippets/` 디렉터리를 새로 만들고 반복되던 지시자를 옮겼습니다. `conf.d`가 아니라 `snippets`라는 이름을 쓴 이유는, 이 파일들이 `location` 안에서 명시적으로 include되는 조각이지 자동으로 읽히는 독립 설정이 아니기 때문입니다.

| 파일 | 내용 | 사용하는 위치 |
|---|---|---|
| `cloudflare-real-ip.conf` | Cloudflare 대역과 `real_ip_header` | `http` 블록 |
| `proxy-common.conf` | `$remote_addr` 계열 프록시 헤더와 timeout | admin `/admin/api/`, monitoring |
| `proxy-common-cf.conf` | `$http_cf_connecting_ip` 계열 프록시 헤더와 timeout | api, overlock |
| `proxy-websocket.conf` | Grafana Live를 위한 연결 upgrade | monitoring |
| `static-immutable.conf` | 해시가 붙은 asset의 1년 캐시 | client, admin, ambiw의 `/assets/` |
| `static-revalidate.conf` | 해시가 없는 파일의 재검증 | client, admin, ambiw |
| `security-headers-deny.conf` | HTTP vhost용 보안 헤더 3종 | client, api, admin의 :80 |
| `security-headers-deny-hsts.conf` | HTTPS vhost용 보안 헤더 3종과 HSTS | client, api, admin, overlock의 :443 |
| `security-headers-sameorigin.conf` | overlock :80의 SAMEORIGIN 조합 | overlock :80 |

프록시 헤더 조각을 하나로 합치지 않고 두 개로 나눈 이유는, 운영 설정이 vhost마다 서로 다른 헤더 값을 쓰고 있었기 때문입니다. `api`와 `overlock`은 Cloudflare가 넘겨준 `CF-Connecting-IP` 값을 그대로 전달하고, `admin`과 `monitoring`은 연결 상대의 주소를 전달합니다. 한쪽으로 통일하면 upstream이 받는 값이 달라지므로, 기준선 단계에서는 두 방식을 그대로 보존했습니다.

`overlock`의 HTTP(:80) `/api/` 블록에는 원래 timeout 지시자가 없었습니다. 여기에 `proxy-common-cf.conf`를 include하면서 timeout이 세 줄 추가되었지만, 세 값 모두 Nginx의 기본값인 60초와 같기 때문에 동작은 달라지지 않습니다.

### 3.3 Cloudflare 신뢰 대역 설정 (SEC-04)

`set_real_ip_from`으로 Cloudflare의 공식 IPv4 15개 대역과 IPv6 7개 대역을 신뢰 목록에 등록하고, `real_ip_header CF-Connecting-IP;`를 지정했습니다. 대역 목록은 2026-09-18에 https://www.cloudflare.com/ips-v4 와 https://www.cloudflare.com/ips-v6 에서 조회했으며, 조회 날짜를 설정 파일 주석에 적어 두었습니다.

이 설정을 넣기 전까지 `limit_req_zone $binary_remote_addr`은 방문자가 아니라 Cloudflare edge 서버의 주소를 기준으로 요청 수를 셌습니다. 즉 rate limit이 사실상 edge 단위로 걸려 있었습니다. 이제 `$remote_addr`이 실제 방문자 주소로 치환되므로 제한이 방문자 단위로 동작합니다. 또한 신뢰 목록 밖에서 직접 들어온 연결은 `CF-Connecting-IP` 헤더를 보내더라도 무시되기 때문에, 헤더를 위조해서 rate limit을 회피할 수 없습니다.

설정 파일에서 `limit_req_zone` 바로 앞에 배치했지만, 이는 읽기 편하도록 정한 위치일 뿐이고 순서가 동작을 좌우하지는 않습니다. real_ip 모듈은 요청을 처리하는 도중에 `$remote_addr`을 치환하며, 이 시점은 `limit_req`가 `$binary_remote_addr`을 평가하기 전입니다. 따라서 두 지시자가 설정 파일에 어떤 순서로 적혀 있든 결과는 같습니다.

다만 이 변경만으로 SEC-04가 끝나지는 않습니다. VM2의 `8000`, `8001` 포트가 여전히 외부에 열려 있다면 origin을 직접 호출하는 경로가 남아 있습니다. OCI 보안 규칙과 호스트 방화벽, Docker published port를 함께 줄이는 작업은 이 저장소 밖의 과제입니다.

### 3.4 HTTP/2 문법 통일

운영 설정은 `listen 443 ssl http2;`라는 구형 문법과 `http2 on;`이라는 신형 문법을 섞어 쓰고 있었습니다. Nginx 1.25.1부터 `listen`의 `http2` 인자는 폐기 예정으로 표시되어 경고를 출력합니다. 운영 설정에 이미 `http2 on;`이 들어 있고 그 상태로 `nginx -T`가 성공했으므로, 운영 Nginx가 1.25.1 이상임을 확인할 수 있습니다. 이에 따라 모든 HTTPS 블록을 `listen 443 ssl;`과 `http2 on;` 조합으로 통일했습니다.

### 3.5 캐시 정책 분리

기존에는 `\.(js|css|png|...)$` 확장자에 해당하는 모든 파일에 1년 `immutable`을 붙이고 있었습니다. Vite는 내용 해시가 붙은 파일만 `dist/assets/` 아래에 생성하므로, 그 밖의 위치에 있는 `favicon.ico`처럼 이름이 고정된 파일까지 1년 동안 캐시되어 재배포가 반영되지 않는 문제가 있었습니다.

이번에 다음과 같이 나누었습니다.

- `location ^~ /assets/`는 1년 `immutable`을 유지합니다. `^~`를 붙여서 아래의 정규식 location이 이 요청을 가져가지 않도록 했습니다.
- `location = /index.html`과 해시가 없는 확장자는 `expires -1;`로 처리해 매 요청마다 재검증하도록 했습니다. `expires -1`은 `Cache-Control: no-cache`를 내보내므로 `add_header`를 따로 쓰지 않았고, 그 덕분에 server 블록에서 상속되는 보안 헤더도 그대로 유지됩니다.
- client vhost에는 원래 `= /index.html` 블록이 없었으므로 새로 추가했습니다. `try_files`의 마지막 인자가 만드는 내부 redirect가 이 블록으로 들어오기 때문에 SPA fallback 응답도 재검증 대상이 됩니다.

`overlock`의 캐시 정책은 손대지 않았습니다. Godot 빌드는 파일 이름이 고정되어 있고, 운영자가 Cloudflare Purge를 전제로 7일 캐시를 의도적으로 설정해 두었기 때문입니다.

### 3.6 upstream 정리

`monitoring` vhost가 `proxy_pass http://10.0.1.60:3000;`으로 IP를 직접 적고 있었습니다. 이를 `upstream grafana` 블록으로 옮겨서, 이제 설정 파일 안에서 VM2 주소가 등장하는 곳은 파일 머리의 `upstream` 묶음 한 군데뿐입니다. VM2 주소가 바뀌면 이 묶음만 고치면 됩니다.

### 3.7 admin vhost의 SPA fallback 수정

`admin.bnbong.com`의 HTTP와 HTTPS vhost는 `try_files $uri $uri/ /index.html =404;`를 쓰고 있었습니다. Nginx의 `try_files`는 **마지막 인자만** 내부 redirect나 응답 코드로 취급하고, 그 앞의 인자는 모두 파일 존재 여부만 확인합니다. 따라서 `=404`가 마지막에 있으면 `/index.html`은 단순한 파일 검사로 처리되어 `location /` 안에서 그대로 응답합니다. 즉 `location = /index.html` 블록으로 재매칭되지 않기 때문에, 그 블록에 넣은 재검증 헤더가 SPA 딥링크 응답에 전혀 적용되지 않았습니다. 이 동작은 컨테이너를 띄워 `curl -I`로 확인했습니다.

`try_files $uri $uri/ /index.html;`로 바꾸어 `/index.html`을 마지막 인자로 만들었습니다. 이제 내부 redirect가 발생해 `location = /index.html`로 들어가고, 그 블록의 `try_files /index.html =404`가 파일이 없을 때 404를 돌려주므로 원래의 `=404` 의도도 그대로 유지됩니다. client vhost는 처음부터 `/index.html`이 마지막 인자였기 때문에 수정이 필요하지 않았습니다.

### 3.8 보안 헤더 상속 문제 수정

Nginx의 `add_header`는 하위 블록에서 `add_header`를 하나라도 선언하면 상위 블록의 선언을 **전혀 물려받지 않습니다**. 운영 원본에서 이 규칙 때문에 보안 헤더가 빠지는 경로가 있었습니다. 예를 들어 client와 admin의 정적 asset location은 `add_header Cache-Control`을 선언하고 있어서 `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, HSTS를 모두 잃었습니다. overlock의 `.wasm`/`.pck`/`.js` location도 마찬가지였습니다. 운영 원본에도 있던 결함이지만 이번에 고쳤습니다.

vhost마다 헤더 값 조합이 다르기 때문에 조합별로 조각을 만들었습니다. `security-headers-deny.conf`는 HTTP vhost가 쓰는 세 개, `security-headers-deny-hsts.conf`는 여기에 HSTS를 더한 것, `security-headers-sameorigin.conf`는 overlock의 :80이 쓰는 SAMEORIGIN과 Referrer-Policy 조합입니다. 각 vhost의 기존 헤더 값은 바꾸지 않았습니다.

server 레벨 선언은 그대로 두고 조각 include로 바꾸었으며, `add_header`를 가진 모든 location에 같은 조각을 추가로 include했습니다. `monitoring` vhost는 `X-Frame-Options SAMEORIGIN`에 HSTS까지 쓰는 고유한 조합이고 하위 location에 `add_header`가 없어서 기존 선언을 그대로 두었습니다. `ambiw` vhost는 원래 보안 헤더를 하나도 내보내지 않으므로, 값을 새로 만들지 않기 위해 조각을 넣지 않았습니다.

### 3.9 Compose mount 추가

`docker-compose.yml`의 nginx 서비스에 `./nginx/snippets:/etc/nginx/snippets:ro`를 추가했습니다. 이 mount가 없으면 include 대상 파일을 찾지 못해 컨테이너가 기동하지 않습니다.

## 4. 반영하지 않은 것

아래 항목은 개선 여지가 있다고 판단했지만 이번 기준선에는 넣지 않았습니다.

- **TLS 설정의 공통화.** `ssl_protocols`와 `ssl_ciphers`를 vhost마다 반복해서 적고 있지만, `ambiw`는 두 지시자가 모두 없고 `overlock`은 `ssl_protocols`만 있습니다. 공통 조각으로 묶으면 이 두 vhost의 실제 TLS 파라미터가 달라집니다. 동작을 보존하는 기준선을 먼저 만든다는 원칙에 따라 그대로 두었습니다.
- **보안 헤더 조합의 단일화.** 3.8절에서 조합별로 조각을 만들어 중복을 없앴지만, vhost마다 다른 값 자체는 그대로 두었습니다. `monitoring`의 `SAMEORIGIN`은 Grafana의 iframe 사용 때문이고 `overlock`의 `Referrer-Policy`도 의도된 설정으로 보이므로, 값을 하나로 맞추는 판단은 따로 해야 합니다.
- **`types { application/wasm wasm; }` 제거.** 최신 `nginx:alpine` 이미지의 `mime.types`에는 `wasm`이 이미 들어 있어서 중복 경고가 출력됩니다. 다만 VM1이 실행 중인 이미지의 `mime.types` 내용을 직접 확인하지 않았으므로 제거하지 않았습니다. 이미지 digest를 고정하는 작업과 함께 판단하는 편이 안전합니다.
- **`playground/dist` mount 제거.** 이 mount를 사용하는 vhost가 없지만, 운영자가 어떤 의도로 남겨 두었는지 확인하기 전에는 지우지 않습니다.
- **`version: '3.8'` 제거.** Compose v2는 이 키를 무시하면서 경고를 출력합니다. 운영 파일과 동일하게 유지하는 편을 우선했습니다.
- **대시보드 디자인 개편.** 별도 작업 단위입니다.

## 5. 검증

로컬에서 `nginx:alpine`(1.31.4) 컨테이너에 설정 파일과 snippets 디렉터리를 mount하고 자체 서명 더미 인증서를 연결해 문법을 검사했습니다.

```
docker run --rm \
  -v "$PWD/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD/nginx/snippets:/etc/nginx/snippets:ro" \
  -v "<dummy-cert-dir>:/etc/ssl/cloudflare:ro" \
  nginx:alpine nginx -t
```

결과는 다음과 같습니다.

```
nginx version: nginx/1.31.4
nginx: [warn] duplicate extension "wasm", content type: "application/wasm", previous content type: "application/wasm" in /etc/nginx/nginx.conf:35
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

경고는 4절에서 설명한 `types` 중복 때문에 발생하며, 운영 원본에서도 동일하게 발생하던 항목입니다.

문법 검사와 별도로, include를 펼치고 주석과 공백을 제거한 지시자 목록을 운영 원본과 비교했습니다. 3절에 적은 항목 외의 차이는 나타나지 않았습니다.

여기에 더해 실제로 컨테이너를 기동하고 더미 정적 파일을 연결한 뒤 `curl -I`로 응답 헤더를 확인했습니다. admin의 SPA 딥링크(`/services/some/deep/link`)는 `Cache-Control: no-cache`와 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`을 함께 돌려주었고, 해시 asset(`/assets/x.js`)은 `Cache-Control: public, immutable`과 같은 보안 헤더 세 개를 함께 돌려주었습니다. overlock의 `.wasm` 응답에서도 7일 캐시와 SAMEORIGIN 계열 헤더가 함께 나왔습니다.

이 확인 과정에서 `expires`와 `add_header Cache-Control`이 함께 있는 location은 `Cache-Control` 헤더를 두 줄로 내보낸다는 사실도 확인했습니다. 운영 원본에서도 동일하게 발생하던 현상이고, 두 값이 서로 모순되지 않아 동작에 문제는 없습니다. 정리 여부는 별도로 판단합니다.

## 6. 운영 적용 절차

아직 운영에 적용하지 않았습니다. 적용할 때는 다음 순서를 권장합니다.

1. VM1에서 현재 설정 일습을 release 하나로 보존합니다. `scripts/vm1-apply-nginx.sh`가 이 작업을 수행하며, `/opt/bnbong/nginx-releases/<UTC 타임스탬프>/` 아래에 `nginx.conf`와 `snippets/` 디렉터리 전체, `docker-compose.yml`, 그리고 실행 중이던 nginx 컨테이너의 이미지 digest를 함께 남깁니다. 같은 디렉터리의 `manifest` 파일에는 보존한 파일마다 계산한 sha256 값과 이미지 digest를 기록하므로, 나중에 보존본이 손상되지 않았는지 확인할 수 있습니다. 최근 다섯 개를 남기고 그보다 오래된 release는 삭제합니다.

   파일을 하나씩 백업하는 방식은 두 번째 배포부터 통하지 않습니다. 첫 전환 이후에는 이전 `nginx.conf`도 snippet을 include하기 때문에, 설정 파일 하나만 되돌리면 그 파일이 새 snippet을 읽게 됩니다. 세 구성 요소를 같은 release에 묶어 두어야 이 문제를 피할 수 있습니다.
2. 새 설정 일습을 운영 경로가 아니라 staging 디렉터리 `/opt/bnbong/nginx.next/`에 먼저 올립니다. `nginx.conf`와 `snippets/` 디렉터리 전체를 함께 올려야 include 대상이 빠지지 않습니다.
3. staging 내용을 임시 컨테이너로 선검증합니다. 실제 배포와 같은 mount 구성을 그대로 재현해야 하므로 인증서 디렉터리까지 연결합니다.

   ```bash
   docker run --rm \
     -v /opt/bnbong/nginx.next/nginx.conf:/etc/nginx/nginx.conf:ro \
     -v /opt/bnbong/nginx.next/snippets:/etc/nginx/snippets:ro \
     -v /etc/ssl/cloudflare:/etc/ssl/cloudflare:ro \
     nginx:alpine nginx -t
   ```

   이 검사를 통과한 경우에만 다음 단계로 넘어갑니다. 실패하면 운영 경로를 건드리지 않은 상태이므로 staging 파일만 고치고 다시 검사하면 됩니다.
4. 검증을 통과한 설정을 운영 경로로 옮깁니다. `snippets/`를 `/opt/bnbong/nginx/snippets/`에 먼저 배치하고, 그다음에 `nginx.conf`를 `/opt/bnbong/nginx/nginx.conf`에 배치합니다. 순서를 지켜야 include 대상이 없는 상태로 설정 파일이 먼저 놓이는 구간이 생기지 않습니다.
5. `docker-compose.yml`에 snippets mount를 반영하고 `docker compose up -d`로 컨테이너를 재생성합니다. mount 목록이 바뀌었기 때문에 `reload`만으로는 반영되지 않습니다.
6. 컨테이너 안에서 `docker compose exec nginx nginx -t`로 문법을 다시 검사합니다. 3번은 파일 내용을, 이 단계는 실제 mount가 연결된 상태를 확인합니다.
7. 검사를 통과하면 `docker compose exec nginx nginx -s reload`로 적용합니다.
8. 여섯 개 도메인(`bnbong.com`, `api`, `admin`, `monitoring`, `ambiw`, `overlock`)에 대해 HTTP와 HTTPS 응답, SPA 경로 직접 접근, 존재하지 않는 정적 파일의 404, Grafana WebSocket 연결, `Cache-Control` 헤더를 확인합니다. `dashboard.bnbong.com`도 계속 응답하는지 함께 확인합니다.

   이 확인은 VM1 안에서 수행해야 하며, 공개 URL을 밖에서 호출한 결과로 판정하면 안 됩니다. `--resolve`로 이름 해석을 루프백에 고정하면 Cloudflare를 거치지 않고 Nginx에 직접 요청할 수 있습니다. 인증서가 Cloudflare origin certificate라서 공개 CA 체인으로는 검증되지 않으므로 `-k`를 함께 씁니다.

   ```bash
   curl -sk -o /dev/null -w '%{http_code}\n' \
     --resolve admin.bnbong.com:443:127.0.0.1 https://admin.bnbong.com/
   ```

   `monitoring.bnbong.com`은 Grafana가 익명 접근을 허용하지 않으면 로그인 화면으로 넘기므로 200과 302를 모두 정상으로 봅니다. `api.bnbong.com`은 루트 대신 `/health`를 확인합니다.
9. 헤더 회귀를 별도로 확인합니다. admin의 SPA 딥링크(예: `/users`)가 200과 함께 `Cache-Control: no-cache`, `X-Frame-Options`, `X-Content-Type-Options`를 돌려주는지, `admin.bnbong.com/assets/<해시파일>`이 `immutable`과 보안 헤더를 함께 돌려주는지 봅니다. `overlock.bnbong.com/index.wasm`의 보안 헤더도 확인합니다. admin의 SPA fallback 경로가 이번에 바뀌었으므로 이 확인을 건너뛰지 않습니다.

   ```bash
   curl -sk -o /dev/null -D - \
     --resolve admin.bnbong.com:443:127.0.0.1 https://admin.bnbong.com/users
   ```

   헤더 확인이야말로 오리진에서 수행해야 하는 대표적인 검사입니다. GitHub 러너는 데이터센터 대역의 주소를 쓰기 때문에 Cloudflare가 봇으로 판단해 `HTTP 403`과 `cf-mitigated: challenge` 헤더를 가진 챌린지 페이지를 돌려줄 수 있는데, 그 응답은 오리진까지 도달하지 않았으므로 Nginx가 붙인 헤더를 전혀 담고 있지 않습니다. 2026-09-19의 `deploy-nginx.yml` 실행에서 실제로 이 일이 벌어졌습니다. 오리진은 정상이었는데도 러너가 받은 챌린지 페이지에 `Cache-Control: no-cache`가 없어서 워크플로가 헤더 회귀로 오판하고 롤백을 안내했습니다. 그 뒤로 워크플로는 SSH로 VM1에 접속해서 위와 같은 방식으로 판정하고, 러너에서의 공개 URL 확인은 참고용 경고로만 남깁니다.
10. 문제가 생기면 같은 release에서 세 구성 요소를 함께 되돌립니다.

    ```bash
    sudo /opt/bnbong/scripts/vm1-apply-nginx.sh list
    sudo /opt/bnbong/scripts/vm1-apply-nginx.sh rollback [<release>]
    ```

    `rollback`은 `nginx.conf`와 `docker-compose.yml`을 보존 시점의 내용으로 되돌리고, `snippets/`는 `rsync --delete`로 보존 시점과 정확히 같은 구성으로 맞춘 다음, 컨테이너를 재생성하고 컨테이너 안에서 `nginx -t`를 실행해 결과를 확인합니다. release 이름을 생략하면 가장 최근에 보존한 release를 사용합니다. 되돌리기 전에는 manifest에 기록된 sha256 값과 실제 파일을 대조하므로, 보존본이 손상되었다면 운영 경로를 건드리지 않고 멈춥니다.

11. 자동 복원 범위를 구분해 두었습니다. 3번의 선검증에서 실패하면 운영 경로를 아직 교체하지 않은 상태이므로 스크립트가 그대로 종료하고, staging 디렉터리를 남겨 원인을 확인하게 합니다. 4번 이후, 즉 운영 경로를 교체한 다음에 컨테이너 재생성이나 `nginx -t`, `reload`가 실패하면 스크립트가 이번 실행 직전에 보존한 release로 자동 복원하고 `nginx -t`까지 확인한 다음, 종료 상태 1로 끝냅니다. 8번과 9번의 오리진 확인에서 문제를 발견한 경우처럼 스크립트가 끝난 뒤에 되돌려야 한다면 10번의 `rollback`을 직접 실행합니다. 러너에서 관측한 공개 경로 응답만 이상한 경우에는 되돌리지 않고, Cloudflare와 DNS 설정을 먼저 확인합니다.

위 순서의 서버 측 구현은 `scripts/vm1-apply-nginx.sh` 하나에 모여 있습니다. `.github/workflows/deploy-nginx.yml` 워크플로와 `bngdrasil/deploy_vm1.sh`는 모두 파일을 staging 경로에 올린 다음 이 스크립트를 호출합니다. 두 진입점이 같은 구현을 사용하기 때문에 실패했을 때의 복원 동작도 서로 같습니다.

## 7. 남은 위험

- `bnbong.com`과 `www.bnbong.com`의 DNS가 실제로 VM1을 가리키는지 확인하지 않았습니다. 가리키지 않는다면 이번에 추가한 `server_name`은 아무 트래픽도 받지 않으며, 그 자체로 장애를 만들지는 않습니다.
- Cloudflare IP 대역은 변경될 수 있습니다. 목록을 주기적으로 갱신하는 절차가 아직 없습니다.
- `real_ip` 적용 이후에는 access log의 첫 필드가 Cloudflare edge 주소가 아니라 방문자 주소로 바뀝니다. 로그를 파싱하는 도구가 있다면 영향을 확인해야 합니다.
- `expires -1`로 바뀐 경로는 재검증 요청이 origin까지 도달하므로 요청 수가 늘어납니다. Cloudflare의 캐시 규칙과 함께 확인하는 편이 좋습니다.
- 3.8절에서 정적 asset 응답에 보안 헤더가 새로 붙습니다. 특히 HSTS가 붙는 경로가 늘어나므로, 서브도메인 중 HTTPS를 제공하지 않는 곳이 있는지 확인해야 합니다. 현재 설정의 모든 vhost는 Cloudflare 뒤에서 HTTPS를 제공하므로 문제가 없다고 보지만, 새 서브도메인을 추가할 때 다시 확인할 항목입니다.
- `add_header`에 `always`가 없는 vhost에서는 404 같은 오류 응답에 보안 헤더가 붙지 않습니다. 운영 원본의 동작을 그대로 유지했기 때문이며, `always`를 붙이는 변경은 별도로 판단합니다.
