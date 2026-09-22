# 관리자 콘솔

`admin/`이 제공하는 관리자 콘솔의 화면 구성과 권한 경계, 인증 흐름, 상태 표시 원칙을 정리합니다.

## 화면과 호출 API

관리자 콘솔은 로그인 후 여섯 개 화면으로 구성됩니다. 회원가입 기능은 없습니다. 계정은 최고 관리자 권한을 가진 사용자만 만들 수 있습니다.

| 화면 | 파일 | 호출하는 API |
|---|---|---|
| 운영 개요 | `admin/src/pages/DashboardPage.tsx` | `GET /admin/api/settings/stats/overview`, `GET /admin/api/services`, `GET /ready` |
| 서비스 | `admin/src/pages/ServicesPage.tsx` | `GET /admin/api/services`, `GET /admin/api/services/stats`, `POST /admin/api/services`, `POST /admin/api/services/reload`, `POST /admin/api/services/health-check-all` |
| 서비스 상세 | `admin/src/pages/ServiceDetailPage.tsx` | `GET /admin/api/services/{id}`, `PUT /admin/api/services/{id}`, `DELETE /admin/api/services/{id}`, `GET /admin/api/services/{id}/health`, `POST /admin/api/services/health-check-all` |
| 사용자 | `admin/src/pages/UsersPage.tsx` | `GET /admin/api/users/`, `POST /admin/api/users/`, `PATCH /admin/api/users/{id}`, `PUT /admin/api/users/{id}/activate`, `PUT /admin/api/users/{id}/deactivate`, `DELETE /admin/api/users/{id}` |
| 관측 | `admin/src/pages/ObservabilityPage.tsx` | `GET /admin/api/services`만 호출하고, 나머지는 Grafana로 이동하는 링크로 처리합니다 |
| 운영 설정 | `admin/src/pages/SettingsPage.tsx` | `GET /admin/api/settings/` (읽기 전용) |

이 API 경로들의 타입 정의와 호출 함수는 `admin/src/services/api.ts`에 모여 있습니다. 표에서 `/admin/api`로 시작하지 않는 `GET /ready` 하나만 관리자 API가 아니라 게이트웨이 루트에 있으며, 인증 헤더를 요구하지 않습니다. 그래서 이 요청은 인터셉터가 붙지 않은 별도의 axios 인스턴스로 보냅니다.

서비스 목록에서 서비스 이름을 누르면 `/services/{id}` 주소의 상세 화면으로 이동합니다. 상세 화면은 게이트웨이가 저장한 등록 내용을 모두 보여주고, 수정과 삭제, 마지막으로 기록된 상태 확인을 한자리에서 처리합니다. 수정 요청은 값이 바뀐 항목만 담아서 보냅니다. 서버가 `exclude_unset`으로 요청 본문을 해석하기 때문에, 보내지 않은 항목은 저장된 값을 그대로 유지합니다. 서비스 이름은 서버의 수정 스키마가 받지 않는 항목이라서 상세 화면에서도 읽기 전용으로 표시합니다. 삭제를 확인하는 대화 상자는 게이트웨이를 거치는 요청이 곧바로 404를 받게 된다는 점을 문장으로 알려주고, 삭제가 끝나면 목록 화면으로 돌아가면서 서비스 관련 질의를 모두 무효로 만듭니다.

## 권한 경계

`admin/src/services/api.ts`가 정의하는 역할 순서는 `user < moderator < admin < super_admin`입니다. 화면에서는 이 순서를 다음과 같이 사용합니다.

- `admin` 이상은 사용자 목록을 조회하고, 서비스와 계정의 활성 상태와 비활성 상태를 바꿀 수 있습니다.
- `admin` 이상은 서비스를 등록하고 수정하고 삭제할 수 있습니다. Bifrost의 `/admin/api/services` 아래 엔드포인트가 모두 `require_admin` 의존성을 사용하기 때문에, 상세 화면의 버튼도 같은 기준으로 잠급니다.
- `super_admin`만 계정을 새로 만들거나 역할을 바꾸거나 삭제할 수 있습니다.

이 화면단 권한 확인은 사용자 경험을 위한 장치일 뿐입니다. 실제 검증은 매 요청마다 Bifrost 게이트웨이와 Bidar 인증 서버가 다시 수행합니다. 마지막 남은 최고 관리자 계정을 삭제하려는 요청은 인증 서버가 거절하며, 프런트엔드는 이 판단을 대신하지 않습니다.

## 인증 흐름

인증에는 access 토큰과 refresh 토큰을 함께 사용합니다. `/auth/refresh` 요청만 refresh 토큰을 실어 보내고, 그 밖의 모든 요청은 access 토큰을 사용합니다. access 토큰이 401로 거절되면 `refreshAccessToken()`이 한 번만 조용히 갱신을 시도합니다. 그 시도마저 실패하면 로그인 화면으로 돌려보냅니다. 403은 로그인 화면으로 보내지 않고, 화면 안에서 권한이 부족하다는 안내를 보여줍니다. 이 흐름 전체는 `admin/src/services/api.ts`의 인터셉터가 구현합니다.

## 상태 표시 원칙

