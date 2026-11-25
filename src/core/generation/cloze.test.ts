import { describe, expect, it } from 'vitest'
import { type ClozeRejection, generateCloze } from './cloze'
import { source, term } from './test-helpers'
import { BLANK } from './types'

function run(sources: ReturnType<typeof source>[], terms: ReturnType<typeof term>[]) {
  const rejected: ClozeRejection[] = []
  const questions = generateCloze(sources, terms, (reason) => rejected.push(reason))
  return { questions, rejected }
}

describe('generateCloze', () => {
  it('blanks the highest-scoring key term in the sentence', () => {
    const { questions } = run(
      [source(1, 'Selenium is an open-source framework used to automate web browsers.')],
      [
        term('web browser', { key: 'web browser', score: 4, sentenceIds: [1] }),
        term('Selenium', { score: 9, sentenceIds: [1] })
      ]
    )
    expect(questions[0]).toMatchObject({
      type: 'cloze',
      prompt: `${BLANK} is an open-source framework used to automate web browsers.`,
      answer: 'Selenium',
      termKey: 'selenium',
      id: 'cloze-1-selenium'
    })
  })

  it('matches a plural form of the term and uses it as the answer', () => {
    const { questions } = run(
      [source(1, 'Testing finds defects before users report them to the team.')],
      [term('defect', { sentenceIds: [1] })]
    )
    expect(questions[0]).toMatchObject({ answer: 'defects', acceptedAnswers: ['defects', 'defect'] })
  })

  it('skips a term that appears twice, since the second copy gives the answer away', () => {
    const { questions, rejected } = run(
      [source(1, 'A regression test checks old features; every regression test is automated here.')],
      [term('regression test', { sentenceIds: [1] })]
    )
    expect(questions).toEqual([])
    expect(rejected).toEqual(['answer-repeated'])
  })

  it('skips a term whose alias appears in the same sentence', () => {
    const { questions } = run(
      [source(1, 'An API (Application Programming Interface) lets two programs talk to each other.')],
      [term('API', { key: 'api', sentenceIds: [1], alternatives: ['Application Programming Interface'] })]
    )
    expect(questions).toEqual([])
  })

  it('falls back to the next term when the best one cannot be used', () => {
    const { questions } = run(
      [source(1, 'A regression test reruns old checks; each regression test runs in the pipeline nightly.')],
      [term('regression test', { score: 9, sentenceIds: [1] }), term('pipeline', { score: 2, sentenceIds: [1] })]
    )
    expect(questions[0]?.answer).toBe('pipeline')
  })

  it('needs enough words left around the blank', () => {
    const { rejected } = run([source(1, 'Unit testing verifies units.')], [term('Unit testing', { sentenceIds: [1] })])
    expect(rejected).toEqual(['too-little-context'])
  })

  it('matches acronyms by exact case only', () => {
    const { questions } = run(
      [source(1, 'The cr value differs, but CR imaging uses a photostimulable plate for each exposure.')],
      [term('CR', { key: 'cr', sentenceIds: [1], sources: ['acronym'] })]
    )
    expect(questions[0]?.prompt).toBe(
      `The cr value differs, but ${BLANK} imaging uses a photostimulable plate for each exposure.`
    )
  })

  it('reports sentences with no key term', () => {
    const { rejected } = run([source(1, 'Nothing in this sentence is a known key term at all.')], [])
    expect(rejected).toEqual(['no-key-term'])
  })
})
