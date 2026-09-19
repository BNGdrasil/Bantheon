# 빌드와 배포

CI와 VM1 배포 워크플로, 서버 측 스크립트, 필요한 secret, 롤백 절차, smoke test의 판정 기준을 정리합니다.

## CI

`.github/workflows/build.yml`은 `main`과 `dev` 브랜치를 대상으로 하는 pull request와 push에서 실행됩니다. `client`와 `admin` 각각에 대해 `npm ci`와 `npm run build`를 실행하고, 빌드 결과를 커밋 SHA가 붙은 이름(`client-dist-<sha>`, `admin-dist-<sha>`)의 GitHub Actions 아티팩트로 업로드합니다. 아티팩트 보관 기간은 30일입니다. 이 이름 규칙 덕분에 배포한 결과물을 커밋 단위로 식별할 수 있습니다.

## 배포 워크플로 두 가지

VM1 배포는 성격이 서로 다른 두 워크플로로 나누어져 있습니다.

| 워크플로 | 실행 조건 | 하는 일 |
|---|---|---|
| `.github/workflows/deploy.yml` | `main` 브랜치 push, 그리고 수동 실행 | `client`와 `admin`을 빌드해 VM1의 `/opt/bnbong/releases/<sha>/<app>/`으로 전송한 다음, `scripts/vm1-release-static.sh`로 `/opt/bnbong/<app>/dist/`에 반영합니다 |
| `.github/workflows/deploy-nginx.yml` | 수동 실행만 | `nginx/nginx.conf`, `nginx/snippets/`, `docker-compose.yml`을 staging 경로로 전송한 다음, `scripts/vm1-apply-nginx.sh`로 선검증과 적용을 수행합니다 |

두 워크플로는 `vm1-deploy`라는 같은 concurrency 그룹을 사용하므로, VM1의 같은 경로를 동시에 고치는 실행이 겹치지 않습니다. 두 워크플로 모두 `production` environment를 거치기 때문에, 저장소 설정에서 승인자를 지정하면 배포 전에 검토 단계를 둘 수 있습니다.

정적 배포에는 컨테이너 재시작이 필요하지 않습니다. Nginx 컨테이너가 `/opt/bnbong/client/dist`와 `/opt/bnbong/admin/dist`를 bind mount 하고 있고, 배포는 그 경로의 내용만 바꾸기 때문입니다. 반면 Nginx 설정 배포는 mount 목록이 바뀔 수 있어서 컨테이너를 재생성하고 `nginx -t` 검사를 거쳐 reload까지 수행합니다. 그 순서는 [nginx-baseline.md](nginx-baseline.md)의 6절에 정리되어 있습니다.

## 서버 측 스크립트

`scripts/` 디렉터리의 두 스크립트는 VM1에서 실행하는 것을 전제로 작성되었습니다.

| 스크립트 | 역할 |
|---|---|
| `vm1-release-static.sh <client\|admin> <release_dir>` | 전송된 릴리스를 `rsync -a --delete`로 `/opt/bnbong/<app>/dist/`에 반영하고, `current-<app>`과 `previous-<app>` 심볼릭 링크를 갱신하며, `releases/<sha>/<app>` 단위로 최근 다섯 개만 남깁니다. `index.html`이 없으면 반영하지 않고 실패합니다 |
| `vm1-release-static.sh rollback <client\|admin>` | 해당 앱의 직전 release를 다시 `dist/`에 동기화하고 두 링크를 맞바꿉니다 |
| `vm1-apply-nginx.sh` | 현재 설정 일습을 release로 보존하고, staging 디렉터리의 설정을 임시 컨테이너로 먼저 검사한 다음, 검사를 통과한 경우에만 운영 경로로 옮기고 컨테이너를 재생성한 뒤 reload합니다. 운영 경로를 교체한 다음에 실패하면 보존한 release로 자동 복원합니다 |
| `vm1-apply-nginx.sh rollback [<release>]` | `nginx.conf`, `snippets/`, `docker-compose.yml`을 같은 release에서 함께 되돌리고, 컨테이너를 재생성한 다음 `nginx -t`까지 확인합니다. `list` 서브커맨드로 보존 목록을 확인합니다 |

