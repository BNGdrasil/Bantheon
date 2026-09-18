import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ASSIGNABLE_ROLES,
  User,
  UserCreateRequest,
  UserRole,
  UserUpdateRequest,
  activateUser,
  createUser,
  deactivateUser,
  deleteUser,
  fetchUsers,
  hasRoleAtLeast,
  updateUser,
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
import { Dialog } from '../components/Dialog'

const ROLE_LABELS: Record<UserRole, string> = {
  user: '일반',
  moderator: '중재자',
  admin: '관리자',
  super_admin: '최고 관리자',
}

const EMPTY_FORM: UserCreateRequest = {
  username: '',
  email: '',
  password: '',
  full_name: '',
  role: 'user',
  is_active: true,
}

/** A write waiting for confirmation, with the target and the effect spelled out. */
type PendingAction =
  | { kind: 'role'; user: User; nextRole: UserRole }
  | { kind: 'delete'; user: User }
  | { kind: 'activate'; user: User }
  | { kind: 'deactivate'; user: User }

function describeAction(action: PendingAction): { title: string; effect: string; confirm: string } {
  switch (action.kind) {
    case 'role':
      return {
        title: '역할을 변경합니다',
        effect: `${action.user.username} 계정의 역할을 ${ROLE_LABELS[action.user.role]}에서 ${
          ROLE_LABELS[action.nextRole]
        }(으)로 바꿉니다. 이 계정이 접근할 수 있는 관리 기능이 즉시 달라집니다.`,
        confirm: '역할 변경',
      }
    case 'delete':
      return {
        title: '계정을 삭제합니다',
        effect: `${action.user.username} 계정을 삭제합니다. 삭제한 계정은 되돌릴 수 없으며 해당 계정의 토큰도 더 이상 인증되지 않습니다.`,
        confirm: '삭제',
      }
    case 'activate':
      return {
        title: '계정을 활성화합니다',
        effect: `${action.user.username} 계정이 다시 로그인할 수 있게 됩니다.`,
        confirm: '활성화',
      }
    case 'deactivate':
      return {
        title: '계정을 비활성화합니다',
        effect: `${action.user.username} 계정의 로그인을 막습니다. 계정 정보는 남습니다.`,
        confirm: '비활성화',
      }
  }
}

function UsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const now = useNow()

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<UserCreateRequest>(EMPTY_FORM)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // Role gating here is a convenience. The gateway re-checks every write, and
  // last-administrator protection is decided by the auth server alone.
  const canRead = hasRoleAtLeast(currentUser?.role, 'admin')
  const canToggleActive = canRead
  const canManage = hasRoleAtLeast(currentUser?.role, 'super_admin')

  const usersQuery = useQuery<User[]>({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    enabled: canRead,
  })

  /** Refetches from the server so the table shows the stored state, not the guess. */
  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    await usersQuery.refetch()
  }

  const onMutationError = (fallback: string) => (error: unknown) => {
    setActionNotice(null)
    setActionError(describeError(error, fallback).message)
  }

  const createMutation = useMutation({
    mutationFn: (payload: UserCreateRequest) => createUser(payload),
    onSuccess: async (created) => {
      setActionError(null)
      setActionNotice(`${created.username} 계정을 만들었습니다.`)
      setShowCreate(false)
      setForm(EMPTY_FORM)
      await refreshUsers()
    },
    onError: onMutationError('계정을 만들지 못했습니다'),
  })

  const updateMutation = useMutation({
    // Only the changed fields are sent; any other key is rejected with 422.
    mutationFn: ({ userId, payload }: { userId: number; payload: UserUpdateRequest }) =>
      updateUser(userId, payload),
    onSuccess: async (updated) => {
      setActionError(null)
      setActionNotice(`${updated.username} 계정의 역할을 ${ROLE_LABELS[updated.role]}(으)로 바꿨습니다.`)
      setPending(null)
      await refreshUsers()
    },
    onError: onMutationError('역할을 바꾸지 못했습니다'),
  })

  const activationMutation = useMutation({
    mutationFn: ({ userId, activate }: { userId: number; activate: boolean }) =>
      activate ? activateUser(userId) : deactivateUser(userId),
    onSuccess: async (_result, variables) => {
      setActionError(null)
      setActionNotice(variables.activate ? '계정을 활성화했습니다.' : '계정을 비활성화했습니다.')
      setPending(null)
      await refreshUsers()
    },
    onError: onMutationError('활성 상태를 바꾸지 못했습니다'),
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => deleteUser(userId),
    onSuccess: async () => {
      setActionError(null)
      setActionNotice('계정을 삭제했습니다.')
      setPending(null)
      await refreshUsers()
    },
    onError: onMutationError('계정을 삭제하지 못했습니다'),
  })

  const isWriting =
    createMutation.isPending ||
    updateMutation.isPending ||
    activationMutation.isPending ||
    deleteMutation.isPending

  const runPending = () => {
    if (!pending || isWriting) {
      return
    }
    switch (pending.kind) {
      case 'role':
        updateMutation.mutate({ userId: pending.user.id, payload: { role: pending.nextRole } })
        break
      case 'delete':
        deleteMutation.mutate(pending.user.id)
        break
      case 'activate':
        activationMutation.mutate({ userId: pending.user.id, activate: true })
        break
      case 'deactivate':
        activationMutation.mutate({ userId: pending.user.id, activate: false })
        break
    }
  }

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    if (createMutation.isPending) {
      return
    }
    setActionError(null)
    const payload: UserCreateRequest = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      is_active: form.is_active,
    }
    const fullName = form.full_name?.trim()
    if (fullName) {
      payload.full_name = fullName
    }
    createMutation.mutate(payload)
  }

  const header = (
    <div className="page-head">
      <div>
        <p className="eyebrow">Identity / Accounts</p>
        <h1 className="page-title">사용자</h1>
        <p className="page-lead">
          계정은 인증 서버가 소유하고 게이트웨이가 중계합니다. 조회는 관리자 이상, 생성과 역할
          변경, 삭제는 최고 관리자만 할 수 있습니다.
        </p>
      </div>
      <FreshnessLine
        dataUpdatedAt={usersQuery.dataUpdatedAt}
        now={now}
        isFetching={usersQuery.isFetching}
      />
    </div>
  )

  if (!canRead) {
    return (
      <div>
        {header}
        <NoticePanel tone="warning" title="조회 권한이 없습니다">
          <p>사용자 목록은 관리자 이상만 볼 수 있습니다. 현재 계정의 역할을 확인하세요.</p>
        </NoticePanel>
      </div>
    )
  }

  if (usersQuery.isLoading) {
    return (
      <div>
        {header}
        <LoadingPanel message="사용자 목록을 불러오는 중입니다." />
      </div>
    )
  }

  if (usersQuery.isError || !usersQuery.data) {
    return (
      <div>
        {header}
        <ErrorPanel
          title="사용자 목록을 불러오지 못했습니다"
          error={usersQuery.error}
          fallbackMessage="사용자 목록을 가져오지 못했습니다"
          onRetry={() => usersQuery.refetch()}
        />
      </div>
    )
  }

  const users = usersQuery.data
  const pendingDetail = pending ? describeAction(pending) : null

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
            현재 역할로는 계정 활성화와 비활성화만 할 수 있습니다. 생성과 역할 변경, 삭제는 최고
            관리자 계정이 필요합니다.
          </p>
        </NoticePanel>
      )}

      <div className="toolbar spaced-bottom">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setActionError(null)
            setShowCreate(true)
          }}
          disabled={!canManage || isWriting}
          title={canManage ? undefined : '최고 관리자만 계정을 만들 수 있습니다'}
        >
          계정 만들기
        </button>
        <button type="button" className="btn" onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
          {usersQuery.isFetching ? '불러오는 중' : '다시 불러오기'}
        </button>
        <span className="detail">등록 계정 {users.length}건</span>
      </div>

      {users.length === 0 ? (
        <div className="state-block">
          <p className="state-block-title">인증 서버가 계정을 반환하지 않았습니다</p>
          <p>목록이 비어 있습니다. 조회 자체는 성공했습니다.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table--wide">
            <thead>
              <tr>
                <th scope="col">계정</th>
                <th scope="col">역할</th>
                <th scope="col">활성 상태</th>
                <th scope="col">생성일</th>
                <th scope="col">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = currentUser?.id === user.id
                return (
                  <tr key={user.id}>
                    <td>
                      <span className="row-name">{user.username}</span>
                      <div className="detail">{user.email}</div>
                      {user.full_name && <div className="detail">{user.full_name}</div>}
                      <div className="detail mono">ID {user.id}</div>
                    </td>
                    <td>
                      {canManage ? (
                        <select
                          aria-label={`${user.username} 역할`}
                          value={user.role}
                          disabled={isWriting}
                          onChange={(event) => {
                            const nextRole = event.target.value as UserRole
                            if (nextRole === user.role) {
                              return
                            }
                            setActionError(null)
                            setActionNotice(null)
                            setPending({ kind: 'role', user, nextRole })
                          }}
                        >
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge badge--neutral">{ROLE_LABELS[user.role]}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${user.is_active ? 'badge--success' : 'badge--warning'}`}>
                        {user.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="mono detail">{formatKst(user.created_at, '기록 없음')}</td>
                    <td>
                      <div className="cell-actions">
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!canToggleActive || isWriting}
                          onClick={() => {
                            setActionError(null)
                            setActionNotice(null)
                            setPending({ kind: user.is_active ? 'deactivate' : 'activate', user })
                          }}
                        >
                          {user.is_active ? '비활성화' : '활성화'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          disabled={!canManage || isSelf || isWriting}
                          title={isSelf ? '자기 자신의 계정은 삭제할 수 없습니다' : undefined}
                          onClick={() => {
                            setActionError(null)
                            setActionNotice(null)
                            setPending({ kind: 'delete', user })
                          }}
                        >
                          삭제
                        </button>
                      </div>
                      {isSelf && <div className="detail">현재 로그인한 계정입니다.</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="detail spaced-top-lg">
        비밀번호 재설정은 게이트웨이가 제공하지 않습니다. 인증 서버의 재설정 절차를 사용하세요.
      </p>

      {pending && pendingDetail && (
        <Dialog labelledBy="confirm-title" onClose={() => setPending(null)} closeDisabled={isWriting}>
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="confirm-title">
                {pendingDetail.title}
              </h2>
            </div>
            <div className="confirm-summary">
              <p className="subsection-title">대상</p>
              <p className="mono">
                {pending.user.username} · ID {pending.user.id} · {pending.user.email}
              </p>
            </div>
            <p>{pendingDetail.effect}</p>
            {pending.kind === 'delete' && (
              <p className="detail spaced-top-sm">
                마지막 최고 관리자 계정은 서버가 거절합니다. 그 판단은 인증 서버가 내립니다.
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className={pending.kind === 'delete' ? 'btn btn--danger' : 'btn btn--primary'}
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

      {showCreate && (
        <Dialog
          labelledBy="create-title"
          onClose={() => {
            setShowCreate(false)
            createMutation.reset()
          }}
          closeDisabled={createMutation.isPending}
          onSubmit={handleCreate}
        >
          <>
            <div className="modal-head">
              <h2 className="modal-title" id="create-title">
                계정 만들기
              </h2>
            </div>

            {createMutation.isError && (
              <NoticePanel tone="error" title="계정을 만들지 못했습니다">
                <p>{describeError(createMutation.error, '계정을 만들지 못했습니다').message}</p>
              </NoticePanel>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="new-username">아이디</label>
                <input
                  id="new-username"
                  name="username"
                  type="text"
                  autoComplete="off"
                  required
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="new-email">이메일</label>
                <input
                  id="new-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="new-fullname">이름</label>
                <input
                  id="new-fullname"
                  name="full_name"
                  type="text"
                  autoComplete="off"
                  value={form.full_name ?? ''}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                />
                <span className="field-hint">비워 두면 전송하지 않습니다.</span>
              </div>
              <div className="field">
                <label htmlFor="new-password">비밀번호</label>
                <input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="new-role">역할</label>
                <select
                  id="new-role"
                  name="role"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-hint">활성 여부</span>
                <div className="checkbox-row">
                  <input
                    id="new-active"
                    type="checkbox"
                    checked={form.is_active ?? true}
                    onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  />
                  <label htmlFor="new-active">만든 즉시 로그인할 수 있게 합니다</label>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? '만드는 중' : '계정 만들기'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowCreate(false)
                  createMutation.reset()
                }}
                disabled={createMutation.isPending}
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

export default UsersPage
