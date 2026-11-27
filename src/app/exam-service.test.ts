import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExamSettings, ExamView } from '../shared/api'
import type { NodeDatabase } from './db/connection'
import { insertSample, memoryDb } from './db/test-helpers'
import { ExamService } from './exam-service'

let db: NodeDatabase
let service: ExamService
let documentId: number

const ALL: ExamSettings = { questionCount: 3, types: [], sectionIds: [], acceptTypos: false }

beforeEach(() => {
  db = memoryDb()
  service = new ExamService(db)
  documentId = insertSample(db)
})
afterEach(() => db.close())

/** Answers every question correctly through the same calls the UI makes. */
function answerAll(exam: ExamView, right = true) {
  return exam.questions.map((q) => {
    if (q.options) {
      const answerText = loadAnswer(exam.examId, q.position)
      const choice = q.options.findIndex((o) => (o === answerText) === right)
      return service.answer(exam.examId, q.position, { choice })
    }
    return service.answer(exam.examId, q.position, { text: right ? loadAnswer(exam.examId, q.position) : 'nope' })
  })
}

function loadAnswer(examId: number, position: number): string {
  const row = db
    .prepare('SELECT question FROM exam_items WHERE exam_id = ? AND position = ?')
    .get(examId, position) as {
    question: string
  }
  return (JSON.parse(row.question) as { answer: string }).answer
}

describe('documents', () => {
  it('summarizes documents with their latest score', () => {
    expect(service.listDocuments()).toEqual([
      expect.objectContaining({
        id: documentId,
        fileName: 'notes.pdf',
        questionCount: 3,
        attemptCount: 0,
        lastScore: null
      })
    ])
    const exam = service.startExam(documentId, ALL, 1)
    answerAll(exam)
    service.finish(exam.examId)
    expect(service.listDocuments()[0]).toMatchObject({ attemptCount: 1, lastScore: 100 })
  })

  it('describes a document for the exam setup screen', () => {
    const detail = service.getDocument(documentId)
    expect(detail.sections).toEqual([
      { id: 1, label: 'Radiation Protection', questionCount: 1, countByType: { cloze: 1 } },
      { id: 2, label: 'Radiation Protection › Shielding', questionCount: 1, countByType: { 'mcq-term': 1 } },
      { id: 3, label: 'Pages 7–12', questionCount: 1, countByType: { 'mcq-definition': 1 } }
    ])
    expect(detail.questionCountByType).toEqual({ cloze: 1, 'mcq-term': 1, 'mcq-definition': 1 })
    expect(detail.warnings).toEqual(['Some pages have no text.'])
    expect(detail.attempts).toEqual([])
  })

  it('reports weak sections across attempts', () => {
    for (const seed of [1, 2]) {
      const exam = service.startExam(documentId, ALL, seed)
      answerAll(exam, false)
      service.finish(exam.examId)
    }
    const detail = service.getDocument(documentId)
    expect(detail.attempts).toHaveLength(2)
    expect(detail.weakSections.map((s) => s.label)).toContain('Radiation Protection')
  })

  it('deletes a document and abandons its exams in progress', () => {
    const exam = service.startExam(documentId, ALL, 1)
    service.deleteDocument(documentId)
    expect(service.listDocuments()).toEqual([])
    expect(() => service.finish(exam.examId)).toThrow('is not in progress')
    expect(() => service.getDocument(documentId)).toThrow(`No document with id ${documentId}`)
  })
})

