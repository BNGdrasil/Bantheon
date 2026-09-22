import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HealthCheckAllResult,
  Service,
  ServiceHealthStatusResponse,
  ServiceUpdateRequest,
  deleteService,
  fetchService,
  fetchServiceHealth,
  hasRoleAtLeast,
  runHealthCheckAll,
  toApiError,
  updateService,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import {
  ErrorPanel,
  FreshnessLine,
  LoadingPanel,
  NoticePanel,
  describeError,
} from '../components/StatusPanel'
import { HealthBadge, ProbeBadge } from '../components/HealthBadge'
import { POLL_INTERVAL_MS, formatKst, useNow } from '../lib/datetime'
import { Dialog } from '../components/Dialog'

/**
 * The gateway rejects a target URL that points at loopback, a metadata service
 * or a non-HTTP scheme with 422. It also rejects a base path that already sits
 * on a blocked upstream path such as /metrics, because every proxied request
 * would then land below a blocked endpoint. The message explains the policy so
 * the operator does not read it as a transient failure.
 */
const URL_POLICY_HINT =
  '등록할 수 있는 주소는 http 또는 https이며, 루프백 주소와 클라우드 메타데이터 주소는 거절됩니다. ' +
  '주소의 경로가 /metrics처럼 차단된 상위 경로로 끝나도 거절됩니다.'

/** Form state for the update dialog. Metadata is edited as JSON text. */
interface EditForm {
  display_name: string
  url: string
  health_check_path: string
  timeout_seconds: number
  rate_limit_per_minute: number
  is_active: boolean
  description: string
  service_metadata: string
}

function formatMetadata(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return ''
  }
  return JSON.stringify(value, null, 2)
}

function toForm(service: Service): EditForm {
  return {
    display_name: service.display_name ?? '',
    url: service.url,
    health_check_path: service.health_check_path,
    timeout_seconds: service.timeout_seconds,
    rate_limit_per_minute: service.rate_limit_per_minute,
    is_active: service.is_active,
    description: service.description ?? '',
    service_metadata: formatMetadata(service.service_metadata),
  }
}

/**
 * Builds the request body from the fields that actually changed. The server
 * applies `exclude_unset`, so an omitted key keeps its stored value; sending
 * the whole record instead would overwrite a field another operator just
 * changed.
 */
function buildPayload(
  service: Service,
  form: EditForm,
  metadata: Record<string, unknown>
): ServiceUpdateRequest {
  const payload: ServiceUpdateRequest = {}

  const displayName = form.display_name.trim()
  if (displayName !== (service.display_name ?? '')) {
    payload.display_name = displayName === '' ? null : displayName
  }

  const url = form.url.trim()
  if (url !== service.url) {
    payload.url = url
  }

  const healthPath = form.health_check_path.trim()
  if (healthPath !== service.health_check_path) {
    payload.health_check_path = healthPath
  }

  if (form.timeout_seconds !== service.timeout_seconds) {
    payload.timeout_seconds = form.timeout_seconds
  }

  if (form.rate_limit_per_minute !== service.rate_limit_per_minute) {
    payload.rate_limit_per_minute = form.rate_limit_per_minute
  }

  if (form.is_active !== service.is_active) {
    payload.is_active = form.is_active
  }

  const description = form.description.trim()
  if (description !== (service.description ?? '')) {
    payload.description = description === '' ? null : description
  }

  if (formatMetadata(metadata) !== formatMetadata(service.service_metadata)) {
    payload.service_metadata = metadata
  }

  return payload
}

