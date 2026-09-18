# Bantheon

Bantheon은 BNGdrasil 인프라의 VM1(프런트엔드 VM)이 담당하는 정적 사이트와 Nginx 리버스 프록시 구성을 담은 저장소다. 공개 포트폴리오 사이트, 관리자 콘솔, 그리고 VM2에서 실행되는 Bifrost/Bidar/Grafana 등으로 향하는 프록시 설정이 여기에 모여 있다.

## 1. 이 저장소가 맡는 역할

VM1은 도메인별로 다음 요청을 처리한다.

| 도메인 | 처리 방식 |
|---|---|
| `bnbong.com`, `www.bnbong.com`, `dashboard.bnbong.com` | `client/` 빌드 결과를 정적으로 서비스하는 공개 포트폴리오 사이트 |
| `admin.bnbong.com` | `admin/` 빌드 결과를 정적으로 서비스하는 관리자 콘솔. `/admin/api/`는 Bifrost 게이트웨이로 프록시한다 |
| `api.bnbong.com` | Bifrost 게이트웨이(`/`)와 Bidar 인증 서버(`/auth`)로 프록시한다 |
| `monitoring.bnbong.com` | Grafana로 프록시한다 |
| `ambiw.bnbong.com`, `overlock.bnbong.com` | 다른 저장소가 만든 정적 산출물을 서비스하고, 필요한 API 경로만 VM2로 프록시한다 |

이 저장소는 client와 admin의 소스코드는 직접 소유하지만, ambiw와 overlock의 정적 파일은 소유하지 않는다. 두 서비스는 각자의 저장소에서 빌드되며, VM1에는 `/opt/bnbong/ambiw`와 `/opt/bnbong/overlock` 경로로 이미 만들어진 결과물만 마운트된다.

## 2. 디렉터리 구조

```
bantheon/
├── client/                # 공개 포트폴리오 사이트 (React + Vite)
├── admin/                 # 관리자 콘솔 (React + Vite + React Query)
├── nginx/
│   ├── nginx.conf         # VM1 Nginx 운영 설정
│   └── snippets/          # 여러 vhost가 공유하는 include 조각
├── docs/
│   └── nginx-baseline.md  # 운영 Nginx 기준선 정리 이력과 적용 절차
├── scripts/               # VM1에서 실행하는 배포 스크립트
├── docker-compose.yml     # VM1에서 Nginx 컨테이너를 띄우는 Compose 파일
└── README.md
```

`client/dist`와 `admin/dist`는 이 저장소가 빌드한 결과물이고, `/opt/bnbong/ambiw`와 `/opt/bnbong/overlock`은 다른 저장소가 만든 결과물이다. `docker-compose.yml`의 볼륨 마운트 목록을 보면 이 소유 구분을 그대로 확인할 수 있다.

## 3. 관리자 콘솔

관리자 콘솔은 로그인 후 다섯 개 화면으로 구성된다. 회원가입 기능은 없으며, 계정은 관리자 이상 권한을 가진 사용자만 만들 수 있다.

| 화면 | 파일 | 호출하는 Bifrost 관리자 API |
|---|---|---|
| 운영 개요 | `admin/src/pages/DashboardPage.tsx` | `GET /admin/api/settings/stats/overview`, `GET /admin/api/services` |
| 서비스 | `admin/src/pages/ServicesPage.tsx` | `GET /admin/api/services`, `GET /admin/api/services/stats`, `POST /admin/api/services`, `POST /admin/api/services/reload`, `POST /admin/api/services/health-check-all` |
| 사용자 | `admin/src/pages/UsersPage.tsx` | `GET /admin/api/users/`, `POST /admin/api/users/`, `PATCH /admin/api/users/{id}`, `PUT /admin/api/users/{id}/activate`, `PUT /admin/api/users/{id}/deactivate`, `DELETE /admin/api/users/{id}` |
| 관측 | `admin/src/pages/ObservabilityPage.tsx` | `GET /admin/api/services`만 호출하며, 나머지는 Grafana로 이동하는 링크로 처리한다 |
| 운영 설정 | `admin/src/pages/SettingsPage.tsx` | `GET /admin/api/settings/` (읽기 전용) |

이 API 경로들의 타입 정의와 호출 함수는 `admin/src/services/api.ts`에 모여 있다.

### 권한 경계

`admin/src/services/api.ts`가 정의하는 역할 순서는 `user < moderator < admin < super_admin`이다. 화면에서는 이 순서를 다음과 같이 사용한다.

