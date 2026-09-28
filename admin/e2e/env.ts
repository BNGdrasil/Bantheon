/* ------------------------------------------------------------------ *
 * Addresses and credentials shared by the Playwright config and the specs.
 *
 * The config process and the worker processes read this file separately, so
 * every value is derived from the environment rather than being written into
 * a module the two would have to share at runtime.
 * ------------------------------------------------------------------ */

export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 4599)

export const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT ?? 4173)

/** The mock gateway serves both the gateway root and the admin API. */
export const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`

export const ADMIN_API_BASE_URL = `${MOCK_BASE_URL}/admin/api`

export const PREVIEW_BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`

/**
 * Grafana is never contacted by the console; the observability screen only
 * builds links. An address that resolves nowhere keeps it that way even if a
 * link is ever followed by accident.
 */
export const GRAFANA_BASE_URL = 'http://grafana.e2e.invalid'

export const ADMIN_USERNAME = 'e2e-admin'

export const ADMIN_PASSWORD = 'e2e-password'

/** Tokens the mock accepts; they match the constants in mock-gateway.mjs. */
export const ACCESS_TOKEN = 'e2e-access-token'

export const REFRESH_TOKEN = 'e2e-refresh-token'
