import { describe, expect, it } from 'vitest'
import { CONTENT_AREAS } from '../core/exam/areas'
import { BANK_PREFIX, BUILT_IN_BANK, toQuestion } from './bank'
import { memoryDb } from './db/test-helpers'
import { ExamService } from './exam-service'

const entry = {
  id: 'x-1',
  area: 'safety',
  topic: 'Dose limits',
  stem: 'The annual occupational effective dose limit is',
  options: ['1 mSv', '5 mSv', '50 mSv', '500 mSv'],
  answer: 2,
  explanation: 'It is 50 mSv.'
}

describe('built-in question bank', () => {
  it('has well-formed questions with unique ids, four options and a valid answer', () => {
    expect(BUILT_IN_BANK.length).toBeGreaterThanOrEqual(150)
    expect(new Set(BUILT_IN_BANK.map((q) => q.id)).size).toBe(BUILT_IN_BANK.length)
    for (const q of BUILT_IN_BANK) {
      expect(q.id.startsWith(BANK_PREFIX)).toBe(true)
      expect(q.area && CONTENT_AREAS.includes(q.area)).toBe(true)
      expect(q.topic).toBeTruthy()
      expect(q.options).toHaveLength(4)
      const texts = q.options?.map((o) => o.text) ?? []
      expect(new Set(texts).size).toBe(4)
      expect(texts).toContain(q.answer)
      expect(q.explanation.length).toBeGreaterThan(20)
    }
  })

  it('keeps number scales in order and lets other options shuffle', () => {
    expect(toQuestion(entry).keepOptionOrder).toBe(true)
    expect(
      toQuestion({ ...entry, options: ['Gray', 'Sievert', 'Coulomb', 'Becquerel'] }).keepOptionOrder
    ).toBeUndefined()
  })

  it('rejects an unknown area or an answer outside the options', () => {
    expect(() => toQuestion({ ...entry, area: 'radiology' })).toThrow('unknown area')
    expect(() => toQuestion({ ...entry, answer: 4 })).toThrow('bad options or answer')
  })
})

describe('studying from the bank', () => {
  const bank = [
    toQuestion(entry),
    toQuestion({ ...entry, id: 'x-2', topic: 'Dose limits' }),
    toQuestion({ ...entry, id: 'x-3', topic: 'Grids', area: 'image-production' })
  ]

  it('works with no PDFs imported and lists topics per area', () => {
    const service = new ExamService(memoryDb(), bank)
    const r = service.readiness('2022')
    expect(r).toMatchObject({ documentCount: 0, questionCount: 3, bankCount: 3 })
    expect(r.areas.find((a) => a.area === 'safety')?.topics).toEqual([{ name: 'Dose limits', available: 2 }])
  })

  it('practises one topic', () => {
    const service = new ExamService(memoryDb(), bank)
    const exam = service.startStudyExam(
      {
        mode: 'practice',
        areas: [],
        topics: ['Grids'],
        questionCount: 10,
        types: [],
        acceptTypos: false,
        blueprint: '2022'
      },
      1
    )
    expect(exam.questions.map((q) => q.prompt)).toEqual([entry.stem])
    expect(exam.questions[0]?.area).toBe('Image Production')
  })
})
