import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assembleExam } from '../../core/exam/assemble'
import { scoreExam } from '../../core/exam/score'
import type { NodeDatabase } from './connection'
import { deleteDocument, loadQuestions } from './documents'
import { listAttempts, loadExam, type StoredExam, saveAttempt, saveExam, sectionHistory } from './exams'
import { insertSample, memoryDb } from './test-helpers'

let db: NodeDatabase
let documentId: number
let exam: StoredExam

const labels = new Map([
  [1, 'Radiation Protection'],
  [2, 'Radiation Protection › Shielding'],
  [3, '(untitled)']
])
const info = (minute: number) => ({
  acceptTypos: false,
  startedAt: new Date(Date.UTC(2026, 10, 26, 9, minute)),
  finishedAt: new Date(Date.UTC(2026, 10, 26, 9, minute + 5)),
  sectionLabel: (id: number) => labels.get(id) ?? '?'
})

/** Answers every question right, except those in `wrongSections`. */
function attempt(wrongSections: number[], minute: number): number {
  const responses = new Map(
    exam.items.map((it) => [
      it.question.id,
      wrongSections.includes(it.question.sectionId) ? 'nope' : it.question.answer
    ])
  )
  return saveAttempt(db, exam, scoreExam(exam, responses), info(minute))
}

beforeEach(() => {
  db = memoryDb()
  documentId = insertSample(db)
  exam = saveExam(db, documentId, assembleExam(loadQuestions(db, documentId), { questionCount: 3 }, 7))
})
afterEach(() => db.close())

describe('exams', () => {
  it('reloads exactly the exam that was shown', () => {
    expect(exam.items).toHaveLength(3)
    const loaded = loadExam(db, exam.id)
    // Same questions, same order, same option order: a review shows what the user saw.
    expect(loaded).toEqual(exam)
    expect(loaded?.items.find((it) => it.question.options)?.optionOrder).toHaveLength(3)
  })

  it('keeps its own copy of the questions', () => {
    db.prepare('DELETE FROM questions').run()
    const ids = loadExam(db, exam.id)?.items.map((it) => it.question.id)
    expect(ids?.sort()).toEqual(['q1', 'q2', 'q3'])
  })

  it('returns undefined for an unknown exam', () => {
    expect(loadExam(db, 999)).toBeUndefined()
  })
})

describe('attempts', () => {
  it('stores the score and lists attempts newest first', () => {
    const first = attempt([2], 0)
    const second = attempt([], 30)
    expect(listAttempts(db, documentId)).toEqual([
      expect.objectContaining({ id: second, examId: exam.id, seed: 7, correct: 3, total: 3, percent: 100 }),
      expect.objectContaining({
        id: first,
        correct: 2,
        total: 3,
        percent: 67,
        acceptTypos: false,
        startedAt: '2026-11-26T09:00:00.000Z',
        finishedAt: '2026-11-26T09:05:00.000Z'
      })
    ])
  })

  it('stores each answer with its status and section', () => {
    const id = attempt([1], 0)
    const rows = db
      .prepare('SELECT question_id, section_label, given, status, correct FROM attempt_answers WHERE attempt_id = ?')
      .all(id)
    expect(rows).toHaveLength(3)
    expect((rows as { question_id: string }[]).find((r) => r.question_id === 'q1')).toEqual({
      question_id: 'q1',
      section_label: 'Radiation Protection',
      given: 'nope',
      status: 'wrong',
      correct: 0
    })
  })

  it('rejects a result that does not belong to the exam', () => {
    const result = scoreExam({ ...exam, items: exam.items.slice(1) }, new Map())
    expect(() => saveAttempt(db, exam, result, info(0))).toThrow(/2 answers but exam \d+ has 3 items/)
    expect(listAttempts(db, documentId)).toEqual([])
  })

  it('is removed with its document', () => {
    attempt([], 0)
    deleteDocument(db, documentId)
    expect(db.prepare('SELECT * FROM attempts').all()).toEqual([])
    expect(db.prepare('SELECT * FROM attempt_answers').all()).toEqual([])
  })
})

describe('sectionHistory', () => {
  it('adds up every attempt per section, weakest first', () => {
    attempt([2], 0)
    attempt([2, 3], 10)
    attempt([], 20)
    expect(sectionHistory(db, documentId)).toEqual([
      { label: 'Radiation Protection › Shielding', correct: 1, total: 3, percent: 33, weak: true },
      { label: '(untitled)', correct: 2, total: 3, percent: 67, weak: false },
      { label: 'Radiation Protection', correct: 3, total: 3, percent: 100, weak: false }
    ])
  })

  it('does not call a section weak after a single answer', () => {
    attempt([2], 0)
    expect(sectionHistory(db, documentId).find((s) => s.percent === 0)?.weak).toBe(false)
  })

  it('is empty before the first attempt', () => {
    expect(sectionHistory(db, documentId)).toEqual([])
  })
})
