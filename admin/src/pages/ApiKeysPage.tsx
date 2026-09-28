import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreated,
  User,
  createApiKey,
  fetchApiKeys,
  fetchUsers,
  hasRoleAtLeast,
  revokeApiKey,
  rotateApiKey,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import {
  ErrorPanel,
  FreshnessLine,
  LoadingPanel,
  NoticePanel,
  describeError,
} from '../components/StatusPanel'
import { POLL_INTERVAL_MS, formatKst, useNow } from '../lib/datetime'
import { describeApiKeyState, isUsableApiKey, localInputToUtcIso, ownerLabel } from '../lib/apikeys'
import { Dialog } from '../components/Dialog'

/* ------------------------------------------------------------------ *
 * API key administration.
 *
 * The plaintext key exists once, in the response that issued or rotated it.
 * It is held in React state and nowhere else: not in local storage, not in the
 * address bar, not in a console line. Closing the panel that shows it drops
 * the value, so the panel asks for a confirmation first.
 * ------------------------------------------------------------------ */

const ALL_OWNERS = 'all'

const EMPTY_FORM = { key_name: '', user_id: '', expires_at: '' }

type IssueForm = typeof EMPTY_FORM

/** How the plaintext on screen came to exist, which changes the wording. */
type PlaintextOrigin = 'issue' | 'rotate'

interface RevealedKey {
  origin: PlaintextOrigin
  result: ApiKeyCreated
}

/** A write waiting for confirmation, with the effect spelled out. */
type PendingAction = { kind: 'rotate'; key: ApiKey } | { kind: 'revoke'; key: ApiKey }

const NO_OVERLAP_NOTE =
  '회전에는 겹침 구간이 없습니다. 호출을 멈추지 않고 교체하려면 새 키를 먼저 발급하고, 호출자의 설정을 교체한 다음, 구 키를 폐기하세요.'

function describeAction(
  action: PendingAction,
  owner: string
): { title: string; effect: string; confirm: string } {
  if (action.kind === 'rotate') {
    return {
      title: '키를 회전합니다',
      effect: `${action.key.key_name} 키를 회전합니다. 새 키가 발급되는 순간 구 키는 즉시 거절되며, 이름과 소유자(${owner}), 만료 시각은 새 키가 그대로 물려받습니다.`,
      confirm: '회전',
    }
  }
  return {
    title: '키를 폐기합니다',
    effect: `${action.key.key_name} 키를 폐기합니다. 폐기는 되돌릴 수 없고, 이 키를 사용하는 호출자는 즉시 401을 받습니다. 기록은 남으므로 목록에서 폐기된 키로 계속 보입니다.`,
    confirm: '폐기',
  }
}

/**
 * The plaintext key, with a copy button.
 *
 * Clipboard access needs a secure context and a permission the browser may
 * refuse, so the value is printed on screen either way and the button only
 * saves a selection. A refused copy is reported rather than passed over in
 * silence.
 */
function PlaintextKey({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <>
      <p className="code-block mono break-all" data-testid="plaintext-key">
        {value}
      </p>
      <div className="toolbar spaced-top-sm">
        <button type="button" className="btn btn--sm" onClick={handleCopy}>
          키 복사
        </button>
        {copyState === 'copied' && <span className="detail">키를 복사했습니다.</span>}
        {copyState === 'failed' && (
          <span className="detail">
            브라우저가 복사를 허용하지 않았습니다. 위의 값을 직접 선택해서 복사하세요.
          </span>
        )}
      </div>
    </>
  )
}

function ApiKeysPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const now = useNow()

  const [ownerFilter, setOwnerFilter] = useState<string>(ALL_OWNERS)
  const [activeOnly, setActiveOnly] = useState(true)
  const [showIssue, setShowIssue] = useState(false)
  const [form, setForm] = useState<IssueForm>(EMPTY_FORM)
  const [revealed, setRevealed] = useState<RevealedKey | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // Role gating here is a convenience. The gateway and the auth server decide
  // every write again, and their answer is what the screen reports.
  const canRead = hasRoleAtLeast(currentUser?.role, 'admin')
  const canManage = hasRoleAtLeast(currentUser?.role, 'super_admin')

  const ownerId = ownerFilter === ALL_OWNERS ? null : Number(ownerFilter)

  const keysQuery = useQuery<ApiKey[]>({
    queryKey: ['admin-api-keys', ownerId],
    queryFn: () => fetchApiKeys(ownerId),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    enabled: canRead,
  })

  // The key record carries the owner id only. This query supplies the names,
  // and a failure here leaves the ids on screen instead of failing the page.
  const usersQuery = useQuery<User[]>({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    enabled: canRead,
  })

  const usernames = useMemo(() => {
    const map = new Map<number, string>()
    for (const user of usersQuery.data ?? []) {
      map.set(user.id, user.username)
    }
    return map
  }, [usersQuery.data])

  const refreshKeys = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] })
  }

  const onMutationError = (fallback: string) => (error: unknown) => {
    setActionNotice(null)
    setActionError(describeError(error, fallback).message)
  }

  const issueMutation = useMutation({
    mutationFn: (payload: ApiKeyCreateRequest) => createApiKey(payload),
    onSuccess: async (result) => {
      setActionError(null)
      setActionNotice(null)
      setShowIssue(false)
      setForm(EMPTY_FORM)
      setConfirmingClose(false)
      setRevealed({ origin: 'issue', result })
      await refreshKeys()
    },
    // The issue dialog stays open on a failure and renders the reason itself,
    // so the page-level panel is left alone: the same 409 printed twice reads
    // as two refusals.
    onError: () => setActionNotice(null),
  })

  const rotateMutation = useMutation({
    mutationFn: (keyId: number) => rotateApiKey(keyId),
    onSuccess: async (result) => {
      setActionError(null)
      setActionNotice(null)
      setPending(null)
      setConfirmingClose(false)
      setRevealed({ origin: 'rotate', result })
      await refreshKeys()
    },
    onError: onMutationError('키를 회전하지 못했습니다'),
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: number) => revokeApiKey(keyId),
    onSuccess: async (result) => {
      setActionError(null)
      setActionNotice(`${result.key_name} 키를 폐기했습니다.`)
      setPending(null)
      await refreshKeys()
    },
    onError: onMutationError('키를 폐기하지 못했습니다'),
  })

  const isWriting =
    issueMutation.isPending || rotateMutation.isPending || revokeMutation.isPending

  const runPending = () => {
    if (!pending || isWriting) {
      return
    }
    if (pending.kind === 'rotate') {
      rotateMutation.mutate(pending.key.id)
    } else {
      revokeMutation.mutate(pending.key.id)
    }
  }

  const handleIssue = (event: FormEvent) => {
    event.preventDefault()
    if (issueMutation.isPending) {
      return
    }
    setActionError(null)
    const payload: ApiKeyCreateRequest = {
      key_name: form.key_name.trim(),
      user_id: Number(form.user_id),
    }
    // An omitted expiry is what the server reads as "never expires", so a
    // blank input sends no key at all rather than a null.
    const expiresAt = localInputToUtcIso(form.expires_at)
    if (expiresAt) {
      payload.expires_at = expiresAt
    }
    issueMutation.mutate(payload)
  }

  /** Drops the plaintext from memory. The operator confirms this first. */
  const closeRevealed = () => {
    setRevealed(null)
    setConfirmingClose(false)
    setActionNotice('발급한 키를 화면에서 지웠습니다. 서버는 이 값을 다시 보여줄 수 없습니다.')
  }

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Identity / API keys</p>
        <h1 className="page-title">API 키</h1>
        <p className="page-lead">
          API 키는 인증 서버가 소유하고 게이트웨이가 중계합니다. 조회는 관리자 이상, 발급과 회전,
          폐기는 최고 관리자만 할 수 있습니다. 서버는 키의 요약값만 보관하므로 평문은 발급과 회전
          응답에서 한 번만 나타납니다.
        </p>
      </div>
      <FreshnessLine
        dataUpdatedAt={keysQuery.dataUpdatedAt}
        now={now}
        isFetching={keysQuery.isFetching}
      />
    </div>
  )

  if (!canRead) {
    return (
      <div>
        {header}
        <NoticePanel tone="warning" title="조회 권한이 없습니다">
          <p>API 키 목록은 관리자 이상만 볼 수 있습니다. 현재 계정의 역할을 확인하세요.</p>
        </NoticePanel>
      </div>
    )
  }

  if (keysQuery.isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="API 키 목록을 불러오는 중입니다." />
      </div>
    )
  }

  if (keysQuery.isError || !keysQuery.data) {
    return (
      <div>
        {header}
        <ErrorPanel
          title="API 키 목록을 불러오지 못했습니다"
          error={keysQuery.error}
          fallbackMessage="API 키 목록을 가져오지 못했습니다"
          onRetry={() => keysQuery.refetch()}
        />
      </div>
    )
  }

  const keys = keysQuery.data
  const visibleKeys = activeOnly ? keys.filter((key) => isUsableApiKey(key, now)) : keys
  const users = usersQuery.data ?? []
  const pendingDetail = pending
    ? describeAction(pending, ownerLabel(pending.key.user_id, usernames))
    : null

  return (
    <div>
      {header}

      {actionNotice && (
        <NoticePanel tone="success" title="변경을 반영했습니다">
          <p>{actionNotice}</p>
        </NoticePanel>
      )}

      {actionError && (
        <NoticePanel tone="error" title="요청이 거절되었습니다">
          <p>{actionError}</p>
        </NoticePanel>
      )}

      {!canManage && (
        <NoticePanel tone="info" title="쓰기 권한이 제한되어 있습니다">
          <p>
            현재 역할로는 목록을 조회하는 것만 할 수 있습니다. 발급과 회전, 폐기는 최고 관리자
            계정이 필요하며, 최종 판정은 서버가 내립니다.
          </p>
        </NoticePanel>
      )}

      <NoticePanel tone="info" title="무중단으로 키를 교체하는 순서">
        <p>{NO_OVERLAP_NOTE}</p>
      </NoticePanel>

      <div className="card spaced-bottom">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="key-owner-filter">소유자</label>
            <select
              id="key-owner-filter"
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              disabled={usersQuery.isLoading}
            >
              <option value={ALL_OWNERS}>전체 소유자</option>
              {users.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.username} (ID {user.id})
                </option>
              ))}
            </select>
            {usersQuery.isError && (
              <span className="field-hint">
                사용자 목록을 불러오지 못해서 소유자는 ID로만 표시합니다.
              </span>
            )}
          </div>
          <div className="field">
            <span className="field-hint">표시 범위</span>
            <div className="checkbox-row">
              <input
                id="key-active-only"
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked)}
              />
              <label htmlFor="key-active-only">활성 키만 보기</label>
            </div>
            <span className="field-hint">
              끄면 폐기된 키와 만료된 키도 함께 나열합니다.
            </span>
          </div>
        </div>
      </div>

      <div className="toolbar spaced-bottom">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setActionError(null)
            setActionNotice(null)
            setShowIssue(true)
          }}
          disabled={!canManage || isWriting}
          title={canManage ? undefined : '최고 관리자만 키를 발급할 수 있습니다'}
        >
          키 발급
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => keysQuery.refetch()}
          disabled={keysQuery.isFetching}
        >
          {keysQuery.isFetching ? '불러오는 중' : '다시 불러오기'}
        </button>
        <span className="detail">
          표시 {visibleKeys.length}건 / 조회 {keys.length}건
        </span>
      </div>

      {visibleKeys.length === 0 ? (
        <div className="state-block">
          <p className="state-block-title">표시할 API 키가 없습니다</p>
          <p>
            {keys.length === 0
              ? '인증 서버가 키를 하나도 돌려주지 않았습니다. 조회 자체는 성공했습니다.'
              : '조회한 키는 있으나 지금 걸어 둔 표시 범위에 걸리는 키가 없습니다. "활성 키만 보기"를 끄면 폐기된 키와 만료된 키도 나타납니다.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table--wide">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">접두</th>
                <th scope="col">소유자</th>
                <th scope="col">상태</th>
                <th scope="col">만료 시각</th>
                <th scope="col">마지막 사용</th>
                <th scope="col">생성 시각</th>
                <th scope="col">작업</th>
              </tr>
            </thead>
            <tbody>
              {visibleKeys.map((key) => {
                const state = describeApiKeyState(key, now)
                return (
                  <tr key={key.id}>
                    <td>
                      <span className="row-name">{key.key_name}</span>
                      <div className="detail mono">ID {key.id}</div>
                    </td>
                    <td className="mono">{key.key_prefix || '기록 없음'}</td>
                    <td>{ownerLabel(key.user_id, usernames)}</td>
                    <td>
                      <span className={`badge badge--${state.tone}`}>{state.label}</span>
                    </td>
                    <td className="mono detail">{formatKst(key.expires_at, '만료 없음')}</td>
                    <td className="mono detail">{formatKst(key.last_used_at, '사용 기록 없음')}</td>
                    <td className="mono detail">{formatKst(key.created_at, '기록 없음')}</td>
                    <td>
                      <div className="cell-actions">
                        <button
                          type="button"
                          className="btn btn--sm"
                          aria-label={`${key.key_name} 회전`}
                          disabled={!canManage || !key.is_active || isWriting}
                          title={
                            key.is_active ? undefined : '폐기된 키는 회전할 수 없습니다'
                          }
                          onClick={() => {
                            setActionError(null)
                            setActionNotice(null)
                            setPending({ kind: 'rotate', key })
                          }}
                        >
                          회전
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          aria-label={`${key.key_name} 폐기`}
                          disabled={!canManage || !key.is_active || isWriting}
                          title={key.is_active ? undefined : '이미 폐기된 키입니다'}
                          onClick={() => {
                            setActionError(null)
                            setActionNotice(null)
                            setPending({ kind: 'revoke', key })
                          }}
                        >
                          폐기
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="detail spaced-top-lg">
        목록과 상세 응답에는 평문 키도, 저장된 요약값도 들어 있지 않습니다. 화면이 보여줄 수 있는
        것은 접두 문자열까지입니다. 키를 잃어버렸다면 다시 볼 방법은 없고 회전이나 재발급으로
        교체해야 합니다.
      </p>

      {pending && pendingDetail && (
        <Dialog
          labelledBy="key-confirm-title"
          onClose={() => setPending(null)}
          closeDisabled={isWriting}
        >
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="key-confirm-title">
                {pendingDetail.title}
              </h2>
            </div>
            <div className="confirm-summary">
              <p className="subsection-title">대상</p>
              <p className="mono">
                {pending.key.key_name} · ID {pending.key.id} · {pending.key.key_prefix}
              </p>
            </div>
            <p>{pendingDetail.effect}</p>
            {pending.kind === 'rotate' && <p className="spaced-top-sm">{NO_OVERLAP_NOTE}</p>}
            <div className="form-actions">
              <button
                type="button"
                className={pending.kind === 'revoke' ? 'btn btn--danger' : 'btn btn--primary'}
                onClick={runPending}
                disabled={isWriting}
              >
                {isWriting ? '처리 중' : pendingDetail.confirm}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setPending(null)}
                disabled={isWriting}
              >
                취소
              </button>
            </div>
          </>
        </Dialog>
      )}

      {showIssue && (
        <Dialog
          labelledBy="key-issue-title"
          onClose={() => {
            setShowIssue(false)
            issueMutation.reset()
          }}
          closeDisabled={issueMutation.isPending}
          onSubmit={handleIssue}
        >
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="key-issue-title">
                키 발급
              </h2>
            </div>

            {issueMutation.isError && (
              <NoticePanel tone="error" title="키를 발급하지 못했습니다">
                <p>{describeError(issueMutation.error, '키를 발급하지 못했습니다').message}</p>
              </NoticePanel>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="new-key-name">키 이름</label>
                <input
                  id="new-key-name"
                  name="key_name"
                  type="text"
                  autoComplete="off"
                  required
                  maxLength={100}
                  value={form.key_name}
                  onChange={(event) => setForm({ ...form, key_name: event.target.value })}
                />
                <span className="field-hint">
                  이 키를 어디에서 쓰는지 알아볼 수 있게 적습니다. 1자 이상 100자 이하입니다.
                </span>
              </div>
              <div className="field">
                <label htmlFor="new-key-owner">소유자</label>
                <select
                  id="new-key-owner"
                  name="user_id"
                  required
                  value={form.user_id}
                  onChange={(event) => setForm({ ...form, user_id: event.target.value })}
                >
                  <option value="">계정을 고르세요</option>
                  {users.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.username} (ID {user.id})
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  키는 계정에 묶이며, 검증에 성공하면 그 계정의 역할을 따릅니다.
                </span>
              </div>
              <div className="field field--full">
                <label htmlFor="new-key-expires">만료 시각</label>
                <input
                  id="new-key-expires"
                  name="expires_at"
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => setForm({ ...form, expires_at: event.target.value })}
                />
                <span className="field-hint">
                  이 입력은 브라우저의 현지 시각으로 읽고 UTC로 바꾸어 보냅니다. 비워 두면 만료가
                  없는 키를 발급하며, 서버는 과거 시각을 거절합니다.
                </span>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={issueMutation.isPending}>
                {issueMutation.isPending ? '발급하는 중' : '키 발급'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowIssue(false)
                  issueMutation.reset()
                }}
                disabled={issueMutation.isPending}
              >
                취소
              </button>
            </div>
          </>
        </Dialog>
      )}

      {revealed && (
        // Escape is disabled on purpose: this panel holds the only copy of the
        // plaintext, so it is dismissed by an explicit confirmation instead.
        <Dialog labelledBy="key-plaintext-title" onClose={() => undefined} closeDisabled>
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="key-plaintext-title">
                {revealed.origin === 'issue' ? '키를 발급했습니다' : '키를 회전했습니다'}
              </h2>
            </div>

            <NoticePanel tone="warning" title="이 창을 닫으면 평문 키를 다시 볼 수 없습니다">
              <p>
                서버는 키의 요약값만 보관하기 때문에 이 값을 다시 보여줄 수 없습니다. 지금 복사해서
                사용할 곳에 옮겨 두세요.
              </p>
            </NoticePanel>

            <div className="confirm-summary">
              <p className="subsection-title">대상</p>
              <p className="mono">
                {revealed.result.key_name} · ID {revealed.result.id} ·{' '}
                {ownerLabel(revealed.result.user_id, usernames)}
              </p>
              <p className="detail">
                만료 {formatKst(revealed.result.expires_at, '만료 없음')} · 접두{' '}
                {revealed.result.key_prefix}
              </p>
            </div>

            <p className="subsection-title">평문 키</p>
            <PlaintextKey value={revealed.result.key} />

            {revealed.origin === 'rotate' && (
              <p className="spaced-top-sm">
                구 키는 이 순간부터 거절됩니다. 아직 교체하지 못한 호출자가 있다면 즉시 401을
                받습니다.
              </p>
            )}

            {confirmingClose ? (
              <>
                <p className="spaced-top-sm">
                  정말 닫습니까? 닫으면 이 평문 키는 화면에서 사라지고 다시 볼 수 없습니다.
                </p>
                <div className="form-actions">
                  <button type="button" className="btn btn--danger" onClick={closeRevealed}>
                    닫고 지우기
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirmingClose(false)}
                  >
                    계속 보기
                  </button>
                </div>
              </>
            ) : (
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setConfirmingClose(true)}>
                  닫기
                </button>
              </div>
            )}
          </>
        </Dialog>
      )}
    </div>
  )
}

export default ApiKeysPage
