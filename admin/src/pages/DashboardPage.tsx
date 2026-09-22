import { useQuery } from '@tanstack/react-query'
import {
  OverviewStats,
  Readiness,
  Service,
  fetchOverviewStats,
  fetchReadiness,
  fetchServices,
} from '../services/api'
import {
  ErrorPanel,
  FreshnessLine,
  LoadingPanel,
  NOT_COLLECTED_LABEL,
  NoticePanel,
} from '../components/StatusPanel'
import { POLL_INTERVAL_MS, formatKst, useNow } from '../lib/datetime'
import { HealthBadge } from '../components/HealthBadge'

/** Badge tone for one component of the readiness probe. */
function readinessTone(value: string): string {
  if (value === 'ok' || value === 'ready') {
    return 'badge--success'
  }
  if (value === 'degraded') {
    return 'badge--warning'
  }
  return 'badge--danger'
}

const READINESS_LABELS: Record<string, string> = {
  ready: '준비됨',
  not_ready: '준비되지 않음',
  ok: '정상',
  degraded: '적재되지 않음',
  error: '연결 실패',
}

function readinessLabel(value: string): string {
  return READINESS_LABELS[value] || value
}

function DashboardPage() {
  const now = useNow()

  const overviewQuery = useQuery<OverviewStats>({
    queryKey: ['overview-stats'],
    queryFn: fetchOverviewStats,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  const servicesQuery = useQuery<Service[]>({
    queryKey: ['admin-services'],
    queryFn: fetchServices,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  // `/ready` answers 503 with a body that explains which dependency failed, so
  // a 503 is a reading and not a failed request. Only a network error or an
  // unexpected status lands in the error branch. Retries are off because the
  // poll already repeats the call, and a retry would delay a bad reading.
  const readinessQuery = useQuery<Readiness>({
    queryKey: ['gateway-readiness'],
    queryFn: fetchReadiness,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  })

  const stats = overviewQuery.data
  const services = servicesQuery.data
  const readiness = readinessQuery.data

  const readinessSection = (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">Gateway readiness</p>
          <h2 className="section-title">게이트웨이 준비 상태</h2>
        </div>
        <FreshnessLine
          dataUpdatedAt={readinessQuery.dataUpdatedAt}
          now={now}
          isFetching={readinessQuery.isFetching}
          label="준비 상태 갱신"
        />
      </div>

      <p className="detail spaced-bottom">
        게이트웨이 루트의 <span className="mono">/ready</span> 응답입니다. 위의 등록부 카드는 관리자
        API의 개요 통계에서 온 값이라 출처가 다르며, 두 값을 하나로 합쳐 보여주지 않습니다.
      </p>

      {readinessQuery.isLoading ? (
        <LoadingPanel message="준비 상태를 확인하는 중입니다." />
      ) : readinessQuery.isError || !readiness ? (
        <ErrorPanel
          title="준비 상태를 확인하지 못했습니다"
          error={readinessQuery.error}
          fallbackMessage="게이트웨이 준비 상태를 가져오지 못했습니다"
          onRetry={() => readinessQuery.refetch()}
        />
      ) : (
        <>
          <div className="card-grid">
            <article className="card">
              <p className="eyebrow">Status</p>
              <p className="metric-value metric-value--text">{readinessLabel(readiness.status)}</p>
              <div className="badge-row">
                <span className={`badge ${readinessTone(readiness.status)}`}>
                  {readiness.status === 'ready' ? '정상' : '확인 필요'}
                </span>
                <span className="detail mono">{readiness.status}</span>
              </div>
              <p className="metric-note">
                데이터베이스와 등록부가 모두 정상일 때만 준비됨으로 응답합니다.
              </p>
            </article>

            <article className="card">
              <p className="eyebrow">Database</p>
              <p className="metric-value metric-value--text">{readinessLabel(readiness.database)}</p>
              <div className="badge-row">
                <span className={`badge ${readinessTone(readiness.database)}`}>
                  {readiness.database === 'ok' ? '연결됨' : '확인 필요'}
                </span>
              </div>
              <p className="metric-note">게이트웨이가 방금 데이터베이스 연결을 확인한 결과입니다.</p>
            </article>

            <article className="card">
              <p className="eyebrow">Registry</p>
              <p className="metric-value metric-value--text">{readinessLabel(readiness.registry)}</p>
              <div className="badge-row">
                <span className={`badge ${readinessTone(readiness.registry)}`}>
                  {readiness.registry === 'ok' ? '정상' : '확인 필요'}
                </span>
              </div>
              <p className="metric-note">등록부가 게이트웨이 프로세스에 적재되어 있는지를 뜻합니다.</p>
            </article>

            <article className="card">
              <p className="eyebrow">Service count</p>
              <p className="metric-value">{readiness.service_count}</p>
              <p className="metric-note">
                <span className="mono">/ready</span>가 센 적재 서비스 수입니다.
              </p>
            </article>
          </div>

          {readiness.database_error && (
            <NoticePanel tone="error" title="데이터베이스 오류">
              <p className="mono break-all">{readiness.database_error}</p>
            </NoticePanel>
          )}

          {readiness.registry_error && (
            <NoticePanel tone="error" title="등록부 오류">
              <p className="mono break-all">{readiness.registry_error}</p>
            </NoticePanel>
          )}
        </>
      )}
    </section>
  )

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Infrastructure / Overview</p>
        <h1 className="page-title">운영 개요</h1>
        <p className="page-lead">
          등록된 서비스의 상태와 게이트웨이 등록부 반영 결과를 확인합니다. 수집하지 않는 값은
          {` ${NOT_COLLECTED_LABEL}`}으로 표시하며 임의의 숫자를 채우지 않습니다.
        </p>
      </div>
      <FreshnessLine
        dataUpdatedAt={overviewQuery.dataUpdatedAt}
        now={now}
        isFetching={overviewQuery.isFetching}
      />
    </div>
  )

  if (overviewQuery.isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="개요를 불러오는 중입니다." />
      </div>
    )
  }

  if (overviewQuery.isError || !stats) {
    return (
      <div>
        {header}
        <ErrorPanel
          title="개요를 불러오지 못했습니다"
          error={overviewQuery.error}
          fallbackMessage="개요 통계를 가져오지 못했습니다"
          onRetry={() => overviewQuery.refetch()}
        />
        {/* Readiness comes from a different endpoint, so it is still worth
            showing when the admin API call fails. */}
        {readinessSection}
      </div>
    )
  }

  const registry = stats.registry

  return (
    <div>
      {header}

      {!registry.ready && (
        <NoticePanel tone="warning" title="서비스 등록부가 준비되지 않았습니다">
          <p>
            게이트웨이가 등록부를 적재하지 못한 상태입니다. 서비스 화면에서 등록부 다시 적재를
            실행하세요.
          </p>
        </NoticePanel>
      )}

      {registry.last_error && (
        <NoticePanel tone="error" title="등록부 마지막 오류">
          <p className="mono">{registry.last_error}</p>
        </NoticePanel>
      )}

      <div className="card-grid">
        <article className="card">
          <p className="eyebrow">01 / Services</p>
          <p className="metric-value">
            {stats.services.healthy} / {stats.services.total}
          </p>
          <p className="metric-note">
            정상 응답 서비스 수입니다. 활성 {stats.services.active}건, 응답 실패{' '}
            {stats.services.unhealthy}건, 미관측 {stats.services.unknown}건.
          </p>
        </article>

        <article className="card">
          <p className="eyebrow">02 / Registry</p>
          <p className="metric-value metric-value--text">
            {registry.ready ? '적재 완료' : '적재 실패'}
          </p>
          <div className="badge-row">
            <span className={`badge ${registry.ready ? 'badge--success' : 'badge--danger'}`}>
              {registry.ready ? '정상' : '확인 필요'}
            </span>
            <span className="detail mono">{registry.loaded_services}건 적재</span>
          </div>
          <p className="metric-note">
            등록부는 DB의 서비스 정의를 게이트웨이 프로세스에 반영한 결과입니다. 이 카드의 값은
            관리자 API의 개요 통계에서 왔습니다.
          </p>
        </article>

        <article className="card">
          <p className="eyebrow">03 / Application</p>
          <p className="metric-value metric-value--text mono">{stats.app.version}</p>
          <div className="badge-row">
            <span className="badge badge--neutral">{stats.app.environment}</span>
          </div>
          <p className="metric-note">실행 중인 Bifrost 게이트웨이의 버전과 환경입니다.</p>
        </article>
      </div>

      {readinessSection}

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Service register</p>
            <h2 className="section-title">서비스별 관측 상태</h2>
          </div>
          <FreshnessLine
            dataUpdatedAt={servicesQuery.dataUpdatedAt}
            now={now}
            isFetching={servicesQuery.isFetching}
            label="목록 갱신"
          />
        </div>

        {servicesQuery.isLoading ? (
          <LoadingPanel message="서비스 목록을 불러오는 중입니다." />
        ) : servicesQuery.isError ? (
          <ErrorPanel
            title="서비스 목록을 불러오지 못했습니다"
            error={servicesQuery.error}
            fallbackMessage="서비스 목록을 가져오지 못했습니다"
            onRetry={() => servicesQuery.refetch()}
          />
        ) : !services || services.length === 0 ? (
          <div className="state-block">
            <p className="state-block-title">등록된 서비스가 없습니다</p>
            <p>서비스 화면에서 등록하면 이 목록에 나타납니다.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">서비스</th>
                  <th scope="col">등록 상태</th>
                  <th scope="col">관측 상태</th>
                  <th scope="col">마지막 관측</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <span className="row-name">{service.display_name || service.name}</span>
                      <div className="detail mono">{service.name}</div>
                    </td>
                    <td>
                      <span className={`badge ${service.is_active ? 'badge--info' : 'badge--neutral'}`}>
                        {service.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td>
                      <HealthBadge status={service.health_status} />
                    </td>
                    <td className="mono detail">{formatKst(service.last_health_check, '관측 없음')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Not collected</p>
            <h2 className="section-title">이 화면이 다루지 않는 값</h2>
          </div>
        </div>
        <div className="card-grid">
          <article className="card">
            <p className="eyebrow">사용자 통계</p>
            <p className="metric-value metric-value--unavailable">{NOT_COLLECTED_LABEL}</p>
            <p className="metric-note">
              게이트웨이가 사용자 수를 계산하지 않습니다. 목록은 사용자 화면에서 확인하세요.
            </p>
          </article>
          <article className="card">
            <p className="eyebrow">요청량 · 오류율</p>
            <p className="metric-value metric-value--unavailable">{NOT_COLLECTED_LABEL}</p>
            <p className="metric-note">
              요청 수와 지연은 Prometheus와 Grafana가 보관합니다. 관측 화면에서 이동하세요.
            </p>
          </article>
          <article className="card">
            <p className="eyebrow">자원 사용량</p>
            <p className="metric-value metric-value--unavailable">{NOT_COLLECTED_LABEL}</p>
            <p className="metric-note">
              CPU와 메모리는 이 API가 제공하지 않습니다. 임의 값으로 채우지 않습니다.
            </p>
          </article>
        </div>
      </section>

    </div>
  )
}

export default DashboardPage
