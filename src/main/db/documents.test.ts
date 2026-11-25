import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteDocument,
  findDocumentBySha,
  getDocument,
  insertDocument,
  listDocuments,
  loadGlossary,
  loadQuestions,
  loadSections,
  replaceDocumentContent
} from './documents'
import { saveExam } from './exams'
import { content, insertSample, memoryDb, meta } from './test-helpers'

let db: DatabaseSync

beforeEach(() => {
  db = memoryDb()
})
afterEach(() => db.close())

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

describe('insertDocument', () => {
  it('stores the document and reports it back', () => {
    const id = insertSample(db)
    expect(getDocument(db, id)).toMatchObject({
      id,
      sha256: 'a'.repeat(64),
      fileName: 'notes.pdf',
      sourcePath: 'D:/study/notes.pdf',
      pageCount: 12,
      pipelineVersion: 1,
      warnings: ['Some pages have no text.'],
      questionCount: 3
    })
  })

  it('round-trips sections, glossary and questions unchanged', () => {
    const id = insertSample(db)
    const original = content()
    expect(loadSections(db, id)).toEqual(original.sections)
    expect(loadGlossary(db, id)).toEqual(original.glossary)
    // Includes options with and without a source, and questions without options.
    expect(loadQuestions(db, id)).toEqual(original.questions)
  })

  it('keeps one copy per file content', () => {
    insertSample(db)
    expect(() => insertSample(db)).toThrow(/UNIQUE constraint failed: documents.sha256/)
    expect(listDocuments(db)).toHaveLength(1)
  })

  it('writes nothing when part of the content is invalid', () => {
    const section = content().sections[0]!
    expect(() => insertDocument(db, meta(), content({ sections: [section, section] }))).toThrow(/UNIQUE/)
    expect(listDocuments(db)).toEqual([])
    expect(count('questions')).toBe(0)
  })
})

describe('finding documents', () => {
  it('finds by file hash', () => {
    const id = insertSample(db, 'b'.repeat(64))
    expect(findDocumentBySha(db, 'b'.repeat(64))?.id).toBe(id)
    expect(findDocumentBySha(db, 'c'.repeat(64))).toBeUndefined()
    expect(getDocument(db, 999)).toBeUndefined()
  })

  it('lists the most recent import first', () => {
    const first = insertSample(db, '1'.repeat(64))
    const second = insertSample(db, '2'.repeat(64))
    expect(listDocuments(db).map((d) => d.id)).toEqual([second, first])
  })
})

describe('replaceDocumentContent', () => {
  it('swaps in the new content and keeps exams', () => {
    const id = insertSample(db)
    saveExam(db, id, { seed: 1, config: { questionCount: 1 }, items: [], warnings: [] })
    replaceDocumentContent(db, id, 2, content({ pageCount: 13, warnings: [], glossary: [], questions: [] }))

    expect(getDocument(db, id)).toMatchObject({ pipelineVersion: 2, pageCount: 13, warnings: [], questionCount: 0 })
    expect(loadGlossary(db, id)).toEqual([])
    expect(loadSections(db, id)).toHaveLength(3)
    expect(count('exams')).toBe(1)
  })

  it('fails for an unknown document', () => {
    expect(() => replaceDocumentContent(db, 42, 1, content())).toThrow('No document with id 42')
  })
})

describe('deleteDocument', () => {
  it('removes the document and everything that belongs to it', () => {
    const id = insertSample(db)
    const keep = insertSample(db, 'f'.repeat(64))
    saveExam(db, id, { seed: 1, config: { questionCount: 1 }, items: [], warnings: [] })

    expect(deleteDocument(db, id)).toBe(true)
    expect(deleteDocument(db, id)).toBe(false)
    for (const table of ['sections', 'glossary', 'questions']) {
      const rows = db.prepare(`SELECT DISTINCT document_id AS id FROM ${table}`).all()
      expect(rows.map((r) => r.id)).toEqual([keep])
    }
    expect(count('exams')).toBe(0)
  })
})
