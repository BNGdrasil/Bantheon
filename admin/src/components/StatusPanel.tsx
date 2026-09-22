import { ReactNode } from 'react'
import { ApiError, toApiError } from '../services/api'
import { formatElapsed, formatKst, isStale } from '../lib/datetime'

/* ------------------------------------------------------------------ *
 * Shared state rendering.
 *
 * loading, empty, error, stale, unauthorized, forbidden and not-implemented
 * each get their own look. A failed query is never drawn as an empty list or
 * as a zero, because both read as a confirmed observation.
 * ------------------------------------------------------------------ */

export const NOT_COLLECTED_LABEL = '미수집'

/**
 * Renders a counter the server may report as null. `0` stays `0` because it is
 * a real observation; null becomes the not-collected label.
 */
// This helper states the not-collected convention the panels below render, so
// it stays in the same file. The rule only guards dev-server fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function formatMetric(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) {
    return NOT_COLLECTED_LABEL
  }
  return `${value}${suffix}`
}

export function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      {message}
    </div>
  )
}

export function EmptyPanel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state-block">
      <p className="state-block-title">{title}</p>
      {children}
    </div>
  )
}

export type PanelTone = 'error' | 'warning' | 'info' | 'success'

export function NoticePanel({
  tone,
  title,
  children,
  actions,
}: {
  tone: PanelTone
  title?: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={`panel panel--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {title && <p className="panel-title">{title}</p>}
      {children && <div className="panel-body">{children}</div>}
      {actions && <div className="panel-actions">{actions}</div>}
    </div>
  )
}

/** Tone and text for one failed request, keyed by what the server answered. */
// ErrorPanel below is the primary caller, so the mapping stays next to the
// panel that renders it. The rule only guards dev-server fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function describeError(error: unknown, fallbackMessage: string): {
  tone: PanelTone
  message: string
  retryable: boolean
} {
  const apiError: ApiError = toApiError(error)

  if (apiError.isNotImplemented) {
    return {
      tone: 'warning',
      message: apiError.detail || '서버가 아직 구현하지 않은 기능입니다.',
      retryable: false,
    }
  }
  if (apiError.isForbidden) {
    return {
      tone: 'warning',
      message: apiError.detail || '이 작업에 필요한 권한이 없습니다.',
      retryable: false,
    }
  }
  if (apiError.isUnauthorized) {
    return {
      tone: 'warning',
      message: apiError.detail || '세션이 만료되었습니다. 다시 로그인하세요.',
      retryable: false,
    }
  }
  if (apiError.isUpstreamUnavailable) {
    return {
      tone: 'error',
      message: apiError.detail || '연동 서버에 연결하지 못했습니다.',
      retryable: true,
    }
  }
  if (apiError.isNetworkError) {
    return { tone: 'error', message: `${fallbackMessage} (서버에 연결하지 못했습니다)`, retryable: true }
  }
  return {
    tone: 'error',
    message: apiError.detail || apiError.message || fallbackMessage,
    retryable: true,
  }
}

/**
 * Error state for a failed query. Never render an empty list instead of this.
 */
export function ErrorPanel({
  title,
  error,
  fallbackMessage,
  onRetry,
}: {
  title: string
  error: unknown
  fallbackMessage: string
  onRetry?: () => void
}) {
  const { tone, message, retryable } = describeError(error, fallbackMessage)

  return (
    <NoticePanel
      tone={tone}
      title={title}
      actions={
        onRetry && retryable ? (
          <button type="button" className="btn btn--sm" onClick={onRetry}>
            다시 시도
          </button>
        ) : undefined
      }
    >
      <p>{message}</p>
    </NoticePanel>
  )
}

/**
 * Last-observed line for a polled query. Once the data passes the stale
 * threshold the reading is labelled as stale rather than presented as current.
 */
export function FreshnessLine({
  dataUpdatedAt,
  now,
  isFetching,
  label = '마지막 갱신',
}: {
  dataUpdatedAt: number
  now: number
  isFetching?: boolean
  label?: string
}) {
  if (!dataUpdatedAt) {
    return null
  }
  const stale = isStale(dataUpdatedAt, now)
  return (
    <p className="observed-at" role="status" aria-live="polite">
      {stale && <span className="badge badge--warning">갱신 지연</span>}{' '}
      {label} {formatKst(dataUpdatedAt)} ({formatElapsed(dataUpdatedAt, now)})
      {isFetching ? ' · 갱신 중' : ''}
    </p>
  )
}
