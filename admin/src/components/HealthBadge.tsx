import { HealthStatus } from '../services/api'

/**
 * Health is reported with a text label as well as a colour, because colour
 * alone is not a readable status. `unknown` means no observation was taken; it
 * is not a failure.
 */
const HEALTH_LABELS: Record<HealthStatus, { label: string; tone: string }> = {
  healthy: { label: '정상', tone: 'badge--success' },
  unhealthy: { label: '응답 실패', tone: 'badge--danger' },
  checking: { label: '확인 중', tone: 'badge--info' },
  unknown: { label: '미관측', tone: 'badge--neutral' },
}

export function HealthBadge({ status }: { status: HealthStatus }) {
  const entry = HEALTH_LABELS[status] || { label: status, tone: 'badge--neutral' }
  return <span className={`badge ${entry.tone}`}>{entry.label}</span>
}

const PROBE_LABELS: Record<string, { label: string; tone: string }> = {
  healthy: { label: '정상', tone: 'badge--success' },
  unhealthy: { label: '응답 실패', tone: 'badge--danger' },
  error: { label: '검사 오류', tone: 'badge--warning' },
}

/** One entry of a health-check-all run. */
export function ProbeBadge({ result }: { result: string }) {
  const entry = PROBE_LABELS[result] || { label: result, tone: 'badge--neutral' }
  return <span className={`badge ${entry.tone}`}>{entry.label}</span>
}
