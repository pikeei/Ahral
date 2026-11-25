// Contract between the main process and the renderer.
// Both sides import from here, so a renamed channel or changed payload
// becomes a compile error instead of a silent runtime failure.

export const IpcChannels = {
  getAppInfo: 'app:get-info'
} as const

export interface AppInfo {
  appVersion: string
  electron: string
  node: string
  chrome: string
  sqlite: string
}

/** The API the preload script exposes to the UI as `window.api`. */
export interface AhralApi {
  getAppInfo(): Promise<AppInfo>
}