- `admin` 이상은 사용자 목록을 조회하고, 서비스와 계정의 활성/비활성 상태를 바꿀 수 있다.
- `super_admin`만 계정을 새로 만들거나 역할을 바꾸거나 삭제할 수 있다.

이 화면단 권한 확인은 사용자 경험을 위한 것일 뿐이며, 실제 검증은 매 요청마다 Bifrost 게이트웨이와 Bidar 인증 서버가 다시 수행한다. 마지막 남은 최고 관리자 계정을 삭제하려는 요청은 인증 서버가 거절하며, 이 판단을 프런트엔드가 대신하지 않는다.

### 인증 흐름

인증에는 access 토큰과 refresh 토큰을 함께 사용한다. `/auth/refresh` 요청만 refresh 토큰을 실어 보내고, 그 밖의 모든 요청은 access 토큰을 사용한다. access 토큰이 401로 거절되면 `refreshAccessToken()`이 한 번만 조용히 갱신을 시도하고, 그 시도마저 실패하면 로그인 화면으로 돌려보낸다. 403은 로그인 화면으로 보내지 않고 화면 안에서 권한 부족 안내를 보여준다. 이 흐름 전체는 `admin/src/services/api.ts`의 인터셉터가 구현한다.

### 상태 표시 원칙

관리자 콘솔은 수집하지 않은 값을 0으로 채우지 않는다. `OverviewStats`의 `users`, `api_requests`, `system` 필드는 게이트웨이가 애초에 제공하지 않는 값이라 타입 자체가 `null`이고, 화면은 이를 "미수집"으로 표시한다. 또한 각 화면은 마지막으로 데이터를 받아온 시각을 함께 보여주며, 90초 넘게 갱신되지 않으면 오래된 값임을 표시한다. 이 규칙은 `admin/src/components/StatusPanel.tsx`와 `admin/src/lib/datetime.ts`가 구현한다.

## 4. 로컬 개발

Node.js 22 이상이 필요하다.

```bash
cd admin   # 또는 client
npm ci
npm run dev -- --host
```

`admin/.env.local`에 로컬 환경 변수를 둔다. 형식은 `admin/env.example`을 따른다.

```bash
# Bidar 인증 서버로 직접 요청을 보낼 주소
VITE_API_BASE_URL=http://localhost:8001

# Bifrost 게이트웨이가 중계하는 관리자 API 주소
VITE_ADMIN_API_BASE_URL=http://localhost:8000/admin/api

# 관측 화면이 링크만 거는 Grafana 주소
VITE_GRAFANA_URL=https://monitoring.bnbong.com
```

BNGdrasil 루트 워크스페이스에서 백엔드까지 함께 띄우려면, 루트의 `docker-compose.yml`이 제공하는 `ui` 프로필을 사용한다.

```bash
docker compose --profile ui up -d
```

이 프로필은 `local/nginx.local.conf`를 사용하는 Nginx 컨테이너를 `127.0.0.1:8080`에 띄운다. `api.localhost:8080`은 컨테이너로 뜬 Bifrost 게이트웨이로 프록시되고, `admin.localhost:8080`은 호스트에서 직접 실행 중인 admin Vite 개발 서버(`host.docker.internal:5174`)로 프록시된다. 따라서 이 ingress를 쓰려면 `admin/` 디렉터리에서 `npm run dev -- --host`를 먼저 실행해 두어야 한다.

## 5. 빌드와 배포

### 5.1 CI

`.github/workflows/build.yml`은 `client`와 `admin` 각각에 대해 `npm ci`와 `npm run build`를 실행하고, 빌드 결과를 커밋 SHA가 붙은 이름(`client-dist-<sha>`, `admin-dist-<sha>`)의 GitHub Actions 아티팩트로 업로드한다. 이 이름 규칙 덕분에 배포한 결과물을 커밋 단위로 식별할 수 있다.

### 5.2 배포 워크플로 두 가지

VM1 배포는 서로 성격이 다른 두 워크플로로 나누어져 있다.

| 워크플로 | 실행 조건 | 하는 일 |
|---|---|---|
| `.github/workflows/deploy.yml` | `main` 브랜치 push, 그리고 수동 실행 | `client`와 `admin`을 빌드해 VM1의 `/opt/bnbong/releases/<sha>/<app>/`으로 전송한 뒤, `scripts/vm1-release-static.sh`로 `/opt/bnbong/<app>/dist/`에 반영한다 |
| `.github/workflows/deploy-nginx.yml` | 수동 실행만 | `nginx/nginx.conf`, `nginx/snippets/`, `docker-compose.yml`을 staging 경로로 전송한 뒤, `scripts/vm1-apply-nginx.sh`로 선검증과 적용을 수행한다 |

