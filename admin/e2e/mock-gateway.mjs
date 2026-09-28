/* ------------------------------------------------------------------ *
 * Mock gateway for the admin console smoke test.
 *
 * The console talks to two origins in production: the gateway root
 * (`/auth/*` proxied to Bidar, and `/ready`) and the admin API under
 * `/admin/api`. Both live behind one ingress there, so one server answers
 * both here as well.
 *
 * Every response shape follows Bifrost's schemas in
 * bifrost/src/schemas/*.py and the contract written down in
 * bifrost/docs/admin-api.md. The three cases that are easy to get wrong are
 * reproduced exactly, because the console reads them rather than the status
 * code alone:
 *
 *   - 422 carries the FastAPI list `detail`, one item per rejected field.
 *   - DELETE answers 200 with a body, never 204, so a failed registry reload
 *     still has somewhere to be reported.
 *   - A write whose registry reload failed answers 207 with
 *     `registry_reloaded: false`, which axios accepts as a success.
 *
 * Node's own `http` module is enough for this, so the mock adds no
 * dependency and needs no build step. `POST /__mode` switches the failure
 * cases a test wants to see, and `POST /__reset` puts the server back to its
 * seed state, which every test does before it starts.
 * ------------------------------------------------------------------ */
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.E2E_MOCK_PORT ?? 4599)
const HOST = process.env.E2E_MOCK_HOST ?? '127.0.0.1'

const ACCESS_TOKEN = 'e2e-access-token'
const REFRESH_TOKEN = 'e2e-refresh-token'
const ADMIN_USERNAME = 'e2e-admin'
const ADMIN_PASSWORD = 'e2e-password'

/* -- Seed state ---------------------------------------------------- */

/**
 * Switches for the answers a test wants to provoke. Everything not listed
 * here is always the success path; a mode that is never exercised would only
 * be an untested branch in this file.
 */
const DEFAULT_MODE = {
  /** 'ok' | 'not_ready' - the second answers `/ready` with 503 and a body. */
  ready: 'ok',
  /** 'ok' | 'unavailable' | 'not_implemented' | 'bad_gateway' */
  backups: 'ok',
  /** 'ok' | 'alertmanager_down' | 'not_implemented' | 'bad_gateway' */
  alerts: 'ok',
  /** 'ok' | 'fail' - 'fail' makes every service write answer 207. */
  registryReload: 'ok',
  /**
   * Role of the signed-in account, as `/auth/me` reports it.
   *
   * 'admin' is what the API key screen has to be seen under: that role may
   * read the list and is refused every write, which is the case the console
   * gates its buttons on. The gateway decides this per request, so the two
   * API key writes below check the same switch rather than trusting the
   * screen to have disabled the button.
   */
  role: 'super_admin',
}

function seedServices() {
  return [
    {
      id: 1,
      name: 'auth-server',
      display_name: '인증 서버',
      url: 'http://bidar:8001',
      health_check_path: '/health',
      timeout_seconds: 30,
      rate_limit_per_minute: 100,
      is_active: true,
      description: '계정과 권한을 담당합니다.',
      service_metadata: { owner: 'bnbong' },
      created_at: '2026-09-01T02:00:00Z',
      updated_at: '2026-09-20T02:30:00Z',
      last_health_check: '2026-09-28T01:00:00Z',
      health_status: 'healthy',
    },
    {
      id: 2,
      name: 'blog',
      display_name: '블로그',
      url: 'http://blog:8080',
      health_check_path: '/health',
      timeout_seconds: 15,
      rate_limit_per_minute: 60,
      is_active: true,
      description: null,
      service_metadata: {},
      created_at: '2026-09-02T02:00:00Z',
      updated_at: '2026-09-21T05:10:00Z',
      last_health_check: '2026-09-28T01:00:00Z',
      health_status: 'unhealthy',
    },
    {
      id: 3,
      name: 'sandbox',
      display_name: null,
      url: 'http://sandbox:9000',
      health_check_path: '/healthz',
      timeout_seconds: 30,
      rate_limit_per_minute: 100,
      is_active: false,
      description: '아직 관측한 적이 없는 서비스입니다.',
      service_metadata: {},
      created_at: '2026-09-03T02:00:00Z',
      updated_at: '2026-09-03T02:00:00Z',
      last_health_check: null,
      health_status: 'unknown',
    },
  ]
}

/**
 * What each upstream puts in its own `/health` body, as far as the gateway
 * keeps it. `blog` deliberately reports nothing: an upstream that publishes no
 * build fields is the case the console has to state honestly instead of
 * drawing five blank rows.
 */
