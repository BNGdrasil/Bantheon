# 관리자 콘솔

`admin/`이 제공하는 관리자 콘솔의 화면 구성과 권한 경계, 인증 흐름, 상태 표시 원칙을 정리합니다.

## 화면과 호출 API

관리자 콘솔은 로그인 후 다섯 개 화면으로 구성됩니다. 회원가입 기능은 없습니다. 계정은 최고 관리자 권한을 가진 사용자만 만들 수 있습니다.

| 화면 | 파일 | 호출하는 Bifrost 관리자 API |
|---|---|---|
| 운영 개요 | `admin/src/pages/DashboardPage.tsx` | `GET /admin/api/settings/stats/overview`, `GET /admin/api/services` |
| 서비스 | `admin/src/pages/ServicesPage.tsx` | `GET /admin/api/services`, `GET /admin/api/services/stats`, `POST /admin/api/services`, `POST /admin/api/services/reload`, `POST /admin/api/services/health-check-all` |
| 사용자 | `admin/src/pages/UsersPage.tsx` | `GET /admin/api/users/`, `POST /admin/api/users/`, `PATCH /admin/api/users/{id}`, `PUT /admin/api/users/{id}/activate`, `PUT /admin/api/users/{id}/deactivate`, `DELETE /admin/api/users/{id}` |
| 관측 | `admin/src/pages/ObservabilityPage.tsx` | `GET /admin/api/services`만 호출하고, 나머지는 Grafana로 이동하는 링크로 처리합니다 |
| 운영 설정 | `admin/src/pages/SettingsPage.tsx` | `GET /admin/api/settings/` (읽기 전용) |

이 API 경로들의 타입 정의와 호출 함수는 `admin/src/services/api.ts`에 모여 있습니다.

## 권한 경계

`admin/src/services/api.ts`가 정의하는 역할 순서는 `user < moderator < admin < super_admin`입니다. 화면에서는 이 순서를 다음과 같이 사용합니다.

- `admin` 이상은 사용자 목록을 조회하고, 서비스와 계정의 활성 상태와 비활성 상태를 바꿀 수 있습니다.
- `super_admin`만 계정을 새로 만들거나 역할을 바꾸거나 삭제할 수 있습니다.

이 화면단 권한 확인은 사용자 경험을 위한 장치일 뿐입니다. 실제 검증은 매 요청마다 Bifrost 게이트웨이와 Bidar 인증 서버가 다시 수행합니다. 마지막 남은 최고 관리자 계정을 삭제하려는 요청은 인증 서버가 거절하며, 프런트엔드는 이 판단을 대신하지 않습니다.

## 인증 흐름

인증에는 access 토큰과 refresh 토큰을 함께 사용합니다. `/auth/refresh` 요청만 refresh 토큰을 실어 보내고, 그 밖의 모든 요청은 access 토큰을 사용합니다. access 토큰이 401로 거절되면 `refreshAccessToken()`이 한 번만 조용히 갱신을 시도합니다. 그 시도마저 실패하면 로그인 화면으로 돌려보냅니다. 403은 로그인 화면으로 보내지 않고, 화면 안에서 권한이 부족하다는 안내를 보여줍니다. 이 흐름 전체는 `admin/src/services/api.ts`의 인터셉터가 구현합니다.

## 상태 표시 원칙

관리자 콘솔은 수집하지 않은 값을 0으로 채우지 않습니다. `OverviewStats`의 `users`, `api_requests`, `system` 필드는 게이트웨이가 애초에 제공하지 않는 값이라서 타입 자체가 `null`이고, 화면은 이 값을 "미수집"으로 표시합니다. 또한 각 화면은 마지막으로 데이터를 받아온 시각을 함께 보여주며, 90초 넘게 갱신되지 않으면 오래된 값이라고 표시합니다. 이 규칙은 `admin/src/components/StatusPanel.tsx`와 `admin/src/lib/datetime.ts`가 구현합니다. 같은 파일이 화면 갱신 주기를 30초로, 경과 시간 라벨의 재계산 주기를 15초로 정의합니다. 모든 시각은 KST로 표시하고 표기에 시간대를 함께 적습니다.

## 디자인 토큰

`admin/src/index.css`가 디자인 토큰을 한곳에 모아 정의하고, 각 화면은 클래스 이름만 사용합니다. 배경은 `--canvas`(`#f6f3f1`), 본문 글자는 `--ink`(`#242424`), 강조색은 `--accent`(`#2b59d1`)입니다. 연한 배경 위의 강조 텍스트는 명도 대비 4.5:1을 확보하려고 `--accent-strong`(`#23489f`)을 따로 둡니다. 상태 색은 `--success`, `--warning`, `--danger`로 구분합니다. 제목은 세리프 글꼴(`--font-title`), 본문은 시스템 글꼴(`--font-body`)을 사용하며, 웹 폰트를 내려받지 않습니다. 그림자와 유리 효과, 지속적인 애니메이션은 사용하지 않습니다.
