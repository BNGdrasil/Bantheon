/* ------------------------------------------------------------------ *
 * API key state and expiry handling.
 *
 * Two decisions live here rather than in the screen. The first is what a key
 * actually is right now: the server reports `is_active` and `expires_at`
 * separately, so a key that is still marked active can already be past its
 * expiry, and drawing it as active would claim it still authenticates. The
 * second is the conversion of the expiry the operator types, which is a local
 * wall clock reading, into the UTC instant the server takes.
 *
 * Both are pure functions so that a unit test can fix them without a browser.
 * ------------------------------------------------------------------ */
import type { ApiKey } from '../services/api'
import { parseServerDate } from './datetime'

export type ApiKeyState = 'active' | 'expired' | 'revoked'

export interface ApiKeyStateLabel {
  state: ApiKeyState
  label: string
  /** Badge modifier used by the table, so the three states never disagree. */
  tone: 'success' | 'warning' | 'neutral'
}

const STATE_LABELS: Record<ApiKeyState, ApiKeyStateLabel> = {
  active: { state: 'active', label: '활성', tone: 'success' },
  expired: { state: 'expired', label: '만료', tone: 'warning' },
  revoked: { state: 'revoked', label: '폐기', tone: 'neutral' },
}

/**
 * Decides what one key is at `nowMs`.
 *
 * Revocation is checked first because it is a stored fact, while expiry is a
 * comparison against the clock: a revoked key that also happens to be past its
 * expiry was withdrawn, and saying "expired" about it would suggest it lapsed
 * on its own. A key without an expiry never expires, which is the default for
 * the service accounts that would otherwise fail unattended.
 */
export function apiKeyState(
  key: Pick<ApiKey, 'is_active' | 'expires_at'>,
  nowMs: number
): ApiKeyState {
  if (!key.is_active) {
    return 'revoked'
  }
  const expiresAt = parseServerDate(key.expires_at)
  if (expiresAt && expiresAt.getTime() <= nowMs) {
    return 'expired'
  }
  return 'active'
}

/** The label and badge tone for one key, kept in one place for both. */
export function describeApiKeyState(
  key: Pick<ApiKey, 'is_active' | 'expires_at'>,
  nowMs: number
): ApiKeyStateLabel {
  return STATE_LABELS[apiKeyState(key, nowMs)]
}

/**
 * True when the key still authenticates, which is what the "active only"
 * filter means. An expired key is not active even though `is_active` is true.
 */
export function isUsableApiKey(
  key: Pick<ApiKey, 'is_active' | 'expires_at'>,
  nowMs: number
): boolean {
  return apiKeyState(key, nowMs) === 'active'
}

/**
 * Turns the value of a `datetime-local` input into the UTC instant the server
 * stores.
 *
 * The input has no zone, and the platform reads such a string as local time,
 * which is what the operator meant by typing it. `toISOString` then states
 * that instant in UTC, so the server receives the moment the operator chose
 * rather than the digits they typed. An empty or unparsable value yields null,
 * which the caller turns into an omitted field: a key without an expiry.
 */
export function localInputToUtcIso(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') {
    return null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Name of the owner for one key.
 *
 * The key record carries the numeric id only, so the username comes from the
 * separate user list. That list can be missing, either because the query has
 * not finished or because it was refused, and in that case the id is shown on
 * its own. Inventing a name there would present a failed lookup as an answer.
 */
export function ownerLabel(userId: number, usernames: Map<number, string>): string {
  const username = usernames.get(userId)
  return username ? `${username} (ID ${userId})` : `ID ${userId}`
}
