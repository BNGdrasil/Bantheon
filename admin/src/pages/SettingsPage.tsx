import { useQuery } from '@tanstack/react-query'
import { Settings, SettingsResponse, fetchSettings } from '../services/api'
import { ErrorPanel, FreshnessLine, LoadingPanel, NoticePanel } from '../components/StatusPanel'
import { formatKst, useNow } from '../lib/datetime'
import { ConsoleRelease, NOT_RECORDED_LABEL } from '../lib/build'
import { ShaValue } from '../components/BuildFacts'
import { fetchConsoleRelease } from '../services/release'

/**
 * Effective gateway configuration, read-only. `PUT /settings/` answers 501 and
 * the payload reports `editable_at_runtime: false`, so this page has no edit
 * control at all: an input that cannot save is worse than no input.
 */
const FIELD_LABELS: Record<keyof Settings, string> = {
  environment: '실행 환경',
  version: '게이트웨이 버전',
  debug: '디버그 모드',
  log_level: '로그 수준',
  rate_limit_per_minute: '기본 요청 제한 (req/min)',
  rate_limit_exempt_paths: '요청 제한 예외 경로',
  max_request_body_bytes: '요청 본문 최대 크기 (bytes)',
  proxy_timeout_seconds: '프록시 응답 제한 시간 (초)',
  cors_origins: '허용 출처',
  metrics_enabled: '지표 수집',
  editable_at_runtime: '실행 중 편집 가능 여부',
}

const FIELD_ORDER: (keyof Settings)[] = [
  'environment',
  'version',
  'debug',
  'log_level',
  'rate_limit_per_minute',
  'rate_limit_exempt_paths',
  'max_request_body_bytes',
  'proxy_timeout_seconds',
  'cors_origins',
  'metrics_enabled',
  'editable_at_runtime',
]

function renderValue(value: unknown) {
  if (typeof value === 'boolean') {
    return (
      <span className={`badge ${value ? 'badge--success' : 'badge--neutral'}`}>
        {value ? '사용' : '사용 안 함'}
      </span>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="detail">설정 없음</span>
    }
    return (
      <div className="stack">
        {value.map((entry) => (
          <span key={String(entry)} className="mono detail break-all">
            {String(entry)}
          </span>
        ))}
      </div>
    )
  }
  return <span className="mono">{String(value)}</span>
}

function SettingsPage() {
  const now = useNow()

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } =
    useQuery<SettingsResponse>({
      queryKey: ['settings'],
      queryFn: fetchSettings,
    })

  // The console's own build, read from the static marker next to the bundle.
  // The file never changes while the page is open and a missing file is an
  // answer rather than a failure, so this query neither retries nor refetches.
  const releaseQuery = useQuery<ConsoleRelease | null>({
    queryKey: ['console-release'],
    queryFn: fetchConsoleRelease,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

  const release = releaseQuery.data ?? null

  // The gateway settings and the console build come from different places, so
  // this block renders whether or not the settings call succeeded.
  const consoleReleaseSection = (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">Console build</p>
          <h2 className="section-title">콘솔 빌드</h2>
        </div>
      </div>

      <p className="detail spaced-bottom">
        지금 보고 있는 관리 화면 자체의 빌드 정보입니다. 배포 워크플로가 번들과 함께 올려 둔{' '}
        <span className="mono">release.json</span>을 읽은 값이며, 게이트웨이에는 묻지 않습니다.
      </p>

      {releaseQuery.isLoading ? (
        <LoadingPanel message="콘솔 빌드 정보를 불러오는 중입니다." />
      ) : release ? (
        <div className="card">
          <div className="definition-list">
            <div>
              <p className="definition-term">커밋 SHA</p>
              {release.sha ? (
                <ShaValue value={release.sha} />
              ) : (
                <span className="detail">{NOT_RECORDED_LABEL}</span>
              )}
            </div>
            <div>
              <p className="definition-term">빌드 기준</p>
              {release.ref ? (
                <p className="definition-value mono break-all">{release.ref}</p>
              ) : (
                <span className="detail">{NOT_RECORDED_LABEL}</span>
              )}
            </div>
            <div>
              <p className="definition-term">빌드 시각</p>
              {release.built_at ? (
                <>
                  <p className="definition-value">
                    {formatKst(release.built_at, NOT_RECORDED_LABEL)}
                  </p>
                  <p className="detail mono break-all">{release.built_at}</p>
                </>
              ) : (
                <span className="detail">{NOT_RECORDED_LABEL}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="definition-term">콘솔 빌드</p>
          <p className="metric-value metric-value--unavailable">{NOT_RECORDED_LABEL}</p>
          <p className="metric-note">
            <span className="mono">release.json</span>을 찾지 못했습니다. 로컬 개발 서버와 스모크
            시험에는 이 파일이 없으므로 여기에서는 정상입니다. 배포한 콘솔에서 이 문구가 보인다면
            배포 워크플로가 표식을 만들지 못했다는 뜻이므로, 워크플로 실행 기록을 확인하시기
            바랍니다.
          </p>
        </div>
      )}

      <p className="detail spaced-top-sm">
        직전 릴리스로 되돌릴 수 있는지는 VM1 파일 시스템의 심볼릭 링크에만 기록되어 있고 조회할 수
        있는 API가 없습니다. 그래서 이 화면은 롤백 지점을 표시하지 않습니다.
      </p>
    </section>
  )

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Configuration</p>
        <h1 className="page-title">운영 설정</h1>
        <p className="page-lead">
          실행 중인 게이트웨이가 실제로 사용하는 값입니다. 배포 환경 변수로만 바꿀 수 있으며 이
          화면에서는 수정하지 않습니다.
        </p>
      </div>
      <FreshnessLine dataUpdatedAt={dataUpdatedAt} now={now} isFetching={isFetching} />
    </div>
  )

  if (isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="설정을 불러오는 중입니다." />
        {consoleReleaseSection}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div>
        {header}
        <ErrorPanel
          title="설정을 불러오지 못했습니다"
          error={error}
          fallbackMessage="설정을 가져오지 못했습니다"
          onRetry={() => refetch()}
        />
        {consoleReleaseSection}
      </div>
    )
  }

  const settings = data.settings

  return (
    <div>
      {header}

      <NoticePanel tone="info" title="읽기 전용 화면입니다">
        <p>
          값을 바꾸려면 배포 환경 변수를 수정하고 게이트웨이를 다시 시작해야 합니다. 서버는 실행 중
          변경 요청을 받지 않습니다.
        </p>
      </NoticePanel>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">설정 키</th>
              <th scope="col">적용 값</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_ORDER.filter((key) => key in settings).map((key) => (
              <tr key={key}>
                <td className="row-name">{FIELD_LABELS[key]}</td>
                <td className="mono detail">{key}</td>
                <td>{renderValue(settings[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="detail spaced-top-lg">
        비밀 값은 이 응답에 포함되지 않습니다. 자격 증명과 키는 배포 환경에서만 관리합니다.
      </p>

      {consoleReleaseSection}
    </div>
  )
}

export default SettingsPage