const UPSTREAM_BUILDS = {
  'auth-server': {
    version: '0.2.0',
    build_sha: 'deadbeefcafe0123456789abcdef0123456789ab',
    build_time: '2026-09-28T04:05:06Z',
    build_ref: 'main',
    started_at: '2026-09-28T06:43:35Z',
  },
  blog: null,
  sandbox: {
    version: '0.1.0',
    build_sha: '0123456789abcdef0123456789abcdef01234567',
    build_time: '2026-09-27T10:00:00Z',
    build_ref: 'v0.1.0',
    started_at: '2026-09-27T10:05:00Z',
  },
}

/**
 * The gateway's own build block, shared by the overview statistics exactly as
 * bifrost/src/core/buildinfo.py shares it with the root endpoint.
 */
const GATEWAY_BUILD = {
  version: '0.2.0',
  build_sha: 'abcdef0123456789abcdef0123456789abcdef01',
  build_time: '2026-09-27T23:10:00Z',
  build_ref: 'main',
  started_at: '2026-09-28T00:15:00Z',
}

const SEED_USERS = [
  {
    id: 1,
    username: 'e2e-admin',
    email: 'admin@bnbong.com',
    full_name: '운영 관리자',
    is_active: true,
    is_superuser: true,
    role: 'super_admin',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 2,
    username: 'operator',
    email: 'operator@bnbong.com',
    full_name: null,
    is_active: true,
    is_superuser: false,
    role: 'admin',
    created_at: '2026-08-10T00:00:00Z',
  },
  {
    id: 3,
    username: 'visitor',
    email: 'visitor@bnbong.com',
    full_name: '방문 계정',
    is_active: false,
    is_superuser: false,
    role: 'user',
    created_at: '2026-08-20T00:00:00Z',
  },
]

/**
 * Build provenance the gateway observed per service, keyed by service name.
 *
 * The real gateway holds this in the process that ran the probe rather than
 * in the database, so a service that has not been probed since the last
 * reload has no entry at all. The seed carries one entry, which matches the
 * seed list: auth-server has a `last_health_check`, so a probe did run and
 * did read that upstream's build.
 */
function seedObservedBuilds() {
  return {
    'auth-server': {
      upstream_build: UPSTREAM_BUILDS['auth-server'],
      build_observed_at: '2026-09-28T01:00:00Z',
    },
  }
}

/* -- API key seed --------------------------------------------------- */

/**
 * Highest number of active rows one user may hold. Bidar counts a row that has
 * expired but was never revoked as active too, because it still occupies a row
 * an operator can see and rotate, and the mock counts it the same way.
 *
 * Two is low on purpose: the seed leaves `e2e-admin` at the ceiling already, so
 * the 409 the console has to render is one click away instead of five.
 */
const MAX_ACTIVE_API_KEYS = 2

/** Key material prefix, matching `API_KEY_PREFIX` in bidar/src/core/apikeys.py. */
const API_KEY_PREFIX = 'bng_'

/** Leading characters kept in clear, `KEY_PREFIX_LENGTH` in the same module. */
const KEY_PREFIX_LENGTH = 8

/**
 * Renders an instant the way the `api_keys` columns store it: UTC with no zone
 * suffix at all. The console has to read this as UTC rather than as local
 * time, so writing a `Z` here would take that decision out of the test.
 */
function naiveUtc(date) {
  return date.toISOString().slice(0, 19)
}

function offsetFromNow(ms) {
  return naiveUtc(new Date(Date.now() + ms))
}

/**
 * Reads an instant the client sent for `expires_at`.
 *
 * Bidar declares the column without a time zone and pydantic hands it a naive
 * datetime, so a value that carries no zone suffix is stored as UTC rather
 * than as the server's local time. `new Date` would read such a string as
 * local time instead, which would move the expiry by the mock host's offset
 * and make a test pass or fail depending on where it ran.
 */
function parseIncomingInstant(value) {
  if (typeof value !== 'string') {
    return new Date(NaN)
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : `${value}Z`)
}

/**
 * A new plaintext key: the prefix plus 43 base64url characters, which is what
 * `secrets.token_urlsafe(32)` produces on the server.
 */
