import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Service, fetchServices } from '../services/api'
import { ErrorPanel, LoadingPanel, NoticePanel } from '../components/StatusPanel'

/* ------------------------------------------------------------------ *
 * Observability entry points.
 *
 * This page queries no metric store. Grafana holds the Prometheus and Loki
 * credentials, so the browser only receives links with URL-encoded variables;
 * no data source credential is ever injected here.
 * ------------------------------------------------------------------ */

const GRAFANA_URL = (import.meta.env.VITE_GRAFANA_URL || 'https://monitoring.bnbong.com').replace(
  /\/+$/,
  ''
)

const RANGES = [
  { value: 'now-1h', label: '최근 1시간' },
  { value: 'now-6h', label: '최근 6시간' },
  { value: 'now-24h', label: '최근 24시간' },
  { value: 'now-7d', label: '최근 7일' },
]

const ALL_SERVICES = '__all__'

function ObservabilityPage() {
  const [serviceName, setServiceName] = useState<string>(ALL_SERVICES)
  const [range, setRange] = useState(RANGES[2].value)

  const servicesQuery = useQuery<Service[]>({
    queryKey: ['admin-services'],
    queryFn: fetchServices,
  })

  const links = useMemo(() => {
    const isAll = serviceName === ALL_SERVICES
    const logSelector = isAll ? '{job=~".+"}' : `{service="${serviceName}"}`
    const exploreState = {
      datasource: 'loki',
      queries: [{ refId: 'A', expr: logSelector }],
      range: { from: range, to: 'now' },
    }

    const exploreParams = new URLSearchParams()
    exploreParams.set('left', JSON.stringify(exploreState))

    const dashboardParams = new URLSearchParams()
    dashboardParams.set('from', range)
    dashboardParams.set('to', 'now')
    dashboardParams.set('var-service', isAll ? 'All' : serviceName)

    return {
      explore: `${GRAFANA_URL}/explore?${exploreParams.toString()}`,
      dashboards: `${GRAFANA_URL}/dashboards?${dashboardParams.toString()}`,
      home: GRAFANA_URL,
    }
  }, [serviceName, range])

  const services = servicesQuery.data

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Observability</p>
          <h1 className="page-title">관측</h1>
          <p className="page-lead">
            로그와 지표는 Grafana가 보관합니다. 이 화면은 서비스와 기간을 골라 Grafana로 이동하는
            입구이며, 직접 로그를 조회하지 않습니다.
          </p>
        </div>
      </div>

      <NoticePanel tone="info" title="이 화면은 데이터를 직접 조회하지 않습니다">
        <p>
          Prometheus와 Loki 자격 증명은 브라우저로 전달되지 않습니다. 조회 권한은 Grafana 계정으로
          확인합니다.
        </p>
      </NoticePanel>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Scope</p>
            <h2 className="section-title">조회 범위</h2>
          </div>
        </div>

        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="obs-service">서비스</label>
              <select
                id="obs-service"
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                disabled={servicesQuery.isLoading}
              >
                <option value={ALL_SERVICES}>전체 서비스</option>
                {(services || []).map((service) => (
                  <option key={service.id} value={service.name}>
                    {service.display_name || service.name}
                  </option>
                ))}
              </select>
              {servicesQuery.isLoading && <span className="field-hint">목록을 불러오는 중입니다.</span>}
            </div>

            <div className="field">
              <label htmlFor="obs-range">기간</label>
              <select id="obs-range" value={range} onChange={(event) => setRange(event.target.value)}>
                {RANGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">기간은 Grafana 상대 시각 표기를 그대로 전달합니다.</span>
            </div>
          </div>

          <div className="form-actions">
            <a className="btn btn--primary" href={links.explore} target="_blank" rel="noopener noreferrer">
              로그 탐색 열기
            </a>
            <a className="btn" href={links.dashboards} target="_blank" rel="noopener noreferrer">
              대시보드 목록 열기
            </a>
            <a className="btn" href={links.home} target="_blank" rel="noopener noreferrer">
              Grafana 홈
            </a>
          </div>

          <p className="detail spaced-top break-all">
            이동 주소 <span className="mono">{links.explore}</span>
          </p>
        </div>
      </section>

      {servicesQuery.isError && (
        <ErrorPanel
          title="서비스 목록을 불러오지 못했습니다"
          error={servicesQuery.error}
          fallbackMessage="서비스 목록을 가져오지 못해 전체 범위로만 이동할 수 있습니다"
          onRetry={() => servicesQuery.refetch()}
        />
      )}

      {servicesQuery.isLoading && <LoadingPanel message="서비스 목록을 불러오는 중입니다." />}
    </div>
  )
}

export default ObservabilityPage
