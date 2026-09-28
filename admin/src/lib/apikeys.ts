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
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreated } from '../services/api'
import { formatKst, parseServerDate } from './datetime'

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
 *
 * Daylight saving transitions make two local readings ambiguous, and the
 * language settles both the same way: the offset in effect *before* the
 * transition is the one applied.
 *
 *   - A reading inside the spring-forward gap does not exist on the local
 *     clock. `2026-03-08T02:30` in America/New_York resolves through the
 *     pre-transition offset (-05:00) to `2026-03-08T07:30Z`, which is 03:30
 *     EDT: the instant lands after the gap rather than being refused.
 *   - A reading inside the autumn fall-back overlap happens twice.
 *     `2026-11-01T01:30` in the same zone resolves through the pre-transition
 *     offset (-04:00) to `2026-11-01T05:30Z`, so it is the first of the two
 *     occurrences, an hour earlier than the second one.
 *
 * Neither case is an error the operator can be asked about, because the input
 * carries no zone to disambiguate with. The screen therefore states the
 * converted instant back to the operator with `describeExpiryInput`, so the
 * hour that was actually chosen is visible before the request is sent. The
 * gateway VM and the operators run on KST, which has had no daylight saving
 * since 1988, so neither case arises there; a browser in a zone that does
 * observe it reads the confirmation line.
 */
export function localInputToUtcIso(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') {
    return null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** The converted expiry, stated in both notations the screen shows. */
export interface ExpiryPreview {
  /** What the request body carries. */
  utcIso: string
  /** The same instant in KST, which is the notation the rest of the screen uses. */
  kst: string
}

/**
 * Describes what one typed expiry becomes, for the confirmation line in the
 * issue dialog.
 *
 * A blank or unparsable input has nothing to state, so it yields null and the
 * dialog says nothing rather than showing a placeholder that looks like a
 * value.
 */
export function describeExpiryInput(value: string | null | undefined): ExpiryPreview | null {
  const utcIso = localInputToUtcIso(value)
  if (!utcIso) {
    return null
  }
  return { utcIso, kst: formatKst(utcIso) }
}

/* -- Keeping the plaintext out of the mutation cache ----------------- */

/**
 * An issue or rotate response with the plaintext taken out of it.
 *
 * TanStack Query keeps the resolved value of every mutation in its cache, and
 * that cache outlives the screen: it is what the devtools read and what a
 * retry would replay. So the plaintext must not be part of what a `mutationFn`
 * resolves with, and this type is what those functions resolve with instead.
 */
export type ApiKeyWithheld = Omit<ApiKeyCreated, 'key'>

/**
 * Splits one response: the plaintext leaves through `keep`, and the record the
 * caller gets back carries every other field.
 *
 * The destructuring is the whole point. Deleting the property afterwards would
 * mutate the object the HTTP layer resolved with, and copying the fields one
 * by one would silently drop a field the server adds later.
 */
export function takePlaintext(
  created: ApiKeyCreated,
  keep: (plaintext: string) => void
): ApiKeyWithheld {
  const { key, ...withheld } = created
  keep(key)
  return withheld
}

/**
 * The `mutationFn` the issue button runs.
 *
 * It is built here rather than written inline in the page so that a test can
 * run this exact function through a real `MutationCache` and read the cache
 * back afterwards.
 */
export function issueWithheldPlaintext(
  issue: (payload: ApiKeyCreateRequest) => Promise<ApiKeyCreated>,
  keep: (plaintext: string) => void
): (payload: ApiKeyCreateRequest) => Promise<ApiKeyWithheld> {
  return async (payload) => takePlaintext(await issue(payload), keep)
}

/** The `mutationFn` the rotate confirmation runs, on the same terms. */
export function rotateWithheldPlaintext(
  rotate: (keyId: number) => Promise<ApiKeyCreated>,
  keep: (plaintext: string) => void
): (keyId: number) => Promise<ApiKeyWithheld> {
  return async (keyId) => takePlaintext(await rotate(keyId), keep)
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