두 워크플로는 `vm1-deploy`라는 같은 concurrency 그룹을 사용하므로, VM1의 같은 경로를 동시에 고치는 실행이 겹치지 않는다. 두 워크플로 모두 `production` environment를 거치기 때문에, 저장소 설정에서 승인자를 지정하면 배포 전에 검토 단계를 둘 수 있다.

정적 배포에는 컨테이너 재시작이 필요하지 않다. Nginx 컨테이너가 `/opt/bnbong/client/dist`와 `/opt/bnbong/admin/dist`를 bind mount 하고 있고, 배포는 그 경로의 내용만 바꾸기 때문이다. 반면 Nginx 설정 배포는 mount 목록이 바뀔 수 있어서 컨테이너를 재생성하고 `nginx -t` 검사를 거쳐 reload까지 수행한다. 그 순서는 `docs/nginx-baseline.md`의 6절(운영 적용 절차)에 정리되어 있다.

### 5.3 서버 측 스크립트

`scripts/` 디렉터리의 두 스크립트는 VM1에서 실행되는 것을 전제로 작성되었다.

| 스크립트 | 역할 |
|---|---|
| `vm1-release-static.sh <client\|admin> <release_dir>` | 전송된 릴리스를 `rsync -a --delete`로 `/opt/bnbong/<app>/dist/`에 반영하고, `current-<app>`과 `previous-<app>` 심볼릭 링크를 갱신하며, `releases/<sha>/<app>` 단위로 최근 다섯 개만 남긴다. `index.html`이 없으면 반영하지 않고 실패한다 |
| `vm1-release-static.sh rollback <client\|admin>` | 해당 앱의 직전 release를 다시 `dist/`에 동기화하고 두 링크를 맞바꾼다 |
| `vm1-apply-nginx.sh` | 현재 설정 일습을 release로 보존하고, staging 디렉터리의 설정을 임시 컨테이너로 먼저 검사한 다음, 검사를 통과한 경우에만 운영 경로로 옮기고 컨테이너를 재생성한 뒤 reload한다. 운영 경로를 교체한 뒤에 실패하면 보존한 release로 자동 복원한다 |
| `vm1-apply-nginx.sh rollback [<release>]` | `nginx.conf`, `snippets/`, `docker-compose.yml`을 같은 release에서 함께 되돌리고, 컨테이너를 재생성한 다음 `nginx -t`까지 확인한다. `list` 서브커맨드로 보존 목록을 확인한다 |

두 스크립트는 `BNBONG_ROOT` 환경 변수로 배포 루트를 바꿀 수 있으므로, 운영 VM이 아닌 환경에서도 동작을 확인할 수 있다.

`vm1-release-static.sh`의 보존 정책은 앱별로 적용된다. `releases/`는 두 앱이 함께 쓰는 경로이므로, 정리 대상을 `releases/<sha>/<app>` 단위로 잡고 `current-*`이나 `previous-*` 링크가 가리키는 release는 개수와 무관하게 남긴다. 그래야 한 앱만 여러 번 배포해도 다른 앱이 현재 서비스하는 release와 그 앱의 롤백 지점이 사라지지 않는다. 앱 디렉터리를 지운 결과로 비어 버린 `releases/<sha>` 디렉터리만 함께 정리한다. 정적 파일 동기화가 중간에 실패하면 직전 release로 다시 동기화해서 `dist/`의 내용을 한 판본으로 맞춘 다음 실패로 끝낸다.

### 5.4 필요한 저장소 secret

두 워크플로는 아래 세 가지 secret을 사용한다.

| 이름 | 내용 |
|---|---|
| `VM1_HOST` | VM1의 주소 |
| `VM1_SSH_PRIVATE_KEY` | 배포 전용 SSH 개인 키 |
| `VM1_SSH_KNOWN_HOSTS` | VM1의 호스트 키. `ssh-keyscan <VM1_HOST>`로 얻은 내용을 그대로 넣는다 |

호스트 키를 secret으로 고정하는 이유는 접속할 때마다 키를 새로 신뢰하지 않기 위해서다.

### 5.5 최초 1회 준비

워크플로를 처음 사용하기 전에 VM1에서 다음 준비를 마쳐야 한다.

