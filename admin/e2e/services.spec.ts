import { expect, test } from '@playwright/test'
import { resetMock, restoreSession, setMode } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetMock(request)
  await restoreSession(page)
})

test('목록에서 상세로 들어가 수정하고 삭제한 결과가 목록에 반영된다', async ({ page }) => {
  await page.goto('/services')
  await expect(page.getByRole('heading', { name: '서비스', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: '인증 서버' })).toBeVisible()

  await page.getByRole('link', { name: '인증 서버' }).click()
  await expect(page).toHaveURL(/\/services\/1$/)
  await expect(page.getByRole('heading', { name: '인증 서버', level: 1 })).toBeVisible()

  /* -- 422: one message per rejected field --------------------------- */

  await page.getByRole('button', { name: '수정' }).click()
  const editDialog = page.getByRole('dialog')
  await expect(editDialog.getByRole('heading', { name: '서비스 수정' })).toBeVisible()

  await editDialog.locator('#edit-url').fill('http://127.0.0.1:9000')
  await editDialog.locator('#edit-health').fill('healthz')
  await editDialog.getByRole('button', { name: '저장' }).click()

  await expect(editDialog.getByText('주소 정책에 맞지 않습니다')).toBeVisible()
  // The FastAPI body lists both fields, and the console names each one rather
  // than falling back to axios' "Request failed with status code 422".
  await expect(
    editDialog.getByText(
      "url: Host '127.0.0.1' rejected: loopback addresses are not allowed; " +
        "health_check_path: Health check path must start with '/'"
    )
  ).toBeVisible()

  /* -- The corrected values are accepted ----------------------------- */

  await editDialog.locator('#edit-url').fill('http://bidar-blue:8001')
  await editDialog.locator('#edit-health').fill('/healthz')
  await editDialog.getByRole('button', { name: '저장' }).click()

  await expect(editDialog).toBeHidden()
  await expect(
    page.getByText('auth-server 서비스를 수정했습니다. 등록부도 함께 다시 적재됐습니다.')
  ).toBeVisible()
  await expect(page.getByText('http://bidar-blue:8001', { exact: true })).toBeVisible()

  /* -- Escape closes the confirmation without deleting --------------- */

  await page.getByRole('button', { name: '삭제', exact: true }).click()
  const deleteDialog = page.getByRole('dialog')
  await expect(deleteDialog.getByRole('heading', { name: '서비스를 삭제합니다' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(deleteDialog).toBeHidden()
  await expect(page).toHaveURL(/\/services\/1$/)

  /* -- The delete itself, and the list it returns to ----------------- */

  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(deleteDialog.getByRole('heading', { name: '서비스를 삭제합니다' })).toBeVisible()
  await deleteDialog.getByRole('button', { name: '삭제', exact: true }).click()

  await expect(page).toHaveURL(/\/services$/)
  await expect(
    page.getByText('auth-server 서비스를 삭제했습니다. 등록부도 함께 다시 적재됐습니다.')
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '인증 서버' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '블로그' })).toBeVisible()
})

test('등록부 재적재가 실패한 등록은 207을 받아 경고로 표시된다', async ({ page, request }) => {
  await setMode(request, { registryReload: 'fail' })

  await page.goto('/services')
  await page.getByRole('button', { name: '서비스 등록' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('#svc-name').fill('metrics-proxy')
  await dialog.locator('#svc-url').fill('http://metrics-proxy:9100')
  await dialog.getByRole('button', { name: '등록', exact: true }).click()

  await expect(dialog).toBeHidden()
  // 207 is a 2xx, so axios resolved it. Only `registry_reloaded` tells the
  // screen that the record was saved while the routing table was not updated.
  await expect(page.getByText('저장은 됐지만 등록부에 반영하지 못했습니다')).toBeVisible()
  await expect(
    page.getByText('registry reload failed: database connection was closed', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'metrics-proxy' })).toBeVisible()
})
