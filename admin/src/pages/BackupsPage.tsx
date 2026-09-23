import { useQuery } from '@tanstack/react-query'
import { BackupComponentStatus, BackupObservability, fetchBackupObservability, toApiError } from '../services/api'
import { ErrorPanel, FreshnessLine, LoadingPanel, NoticePanel } from '../components/StatusPanel'
import { POLL_INTERVAL_MS, formatKst, useNow } from '../lib/datetime'
import {
  BACKUP_SHIP_STALE_SECONDS,
  BACKUP_STALE_FOR_SECONDS,
  BACKUP_STALE_SECONDS,
  BACKUP_UNSHIPPED_LIMIT,
  BACKUP_UNSHIPPED_PILEUP_FOR_SECONDS,
  SHIP_COMPONENT,
  UNREPORTED_LABEL,
  ageState,
  componentKey,
  componentTone,
  formatAge,
  runState,
  staleForSeconds,
  staleThresholdSeconds,
  toMillis,
  unshippedState,
} from '../lib/backup'
import { DASHBOARD_LINKS, dashboardUrl } from '../lib/grafana'

/* ------------------------------------------------------------------ *
 * Backup status.
 *
 * Every value here comes from `GET /admin/api/observability/backups`, which is
 * the gateway reading four fixed Prometheus series. A field the backup scripts
 * have never written comes back as null, and null is printed as "미보고": zero
 * would claim a measurement that was never taken.
 * ------------------------------------------------------------------ */

const backupDashboard = DASHBOARD_LINKS.find((spec) => spec.key === 'backup')

const RUN_LABELS = {
  success: '성공',
  failure: '실패',
  unknown: '해석할 수 없는 값',
  unreported: UNREPORTED_LABEL,
} as const

const RUN_BADGES = {
  success: 'badge--success',
  failure: 'badge--danger',
  unknown: 'badge--neutral',
  unreported: 'badge--neutral',
} as const

/**
 * Threshold sentence for one component, spelled out next to its age.
 *
 * Crossing the threshold does not page immediately - the alert rule's `for`
 * clause requires the breach to hold for that long first, so the sentence
 * states both numbers rather than implying the alert fires the instant the
 * threshold is crossed.
 */
function thresholdNote(component: string): string {
  const hours = staleThresholdSeconds(component) / 3600
  const forMinutes = staleForSeconds(component) / 60
  return component === SHIP_COMPONENT
    ? `오프사이트 전송 기준 ${hours}시간을 넘은 상태가 ${forMinutes}분 지속되면 BackupShipStale 경보가 울립니다.`
    : `로컬 백업 기준 ${hours}시간을 넘은 상태가 ${forMinutes}분 지속되면 BackupStale 경보가 울립니다.`
}

