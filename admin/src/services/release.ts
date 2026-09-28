/* ------------------------------------------------------------------ *
 * The console's own release marker.
 *
 * The release pipeline writes `release.json` into the bundle directory, so it
 * is served from the same origin as the console and needs neither a token nor
 * one of the axios clients. It is fetched with the platform `fetch` for that
 * reason: the admin interceptors would attach a credential and would read a
 * missing file as a session problem.
 *
 * Every failure is reported as "no marker" rather than as an error, because
 * there is nothing an operator can retry here. A local build and the smoke
 * test have no such file at all, and the dev server answers an unknown path
 * with the HTML shell instead of a 404, so the answer is checked rather than
 * trusted.
 * ------------------------------------------------------------------ */
import { ConsoleRelease, parseConsoleRelease } from '../lib/build'

export const CONSOLE_RELEASE_PATH = '/release.json'

export async function fetchConsoleRelease(): Promise<ConsoleRelease | null> {
  let response: Response
  try {
    response = await fetch(CONSOLE_RELEASE_PATH, {
      // The file has no content hash, so a cached copy would keep reporting
      // the previous release after a deployment.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch {
    return null
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
