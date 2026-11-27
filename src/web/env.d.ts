import type { AhralApi } from '../shared/api'

declare global {
  interface Window {
    api: AhralApi
  }
  /** package.json's version, filled in at build time. */
  const __APP_VERSION__: string
}