function ComponentCard({ component }: { component: BackupComponentStatus }) {
  const tone = componentTone(component)
  const age = ageState(component.component, component.age_seconds)
  const run = runState(component.last_run_status)
  const unshipped = unshippedState(component.unshipped_total)

  const successMs = toMillis(component.last_success_timestamp)
  const runMs = toMillis(component.last_run_timestamp)

  return (
    <article className="card">
      <p className="eyebrow">{component.component}</p>
      <p className="metric-value metric-value--text">
        {age === 'unreported' ? UNREPORTED_LABEL : formatAge(component.age_seconds)}
      </p>
      <div className="badge-row">
        {age === 'stale' ? (
          <span className="badge badge--warning">성공 기준 초과</span>
        ) : age === 'fresh' ? (
          <span className="badge badge--success">기준 이내</span>
        ) : (
          <span className="badge badge--neutral">성공 기록 없음</span>
        )}
        <span className={`badge ${RUN_BADGES[run]}`}>마지막 실행 {RUN_LABELS[run]}</span>
        {tone === 'warning' && <span className="badge badge--warning">확인 필요</span>}
      </div>

      <div className="definition-list spaced-top">
        <div>
          <p className="definition-term">마지막 성공 시각</p>
          <p className="definition-value">{formatKst(successMs, UNREPORTED_LABEL)}</p>
        </div>
        <div>
          <p className="definition-term">마지막 실행 시각</p>
          <p className="definition-value">{formatKst(runMs, UNREPORTED_LABEL)}</p>
        </div>
        <div>
          <p className="definition-term">미전송 개수</p>
          <p className="definition-value">
            {unshipped === 'unreported' ? (
              UNREPORTED_LABEL
            ) : (
              <>
                {component.unshipped_total}
                {unshipped === 'pileup' && (
                  <span className="badge badge--warning spaced-left-sm">
                    {BACKUP_UNSHIPPED_LIMIT}개 초과
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div>
          <p className="definition-term">수집 대상</p>
          <p className="definition-value mono break-all">
            {component.instance || UNREPORTED_LABEL}
            {component.job ? ` · ${component.job}` : ''}
          </p>
        </div>
      </div>

      <p className="metric-note">{thresholdNote(component.component)}</p>
    </article>
  )
}

function BackupsPage() {
  const now = useNow()

  const backupsQuery = useQuery<BackupObservability>({
    queryKey: ['observability-backups'],
    queryFn: fetchBackupObservability,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // 501 and 502 are answers about the monitoring stack, not transient
    // failures of this request; retrying only delays the explanation.
    retry: false,
  })

  const data = backupsQuery.data
  const apiError = backupsQuery.isError ? toApiError(backupsQuery.error) : null

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Backups</p>
        <h1 className="page-title">백업</h1>
        <p className="page-lead">
          백업 작업이 node exporter의 textfile collector로 내보낸 지표를 게이트웨이가 Prometheus에서
          읽어 온 결과입니다. 보고된 적이 없는 값은 0이 아니라 {UNREPORTED_LABEL}로 표시합니다.
        </p>
      </div>
      <FreshnessLine
        dataUpdatedAt={backupsQuery.dataUpdatedAt}
        now={now}
        isFetching={backupsQuery.isFetching}
        label="백업 지표 갱신"
      />
    </div>
  )

  const dashboardLink = backupDashboard && (
    <p className="detail spaced-bottom">
      시계열 추이는 Grafana 백업 대시보드에서 확인하세요.{' '}
      <a
        href={dashboardUrl(backupDashboard, { from: 'now-7d', to: 'now' })}
        target="_blank"
        rel="noopener noreferrer"
      >
        백업 대시보드 열기
      </a>
    </p>
  )

  if (backupsQuery.isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="백업 상태를 불러오는 중입니다." />
      </div>
    )
  }

  if (apiError) {
    return (
      <div>
        {header}
        {apiError.isNotImplemented ? (
          <NoticePanel tone="warning" title="게이트웨이에 PROMETHEUS_URL이 설정되어 있지 않습니다">
            <p>
              백업 요약은 Prometheus를 읽어서 만듭니다. 게이트웨이 배포 환경에{' '}
              <span className="mono">PROMETHEUS_URL</span>을 설정하고 프로세스를 다시 시작해야 이
              화면에 값이 나타납니다. 그 전까지는 Grafana에서 직접 확인하세요.
            </p>
            {apiError.detail && <p className="detail spaced-top-sm break-all">{apiError.detail}</p>}
          </NoticePanel>
        ) : apiError.status === 502 ? (
          <NoticePanel
            tone="error"
            title="Prometheus를 조회하지 못했습니다"
            actions={
              <button type="button" className="btn btn--sm" onClick={() => backupsQuery.refetch()}>
                다시 시도
              </button>
            }
          >
            <p>
              게이트웨이가 Prometheus에 질의했지만 응답을 받지 못했습니다. 아래는 게이트웨이가
              돌려준 이유입니다.
            </p>
            <p className="mono break-all spaced-top-sm">
              {apiError.detail || '게이트웨이가 이유를 전달하지 않았습니다.'}
            </p>
          </NoticePanel>
        ) : (
          <ErrorPanel
            title="백업 상태를 불러오지 못했습니다"
            error={backupsQuery.error}
            fallbackMessage="백업 요약을 가져오지 못했습니다"
            onRetry={() => backupsQuery.refetch()}
          />
        )}
        {dashboardLink}
      </div>
    )
  }

  if (!data) {
    return (
      <div>
        {header}
        <ErrorPanel
          title="백업 상태를 불러오지 못했습니다"
          error={backupsQuery.error}
          fallbackMessage="백업 요약을 가져오지 못했습니다"
          onRetry={() => backupsQuery.refetch()}
        />
      </div>
    )
  }

  const warningCount = data.components.filter((item) => componentTone(item) === 'warning').length

  return (
    <div>
      {header}

      {dashboardLink}

      {!data.available ? (
        <NoticePanel tone="warning" title="백업 지표가 아직 보고되지 않았습니다">
          <p>
            {data.note ||
              'Prometheus에 bngdrasil_backup_ 계열 시계열이 아직 없습니다. 백업 작업이 textfile collector로 값을 내보낸 적이 없다는 뜻입니다.'}
          </p>
          <p className="detail spaced-top-sm">
            조회 시각 {formatKst(data.queried_at)}. 빈 목록을 정상으로 읽지 마세요. 상태를 확인한
            결과가 아니라 확인할 값이 없다는 뜻입니다.
          </p>
        </NoticePanel>
      ) : (
        <>
          {warningCount > 0 && (
            <NoticePanel tone="warning" title={`확인이 필요한 구성 요소가 ${warningCount}건 있습니다`}>
              <p>
                마지막 성공이 경보 임계를 넘었거나, 마지막 실행이 실패했거나, 미전송 백업이{' '}
                {BACKUP_UNSHIPPED_LIMIT}개를 넘은 구성 요소입니다. 로컬 백업은{' '}
                {BACKUP_STALE_SECONDS / 3600}시간, 오프사이트 전송은{' '}
                {BACKUP_SHIP_STALE_SECONDS / 3600}시간을 기준으로 판정합니다.
              </p>
              <p className="detail spaced-top-sm">
                이 화면은 임계를 넘은 순간 바로 표시합니다. 경보는 그보다 늦게 울립니다. 마지막
                성공 지연은 임계를 넘은 상태가 {BACKUP_STALE_FOR_SECONDS / 60}분, 미전송 누적은{' '}
                {BACKUP_UNSHIPPED_PILEUP_FOR_SECONDS / 60}분 지속돼야 Prometheus가 경보를 발화합니다.
              </p>
            </NoticePanel>
          )}

          <p className="detail spaced-bottom">
            조회 시각 {formatKst(data.queried_at)} · 구성 요소 {data.components.length}건. 경과
            시간은 게이트웨이 서버 시각을 기준으로 계산한 값입니다.
          </p>

          <div className="card-grid">
            {data.components.map((component) => (
              <ComponentCard key={componentKey(component)} component={component} />
            ))}
          </div>

          <section className="section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Reported values</p>
                <h2 className="section-title">구성 요소별 원본 값</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table data-table--wide">
                <thead>
                  <tr>
                    <th scope="col">구성 요소</th>
                    <th scope="col">마지막 성공</th>
                    <th scope="col">경과</th>
                    <th scope="col">마지막 실행</th>
                    <th scope="col">실행 결과</th>
                    <th scope="col">미전송</th>
                  </tr>
                </thead>
                <tbody>
                  {data.components.map((component) => {
                    const age = ageState(component.component, component.age_seconds)
                    const run = runState(component.last_run_status)
                    const unshipped = unshippedState(component.unshipped_total)
                    return (
                      <tr key={componentKey(component)}>
                        <td>
                          <span className="row-name mono">{component.component}</span>
                          <div className="detail mono">{component.instance || UNREPORTED_LABEL}</div>
                        </td>
                        <td className="mono detail">
                          {formatKst(toMillis(component.last_success_timestamp), UNREPORTED_LABEL)}
                        </td>
                        <td>
                          <span className={`badge ${age === 'stale' ? 'badge--warning' : age === 'fresh' ? 'badge--success' : 'badge--neutral'}`}>
                            {formatAge(component.age_seconds)}
                          </span>
                        </td>
                        <td className="mono detail">
                          {formatKst(toMillis(component.last_run_timestamp), UNREPORTED_LABEL)}
                        </td>
                        <td>
                          <span className={`badge ${RUN_BADGES[run]}`}>{RUN_LABELS[run]}</span>
                        </td>
                        <td>
                          {unshipped === 'unreported' ? (
                            <span className="detail">{UNREPORTED_LABEL}</span>
                          ) : (
                            <span
                              className={`badge ${unshipped === 'pileup' ? 'badge--warning' : 'badge--neutral'}`}
                            >
                              {component.unshipped_total}건
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="detail spaced-top-lg">
        <span className="mono">last_run_status</span>는 0이 성공, 1이 실패입니다. 값이 보고되지
        않은 항목은 {UNREPORTED_LABEL}로 적으며, 실행한 적이 없다는 사실과 실행에 성공했다는 사실을
        구분합니다.
      </p>
    </div>
  )
}

export default BackupsPage
