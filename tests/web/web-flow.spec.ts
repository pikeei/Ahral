import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import wordListPath from 'word-list'
import { runPipeline } from '../../src/app/pipeline'
import { buildGoldenPdf } from '../fixtures/golden-pdf'

// The website's whole study loop in a real browser: import through the file picker,
// take an exam, get feedback, keep the library across a reload, delete.
// Each test gets a fresh browser profile, so it starts with an empty library.

let pdf: Buffer
let expectedQuestions: number

test.beforeAll(async () => {
  pdf = Buffer.from(await buildGoldenPdf())
  // What the pipeline produces when run directly; the website must produce the same.
  const dictionary = new Set(readFileSync(wordListPath, 'utf8').split(/\r?\n/))
  const content = await runPipeline(new Uint8Array(pdf), {
    standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts').replace(/\\/g, '/')}/`,
    isWord: (w) => dictionary.has(w)
  })
  expectedQuestions = content.questions.length
})

async function importGoldenPdf(page: Page): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import PDF' }).click()
  await (await chooser).setFiles({ name: 'golden notes.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByRole('heading', { level: 2, name: 'golden notes.pdf' })).toBeVisible({ timeout: 60_000 })
}

test('imports a PDF in the browser exactly as the pipeline does', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('No documents yet')).toBeVisible()
  await expect(page.getByTestId('sqlite-version')).toHaveText(/^3\.\d+\.\d+$/)
  // The browser kept storage available: no "nothing is saved" warning.
  await expect(page.getByText(/can.t save in this tab/)).toHaveCount(0)

  await importGoldenPdf(page)
  // Same dictionary, fonts and PDF reader as the desktop app: same questions.
  await expect(page.getByText(`4 pages · ${expectedQuestions} questions`)).toBeVisible()
})

test('takes an exam with feedback, and keeps the library after a reload', async ({ page }) => {
  await page.goto('./')
  await importGoldenPdf(page)

  await page.getByLabel('Number of questions').fill('3')
  await page.getByRole('button', { name: 'Start exam' }).click()
  for (let n = 1; n <= 3; n++) {
    await expect(page.getByTestId('exam-progress')).toHaveText(`Question ${n} of 3`)
    const options = page.getByRole('radio')
    if ((await options.count()) > 0) {
      await options.first().click()
    } else {
      await page.getByLabel('Your answer').fill('radiation')
    }
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(page.getByTestId('feedback')).toContainText(/\(p\. \d+\)/)
    await page.getByRole('button', { name: n < 3 ? 'Next question' : 'See results' }).click()
  }
  await expect(page.getByTestId('score')).toHaveText(/^\d+%$/)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('list', { name: 'Past attempts' }).getByRole('listitem')).toHaveCount(1)

  // The database lives in the browser's storage for the site: still there after a reload.
  await page.reload()
  await expect(page.getByText(/last of 1 attempt/)).toBeVisible()

  await page.getByRole('button', { name: /golden notes\.pdf/ }).click()
  await page.getByRole('button', { name: 'Delete document…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('No documents yet')).toBeVisible()
})

test('says so in a second tab, which can’t use the saved library at the same time', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.getByTestId('sqlite-version')).toBeVisible()
  const second = await context.newPage()
  await second.goto('./')
  await expect(second.getByText(/can.t save in this tab/)).toBeVisible()
  // The second tab still works, without saving.
  await expect(second.getByText('No documents yet')).toBeVisible()
})

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.goto('./')
  await importGoldenPdf(page)
  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
  expect(overflow).toBeLessThanOrEqual(0)
})