1. 배포 전용 SSH 공개 키를 `ubuntu` 계정의 `~/.ssh/authorized_keys`에 추가한다.
2. 릴리스를 받을 디렉터리를 만들고 `ubuntu` 소유로 둔다. 워크플로는 이 경로를 만들 때 `sudo`를 사용하지 않는다.

   ```bash
   sudo mkdir -p /opt/bnbong/releases /opt/bnbong/scripts /opt/bnbong/nginx-releases
   sudo chown -R ubuntu:ubuntu /opt/bnbong/releases
   ```

   `nginx-releases`는 `vm1-apply-nginx.sh`가 `root` 권한으로 쓰는 경로이므로 소유자를 `ubuntu`로 바꾸지 않는다.

3. 이 저장소의 `scripts/` 두 파일을 VM1의 `/opt/bnbong/scripts/`에 설치한다. 두 스크립트는 `root` 소유여야 하고, `ubuntu`가 내용을 고칠 수 없어야 한다. 그렇지 않으면 아래 sudoers 설정이 권한 상승 통로가 된다.

   ```bash
   sudo install -o root -g root -m 0755 vm1-release-static.sh /opt/bnbong/scripts/
   sudo install -o root -g root -m 0755 vm1-apply-nginx.sh    /opt/bnbong/scripts/
   sudo chown root:root /opt/bnbong/scripts
   sudo chmod 0755 /opt/bnbong/scripts
   ```

4. 두 스크립트에 한정해서 비밀번호 없이 `sudo`를 실행할 수 있도록 허용한다. 다른 명령은 허용하지 않는다.

   ```bash
   sudo tee /etc/sudoers.d/bnbong-deploy > /dev/null <<'SUDOERS'
   ubuntu ALL=(root) NOPASSWD: /opt/bnbong/scripts/vm1-release-static.sh, /opt/bnbong/scripts/vm1-apply-nginx.sh
   SUDOERS
   sudo chmod 0440 /etc/sudoers.d/bnbong-deploy
   sudo visudo -c
   ```

스크립트를 고칠 때마다 3번 설치 과정을 다시 수행해야 한다. 워크플로는 스크립트 자체를 전송하지 않고 이미 설치된 경로를 호출하기 때문이다.

### 5.6 롤백

정적 배포를 되돌릴 때는 `deploy.yml`을 수동 실행하면서 `sha` 입력에 이전 커밋 SHA를 넣는다. 워크플로는 그 커밋을 다시 checkout 해서 빌드한 다음 같은 절차로 배포한다. 과거 아티팩트를 되살리지 않고 다시 빌드하는 이유는, 아티팩트 보관 기간이 30일로 제한되어 있어 재현성이 더 높기 때문이다. 특정 앱만 되돌리려면 `apps` 입력에 `client` 또는 `admin` 하나만 넣는다.

직전 release로 즉시 되돌려야 한다면 다시 빌드할 필요가 없다. VM1에서 `sudo /opt/bnbong/scripts/vm1-release-static.sh rollback <client|admin>`을 실행하면 그 앱의 직전 release를 `dist/`에 다시 동기화하고, `current-<app>`과 `previous-<app>` 링크를 맞바꾼다. 같은 명령을 한 번 더 실행하면 원래 release로 돌아온다.

Nginx 설정을 되돌릴 때는 `vm1-apply-nginx.sh`가 보존한 release를 사용한다. 스크립트는 실행할 때마다 적용 직전의 `nginx.conf`와 `snippets/` 전체, `docker-compose.yml`, 그리고 실행 중이던 컨테이너의 이미지 digest를 `/opt/bnbong/nginx-releases/<UTC 타임스탬프>/`에 함께 남기고, 최근 다섯 개를 보존한다. 파일마다 계산한 sha256 값은 같은 디렉터리의 `manifest`에 기록한다.

```bash
sudo /opt/bnbong/scripts/vm1-apply-nginx.sh list
sudo /opt/bnbong/scripts/vm1-apply-nginx.sh rollback [<release>]
```

`rollback`은 세 구성 요소를 같은 release에서 함께 되돌린다. `snippets/`는 `rsync --delete`로 보존 시점과 정확히 같은 구성으로 맞추기 때문에, 그 뒤에 추가된 snippet이 남아서 되돌린 `nginx.conf`와 섞이는 일이 생기지 않는다. 되돌린 다음에는 컨테이너를 재생성하고 `nginx -t`로 결과를 확인한다. release 이름을 생략하면 가장 최근에 보존한 release를 사용한다.

