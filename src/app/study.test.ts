import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContentArea } from '../core/exam/areas'
import { question } from '../core/exam/test-helpers'
import type { Question } from '../core/generation/types'
import type { StudySettings } from '../shared/api'
import type { NodeDatabase } from './db/connection'
import { insertDocument } from './db/documents'
import { content, memoryDb, meta } from './db/test-helpers'
import { assembleMock, ExamService } from './exam-service'

let db: NodeDatabase
let service: ExamService

/** `count` multiple-choice questions in an area, with options so a mock exam can use them. */
function mcqs(prefix: string, area: ContentArea, count: number): Question[] {
  return Array.from({ length: count }, (_, i) =>
    question(`${prefix}${i}`, {
      type: 'book-mcq',
      area,
      answer: `right ${prefix}${i}`,
      options: [{ text: `right ${prefix}${i}` }, { text: 'wrong 1' }, { text: 'wrong 2' }, { text: 'wrong 3' }],
      keepOptionOrder: true
    })
  )
}

const practice = (over: Partial<StudySettings> = {}): StudySettings => ({
  mode: 'practice',
  areas: [],
  questionCount: 5,
  types: [],
  acceptTypos: false,
  blueprint: '2022',
  ...over
})

beforeEach(() => {
  db = memoryDb()
  service = new ExamService(db, [])
  // Two PDFs whose question ids overlap ("q0" in both), as real documents' ids do.
  insertDocument(
    db,
    meta('1'.repeat(64), { fileName: 'Chapter 1 Patient Care.pdf' }),
    content({ questions: [...mcqs('q', 'patient-care', 20), question('cloze1', { area: 'patient-care' })] })
  )
  insertDocument(
    db,
    meta('2'.repeat(64), { fileName: 'Chapter 3 Radiation Protection.pdf' }),
    content({
      questions: [...mcqs('q', 'safety', 20), ...mcqs('p', 'procedures', 20), ...mcqs('i', 'image-production', 20)]
    })
  )
})
afterEach(() => db.close())

describe('practice over the whole study set', () => {
  it('draws from every PDF, with ids that stay unique across them', () => {
    const exam = service.startStudyExam(practice({ questionCount: 80 }), 1)
    expect(exam.documentId).toBeNull()
    expect(exam.mode).toBe('practice')
    expect(exam.questions.length).toBe(80)
    expect(new Set(exam.questions.map((q) => q.area))).toEqual(
      new Set(['Patient Care', 'Safety', 'Procedures', 'Image Production'])
    )
  })

  it('keeps to the chosen areas', () => {
    const exam = service.startStudyExam(practice({ areas: ['safety'], questionCount: 10 }), 1)
    expect(exam.questions.every((q) => q.area === 'Safety')).toBe(true)
  })

  it('gives feedback per answer and scores by area', () => {
    const exam = service.startStudyExam(practice({ areas: ['safety'], questionCount: 2 }), 1)
    service.answer(exam.examId, 0, { choice: 0 })
    const summary = service.finish(exam.examId)
    expect(summary.byArea).toEqual([{ label: 'Safety', correct: 1, total: 2, percent: 50 }])
  })

  it('says so when there is nothing to study', () => {
    const empty = new ExamService(memoryDb(), [])
    expect(() => empty.startStudyExam(practice(), 1)).toThrow('There are no questions yet')
  })
})

describe('mock exam', () => {
  const mock = (over: Partial<StudySettings> = {}) => practice({ mode: 'mock', questionCount: 20, ...over })

  it('uses only multiple choice, in the blueprint proportions, timed at the real pace', () => {
    const exam = service.startStudyExam(mock(), 3)
    expect(exam.mode).toBe('mock')
    expect(exam.questions).toHaveLength(20)
    expect(exam.questions.every((q) => q.options !== undefined)).toBe(true)
    const perArea = (label: string) => exam.questions.filter((q) => q.area === label).length
    // 20 questions at the 33/50/51/66 proportions.
    expect([perArea('Patient Care'), perArea('Safety'), perArea('Image Production'), perArea('Procedures')]).toEqual([
      3, 5, 5, 7
    ])
    expect(exam.timeLimitSeconds).toBe(Math.round((20 * 3.5 * 3600) / 230))
  })

  it('records answers without grading, lets them change, and grades at the end', () => {
    const exam = service.startStudyExam(mock(), 3)
    expect(() => service.answer(exam.examId, 0, { choice: 0 })).toThrow('shows answers at the end')
    service.record(exam.examId, 0, { choice: 1 })
    service.record(exam.examId, 0, { choice: 0 })
    service.record(exam.examId, 1, { choice: 0 })
    service.record(exam.examId, 1, { text: '' })
    const summary = service.finish(exam.examId)
    expect(summary).toMatchObject({ mode: 'mock', correct: 1, answered: 1, total: 20 })
    expect(summary.byArea.map((a) => a.label)).toEqual(['Patient Care', 'Safety', 'Image Production', 'Procedures'])
  })

  it('fills a short area from the others and says so', () => {
    // Patient Care has 20 multiple-choice questions; a 200-question exam wants 33.
    const exam = assembleMock(
      [...mcqs('a', 'patient-care', 20), ...mcqs('b', 'safety', 200), ...mcqs('c', 'procedures', 200)],
      100,
      '2022',
      1
    )
    expect(exam.items).toHaveLength(100)
    expect(exam.warnings.some((w) => w.startsWith('Image Production has 0'))).toBe(true)
  })
})

describe('readiness', () => {
  it('scores each area over all attempts and names what to practise next', () => {
    let r = service.readiness('2022')
    expect(r.documentCount).toBe(2)
    expect(r.areas.map((a) => [a.label, a.available, a.mockAvailable, a.onExam])).toEqual([
      ['Patient Care', 21, 20, 33],
      ['Safety', 20, 20, 50],
      ['Image Production', 20, 20, 51],
      ['Procedures', 20, 20, 66]
    ])
    // Nothing answered yet: the least practised area comes first.
    expect(r.weakest).toBe('patient-care')

    // Answer every area, missing most Safety questions.
    for (const area of ['patient-care', 'safety', 'image-production', 'procedures'] as ContentArea[]) {
      const exam = service.startStudyExam(practice({ areas: [area], questionCount: 10, types: ['book-mcq'] }), 1)
      for (const q of exam.questions) service.answer(exam.examId, q.position, { choice: area === 'safety' ? 1 : 0 })
      service.finish(exam.examId)
    }
    r = service.readiness('2027')
    expect(r.areas.find((a) => a.area === 'safety')).toMatchObject({ correct: 0, total: 10, percent: 0, onExam: 46 })
    expect(r.weakest).toBe('safety')
    expect(r.recent).toHaveLength(4)
    expect(r.recent[0]).toMatchObject({ mode: 'practice', label: 'Practice' })
  })
})
