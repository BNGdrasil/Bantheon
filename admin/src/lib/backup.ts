/* ------------------------------------------------------------------ *
 * Backup reading rules.
 *
 * The thresholds mirror the alert rules in
 * baedalus/monitoring/prometheus/rules/basic.yml, so the console and the
 * alerting stack call the same reading stale at the same moment. Local backups
 * run every six hours and are stale after eight (`BackupStale`); the offsite
 * shipping component retries every two hours and is stale after fourteen
 * (`BackupShipStale`); more than four unshipped copies is a pileup
 * (`BackupUnshippedPileup`).
 *
 * Every rule below treats null as "never reported" and never as zero. A
 * component that has not written a metric has not told us it is healthy.
 * ------------------------------------------------------------------ */
// Type-only import: these rules are pure arithmetic and must not drag the
// axios clients into a unit test.
import type { BackupComponentStatus } from '../services/api'

/** `component` label of the offsite shipping job, which the rules single out. */
export const SHIP_COMPONENT = 'ship'

/** `BackupStale`: local backup has not succeeded for eight hours. */
export const BACKUP_STALE_SECONDS = 8 * 3600

/** `BackupShipStale`: offsite shipping has not succeeded for fourteen hours. */
export const BACKUP_SHIP_STALE_SECONDS = 14 * 3600

/** `BackupUnshippedPileup`: more than four copies are waiting to be shipped. */
export const BACKUP_UNSHIPPED_LIMIT = 4

/*
 * `for:` durations of the same three rules.
 *
 * Crossing a threshold does not page. Prometheus holds the alert `pending`
 * until the breach has lasted for the `for:` duration, and only then does it
 * fire. The console states both numbers, because a card that reads "8시간을
 * 넘으면 경보" promises a page that will not arrive for another quarter hour.
 */

/** `for:` on `BackupStale`: fifteen minutes. */
export const BACKUP_STALE_FOR_SECONDS = 15 * 60

/** `for:` on `BackupShipStale`, which is the same fifteen minutes. */
export const BACKUP_SHIP_STALE_FOR_SECONDS = 15 * 60

/** `for:` on `BackupUnshippedPileup`, which is longer: thirty minutes. */
export const BACKUP_UNSHIPPED_PILEUP_FOR_SECONDS = 30 * 60

/** `for:` duration the stale rule applies to this component, in seconds. */
export function staleForSeconds(component: string): number {
  return component === SHIP_COMPONENT ? BACKUP_SHIP_STALE_FOR_SECONDS : BACKUP_STALE_FOR_SECONDS
}

/** Shown wherever the server reported null. Never rendered as 0. */
export const UNREPORTED_LABEL = '미보고'

/** Threshold the alert rules apply to this component, in seconds. */
export function staleThresholdSeconds(component: string): number {
  return component === SHIP_COMPONENT ? BACKUP_SHIP_STALE_SECONDS : BACKUP_STALE_SECONDS
}

export type AgeState = 'unreported' | 'fresh' | 'stale'

/**
 * Reads the age of the last successful backup against the alert threshold.
 *
 * A negative age means the reported success timestamp is ahead of the gateway
 * clock. That is a clock problem rather than a stale backup, so it is reported
 * as fresh and the screen shows the raw timestamp next to it.
 */
export function ageState(component: string, ageSeconds: number | null | undefined): AgeState {
  if (ageSeconds === null || ageSeconds === undefined || !Number.isFinite(ageSeconds)) {
    return 'unreported'
  }
  return ageSeconds > staleThresholdSeconds(component) ? 'stale' : 'fresh'
}

export type RunState = 'unreported' | 'success' | 'failure' | 'unknown'

/**
 * Reads `bngdrasil_backup_last_run_status`, where 0 is a successful run and 1
 * is a failed one. Any other number is reported as unknown rather than being
 * folded into one of the two known meanings.
 */
export function runState(status: number | null | undefined): RunState {
  if (status === null || status === undefined || !Number.isFinite(status)) {
    return 'unreported'
  }
  if (status === 0) {
    return 'success'
  }
  if (status === 1) {
    return 'failure'
  }
  return 'unknown'
}

export type UnshippedState = 'unreported' | 'clear' | 'pileup'

/** Reads the unshipped counter against `BackupUnshippedPileup`. */
export function unshippedState(value: number | null | undefined): UnshippedState {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'unreported'
  }
  return value > BACKUP_UNSHIPPED_LIMIT ? 'pileup' : 'clear'
}

export type ComponentTone = 'success' | 'warning' | 'neutral'

/**
 * Overall tone of one component row.
 *
 * A stale success, a failed run and a pileup each warrant attention, so any of
 * them makes the row a warning. A row that reported nothing at all stays
 * neutral: it is not a confirmed failure and must not be drawn as one.
 */
export function componentTone(component: BackupComponentStatus): ComponentTone {
  const age = ageState(component.component, component.age_seconds)
  const run = runState(component.last_run_status)
  const unshipped = unshippedState(component.unshipped_total)

  if (age === 'stale' || run === 'failure' || unshipped === 'pileup') {
    return 'warning'
  }
  if (age === 'fresh' && (run === 'success' || run === 'unreported')) {
    return 'success'
  }
  return 'neutral'
}

/**
 * Renders a seconds count as a coarse duration. The threshold comparisons stay
 * on the raw number; this is only the label next to it.
 */
export function formatAge(ageSeconds: number | null | undefined): string {
  if (ageSeconds === null || ageSeconds === undefined || !Number.isFinite(ageSeconds)) {
    return UNREPORTED_LABEL
  }
  const seconds = Math.round(ageSeconds)
  if (seconds < 0) {
    return '시각 역전'
  }
  if (seconds < 60) {
    return `${seconds}초 경과`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}분 경과`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}시간 ${minutes % 60}분 경과`
  }
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간 경과`
}

/**
 * Stable React key for one component row.
 *
 * The gateway now reports one row per `(component, instance, job)`
 * combination rather than one row per `component`, so the same `component`
 * label can appear more than once (e.g. the same backup script running on
 * two hosts). Keying on `component` alone collapses those rows in React.
 */
export function componentKey(component: BackupComponentStatus): string {
  return `${component.component}|${component.instance ?? ''}|${component.job ?? ''}`
}

/**
 * Converts a Prometheus unix timestamp in seconds to milliseconds for the KST
 * formatter. Null stays null so the caller can print the unreported label.
 */
export function toMillis(unixSeconds: number | null | undefined): number | null {
  if (unixSeconds === null || unixSeconds === undefined || !Number.isFinite(unixSeconds)) {
    return null
  }
  return unixSeconds * 1000
}
