import { describe, expect, it } from 'vitest'
import {
  apiKeyState,
  describeApiKeyState,
  isUsableApiKey,
  localInputToUtcIso,
  ownerLabel,
} from './apikeys'

/* ------------------------------------------------------------------ *
 * The three states of an API key, and the expiry the operator types.
 *
 * The server reports `is_active` and `expires_at` separately and never
 * combines them, so the verdict is made here. The cases below fix the two that
 * a screen reading `is_active` alone would get wrong: a key whose expiry has
 * passed while the flag is still true, and a revoked key that is also past its
 * expiry.
 * ------------------------------------------------------------------ */

const NOW = Date.parse('2026-09-28T00:00:00Z')

/** Timestamps arrive as UTC written without a zone suffix. */
const PAST = '2026-09-20T00:00:00'
const FUTURE = '2026-12-31T00:00:00'

describe('apiKeyState', () => {
  it('calls an active key without an expiry active', () => {
    expect(apiKeyState({ is_active: true, expires_at: null }, NOW)).toBe('active')
  })

  it('calls an active key whose expiry is still ahead active', () => {
    expect(apiKeyState({ is_active: true, expires_at: FUTURE }, NOW)).toBe('active')
  })

  it('calls an active key whose expiry has passed expired', () => {
    // The flag is still true here. Reading it alone would claim the key still
    // authenticates, which the auth server no longer agrees with.
    expect(apiKeyState({ is_active: true, expires_at: PAST }, NOW)).toBe('expired')
  })

  it('treats the expiry instant itself as already past', () => {
    expect(
      apiKeyState({ is_active: true, expires_at: '2026-09-28T00:00:00' }, NOW)
    ).toBe('expired')
  })

  it('reads the expiry as UTC rather than as local time', () => {
    // 2026-09-28T08:00:00 without a suffix is 08:00 UTC, which is ahead of
    // NOW. Read as KST it would be 2026-09-27T23:00Z and therefore past, so
    // this case fails if the suffix is ever dropped.
    expect(apiKeyState({ is_active: true, expires_at: '2026-09-28T08:00:00' }, NOW)).toBe(
      'active'
    )
  })

  it('calls a revoked key revoked even when its expiry has also passed', () => {
    // It was withdrawn; saying "expired" would suggest it lapsed on its own.
    expect(apiKeyState({ is_active: false, expires_at: PAST }, NOW)).toBe('revoked')
    expect(apiKeyState({ is_active: false, expires_at: null }, NOW)).toBe('revoked')
  })
})

describe('describeApiKeyState', () => {
  it('gives each state one label and one badge tone', () => {
    expect(describeApiKeyState({ is_active: true, expires_at: null }, NOW)).toEqual({
      state: 'active',
      label: '활성',
      tone: 'success',
    })
    expect(describeApiKeyState({ is_active: true, expires_at: PAST }, NOW)).toEqual({
      state: 'expired',
      label: '만료',
      tone: 'warning',
    })
    expect(describeApiKeyState({ is_active: false, expires_at: null }, NOW)).toEqual({
      state: 'revoked',
      label: '폐기',
      tone: 'neutral',
    })
  })
})

describe('isUsableApiKey', () => {
  it('excludes an expired key from the active-only view', () => {
    expect(isUsableApiKey({ is_active: true, expires_at: FUTURE }, NOW)).toBe(true)
    expect(isUsableApiKey({ is_active: true, expires_at: PAST }, NOW)).toBe(false)
    expect(isUsableApiKey({ is_active: false, expires_at: FUTURE }, NOW)).toBe(false)
  })
})

describe('localInputToUtcIso', () => {
  it('states the instant the operator picked, in UTC', () => {
    // The input carries no zone and the platform reads it as local time, which
    // is what the operator meant. Comparing the two instants keeps this case
    // true whatever zone the test process runs in.
    const value = '2026-10-01T09:30'
    const converted = localInputToUtcIso(value)

    expect(converted).not.toBeNull()
    expect(Date.parse(converted as string)).toBe(new Date(value).getTime())
    expect(converted).toMatch(/Z$/)
  })

  it('returns null for a blank value, which means a key without an expiry', () => {
    expect(localInputToUtcIso('')).toBeNull()
    expect(localInputToUtcIso('   ')).toBeNull()
    expect(localInputToUtcIso(null)).toBeNull()
    expect(localInputToUtcIso(undefined)).toBeNull()
  })

  it('returns null for an unparsable value instead of an invalid date string', () => {
    expect(localInputToUtcIso('내일 오전')).toBeNull()
  })
})

describe('ownerLabel', () => {
  it('names the owner when the user list supplied the name', () => {
    expect(ownerLabel(2, new Map([[2, 'operator']]))).toBe('operator (ID 2)')
  })

  it('falls back to the id alone rather than inventing a name', () => {
    // The user list can be missing because the query is still running or was
    // refused. Either way the id is what was actually observed.
    expect(ownerLabel(7, new Map())).toBe('ID 7')
  })
})
