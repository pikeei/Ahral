import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, _electron as electron, expect, type Page, test } from '@playwright/test'

// Smoke tests against the real built app (out/), launched as a desktop process.
// Each run gets a fresh, empty data folder so tests never touch your real exams.

let app: ElectronApplication
let page: Page
let userDataDir: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'ahral-e2e-'))
  // Drop ELECTRON_RUN_AS_NODE if it leaked in from the shell: it would start Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
  app = await electron.launch({
    args: ['.'],
    env: { ...(env as Record<string, string>), AHRAL_USER_DATA: userDataDir }
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5 })
})

test('opens the main window', async () => {
  await expect(page).toHaveTitle('Ahral')
  await expect(page.getByRole('heading', { level: 1, name: 'Ahral' })).toBeVisible()
})

test('UI reaches SQLite in the main process through the preload bridge', async () => {
  await expect(page.getByTestId('sqlite-version')).toHaveText(/^\d+\.\d+\.\d+$/)
  expect(existsSync(join(userDataDir, 'ahral.db'))).toBe(true)
})

test('UI has no direct access to Node.js', async () => {
  const nodeGlobals = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process
  }))
  expect(nodeGlobals).toEqual({ require: 'undefined', process: 'undefined' })
})
