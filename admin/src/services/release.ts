/* ------------------------------------------------------------------ *
 * The console's own release marker.
 *
 * The release pipeline writes `release.json` into the bundle directory, so it
 * is served from the same origin as the console and needs neither a token nor
 * one of the axios clients. It is fetched with the platform `fetch` for that
 * reason: the admin interceptors would attach a credential and would read a
 * missing file as a session problem.
 *
 * Two different outcomes are kept apart here, because the caller caches them
 * on different terms. A marker that is definitely not there is an answer: a
 * local build and the smoke test have no such file at all, the dev server
 * answers an unknown path with the HTML shell instead of a 404, and a file
 * that is present but unreadable is no marker either. All of these resolve
 * with null, and the caller may hold that answer for the whole session.
 *
 * A request that could not be carried out is not an answer. A network failure
 * or a 5xx from the origin says nothing about whether the marker exists, so it
 * is thrown: the caller retries it instead of writing "not recorded" on the
 * screen for the rest of the session.
 * ------------------------------------------------------------------ */
import { ConsoleRelease, parseConsoleRelease } from '../lib/build'

export const CONSOLE_RELEASE_PATH = '/release.json'

/** A request that failed on the way, as opposed to a marker that is absent. */
export class ConsoleReleaseUnreachable extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ConsoleReleaseUnreachable'
    this.status = status
  }
}

export async function fetchConsoleRelease(): Promise<ConsoleRelease | null> {
  let response: Response
  try {
    response = await fetch(CONSOLE_RELEASE_PATH, {
      // The file has no content hash, so a cached copy would keep reporting
      // the previous release after a deployment.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    throw new ConsoleReleaseUnreachable(
      `release.json 요청이 완료되지 않았습니다: ${(error as Error)?.message ?? '알 수 없는 오류'}`,
      null
    )
  }

  if (response.status >= 500) {
    // The origin answered, and what it answered is that it could not serve the
    // file right now. Reading that as "this build has no marker" would fix a
    // transient failure on the screen until the page is reloaded.
    throw new ConsoleReleaseUnreachable(
      `release.json 요청이 ${response.status} 응답을 받았습니다.`,
      response.status
    )
  }

  if (!response.ok) {
    return null
  }

  const mediaType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
    return null
  }

  try {
    return parseConsoleRelease(await response.json())
  } catch {
    return null
  }
}