describe('taking an exam', () => {
  it('sends questions without their answers', () => {
    const exam = service.startExam(documentId, ALL, 1)
    expect(exam.questions).toHaveLength(3)
    const json = JSON.stringify(exam)
    expect(json).not.toContain('acceptedAnswers')
    expect(json).not.toContain('explanation')
    expect(exam.questions.every((q) => q.section.length > 0)).toBe(true)
  })

  it('filters by type and section', () => {
    expect(service.startExam(documentId, { ...ALL, types: ['cloze'] }, 1).questions.map((q) => q.type)).toEqual([
      'cloze'
    ])
    const bySection = service.startExam(documentId, { ...ALL, sectionIds: [2] }, 1)
    expect(bySection.questions.map((q) => q.section)).toEqual(['Radiation Protection › Shielding'])
    expect(bySection.warnings).toHaveLength(1)
  })

  it('grades each answer with an explanation', () => {
    const exam = service.startExam(documentId, ALL, 1)
    const cloze = exam.questions.find((q) => !q.options)!
    const feedback = service.answer(exam.examId, cloze.position, { text: '  nope ' })
    expect(feedback).toMatchObject({ status: 'wrong', correct: false, given: 'nope' })
    expect(feedback.lines[0]).toBe('Not quite.')
    expect(feedback.lines.at(-1)).toMatch(/\(p\. 1\)$/)
  })

  it('maps a multiple-choice pick to the option shown at that position', () => {
    const exam = service.startExam(documentId, ALL, 1)
    const mcq = exam.questions.find((q) => q.options)!
    const feedback = service.answer(exam.examId, mcq.position, { choice: 2 })
    expect(feedback.given).toBe(mcq.options![2])
  })

  it('treats an empty answer as skipped', () => {
    const exam = service.startExam(documentId, ALL, 1)
    expect(service.answer(exam.examId, 0, { text: '   ' })).toMatchObject({ status: 'unanswered', given: null })
  })

  it('rejects invalid answers', () => {
    const exam = service.startExam(documentId, ALL, 1)
    const mcq = exam.questions.find((q) => q.options)!
    expect(() => service.answer(exam.examId, 9, { text: 'x' })).toThrow('has no question 9')
    expect(() => service.answer(exam.examId, mcq.position, { choice: 7 })).toThrow('has no option 7')
    service.answer(exam.examId, 0, { text: 'x' })
    expect(() => service.answer(exam.examId, 0, { text: 'y' })).toThrow('already been answered')
    expect(() => service.answer(999, 0, { text: 'x' })).toThrow('Exam 999 is not in progress')
  })

  it('finishes with a score, a review and a saved attempt', () => {
    const exam = service.startExam(documentId, ALL, 1)
    answerAll(exam)
    const summary = service.finish(exam.examId)
    expect(summary).toMatchObject({ correct: 3, total: 3, percent: 100, answered: 3, seed: 1, documentId })
    expect(summary.bySection).toHaveLength(3)
    expect(summary.review.map((r) => r.position)).toEqual([0, 1, 2])
    expect(summary.review.every((r) => r.status === 'correct' && r.lines.length > 0)).toBe(true)
    expect(() => service.finish(exam.examId)).toThrow('is not in progress')
    expect(service.getDocument(documentId).attempts).toHaveLength(1)
  })

  it('counts unanswered questions when finishing early', () => {
    const exam = service.startExam(documentId, ALL, 1)
    const summary = service.finish(exam.examId)
    expect(summary).toMatchObject({ correct: 0, total: 3, answered: 0 })
    expect(summary.review.every((r) => r.status === 'unanswered' && r.given === null)).toBe(true)
  })

  it('replays the same exam from its seed', () => {
    const first = service.startExam(documentId, ALL, 42)
    const again = service.startExam(documentId, { ...ALL, seed: 42 })
    expect(again.seed).toBe(42)
    expect(again.questions).toEqual(first.questions)
  })

  it('refuses to start an exam that no question matches', () => {
    // Section 2 has only a "pick the term" question.
    expect(() => service.startExam(documentId, { ...ALL, types: ['cloze'], sectionIds: [2] }, 1)).toThrow(
      'No questions match these settings'
    )
    // Nothing was saved for it.
    expect(db.prepare('SELECT COUNT(*) AS n FROM exams').get()).toEqual({ n: 0 })
  })

  it('fails for an unknown document', () => {
    expect(() => service.startExam(999, ALL, 1)).toThrow('No document with id 999')
  })
})