관리자 콘솔은 수집하지 않은 값을 0으로 채우지 않습니다. `OverviewStats`의 `users`, `api_requests`, `system` 필드는 게이트웨이가 애초에 제공하지 않는 값이라서 타입 자체가 `null`이고, 화면은 이 값을 "미수집"으로 표시합니다. 또한 각 화면은 마지막으로 데이터를 받아온 시각을 함께 보여주며, 90초 넘게 갱신되지 않으면 오래된 값이라고 표시합니다. 이 규칙은 `admin/src/components/StatusPanel.tsx`와 `admin/src/lib/datetime.ts`가 구현합니다. 같은 파일이 화면 갱신 주기를 30초로, 경과 시간 라벨의 재계산 주기를 15초로 정의합니다. 모든 시각은 KST로 표시하고 표기에 시간대를 함께 적습니다.

같은 원칙에 따라 운영 개요 화면에 있던 "인프라 이력" 카드는 삭제했습니다. 이 카드는 가상 머신의 퇴역 여부를 소스 코드에 직접 적어 둔 정적 문구였고, 콘솔이 조회할 수 있는 대체 정보원이 없습니다. 실제로 확인하지 않은 상태를 화면에 남겨 두면 조회 결과처럼 읽히기 때문에, 값을 0이나 임의의 문구로 채우지 않고 카드 자체를 없앴습니다.

## 게이트웨이 준비 상태와 저장된 검사 기록

운영 개요 화면의 "게이트웨이 준비 상태" 카드는 `GET /ready` 응답을 그대로 보여줍니다. 게이트웨이는 데이터베이스나 서비스 등록부 가운데 하나라도 준비되지 않으면 503으로 응답하지만, 그 본문에는 어느 쪽이 실패했는지 설명하는 값이 들어 있습니다. 그래서 `fetchReadiness()`는 axios의 `validateStatus`로 200과 503을 모두 정상 응답으로 받아서 본문을 읽고, `database_error`와 `registry_error` 문자열을 화면에 그대로 옮깁니다. 네트워크 연결이 끊겼거나 예상하지 못한 상태 코드가 돌아온 경우에만 오류 상태로 표시합니다. 이 카드 위쪽에 있는 등록부 카드는 관리자 API의 개요 통계에서 온 값이라서 출처가 다르며, 두 응답의 값을 하나로 합쳐서 보여주지 않습니다.

서비스 상세 화면의 "마지막으로 기록된 상태"는 `GET /admin/api/services/{id}/health` 응답입니다. 이 엔드포인트는 대상 서비스에 실제로 요청을 보내지 않고 데이터베이스에 저장된 마지막 결과를 돌려줍니다. 그래서 화면은 이 값을 지금 관측한 상태라고 말하지 않고, 기록된 상태와 그 확인 시각을 함께 보여줍니다. 지금 다시 검사하려면 `POST /admin/api/services/health-check-all`을 호출하는 "전체 서비스 상태 검사" 버튼을 사용해야 하며, 이 버튼은 한 서비스가 아니라 등록된 모든 서비스를 검사한다는 사실을 화면에 적어 두었습니다.

## Grafana 링크

관측 화면은 지표를 직접 조회하지 않고 Grafana로 이동하는 링크만 만듭니다. 대시보드 링크는 baedalus가 배포한 대시보드의 고정 uid를 사용해 `d/{uid}` 주소로 바로 이동합니다. uid 목록과 각 대시보드가 받는 변수는 `admin/src/lib/grafana.ts`에 상수로 모아 두었고, `var-service` 변수를 선언한 대시보드에만 선택한 서비스를 전달합니다. 목록 화면인 `/dashboards`에는 템플릿 변수가 없어서 `var-service`를 붙여도 해석되지 않기 때문에, 그 주소로는 더 이상 이동하지 않습니다.

로그 탐색 링크에 들어가는 LogQL 선택자는 입력란으로 노출해서 직접 고칠 수 있게 했습니다. Loki의 `service` 라벨에는 Alloy가 컨테이너에서 읽어 온 compose 서비스 이름이 들어가지만, 서비스 선택 목록은 게이트웨이에 등록된 이름을 보여줍니다. 두 이름이 같다는 보장이 없고 콘솔은 그 대응 관계를 알 수 없기 때문에, 선택자를 정규 표현식으로 넓혀서 맞추는 대신 기본값만 채워 두고 어긋날 수 있다는 사실을 화면에 적었습니다.

## 디자인 토큰

`admin/src/index.css`가 디자인 토큰을 한곳에 모아 정의하고, 각 화면은 클래스 이름만 사용합니다. 배경은 `--canvas`(`#f6f3f1`), 본문 글자는 `--ink`(`#242424`), 강조색은 `--accent`(`#2b59d1`)입니다. 연한 배경 위의 강조 텍스트는 명도 대비 4.5:1을 확보하려고 `--accent-strong`(`#23489f`)을 따로 둡니다. 상태 색은 `--success`, `--warning`, `--danger`로 구분합니다. 제목은 세리프 글꼴(`--font-title`), 본문은 시스템 글꼴(`--font-body`)을 사용하며, 웹 폰트를 내려받지 않습니다. 그림자와 유리 효과, 지속적인 애니메이션은 사용하지 않습니다.
