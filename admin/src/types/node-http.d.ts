/* ------------------------------------------------------------------ *
 * Minimal ambient declaration of `node:http`.
 *
 * The console is a browser bundle, so `@types/node` is deliberately not a
 * dependency and `tsconfig.json` limits `types` to `vite/client`. One test
 * file needs a real HTTP server to drive the axios clients against
 * (`src/services/api.http.test.ts`), and `tsc` runs over `src` during
 * `npm run build`, so the import has to type-check without pulling the whole
 * Node type surface into the app.
 *
 * Only the members that file uses are declared. If `@types/node` is ever
 * added as a devDependency, delete this file rather than keeping both: two
 * declarations of the same module would conflict.
 * ------------------------------------------------------------------ */
declare module 'node:http' {
  /** Incoming request. Declared as far as the test harness reads it. */
  export interface IncomingMessage {
    url?: string
    method?: string
    headers: Record<string, string | string[] | undefined>
    setEncoding(encoding: string): void
    on(event: 'data', listener: (chunk: string) => void): IncomingMessage
    on(event: 'end', listener: () => void): IncomingMessage
  }

  /** Outgoing response. The harness only sets a status, a type and a body. */
  export interface ServerResponse {
    writeHead(statusCode: number, headers: Record<string, string>): ServerResponse
    end(chunk?: string): void
  }

  /** Bound address of a listening server. */
  export interface AddressInfo {
    address: string
    family: string
    port: number
  }

  export interface Server {
    listen(port: number, hostname: string, callback: () => void): Server
    close(callback: (error?: Error) => void): Server
    address(): AddressInfo | string | null
  }

  export function createServer(
    requestListener: (request: IncomingMessage, response: ServerResponse) => void
  ): Server
}
