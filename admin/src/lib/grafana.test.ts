import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_LINKS,
  DASHBOARD_UIDS,
  GRAFANA_URL,
  dashboardUrl,
  exploreUrl,
} from './grafana'

/* ------------------------------------------------------------------ *
 * Grafana link construction.
 *
 * The uids are provisioned by baedalus, so a typo here sends the operator to a
 * dashboard that does not exist. The variable rule matters just as much: a
 * `var-service` handed to a dashboard that declares no such variable is
 * silently dropped and looks like a filter that was applied.
 * ------------------------------------------------------------------ */

const specFor = (key: string) => {
  const spec = DASHBOARD_LINKS.find((item) => item.key === key)
  if (!spec) {
    throw new Error(`no dashboard link spec for ${key}`)
  }
  return spec
}

describe('DASHBOARD_UIDS', () => {
  it('keeps the uids baedalus provisions', () => {
    expect(DASHBOARD_UIDS).toEqual({
      overview: 'bngdrasil-overview',
      gateway: 'bngdrasil-gateway',
      authServer: 'bngdrasil-auth-server',
      logs: 'bngdrasil-logs',
      backup: 'bngdrasil-backup',
      probes: 'bngdrasil-probes',
      hosts: 'bngdrasil-hosts',
      containers: 'bngdrasil-containers',
    })
  })

  it('declares a link for every uid', () => {
    expect(DASHBOARD_LINKS.map((spec) => spec.key).sort()).toEqual(Object.keys(DASHBOARD_UIDS).sort())
  })

  it('marks exactly the two dashboards that declare a service variable', () => {
    expect(DASHBOARD_LINKS.filter((spec) => spec.acceptsService).map((spec) => spec.key)).toEqual([
      'gateway',
      'logs',
    ])
  })
})

describe('dashboardUrl', () => {
  it('points at d/<uid> and carries the range', () => {
    expect(dashboardUrl(specFor('backup'), { from: 'now-7d', to: 'now' })).toBe(
      `${GRAFANA_URL}/d/bngdrasil-backup?from=now-7d&to=now`
    )
  })

  it('defaults the end of the range to now', () => {
    expect(dashboardUrl(specFor('overview'), { from: 'now-6h' })).toBe(
      `${GRAFANA_URL}/d/bngdrasil-overview?from=now-6h&to=now`
    )
  })

  it('attaches var-service to a dashboard that declares it', () => {
    expect(dashboardUrl(specFor('gateway'), { from: 'now-1h', service: 'auth-server' })).toBe(
      `${GRAFANA_URL}/d/bngdrasil-gateway?from=now-1h&to=now&var-service=auth-server`
    )
  })

  it('omits var-service on a dashboard that declares none', () => {
    const url = dashboardUrl(specFor('hosts'), { from: 'now-1h', service: 'auth-server' })
    expect(url).toBe(`${GRAFANA_URL}/d/bngdrasil-hosts?from=now-1h&to=now`)
    expect(url).not.toContain('var-service')
  })

  it('omits var-service when no service was chosen', () => {
    expect(dashboardUrl(specFor('logs'), { from: 'now-1h' })).not.toContain('var-service')
  })

  it('encodes a service name that needs escaping', () => {
    expect(dashboardUrl(specFor('logs'), { from: 'now-1h', service: 'a b&c' })).toContain(
      'var-service=a+b%26c'
    )
  })
})

describe('exploreUrl', () => {
  it('encodes the selector and range into the left pane state', () => {
    const url = exploreUrl('{service="gateway"}', 'now-24h')
    const left = new URL(url).searchParams.get('left')
    expect(JSON.parse(left as string)).toEqual({
      datasource: 'loki',
      queries: [{ refId: 'A', expr: '{service="gateway"}' }],
      range: { from: 'now-24h', to: 'now' },
    })
  })

  it('takes an explicit end of range', () => {
    const left = new URL(exploreUrl('{job=~".+"}', 'now-1h', 'now-30m')).searchParams.get('left')
    expect(JSON.parse(left as string).range).toEqual({ from: 'now-1h', to: 'now-30m' })
  })
})