function generatePlaintextKey() {
  return `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Four rows that cover the three states the console draws. `lapsed-probe` is
 * the one that matters most: it is still `is_active` true and its expiry has
 * passed, so a screen that read the flag alone would call it active.
 *
 * The rows are written in id order here and sorted on the way out, because
 * the endpoint answers newest first.
 */
function seedApiKeys() {
  return [
    {
      id: 1,
      key_name: 'bifrost-gateway',
      user_id: 1,
      is_active: true,
      key_prefix: 'bng_Bi7f',
      expires_at: null,
      created_at: offsetFromNow(-50 * DAY_MS),
      last_used_at: offsetFromNow(-60 * 60 * 1000),
    },
    {
      id: 2,
      key_name: 'blog-publisher',
      user_id: 2,
      is_active: true,
      key_prefix: 'bng_Bl2o',
      expires_at: offsetFromNow(90 * DAY_MS),
      created_at: offsetFromNow(-20 * DAY_MS),
      last_used_at: null,
    },
    {
      id: 3,
      key_name: 'retired-runner',
      user_id: 2,
      is_active: false,
      key_prefix: 'bng_Re4t',
      expires_at: null,
      created_at: offsetFromNow(-40 * DAY_MS),
      last_used_at: offsetFromNow(-12 * DAY_MS),
    },
    {
      id: 4,
      key_name: 'lapsed-probe',
      user_id: 1,
      is_active: true,
      key_prefix: 'bng_La9x',
      expires_at: offsetFromNow(-2 * DAY_MS),
      created_at: offsetFromNow(-30 * DAY_MS),
      last_used_at: offsetFromNow(-3 * DAY_MS),
    },
  ]
}

let mode = { ...DEFAULT_MODE }
let services = seedServices()
let nextServiceId = 4
let observedBuilds = seedObservedBuilds()
let apiKeys = seedApiKeys()
let nextApiKeyId = 5

function reset() {
  mode = { ...DEFAULT_MODE }
  services = seedServices()
  nextServiceId = 4
  observedBuilds = seedObservedBuilds()
  apiKeys = seedApiKeys()
  nextApiKeyId = 5
}

/**
 * The two build fields of one service. Both are null when no probe has
 * observed anything, and `build_observed_at` stays null when the probe ran
 * but the upstream published no build fields, because the gateway only
 * records the observation time together with a build it actually read.
 */
/**
 * The rows the registry snapshot holds.
 *
 * `ServiceRegistry._build_snapshot` reads `get_all_active_services`, so an
 * inactive row is registered in the database and absent from the routing
 * table. Everything that walks the snapshot, which is the health check and
 * the reload count, walks this list rather than the whole registration list.
 */
function registeredServices() {
  return services.filter((service) => service.is_active)
}

function observedBuild(serviceName) {
  const observed = observedBuilds[serviceName]
  if (!observed) {
    return { upstream_build: null, build_observed_at: null }
  }
  return observed
}

/* -- Response helpers ---------------------------------------------- */

/**
 * The console is served from the Vite preview origin and calls this server on
 * another port, so every answer needs CORS headers. The `Authorization`
 * header makes each admin call a preflighted request, which is why OPTIONS is
 * answered here as well.
 */
function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('Vary', 'Origin')
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** FastAPI's own error body: a single string under `detail`. */
function sendDetail(res, status, detail) {
  sendJson(res, status, { detail })
}

/**
 * FastAPI's validation body: `detail` is a list, one item per rejected field,
 * and the console joins them into "field: message" lines. A single string
 * here would take that rendering path out of the test.
 */
function sendValidationError(res, items) {
  sendJson(res, 422, { detail: items })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function parseJsonBody(raw) {
  if (raw.trim() === '') {
    return {}
  }
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function bearerToken(req) {
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length)
}

/** Every `/admin/api` route requires the access token, as the gateway does. */
function requireAccessToken(req, res) {
  if (bearerToken(req) === ACCESS_TOKEN) {
    return true
  }
  sendDetail(res, 401, 'Could not validate credentials')
  return false
}

function nowIso() {
  return new Date().toISOString()
}

/* -- Service validation -------------------------------------------- */

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

/**
 * Reproduces the destination policy in bifrost/src/core/urlpolicy.py closely
 * enough that the message on screen is the one the gateway would send. Only
 * the rules the smoke test drives are implemented; the gateway checks more.
 */
function validateUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Service URL must be a non-empty string'
  }
  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    return 'Service URL is not parsable'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Service URL scheme must be one of http, https'
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return `Host '${parsed.hostname}' is not an allowed destination`
  }
  if (BLOCKED_HOSTS.has(host) || host.startsWith('127.')) {
    return `Host '${parsed.hostname}' rejected: loopback addresses are not allowed`
  }
  return null
}

function validateHealthCheckPath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Health check path must be a non-empty string'
  }
  const candidate = value.trim()
  if (!candidate.startsWith('/')) {
    return "Health check path must start with '/'"
  }
  if (candidate.includes('://') || candidate.startsWith('//')) {
    return 'Health check path must not be an absolute URL'
  }
  if (candidate.includes('..')) {
    return "Health check path must not contain '..'"
  }
  return null
}

/**
 * Builds the 422 items for one request body. pydantic prefixes every
 * `ValueError` it raises with "Value error, ", and the console strips exactly
 * that prefix, so the prefix belongs here too.
 */
function validationItems(payload) {
  const items = []
  if (payload.url !== undefined) {
    const message = validateUrl(payload.url)
    if (message) {
      items.push({
        type: 'value_error',
        loc: ['body', 'url'],
        msg: `Value error, ${message}`,
        input: payload.url,
        ctx: { error: {} },
      })
    }
  }
  if (payload.health_check_path !== undefined) {
    const message = validateHealthCheckPath(payload.health_check_path)
    if (message) {
      items.push({
        type: 'value_error',
        loc: ['body', 'health_check_path'],
        msg: `Value error, ${message}`,
        input: payload.health_check_path,
        ctx: { error: {} },
      })
    }
  }
  return items
}

/**
 * Status and reload fields of a write. The database change is committed
 * before the reload runs and is not rolled back when the reload fails, so the
 * record is returned either way and only these fields say what happened to
 * the routing table.
 */
function reloadOutcome(successStatus) {
  if (mode.registryReload === 'fail') {
    // The snapshot was not replaced, so whatever the last probes observed is
    // still in the process that holds it.
    return {
      status: 207,
      fields: {
        registry_reloaded: false,
        registry_error: 'registry reload failed: database connection was closed',
      },
    }
  }
  // A successful reload swaps in a snapshot built from the database, and the
  // observed builds were never in the database, so they are gone with the old
  // snapshot exactly as they are in the gateway.
  observedBuilds = {}
  return { status: successStatus, fields: { registry_reloaded: true, registry_error: null } }
}

/* -- Observability payloads ---------------------------------------- */

function backupsPayload() {
  const nowSeconds = Math.floor(Date.now() / 1000)
  // Ages are computed from the current clock so the freshness verdicts stay
  // the same no matter when the suite runs. redis-vm3 is the one component
  // past its threshold, so the screen has exactly one warning to report.
  const components = [
    {
      component: 'postgresql',
      instance: 'vm3-node:9100',
      job: 'vm3-node',
      last_success_timestamp: nowSeconds - 3600,
      last_run_timestamp: nowSeconds - 3600,
      last_run_status: 0,
      unshipped_total: 2,
      age_seconds: 3600,
    },
    {
      component: 'redis-vm3',
      instance: 'vm3-node:9100',
      job: 'vm3-node',
      last_success_timestamp: nowSeconds - 9 * 3600,
      last_run_timestamp: nowSeconds - 1800,
      last_run_status: 1,
      unshipped_total: 6,
      age_seconds: 9 * 3600,
    },
    {
      component: 'ship',
      instance: 'vm3-node:9100',
      job: 'vm3-node',
      last_success_timestamp: nowSeconds - 2 * 3600,
      last_run_timestamp: nowSeconds - 2 * 3600,
      last_run_status: 0,
      // The shipping job publishes no unshipped counter at all, and null is
      // what the gateway sends for a value nobody ever measured.
      unshipped_total: null,
      age_seconds: 2 * 3600,
    },
  ]
  return { available: true, queried_at: nowIso(), components, note: null }
}

function alertsPayload(alertmanagerDown) {
  const now = Date.now()
  const alertmanager = alertmanagerDown
    ? {
        configured: true,
        available: false,
        error: 'Alertmanager request failed: timed out after 3.0s',
      }
    : { configured: true, available: true, error: null }

  const suppression = alertmanagerDown
    ? { silenced: null, inhibited: null }
    : { silenced: false, inhibited: false }

  return {
    queried_at: nowIso(),
    firing_count: 2,
    alerts: [
      {
        alertname: 'BackupStale',
        severity: 'critical',
        instance: 'vm3-node:9100',
        service: null,
        job: 'vm3-node',
        component: 'redis-vm3',
        active_at: new Date(now - 40 * 60 * 1000).toISOString(),
        summary: 'vm3-node:9100의 redis-vm3 백업이 8시간 넘게 성공하지 않았다',
        ...suppression,
      },
      {
        alertname: 'TargetDown',
        severity: 'warning',
        instance: 'gateway:8000',
        service: null,
        job: 'msa-gateway',
        component: null,
        active_at: new Date(now - 10 * 60 * 1000).toISOString(),
        summary: 'msa-gateway target이 5분 이상 응답하지 않는다',
        ...suppression,
      },
    ],
    alertmanager,
  }
}

/* -- Routes -------------------------------------------------------- */

function serviceStats() {
  return {
    total_services: services.length,
    active_services: services.filter((item) => item.is_active).length,
    healthy_services: services.filter((item) => item.health_status === 'healthy').length,
    unhealthy_services: services.filter((item) => item.health_status === 'unhealthy').length,
    unknown_services: services.filter((item) => item.health_status === 'unknown').length,
  }
}

function handleControl(req, res, pathname, rawBody) {
  if (pathname === '/__health') {
    sendJson(res, 200, { status: 'ok', mode })
    return true
  }
  if (pathname === '/__reset' && req.method === 'POST') {
    reset()
    sendJson(res, 200, { status: 'reset', mode })
    return true
  }
  if (pathname === '/__mode' && req.method === 'POST') {
    const requested = parseJsonBody(rawBody)
    for (const key of Object.keys(requested)) {
      if (!(key in DEFAULT_MODE)) {
        sendJson(res, 400, { error: `unknown mode key: ${key}` })
        return true
      }
    }
    mode = { ...mode, ...requested }
    sendJson(res, 200, { status: 'ok', mode })
    return true
  }
  return false
}

function handleAuth(req, res, pathname, rawBody) {
  if (pathname === '/auth/token' && req.method === 'POST') {
    const form = new URLSearchParams(rawBody)
    if (form.get('username') === ADMIN_USERNAME && form.get('password') === ADMIN_PASSWORD) {
      sendJson(res, 200, {
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        token_type: 'bearer',
        expires_in: 1800,
      })
      return true
    }
    sendDetail(res, 401, 'Incorrect username or password')
    return true
  }

  if (pathname === '/auth/refresh' && req.method === 'POST') {
    const body = parseJsonBody(rawBody)
    const presented = body.refresh_token ?? bearerToken(req)
    if (presented === REFRESH_TOKEN) {
      // Bidar does not rotate refresh tokens, so the response carries none.
      sendJson(res, 200, { access_token: ACCESS_TOKEN, token_type: 'bearer', expires_in: 1800 })
      return true
    }
    sendDetail(res, 401, 'Could not validate credentials')
    return true
  }

  if (pathname === '/auth/me' && req.method === 'GET') {
    if (bearerToken(req) !== ACCESS_TOKEN) {
      sendDetail(res, 401, 'Could not validate credentials')
      return true
    }
    // The account itself never changes; only the role the server reports for
    // it does, which is how a spec gets to see the screen under `admin`.
    sendJson(res, 200, { ...SEED_USERS[0], role: mode.role, is_superuser: mode.role === 'super_admin' })
    return true
  }

  return false
}

function handleReady(req, res, pathname) {
  if (pathname !== '/ready' || req.method !== 'GET') {
    return false
  }
  if (mode.ready === 'not_ready') {
    // The probe answers 503 with the body that says which dependency failed,
    // and the console renders that body instead of treating it as an error.
    sendJson(res, 503, {
      status: 'not_ready',
      database: 'ok',
      registry: 'degraded',
      service_count: 0,
      database_error: null,
      registry_error: 'registry snapshot is empty: last reload raised OperationalError',
    })
    return true
  }
  sendJson(res, 200, {
    status: 'ready',
    database: 'ok',
    registry: 'ok',
    service_count: services.length,
  })
  return true
}

function handleObservability(req, res, pathname) {
  if (pathname === '/admin/api/observability/backups' && req.method === 'GET') {
    if (mode.backups === 'not_implemented') {
      sendDetail(res, 501, 'PROMETHEUS_URL is not configured')
      return true
    }
    if (mode.backups === 'bad_gateway') {
      sendDetail(res, 502, 'Prometheus query failed: timed out after 3.0s')
      return true
    }
    if (mode.backups === 'unavailable') {
      sendJson(res, 200, {
        available: false,
        queried_at: nowIso(),
        components: [],
        note: 'Prometheus에 bngdrasil_backup_ 계열 시계열이 아직 없습니다.',
      })
      return true
    }
    sendJson(res, 200, backupsPayload())
    return true
  }

  if (pathname === '/admin/api/observability/alerts' && req.method === 'GET') {
    if (mode.alerts === 'not_implemented') {
      sendDetail(res, 501, 'PROMETHEUS_URL is not configured')
      return true
    }
    if (mode.alerts === 'bad_gateway') {
      sendDetail(res, 502, 'Prometheus query failed: timed out after 3.0s')
      return true
    }
    sendJson(res, 200, alertsPayload(mode.alerts === 'alertmanager_down'))
    return true
  }

  return false
}

function handleServices(req, res, pathname, rawBody) {
  if (pathname === '/admin/api/services' && req.method === 'GET') {
    sendJson(res, 200, services)
    return true
  }

  if (pathname === '/admin/api/services/stats' && req.method === 'GET') {
    sendJson(res, 200, serviceStats())
    return true
  }

  if (pathname === '/admin/api/services/reload' && req.method === 'POST') {
    // A reload builds a new snapshot out of the database, and the build each
    // probe observed lives in the snapshot rather than in a table. So the
    // gateway loses every observation on a reload and reports nothing again
    // until the next probe runs; `ServiceRegistry._load` in
    // bifrost/src/services/services.py is where that swap happens.
    observedBuilds = {}
    sendJson(res, 200, {
      message: '등록부를 다시 적재했습니다.',
      status: 'ok',
      service_count: registeredServices().length,
    })
    return true
  }

  if (pathname === '/admin/api/services/health-check-all' && req.method === 'POST') {
    const results = {}
    const details = {}
    const observedAt = nowIso()
    // Only the registry snapshot is probed, and that snapshot is built from
    // the active rows alone. An inactive service is therefore absent from the
    // answer rather than present with a status, which is what the console has
    // to tell apart from a service that was probed and reported nothing.
    for (const service of registeredServices()) {
      results[service.name] = service.health_status === 'unhealthy' ? 'unhealthy' : 'healthy'
      // The probe reads the upstream's health body, so what it observes is
      // recorded here exactly as the gateway records it: a build only when the
      // upstream published one, and the observation time only alongside it.
      const build = UPSTREAM_BUILDS[service.name] ?? null
      observedBuilds[service.name] = {
        upstream_build: build,
        build_observed_at: build ? observedAt : null,
      }
      details[service.name] = {
        status: results[service.name],
        ...observedBuilds[service.name],
      }
    }
    // `results` keeps the plain status strings it always carried, and the
    // build provenance travels in the separate `details` map.
    sendJson(res, 200, {
      message: 'health check completed',
      service_count: Object.keys(results).length,
      results,
      details,
    })
    return true
  }

  if (pathname === '/admin/api/services' && req.method === 'POST') {
    const payload = parseJsonBody(rawBody)
    const items = validationItems(payload)
    if (items.length > 0) {
      sendValidationError(res, items)
      return true
    }
    const timestamp = nowIso()
    const created = {
      id: nextServiceId,
      name: payload.name,
      display_name: payload.display_name || null,
      url: String(payload.url).replace(/\/+$/, ''),
      health_check_path: payload.health_check_path ?? '/health',
      timeout_seconds: payload.timeout_seconds ?? 30,
      rate_limit_per_minute: payload.rate_limit_per_minute ?? 100,
      is_active: payload.is_active ?? true,
      description: payload.description || null,
      service_metadata: payload.service_metadata ?? {},
      created_at: timestamp,
      updated_at: timestamp,
      last_health_check: null,
      health_status: 'unknown',
    }
    nextServiceId += 1
    services.push(created)
    const outcome = reloadOutcome(201)
    sendJson(res, outcome.status, { ...created, ...outcome.fields })
    return true
  }

  const detailMatch = /^\/admin\/api\/services\/(\d+)$/.exec(pathname)
  const healthMatch = /^\/admin\/api\/services\/(\d+)\/health$/.exec(pathname)
  const match = detailMatch ?? healthMatch
  if (!match) {
    return false
  }

  const serviceId = Number(match[1])
  const index = services.findIndex((item) => item.id === serviceId)
  if (index === -1) {
    sendDetail(res, 404, 'Service not found')
    return true
  }
  const service = services[index]

  if (healthMatch && req.method === 'GET') {
    sendJson(res, 200, {
      service_id: service.id,
      service_name: service.name,
      health_status: service.health_status,
      last_health_check: service.last_health_check,
      is_active: service.is_active,
      // Read from the process state, not from the stored record, which is why
      // this endpoint can report a build while `last_health_check` is old.
      ...observedBuild(service.name),
    })
    return true
  }

  if (detailMatch && req.method === 'GET') {
    sendJson(res, 200, service)
    return true
  }

  if (detailMatch && req.method === 'PUT') {
    const payload = parseJsonBody(rawBody)
    const items = validationItems(payload)
    if (items.length > 0) {
      sendValidationError(res, items)
      return true
    }
    // The server applies `exclude_unset`, so only the keys the console sent
    // are written and every other field keeps its stored value.
    const updated = { ...service, ...payload, updated_at: nowIso() }
    if (typeof updated.url === 'string') {
      updated.url = updated.url.replace(/\/+$/, '')
    }
    services[index] = updated
    const outcome = reloadOutcome(200)
    sendJson(res, outcome.status, { ...updated, ...outcome.fields })
    return true
  }

  if (detailMatch && req.method === 'DELETE') {
    services.splice(index, 1)
    const outcome = reloadOutcome(200)
    // 200 with a body rather than 204: a 204 has no place to report a reload
    // that failed after the row was already removed.
    sendJson(res, outcome.status, {
      service_id: service.id,
      service_name: service.name,
      ...outcome.fields,
    })
    return true
  }

  return false
}

/* -- API keys ------------------------------------------------------- */

/** The read model. Neither the plaintext nor the stored digest appears here. */
function apiKeyRead(row) {
  return {
    id: row.id,
    key_name: row.key_name,
    user_id: row.user_id,
    is_active: row.is_active,
    key_prefix: row.key_prefix,
    expires_at: row.expires_at,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  }
}

/** Newest first, which is the order the endpoint documents. */
function sortedApiKeys() {
  return [...apiKeys].sort((left, right) => {
    if (left.created_at === right.created_at) {
      return right.id - left.id
    }
    return String(right.created_at).localeCompare(String(left.created_at))
  })
}

function countActiveKeys(userId) {
  return apiKeys.filter((row) => row.user_id === userId && row.is_active).length
}

/**
 * The 422 items one issue payload earns, in FastAPI's own shape. The rules
 * come from `APIKeyCreateRequest` in bidar/src/models/users.py, including the
 * "Value error, " prefix pydantic puts in front of every `ValueError`.
 */
function apiKeyValidationItems(payload) {
  const items = []
  const name = payload.key_name
  if (typeof name !== 'string' || name.trim() === '') {
    items.push({
      type: 'value_error',
      loc: ['body', 'key_name'],
      msg: 'Value error, key_name must not be blank.',
      input: name ?? null,
      ctx: { error: {} },
    })
  } else if (name.length > 100) {
    items.push({
      type: 'string_too_long',
      loc: ['body', 'key_name'],
      msg: 'String should have at most 100 characters',
      input: name,
      ctx: { max_length: 100 },
    })
  }
  if (!Number.isInteger(payload.user_id)) {
    items.push({
      type: 'int_parsing',
      loc: ['body', 'user_id'],
      msg: 'Input should be a valid integer, unable to parse string as an integer',
      input: payload.user_id ?? null,
    })
  }
  if (payload.expires_at !== undefined && payload.expires_at !== null) {
    const expiry = parseIncomingInstant(payload.expires_at)
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      items.push({
        type: 'value_error',
        loc: ['body', 'expires_at'],
        msg: 'Value error, expires_at must be in the future.',
        input: payload.expires_at,
        ctx: { error: {} },
      })
    }
  }
  return items
}

/**
 * Creates a row and returns it together with the plaintext.
 *
 * The plaintext is generated, handed back once and then forgotten; only the
 * prefix survives on the row, exactly as the server keeps only a digest.
 */
function issueApiKey({ keyName, userId, expiresAt }) {
  const plaintext = generatePlaintextKey()
  const row = {
    id: nextApiKeyId,
    key_name: keyName,
    user_id: userId,
    is_active: true,
    key_prefix: plaintext.slice(0, KEY_PREFIX_LENGTH),
    expires_at: expiresAt ?? null,
    created_at: naiveUtc(new Date()),
    last_used_at: null,
  }
  nextApiKeyId += 1
  apiKeys.push(row)
  return { row, plaintext }
}

/**
 * Writes are super admin only, and the gateway decides that per request. The
 * console disables its buttons for a lesser role, and this check is what makes
 * the test meaningful: it would still answer 403 if the button were clicked.
 */
function requireSuperAdmin(res) {
  if (mode.role === 'super_admin') {
    return true
  }
  sendDetail(res, 403, 'Not enough permissions')
  return false
}

function handleApiKeys(req, res, pathname, rawBody, searchParams) {
  if (pathname === '/admin/api/api-keys/' && req.method === 'GET') {
    const rawUserId = searchParams.get('user_id')
    const rows =
      rawUserId === null
        ? sortedApiKeys()
        : sortedApiKeys().filter((row) => row.user_id === Number(rawUserId))
    // Revoked rows stay in the answer with `is_active` false, so the console
    // can show what was withdrawn rather than an entry that simply vanished.
    sendJson(res, 200, rows.map(apiKeyRead))
    return true
  }

  if (pathname === '/admin/api/api-keys/' && req.method === 'POST') {
    if (!requireSuperAdmin(res)) {
      return true
    }
    const payload = parseJsonBody(rawBody)
    const items = apiKeyValidationItems(payload)
    if (items.length > 0) {
      sendValidationError(res, items)
      return true
    }
    const owner = SEED_USERS.find((user) => user.id === payload.user_id)
    if (!owner) {
      sendDetail(res, 404, 'User not found')
      return true
    }
    if (!owner.is_active) {
      sendDetail(res, 400, 'Cannot issue an API key for an inactive user')
      return true
    }
    if (countActiveKeys(owner.id) >= MAX_ACTIVE_API_KEYS) {
      sendDetail(
        res,
        409,
        `User ${owner.id} already holds ${MAX_ACTIVE_API_KEYS} active API keys, ` +
          'which is the maximum. Revoke one before issuing another.'
      )
      return true
    }
    const { row, plaintext } = issueApiKey({
      keyName: payload.key_name.trim(),
      userId: owner.id,
      // Stored the way the column holds it: UTC with no zone suffix, read
      // from a value that may or may not have carried one.
      expiresAt: payload.expires_at ? naiveUtc(parseIncomingInstant(payload.expires_at)) : null,
    })
    sendJson(res, 201, { ...apiKeyRead(row), key: plaintext })
    return true
  }

  const detailMatch = /^\/admin\/api\/api-keys\/(\d+)$/.exec(pathname)
  const rotateMatch = /^\/admin\/api\/api-keys\/(\d+)\/rotate$/.exec(pathname)
  const match = detailMatch ?? rotateMatch
  if (!match) {
    return false
  }

  const keyId = Number(match[1])
  const index = apiKeys.findIndex((row) => row.id === keyId)
  if (index === -1) {
    sendDetail(res, 404, 'API key not found')
    return true
  }
  const row = apiKeys[index]

  if (detailMatch && req.method === 'GET') {
    sendJson(res, 200, apiKeyRead(row))
    return true
  }

  if (detailMatch && req.method === 'DELETE') {
    if (!requireSuperAdmin(res)) {
      return true
    }
    // Revoking keeps the row and flips the flag, so the answer is 200 with the
    // revoked record rather than an empty 204. Revoking twice is harmless.
    row.is_active = false
    sendJson(res, 200, apiKeyRead(row))
    return true
  }

  if (rotateMatch && req.method === 'POST') {
    if (!requireSuperAdmin(res)) {
      return true
    }
    if (!row.is_active) {
      sendDetail(res, 409, 'Cannot rotate a revoked API key. Issue a new key instead.')
      return true
    }
    // The old key is refused from this moment; there is no overlap window.
    row.is_active = false
    const rotated = issueApiKey({
      keyName: row.key_name,
      userId: row.user_id,
      expiresAt: row.expires_at,
    })
    sendJson(res, 200, { ...apiKeyRead(rotated.row), key: rotated.plaintext })
    return true
  }

  return false
}

function handleAdmin(req, res, pathname, rawBody, searchParams) {
  if (!pathname.startsWith('/admin/api')) {
    return false
  }
  // FastAPI redirects a collection path that lost its trailing slash, and it
  // does so while routing, before any dependency runs. 307 keeps the method
  // and the body, which is what makes a POST survive the replay. Starlette
  // builds the target from the request URL with the path replaced, so the
  // query string travels with it; dropping it here would turn a redirected
  // owner filter into a request for every key.
  if (pathname === '/admin/api/api-keys') {
    const query = searchParams.toString()
    res.writeHead(307, {
      Location: query === '' ? '/admin/api/api-keys/' : `/admin/api/api-keys/?${query}`,
      'Cache-Control': 'no-store',
    })
    res.end()
    return true
  }
  if (!requireAccessToken(req, res)) {
    return true
  }

  if (pathname === '/admin/api/settings/stats/overview' && req.method === 'GET') {
    const stats = serviceStats()
    sendJson(res, 200, {
      services: {
        total: stats.total_services,
        active: stats.active_services,
        healthy: stats.healthy_services,
        unhealthy: stats.unhealthy_services,
        unknown: stats.unknown_services,
      },
      registry: { ready: true, loaded_services: services.length, last_error: null },
      // The same block the root endpoint and the liveness probe report. A
      // field the image build did not inject would be null here, never an
      // empty string.
      app: { ...GATEWAY_BUILD, environment: 'test' },
      // The gateway does not collect these at all, and null is not zero.
      users: null,
      api_requests: null,
      system: null,
    })
    return true
  }

  if (pathname === '/admin/api/settings/' && req.method === 'GET') {
    sendJson(res, 200, {
      settings: {
        environment: 'test',
        version: '0.2.0',
        debug: false,
        log_level: 'INFO',
        rate_limit_per_minute: 100,
        rate_limit_exempt_paths: ['/health', '/ready'],
        max_request_body_bytes: 1048576,
        proxy_timeout_seconds: 30,
        cors_origins: ['https://admin.bnbong.com'],
        metrics_enabled: true,
        editable_at_runtime: false,
      },
    })
    return true
  }

  if (pathname === '/admin/api/users/' && req.method === 'GET') {
    sendJson(res, 200, SEED_USERS)
    return true
  }

  if (handleObservability(req, res, pathname)) {
    return true
  }
  if (handleServices(req, res, pathname, rawBody)) {
    return true
  }
  if (handleApiKeys(req, res, pathname, rawBody, searchParams)) {
    return true
  }

  sendDetail(res, 404, 'Not Found')
  return true
}

const server = createServer((req, res) => {
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const { pathname, searchParams } = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)

  readBody(req)
    .then((rawBody) => {
      if (handleControl(req, res, pathname, rawBody)) {
        return
      }
      if (handleAuth(req, res, pathname, rawBody)) {
        return
      }
      if (handleReady(req, res, pathname)) {
        return
      }
      if (handleAdmin(req, res, pathname, rawBody, searchParams)) {
        return
      }
      sendDetail(res, 404, 'Not Found')
    })
    .catch((error) => {
      sendJson(res, 500, { detail: String(error) })
    })
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`mock gateway listening on http://${HOST}:${PORT}\n`)
})
