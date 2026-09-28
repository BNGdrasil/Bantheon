import { expect, test } from '@playwright/test'
import { GRAFANA_BASE_URL } from './env'
import { resetMock, restoreSession } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('대시보드 링크가 고정 uid 주소를 담고 변수는 선언한 대시보드에만 붙는다', async ({ page }) => {
  await page.goto('/observability')

  await expect(page.getByRole('heading', { name: '관측', level: 1 })).toBeVisible()

  const hrefs = await page
    .getByRole('link', { name: '열기', exact: true })
    .evaluateAll((nodes: Element[]) => nodes.map((node) => node.getAttribute('href') ?? ''))

  // `/dashboards` is only the browse list and drops `var-service`, so every
  // link points at `d/<uid>` directly. The uids come from baedalus and are
  // fixed, which is what makes a deep link possible at all.
  expect(hrefs).toEqual([
    `${GRAFANA_BASE_URL}/d/bngdrasil-overview?from=now-24h&to=now`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-gateway?from=now-24h&to=now&var-service=All`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-auth-server?from=now-24h&to=now`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-logs?from=now-24h&to=now&var-service=All`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-backup?from=now-24h&to=now`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-probes?from=now-24h&to=now`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-hosts?from=now-24h&to=now`,
    `${GRAFANA_BASE_URL}/d/bngdrasil-containers?from=now-24h&to=now`,
  ])
})

test('서비스를 고르면 로그 탐색 링크의 선택자가 함께 바뀐다', async ({ page }) => {
  await page.goto('/observability')

  await page.locator('#obs-service').selectOption('blog')
  await expect(page.locator('#obs-selector')).toHaveValue('{service="blog"}')

  const exploreHref = await page
    .getByRole('link', { name: '로그 탐색 열기' })
    .getAttribute('href')
  expect(exploreHref).toContain(`${GRAFANA_BASE_URL}/explore?left=`)
  // Grafana reads `left` as JSON, so the selector is compared after parsing
  // rather than as a substring of the encoded query string.
  const exploreState = JSON.parse(
    new URL(exploreHref ?? '').searchParams.get('left') ?? '{}'
  ) as { datasource?: string; queries?: { expr?: string }[] }
  expect(exploreState.datasource).toBe('loki')
  expect(exploreState.queries?.[0]?.expr).toBe('{service="blog"}')

  // The gateway dashboard declares var-service, so the choice reaches it too.
  const gatewayHref = await page
    .getByRole('link', { name: '열기', exact: true })
    .nth(1)
    .getAttribute('href')
  expect(gatewayHref).toBe(
    `${GRAFANA_BASE_URL}/d/bngdrasil-gateway?from=now-24h&to=now&var-service=blog`
  )
})
