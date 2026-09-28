import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  apiKeyState,
  describeApiKeyState,
  describeExpiryInput,
  isUsableApiKey,
  localInputToUtcIso,
  ownerLabel,
  takePlaintext,
} from './apikeys'
import type { ApiKeyCreated } from '../services/api'

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

/* ------------------------------------------------------------------ *
 * Daylight saving boundaries.
 *
 * Two local readings a year are not a single instant: the one inside the
 * spring-forward gap does not happen at all, and the one inside the autumn
 * overlap happens twice. The conversion cannot ask which one was meant,
 * because the input carries no zone, so the behaviour is fixed here rather
 * than left to whichever zone a machine happens to run in. Each case pins the
 * documented rule: the offset in effect before the transition is applied.
 *
 * The zone is set through the `TZ` environment variable, which Node reads
 * again on the next `Date` operation, and `vi.unstubAllEnvs` puts it back so
 * the rest of the suite runs in the zone the process started with.
 * ------------------------------------------------------------------ */
describe('localInputToUtcIso across daylight saving transitions', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'America/New_York')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('runs in the zone the cases below assume', () => {
    // A machine that ignored the variable would make every case pass or fail
    // for a reason that has nothing to do with the conversion.
    expect(localInputToUtcIso('2026-01-15T00:00')).toBe('2026-01-15T05:00:00.000Z')
  })

  it('moves a reading inside the spring-forward gap past the gap', () => {
    // 02:30 on 2026-03-08 never occurs: the clock goes from 02:00 EST to
    // 03:00 EDT. The pre-transition offset (-05:00) applies, so the instant
    // is 07:30Z, which reads as 03:30 EDT on the local clock.
    expect(localInputToUtcIso('2026-03-08T02:30')).toBe('2026-03-08T07:30:00.000Z')
  })

  it('takes the first of the two readings inside the autumn overlap', () => {
    // 01:30 on 2026-11-01 occurs twice, once at -04:00 and once at -05:00.
    // The pre-transition offset (-04:00) applies, so the earlier of the two
    // instants is sent and the later one cannot be chosen from this input.
    expect(localInputToUtcIso('2026-11-01T01:30')).toBe('2026-11-01T05:30:00.000Z')
    // The hour on either side of the overlap is unambiguous and shifts by the
    // offset that is actually in force then.
    expect(localInputToUtcIso('2026-11-01T00:30')).toBe('2026-11-01T04:30:00.000Z')
    expect(localInputToUtcIso('2026-11-01T02:30')).toBe('2026-11-01T07:30:00.000Z')
  })

  it('states the converted instant in both notations for the dialog', () => {
    // This line is what an operator in a summer time zone reads before the
    // request goes out, so the ambiguous case is visible rather than implied.
    expect(describeExpiryInput('2026-11-01T01:30')).toEqual({
      utcIso: '2026-11-01T05:30:00.000Z',
      kst: '2026. 11. 01. 14:30:00 KST',
    })
  })

  it('has nothing to state for a blank or unparsable input', () => {
    expect(describeExpiryInput('')).toBeNull()
    expect(describeExpiryInput(null)).toBeNull()
    expect(describeExpiryInput('내일 오전')).toBeNull()
  })
})

describe('takePlaintext', () => {
  const created: ApiKeyCreated = {
    id: 9,
    key_name: 'deploy-runner',
    user_id: 2,
    is_active: true,
    key_prefix: 'bng_Dep1',
    expires_at: null,
    created_at: '2026-09-28T00:00:00',
    last_used_at: null,
    key: 'bng_plaintext-value-that-must-not-be-cached',
  }

  it('hands the plaintext to the sink and returns the record without it', () => {
    let held: string | null = null
    const withheld = takePlaintext({ ...created }, (plaintext) => {
      held = plaintext
    })

    expect(held).toBe(created.key)
    expect('key' in withheld).toBe(false)
    expect(JSON.stringify(withheld)).not.toContain(created.key)
    // Every other field survives, so the panel can still name the record.
    expect(withheld).toEqual({
      id: 9,
      key_name: 'deploy-runner',
      user_id: 2,
      is_active: true,
      key_prefix: 'bng_Dep1',
      expires_at: null,
      created_at: '2026-09-28T00:00:00',
      last_used_at: null,
    })
  })

  it('leaves the response object it was given untouched', () => {
    // Deleting the property in place would empty an object the HTTP layer may
    // still hold, which would be a different behaviour from copying it.
    const response = { ...created }
    takePlaintext(response, () => undefined)
    expect(response.key).toBe(created.key)
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
