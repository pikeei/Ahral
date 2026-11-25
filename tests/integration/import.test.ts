import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import wordListPath from 'word-list'
import { analyzeDocument } from '../../src/core/analysis/analyze'
import { assembleExam } from '../../src/core/exam/assemble'
import { extractDocument } from '../../src/core/extract'
import { generateQuestions } from '../../src/core/generation/generate'
import type { Question } from '../../src/core/generation/types'
import { PIPELINE_VERSION } from '../../src/core/version'
import { getDocument, listDocuments, loadQuestions, loadSections } from '../../src/main/db/documents'
import { loadExam, saveExam } from '../../src/main/db/exams'
import { memoryDb } from '../../src/main/db/test-helpers'
import { type ImportOptions, importPdf } from '../../src/main/import'
import { buildGoldenPdf } from '../fixtures/golden-pdf'

/*
 * Import end to end: the golden PDF goes through the real pipeline into SQLite,
 * and comes back out identical to what the pipeline produced in memory.
 */

const dictionary = new Set(readFileSync(wordListPath, 'utf8').split(/\r?\n/))
const options: ImportOptions = {
  standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts')}/`,
  isWord: (w) => dictionary.has(w)
}

let pdf: Uint8Array
let expected: Question[]
let db: DatabaseSync

beforeAll(async () => {
  pdf = await buildGoldenPdf()
  const doc = await extractDocument(pdf.slice(), options)
  expected = generateQuestions(doc, analyzeDocument(doc), { isWord: options.isWord }).questions
})
beforeEach(() => {
  db = memoryDb()
})
afterEach(() => db.close())

const source = () => ({ data: pdf, fileName: 'golden.pdf', sourcePath: 'D:/study/golden.pdf' })

describe('importPdf', () => {
  it('stores what the pipeline produces', async () => {
    const result = await importPdf(db, source(), options)
    expect(result).toMatchObject({ status: 'imported', questionCount: expected.length })
    expect(result.warnings.some((w) => /missing letters/.test(w))).toBe(true)
    expect(expected.length).toBeGreaterThan(0)
    expect(loadQuestions(db, result.documentId)).toEqual(expected)
    expect(loadSections(db, result.documentId).length).toBeGreaterThan(0)
    expect(getDocument(db, result.documentId)).toMatchObject({
      fileName: 'golden.pdf',
      pipelineVersion: PIPELINE_VERSION,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
    })
  })

  it('leaves the caller\u2019s bytes usable', async () => {
    const before = pdf.byteLength
    await importPdf(db, source(), options)
    expect(pdf.byteLength).toBe(before)
  })

  it('reuses the stored copy when the same file is imported again, even renamed', async () => {
    const first = await importPdf(db, source(), options)
    const second = await importPdf(db, { data: pdf, fileName: 'renamed.pdf' }, options)
    expect(second).toEqual({ ...first, status: 'unchanged' })
    expect(listDocuments(db)).toHaveLength(1)
  })

  it('regenerates documents made by an older pipeline, keeping their exams', async () => {
    const { documentId } = await importPdf(db, source(), options)
    const exam = saveExam(db, documentId, assembleExam(loadQuestions(db, documentId), { questionCount: 3 }, 1))
    db.prepare('UPDATE documents SET pipeline_version = 0').run()

    const result = await importPdf(db, source(), options)
    expect(result).toMatchObject({ documentId, status: 'regenerated', questionCount: expected.length })
    expect(getDocument(db, documentId)?.pipelineVersion).toBe(PIPELINE_VERSION)
    expect(loadExam(db, exam.id)).toEqual(exam)
  })

  it('regenerates on request', async () => {
    await importPdf(db, source(), options)
    expect((await importPdf(db, source(), { ...options, force: true })).status).toBe('regenerated')
  })
})