function ServiceDetailPage() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = useNow()
  const { user: currentUser } = useAuth()

  const serviceId = Number(params.id)
  const isValidId = Number.isInteger(serviceId) && serviceId > 0

  // Gating is a convenience only. The gateway requires the admin role on every
  // service write and decides each request on its own.
  const canManage = hasRoleAtLeast(currentUser?.role, 'admin')

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [probeResult, setProbeResult] = useState<HealthCheckAllResult | null>(null)
  const [probeRanAt, setProbeRanAt] = useState<number | null>(null)

  const serviceQuery = useQuery<Service>({
    queryKey: ['admin-service', serviceId],
    queryFn: () => fetchService(serviceId),
    enabled: isValidId,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  // The stored health record, read from the endpoint that does not probe.
  const healthQuery = useQuery<ServiceHealthStatusResponse>({
    queryKey: ['admin-service-health', serviceId],
    queryFn: () => fetchServiceHealth(serviceId),
    enabled: isValidId,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  const service = serviceQuery.data

  // Keep the dialog in step with the stored record while it is closed, so
  // opening it never starts from a value the poll has already replaced.
  useEffect(() => {
    if (service && !showEdit) {
      setForm(toForm(service))
    }
  }, [service, showEdit])

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-service', serviceId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-service-health', serviceId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-services'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-services-stats'] })
    await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
  }

  const updateMutation = useMutation({
    mutationFn: (payload: ServiceUpdateRequest) => updateService(serviceId, payload),
    onSuccess: async (updated) => {
      setActionError(null)
      setNotice(`${updated.name} 서비스를 수정했습니다. 게이트웨이 등록부도 함께 다시 적재됩니다.`)
      setShowEdit(false)
      await refreshAll()
    },
    onError: () => {
      setNotice(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteService(serviceId),
    onSuccess: async () => {
      setShowDelete(false)
      await queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-services-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
      queryClient.removeQueries({ queryKey: ['admin-service', serviceId] })
      queryClient.removeQueries({ queryKey: ['admin-service-health', serviceId] })
      navigate('/services', { replace: true })
    },
    onError: (error: unknown) => {
      setNotice(null)
      setActionError(describeError(error, '서비스를 삭제하지 못했습니다').message)
    },
  })

  // There is no single-service probe on the server. This runs the all-services
  // check, which is stated on the button and in the result text.
  const healthCheckMutation = useMutation<HealthCheckAllResult>({
    mutationFn: runHealthCheckAll,
    onSuccess: async (result) => {
      setActionError(null)
      setNotice(null)
      setProbeResult(result)
      setProbeRanAt(Date.now())
      await refreshAll()
    },
    onError: (error: unknown) => {
      setNotice(null)
      setProbeResult(null)
      setActionError(describeError(error, '상태 검사를 실행하지 못했습니다').message)
    },
  })

  const isWriting = updateMutation.isPending || deleteMutation.isPending

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!service || !form || updateMutation.isPending) {
      return
    }

    // An emptied box means "no metadata", which is an empty object. Sending
    // null instead would write a null column the read schema does not expect.
    let metadata: Record<string, unknown> = {}
    const metadataText = form.service_metadata.trim()
    if (metadataText !== '') {
      let parsed: unknown
      try {
        parsed = JSON.parse(metadataText)
      } catch {
        setFormError('메타데이터가 올바른 JSON이 아닙니다. 서버로 보내기 전에 여기서 멈췄습니다.')
        return
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setFormError('메타데이터는 중괄호로 감싼 객체여야 합니다.')
        return
      }
      metadata = parsed as Record<string, unknown>
    }

    const payload = buildPayload(service, form, metadata)
    if (Object.keys(payload).length === 0) {
      setFormError('바뀐 값이 없습니다.')
      return
    }

    setFormError(null)
    updateMutation.mutate(payload)
  }

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Service detail</p>
        <h1 className="page-title">{service ? service.display_name || service.name : '서비스 상세'}</h1>
        <p className="page-lead">
          게이트웨이 데이터베이스에 저장된 등록 내용입니다. 수정과 삭제는 저장 직후 등록부를 다시
          적재하므로 라우팅 표에 곧바로 반영됩니다.
        </p>
        <p className="spaced-top-sm">
          <Link to="/services">서비스 목록으로 돌아가기</Link>
        </p>
      </div>
      <FreshnessLine
        dataUpdatedAt={serviceQuery.dataUpdatedAt}
        now={now}
        isFetching={serviceQuery.isFetching}
      />
    </div>
  )

  if (!isValidId) {
    return (
      <div>
        {header}
        <NoticePanel tone="warning" title="서비스 번호가 올바르지 않습니다">
          <p>주소의 서비스 번호를 확인하세요.</p>
        </NoticePanel>
      </div>
    )
  }

  if (serviceQuery.isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="서비스를 불러오는 중입니다." />
      </div>
    )
  }

  if (serviceQuery.isError || !service) {
    const apiError = toApiError(serviceQuery.error)
    return (
      <div>
        {header}
        {apiError.status === 404 ? (
          <NoticePanel tone="warning" title="이 서비스를 찾을 수 없습니다">
            <p>이미 삭제되었거나 번호가 잘못되었습니다. 목록에서 다시 확인하세요.</p>
          </NoticePanel>
        ) : (
          <ErrorPanel
            title="서비스를 불러오지 못했습니다"
            error={serviceQuery.error}
            fallbackMessage="서비스 정보를 가져오지 못했습니다"
            onRetry={() => serviceQuery.refetch()}
          />
        )}
      </div>
    )
  }

  const updateError = updateMutation.isError ? toApiError(updateMutation.error) : null
  const storedHealth = healthQuery.data
  const probeOutcome = probeResult ? probeResult.results[service.name] : undefined

  return (
    <div>
      {header}

      {notice && (
        <NoticePanel tone="success" title="작업을 마쳤습니다">
          <p>{notice}</p>
        </NoticePanel>
      )}

      {actionError && (
        <NoticePanel tone="error" title="작업이 실패했습니다">
          <p>{actionError}</p>
        </NoticePanel>
      )}

      {!canManage && (
        <NoticePanel tone="info" title="쓰기 권한이 제한되어 있습니다">
          <p>서비스 수정과 삭제, 상태 검사는 관리자 이상만 호출할 수 있습니다.</p>
        </NoticePanel>
      )}

      <div className="toolbar spaced-bottom">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canManage || isWriting}
          onClick={() => {
            setActionError(null)
            setFormError(null)
            updateMutation.reset()
            setForm(toForm(service))
            setShowEdit(true)
          }}
        >
          수정
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={!canManage || isWriting}
          onClick={() => {
            setActionError(null)
            setNotice(null)
            setShowDelete(true)
          }}
        >
          삭제
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canManage || healthCheckMutation.isPending}
          onClick={() => healthCheckMutation.mutate()}
        >
          {healthCheckMutation.isPending ? '검사 중' : '전체 서비스 상태 검사'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => serviceQuery.refetch()}
          disabled={serviceQuery.isFetching}
        >
          {serviceQuery.isFetching ? '불러오는 중' : '다시 불러오기'}
        </button>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Registration</p>
            <h2 className="section-title">등록 정보</h2>
          </div>
          <span className={`badge ${service.is_active ? 'badge--info' : 'badge--neutral'}`}>
            {service.is_active ? '활성' : '비활성'}
          </span>
        </div>

        <div className="card">
          <div className="definition-list">
            <div>
              <p className="definition-term">서비스 번호</p>
              <p className="definition-value">{service.id}</p>
            </div>
            <div>
              <p className="definition-term">서비스 이름</p>
              <p className="definition-value">{service.name}</p>
            </div>
            <div>
              <p className="definition-term">표시 이름</p>
              <p className="definition-value">{service.display_name || '지정하지 않음'}</p>
            </div>
            <div>
              <p className="definition-term">대상 주소</p>
              <p className="definition-value break-all">{service.url}</p>
            </div>
            <div>
              <p className="definition-term">상태 검사 경로</p>
              <p className="definition-value">{service.health_check_path}</p>
            </div>
            <div>
              <p className="definition-term">응답 제한 시간</p>
              <p className="definition-value">{service.timeout_seconds}s</p>
            </div>
            <div>
              <p className="definition-term">요청 제한</p>
              <p className="definition-value">{service.rate_limit_per_minute} req/min</p>
            </div>
            <div>
              <p className="definition-term">등록 시각</p>
              <p className="definition-value">{formatKst(service.created_at)}</p>
            </div>
            <div>
              <p className="definition-term">마지막 수정 시각</p>
              <p className="definition-value">{formatKst(service.updated_at)}</p>
            </div>
          </div>

          <div className="spaced-top-lg">
            <p className="definition-term">설명</p>
            <p>{service.description || '설명이 없습니다.'}</p>
          </div>

          <div className="spaced-top-lg">
            <p className="definition-term">메타데이터</p>
            {service.service_metadata && Object.keys(service.service_metadata).length > 0 ? (
              <pre className="code-block mono">{formatMetadata(service.service_metadata)}</pre>
            ) : (
              <p>등록된 메타데이터가 없습니다.</p>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Last recorded health</p>
            <h2 className="section-title">마지막으로 기록된 상태</h2>
          </div>
          <FreshnessLine
            dataUpdatedAt={healthQuery.dataUpdatedAt}
            now={now}
            isFetching={healthQuery.isFetching}
            label="기록 조회"
          />
        </div>

        <p className="detail spaced-bottom">
          이 값은 데이터베이스에 저장된 마지막 검사 결과입니다. 이 화면을 여는 순간 대상 서비스에
          요청을 보내지 않으므로, 확인 시각이 오래되었다면 그 시점의 기록이라고 읽어야 합니다. 지금
          다시 검사하려면 위의 전체 서비스 상태 검사를 실행하세요.
        </p>

        {healthQuery.isLoading ? (
          <LoadingPanel message="기록된 상태를 불러오는 중입니다." />
        ) : healthQuery.isError || !storedHealth ? (
          <ErrorPanel
            title="기록된 상태를 불러오지 못했습니다"
            error={healthQuery.error}
            fallbackMessage="기록된 상태를 가져오지 못했습니다"
            onRetry={() => healthQuery.refetch()}
          />
        ) : (
          <div className="card">
            <div className="definition-list">
              <div>
                <p className="definition-term">기록된 상태</p>
                <p className="spaced-top-sm">
                  <HealthBadge status={storedHealth.health_status} />
                </p>
              </div>
              <div>
                <p className="definition-term">확인 시각</p>
                <p className="definition-value">
                  {formatKst(storedHealth.last_health_check, '검사한 기록이 없습니다')}
                </p>
              </div>
              <div>
                <p className="definition-term">등록 활성 여부</p>
                <p className="definition-value">{storedHealth.is_active ? '활성' : '비활성'}</p>
              </div>
            </div>
          </div>
        )}

        {probeResult && (
          <div className="card spaced-top">
            <p className="eyebrow">Health check run</p>
            <p className="detail">
              전체 서비스를 대상으로 검사했습니다. 실행 {formatKst(probeRanAt)} · 대상{' '}
              {probeResult.service_count}건.
            </p>
            <p className="spaced-top-sm">
              {probeOutcome ? (
                <>
                  이 서비스 결과 <ProbeBadge result={probeOutcome} />
                </>
              ) : (
                '이 서비스는 검사 대상에 없었습니다. 등록부에 적재되지 않았을 수 있습니다.'
              )}
            </p>
          </div>
        )}
      </section>

      {showEdit && form && (
        <Dialog
          labelledBy="edit-service-title"
          onClose={() => setShowEdit(false)}
          closeDisabled={updateMutation.isPending}
          onSubmit={handleSubmit}
        >
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="edit-service-title">
                서비스 수정
              </h2>
            </div>

            {formError && (
              <NoticePanel tone="warning" title="입력을 확인하세요">
                <p>{formError}</p>
              </NoticePanel>
            )}

            {updateError && (
              <NoticePanel
                tone={updateError.status === 422 ? 'warning' : 'error'}
                title={updateError.status === 422 ? '주소 정책에 맞지 않습니다' : '수정하지 못했습니다'}
              >
                <p>{describeError(updateMutation.error, '서비스를 수정하지 못했습니다').message}</p>
                {updateError.status === 422 && <p className="spaced-top-sm">{URL_POLICY_HINT}</p>}
              </NoticePanel>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="edit-name">서비스 이름</label>
                <input id="edit-name" className="mono" type="text" value={service.name} disabled readOnly />
                <span className="field-hint">
                  이름은 서버의 수정 스키마가 받지 않습니다. 바꾸려면 새로 등록해야 합니다.
                </span>
              </div>
              <div className="field">
                <label htmlFor="edit-display">표시 이름</label>
                <input
                  id="edit-display"
                  type="text"
                  value={form.display_name}
                  onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                />
              </div>
              <div className="field field--full">
                <label htmlFor="edit-url">대상 주소</label>
                <input
                  id="edit-url"
                  className="mono"
                  type="text"
                  required
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                />
                <span className="field-hint">{URL_POLICY_HINT}</span>
              </div>
              <div className="field">
                <label htmlFor="edit-health">상태 검사 경로</label>
                <input
                  id="edit-health"
                  className="mono"
                  type="text"
                  value={form.health_check_path}
                  onChange={(event) => setForm({ ...form, health_check_path: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-timeout">응답 제한 시간 (초)</label>
                <input
                  id="edit-timeout"
                  type="number"
                  min={1}
                  max={300}
                  value={form.timeout_seconds}
                  onChange={(event) =>
                    setForm({ ...form, timeout_seconds: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="edit-rate">요청 제한 (req/min)</label>
                <input
                  id="edit-rate"
                  type="number"
                  min={1}
                  value={form.rate_limit_per_minute}
                  onChange={(event) =>
                    setForm({ ...form, rate_limit_per_minute: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div className="field field--full">
                <label htmlFor="edit-description">설명</label>
                <textarea
                  id="edit-description"
                  rows={3}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="field field--full">
                <label htmlFor="edit-metadata">메타데이터 (JSON)</label>
                <textarea
                  id="edit-metadata"
                  className="mono"
                  rows={5}
                  value={form.service_metadata}
                  onChange={(event) => setForm({ ...form, service_metadata: event.target.value })}
                />
                <span className="field-hint">
                  비워 두면 빈 객체로 저장합니다. 객체 형식이 아니면 서버로 보내지 않고 여기서
                  멈춥니다.
                </span>
              </div>
              <div className="field field--full">
                <div className="checkbox-row">
                  <input
                    id="edit-active"
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  />
                  <label htmlFor="edit-active">게이트웨이가 이 서비스로 트래픽을 넘깁니다</label>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? '저장 중' : '저장'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowEdit(false)}
                disabled={updateMutation.isPending}
              >
                취소
              </button>
            </div>
          </>
        </Dialog>
      )}

      {showDelete && (
        <Dialog
          labelledBy="delete-service-title"
          onClose={() => setShowDelete(false)}
          closeDisabled={deleteMutation.isPending}
        >
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="delete-service-title">
                서비스를 삭제합니다
              </h2>
            </div>
            <div className="confirm-summary">
              <p className="subsection-title">대상</p>
              <p className="mono break-all">
                {service.name} · ID {service.id} · {service.url}
              </p>
            </div>
            <p>
              {service.name} 서비스를 등록에서 지우고 게이트웨이 등록부를 다시 적재합니다. 적재가
              끝나는 즉시 이 서비스로 가던 게이트웨이 경유 요청은 404를 받습니다. 삭제한 등록은
              되돌릴 수 없으며 같은 내용을 다시 등록해야 합니다.
            </p>
            <p className="detail spaced-top-sm">
              대상 서버 자체는 그대로 있습니다. 게이트웨이를 거치지 않는 경로로는 계속 접근할 수
              있습니다.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? '처리 중' : '삭제'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowDelete(false)}
                disabled={deleteMutation.isPending}
              >
                취소
              </button>
            </div>
          </>
        </Dialog>
      )}
    </div>
  )
}

export default ServiceDetailPage
