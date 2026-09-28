import { expect, test } from '@playwright/test'
import { resetMock, restoreSession, setMode } from './helpers'

/* ------------------------------------------------------------------ *
 * API key administration.
 *
 * The one behaviour that cannot be checked anywhere else is the plaintext
 * key: it exists in one response, is held in React state, and is gone once
 * the panel closes. These cases follow it from the issue dialog through the
 * confirmation to the refreshed list, and then through a rotation and a
 * revocation.
 * ------------------------------------------------------------------ */

/** `bng_` followed by the 43 characters `secrets.token_urlsafe(32)` produces. */
const PLAINTEXT_PATTERN = /^bng_[A-Za-z0-9_-]{43}$/

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('목록이 활성과 폐기와 만료를 구분해서 그린다', async ({ page }) => {
  await page.goto('/api-keys')

  await expect(page.getByRole('heading', { name: 'API 키', level: 1 })).toBeVisible()

  const table = page.locator('table.data-table')
  const activeRow = page.getByRole('row').filter({ hasText: 'bifrost-gateway' })
  await expect(activeRow.locator('.badge')).toHaveText('활성')
  // The owner id is resolved to a username through the separate user query.
  await expect(activeRow.getByText('e2e-admin (ID 1)')).toBeVisible()
  await expect(activeRow.getByText('bng_Bi7f')).toBeVisible()

  // The active-only filter is on by default, so neither the revoked key nor
  // the one whose expiry has passed is listed yet.
  await expect(table.getByText('retired-runner')).toBeHidden()
  await expect(table.getByText('lapsed-probe')).toBeHidden()

  await page.getByLabel('활성 키만 보기').uncheck()

  // `lapsed-probe` is still `is_active` true on the server; only the expiry
  // comparison tells it apart from an active key.
  const lapsedRow = page.getByRole('row').filter({ hasText: 'lapsed-probe' })
  await expect(lapsedRow.locator('.badge')).toHaveText('만료')
  const retiredRow = page.getByRole('row').filter({ hasText: 'retired-runner' })
  await expect(retiredRow.locator('.badge')).toHaveText('폐기')
  // A revoked key cannot be rotated or revoked again.
  await expect(retiredRow.getByRole('button', { name: 'retired-runner 회전' })).toBeDisabled()
})

test('소유자 필터가 서버 질의를 좁힌다', async ({ page }) => {
  await page.goto('/api-keys')

  await page.getByLabel('소유자').selectOption({ label: 'operator (ID 2)' })

  const table = page.locator('table.data-table')
  await expect(table.getByText('blog-publisher')).toBeVisible()
  await expect(table.getByText('bifrost-gateway')).toBeHidden()
})

test('발급한 평문 키를 한 번만 보여 주고 확인을 받은 다음 지운다', async ({ page }) => {
  await page.goto('/api-keys')

  await page.getByRole('button', { name: '키 발급' }).click()
  const issueDialog = page.locator('.modal')
  await issueDialog.getByLabel('키 이름').fill('deploy-runner')
  // `e2e-admin` already sits at the active-key ceiling, so the key is issued
  // for `operator`, who holds one active key and one revoked one.
  await issueDialog.getByLabel('소유자').selectOption({ label: 'operator (ID 2)' })
  await issueDialog.getByRole('button', { name: '키 발급' }).click()

  await expect(page.getByRole('heading', { name: '키를 발급했습니다' })).toBeVisible()
  await expect(
    page.getByText('이 창을 닫으면 평문 키를 다시 볼 수 없습니다')
  ).toBeVisible()

  const plaintext = await page.getByTestId('plaintext-key').innerText()
  expect(plaintext.trim()).toMatch(PLAINTEXT_PATTERN)

  // The plaintext never reaches storage or the address bar.
  const stored = await page.evaluate(() => JSON.stringify(window.localStorage))
  expect(stored).not.toContain(plaintext.trim())
  expect(page.url()).not.toContain('bng_')

  // Closing asks once more before the value is dropped.
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page.getByText('정말 닫습니까?')).toBeVisible()
  await page.getByRole('button', { name: '계속 보기' }).click()
  await expect(page.getByTestId('plaintext-key')).toBeVisible()

  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '닫고 지우기' }).click()

  await expect(page.getByTestId('plaintext-key')).toBeHidden()
  await expect(page.getByText('서버는 이 값을 다시 보여줄 수 없습니다.')).toBeVisible()

  // The list was invalidated, so the new key is on screen without a reload.
  const newRow = page.getByRole('row').filter({ hasText: 'deploy-runner' })
  await expect(newRow).toBeVisible()
  await expect(newRow.locator('.badge')).toHaveText('활성')
  await expect(newRow.getByText(plaintext.trim().slice(0, 8))).toBeVisible()
})

