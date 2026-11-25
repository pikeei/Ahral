import { describe, expect, it } from 'vitest'
import type { Exam } from './assemble'
import { scoreExam } from './score'
import { option, question } from './test-helpers'

function exam(questions: ReturnType<typeof question>[]): Exam {
  return {
    seed: 1,
    config: { questionCount: questions.length },
    items: questions.map((q) => ({ question: q })),
    warnings: []
  }
}

const qs = [
  question('a', { sectionId: 1 }),
  question('b', { sectionId: 1 }),
  question('c', { sectionId: 2 }),
  question('d', { sectionId: 2 }),
  question('e', { sectionId: 2, type: 'mcq-term', answer: 'X', options: [option('X'), option('Y')] })
]

describe('scoreExam', () => {
  it('totals correct answers and percent', () => {
    const responses = new Map([
      ['a', 'answer a'],
      ['b', 'answer b'],
      ['c', 'wrong'],
      ['e', 'X']
    ])
    const result = scoreExam(exam(qs), responses)
    expect(result).toMatchObject({ correct: 3, total: 5, percent: 60, answered: 4 })
    expect(result.answers.map((a) => a.status)).toEqual(['correct', 'correct', 'wrong', 'unanswered', 'correct'])
  })

  it('scores by question type', () => {
    const result = scoreExam(exam(qs), new Map([['e', 'Y']]))
    expect(result.byType).toEqual({
      cloze: { correct: 0, total: 4, percent: 0 },
      'mcq-term': { correct: 0, total: 1, percent: 0 }
    })
  })

  it('scores by section with titles and lists weak sections, weakest first', () => {
    const responses = new Map([
      ['a', 'answer a'],
      ['b', 'answer b'],
      ['c', 'answer c']
    ])
    const titles = new Map<number, string | null>([
      [1, 'Patient Care'],
      [2, 'Radiation Protection']
    ])
    const result = scoreExam(exam(qs), responses, { sectionTitles: titles })
    expect(result.bySection).toEqual([
      { sectionId: 1, title: 'Patient Care', correct: 2, total: 2, percent: 100 },
      { sectionId: 2, title: 'Radiation Protection', correct: 1, total: 3, percent: 33 }
    ])
    expect(result.weakSections.map((s) => s.sectionId)).toEqual([2])
  })

  it('does not call a section weak on a single question', () => {
    const result = scoreExam(exam([question('a', { sectionId: 9 })]), new Map())
    expect(result.weakSections).toEqual([])
  })

  it('handles an empty exam', () => {
    expect(scoreExam(exam([]), new Map())).toMatchObject({ correct: 0, total: 0, percent: 0 })
  })
})
