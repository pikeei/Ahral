import { describe, expect, it } from 'vitest'
import type { SectionOption } from './api'
import { matchingQuestions, sectionMatches } from './exam-setup'

const sections: SectionOption[] = [
  // A practice test: only the book's own questions.
  { id: 1, label: 'Practice Test 1 › Questions', questionCount: 175, countByType: { 'book-mcq': 175 } },
  // An answer section: only generated questions.
  {
    id: 2,
    label: 'Radiation Protection › Answers and Explanations',
    questionCount: 60,
    countByType: { cloze: 40, 'mcq-term': 12, 'mcq-definition': 8 }
  }
]

describe('exam setup counts', () => {
  it('counts one section for the chosen types', () => {
    expect(sectionMatches(sections[1]!, ['cloze', 'mcq-term'])).toBe(52)
    expect(sectionMatches(sections[0]!, ['cloze'])).toBe(0)
  })

  it('counts every section when none is chosen', () => {
    expect(matchingQuestions(sections, ['book-mcq', 'cloze'], [])).toBe(215)
  })

  it('finds nothing when the chosen sections have none of the chosen types', () => {
    // The case that used to start an empty exam: a practice test, fill-in-the-blank only.
    expect(matchingQuestions(sections, ['cloze'], [1])).toBe(0)
    expect(matchingQuestions(sections, ['book-mcq'], [2])).toBe(0)
  })

  it('finds nothing when no type is chosen', () => {
    expect(matchingQuestions(sections, [], [])).toBe(0)
  })
})
