# 관리자 콘솔

`admin/`이 제공하는 관리자 콘솔의 화면 구성과 권한 경계, 인증 흐름, 상태 표시 원칙을 정리합니다.

## 화면과 호출 API

관리자 콘솔은 로그인한 다음 일곱 개 화면으로 구성됩니다. 회원가입 기능은 없습니다. 계정은 최고 관리자 권한을 가진 사용자만 만들 수 있습니다.

| 화면 | 파일 | 호출하는 API |
|---|---|---|
| 운영 개요 | `admin/src/pages/DashboardPage.tsx` | `GET /admin/api/settings/stats/overview`, `GET /admin/api/services`, `GET /ready`, `GET /admin/api/observability/alerts` |
| 서비스 | `admin/src/pages/ServicesPage.tsx` | `GET /admin/api/services`, `GET /admin/api/services/stats`, `POST /admin/api/services`, `POST /admin/api/services/reload`, `POST /admin/api/services/health-check-all` |
| 서비스 상세 | `admin/src/pages/ServiceDetailPage.tsx` | `GET /admin/api/services/{id}`, `PUT /admin/api/services/{id}`, `DELETE /admin/api/services/{id}`, `GET /admin/api/services/{id}/health`, `POST /admin/api/services/health-check-all` |
| 사용자 | `admin/src/pages/UsersPage.tsx` | `GET /admin/api/users/`, `POST /admin/api/users/`, `PATCH /admin/api/users/{id}`, `PUT /admin/api/users/{id}/activate`, `PUT /admin/api/users/{id}/deactivate`, `DELETE /admin/api/users/{id}` |
| 백업 | `admin/src/pages/BackupsPage.tsx` | `GET /admin/api/observability/backups` |
| 관측 | `admin/src/pages/ObservabilityPage.tsx` | `GET /admin/api/services`만 호출하고, 나머지는 Grafana로 이동하는 링크로 처리합니다 |
| 운영 설정 | `admin/src/pages/SettingsPage.tsx` | `GET /admin/api/settings/` (읽기 전용) |

이 API 경로들의 타입 정의와 호출 함수는 `admin/src/services/api.ts`에 모여 있습니다. 표에서 `/admin/api`로 시작하지 않는 `GET /ready` 하나만 관리자 API가 아니라 게이트웨이 루트에 있으며, 인증 헤더를 요구하지 않습니다. 그래서 이 요청은 인터셉터가 붙지 않은 별도의 axios 인스턴스로 보냅니다.

서비스 목록에서 서비스 이름을 누르면 `/services/{id}` 주소의 상세 화면으로 이동합니다. 상세 화면은 게이트웨이가 저장한 등록 내용을 모두 보여주고, 수정과 삭제, 마지막으로 기록된 상태 확인을 한자리에서 처리합니다. 수정 요청은 값이 바뀐 항목만 담아서 보냅니다. 서버가 `exclude_unset`으로 요청 본문을 해석하기 때문에, 보내지 않은 항목은 저장된 값을 그대로 유지합니다. 서비스 이름은 서버의 수정 스키마가 받지 않는 항목이라서 상세 화면에서도 읽기 전용으로 표시합니다. 삭제를 확인하는 대화 상자는 게이트웨이를 거치는 요청이 곧바로 404를 받게 된다는 점을 문장으로 알려주고, 삭제가 끝나면 목록 화면으로 돌아가면서 서비스 관련 질의를 모두 무효로 만듭니다. 삭제 응답은 본문이 없는 204가 아니라 `service_id`와 `service_name`, 등록부 재적재 결과를 담은 200이기 때문에, `deleteService()`는 이 본문을 해석해서 목록 화면으로 넘겨줍니다.

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

## 등록부 재적재 실패를 알리는 방법

서비스를 등록하고 수정하고 삭제하는 요청은 데이터베이스에 먼저 변경을 확정한 다음 게이트웨이 등록부를 다시 적재합니다. 재적재가 실패해도 저장한 레코드는 되돌아가지 않기 때문에, 레코드는 저장되었지만 라우팅 표는 이전 상태에 머물러 있는 상황이 생깁니다. 게이트웨이는 이 상황을 `207 Multi-Status`와 `registry_reloaded: false`, 실패 원인을 담은 `registry_error`로 알려줍니다.

