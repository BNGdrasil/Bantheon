import { describe, expect, it } from 'vitest'
import {
  NOT_RECORDED_LABEL,
  buildValue,
  hasAnyBuildFact,
  parseConsoleRelease,
  shortSha,
  uptimeLabel,
} from './build'

/* ------------------------------------------------------------------ *
 * Build provenance rules.
 *
 * Three sources report the same five fields and every one of them may be
 * missing. The cases pinned here are the ones where a wrong answer would put
 * a claim on screen that nobody measured: a blank value rendered as if it
 * were recorded, an all-null object rendered as five empty rows, or the HTML
 * shell of a dev server read as a release marker.
 * ------------------------------------------------------------------ */

describe('buildValue', () => {
  it('keeps a recorded value', () => {
    expect(buildValue('0.2.0')).toBe('0.2.0')
  })

  it('trims surrounding whitespace', () => {
    expect(buildValue('  main\n')).toBe('main')
  })

  it('treats null, undefined and a blank string as not recorded', () => {
    expect(buildValue(null)).toBeNull()
    expect(buildValue(undefined)).toBeNull()
    expect(buildValue('')).toBeNull()
    expect(buildValue('   ')).toBeNull()
  })
})

describe('shortSha', () => {
  it('cuts a full commit SHA to twelve characters', () => {
    expect(shortSha('deadbeefcafe0123456789abcdef0123456789ab')).toBe('deadbeefcafe')
  })

  it('returns a shorter value unchanged rather than padding it', () => {
    expect(shortSha('v0.1.0')).toBe('v0.1.0')
    expect(shortSha('abcdef123456')).toBe('abcdef123456')
  })

  it('reports a missing SHA as null so the caller can print the label', () => {
    expect(shortSha(null)).toBeNull()
    expect(shortSha(undefined)).toBeNull()
    expect(shortSha('  ')).toBeNull()
  })
})

describe('hasAnyBuildFact', () => {
  it('is true when a single field carries a value', () => {
    expect(hasAnyBuildFact({ version: '0.2.0' })).toBe(true)
    expect(hasAnyBuildFact({ build_sha: 'abcdef0123456789' })).toBe(true)
    expect(hasAnyBuildFact({ started_at: '2026-09-28T00:15:00Z' })).toBe(true)
  })

  it('is false for the all-null object the gateway sends after a reload', () => {
    // The five nulls mean the probe observed nothing. Rendering that object as
    // a build would put five empty rows where an explanation belongs.
    expect(
      hasAnyBuildFact({
        version: null,
        build_sha: null,
        build_time: null,
        build_ref: null,
        started_at: null,
      })
    ).toBe(false)
  })

  it('is false when there is no object at all', () => {
    expect(hasAnyBuildFact(null)).toBe(false)
    expect(hasAnyBuildFact(undefined)).toBe(false)
    expect(hasAnyBuildFact({})).toBe(false)
  })
})

describe('uptimeLabel', () => {
  const now = Date.parse('2026-09-28T09:00:00Z')

  it('reports the span since the process started', () => {
    expect(uptimeLabel('2026-09-28T06:00:00Z', now)).toBe('3시간')
    expect(uptimeLabel('2026-09-28T08:58:00Z', now)).toBe('2분')
    expect(uptimeLabel('2026-09-25T09:00:00Z', now)).toBe('3일')
  })

  it('reads a timestamp without a zone as UTC, as the API documents it', () => {
    expect(uptimeLabel('2026-09-28T06:00:00', now)).toBe('3시간')
  })

  it('reports a start slightly ahead of the browser clock as no elapsed time', () => {
    // Two clocks differing by a few seconds says nothing about the process, so
    // the span is clamped rather than shown as a negative duration.
    expect(uptimeLabel('2026-09-28T09:00:05Z', now)).toBe('0초')
  })

  it('returns null when the start time was never recorded or cannot be read', () => {
    expect(uptimeLabel(null, now)).toBeNull()
    expect(uptimeLabel(undefined, now)).toBeNull()
    expect(uptimeLabel('   ', now)).toBeNull()
    expect(uptimeLabel('not a timestamp', now)).toBeNull()
  })
})

describe('parseConsoleRelease', () => {
  it('reads the marker the release pipeline writes', () => {
    expect(
      parseConsoleRelease({
        sha: 'abcdef0123456789abcdef0123456789abcdef01',
        ref: 'main',
        built_at: '2026-09-28T02:03:04Z',
      })
    ).toEqual({
      sha: 'abcdef0123456789abcdef0123456789abcdef01',
      ref: 'main',
      built_at: '2026-09-28T02:03:04Z',
    })
  })

  it('keeps the fields it recognises and nulls the rest', () => {
    expect(parseConsoleRelease({ sha: 'abcdef0123456789', extra: 'ignored' })).toEqual({
      sha: 'abcdef0123456789',
      ref: null,
      built_at: null,
    })
  })

  it('refuses a non-string field rather than rendering it as text', () => {
    expect(parseConsoleRelease({ sha: 42, ref: ['main'], built_at: '2026-09-28T02:03:04Z' })).toEqual({
      sha: null,
      ref: null,
      built_at: '2026-09-28T02:03:04Z',
    })
  })

  it('returns null for a payload that carries no field at all', () => {
    // The dev server answers an unknown path with the HTML shell, and a JSON
    // body that holds none of the three keys is no more a release marker than
    // that shell is. Both have to read as "not recorded".
    expect(parseConsoleRelease({})).toBeNull()
    expect(parseConsoleRelease({ sha: '', ref: '   ', built_at: null })).toBeNull()
    expect(parseConsoleRelease(null)).toBeNull()
    expect(parseConsoleRelease(undefined)).toBeNull()
    expect(parseConsoleRelease('<!doctype html>')).toBeNull()
    expect(parseConsoleRelease([{ sha: 'abcdef0123456789' }])).toBeNull()
  })
})

describe('NOT_RECORDED_LABEL', () => {
  it('is the one label every missing build field uses', () => {
    expect(NOT_RECORDED_LABEL).toBe('미기록')
  })
})
