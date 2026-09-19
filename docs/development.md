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
# Bidar 인증 서버로 직접 요청을 보내는 주소
VITE_API_BASE_URL=http://localhost:8001

# Bifrost 게이트웨이가 중계하는 관리자 API 주소
VITE_ADMIN_API_BASE_URL=http://localhost:8000/admin/api

# 관측 화면이 링크만 거는 Grafana 주소
VITE_GRAFANA_URL=https://monitoring.bnbong.com
```

## 루트 워크스페이스와 함께 실행

BNGdrasil 루트 워크스페이스에서 백엔드까지 함께 띄우려면, 루트의 `docker-compose.yml`이 제공하는 `ui` 프로필을 사용합니다.

```bash
docker compose --profile ui up -d
```

이 프로필은 `local/nginx.local.conf`를 사용하는 Nginx 컨테이너를 `127.0.0.1:8080`에 띄웁니다. `api.localhost:8080`은 컨테이너로 뜬 Bifrost 게이트웨이로 프록시되고, `admin.localhost:8080`은 호스트에서 직접 실행 중인 admin Vite 개발 서버(`host.docker.internal:5174`)로 프록시됩니다. 따라서 이 ingress를 사용하려면 `admin/` 디렉터리에서 `npm run dev -- --host`를 먼저 실행해 두어야 합니다.

## 빌드

두 앱 모두 `npm run build`가 `tsc`로 타입을 검사한 다음 `vite build`를 실행합니다. 결과물은 각 앱의 `dist/` 디렉터리에 생성됩니다.

```bash
cd admin   # 또는 client
npm run build
```

## 알려진 제한과 후속 과제

- 서비스 화면에는 등록 기능만 있고, 등록한 서비스를 수정하거나 삭제하는 UI는 아직 없습니다.
- 비밀번호 재설정 기능이 없습니다. Bidar 인증 서버가 이 기능을 제공하지 않기 때문에, 관리자 콘솔도 억지로 만들지 않았습니다.
- 운영 개요 화면의 인프라 이력(`DashboardPage.tsx`의 `INFRA_HISTORY`)은 검토를 거친 정적 텍스트입니다. 실시간으로 OCI를 조회한 결과가 아니므로, 실제 인프라 구성이 바뀌면 이 배열도 함께 고쳐야 합니다.
- `admin/package.json`에는 `lint` 스크립트가 있지만 `admin/` 안에 ESLint 설정 파일이 없습니다. `client/`에는 `.eslintrc.cjs`가 있으므로, 같은 설정을 admin에도 추가하는 편이 좋습니다.
- 저장소 전역에 `core.autocrlf`가 `true`로 설정된 환경에서 작업하면 커밋 시점에 줄바꿈 문자가 변환되어 diff에 혼동을 줄 수 있습니다. `.gitattributes`로 줄바꿈 정책을 명시하는 편이 안전합니다.