두 스크립트는 `BNBONG_ROOT` 환경 변수로 배포 루트를 바꿀 수 있으므로, 운영 VM이 아닌 환경에서도 동작을 확인할 수 있습니다. 보존 개수는 `KEEP_RELEASES`와 `KEEP_NGINX_RELEASES` 환경 변수로 조정하며, 기본값은 둘 다 5입니다.

`vm1-release-static.sh`의 보존 정책은 앱별로 적용됩니다. `releases/`는 두 앱이 함께 쓰는 경로이므로, 정리 대상을 `releases/<sha>/<app>` 단위로 잡고 `current-*`이나 `previous-*` 링크가 가리키는 release는 개수와 무관하게 남깁니다. 그래야 한 앱만 여러 번 배포해도 다른 앱이 현재 서비스하는 release와 그 앱의 롤백 지점이 사라지지 않습니다. 앱 디렉터리를 지운 결과로 비어 버린 `releases/<sha>` 디렉터리만 함께 정리합니다. 정적 파일 동기화가 중간에 실패하면 직전 release로 다시 동기화해서 `dist/`의 내용을 한 판본으로 맞춘 다음 실패로 끝냅니다.

## 필요한 저장소 secret

두 워크플로는 아래 세 가지 secret을 사용합니다.

| 이름 | 내용 |
|---|---|
| `VM1_HOST` | VM1의 주소입니다 |
| `VM1_SSH_PRIVATE_KEY` | 배포 전용 SSH 개인 키입니다 |
| `VM1_SSH_KNOWN_HOSTS` | VM1의 호스트 키입니다. `ssh-keyscan <VM1_HOST>`로 얻은 내용을 그대로 넣습니다 |

호스트 키를 secret으로 고정하는 이유는 접속할 때마다 키를 새로 신뢰하지 않기 위해서입니다.

## 최초 1회 준비

워크플로를 처음 사용하기 전에 VM1에서 다음 준비를 마쳐야 합니다.

1. 배포 전용 SSH 공개 키를 `ubuntu` 계정의 `~/.ssh/authorized_keys`에 추가합니다.
2. 릴리스를 받을 디렉터리를 만들고 `ubuntu` 소유로 둡니다. 워크플로는 이 경로를 만들 때 `sudo`를 사용하지 않습니다.

   ```bash
   sudo mkdir -p /opt/bnbong/releases /opt/bnbong/scripts /opt/bnbong/nginx-releases
   sudo chown -R ubuntu:ubuntu /opt/bnbong/releases
   ```

   `nginx-releases`는 `vm1-apply-nginx.sh`가 `root` 권한으로 쓰는 경로이므로 소유자를 `ubuntu`로 바꾸지 않습니다.

3. 이 저장소의 `scripts/` 두 파일을 VM1의 `/opt/bnbong/scripts/`에 설치합니다. 두 스크립트는 `root` 소유여야 하고, `ubuntu`가 내용을 고칠 수 없어야 합니다. 그렇지 않으면 아래 sudoers 설정이 권한 상승 통로가 됩니다.

   ```bash
   sudo install -o root -g root -m 0755 vm1-release-static.sh /opt/bnbong/scripts/
   sudo install -o root -g root -m 0755 vm1-apply-nginx.sh    /opt/bnbong/scripts/
   sudo chown root:root /opt/bnbong/scripts
   sudo chmod 0755 /opt/bnbong/scripts
   ```

