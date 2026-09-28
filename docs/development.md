# 로컬 개발

`client/`와 `admin/`을 로컬에서 실행하는 방법과 환경 변수, 빌드 명령, 현재 알려진 제한을 정리합니다.

## 개발 서버 실행

Node.js 22 이상이 필요합니다.

```bash
cd admin   # 또는 client
npm ci
npm run dev -- --host
```

## 환경 변수

`admin/.env.local`에 로컬 환경 변수를 둡니다. 형식은 `admin/env.example`을 따릅니다. 값을 지정하지 않으면 `admin/src/services/api.ts`가 운영 주소(`https://api.bnbong.com`)를 기본값으로 사용합니다.

```bash
# 인증(/auth/*)과 게이트웨이 준비 상태(/ready)를 함께 호출하는 주소
VITE_API_BASE_URL=http://api.localhost:8080

# Bifrost 게이트웨이가 중계하는 관리자 API 주소
VITE_ADMIN_API_BASE_URL=http://api.localhost:8080/admin/api

# 관측 화면이 링크만 거는 Grafana 주소
VITE_GRAFANA_URL=https://monitoring.bnbong.com
```

`VITE_API_BASE_URL` 하나로 Bidar의 `/auth/*`와 Bifrost의 `/ready`를 모두 호출하기 때문에, 이 값에는 컨테이너 포트가 아니라 로컬 인그레스 주소를 적어야 합니다. 인그레스가 `/auth` 요청만 Bidar로 분기하고 나머지 요청은 Bifrost로 넘겨 주므로, 관리자 패널을 실행할 때에는 아래에서 설명하는 `ui` 프로필을 함께 띄워야 합니다.

## 루트 워크스페이스와 함께 실행

BNGdrasil 루트 워크스페이스에서 백엔드까지 함께 띄우려면, 루트의 `docker-compose.yml`이 제공하는 `ui` 프로필을 사용합니다.

```bash
docker compose --profile ui up -d
```

이 프로필은 `local/nginx.local.conf`를 사용하는 Nginx 컨테이너를 `127.0.0.1:8080`에 띄웁니다. `api.localhost:8080`은 컨테이너로 뜬 Bifrost 게이트웨이로 프록시되고, 그중 `/auth` 경로만 Bidar 인증 서버로 분기됩니다. 이 분기 방식은 운영 환경의 `api.bnbong.com` 설정과 동일합니다. `admin.localhost:8080`은 호스트에서 직접 실행 중인 admin Vite 개발 서버(`host.docker.internal:5174`)로 프록시됩니다. 따라서 이 ingress를 사용하려면 `admin/` 디렉터리에서 `npm run dev -- --host`를 먼저 실행해 두어야 합니다.

## 빌드

두 앱 모두 `npm run build`가 `tsc`로 타입을 검사한 다음 `vite build`를 실행합니다. 결과물은 각 앱의 `dist/` 디렉터리에 생성됩니다.

```bash
cd admin   # 또는 client
npm run build
```

배포 워크플로는 admin을 빌드한 다음 `admin/dist/release.json`을 함께 만듭니다. 이 파일에는 빌드한 커밋 SHA와 빌드 기준(`ref`), UTC 기준 빌드 시각이 들어가며, 관리자 콘솔의 운영 설정 화면이 이 값을 읽어서 "콘솔 빌드" 항목에 표시합니다. 로컬에서 `npm run build`를 실행할 때에는 이 파일을 만들지 않으므로, 개발 서버와 스모크 시험에서는 콘솔 빌드가 "미기록"으로 나타납니다.

## 린트

두 앱 모두 자신의 디렉터리에 ESLint 설정을 두고 있습니다. `admin/.eslintrc.cjs`와 `client/.eslintrc.cjs`가 각각의 규칙을 정의하며, 경고를 하나라도 남기면 실패하도록 `--max-warnings 0`을 사용합니다.

```bash
cd admin   # 또는 client
npm run lint
```

## 관리자 콘솔 스모크 시험

