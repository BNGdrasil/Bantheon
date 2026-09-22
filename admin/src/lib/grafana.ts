/* ------------------------------------------------------------------ *
 * Grafana link targets.
 *
 * The dashboards are provisioned by baedalus with fixed uids, so a link can
 * point at `d/<uid>` directly. `/dashboards` is only the browse list: it has
 * no template variables of its own, so a `var-*` query string handed to it is
 * dropped and the operator lands on an unfiltered page.
 *
 * Only the dashboards that actually declare a variable receive one. Sending
 * `var-service` to a dashboard without that variable would look like a filter
 * that is not applied.
 * ------------------------------------------------------------------ */

export const GRAFANA_URL = (
  import.meta.env.VITE_GRAFANA_URL || 'https://monitoring.bnbong.com'
).replace(/\/+$/, '')

/** Provisioned dashboard uids, as defined in baedalus/monitoring/grafana. */
export const DASHBOARD_UIDS = {
  overview: 'bngdrasil-overview',
  gateway: 'bngdrasil-gateway',
  authServer: 'bngdrasil-auth-server',
  logs: 'bngdrasil-logs',
  backup: 'bngdrasil-backup',
  probes: 'bngdrasil-probes',
  hosts: 'bngdrasil-hosts',
  containers: 'bngdrasil-containers',
} as const

export type DashboardKey = keyof typeof DASHBOARD_UIDS

/** Which template variables each dashboard declares. */
export interface DashboardLinkSpec {
  key: DashboardKey
  label: string
  note: string
  acceptsService: boolean
}

export const DASHBOARD_LINKS: DashboardLinkSpec[] = [
  {
    key: 'overview',
    label: '개요',
    note: '전체 스택의 요약 지표입니다.',
    acceptsService: false,
  },
  {
    key: 'gateway',
    label: '게이트웨이',
    note: 'Bifrost의 요청량과 지연, 상태 코드를 봅니다. 서비스 변수를 전달합니다.',
    acceptsService: true,
  },
  {
    key: 'authServer',
    label: '인증 서버',
    note: 'Bidar의 지표입니다.',
    acceptsService: false,
  },
  {
    key: 'logs',
    label: '로그',
    note: 'Loki 로그 대시보드입니다. 서비스 변수를 전달합니다.',
    acceptsService: true,
  },
  {
    key: 'backup',
    label: '백업',
    note: '백업 작업의 성공 여부와 최근 실행 시각입니다.',
    acceptsService: false,
  },
  {
    key: 'probes',
    label: '외형 감시',
    note: 'Blackbox probe 결과입니다.',
    acceptsService: false,
  },
  {
    key: 'hosts',
    label: '호스트',
    note: '가상 머신의 자원 사용량입니다.',
    acceptsService: false,
  },
  {
    key: 'containers',
    label: '컨테이너',
    note: '컨테이너 단위의 자원 사용량입니다.',
    acceptsService: false,
  },
]

export interface DashboardLinkOptions {
  from: string
  to?: string
  /** Value for `var-service`; omitted when the dashboard has no such variable. */
  service?: string
}

/** Builds a deep link to one provisioned dashboard. */
export function dashboardUrl(spec: DashboardLinkSpec, options: DashboardLinkOptions): string {
  const params = new URLSearchParams()
  params.set('from', options.from)
  params.set('to', options.to ?? 'now')
  if (spec.acceptsService && options.service) {
    params.set('var-service', options.service)
  }
  return `${GRAFANA_URL}/d/${DASHBOARD_UIDS[spec.key]}?${params.toString()}`
}

/** Builds an Explore link for a Loki selector the operator wrote. */
export function exploreUrl(selector: string, from: string, to = 'now'): string {
  const exploreState = {
    datasource: 'loki',
    queries: [{ refId: 'A', expr: selector }],
    range: { from, to },
  }
  const params = new URLSearchParams()
  params.set('left', JSON.stringify(exploreState))
  return `${GRAFANA_URL}/explore?${params.toString()}`
}
