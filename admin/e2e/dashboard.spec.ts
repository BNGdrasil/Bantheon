import { expect, test } from '@playwright/test'
import { GRAFANA_BASE_URL } from './env'
import { resetMock, restoreSession, setMode } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('개요 화면이 준비 상태 카드와 발화 중 알림을 함께 보여준다', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: '운영 개요', level: 1 })).toBeVisible()

  const readiness = page.locator('section').filter({ hasText: '게이트웨이 준비 상태' })
  await expect(readiness.getByText('준비됨', { exact: true })).toBeVisible()
  await expect(readiness.getByText('연결됨', { exact: true })).toBeVisible()

  const alerts = page.locator('section').filter({ hasText: '발화 중 알림' })
  await expect(alerts.getByText('발화 2건', { exact: true })).toBeVisible()
  await expect(alerts.getByText('BackupStale', { exact: true })).toBeVisible()
  await expect(alerts.getByText('TargetDown', { exact: true })).toBeVisible()
  // Alertmanager answered, so each row carries a suppression reading instead
  // of the "확인 불가" placeholder.
  await expect(alerts.getByText('확인 불가', { exact: true })).toHaveCount(0)

  await expect(alerts.getByRole('link', { name: '개요 대시보드 열기' })).toHaveAttribute(
    'href',
    `${GRAFANA_BASE_URL}/d/bngdrasil-overview?from=now-6h&to=now`
  )
})

test('개요 화면이 게이트웨이 릴리스 정보를 빌드 필드별로 보여준다', async ({ page }) => {
  await page.goto('/dashboard')

  const release = page.locator('section').filter({ hasText: '게이트웨이 릴리스' })
  await expect(release.getByRole('heading', { name: '게이트웨이 릴리스' })).toBeVisible()

  // The SHA is cut to twelve characters on screen and kept whole in the title,
  // so a full value can still be read and copied.
  const sha = release.getByText('abcdef012345', { exact: true })
  await expect(sha).toBeVisible()
  await expect(sha).toHaveAttribute('title', 'abcdef0123456789abcdef0123456789abcdef01')

  await expect(release.getByText('0.2.0', { exact: true })).toBeVisible()
  await expect(release.getByText('main', { exact: true })).toBeVisible()
  // Timestamps are rendered in KST with the zone spelled out.
  await expect(release.getByText('2026. 09. 28. 08:10:00 KST', { exact: true })).toBeVisible()
  await expect(release.getByText('2026. 09. 28. 09:15:00 KST', { exact: true })).toBeVisible()
  await expect(release.getByText('기동 이후 경과', { exact: true })).toBeVisible()

  // Every field is recorded here, so the missing-build-argument notice stays
  // away and no field falls back to the not-recorded label.
  await expect(release.getByText('미기록')).toHaveCount(0)
})

test('/ready가 503이면 준비되지 않은 상태와 그 이유를 적는다', async ({ page, request }) => {
  await setMode(request, { ready: 'not_ready' })

  await page.goto('/dashboard')

  const readiness = page.locator('section').filter({ hasText: '게이트웨이 준비 상태' })
  await expect(readiness.getByText('준비되지 않음', { exact: true })).toBeVisible()
  await expect(readiness.getByText('적재되지 않음', { exact: true })).toBeVisible()
  await expect(page.getByText('등록부 오류', { exact: true })).toBeVisible()
  await expect(
    page.getByText('registry snapshot is empty: last reload raised OperationalError', {
      exact: true,
    })
  ).toBeVisible()
})

test('Alertmanager를 확인하지 못하면 억제 상태를 확인 불가로 적는다', async ({ page, request }) => {
  await setMode(request, { alerts: 'alertmanager_down' })

  await page.goto('/dashboard')

  const alerts = page.locator('section').filter({ hasText: '발화 중 알림' })
  await expect(alerts.getByText('Alertmanager 상태를 확인하지 못했습니다')).toBeVisible()
  await expect(alerts.getByText('확인 불가', { exact: true })).toHaveCount(2)
})