`admin/`에는 vitest로 실행하는 단위 시험과 별개로, Playwright로 실행하는 스모크 시험이 `admin/e2e/` 아래에 있습니다. 이 시험은 개발 서버가 아니라 빌드 결과물을 Chromium으로 띄우고, 게이트웨이를 모사하는 `admin/e2e/mock-gateway.mjs`를 상대로 화면을 확인합니다. 따라서 Bifrost와 Bidar를 실행하지 않아도 되며, 처음 실행할 때 브라우저를 한 번 내려받아야 합니다.

```bash
cd admin
npm ci
npx playwright install --with-deps chromium   # 처음 한 번만 실행합니다
npm run test:e2e
```

`npm run test:e2e`는 목 게이트웨이와 Vite 미리 보기 서버를 함께 띄운 다음 시험을 실행하고, 끝나면 두 서버를 모두 내립니다. 미리 보기 서버는 `VITE_API_BASE_URL`과 `VITE_ADMIN_API_BASE_URL`에 목 서버 주소를 넣어서 다시 빌드한 결과를 제공합니다. `VITE_` 값은 빌드 시점에 번들 안으로 들어가기 때문에 빌드가 끝난 뒤에는 주소를 바꿀 수 없으며, 이때 만든 결과물은 `admin/dist/`가 아니라 `admin/dist-e2e/`에 씁니다. 배포에 사용하는 `dist/`가 목 서버를 가리키는 번들로 바뀌지 않게 하려는 조치입니다.

포트를 바꾸려면 `E2E_MOCK_PORT`와 `E2E_PREVIEW_PORT` 환경 변수를 지정합니다. 기본값은 각각 4599와 4173입니다.

```bash
E2E_PREVIEW_PORT=4273 npm run test:e2e
```

단일 시험만 실행하거나 브라우저 창을 띄워서 확인하려면 Playwright의 인자를 그대로 넘깁니다.

```bash
npm run test:e2e -- e2e/services.spec.ts        # 한 파일만 실행합니다
npm run test:e2e -- --headed --debug            # 브라우저를 띄우고 단계별로 확인합니다
```

스크린샷과 트레이스는 실패한 시험에만 남기며, `admin/e2e-results/`에 저장합니다. 성공한 실행은 스크린샷과 트레이스를 남기지 않습니다. 트레이스는 `npx playwright show-trace e2e-results/<시험 이름>/trace.zip`으로 열어 볼 수 있습니다.

CI에서는 `.github/workflows/build.yml`의 admin 작업이 빌드 결과를 업로드한 다음 Chromium을 설치하고 같은 명령을 실행합니다. 확인하는 시나리오와 목 게이트웨이가 재현하는 응답 형식은 [관리자 콘솔](admin-console.md) 문서의 스모크 시험 절에 정리해 두었습니다.

## 알려진 제한과 후속 과제

- 비밀번호 재설정 기능이 없습니다. Bidar 인증 서버가 이 기능을 제공하지 않기 때문에, 관리자 콘솔도 억지로 만들지 않았습니다.
- 운영 개요 화면의 인프라 이력(`DashboardPage.tsx`의 `INFRA_HISTORY`)은 검토를 거친 정적 텍스트입니다. 실시간으로 OCI를 조회한 결과가 아니므로, 실제 인프라 구성이 바뀌면 이 배열도 함께 고쳐야 합니다.
- 관리자 콘솔은 VM1에 보관된 직전 릴리스, 다시 말해 롤백 지점을 표시하지 못합니다. 이 정보는 VM1 파일 시스템의 `previous-<app>` 심볼릭 링크에만 있고 콘솔이 조회할 수 있는 API가 없기 때문입니다. 롤백 지점을 확인하려면 VM1에서 `ls -l /opt/bnbong/previous-admin`을 직접 실행해야 합니다.
- 저장소 전역에 `core.autocrlf`가 `true`로 설정된 환경에서 작업하면 커밋 시점에 줄바꿈 문자가 변환되어 diff에 혼동을 줄 수 있습니다. `.gitattributes`로 줄바꿈 정책을 명시하는 편이 안전합니다.
