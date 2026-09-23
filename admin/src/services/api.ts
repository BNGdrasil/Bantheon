import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.bnbong.com'
const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://api.bnbong.com/admin/api'

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const REFRESH_PATH = '/auth/refresh'

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

/**
 * Bumped whenever the session is torn down. A refresh that started before a
 * logout must not write its result afterwards, so every write checks that the
 * generation it started in is still current.
 */
let sessionGeneration = 0

export const tokenStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  },
  /** Current session generation; used to discard a stale refresh response. */
  getGeneration(): number {
    return sessionGeneration
  },
  setTokens(accessToken: string, refreshToken?: string | null): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    }
  },
  clear(): void {
    sessionGeneration += 1
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

/* ------------------------------------------------------------------ */
/* Error type                                                          */
/* ------------------------------------------------------------------ */

/**
 * Normalized API error. `status` is null when the request never reached the
 * server (network failure, timeout, CORS). Call sites use `status` to tell
 * "not implemented yet" (501) and "forbidden" (403) apart from real failures.
 */
export class ApiError extends Error {
  readonly status: number | null
  readonly detail: string | null

  constructor(message: string, status: number | null, detail: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  get isNotImplemented(): boolean {
    return this.status === 501
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isNetworkError(): boolean {
    return this.status === null
  }

  /** Too many login attempts, or a gateway rate limit. */
  get isRateLimited(): boolean {
    return this.status === 429
  }

  /** The auth server behind the gateway proxy could not be reached. */
  get isUpstreamUnavailable(): boolean {
    return this.status === 503
  }

  /** A business rule refused the change, such as last-administrator protection. */
  get isConflict(): boolean {
    return this.status === 409
  }
}

/**
 * Field name of one validation item. `loc` is the path into the request, so
 * the last string that is not the body marker is the field the operator has
 * to correct. An index (a number) is skipped: "0" names nothing on screen.
 */
function validationField(loc: unknown): string | null {
  if (!Array.isArray(loc)) {
    return null
  }
  for (let index = loc.length - 1; index >= 0; index -= 1) {
    const part = loc[index]
    if (typeof part === 'string' && part !== 'body' && part.trim() !== '') {
      return part
    }
  }
  return null
}

/**
 * Turns a FastAPI 422 body into one readable line.
 *
 * `detail` is a list of `{type, loc, msg, input, ctx}` there, and dropping it
 * would leave axios' own "Request failed with status code 422" on screen,
 * which says nothing about the field the server refused. Items that carry no
 * usable `msg` are skipped rather than rendered as blanks; if nothing is left
 * the caller falls back to its own text.
 */
export function extractValidationDetail(items: unknown[]): string | null {
  const messages: string[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const rawMessage = (item as { msg?: unknown }).msg
    if (typeof rawMessage !== 'string') {
      continue
    }
    // pydantic prefixes every ValueError it raises; the prefix is noise here.
    const message = rawMessage.replace(/^Value error,\s*/, '').trim()
    if (message === '') {
      continue
    }
    const field = validationField((item as { loc?: unknown }).loc)
    messages.push(field ? `${field}: ${message}` : message)
  }
  return messages.length > 0 ? messages.join('; ') : null
}

export function extractDetail(data: unknown): string | null {
  if (typeof data === 'string' && data.trim() !== '') {
    return data
  }
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') {
      return detail
    }
    if (Array.isArray(detail)) {
      const validationDetail = extractValidationDetail(detail)
      if (validationDetail) {
        return validationDetail
      }
    }
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return null
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError
    const status = axiosError.response?.status ?? null
    const detail = extractDetail(axiosError.response?.data)
    return new ApiError(detail || axiosError.message, status, detail)
  }
  if (error instanceof Error) {
    return new ApiError(error.message, null, null)
  }
  return new ApiError('Unknown error', null, null)
}

export function isNotImplementedError(error: unknown): boolean {
  return error instanceof ApiError && error.isNotImplemented
}

export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden
}

/**
 * Login failure text. 429 has to explain the wait, otherwise the visitor keeps
 * retrying and extends the block.
 */