axios의 기본 `validateStatus`는 2xx를 모두 성공으로 판정하므로 207 응답에서는 예외가 발생하지 않습니다. 그래서 세 가지 요청 모두 응답 본문의 `registry_reloaded` 값을 직접 확인합니다. 이 판정과 화면에 표시할 문구는 `admin/src/lib/registry.ts`의 `describeRegistryOutcome()`이 한곳에서 만듭니다. 재적재에 성공하면 "등록부도 함께 다시 적재됐습니다"라는 문장을 성공 색으로 보여주고, 실패하면 저장은 끝났지만 등록부에는 반영되지 않았다는 사실을 경고 색으로 보여주면서 `registry_error` 문자열을 그대로 덧붙입니다. 경고 문구는 서비스 화면의 "등록부 다시 적재" 버튼으로 다시 시도하라고 안내하며, 그 버튼이 성공하면 경고를 지웁니다.

삭제는 조금 다르게 처리합니다. 삭제가 끝난 상세 화면은 더 이상 존재하지 않는 레코드를 다루고 있어서 그대로 두면 안 되므로, 판정 결과를 이동할 주소의 history state에 실어서 목록 화면으로 넘깁니다. 목록 화면은 그 값을 한 번만 읽어서 보여주고 history state를 비우기 때문에, 새로 고치거나 뒤로 이동해도 같은 문구가 다시 나타나지 않습니다.

## 백업 화면

백업 화면은 `GET /admin/api/observability/backups` 응답을 구성 요소별 카드와 원본 값 표로 보여줍니다. 이 응답은 백업 작업이 node exporter의 textfile collector로 내보낸 `bngdrasil_backup_` 계열 지표를 게이트웨이가 Prometheus에서 읽어 온 결과입니다. 각 구성 요소마다 마지막 성공 시각과 그 시각으로부터 지난 경과 시간, 마지막 실행 시각과 실행 결과, 미전송 개수를 함께 표시합니다. 실행 결과는 `bngdrasil_backup_last_run_status`를 따라 0을 성공으로, 1을 실패로 읽습니다.

서버가 `null`을 돌려준 항목은 "미보고"로 표시하고 0으로 바꾸지 않습니다. 예를 들어 오프사이트 전송을 담당하는 `ship` 구성 요소는 미전송 개수를 내보내지 않으며, 한 번도 성공한 적이 없는 구성 요소에는 마지막 성공 시각이 없습니다. 이 자리에 0을 적으면 측정한 적이 없는 값을 측정 결과처럼 읽게 되기 때문입니다.

경과 시간을 판정하는 임계값은 baedalus의 `monitoring/prometheus/rules/basic.yml`에 있는 경보 규칙과 같은 값을 사용합니다. 로컬 백업은 `BackupStale` 규칙을 따라 8시간, 오프사이트 전송은 `BackupShipStale` 규칙을 따라 14시간이 기준이며, 미전송 개수는 `BackupUnshippedPileup` 규칙을 따라 4개를 넘으면 경고로 표시합니다. 이 판정 함수들은 `admin/src/lib/backup.ts`에 모아 두었고 단위 시험으로 임계값을 고정해 두었기 때문에, 경보 규칙과 콘솔의 판단이 어긋나면 시험이 실패합니다.

Prometheus가 응답했지만 백업 시계열을 아직 하나도 갖고 있지 않으면 응답의 `available`이 `false`가 됩니다. 이때 화면은 카드를 하나도 그리지 않고, 지표가 아직 보고되지 않았다는 안내와 서버가 보낸 `note` 문장을 보여줍니다. 게이트웨이에 `PROMETHEUS_URL`이 설정되어 있지 않으면 501이 돌아오며, 화면은 설정을 추가하고 프로세스를 다시 시작해야 한다는 안내를 경고 색으로 표시합니다. Prometheus 조회 자체가 실패하면 502가 돌아오고, 화면은 게이트웨이가 보낸 `detail` 문자열을 그대로 보여주면서 다시 시도 버튼을 제공합니다. 화면 위쪽에는 Grafana의 백업 대시보드(`bngdrasil-backup`)로 이동하는 링크를 두어 시계열 추이를 확인할 수 있게 했습니다.

