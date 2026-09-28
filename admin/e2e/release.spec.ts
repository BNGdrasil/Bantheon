import { expect, test } from '@playwright/test'
import { resetMock, restoreSession } from './helpers'

/* ------------------------------------------------------------------ *
 * Build provenance on the service detail screen and the console's own
 * release marker on the settings screen.
 *
 * The gateway holds an upstream's build in the process that ran the probe
 * rather than in the database, so the two states that matter are "observed"
 * and "not observed", and the screen has to say which one it is looking at.
 * ------------------------------------------------------------------ */

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('상세 화면이 마지막 프로브가 읽은 업스트림 빌드를 보여준다', async ({ page }) => {
  await page.goto('/services/1')
  await expect(page.getByRole('heading', { name: '인증 서버', level: 1 })).toBeVisible()

  const health = page.locator('section').filter({ hasText: '마지막으로 기록된 상태' })
  await expect(health.getByText('업스트림 빌드', { exact: true })).toBeVisible()

  const sha = health.getByText('deadbeefcafe', { exact: true })
  await expect(sha).toBeVisible()
  await expect(sha).toHaveAttribute('title', 'deadbeefcafe0123456789abcdef0123456789ab')

  await expect(health.getByText('0.2.0', { exact: true })).toBeVisible()
  await expect(health.getByText('main', { exact: true })).toBeVisible()
  await expect(health.getByText('2026. 09. 28. 13:05:06 KST', { exact: true })).toBeVisible()
  await expect(health.getByText('2026. 09. 28. 15:43:35 KST', { exact: true })).toBeVisible()
  // The observation time is the moment the probe ran, not the stored check.
  await expect(health.getByText(/관측 시각 2026\. 09\. 28\. 10:00:00 KST/)).toBeVisible()
})

test('비활성 서비스는 프로브 대상이 아니라고 적고, 상태 검사 뒤에도 비어 있다', async ({
  page,
}) => {
  await page.goto('/services/3')
  await expect(page.getByRole('heading', { name: 'sandbox', level: 1 })).toBeVisible()

  // The registry snapshot is built from the active rows alone, so this service
  // is registered and not routed, and the screen says that rather than
  // suggesting a probe would fill the block.
  const health = page.locator('section').filter({ hasText: '마지막으로 기록된 상태' })
  await expect(
    health.getByText('이 서비스는 비활성으로 등록되어 있어서 게이트웨이 등록부에 적재되지 않습니다.')
  ).toBeVisible()

  await page.getByRole('button', { name: '전체 서비스 상태 검사' }).click()

  await expect(
    page.getByText('이 서비스는 비활성으로 등록되어 있어서 검사 대상이 아닙니다.')
  ).toBeVisible()
  // The run covered the two active services only.
  await expect(page.getByText('대상 2건.')).toBeVisible()
  await expect(health.getByText('0123456789ab', { exact: true })).toHaveCount(0)
})

test('등록부를 다시 적재하면 관측한 빌드가 사라지고, 상태 검사가 다시 채운다', async ({
  page,
}) => {
  await page.goto('/services/1')
  await expect(page.getByRole('heading', { name: '인증 서버', level: 1 })).toBeVisible()

  const health = page.locator('section').filter({ hasText: '마지막으로 기록된 상태' })
  await expect(health.getByText('deadbeefcafe', { exact: true })).toBeVisible()

  // The gateway keeps the observed build in the snapshot it swaps out, so a
  // reload leaves nothing to report until the next probe runs.
  await page.goto('/services')
  await page.getByRole('button', { name: '등록부 다시 적재' }).click()
  await expect(page.getByText('등록부에 2건을 적재했습니다.')).toBeVisible()

  await page.goto('/services/1')
  await expect(
    health.getByText('이 서비스는 빌드 정보를 보고하지 않거나 아직 프로브하지 않았습니다.')
  ).toBeVisible()

  await page.getByRole('button', { name: '전체 서비스 상태 검사' }).click()

  // The run answers with `details`, so the observed build lands on screen
  // without waiting for the next poll of the stored record.
  const sha = health.getByText('deadbeefcafe', { exact: true })
  await expect(sha).toBeVisible()
  await expect(sha).toHaveAttribute('title', 'deadbeefcafe0123456789abcdef0123456789ab')
  await expect(health.getByText('main', { exact: true })).toBeVisible()
})

test('업스트림이 빌드를 보고하지 않으면 검사한 뒤에도 그 사실을 그대로 적는다', async ({
  page,
}) => {
  await page.goto('/services/2')
  await expect(page.getByRole('heading', { name: '블로그', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: '전체 서비스 상태 검사' }).click()
  await expect(page.getByText('이 서비스 결과')).toBeVisible()

  // The probe ran and the upstream published nothing, so the screen keeps the
  // honest sentence instead of drawing five empty rows.
  const health = page.locator('section').filter({ hasText: '마지막으로 기록된 상태' })
  await expect(
    health.getByText('이 서비스는 빌드 정보를 보고하지 않거나 아직 프로브하지 않았습니다.')
  ).toBeVisible()
})

test('설정 화면은 release.json이 없는 빌드를 미기록으로 적는다', async ({ page }) => {
  await page.goto('/settings')

  const consoleBuild = page.locator('section').filter({ hasText: '콘솔 빌드' })
  await expect(consoleBuild.getByRole('heading', { name: '콘솔 빌드' })).toBeVisible()
  // The preview server serves the bundle without a release marker, which is
  // what a local build looks like as well.
  await expect(consoleBuild.getByText('미기록', { exact: true })).toBeVisible()
  await expect(consoleBuild.getByText('release.json', { exact: true }).first()).toBeVisible()
})
