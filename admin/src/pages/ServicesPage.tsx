import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HealthCheckAllResult,
  HealthStatus,
  ReloadResult,
  Service,
  ServiceCreateRequest,
  ServiceStats,
  createService,
  fetchServiceStats,
  fetchServices,
  reloadServiceRegistry,
  runHealthCheckAll,
  toApiError,
} from '../services/api'
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

const EMPTY_SERVICE: ServiceCreateRequest = {
  name: '',
  display_name: '',
  url: '',
  health_check_path: '/health',
  timeout_seconds: 30,
  rate_limit_per_minute: 100,
  is_active: true,
  description: '',
}

type StatusFilter = 'all' | HealthStatus

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'healthy', label: '정상' },
  { value: 'unhealthy', label: '응답 실패' },
  { value: 'unknown', label: '미관측' },
  { value: 'checking', label: '확인 중' },
]

/**
 * The gateway rejects a target URL that points at loopback, a metadata service
 * or a non-HTTP scheme with 422. The message explains the policy so the
 * operator does not read it as a transient failure.
 */
const URL_POLICY_HINT =
  '등록할 수 있는 주소는 http 또는 https이며, 루프백 주소와 클라우드 메타데이터 주소는 거절됩니다.'

function ServicesPage() {
  const queryClient = useQueryClient()
  const now = useNow()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newService, setNewService] = useState<ServiceCreateRequest>(EMPTY_SERVICE)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [probeResult, setProbeResult] = useState<HealthCheckAllResult | null>(null)
  const [probeRanAt, setProbeRanAt] = useState<number | null>(null)

  const servicesQuery = useQuery<Service[]>({
    queryKey: ['admin-services'],
    queryFn: fetchServices,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  const statsQuery = useQuery<ServiceStats>({
    queryKey: ['admin-services-stats'],
    queryFn: fetchServiceStats,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  /** Re-reads the server state so a write is confirmed by the store, not assumed. */
  const refreshServices = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-services'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-services-stats'] })
    await queryClient.invalidateQueries({ queryKey: ['overview-stats'] })
  }

  const reloadMutation = useMutation<ReloadResult>({
    mutationFn: reloadServiceRegistry,
    onSuccess: async (result) => {
      setActionError(null)
      setNotice(`${result.message} · 등록부에 ${result.service_count}건을 적재했습니다.`)
      await refreshServices()
    },
    onError: (error: unknown) => {
      setNotice(null)
      const apiError = toApiError(error)
      setActionError(
        apiError.isUpstreamUnavailable
          ? apiError.detail || '등록부를 다시 적재하지 못했습니다. 게이트웨이 로그를 확인하세요.'
          : describeError(error, '등록부를 다시 적재하지 못했습니다').message
      )
    },
  })

  const healthCheckMutation = useMutation<HealthCheckAllResult>({
    mutationFn: runHealthCheckAll,
    onSuccess: async (result) => {
      setActionError(null)
      setNotice(null)
      setProbeResult(result)
      setProbeRanAt(Date.now())
      await refreshServices()
    },
    onError: (error: unknown) => {
      setNotice(null)
      setProbeResult(null)
      setActionError(describeError(error, '상태 검사를 실행하지 못했습니다').message)
    },
  })

  const addMutation = useMutation({
    mutationFn: (payload: ServiceCreateRequest) => createService(payload),
    onSuccess: async (service) => {
      setActionError(null)
      setNotice(`${service.name} 서비스를 등록했습니다. 등록부 반영은 다시 적재 후 확인하세요.`)
      setShowAdd(false)
      setNewService(EMPTY_SERVICE)
      await refreshServices()
    },
    onError: () => {
      setNotice(null)
    },
  })

  const services = servicesQuery.data
  const stats = statsQuery.data

  const visibleServices = useMemo(() => {
    if (!services) {
      return []
    }
    const keyword = search.trim().toLowerCase()
    return services.filter((service) => {
      if (statusFilter !== 'all' && service.health_status !== statusFilter) {
        return false
      }
      if (!keyword) {
        return true
      }
      return (
        service.name.toLowerCase().includes(keyword) ||
        (service.display_name || '').toLowerCase().includes(keyword) ||
        service.url.toLowerCase().includes(keyword)
      )
    })
  }, [services, search, statusFilter])

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    if (addMutation.isPending) {
      return
    }
    addMutation.mutate({
      ...newService,
      name: newService.name.trim(),
      url: newService.url.trim(),
    })
  }

  const addError = addMutation.isError ? toApiError(addMutation.error) : null

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Service register</p>
        <h1 className="page-title">서비스</h1>
        <p className="page-lead">
          등록 상태와 실제 관측 상태를 나눠서 표시합니다. 등록은 게이트웨이 DB가 원본이며, 등록부
          적재는 별도 작업입니다.
        </p>
      </div>
      <FreshnessLine
        dataUpdatedAt={servicesQuery.dataUpdatedAt}
        now={now}
        isFetching={servicesQuery.isFetching}
      />
    </div>
  )

  if (servicesQuery.isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="서비스를 불러오는 중입니다." />
      </div>
    )
  }

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

      <div className="toolbar spaced-bottom">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setActionError(null)
            addMutation.reset()
            setShowAdd(true)
          }}
        >
          서비스 등록
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => healthCheckMutation.mutate()}
          disabled={healthCheckMutation.isPending}
        >
          {healthCheckMutation.isPending ? '검사 중' : '전체 상태 검사'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => reloadMutation.mutate()}
          disabled={reloadMutation.isPending}
        >
          {reloadMutation.isPending ? '적재 중' : '등록부 다시 적재'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => servicesQuery.refetch()}
          disabled={servicesQuery.isFetching}
        >
          {servicesQuery.isFetching ? '불러오는 중' : '다시 불러오기'}
        </button>
      </div>

      {statsQuery.isError ? (
        <ErrorPanel
          title="서비스 통계를 불러오지 못했습니다"
          error={statsQuery.error}
          fallbackMessage="서비스 통계를 가져오지 못했습니다"
          onRetry={() => statsQuery.refetch()}
        />
      ) : stats ? (
        <div className="card-grid">
          <article className="card">
            <p className="eyebrow">Registered</p>
            <p className="metric-value">{stats.total_services}</p>
            <p className="metric-note">등록된 서비스, 활성 {stats.active_services}건</p>
          </article>
          <article className="card">
            <p className="eyebrow">Healthy</p>
            <p className="metric-value">{stats.healthy_services}</p>
            <p className="metric-note">마지막 검사에서 정상 응답</p>
          </article>
          <article className="card">
            <p className="eyebrow">Unhealthy</p>
            <p className="metric-value">{stats.unhealthy_services}</p>
            <p className="metric-note">마지막 검사에서 응답 실패</p>
          </article>
          <article className="card">
            <p className="eyebrow">Unknown</p>
            <p className="metric-value">{stats.unknown_services}</p>
            <p className="metric-note">아직 관측하지 않음. 장애와 구분합니다.</p>
          </article>
        </div>
      ) : null}

      {probeResult && (
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Health check run</p>
              <h2 className="section-title">상태 검사 결과</h2>
            </div>
            <p className="observed-at">
              실행 {formatKst(probeRanAt)} · 대상 {probeResult.service_count}건
            </p>
          </div>
          {probeResult.service_count === 0 ? (
            <div className="state-block">
              <p className="state-block-title">검사한 서비스가 없습니다</p>
              <p>등록부에 적재된 서비스가 없으면 검사 대상도 없습니다.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">서비스</th>
                    <th scope="col">검사 결과</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(probeResult.results).map(([name, result]) => (
                    <tr key={name}>
                      <td className="mono">{name}</td>
                      <td>
                        <ProbeBadge result={result} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Registered services</p>
            <h2 className="section-title">등록 목록</h2>
          </div>
          <div className="toolbar">
            <div className="field">
              <label className="visually-hidden" htmlFor="service-search">
                서비스 검색
              </label>
              <input
                id="service-search"
                type="text"
                placeholder="이름 또는 주소"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="visually-hidden" htmlFor="service-status">
                관측 상태 필터
              </label>
              <select
                id="service-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {servicesQuery.isError ? (
          <ErrorPanel
            title="서비스 목록을 불러오지 못했습니다"
            error={servicesQuery.error}
            fallbackMessage="서비스 목록을 가져오지 못했습니다"
            onRetry={() => servicesQuery.refetch()}
          />
        ) : !services || services.length === 0 ? (
          <div className="state-block">
            <p className="state-block-title">등록된 서비스가 없습니다</p>
            <p>서비스 등록 버튼으로 첫 서비스를 추가하세요.</p>
          </div>
        ) : visibleServices.length === 0 ? (
          <div className="state-block">
            <p className="state-block-title">조건에 맞는 서비스가 없습니다</p>
            <p>검색어나 상태 필터를 바꿔 보세요.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--wide">
              <thead>
                <tr>
                  <th scope="col">서비스</th>
                  <th scope="col">등록 상태</th>
                  <th scope="col">관측 상태</th>
                  <th scope="col">마지막 관측</th>
                  <th scope="col">대상 주소</th>
                  <th scope="col">제한</th>
                </tr>
              </thead>
              <tbody>
                {visibleServices.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <span className="row-name">{service.display_name || service.name}</span>
                      <div className="detail mono">{service.name}</div>
                      {service.description && <div className="detail">{service.description}</div>}
                    </td>
                    <td>
                      <span className={`badge ${service.is_active ? 'badge--info' : 'badge--neutral'}`}>
                        {service.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td>
                      <HealthBadge status={service.health_status} />
                    </td>
                    <td className="mono detail">{formatKst(service.last_health_check, '관측 없음')}</td>
                    <td>
                      <div className="mono detail break-all">
                        {service.url}
                      </div>
                      <div className="detail mono">검사 경로 {service.health_check_path}</div>
                    </td>
                    <td className="detail">
                      <div className="mono">{service.timeout_seconds}s</div>
                      <div className="mono">{service.rate_limit_per_minute} req/min</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAdd && (
        <Dialog
          labelledBy="add-service-title"
          onClose={() => setShowAdd(false)}
          closeDisabled={addMutation.isPending}
          onSubmit={handleAdd}
        >
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="add-service-title">
                서비스 등록
              </h2>
            </div>

            {addError && (
              <NoticePanel
                tone={addError.status === 422 ? 'warning' : 'error'}
                title={addError.status === 422 ? '주소 정책에 맞지 않습니다' : '등록하지 못했습니다'}
              >
                <p>{describeError(addMutation.error, '서비스를 등록하지 못했습니다').message}</p>
                {addError.status === 422 && <p className="spaced-top-sm">{URL_POLICY_HINT}</p>}
              </NoticePanel>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="svc-name">서비스 이름</label>
                <input
                  id="svc-name"
                  className="mono"
                  type="text"
                  required
                  value={newService.name}
                  onChange={(event) => setNewService({ ...newService, name: event.target.value })}
                />
                <span className="field-hint">라우팅 경로에 사용됩니다.</span>
              </div>
              <div className="field">
                <label htmlFor="svc-display">표시 이름</label>
                <input
                  id="svc-display"
                  type="text"
                  value={newService.display_name}
                  onChange={(event) =>
                    setNewService({ ...newService, display_name: event.target.value })
                  }
                />
              </div>
              <div className="field field--full">
                <label htmlFor="svc-url">대상 주소</label>
                <input
                  id="svc-url"
                  className="mono"
                  type="text"
                  required
                  placeholder="https://example.internal:8080"
                  value={newService.url}
                  onChange={(event) => setNewService({ ...newService, url: event.target.value })}
                />
                <span className="field-hint">{URL_POLICY_HINT}</span>
              </div>
              <div className="field">
                <label htmlFor="svc-health">상태 검사 경로</label>
                <input
                  id="svc-health"
                  className="mono"
                  type="text"
                  value={newService.health_check_path}
                  onChange={(event) =>
                    setNewService({ ...newService, health_check_path: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="svc-timeout">응답 제한 시간 (초)</label>
                <input
                  id="svc-timeout"
                  type="number"
                  min={1}
                  max={300}
                  value={newService.timeout_seconds}
                  onChange={(event) =>
                    setNewService({ ...newService, timeout_seconds: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="svc-rate">요청 제한 (req/min)</label>
                <input
                  id="svc-rate"
                  type="number"
                  min={1}
                  value={newService.rate_limit_per_minute}
                  onChange={(event) =>
                    setNewService({
                      ...newService,
                      rate_limit_per_minute: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="field field--full">
                <label htmlFor="svc-description">설명</label>
                <textarea
                  id="svc-description"
                  rows={3}
                  value={newService.description}
                  onChange={(event) =>
                    setNewService({ ...newService, description: event.target.value })
                  }
                />
              </div>
              <div className="field field--full">
                <div className="checkbox-row">
                  <input
                    id="svc-active"
                    type="checkbox"
                    checked={newService.is_active}
                    onChange={(event) =>
                      setNewService({ ...newService, is_active: event.target.checked })
                    }
                  />
                  <label htmlFor="svc-active">등록 즉시 트래픽을 받도록 활성화합니다</label>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={addMutation.isPending}>
                {addMutation.isPending ? '등록 중' : '등록'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowAdd(false)}
                disabled={addMutation.isPending}
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

export default ServicesPage
