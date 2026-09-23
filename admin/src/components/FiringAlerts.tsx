import { useQuery } from '@tanstack/react-query'
import { AlertsObservability, fetchAlertObservability, toApiError } from '../services/api'
import { ErrorPanel, FreshnessLine, LoadingPanel, NoticePanel } from './StatusPanel'
import { POLL_INTERVAL_MS, formatDuration, formatKst, parseServerDate, useNow } from '../lib/datetime'
import { DASHBOARD_LINKS, dashboardUrl } from '../lib/grafana'

/* ------------------------------------------------------------------ *
 * Firing alerts.
 *
 * This section reads `GET /admin/api/observability/alerts` on its own query,
 * so it renders whether or not the overview counters and the `/ready` card
 * succeeded. An alert that is firing is the most urgent thing on the screen and
 * must not disappear because a different endpoint failed.
 *
 * `silenced` and `inhibited` are null whenever Alertmanager was not consulted.
 * Null is drawn as "확인 불가", never as "not suppressed": the console has not
 * been told either way.
 *
 * `active_at` is Prometheus' `activeAt`: the moment the alert condition first
 * evaluated to true, which is when the rule's `for` wait started rather than
 * when the alert began firing. A rule with `for: 15m` therefore reports a
 * value fifteen minutes older than the moment it notified, so the column is
 * labelled "조건 활성화 이후" and not "발화 시작" ("firing since"): reading it
 * as a firing time would overstate how long the alert has been paging by the
 * whole `for` duration.
 * ------------------------------------------------------------------ */

const overviewDashboard = DASHBOARD_LINKS.find((spec) => spec.key === 'overview')

const SEVERITY_BADGES: Record<string, string> = {
  critical: 'badge--danger',
  warning: 'badge--warning',
  info: 'badge--info',
}

function severityBadge(severity: string | null): string {
  return (severity && SEVERITY_BADGES[severity]) || 'badge--neutral'
}

