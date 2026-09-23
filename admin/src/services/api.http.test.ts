import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  adminApi,
  api,
  createService,
  deleteService,
  fetchAlertObservability,
  fetchBackupObservability,
  fetchCurrentUser,
  fetchReadiness,
  readinessApi,
  tokenStorage,
  updateService,
  type Service,
  type ServiceCreateRequest,
} from './api'

/* ------------------------------------------------------------------ *
 * Transport-level behaviour of the axios clients.
 *
 * `api.test.ts` calls the parsing helpers directly. Everything here instead
 * drives the real clients against a real `http.createServer` on a random
 * port, because the interesting decisions only happen once a status code
 * comes back over the wire: 207 is a 2xx and therefore resolves, `/ready`
 * accepts 503 through its own `validateStatus`, and every other non-2xx goes
 * through the response interceptor that turns an `AxiosError` into an
 * `ApiError`. None of that is reachable without a round trip.
 *
 * The bodies are taken from the gateway's own schemas and test fixtures
 * (bifrost `src/schemas/service.py`, `src/schemas/observability.py`,
 * `src/api/admin/observability.py`, `tests/fixtures/*.json`) so a schema
 * change on the server shows up here as a failing expectation rather than as
 * a blank field on screen.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * vitest runs this suite with `environment: 'node'` and no jsdom, so there is
 * no Web Storage API. `tokenStorage` - and through it the request
 * interceptor on `api` and `adminApi` - reads `localStorage` on every single
 * request, so a minimal in-memory stand-in has to exist before the first call
 * is made. It only needs the four methods `tokenStorage` actually uses.
 * ------------------------------------------------------------------ */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  // @ts-expect-error - partial Web Storage stub, enough for tokenStorage.
  globalThis.localStorage = {
    getItem: (key: string): string | null => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string): void => {
      store.set(key, String(value))
    },
    removeItem: (key: string): void => {
      store.delete(key)
    },
    clear: (): void => {
      store.clear()
    },
  }
}

/* -- Mock server harness ------------------------------------------- */

/** What the server saw. Assertions run on this after the call, never inside
 * the request handler: an expectation that throws in there would abort the
 * response and leave the client waiting on a dead socket, so the test would
 * time out instead of reporting the mismatch. */
interface RecordedRequest {
  method: string
  url: string
  /** Undefined when the client sent no `Authorization` header at all. */
  authorization: string | undefined
  body: string
}

interface MockResponse {
  status: number
  body: unknown
}

/**
 * Starts a server on a random port, points all three axios clients at it,
 * runs `exercise`, and always tears the server down and restores the base
 * URLs afterwards.
 *
 * All three clients are redirected together because a single test only calls
 * one of them, and restoring every one of them unconditionally is what keeps
 * a failed test from leaking a dead base URL into the next.
 */
