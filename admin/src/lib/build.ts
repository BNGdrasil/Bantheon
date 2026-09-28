/* ------------------------------------------------------------------ *
 * Build provenance rendering rules.
 *
 * Three different sources report the same five fields: the gateway reports
 * its own build in the overview `app` block, a probed upstream reports its
 * build in `upstream_build`, and the console reports its own build through
 * the `release.json` the release pipeline writes next to the bundle.
 *
 * Every one of those fields can be missing. An image built without the build
 * arguments injects nothing, an upstream may publish only some of the keys,
 * and a bundle built outside the pipeline has no marker file at all. A
 * missing value is rendered as "미기록" rather than as an empty string or as
 * a zero timestamp, because an operator has to be able to tell "nobody
 * recorded this" apart from "this was recorded as empty".
 * ------------------------------------------------------------------ */
import { formatDuration, parseServerDate } from './datetime'

/** Shown wherever the source recorded no value at all. */
export const NOT_RECORDED_LABEL = '미기록'

/** Characters of a commit SHA shown on screen; the full value stays in the title. */
export const SHORT_SHA_LENGTH = 12

/**
 * The five fields bifrost/src/core/buildinfo.py produces. Every one is
 * optional twice over: a gateway that predates the block omits the key, and a
 * build that injected nothing sends null.
 */
export interface BuildFacts {
  version?: string | null
  build_sha?: string | null
  build_time?: string | null
  build_ref?: string | null
  started_at?: string | null
}

/**
 * The value of one build field, or null when there is nothing to show.
 *
 * A blank string is treated as absent: it carries no more information than a
 * missing key, and rendering it would leave a silent gap on screen.
 */
export function buildValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The leading part of a commit SHA, for a line that cannot hold forty
 * characters. A value shorter than the cut is returned unchanged rather than
 * padded, so a tag or an abbreviated SHA still reads correctly.
 */
export function shortSha(value: string | null | undefined): string | null {
  const sha = buildValue(value)
  if (sha === null) {
    return null
  }
  return sha.length <= SHORT_SHA_LENGTH ? sha : sha.slice(0, SHORT_SHA_LENGTH)
}

/**
 * True when at least one field carries a value.
 *
 * The gateway sends `upstream_build` as an object whose every field may be
 * null. Such an object means the probe observed nothing usable, so it is
 * reported the same way as a missing object instead of as five blank rows.
 */
export function hasAnyBuildFact(build: BuildFacts | null | undefined): boolean {
  if (!build) {
    return false
  }
  return (
    buildValue(build.version) !== null ||
    buildValue(build.build_sha) !== null ||
    buildValue(build.build_time) !== null ||
    buildValue(build.build_ref) !== null ||
    buildValue(build.started_at) !== null
  )
}

/**
 * How long the process has been running, such as "3시간".
 *
 * Returns null when the start time was never recorded or cannot be parsed,
 * because an elapsed span invented from a missing instant would read as a
 * measurement. A start that sits slightly ahead of the browser clock is
 * reported as "0초" rather than as a negative span: the two clocks differing
 * by a few seconds is ordinary, and it says nothing about the process.
 */
export function uptimeLabel(
  startedAt: string | null | undefined,
  nowMs: number
): string | null {
  const started = parseServerDate(buildValue(startedAt))
  if (!started) {
    return null
  }
  return formatDuration(nowMs - started.getTime())
}

/**
 * The console's own release marker, read from `release.json`.
 *
 * The release pipeline writes this file into the bundle directory. Every
 * field is nullable so that a file written by an older pipeline, or by hand,
 * still renders the parts it does carry.
 */
export interface ConsoleRelease {
  sha: string | null
  ref: string | null
  built_at: string | null
}

/**
 * Reads a `release.json` body.
 *
 * Returns null unless the payload is an object carrying at least one usable
 * field. A local build has no such file, and the dev server answers an
 * unknown path with the HTML shell, so anything that is not recognisably the
 * marker has to be reported as "not recorded" rather than as a release.
 */
export function parseConsoleRelease(payload: unknown): ConsoleRelease | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }
  const source = payload as Record<string, unknown>
  const release: ConsoleRelease = {
    sha: buildValue(typeof source.sha === 'string' ? source.sha : null),
    ref: buildValue(typeof source.ref === 'string' ? source.ref : null),
    built_at: buildValue(typeof source.built_at === 'string' ? source.built_at : null),
  }
  if (release.sha === null && release.ref === null && release.built_at === null) {
    return null
  }
  return release
}