test('회전이 구 키를 즉시 폐기하고 새 평문 키를 한 번 보여 준다', async ({ page }) => {
  await page.goto('/api-keys')

  await page.getByRole('button', { name: 'blog-publisher 회전' }).click()

  await expect(page.getByRole('heading', { name: '키를 회전합니다' })).toBeVisible()
  await expect(
    page.getByText('새 키를 먼저 발급하고, 호출자의 설정을 교체한 다음, 구 키를 폐기하세요.').first()
  ).toBeVisible()
  await page.locator('.modal').getByRole('button', { name: '회전' }).click()

  await expect(page.getByRole('heading', { name: '키를 회전했습니다' })).toBeVisible()
  const plaintext = (await page.getByTestId('plaintext-key').innerText()).trim()
  expect(plaintext).toMatch(PLAINTEXT_PATTERN)
  await expect(page.getByText('구 키는 이 순간부터 거절됩니다.')).toBeVisible()

  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '닫고 지우기' }).click()

  // The rotated key inherits the name, so both rows carry it: the new one is
  // active and the old one is revoked. The prefix tells them apart.
  await page.getByLabel('활성 키만 보기').uncheck()
  const rows = page.getByRole('row').filter({ hasText: 'blog-publisher' })
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: plaintext.slice(0, 8) })).toContainText('활성')
  await expect(rows.filter({ hasText: 'bng_Bl2o' })).toContainText('폐기')
})

test('폐기를 확인하면 목록이 갱신되고 그 키가 폐기 상태로 남는다', async ({ page }) => {
  await page.goto('/api-keys')

  await page.getByRole('button', { name: 'bifrost-gateway 폐기' }).click()
  await expect(
    page.getByText('이 키를 사용하는 호출자는 즉시 401을 받습니다.')
  ).toBeVisible()
  await page.locator('.modal').getByRole('button', { name: '폐기' }).click()

  await expect(page.getByText('bifrost-gateway 키를 폐기했습니다.')).toBeVisible()
  // The active-only filter still applies, so the row leaves that view.
  await expect(page.locator('table.data-table').getByText('bifrost-gateway')).toBeHidden()

  await page.getByLabel('활성 키만 보기').uncheck()
  const row = page.getByRole('row').filter({ hasText: 'bifrost-gateway' })
  await expect(row.locator('.badge')).toHaveText('폐기')
})

test('활성 키 상한을 넘기면 서버가 보낸 409 사유를 그대로 적는다', async ({ page }) => {
  await page.goto('/api-keys')

  // `e2e-admin` holds two rows the server counts as active: one live key and
  // one that expired without being revoked.
  await page.getByRole('button', { name: '키 발급' }).click()
  const issueDialog = page.locator('.modal')
  await issueDialog.getByLabel('키 이름').fill('one-too-many')
  await issueDialog.getByLabel('소유자').selectOption({ label: 'e2e-admin (ID 1)' })
  await issueDialog.getByRole('button', { name: '키 발급' }).click()

  // The reason is printed once, inside the dialog that still holds the form.
  await expect(page.getByText('키를 발급하지 못했습니다')).toBeVisible()
  await expect(page.getByText('which is the maximum')).toBeVisible()
  // The dialog stays open with the typed values, so the owner can be changed
  // rather than retyped.
  await expect(issueDialog.getByLabel('키 이름')).toHaveValue('one-too-many')
})

test('관리자 역할에서는 발급과 회전과 폐기 버튼이 잠긴다', async ({ page, request }) => {
  await setMode(request, { role: 'admin' })
  await page.goto('/api-keys')

  await expect(page.getByText('쓰기 권한이 제한되어 있습니다')).toBeVisible()
  // Reading is still allowed, so the list itself is drawn.
  await expect(page.locator('table.data-table').getByText('bifrost-gateway')).toBeVisible()

  await expect(page.getByRole('button', { name: '키 발급' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'bifrost-gateway 회전' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'bifrost-gateway 폐기' })).toBeDisabled()
})
