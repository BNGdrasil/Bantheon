import { expect, test } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME } from './env'
import { resetMock, signIn } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetMock(request)
})

test('로그인하면 운영 개요 화면으로 들어간다', async ({ page }) => {
  await signIn(page)

  // The sidebar only renders once /auth/me has answered, so its presence says
  // the session was established rather than merely that the form submitted.
  await expect(page.getByRole('navigation', { name: '주요 화면' })).toBeVisible()
  await expect(page.getByText(ADMIN_USERNAME, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('아이디나 비밀번호가 틀리면 화면에 이유를 적는다', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('아이디').fill(ADMIN_USERNAME)
  await page.getByLabel('비밀번호').fill(`${ADMIN_PASSWORD}-wrong`)
  await page.getByRole('button', { name: '로그인' }).click()

  await expect(page.getByText('로그인하지 못했습니다')).toBeVisible()
  await expect(page.getByText('Incorrect username or password')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('저장된 토큰이 401로 거절되면 로그인 화면으로 돌려보낸다', async ({ page }) => {
  // Neither token is one the mock accepts, so the silent refresh fails too and
  // the interceptor ends the session instead of retrying forever.
  await page.addInitScript(() => {
    window.localStorage.setItem('accessToken', 'expired-access-token')
    window.localStorage.setItem('refreshToken', 'expired-refresh-token')
  })

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '운영 콘솔 로그인' })).toBeVisible()
})