4. 두 스크립트에 한정해서 비밀번호 없이 `sudo`를 실행할 수 있도록 허용합니다. 다른 명령은 허용하지 않습니다.

   ```bash
   sudo tee /etc/sudoers.d/bnbong-deploy > /dev/null <<'SUDOERS'
   ubuntu ALL=(root) NOPASSWD: /opt/bnbong/scripts/vm1-release-static.sh, /opt/bnbong/scripts/vm1-apply-nginx.sh
   SUDOERS
   sudo chmod 0440 /etc/sudoers.d/bnbong-deploy
   sudo visudo -c
   ```

스크립트를 고칠 때마다 3번 설치 과정을 다시 수행해야 합니다. 워크플로는 스크립트 자체를 전송하지 않고 이미 설치된 경로를 호출하기 때문입니다.

## 롤백

정적 배포를 되돌릴 때는 `deploy.yml`을 수동으로 실행하면서 `sha` 입력에 이전 커밋 SHA를 넣습니다. 워크플로는 그 커밋을 다시 checkout 해서 빌드한 다음 같은 절차로 배포합니다. 과거 아티팩트를 되살리지 않고 다시 빌드하는 이유는, 아티팩트 보관 기간이 30일로 제한되어 있어서 재현성이 더 높기 때문입니다. 특정 앱만 되돌리려면 `apps` 입력에 `client` 또는 `admin` 하나만 넣습니다.

직전 release로 즉시 되돌려야 한다면 다시 빌드할 필요가 없습니다. VM1에서 `sudo /opt/bnbong/scripts/vm1-release-static.sh rollback <client|admin>`을 실행하면 그 앱의 직전 release를 `dist/`에 다시 동기화하고, `current-<app>`과 `previous-<app>` 링크를 맞바꿉니다. 같은 명령을 한 번 더 실행하면 원래 release로 돌아옵니다.

Nginx 설정을 되돌릴 때는 `vm1-apply-nginx.sh`가 보존한 release를 사용합니다. 스크립트는 실행할 때마다 적용 직전의 `nginx.conf`와 `snippets/` 전체, `docker-compose.yml`, 그리고 실행 중이던 컨테이너의 이미지 digest를 `/opt/bnbong/nginx-releases/<UTC 타임스탬프>/`에 함께 남기고, 최근 다섯 개를 보존합니다. 파일마다 계산한 sha256 값은 같은 디렉터리의 `manifest`에 기록합니다.

```bash
sudo /opt/bnbong/scripts/vm1-apply-nginx.sh list
sudo /opt/bnbong/scripts/vm1-apply-nginx.sh rollback [<release>]
```

`rollback`은 세 구성 요소를 같은 release에서 함께 되돌립니다. `snippets/`는 `rsync --delete`로 보존 시점과 정확히 같은 구성으로 맞추기 때문에, 그 뒤에 추가된 snippet이 남아서 되돌린 `nginx.conf`와 섞이는 일이 생기지 않습니다. 되돌린 다음에는 컨테이너를 재생성하고 `nginx -t`로 결과를 확인합니다. release 이름을 생략하면 가장 최근에 보존한 release를 사용합니다.

운영 경로를 교체한 다음에 컨테이너 재생성이나 `nginx -t`가 실패하면 스크립트가 같은 절차로 자동 복원합니다. 선검증 단계에서 실패한 경우에는 운영 경로를 아직 교체하지 않았으므로 staging 디렉터리만 남기고 종료합니다. 워크플로가 끝난 다음에 smoke test나 헤더 확인에서 문제를 발견했다면 위 `rollback` 명령을 직접 실행합니다.

## smoke test의 판정 기준

두 배포 워크플로의 smoke test는 GitHub 러너에서 공개 URL을 호출하지 않습니다. SSH로 VM1에 접속한 다음 VM1 안에서 Nginx에 직접 요청해서 결과를 판정합니다. 요청 형태는 `curl -sk --resolve <호스트>:443:127.0.0.1 https://<호스트><경로>`이며, `--resolve`로 이름 해석을 루프백으로 고정하기 때문에 Cloudflare를 거치지 않습니다. 운영 인증서가 Cloudflare origin certificate라서 공개 CA 체인으로는 검증되지 않으므로 `-k`를 함께 사용합니다. 이 단계에서 확인하려는 대상은 인증서의 신뢰 관계가 아니라 각 vhost가 돌려주는 상태 코드와 헤더입니다.

