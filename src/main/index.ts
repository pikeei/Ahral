import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { app, BrowserWindow } from 'electron'
import { openDatabase } from './db/connection'
import { migrate } from './db/migrations'
import { registerIpcHandlers } from './ipc'

// Lets E2E tests run against a throwaway data folder instead of your real one.
// Must be set before the app is ready.
if (process.env.AHRAL_USER_DATA) {
  app.setPath('userData', process.env.AHRAL_USER_DATA)
}

let db: DatabaseSync | undefined

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Ahral',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security baseline: the UI cannot touch Node or Electron directly;
      // it only sees the small API the preload script exposes.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // This is an offline app: never open popups or navigate to other pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  // electron-vite sets this in dev mode so the UI gets hot reload.
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  db = openDatabase(join(app.getPath('userData'), 'ahral.db'))
  migrate(db)
  registerIpcHandlers(db)
  createWindow()
})

app.on('window-all-closed', () => {
  db?.close()
  app.quit()
})
