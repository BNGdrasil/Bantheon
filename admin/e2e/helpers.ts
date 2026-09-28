/* ------------------------------------------------------------------ *
 * Helpers shared by the smoke specs.
 * ------------------------------------------------------------------ */
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  ACCESS_TOKEN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  MOCK_BASE_URL,
  REFRESH_TOKEN,
} from './env'

/** The switches `POST /__mode` accepts, mirroring DEFAULT_MODE in the mock. */
export interface MockMode {
  ready: 'ok' | 'not_ready'
  backups: 'ok' | 'unavailable' | 'not_implemented' | 'bad_gateway'
  alerts: 'ok' | 'alertmanager_down' | 'not_implemented' | 'bad_gateway'
  registryReload: 'ok' | 'fail'
}

/**
 * Puts the mock back to its seed state. The server holds the service list and
 * the failure switches in memory, so a spec that skipped this would inherit
 * whatever the previous one left behind.
 */
export async function resetMock(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__reset`)
  expect(response.ok()).toBeTruthy()
}

export async function setMode(
  request: APIRequestContext,
  changes: Partial<MockMode>
): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__mode`, { data: changes })
  expect(response.ok()).toBeTruthy()
}

/**
 * Seeds the stored session before the first navigation.
 *
 * Signing in through the form is itself one of the scenarios, so every other
 * spec starts from a restored session instead of repeating that flow: the
 * console reads the two tokens from local storage on load, which is exactly
 * what a returning operator's browser does.
 */
export async function restoreSession(page: Page): Promise<void> {
  await page.addInitScript(
    (tokens: { access: string; refresh: string }) => {
      window.localStorage.setItem('accessToken', tokens.access)
      window.localStorage.setItem('refreshToken', tokens.refresh)
    },
    { access: ACCESS_TOKEN, refresh: REFRESH_TOKEN }
  )
}

/** Signs in through the login form and waits for the overview screen. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('아이디').fill(ADMIN_USERNAME)
  await page.getByLabel('비밀번호').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('heading', { name: '운영 개요', level: 1 })).toBeVisible()
}
