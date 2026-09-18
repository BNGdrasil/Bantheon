/* ------------------------------------------------------------------ *
 * Time formatting and query staleness.
 *
 * The API serves UTC ISO 8601. Every timestamp on screen is rendered in KST
 * with the zone spelled out, so an operator never has to guess the offset.
 * ------------------------------------------------------------------ */
import { useEffect, useState } from 'react'

/** Poll interval for live screens. */
export const POLL_INTERVAL_MS = 30_000

/** A query older than this is shown as stale instead of as current data. */
export const STALE_AFTER_MS = 90_000

const KST_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

/**
 * Parses a server timestamp. A value without a zone suffix is treated as UTC,
 * because that is what the API documents; the browser would otherwise read it
 * as local time and shift every reading by nine hours.
 */
export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const parsed = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Renders an instant as KST, or a placeholder when there is nothing to show. */
export function formatKst(value: string | number | Date | null | undefined, fallback = '기록 없음'): string {
  let date: Date | null
  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'number') {
    date = new Date(value)
  } else {
    date = parseServerDate(value)
  }
  if (!date || Number.isNaN(date.getTime())) {
    return fallback
  }
  return `${new Intl.DateTimeFormat('ko-KR', KST_FORMAT).format(date)} KST`
}

/** Short elapsed-time label used next to a last-observed timestamp. */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (seconds < 60) {
    return `${seconds}초 전`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}분 전`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}시간 전`
  }
  return `${Math.floor(hours / 24)}일 전`
}

/**
 * Re-renders on an interval so that elapsed labels and the stale threshold
 * keep moving without a new server response.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}

/** True once the last successful fetch is older than the stale threshold. */
export function isStale(dataUpdatedAt: number, nowMs: number): boolean {
  return dataUpdatedAt > 0 && nowMs - dataUpdatedAt > STALE_AFTER_MS
}
