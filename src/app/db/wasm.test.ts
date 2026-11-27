import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assembleExam } from '../../core/exam/assemble'
import { scoreExam } from '../../core/exam/score'
import { ExamService } from '../exam-service'
import { deleteDocument, getDocument, insertDocument, loadGlossary, loadQuestions, loadSections } from './documents'
import { listAttempts, loadExam, saveAttempt, saveExam } from './exams'
import { migrate, SCHEMA_VERSION, schemaVersion } from './migrations'
import { getSqliteVersion, type SqlDatabase, transaction } from './sql'
import { content, meta } from './test-helpers'
import { wrapWasmDatabase } from './wasm'

/*
 * The website runs the same database code on SQLite compiled to WebAssembly. These tests
 * run that code on the WASM build (in memory, in Node) to prove the adapter behaves like
 * node:sqlite: same results, same constraint errors, same transactions.
 */

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>
let raw: Database
let db: SqlDatabase

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
})
beforeEach(() => {
  raw = new sqlite3.oo1.DB(':memory:')
  db = wrapWasmDatabase(raw)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
})
afterEach(() => raw.close())

describe('wrapWasmDatabase', () => {
  it('runs every migration and reports the SQLite version', () => {
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION)
    expect(getSqliteVersion(db)).toMatch(/^3\.\d+\.\d+$/)
  })

  it('round-trips a document exactly like node:sqlite', () => {
    const original = content()
    const id = insertDocument(db, meta(), original)
    expect(getDocument(db, id)).toMatchObject({ id, fileName: 'notes.pdf', questionCount: 3 })
    expect(loadSections(db, id)).toEqual(original.sections)
    expect(loadGlossary(db, id)).toEqual(original.glossary)
    expect(loadQuestions(db, id)).toEqual(original.questions)
  })

  it('reports changes and new row ids', () => {
    const first = insertDocument(db, meta('1'.repeat(64)), content())
    const second = insertDocument(db, meta('2'.repeat(64)), content())
    expect(second).toBe(first + 1)
    expect(deleteDocument(db, first)).toBe(true)
    expect(deleteDocument(db, first)).toBe(false)
  })

  it('enforces constraints and rolls back a failed transaction', () => {
    insertDocument(db, meta(), content())
    expect(() => insertDocument(db, meta(), content())).toThrow(/UNIQUE/)
    expect(() =>
      transaction(db, () => {
        db.prepare('DELETE FROM questions').run()
        throw new Error('stop')
      })
    ).toThrow('stop')
    expect(db.prepare('SELECT COUNT(*) AS n FROM questions').get()).toEqual({ n: 3 })
  })

  it('stores exams and attempts', () => {
    const documentId = insertDocument(db, meta(), content())
    const exam = saveExam(db, documentId, assembleExam(loadQuestions(db, documentId), { questionCount: 3 }, 5))
    expect(loadExam(db, exam.id)).toEqual(exam)
    const responses = new Map(exam.items.map((it) => [it.question.id, it.question.answer]))
    saveAttempt(db, exam, scoreExam(exam, responses), {
      acceptTypos: false,
      startedAt: new Date(),
      finishedAt: new Date(),
      sectionLabel: () => 'Section'
    })
    expect(listAttempts(db, documentId)).toEqual([expect.objectContaining({ correct: 3, total: 3 })])
  })

  it('runs a whole exam through the exam service', () => {
    const documentId = insertDocument(db, meta(), content())
    const service = new ExamService(db)
    const exam = service.startExam(documentId, { questionCount: 3, types: [], sectionIds: [], acceptTypos: false }, 1)
    for (const q of exam.questions) service.answer(exam.examId, q.position, { text: '' })
    expect(service.finish(exam.examId)).toMatchObject({ total: 3, answered: 0 })
    expect(service.listDocuments()[0]).toMatchObject({ attemptCount: 1, lastScore: 0 })
  })
})