판정을 오리진으로 옮긴 이유는 GitHub 러너가 Cloudflare의 봇 챌린지를 받을 수 있기 때문입니다. GitHub 호스티드 러너는 데이터센터 대역의 주소를 사용하므로, Cloudflare가 그 요청을 봇으로 판단하면 `HTTP 403`과 `cf-mitigated: challenge` 헤더를 가진 챌린지 페이지를 돌려줍니다. 이 응답은 오리진까지 도달하지 않은 결과이므로 Nginx가 실제로 어떤 헤더를 붙였는지 전혀 알려주지 못합니다. 그래서 러너에서 관측한 공개 경로 응답은 판정에 사용하지 않습니다.

2026-09-19의 `deploy-nginx.yml` 실행이 실제로 이 문제를 겪었습니다. Nginx 적용은 정상이었고 VM1에서 오리진을 직접 확인하면 `admin.bnbong.com`의 딥링크가 `200`과 `Cache-Control: no-cache`를 함께 돌려주었는데, 러너가 받은 챌린지 페이지에는 그 헤더가 없어서 워크플로가 헤더 회귀로 오판하고 롤백을 안내했습니다.

각 도메인에 기대하는 응답은 다음과 같습니다. `deploy-nginx.yml`은 `bnbong.com`과 `www`, `dashboard`, `admin`, `ambiw`, `overlock`의 루트에서 200을, `api`의 `/health`에서 200을, `monitoring`의 루트에서 200 또는 302를 기대합니다. `monitoring`이 302를 허용하는 이유는 Grafana가 익명 접근을 허용하지 않을 때 로그인 화면으로 넘기기 때문입니다. 이어서 admin의 SPA 딥링크 `/users`가 200과 함께 `Cache-Control: no-cache`, `X-Frame-Options`, `X-Content-Type-Options`를 모두 돌려주는지 확인합니다. `deploy.yml`은 이번에 배포한 앱의 루트가 200인지, 그 응답에 `Cache-Control: no-cache`가 있는지, 그리고 `index.html`이 참조하는 `/assets/*.js` 경로 하나를 실제로 받아 보아 200인지 확인합니다. 마지막 확인은 오래된 `index.html`이 남아 있거나 asset 동기화가 빠진 상태를 잡아내기 위한 절차입니다.

러너에서 수행하는 공개 URL 확인도 그대로 남겨 두었지만, 그 결과는 참고 정보이며 배포를 실패시키지 않습니다. 응답에 `cf-mitigated: challenge`가 있거나 403이면 챌린지 때문에 공개 경로를 확인하지 못했다는 경고만 남기고 넘어갑니다. 5xx가 돌아오면 경고와 함께 job summary에도 기록합니다. 오리진이 정상인 상태에서 관측된 5xx는 이번 배포가 아니라 Cloudflare나 DNS 쪽 문제일 가능성이 크므로 사람이 판단해야 하기 때문입니다. 롤백 안내도 오리진 확인이 실패한 경우에만 출력합니다.

## 배포 중 주의할 점

`rsync --delete`는 새 릴리스에 없는 파일을 지우기 때문에, 동기화가 진행되는 짧은 순간에는 이미 받아 간 `index.html`이 삭제된 asset을 요청할 수 있습니다. Vite 빌드는 asset 이름에 내용 해시를 붙이므로 파일 이름이 겹치지는 않지만, 배포 직전에 페이지를 연 방문자는 새로고침이 필요할 수 있습니다. 무중단이 필요해지면 bind mount 대상을 `current-<app>` 링크로 바꾸고 링크를 원자적으로 교체하는 방식으로 개선할 수 있습니다. 다만 그렇게 하려면 `docker-compose.yml`의 mount 경로를 함께 바꾸어야 합니다.
