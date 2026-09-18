import { useQuery } from '@tanstack/react-query'
import { OverviewStats, Service, fetchOverviewStats, fetchServices } from '../services/api'
import {
  ErrorPanel,
  FreshnessLine,
  LoadingPanel,
  NOT_COLLECTED_LABEL,
  NoticePanel,
} from '../components/StatusPanel'
import { POLL_INTERVAL_MS, formatKst, useNow } from '../lib/datetime'
import { HealthBadge } from '../components/HealthBadge'

/**
 * Retired and unconfigured assets, kept as reviewed static text. The console
 * does not call OCI when the page opens, and a retired machine must not be
 * drawn as an ongoing outage.
 */
const INFRA_HISTORY = [
  { name: 'VM4', state: '미구성 예비', note: 'DB 미구성 자원입니다. 장애가 아닙니다.' },
  { name: 'VM5 · VM6', state: '퇴역', note: '삭제 이력이 있으며 이후 게임 서버도 닫힌 상태입니다.' },
  { name: 'MongoDB', state: '퇴역 예정', note: '아직 중지하거나 삭제하지 않았습니다.' },
]

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

  const stats = overviewQuery.data
  const services = servicesQuery.data

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
            등록부는 DB의 서비스 정의를 게이트웨이 프로세스에 반영한 결과입니다.
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

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Lifecycle</p>
            <h2 className="section-title">인프라 이력</h2>
          </div>
        </div>
        <div className="card card--soft">
          <p className="detail">
            아래 항목은 검토된 정적 기록입니다. 퇴역과 미구성은 장애가 아니며 실시간 조회 결과도
            아닙니다.
          </p>
          <div className="definition-list spaced-top">
            {INFRA_HISTORY.map((item) => (
              <div key={item.name}>
                <p className="definition-term mono">{item.name}</p>
                <p className="subsection-title">{item.state}</p>
                <p className="detail">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default DashboardPage
