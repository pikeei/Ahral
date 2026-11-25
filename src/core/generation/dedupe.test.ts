import { describe, expect, it } from 'vitest'
import { dedupeQuestions } from './dedupe'
import type { Question } from './types'

/** Distinct vocabulary per question, so only the tests that want near-duplicate prompts get them. */
const WORDS = [
  'anode',
  'cathode',
  'filament',
  'rotor',
  'stator',
  'grid',
  'collimator',
  'phosphor',
  'detector',
  'cassette'
]

function q(id: string, termKey: string, quality: number, opts: Partial<Question> = {}): Question {
  const i = id.charCodeAt(0) - 97
  return {
    id,
    type: 'cloze',
    prompt: `The ${WORDS[i]} works with the ${WORDS[(i + 5) % WORDS.length]} during exposure.`,
    answer: termKey,
    acceptedAnswers: [termKey],
    explanation: '',
    page: 1,
    sectionId: 1,
    sentenceId: 1,
    termKey,
    quality,
    ...opts
  }
}

describe('dedupeQuestions', () => {
  it('keeps the best questions per term, within the per-type limit', () => {
    const kept = dedupeQuestions([q('a', 'x', 0.5), q('b', 'x', 0.9), q('c', 'x', 0.7), q('d', 'y', 0.1)], 3, 2)
    expect(kept.map((x) => x.id)).toEqual(['b', 'c', 'd'])
  })

  it('fills the per-term limit with different question types', () => {
    const kept = dedupeQuestions(
      [
        q('a', 'x', 0.9),
        q('b', 'x', 0.8),
        q('c', 'x', 0.7, { type: 'mcq-term' }),
        q('d', 'x', 0.6, { type: 'mcq-definition' })
      ],
      3,
      1
    )
    expect(kept.map((x) => x.id)).toEqual(['a', 'c', 'd'])
  })

  it('drops a question whose prompt is nearly the same as a better one', () => {
    const prompt = 'Selenium is an open-source framework used to automate web browsers.'
    const kept = dedupeQuestions(
      [q('a', 'x', 0.9, { prompt }), q('b', 'y', 0.5, { prompt: prompt.replace('web', 'all') })],
      3,
      2
    )
    expect(kept.map((x) => x.id)).toEqual(['a'])
  })

  it('orders results by quality', () => {
    const kept = dedupeQuestions([q('a', 'x', 0.2), q('b', 'y', 0.8), q('c', 'z', 0.5)], 3, 2)
    expect(kept.map((x) => x.quality)).toEqual([0.8, 0.5, 0.2])
  })
})