## 발화 중 알림

운영 개요 화면 위쪽의 "발화 중 알림" 구역은 `GET /admin/api/observability/alerts` 응답을 보여줍니다. 발화 건수와 등급별 건수를 먼저 적고, 알림마다 이름과 등급 배지, 대상 라벨, 발화가 시작된 뒤 지난 시간, `summary` 주석을 표로 나열합니다. Prometheus가 `pending` 상태로 보고한 알림은 아직 통지 대상이 아니기 때문에 서버가 제외하며, 화면도 그 사실을 문장으로 적어 둡니다.

이 구역은 개요 통계나 `/ready` 카드와 별개의 질의를 사용하므로, 두 요청이 실패해도 알림 목록은 그대로 나타납니다. 발화 중인 알림은 화면에서 가장 급한 정보이므로, 다른 엔드포인트의 실패 때문에 사라지면 안 되기 때문입니다.

각 알림의 `silenced`와 `inhibited` 값이 `true`이면 음소거와 억제 배지를 붙입니다. 두 값이 `null`이면 Alertmanager에 확인하지 못했다는 뜻이므로 "확인 불가"로 표시하고, 억제되지 않았다는 판정으로 바꾸어 적지 않습니다. 응답의 `alertmanager.configured`가 `true`인데 `available`이 `false`이면 Alertmanager 조회가 실패했다는 안내와 `error` 문자열을 함께 보여줍니다. `configured`가 `false`이면 게이트웨이에 `ALERTMANAGER_URL`이 설정되어 있지 않다는 사실을 적습니다. 발화 중인 알림이 한 건도 없다는 문장은 조회에 성공한 경우에만 표시하며, 501과 502는 백업 화면과 같은 방식으로 안내합니다. 이 구역에도 Grafana 개요 대시보드(`bngdrasil-overview`)로 이동하는 링크를 두었습니다.

## 게이트웨이 준비 상태와 저장된 검사 기록

운영 개요 화면의 "게이트웨이 준비 상태" 카드는 `GET /ready` 응답을 그대로 보여줍니다. 게이트웨이는 데이터베이스나 서비스 등록부 가운데 하나라도 준비되지 않으면 503으로 응답하지만, 그 본문에는 어느 쪽이 실패했는지 설명하는 값이 들어 있습니다. 그래서 `fetchReadiness()`는 axios의 `validateStatus`로 200과 503을 모두 정상 응답으로 받아서 본문을 읽고, `database_error`와 `registry_error` 문자열을 화면에 그대로 옮깁니다. 네트워크 연결이 끊겼거나 예상하지 못한 상태 코드가 돌아온 경우에만 오류 상태로 표시합니다. 이 카드 위쪽에 있는 등록부 카드는 관리자 API의 개요 통계에서 온 값이라서 출처가 다르며, 두 응답의 값을 하나로 합쳐서 보여주지 않습니다.

서비스 상세 화면의 "마지막으로 기록된 상태"는 `GET /admin/api/services/{id}/health` 응답입니다. 이 엔드포인트는 대상 서비스에 실제로 요청을 보내지 않고 데이터베이스에 저장된 마지막 결과를 돌려줍니다. 그래서 화면은 이 값을 지금 관측한 상태라고 말하지 않고, 기록된 상태와 그 확인 시각을 함께 보여줍니다. 지금 다시 검사하려면 `POST /admin/api/services/health-check-all`을 호출하는 "전체 서비스 상태 검사" 버튼을 사용해야 하며, 이 버튼은 한 서비스가 아니라 등록된 모든 서비스를 검사한다는 사실을 화면에 적어 두었습니다.

## Grafana 링크

