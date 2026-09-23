import { describe, expect, it } from 'vitest'
import { extractDetail, extractValidationDetail } from './api'

/* ------------------------------------------------------------------ *
 * Error body parsing.
 *
 * These two functions decide what an operator reads when a write is refused.
 * Dropping a FastAPI 422 body leaves axios' own "Request failed with status
 * code 422" on screen, which names neither the field nor the rule, so the
 * shapes the gateway and the auth server actually send are pinned here.
 *
 * These cases stay free of any transport: they call the parsers directly.
 * The same shapes travelling over a real HTTP round trip are covered in
 * `api.http.test.ts`.
 * ------------------------------------------------------------------ */

describe('extractValidationDetail', () => {
  it('names the field of a single item', () => {
    expect(
      extractValidationDetail([{ loc: ['body', 'url'], msg: 'Value error, scheme must be http or https' }])
    ).toBe('url: scheme must be http or https')
  })

  it('joins two items with a semicolon', () => {
    expect(
      extractValidationDetail([
        { loc: ['body', 'url'], msg: 'Value error, loopback is not allowed' },
        { loc: ['body', 'timeout_seconds'], msg: 'Input should be less than or equal to 300' },
      ])
    ).toBe('url: loopback is not allowed; timeout_seconds: Input should be less than or equal to 300')
  })

  it('falls back to the bare message when loc holds only the body marker', () => {
    expect(extractValidationDetail([{ loc: ['body'], msg: 'Field required' }])).toBe('Field required')
  })

  it('reads the last usable name out of a nested loc', () => {
    expect(
      extractValidationDetail([
        { loc: ['body', 'service_metadata', 'owner'], msg: 'Input should be a valid string' },
      ])
    ).toBe('owner: Input should be a valid string')
  })

  it('skips an index so a bare "0" never appears as a field name', () => {
    expect(extractValidationDetail([{ loc: ['body', 'cors_origins', 0], msg: 'Input should be a valid URL' }])).toBe(
      'cors_origins: Input should be a valid URL'
    )
  })

  it('skips items that carry no usable message', () => {
    expect(
      extractValidationDetail([
        null,
        'not an object',
        { loc: ['body', 'url'] },
        { loc: ['body', 'url'], msg: 42 },
        { loc: ['body', 'url'], msg: '   ' },
        { loc: ['body', 'url'], msg: 'Value error, still readable' },
      ])
    ).toBe('url: still readable')
  })

  it('returns null for an empty list so the caller keeps its own text', () => {
    expect(extractValidationDetail([])).toBeNull()
  })

  it('returns null when every item was skipped', () => {
    expect(extractValidationDetail([{ loc: ['body'] }, { msg: '' }])).toBeNull()
  })
})

describe('extractDetail', () => {
  it('reads a string detail', () => {
    expect(extractDetail({ detail: 'Service registry reload failed' })).toBe(
      'Service registry reload failed'
    )
  })

  it('reads a validation list through extractValidationDetail', () => {
    expect(extractDetail({ detail: [{ loc: ['body', 'url'], msg: 'Value error, blocked path' }] })).toBe(
      'url: blocked path'
    )
  })

  it('falls back to message when the validation list yields nothing', () => {
    expect(extractDetail({ detail: [{ loc: ['body'] }], message: 'Bad Request' })).toBe('Bad Request')
  })

  it('reads message when there is no detail at all', () => {
    expect(extractDetail({ message: 'Upstream timed out' })).toBe('Upstream timed out')
  })

  it('accepts a plain string body', () => {
    expect(extractDetail('502 Bad Gateway')).toBe('502 Bad Gateway')
  })

  it('ignores a blank string body', () => {
    expect(extractDetail('   ')).toBeNull()
  })

  it('returns null when there is nothing to read', () => {
    expect(extractDetail(undefined)).toBeNull()
    expect(extractDetail(null)).toBeNull()
    expect(extractDetail({})).toBeNull()
    expect(extractDetail({ detail: [] })).toBeNull()
  })
})
