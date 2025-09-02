/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_API_URL: string
  readonly VITE_GATEWAY_API_URL: string
  readonly VITE_APP_ENV: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_API_TIMEOUT: string
  readonly VITE_API_RETRY_COUNT: string
  readonly VITE_ENABLE_ADMIN: string
  readonly VITE_ENABLE_GAMES: string
  readonly VITE_ENABLE_PORTFOLIO: string
  readonly VITE_LOG_LEVEL: string
  readonly VITE_GITHUB_URL: string
  readonly VITE_CONTACT_EMAIL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