async function withServer(
  route: (request: RecordedRequest) => MockResponse,
  exercise: (recorded: RecordedRequest[]) => Promise<void>
): Promise<void> {
  const recorded: RecordedRequest[] = []

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => {
      const entry: RecordedRequest = {
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : undefined,
        body,
      }
      recorded.push(entry)
      let answer: MockResponse
      try {
        answer = route(entry)
      } catch {
        // A route that cannot describe this request still has to answer, or
        // the client hangs until its 30s timeout.
        answer = { status: 500, body: { detail: 'no route for this request' } }
      }
      response.writeHead(answer.status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(answer.body))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('mock server did not bind a TCP port')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`

  const originals = {
    api: api.defaults.baseURL,
    adminApi: adminApi.defaults.baseURL,
    readinessApi: readinessApi.defaults.baseURL,
  }
  api.defaults.baseURL = baseUrl
  adminApi.defaults.baseURL = baseUrl
  readinessApi.defaults.baseURL = baseUrl

  try {
    await exercise(recorded)
  } finally {
    api.defaults.baseURL = originals.api
    adminApi.defaults.baseURL = originals.adminApi
    readinessApi.defaults.baseURL = originals.readinessApi
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => (error ? reject(error) : resolve()))
    })
  }
}

afterEach(() => {
  tokenStorage.clear()
})

/* -- Fixtures ------------------------------------------------------- */

/** Every `ServiceRead` field, which `ServiceWriteResult` extends. */
const SERVICE: Service = {
  id: 7,
  name: 'grafana',
  display_name: 'Grafana',
  url: 'http://vm3-node:3000',
  health_check_path: '/api/health',
  timeout_seconds: 30,
  rate_limit_per_minute: 100,
  is_active: true,
  description: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-23T00:00:00Z',
  last_health_check: null,
  health_status: 'unknown',
  service_metadata: null,
}

const SERVICE_CREATE: ServiceCreateRequest = {
  name: 'grafana',
  display_name: 'Grafana',
  url: 'http://vm3-node:3000',
  health_check_path: '/api/health',
  timeout_seconds: 30,
  rate_limit_per_minute: 100,
  is_active: true,
  description: '',
}

const RELOAD_FAILED = 'Service registry reload failed: database is locked'

/** `NOT_CONFIGURED_DETAIL` in bifrost `src/api/admin/observability.py`. */
const NOT_CONFIGURED_DETAIL =
  'Observability summaries are not available because PROMETHEUS_URL is not ' +
  'set. Configure it with the address of the Prometheus server on the ' +
  'monitoring network, or query Prometheus and Grafana directly.'

/* -- Services ------------------------------------------------------- */

describe('deleteService', () => {
  it('parses the 200 body into a ServiceDeleteResult instead of expecting an empty 204', async () => {
    await withServer(
      () => ({
        status: 200,
        body: {
          service_id: 7,
          service_name: 'grafana',
          registry_reloaded: true,
          registry_error: null,
        },
      }),
      async (recorded) => {
        const result = await deleteService(7)

        expect(result).toEqual({
          service_id: 7,
          service_name: 'grafana',
          registry_reloaded: true,
          registry_error: null,
        })
        expect(recorded).toHaveLength(1)
        expect(recorded[0].method).toBe('DELETE')
        expect(recorded[0].url).toBe('/services/7')
      }
    )
  })

  it('reports a delete whose registry reload failed, which 204 had no room to say', async () => {
    await withServer(
      () => ({
        status: 207,
        body: {
          service_id: 7,
          service_name: 'grafana',
          registry_reloaded: false,
          registry_error: RELOAD_FAILED,
        },
      }),
      async () => {
        const result = await deleteService(7)

        expect(result.registry_reloaded).toBe(false)
        expect(result.registry_error).toBe(RELOAD_FAILED)
      }
    )
  })
})

describe('createService', () => {
  it('resolves on 207 and reports registry_reloaded false in the body', async () => {
    // 207 is a 2xx, so axios resolves it. The record was written and the
    // routing table was not reloaded; only these two fields say so, and a
    // caller that watched the status alone would call this a clean success.
    await withServer(
      () => ({
        status: 207,
        body: { ...SERVICE, registry_reloaded: false, registry_error: RELOAD_FAILED },
      }),
      async (recorded) => {
        const result = await createService(SERVICE_CREATE)

        expect(result.registry_reloaded).toBe(false)
        expect(result.registry_error).toBe(RELOAD_FAILED)
        // The ServiceRead half of the body survives alongside the two extra
        // fields, so the screen can still render the record it just created.
        expect(result.id).toBe(7)
        expect(result.name).toBe('grafana')
        expect(recorded[0].method).toBe('POST')
        expect(recorded[0].url).toBe('/services')
      }
    )
  })

  it('turns a FastAPI 422 list detail into one field-named message', async () => {
    await withServer(
      () => ({
        status: 422,
        body: {
          detail: [
            {
              type: 'value_error',
              loc: ['body', 'url'],
              msg: 'Value error, loopback addresses are not allowed',
              input: 'http://127.0.0.1:9000',
            },
          ],
        },
      }),
      async () => {
        const error = await createService(SERVICE_CREATE).then(
          () => null,
          (reason: unknown) => reason
        )

        expect(error).toBeInstanceOf(ApiError)
        const apiError = error as ApiError
        expect(apiError.status).toBe(422)
        // Without extractValidationDetail this would read "Request failed
        // with status code 422", which names neither the field nor the rule.
        expect(apiError.detail).toBe('url: loopback addresses are not allowed')
        expect(apiError.message).toBe('url: loopback addresses are not allowed')
      }
    )
  })

  it('names every refused field when the server refuses more than one', async () => {
    await withServer(
      () => ({
        status: 422,
        body: {
          detail: [
            { type: 'value_error', loc: ['body', 'url'], msg: 'Value error, scheme must be http or https' },
            {
              type: 'less_than_equal',
              loc: ['body', 'timeout_seconds'],
              msg: 'Input should be less than or equal to 300',
            },
          ],
        },
      }),
      async () => {
        const error = await createService(SERVICE_CREATE).then(
          () => null,
          (reason: unknown) => reason
        )

        expect((error as ApiError).detail).toBe(
          'url: scheme must be http or https; timeout_seconds: Input should be less than or equal to 300'
        )
      }
    )
  })
})

describe('updateService', () => {
  it('resolves on 207 and reports registry_reloaded false in the body', async () => {
    await withServer(
      () => ({
        status: 207,
        body: {
          ...SERVICE,
          display_name: 'Grafana (renamed)',
          registry_reloaded: false,
          registry_error: RELOAD_FAILED,
        },
      }),
      async (recorded) => {
        const result = await updateService(7, { display_name: 'Grafana (renamed)' })

        expect(result.registry_reloaded).toBe(false)
        expect(result.registry_error).toBe(RELOAD_FAILED)
        expect(result.display_name).toBe('Grafana (renamed)')
        expect(recorded[0].method).toBe('PUT')
        expect(recorded[0].url).toBe('/services/7')
        // The server applies `exclude_unset`, so an omitted key means "leave
        // as is". Sending the untouched fields back would overwrite whatever
        // changed on the server since this form was opened.
        expect(JSON.parse(recorded[0].body)).toEqual({ display_name: 'Grafana (renamed)' })
      }
    )
  })
})

/* -- Readiness ------------------------------------------------------ */

describe('fetchReadiness', () => {
  it('parses the 503 body rather than throwing the explanation away', async () => {
    await withServer(
      () => ({
        status: 503,
        body: {
          status: 'not ready',
          database: 'unavailable',
          registry: 'ready',
          service_count: 3,
          database_error: 'connection refused',
        },
      }),
      async (recorded) => {
        const result = await fetchReadiness()

        expect(result.status).toBe('not ready')
        expect(result.database).toBe('unavailable')
        expect(result.database_error).toBe('connection refused')
        expect(recorded[0].url).toBe('/ready')
      }
    )
  })

  it('sends no Authorization header even when a token is stored', async () => {
    // `/ready` is unauthenticated, and the readiness client deliberately
    // installs neither the token interceptor nor the 401 handling that would
    // read a probe answer as a session problem. A token is stored here on
    // purpose so the absence below means "not attached", not "none to send".
    tokenStorage.setTokens('an-access-token', 'a-refresh-token')

    await withServer(
      () => ({
        status: 503,
        body: {
          status: 'not ready',
          database: 'ready',
          registry: 'unavailable',
          service_count: 0,
          registry_error: 'registry has not been loaded',
        },
      }),
      async (recorded) => {
        const result = await fetchReadiness()

        expect(result.registry_error).toBe('registry has not been loaded')
        expect(recorded).toHaveLength(1)
        expect(recorded[0].authorization).toBeUndefined()
      }
    )
  })

  it('rejects a 503 that is a proxy error page rather than the probe body', async () => {
    await withServer(
      () => ({ status: 503, body: { message: '503 Service Temporarily Unavailable' } }),
      async () => {
        const error = await fetchReadiness().then(
          () => null,
          (reason: unknown) => reason
        )

        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).status).toBe(503)
      }
    )
  })
})

/* -- Observability -------------------------------------------------- */

describe('fetchBackupObservability', () => {
  it('rejects 501 as an ApiError that carries the unset-PROMETHEUS_URL detail', async () => {
    await withServer(
      () => ({ status: 501, body: { detail: NOT_CONFIGURED_DETAIL } }),
      async (recorded) => {
        const error = await fetchBackupObservability().then(
          () => null,
          (reason: unknown) => reason
        )

        expect(error).toBeInstanceOf(ApiError)
        const apiError = error as ApiError
        expect(apiError.status).toBe(501)
        expect(apiError.isNotImplemented).toBe(true)
        expect(apiError.detail).toBe(NOT_CONFIGURED_DETAIL)
        expect(recorded[0].url).toBe('/observability/backups')
      }
    )
  })

  it('rejects 502 as an ApiError that carries the Prometheus read failure', async () => {
    const detail = 'Prometheus could not be read: All connection attempts failed'
    await withServer(
      () => ({ status: 502, body: { detail } }),
      async () => {
        const error = await fetchBackupObservability().then(
          () => null,
          (reason: unknown) => reason
        )

        expect(error).toBeInstanceOf(ApiError)
        const apiError = error as ApiError
        expect(apiError.status).toBe(502)
        expect(apiError.isNotImplemented).toBe(false)
        expect(apiError.detail).toBe(detail)
      }
    )
  })

  it('keeps an unmeasured field null instead of reading it as zero', async () => {
    // Shapes follow the captured Prometheus response in
    // bifrost/tests/fixtures/prometheus_query_backups.json: `ship` publishes
    // no unshipped counter at all, and a component that never succeeded has
    // no success timestamp and therefore no age.
    await withServer(
      () => ({
        status: 200,
        body: {
          available: true,
          queried_at: '2026-09-23T00:00:00Z',
          note: null,
          components: [
            {
              component: 'postgresql',
              instance: 'vm3-node:9100',
              job: 'vm3-node',
              last_success_timestamp: 1758600000,
              last_run_timestamp: 1758600000,
              last_run_status: 0,
              unshipped_total: 6,
              age_seconds: 600,
            },
            {
              component: 'ship',
              instance: 'vm3-node:9100',
              job: 'vm3-node',
              last_success_timestamp: 1758400000,
              last_run_timestamp: 1758400000,
              last_run_status: 0,
              unshipped_total: null,
              age_seconds: 200600,
            },
            {
              component: 'all',
              instance: 'vm3-node:9100',
              job: 'vm3-node',
              last_success_timestamp: null,
              last_run_timestamp: 1758600000,
              last_run_status: 1,
              unshipped_total: null,
              age_seconds: null,
            },
          ],
        },
      }),
      async () => {
        const result = await fetchBackupObservability()

        expect(result.available).toBe(true)
        expect(result.components).toHaveLength(3)
        expect(result.components[0]).toMatchObject({
          component: 'postgresql',
          last_success_timestamp: 1758600000,
          last_run_status: 0,
          unshipped_total: 6,
        })
        expect(result.components[1].unshipped_total).toBeNull()
        expect(result.components[2].last_success_timestamp).toBeNull()
        expect(result.components[2].age_seconds).toBeNull()
      }
    )
  })

  it('keeps an available:false answer as a summary rather than an error', async () => {
    // Prometheus answered and holds no backup series yet. That is not a
    // failure of the call, and the empty component list is not "all zero".
    await withServer(
      () => ({
        status: 200,
        body: {
          available: false,
          queried_at: '2026-09-23T00:00:00Z',
          components: [],
          note: 'No bngdrasil_backup_ series found in Prometheus.',
        },
      }),
      async () => {
        const result = await fetchBackupObservability()

        expect(result.available).toBe(false)
        expect(result.components).toEqual([])
        expect(result.note).toBe('No bngdrasil_backup_ series found in Prometheus.')
      }
    )
  })
})

describe('fetchAlertObservability', () => {
  it('keeps silenced and inhibited null when Alertmanager was not consulted', async () => {
    // Null here means "not looked up". Coercing it to false anywhere between
    // the wire and the screen would state that Alertmanager confirmed the
    // alert is notifying, which nobody checked.
    await withServer(
      () => ({
        status: 200,
        body: {
          queried_at: '2026-09-23T00:00:00Z',
          firing_count: 2,
          alerts: [
            {
              alertname: 'BackupStale',
              severity: 'critical',
              instance: 'vm3-node:9100',
              service: null,
              job: 'vm3-node',
              component: 'postgresql',
              active_at: '2026-09-22T17:12:49.565092Z',
              summary: 'vm3-node:9100의 postgresql 백업이 8시간 넘게 성공하지 않았다',
              silenced: null,
              inhibited: null,
            },
            {
              alertname: 'TargetDown',
              severity: 'critical',
              instance: 'gateway:8000',
              service: null,
              job: 'msa-gateway',
              component: null,
              active_at: '2026-09-22T17:12:46.935164Z',
              summary: 'msa-gateway target이 5분 이상 응답하지 않는다',
              silenced: true,
              inhibited: false,
            },
          ],
          alertmanager: {
            configured: false,
            available: false,
            error: 'ALERTMANAGER_URL is not configured',
          },
        },
      }),
      async (recorded) => {
        const result = await fetchAlertObservability()

        expect(recorded[0].url).toBe('/observability/alerts')
        expect(result.firing_count).toBe(2)
        expect(result.alerts[0].silenced).toBeNull()
        expect(result.alerts[0].inhibited).toBeNull()
        expect(result.alerts[0].silenced).not.toBe(false)
        // A looked-up alert keeps its real booleans, so null is genuinely a
        // third state rather than the only value this field ever carries.
        expect(result.alerts[1].silenced).toBe(true)
        expect(result.alerts[1].inhibited).toBe(false)
        expect(result.alertmanager).toEqual({
          configured: false,
          available: false,
          error: 'ALERTMANAGER_URL is not configured',
        })
      }
    )
  })
})

/* -- Auth client ---------------------------------------------------- */

describe('api', () => {
  it('attaches the stored access token as a bearer credential', async () => {
    // The counterpart to the readiness case: this client does attach the
    // token, so the empty header there is a property of readinessApi and not
    // of the harness.
    tokenStorage.setTokens('an-access-token', 'a-refresh-token')

    await withServer(
      () => ({
        status: 200,
        body: {
          id: 1,
          username: 'bnbong',
          email: 'bbbong9@gmail.com',
          full_name: null,
          is_active: true,
          is_superuser: true,
          role: 'super_admin',
          created_at: '2026-09-01T00:00:00Z',
        },
      }),
      async (recorded) => {
        const user = await fetchCurrentUser()

        expect(user.role).toBe('super_admin')
        expect(recorded[0].url).toBe('/auth/me')
        expect(recorded[0].authorization).toBe('Bearer an-access-token')
      }
    )
  })
})
