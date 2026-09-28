import { describe, expect, it } from 'vitest'
import { formatKst, parseServerDate } from './datetime'

/* ------------------------------------------------------------------ *
 * Reading the timestamps the API sends.
 *
 * The `api_keys` columns and most of the auth server's schema are
 * `TIMESTAMP WITHOUT TIME ZONE`, so the values arrive as UTC instants written
 * without any zone suffix. The platform reads such a string as local time, and
 * on a KST machine that shifts every reading by nine hours in the wrong
 * direction. These cases fix the rule that a missing suffix means UTC.
 * ------------------------------------------------------------------ */

describe('parseServerDate', () => {
  it('reads a naive timestamp as UTC rather than as local time', () => {
    const parsed = parseServerDate('2026-09-28T01:00:00')

    expect(parsed?.toISOString()).toBe('2026-09-28T01:00:00.000Z')
  })

  it('reads a naive timestamp with fractional seconds as UTC too', () => {
    const parsed = parseServerDate('2026-09-28T06:46:52.847361')

    expect(parsed?.getTime()).toBe(Date.parse('2026-09-28T06:46:52.847Z'))
  })

  it('keeps an explicit zone suffix instead of appending a second one', () => {
    expect(parseServerDate('2026-09-28T01:00:00Z')?.toISOString()).toBe(
      '2026-09-28T01:00:00.000Z'
    )
    expect(parseServerDate('2026-09-28T10:00:00+09:00')?.toISOString()).toBe(
      '2026-09-28T01:00:00.000Z'
    )
  })

  it('returns null for an absent or unparsable value instead of an invalid date', () => {
    expect(parseServerDate(null)).toBeNull()
    expect(parseServerDate(undefined)).toBeNull()
    expect(parseServerDate('')).toBeNull()
    expect(parseServerDate('어제')).toBeNull()
  })
})

describe('formatKst', () => {
  it('renders a naive UTC timestamp in KST with the zone spelled out', () => {
    // 01:00 UTC is 10:00 KST on the same day. A reading that came out as
    // 01:00 would mean the suffix was never added.
    expect(formatKst('2026-09-28T01:00:00')).toBe('2026. 09. 28. 10:00:00 KST')
  })

  it('falls back rather than printing an invalid date', () => {
    expect(formatKst(null, '만료 없음')).toBe('만료 없음')
  })
})