/** Counts alerts by severity, keeping the order the badges are drawn in. */
function countBySeverity(alerts: AlertsObservability['alerts']): [string, number][] {
  const counts = new Map<string, number>()
  for (const alert of alerts) {
    const key = alert.severity || '등급 없음'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const order = ['critical', 'warning', 'info']
  return [...counts.entries()].sort(
    ([left], [right]) =>
      (order.indexOf(left) + 1 || order.length + 1) - (order.indexOf(right) + 1 || order.length + 1)
  )
}

/** The labels that identify what an alert is about, joined for one line. */
function alertTarget(alert: AlertsObservability['alerts'][number]): string {
  const parts = [
    alert.instance && `instance ${alert.instance}`,
    alert.service && `service ${alert.service}`,
    alert.component && `component ${alert.component}`,
    alert.job && `job ${alert.job}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '대상 라벨이 없습니다'
}

function FiringAlerts() {
  const now = useNow()

  const alertsQuery = useQuery<AlertsObservability>({
    queryKey: ['observability-alerts'],
    queryFn: fetchAlertObservability,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // 501 and 502 describe the monitoring stack, so retrying only postpones
    // the explanation the operator needs to read.
    retry: false,
  })

  const data = alertsQuery.data
  const apiError = alertsQuery.isError ? toApiError(alertsQuery.error) : null

  const head = (
    <div className="section-head">
      <div>
        <p className="eyebrow">Firing alerts</p>
        <h2 className="section-title">발화 중 알림</h2>
      </div>
      <FreshnessLine
        dataUpdatedAt={alertsQuery.dataUpdatedAt}
        now={now}
        isFetching={alertsQuery.isFetching}
        label="알림 조회"
      />
    </div>
  )

  const dashboardLink = overviewDashboard && (
    <p className="detail spaced-bottom">
      알림 규칙과 지표는 Grafana 개요 대시보드에서 확인하세요.{' '}
      <a
        href={dashboardUrl(overviewDashboard, { from: 'now-6h', to: 'now' })}
        target="_blank"
        rel="noopener noreferrer"
      >
        개요 대시보드 열기
      </a>
    </p>
  )

  let body
  if (alertsQuery.isLoading) {
    body = <LoadingPanel message="발화 중인 알림을 확인하는 중입니다." />
  } else if (apiError?.isNotImplemented) {
    body = (
      <NoticePanel tone="warning" title="게이트웨이에 PROMETHEUS_URL이 설정되어 있지 않습니다">
        <p>
          알림 목록은 Prometheus의 알림 상태를 읽어서 만듭니다. 게이트웨이 배포 환경에{' '}
          <span className="mono">PROMETHEUS_URL</span>을 설정하고 프로세스를 다시 시작해야 합니다.
          그 전까지 이 화면은 발화 중인 알림이 없다고 말하지 않습니다.
        </p>
        {apiError.detail && <p className="detail spaced-top-sm break-all">{apiError.detail}</p>}
      </NoticePanel>
    )
  } else if (apiError?.status === 502) {
    body = (
      <NoticePanel
        tone="error"
        title="Prometheus를 조회하지 못했습니다"
        actions={
          <button type="button" className="btn btn--sm" onClick={() => alertsQuery.refetch()}>
            다시 시도
          </button>
        }
      >
        <p>게이트웨이가 Prometheus에 질의했지만 응답을 받지 못했습니다.</p>
        <p className="mono break-all spaced-top-sm">
          {apiError.detail || '게이트웨이가 이유를 전달하지 않았습니다.'}
        </p>
      </NoticePanel>
    )
  } else if (apiError || !data) {
    body = (
      <ErrorPanel
        title="알림을 확인하지 못했습니다"
        error={alertsQuery.error}
        fallbackMessage="발화 중인 알림을 가져오지 못했습니다"
        onRetry={() => alertsQuery.refetch()}
      />
    )
  } else {
    const severityCounts = countBySeverity(data.alerts)
    const suppressionUnknown = !data.alertmanager.available

    body = (
      <>
        {data.alertmanager.configured && !data.alertmanager.available && (
          <NoticePanel tone="warning" title="Alertmanager 상태를 확인하지 못했습니다">
            <p>
              알림 목록은 Prometheus에서 왔으므로 그대로 정확합니다. 다만 각 알림이 음소거됐는지
              억제됐는지는 확인하지 못했고, 확인하지 못한 상태를 "억제되지 않음"으로 바꿔 적지
              않습니다.
            </p>
            {data.alertmanager.error && (
              <p className="mono break-all spaced-top-sm">{data.alertmanager.error}</p>
            )}
          </NoticePanel>
        )}

        {!data.alertmanager.configured && (
          <p className="detail spaced-bottom">
            게이트웨이에 <span className="mono">ALERTMANAGER_URL</span>이 설정되어 있지 않아 음소거와
            억제 여부는 확인할 수 없습니다.
          </p>
        )}

        {data.firing_count === 0 ? (
          <div className="state-block">
            <p className="state-block-title">발화 중인 알림이 없습니다</p>
            <p>
              조회 시각 {formatKst(data.queried_at)} 기준으로 Prometheus가 발화 중이라고 보고한
              알림이 없습니다. <span className="mono">pending</span> 상태인 알림은 아직 통지 대상이
              아니므로 이 목록에 넣지 않습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="badge-row spaced-bottom">
              <span className="badge badge--danger">발화 {data.firing_count}건</span>
              {severityCounts.map(([severity, count]) => (
                <span key={severity} className={`badge ${severityBadge(severity)}`}>
                  {severity} {count}건
                </span>
              ))}
              <span className="detail">조회 {formatKst(data.queried_at)}</span>
            </div>

            <div className="table-wrap">
              <table className="data-table data-table--wide">
                <thead>
                  <tr>
                    <th scope="col">알림</th>
                    <th scope="col">등급</th>
                    <th scope="col">대상</th>
                    <th
                      scope="col"
                      title="Prometheus activeAt 기준입니다. 조건이 참이 된 시각부터 잰 시간이므로, 규칙의 for 대기 시간이 여기에 포함됩니다."
                    >
                      조건 활성화 이후
                    </th>
                    <th scope="col">억제 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts.map((alert, index) => {
                    const activeAt = parseServerDate(alert.active_at)
                    return (
                      <tr key={`${alert.alertname}-${alert.instance ?? ''}-${alert.component ?? ''}-${index}`}>
                        <td>
                          <span className="row-name mono">{alert.alertname}</span>
                          {alert.summary && <div className="detail">{alert.summary}</div>}
                        </td>
                        <td>
                          <span className={`badge ${severityBadge(alert.severity)}`}>
                            {alert.severity || '등급 없음'}
                          </span>
                        </td>
                        <td className="detail mono break-all">{alertTarget(alert)}</td>
                        <td className="detail">
                          {activeAt ? (
                            <>
                              <div>조건 활성화 이후 {formatDuration(now - activeAt.getTime())}</div>
                              <div className="mono">{formatKst(alert.active_at)}</div>
                            </>
                          ) : (
                            '조건 활성화 시각을 알 수 없습니다'
                          )}
                        </td>
                        <td>
                          {suppressionUnknown || alert.silenced === null || alert.inhibited === null ? (
                            <span className="badge badge--neutral">확인 불가</span>
                          ) : (
                            <div className="badge-row">
                              {alert.silenced && <span className="badge badge--info">음소거</span>}
                              {alert.inhibited && <span className="badge badge--info">억제</span>}
                              {!alert.silenced && !alert.inhibited && (
                                <span className="detail">통지 대상</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <section className="section">
      {head}
      {dashboardLink}
      {body}
    </section>
  )
}

export default FiringAlerts
