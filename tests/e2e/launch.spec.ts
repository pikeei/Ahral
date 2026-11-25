import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { SCHEMA_VERSION } from '../../src/main/db/migrations'

import { launchApp } from './launch-app'

// Smoke tests against the real built app (out/), launched as a desktop process.
// Each run gets a fresh, empty data folder so tests never touch your real exams.

let app: ElectronApplication
let page: Page
let userDataDir: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'ahral-e2e-'))
  app = await launchApp(userDataDir)
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

test('migrates the database to the current schema at start-up', async () => {
  await expect(page.getByTestId('sqlite-version')).toBeVisible()
  const db = new DatabaseSync(join(userDataDir, 'ahral.db'), { readOnly: true })
  try {
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(user_version).toBe(SCHEMA_VERSION)
  } finally {
    db.close()
  }
})

test('UI has no direct access to Node.js', async () => {
  const nodeGlobals = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process
  }))
  expect(nodeGlobals).toEqual({ require: 'undefined', process: 'undefined' })
})