운영 경로를 교체한 뒤에 컨테이너 재생성이나 `nginx -t`가 실패하면 스크립트가 같은 절차로 자동 복원한다. 선검증 단계에서 실패한 경우에는 운영 경로를 아직 교체하지 않았으므로 staging 디렉터리만 남기고 종료한다. 워크플로가 끝난 뒤에 smoke test나 헤더 확인에서 문제를 발견했다면 위 `rollback` 명령을 직접 실행한다.

### 5.7 배포 중 주의할 점

`rsync --delete`는 새 릴리스에 없는 파일을 지우기 때문에, 동기화가 진행되는 짧은 순간에는 이미 받아 간 `index.html`이 삭제된 asset을 요청할 수 있다. Vite 빌드는 asset 이름에 내용 해시를 붙이므로 파일 이름이 겹치지는 않지만, 배포 직전에 페이지를 연 방문자는 새로고침이 필요할 수 있다. 무중단이 필요해지면 bind mount 대상을 `current-<app>` 링크로 바꾸고 링크를 원자적으로 교체하는 방식으로 개선할 수 있다. 다만 그렇게 하려면 `docker-compose.yml`의 mount 경로를 함께 바꾸어야 한다.

## 6. Nginx 구성

`nginx/nginx.conf`는 VM1에서 실행하는 운영 Nginx 설정이고, `nginx/snippets/`는 여러 vhost가 함께 쓰는 조각을 모아 둔다.

| 조각 | 용도 |
|---|---|
| `cloudflare-real-ip.conf` | Cloudflare edge 대역을 신뢰하고 `CF-Connecting-IP`로 실제 방문자 주소를 복원한다 |
| `proxy-common.conf` | 연결 상대의 주소를 그대로 전달하는 프록시 헤더(예: admin, monitoring) |
| `proxy-common-cf.conf` | Cloudflare가 전달한 방문자 주소를 그대로 전달하는 프록시 헤더(예: api, overlock) |
| `proxy-websocket.conf` | Grafana Live처럼 WebSocket 업그레이드가 필요한 upstream용 |
| `static-immutable.conf` | 내용 해시가 붙은 Vite 빌드 asset을 1년 동안 캐시한다 |
| `static-revalidate.conf` | 이름에 해시가 없는 파일과 `index.html`을 매 요청마다 재검증한다 |
| `security-headers-deny.conf`, `security-headers-deny-hsts.conf`, `security-headers-sameorigin.conf` | vhost별로 다른 보안 헤더 조합 |

VM2(백엔드 호스트)의 실제 주소는 파일 맨 위의 `upstream` 블록 네 개(`gateway`, `auth_server`, `overlock_server`, `grafana`)에만 등장한다. VM2 주소가 바뀌면 이 블록만 고치면 되고, 그 아래의 각 `server` 블록은 upstream 이름만 참조한다.

Nginx의 `add_header`는 하위 location이 자신의 `add_header`를 선언하는 순간 상위에서 물려받던 보안 헤더를 모두 잃는다. 그래서 캐시 정책을 설정하는 location마다 해당 vhost의 보안 헤더 조각을 함께 include하고 있다. 이 설정의 변경 이력과 검증 절차, 아직 반영하지 않은 항목은 `docs/nginx-baseline.md`에 자세히 기록되어 있다.

## 7. 알려진 제한과 후속 과제

- 서비스 화면에는 등록 기능만 있고, 등록한 서비스를 수정하거나 삭제하는 UI는 아직 없다.
- 비밀번호 재설정 기능이 없다. Bidar 인증 서버가 이 기능을 제공하지 않기 때문에, 관리자 콘솔도 억지로 만들지 않았다.
- 운영 개요 화면의 인프라 이력(`DashboardPage.tsx`의 `INFRA_HISTORY`)은 검토된 정적 텍스트다. 실시간으로 OCI를 조회한 결과가 아니므로, 실제 인프라 구성이 바뀌면 이 배열도 함께 고쳐야 한다.
- 저장소 전역에 `core.autocrlf`가 `true`로 설정된 환경에서 작업하면 커밋 시점에 줄바꿈 문자가 변환되어 diff에 혼동을 줄 수 있다. `.gitattributes`로 줄바꿈 정책을 명시하는 편이 안전하다.
- `admin/package.json`에는 `lint` 스크립트가 있지만 `admin/` 안에 ESLint 설정 파일이 없다. `client/`에는 `.eslintrc.cjs`가 있으므로, 같은 설정을 admin에도 추가하는 편이 좋다.
