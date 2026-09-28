import { expect, test } from '@playwright/test'
import { resetMock, restoreSession } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('사용자 목록이 인증 서버가 돌려준 계정을 그대로 그린다', async ({ page }) => {
  await page.goto('/users')

  await expect(page.getByRole('heading', { name: '사용자', level: 1 })).toBeVisible()
  await expect(page.getByText('등록 계정 3건')).toBeVisible()

  const table = page.locator('table.data-table')
  await expect(table.getByText('e2e-admin', { exact: true })).toBeVisible()
  await expect(table.getByText('operator', { exact: true })).toBeVisible()
  await expect(table.getByText('visitor', { exact: true })).toBeVisible()

  // The signed-in account is the one row whose delete button stays disabled.
  await expect(page.getByText('현재 로그인한 계정입니다.')).toBeVisible()

  const visitorRow = page.getByRole('row').filter({ hasText: 'visitor' })
  await expect(visitorRow.getByText('비활성', { exact: true })).toBeVisible()
  await expect(visitorRow.getByRole('button', { name: '활성화' })).toBeVisible()
})
