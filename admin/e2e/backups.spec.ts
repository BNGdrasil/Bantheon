import { expect, test } from '@playwright/test'
import { GRAFANA_BASE_URL } from './env'
import { resetMock, restoreSession, setMode } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('보고된 백업 지표를 구성 요소별로 읽고 미보고를 0으로 바꾸지 않는다', async ({ page }) => {
  await page.goto('/backups')

  await expect(page.getByRole('heading', { name: '백업', level: 1 })).toBeVisible()
  await expect(page.getByText('확인이 필요한 구성 요소가 1건 있습니다')).toBeVisible()

  const shipCard = page.locator('article.card').filter({ hasText: 'ship' })
  // The shipping job publishes no unshipped counter, so the row reads 미보고
  // instead of 0.
  await expect(shipCard.getByText('미보고', { exact: true })).toHaveCount(1)

  const table = page.locator('table.data-table')
  await expect(table.getByText('redis-vm3', { exact: true })).toBeVisible()
  await expect(table.getByText('실패', { exact: true })).toBeVisible()

  await expect(page.getByRole('link', { name: '백업 대시보드 열기' })).toHaveAttribute(
    'href',
    `${GRAFANA_BASE_URL}/d/bngdrasil-backup?from=now-7d&to=now`
  )
})

test('보고된 시계열이 없으면 빈 목록을 정상으로 그리지 않는다', async ({ page, request }) => {
  await setMode(request, { backups: 'unavailable' })

  await page.goto('/backups')

  await expect(page.getByText('백업 지표가 아직 보고되지 않았습니다')).toBeVisible()
  await expect(
    page.getByText('Prometheus에 bngdrasil_backup_ 계열 시계열이 아직 없습니다.')
  ).toBeVisible()
  await expect(page.locator('article.card')).toHaveCount(0)
})

test('PROMETHEUS_URL이 없으면 501을 설정 안내로 표시한다', async ({ page, request }) => {
  await setMode(request, { backups: 'not_implemented' })

  await page.goto('/backups')

  await expect(
    page.getByText('게이트웨이에 PROMETHEUS_URL이 설정되어 있지 않습니다')
  ).toBeVisible()
  await expect(page.getByText('PROMETHEUS_URL is not configured')).toBeVisible()
})

test('Prometheus 조회가 실패하면 502 이유를 그대로 옮긴다', async ({ page, request }) => {
  await setMode(request, { backups: 'bad_gateway' })

  await page.goto('/backups')

  await expect(page.getByText('Prometheus를 조회하지 못했습니다')).toBeVisible()
  await expect(
    page.getByText('Prometheus query failed: timed out after 3.0s', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
})
