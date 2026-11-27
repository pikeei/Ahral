import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import wordListPath from 'word-list'
import { runPipeline } from '../../src/app/pipeline'
import { buildGoldenPdf } from '../fixtures/golden-pdf'

import { launchApp } from './launch-app'

// The whole study loop in the real app: import a PDF, take an exam, get feedback,
// see results and history. The native file picker is replaced with one that returns
// the test PDF, since a test can't click through an OS dialog.

let app: ElectronApplication
let page: Page
let workDir: string
let pdfPath: string

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'ahral-e2e-flow-'))
  pdfPath = join(workDir, 'golden notes.pdf')
  writeFileSync(pdfPath, await buildGoldenPdf())

  app = await launchApp(join(workDir, 'user-data'))
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(workDir, { recursive: true, force: true, maxRetries: 5 })
})

/** Makes the next file picker return `path` (or be cancelled). */
async function pickFile(path: string | null): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: picked === null, filePaths: picked === null ? [] : [picked] })) as never
  }, path)
}

test.describe.configure({ mode: 'serial' })

test('starts with an empty library', async () => {
  await expect(page.getByText('No documents yet')).toBeVisible()
})

test('cancelling the file picker changes nothing', async () => {
  await pickFile(null)
  await page.getByRole('button', { name: 'Import PDF' }).click()
  await expect(page.getByText('No documents yet')).toBeVisible()
})

test('imports a PDF and opens it', async () => {
  await pickFile(pdfPath)
  await page.getByRole('button', { name: 'Import PDF' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'golden notes.pdf' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/notes? about this PDF/)).toBeVisible()

  // The app must produce exactly what the pipeline produces when run here. A missing
  // dictionary, font folder or PDF.js file in the build would change the result.
  const dictionary = new Set(readFileSync(wordListPath, 'utf8').split(/\r?\n/))
  const expected = await runPipeline(new Uint8Array(readFileSync(pdfPath)), {
    standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts').replace(/\\/g, '/')}/`,
    isWord: (w) => dictionary.has(w)
  })
  await expect(page.getByText(`${expected.pageCount} pages · ${expected.questions.length} questions`)).toBeVisible()
})

test('takes an exam with feedback after each answer', async () => {
  // With no question type ticked nothing matches, so the exam can't start empty.
  const typeBoxes = page.getByRole('group', { name: 'Question types' }).getByRole('checkbox')
  for (const box of await typeBoxes.all()) await box.uncheck()
  await expect(page.getByTestId('matching-count')).toHaveText(/^No questions match/)
  await expect(page.getByRole('button', { name: 'Start exam' })).toBeDisabled()
  for (const box of await typeBoxes.all()) await box.check()
  await expect(page.getByTestId('matching-count')).toHaveText(/^\d+ questions match/)

  await page.getByLabel('Number of questions').fill('3')
  await page.getByRole('button', { name: 'Start exam' }).click()
  await expect(page.getByTestId('exam-progress')).toHaveText('Question 1 of 3')

  for (let n = 1; n <= 3; n++) {
    const options = page.getByRole('radio')
    if ((await options.count()) > 0) {
      // Keyboard: B chooses the second option, A the first, Enter checks.
      await page.keyboard.press('b')
      await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true')
      await page.keyboard.press('a')
      await expect(options.first()).toHaveAttribute('aria-checked', 'true')
      await page.keyboard.press('Enter')
    } else {
      await page.getByLabel('Your answer').fill('radiation')
      await page.getByRole('button', { name: 'Check answer' }).click()
    }

    const feedback = page.getByTestId('feedback')
    await expect(feedback).toBeVisible()
    // Every explanation cites the page it comes from.
    await expect(feedback).toContainText(/\(p\. \d+\)/)
    if ((await options.count()) > 0) {
      // The picked option (A) is labelled right or wrong, and exactly one option is the right one.
      await expect(options.first()).toContainText(/[✓✗] Your answer/)
      await expect(options.filter({ hasText: /✓/ })).toHaveCount(1)
      if ((await feedback.textContent())?.startsWith('Not quite')) {
        await expect(options.first()).toContainText('✗ Your answer')
        await expect(options.filter({ hasText: '✓ Correct answer' })).toHaveCount(1)
      }
    }
    await page.getByRole('button', { name: n < 3 ? 'Next question' : 'See results' }).click()
  }

  await expect(page.getByTestId('score')).toHaveText(/^\d+%$/)
  await expect(page.getByRole('heading', { name: 'Review your answers' })).toBeVisible()
  await expect(page.locator('ol > li')).toHaveCount(3)
})

test('keeps the attempt in the document history', async () => {
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('list', { name: 'Past attempts' }).getByRole('listitem')).toHaveCount(1)
})

test('recognises a PDF that is already imported', async () => {
  await page.getByRole('button', { name: 'All documents' }).click()
  await pickFile(pdfPath)
  await page.getByRole('button', { name: 'Import PDF' }).click()
  await expect(page.getByText('golden notes.pdf is already in your library.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Documents' }).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText(/last of 1 attempt/)).toBeVisible()
})

test('deletes a document after confirmation', async () => {
  await page.getByRole('button', { name: /golden notes\.pdf/ }).click()
  await page.getByRole('button', { name: 'Delete document…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('No documents yet')).toBeVisible()
})
