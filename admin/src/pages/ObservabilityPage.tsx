import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Service, fetchServices } from '../services/api'
import { ErrorPanel, LoadingPanel, NoticePanel } from '../components/StatusPanel'
import {
  DASHBOARD_LINKS,
  GRAFANA_URL,
  dashboardUrl,
  exploreUrl,
} from '../lib/grafana'

/* ------------------------------------------------------------------ *
 * Observability entry points.
 *
 * This page queries no metric store. Grafana holds the Prometheus and Loki
 * credentials, so the browser only receives links with URL-encoded variables;
 * no data source credential is ever injected here.
 *
 * The service picker fills in a starting selector, it does not decide one.
 * Loki labels the stream with the compose service name that Alloy reads from
 * the container, while the picker lists the names registered in the gateway.
 * The two namespaces agree for some services and differ for others, and the
 * console has no mapping between them, so the selector stays editable and the
 * mismatch is stated on screen instead of being papered over with a wider
 * regular expression.
 * ------------------------------------------------------------------ */

const RANGES = [
  { value: 'now-1h', label: '최근 1시간' },
  { value: 'now-6h', label: '최근 6시간' },
  { value: 'now-24h', label: '최근 24시간' },
  { value: 'now-7d', label: '최근 7일' },
]

const ALL_SERVICES = '__all__'

const ALL_SELECTOR = '{job=~".+"}'

function defaultSelector(serviceName: string): string {
  return serviceName === ALL_SERVICES ? ALL_SELECTOR : `{service="${serviceName}"}`
}

function ObservabilityPage() {
  const [serviceName, setServiceName] = useState<string>(ALL_SERVICES)
  const [range, setRange] = useState(RANGES[2].value)
  const [selector, setSelector] = useState<string>(defaultSelector(ALL_SERVICES))
  const [selectorEdited, setSelectorEdited] = useState(false)

  const servicesQuery = useQuery<Service[]>({
    queryKey: ['admin-services'],
    queryFn: fetchServices,
  })

  // Changing the service refills the selector, unless the operator has already
  // written one; overwriting a hand-corrected label would undo the correction.
  useEffect(() => {
    if (!selectorEdited) {
      setSelector(defaultSelector(serviceName))
    }
  }, [serviceName, selectorEdited])

  const trimmedSelector = selector.trim()
  const selectorIsEmpty = trimmedSelector === ''

  const exploreLink = useMemo(
    () => exploreUrl(selectorIsEmpty ? ALL_SELECTOR : trimmedSelector, range),
    [trimmedSelector, selectorIsEmpty, range]
  )

  const serviceVariable = serviceName === ALL_SERVICES ? 'All' : serviceName

  const dashboardLinks = useMemo(
    () =>
      DASHBOARD_LINKS.map((spec) => ({
        spec,
        href: dashboardUrl(spec, { from: range, to: 'now', service: serviceVariable }),
      })),
    [range, serviceVariable]
  )

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

      <NoticePanel tone="warning" title="등록 이름과 로그 라벨은 서로 다른 값일 수 있습니다">
        <p>
          서비스 목록은 게이트웨이에 등록된 이름을 보여 주지만, Loki의 <span className="mono">service</span>{' '}
          라벨에는 컨테이너를 띄운 compose 서비스 이름이 들어갑니다. 예를 들어 게이트웨이는{' '}
          <span className="mono">gateway</span>, 인증 서버는 <span className="mono">auth-server</span>{' '}
          라벨로 기록됩니다. 두 이름이 같다는 보장은 없고 콘솔은 그 대응 관계를 알지 못하므로, 아래
          질의는 기본값만 채워 두고 실제 라벨은 직접 고쳐 쓰도록 열어 두었습니다. 결과가 비어 있으면
          장애가 아니라 라벨이 어긋난 경우일 수 있습니다.
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

            <div className="field field--full">
              <label htmlFor="obs-selector">로그 질의 (LogQL 선택자)</label>
              <input
                id="obs-selector"
                className="mono"
                type="text"
                value={selector}
                onChange={(event) => {
                  setSelector(event.target.value)
                  setSelectorEdited(true)
                }}
              />
              <span className="field-hint">
                서비스를 고르면 등록 이름으로 기본값을 채웁니다. compose 이름이 다르면 이 값을 고쳐
                주세요. 비워 두면 {ALL_SELECTOR}로 이동합니다.
              </span>
              {selectorEdited && (
                <div className="toolbar spaced-top-sm">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setSelectorEdited(false)
                      setSelector(defaultSelector(serviceName))
                    }}
                  >
                    기본값으로 되돌리기
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <a className="btn btn--primary" href={exploreLink} target="_blank" rel="noopener noreferrer">
              로그 탐색 열기
            </a>
            <a className="btn" href={GRAFANA_URL} target="_blank" rel="noopener noreferrer">
              Grafana 홈
            </a>
          </div>

          <p className="detail spaced-top break-all">
            이동 주소 <span className="mono">{exploreLink}</span>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Dashboards</p>
            <h2 className="section-title">대시보드 바로 가기</h2>
          </div>
        </div>

        <p className="detail spaced-bottom">
          baedalus가 배포한 대시보드의 고정 uid로 바로 이동합니다. 서비스 변수를 받는 대시보드에만
          선택한 서비스를 전달하며, 나머지는 기간만 전달합니다.
        </p>

        <div className="card-grid">
          {dashboardLinks.map(({ spec, href }) => (
            <article className="card" key={spec.key}>
              <p className="eyebrow">{spec.acceptsService ? 'var-service 전달' : '기간만 전달'}</p>
              <p className="subsection-title">{spec.label}</p>
              <p className="metric-note">{spec.note}</p>
              <div className="form-actions">
                <a className="btn btn--sm" href={href} target="_blank" rel="noopener noreferrer">
                  열기
                </a>
              </div>
            </article>
          ))}
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