관측 화면은 지표를 직접 조회하지 않고 Grafana로 이동하는 링크만 만듭니다. 대시보드 링크는 baedalus가 배포한 대시보드의 고정 uid를 사용해 `d/{uid}` 주소로 바로 이동합니다. uid 목록과 각 대시보드가 받는 변수는 `admin/src/lib/grafana.ts`에 상수로 모아 두었고, `var-service` 변수를 선언한 대시보드에만 선택한 서비스를 전달합니다. 목록 화면인 `/dashboards`에는 템플릿 변수가 없어서 `var-service`를 붙여도 해석되지 않기 때문에, 그 주소로는 더 이상 이동하지 않습니다.

로그 탐색 링크에 들어가는 LogQL 선택자는 입력란으로 노출해서 직접 고칠 수 있게 했습니다. Loki의 `service` 라벨에는 Alloy가 컨테이너에서 읽어 온 compose 서비스 이름이 들어가지만, 서비스 선택 목록은 게이트웨이에 등록된 이름을 보여줍니다. 두 이름이 같다는 보장이 없고 콘솔은 그 대응 관계를 알 수 없기 때문에, 선택자를 정규 표현식으로 넓혀서 맞추는 대신 기본값만 채워 두고 어긋날 수 있다는 사실을 화면에 적었습니다.

## 단위 시험

`admin/`에는 vitest로 실행하는 단위 시험이 있습니다. `cd admin && npm ci && npm test`로 실행하며, `npm test`는 `vitest run`을 호출해서 한 번만 실행하고 끝납니다. 설정은 `admin/vitest.config.ts`에 있고, 시험 대상이 모두 순수 함수이기 때문에 DOM이 필요하지 않아서 node 환경으로 실행하며 jsdom을 설치하지 않았습니다. CI에서는 `.github/workflows/build.yml`이 lint 단계 뒤에서 admin에 한정해 같은 명령을 실행합니다.

시험 대상은 다음과 같습니다.

- `admin/src/services/api.ts`의 `extractDetail()`과 `extractValidationDetail()`: FastAPI가 돌려주는 422 본문과 문자열 `detail`, `message` 대체 경로를 해석하는 함수입니다. 이 함수가 실패하면 화면에는 서버가 거절한 이유 대신 axios의 기본 문구만 남기 때문에, 항목이 하나인 경우와 둘인 경우, `loc`에 `body`만 있는 경우, `loc`이 중첩된 경우, 항목이 비정상인 경우, 목록이 비어 있는 경우를 모두 고정해 두었습니다.
- `admin/src/lib/grafana.ts`: 대시보드 uid 목록과 `var-service` 변수를 붙이는 규칙을 확인합니다. 변수를 선언하지 않은 대시보드에 `var-service`를 넘기면 Grafana가 그 값을 무시하므로, 적용되지 않은 필터가 적용된 것처럼 보이지 않도록 규칙을 시험으로 고정했습니다.
- `admin/src/lib/backup.ts`: 백업 경과 시간과 임계값 판정, `last_run_status` 해석, 미전송 개수 판정, `null`을 0으로 바꾸지 않는 규칙을 확인합니다.
- `admin/src/lib/registry.ts`: 등록부 재적재 결과에 따라 어떤 색과 문구를 고르는지 확인합니다.

화면 컴포넌트에서 판정 논리를 `admin/src/lib/` 아래로 옮겨 둔 이유도 여기에 있습니다. 순수 함수로 분리해 두면 브라우저를 띄우지 않고도 판정 규칙을 시험할 수 있습니다.

## 디자인 토큰

`admin/src/index.css`가 디자인 토큰을 한곳에 모아 정의하고, 각 화면은 클래스 이름만 사용합니다. 배경은 `--canvas`(`#f6f3f1`), 본문 글자는 `--ink`(`#242424`), 강조색은 `--accent`(`#2b59d1`)입니다. 연한 배경 위의 강조 텍스트는 명도 대비 4.5:1을 확보하려고 `--accent-strong`(`#23489f`)을 따로 둡니다. 상태 색은 `--success`, `--warning`, `--danger`로 구분합니다. 제목은 세리프 글꼴(`--font-title`), 본문은 시스템 글꼴(`--font-body`)을 사용하며, 웹 폰트를 내려받지 않습니다. 그림자와 유리 효과, 지속적인 애니메이션은 사용하지 않습니다.