export function loginErrorMessage(error: unknown): string {
  const apiError = toApiError(error)
  if (apiError.isRateLimited) {
    return apiError.detail || '로그인 시도가 분당 제한을 넘었습니다. 잠시 후 다시 시도하세요.'
  }
  if (apiError.isUnauthorized) {
    return apiError.detail || '아이디 또는 비밀번호가 올바르지 않습니다.'
  }
  if (apiError.isForbidden) {
    return apiError.detail || '이 계정에는 관리 화면 권한이 없습니다.'
  }
  if (apiError.isNetworkError) {
    return '인증 서버에 연결하지 못했습니다. 네트워크 상태를 확인하세요.'
  }
  return apiError.detail || apiError.message || '로그인에 실패했습니다.'
}

/**
 * Message shown for an error state. Prefers the server-provided detail.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const apiError = toApiError(error)
  if (apiError.isNetworkError) {
    return `${fallback} (server unreachable)`
  }
  return apiError.detail || apiError.message || fallback
}

/* ------------------------------------------------------------------ */
/* Axios clients                                                       */
/* ------------------------------------------------------------------ */

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

function isRefreshRequest(config: AxiosRequestConfig | undefined): boolean {
  return Boolean(config?.url && config.url.includes(REFRESH_PATH))
}

function redirectToLogin(): void {
  tokenStorage.clear()
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

/**
 * Auth and gateway-root client. Exported by name as well as by default so a
 * test can point `defaults.baseURL` at a local server; nothing else about it
 * changes.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

export const adminApi: AxiosInstance = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  timeout: 30000,
})

/**
 * The refresh endpoint is the only call that takes the refresh token; every
 * other request carries the access token.
 */
function attachToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = isRefreshRequest(config) ? tokenStorage.getRefreshToken() : tokenStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

api.interceptors.request.use(attachToken)
adminApi.interceptors.request.use(attachToken)

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) {
    throw new ApiError('No refresh token available', 401, null)
  }
  if (!refreshPromise) {
    const startedGeneration = tokenStorage.getGeneration()
    refreshPromise = axios
      .post(
        `${API_BASE_URL}${REFRESH_PATH}`,
        { refresh_token: refreshToken },
        { headers: { Authorization: `Bearer ${refreshToken}` }, timeout: 30000 }
      )
      .then((response) => {
        const data = response.data as TokenResponse
        if (!data?.access_token) {
          throw new ApiError('Refresh response has no access token', 401, null)
        }
        // A logout or a different login landed while this call was in flight.
        // Storing the result now would resurrect a cleared session, or write
        // one account's token over another's.
        if (
          tokenStorage.getGeneration() !== startedGeneration ||
          tokenStorage.getRefreshToken() !== refreshToken
        ) {
          throw new ApiError('Session changed while refreshing', 401, null)
        }
        tokenStorage.setTokens(data.access_token, data.refresh_token ?? refreshToken)
        return data.access_token
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function installResponseInterceptor(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const apiError = toApiError(error)
      const config = (axios.isAxiosError(error) ? error.config : undefined) as RetriableConfig | undefined

      // 401: try a single silent refresh, then fall back to the login screen.
      // 403 is never a redirect - the page renders a permission notice instead.
      if (apiError.isUnauthorized && config && !config._retried && !isRefreshRequest(config)) {
        config._retried = true

        // Only a failed refresh ends the session. Scoping the catch this
        // narrowly matters: otherwise a retry that fails with 403, 501, 500 or
        // a network error would sign the operator out and report the original
        // 401 instead of what actually went wrong.
        try {
          await refreshAccessToken()
        } catch {
          redirectToLogin()
          return Promise.reject(apiError)
        }

        try {
          return await client.request(config)
        } catch (retryError) {
          return Promise.reject(toApiError(retryError))
        }
      }

      if (apiError.isUnauthorized) {
        redirectToLogin()
      }

      return Promise.reject(apiError)
    }
  )
}

installResponseInterceptor(api)
installResponseInterceptor(adminApi)

/* ------------------------------------------------------------------ */
/* DTOs                                                                */
/* ------------------------------------------------------------------ */

export interface TokenResponse {
  access_token: string
  /** The auth server does not rotate refresh tokens; this is null on refresh. */
  refresh_token?: string | null
  token_type?: string
  expires_in?: number
}

export type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin'

/** Role order used for permission checks in the UI. */
export const ROLE_ORDER: UserRole[] = ['user', 'moderator', 'admin', 'super_admin']

export const ASSIGNABLE_ROLES: UserRole[] = ['user', 'moderator', 'admin', 'super_admin']

/**
 * Compares two roles by privilege. UI gating is a convenience only; the
 * gateway and the auth server remain the authority for every write.
 */
export function hasRoleAtLeast(role: string | undefined | null, minimum: UserRole): boolean {
  const index = ROLE_ORDER.indexOf((role ?? '') as UserRole)
  return index >= 0 && index >= ROLE_ORDER.indexOf(minimum)
}

/** Auth server user record, relayed unchanged by the gateway. */
export interface User {
  id: number
  username: string
  email: string
  full_name: string | null
  is_active: boolean
  is_superuser: boolean
  role: UserRole
  created_at: string | null
}

export interface UserCreateRequest {
  username: string
  email: string
  password: string
  full_name?: string
  role?: UserRole
  is_active?: boolean
}

export interface UserUpdateRequest {
  full_name?: string
  role?: UserRole
  is_active?: boolean
}

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown' | 'checking'

export interface Service {
  id: number
  name: string
  display_name: string | null
  url: string
  health_check_path: string
  timeout_seconds: number
  rate_limit_per_minute: number
  is_active: boolean
  description: string | null
  created_at: string
  updated_at: string
  last_health_check: string | null
  health_status: HealthStatus
  service_metadata: Record<string, unknown> | null
}

export interface ServiceStats {
  total_services: number
  active_services: number
  healthy_services: number
  unhealthy_services: number
  unknown_services: number
}

export interface ServiceCreateRequest {
  name: string
  display_name: string
  url: string
  health_check_path: string
  timeout_seconds: number
  rate_limit_per_minute: number
  is_active: boolean
  description: string
}

/**
 * Fields `ServiceUpdate` accepts. `name` is absent on purpose: the server
 * schema does not take it, so the routing key cannot be renamed here. Only the
 * keys that actually changed are sent, because the server applies
 * `exclude_unset` and an omitted key means "leave as is".
 */
export interface ServiceUpdateRequest {
  display_name?: string | null
  url?: string
  health_check_path?: string
  timeout_seconds?: number
  rate_limit_per_minute?: number
  is_active?: boolean
  description?: string | null
  service_metadata?: Record<string, unknown> | null
}

/**
 * Outcome of the registry reload that follows every service write.
 *
 * The server commits the database change first and reloads the routing table
 * afterwards. A failed reload is not rolled back, so the record is stored while
 * the gateway still routes by the previous snapshot. That case answers 207 with
 * `registry_reloaded: false`, which axios treats as a success because 207 is a
 * 2xx; only these two fields tell the screen that half the operation failed.
 */
export interface RegistryReloadOutcome {
  registry_reloaded: boolean
  registry_error: string | null
}

/**
 * Create and update response. Every `ServiceRead` field is still present, so
 * the record can be read from it exactly as before.
 */
export type ServiceWriteResult = Service & RegistryReloadOutcome

/**
 * Delete response. The endpoint answers 200 with this body rather than 204,
 * because a 204 has no place to report a reload that failed after the row was
 * already removed.
 */
export interface ServiceDeleteResult extends RegistryReloadOutcome {
  service_id: number
  service_name: string
}

/**
 * Backup state of one component, as last reported to Prometheus.
 *
 * Every measured field is optional. A component that has never written a
 * metric reports null there, and null is not zero: the offsite shipping
 * component publishes no unshipped counter at all, so a zero on that row would
 * claim "nothing is waiting" for a value nobody ever measured.
 *
 * `last_run_status` follows `bngdrasil_backup_last_run_status`, where 0 means
 * the last run succeeded and 1 means it failed.
 */
export interface BackupComponentStatus {
  component: string
  instance: string | null
  job: string | null
  last_success_timestamp: number | null
  last_run_timestamp: number | null
  last_run_status: number | null
  unshipped_total: number | null
  age_seconds: number | null
}

/** Summary of every backup component Prometheus currently knows about. */
export interface BackupObservability {
  /** False when Prometheus answered but holds no backup series yet. */
  available: boolean
  queried_at: string
  components: BackupComponentStatus[]
  note: string | null
}

/**
 * Outcome of the optional Alertmanager lookup. The firing alerts are correct
 * without it, so a failed lookup is reported here instead of failing the call.
 */
export interface AlertmanagerStatus {
  configured: boolean
  available: boolean
  error: string | null
}

/**
 * One alert Prometheus reports as firing. `silenced` and `inhibited` are null
 * when Alertmanager was not consulted, so an unknown suppression state is never
 * rendered as "not suppressed".
 */
export interface FiringAlert {
  alertname: string
  severity: string | null
  instance: string | null
  service: string | null
  job: string | null
  component: string | null
  active_at: string | null
  summary: string | null
  silenced: boolean | null
  inhibited: boolean | null
}

/** Summary of the alerts that are firing right now. */
export interface AlertsObservability {
  queried_at: string
  firing_count: number
  alerts: FiringAlert[]
  alertmanager: AlertmanagerStatus
}

/**
 * Stored health of one service. The endpoint that serves this reads the last
 * persisted record; it does not probe the upstream, so every rendering of it
 * has to be labelled as a past observation.
 */
export interface ServiceHealthStatusResponse {
  service_id: number
  service_name: string
  health_status: HealthStatus
  last_health_check: string | null
  is_active: boolean
}

export interface ActionResponse {
  message?: string
}

export interface ReloadResult {
  message: string
  status: string
  service_count: number
}

/** Result of one probe run. Keys are service names. */
export interface HealthCheckAllResult {
  message: string
  service_count: number
  results: Record<string, 'healthy' | 'unhealthy' | 'error'>
}

/**
 * Overview counters. `null` on a whole group means the gateway does not own
 * that data at all, which is never the same thing as zero.
 */
export interface OverviewStats {
  services: {
    total: number
    active: number
    healthy: number
    unhealthy: number
    unknown: number
  }
  registry: {
    ready: boolean
    loaded_services: number
    last_error: string | null
  }
  app: {
    version: string
    environment: string
  }
  users: null
  api_requests: null
  system: null
}

/**
 * Gateway readiness. Served by `/ready` on the gateway root, not by the admin
 * API. The two error strings are only present when the matching dependency
 * failed.
 */
export interface Readiness {
  status: string
  database: string
  registry: string
  service_count: number
  database_error?: string | null
  registry_error?: string | null
}

/** Effective gateway configuration. Read-only: `editable_at_runtime` is false. */
export interface Settings {
  environment: string
  version: string
  debug: boolean
  log_level: string
  rate_limit_per_minute: number
  rate_limit_exempt_paths: string[]
  max_request_body_bytes: number
  proxy_timeout_seconds: number
  cors_origins: string[]
  metrics_enabled: boolean
  editable_at_runtime: boolean
}

export interface SettingsResponse {
  settings: Settings
}

/* ------------------------------------------------------------------ */
/* Typed endpoints                                                     */
/* ------------------------------------------------------------------ */

export async function fetchCurrentUser(): Promise<User> {
  const response = await api.get<User>('/auth/me')
  return response.data
}

export async function requestToken(username: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams()
  body.append('username', username)
  body.append('password', password)

  const response = await api.post<TokenResponse>('/auth/token', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data
}

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const response = await adminApi.get<OverviewStats>('/settings/stats/overview')
  return response.data
}

/* -- Services ------------------------------------------------------ */

export async function fetchServices(): Promise<Service[]> {
  const response = await adminApi.get<Service[]>('/services')
  return response.data
}

export async function fetchServiceStats(): Promise<ServiceStats> {
  const response = await adminApi.get<ServiceStats>('/services/stats')
  return response.data
}

export async function fetchService(serviceId: number): Promise<Service> {
  const response = await adminApi.get<Service>(`/services/${serviceId}`)
  return response.data
}

/**
 * Registers a service and reloads the routing table.
 *
 * A reload that fails answers 207, which axios accepts as a success, so the
 * caller has to read `registry_reloaded` to tell the two apart.
 */
export async function createService(
  payload: ServiceCreateRequest
): Promise<ServiceWriteResult> {
  const response = await adminApi.post<ServiceWriteResult>('/services', payload)
  return response.data
}

/** Partial update. Reports the registry reload outcome like `createService`. */
export async function updateService(
  serviceId: number,
  payload: ServiceUpdateRequest
): Promise<ServiceWriteResult> {
  const response = await adminApi.put<ServiceWriteResult>(`/services/${serviceId}`, payload)
  return response.data
}

/**
 * Removes the service from the database and from the routing table.
 *
 * The endpoint answers 200 with a body, not 204, so a reload that failed after
 * the row was deleted can still be reported. The body is returned unchanged.
 */
export async function deleteService(serviceId: number): Promise<ServiceDeleteResult> {
  const response = await adminApi.delete<ServiceDeleteResult>(`/services/${serviceId}`)
  return response.data
}

/**
 * Reads the stored health record of one service.
 *
 * The gateway endpoint behind this returns the last persisted status and does
 * not contact the upstream, so the screen must not present the answer as a
 * fresh probe. `POST /services/health-check-all` is the call that probes.
 */
export async function fetchServiceHealth(
  serviceId: number
): Promise<ServiceHealthStatusResponse> {
  const response = await adminApi.get<ServiceHealthStatusResponse>(
    `/services/${serviceId}/health`
  )
  return response.data
}

/** Reloads the registry inline. A failed reload answers 503, never 200. */
export async function reloadServiceRegistry(): Promise<ReloadResult> {
  const response = await adminApi.post<ReloadResult>('/services/reload')
  return response.data
}

/** Probes every registered service and returns the per-service outcome. */
export async function runHealthCheckAll(): Promise<HealthCheckAllResult> {
  const response = await adminApi.post<HealthCheckAllResult>('/services/health-check-all')
  return response.data
}

/* -- Observability summaries --------------------------------------- */

/**
 * Backup state per component, read from Prometheus by the gateway.
 *
 * The gateway answers 501 when `PROMETHEUS_URL` is unset and 502 when
 * Prometheus could not be read. Neither is turned into an empty summary here:
 * both reject, and the screen states which one happened.
 */
export async function fetchBackupObservability(): Promise<BackupObservability> {
  const response = await adminApi.get<BackupObservability>('/observability/backups')
  return response.data
}

/**
 * Alerts that are firing right now. A failed Alertmanager lookup does not fail
 * this call; it lands in the `alertmanager` field with the suppression flags
 * left null.
 */
export async function fetchAlertObservability(): Promise<AlertsObservability> {
  const response = await adminApi.get<AlertsObservability>('/observability/alerts')
  return response.data
}

/* -- Readiness (gateway root, not the admin API) ------------------- */

/**
 * The readiness probe lives on the gateway root and takes no credentials, so
 * it uses its own client: the admin interceptors would attach a token and
 * would treat an answer as a session problem.
 */
export const readinessApi: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

/**
 * Reads `/ready`.
 *
 * A gateway that is not ready answers 503 with the very body that explains
 * why. Letting axios reject that status would throw the explanation away, so
 * 503 is accepted here and the caller renders the payload. Any other status,
 * and any network failure, still rejects.
 */
export async function fetchReadiness(): Promise<Readiness> {
  const response = await readinessApi.get<Readiness>('/ready', {
    validateStatus: (status) => status === 200 || status === 503,
  })
  const data = response.data
  if (!data || typeof data !== 'object' || typeof data.status !== 'string') {
    // A proxy error page instead of the probe body. Reporting it as an error
    // is honest; rendering it as a status would invent a reading.
    throw new ApiError('준비 상태 응답을 해석하지 못했습니다.', response.status, null)
  }
  return data
}

/* -- Users (gateway proxy to the auth server) ---------------------- */

export async function fetchUsers(): Promise<User[]> {
  const response = await adminApi.get<User[]>('/users/')
  return response.data
}

export async function createUser(payload: UserCreateRequest): Promise<User> {
  const response = await adminApi.post<User>('/users/', payload)
  return response.data
}

export async function updateUser(userId: number, payload: UserUpdateRequest): Promise<User> {
  const response = await adminApi.patch<User>(`/users/${userId}`, payload)
  return response.data
}

export async function activateUser(userId: number): Promise<ActionResponse> {
  const response = await adminApi.put<ActionResponse>(`/users/${userId}/activate`)
  return response.data
}

export async function deactivateUser(userId: number): Promise<ActionResponse> {
  const response = await adminApi.put<ActionResponse>(`/users/${userId}/deactivate`)
  return response.data
}

export async function deleteUser(userId: number): Promise<void> {
  await adminApi.delete(`/users/${userId}`)
}

/* -- Settings ------------------------------------------------------ */

/**
 * Effective settings are read-only. `PUT /settings/` answers 501, so no write
 * helper exists here on purpose.
 */
export async function fetchSettings(): Promise<SettingsResponse> {
  const response = await adminApi.get<SettingsResponse>('/settings/')
  return response.data
}

export default api
