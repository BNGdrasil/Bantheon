import { defineConfig, devices } from '@playwright/test'
import {
  ADMIN_API_BASE_URL,
  GRAFANA_BASE_URL,
  MOCK_BASE_URL,
  MOCK_PORT,
  PREVIEW_BASE_URL,
  PREVIEW_PORT,
} from './e2e/env'

/* ------------------------------------------------------------------ *
 * End-to-end smoke test.
 *
 * The suite runs against the built bundle rather than the dev server, so the
 * code under test is the one that ships. The build is repeated here with the
 * mock addresses injected, because `VITE_*` values are inlined at build time
 * and cannot be redirected afterwards. It writes to `dist-e2e/` so the
 * regular `dist/` artifact is never replaced by a bundle that points at a
 * mock.
 *
 * A single worker runs every spec: the mock gateway keeps the service list
 * and the failure switches in one process, and parallel specs would change
 * that state underneath each other.
 * ------------------------------------------------------------------ */

const isCi = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: isCi
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  outputDir: './e2e-results',
  use: {
    baseURL: PREVIEW_BASE_URL,
    // Diagnostics are kept only for a run that failed. A green run leaves
    // nothing behind, so the artifact upload has nothing to collect.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/mock-gateway.mjs',
      env: { E2E_MOCK_PORT: String(MOCK_PORT) },
      url: `${MOCK_BASE_URL}/__health`,
      reuseExistingServer: !isCi,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // `vite preview` binds to localhost by default, which resolves to ::1
      // first on some hosts and leaves the IPv4 address unanswered. The
      // address is given explicitly so the probe below reaches the same
      // socket the browser will.
      command: `npm run build -- --outDir dist-e2e --emptyOutDir && npm run preview -- --outDir dist-e2e --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
      env: {
        VITE_API_BASE_URL: MOCK_BASE_URL,
        VITE_ADMIN_API_BASE_URL: ADMIN_API_BASE_URL,
        VITE_GRAFANA_URL: GRAFANA_BASE_URL,
      },
      url: PREVIEW_BASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
