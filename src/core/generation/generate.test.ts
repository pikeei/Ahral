import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '../analysis/analyze'
import { analyzeLayout } from '../pdf/layout'
import { item, page, paragraph } from '../pdf/test-helpers'
import { generateQuestions, selectAnswerTerms } from './generate'
import { term } from './test-helpers'

function buildDoc() {
  return analyzeLayout([
    page(1, [
      item('Chapter 1 Testing Tools', 72, 740, { size: 18, bold: true }),
      ...paragraph(
        [
          '• Selenium - an open-source framework used to automate web browsers.',
          '• Postman - a tool used for sending requests to web services.',
          '• JMeter - an open-source tool for measuring performance under load.',
          '• Cypress - a JavaScript framework that runs end-to-end tests in the browser.',
          'Regression testing confirms that existing features still work after every change.',
          'Teams run regression testing in the pipeline after each merge to the main branch.',
          'This sentence refers to something else and should never become a question.'
        ],
        72,
        700
      )
    ])
  ])
}

describe('generateQuestions', () => {
  it('produces cloze and multiple-choice questions with source references', () => {
    const doc = buildDoc()
    const { questions, stats } = generateQuestions(doc, analyzeDocument(doc))

    expect(stats.byType['mcq-term']).toBeGreaterThan(0)
    expect(stats.byType.cloze).toBeGreaterThan(0)
    expect(stats.rejectedSentences['refers-elsewhere']).toBe(1)
    for (const q of questions) {
      expect(q.page).toBe(1)
      expect(q.explanation.length).toBeGreaterThan(0)
      if (q.options) expect(q.options).toContain(q.answer)
    }
  })

  it('is deterministic: the same document gives the same questions and ids', () => {
    const doc = buildDoc()
    const first = generateQuestions(doc, analyzeDocument(doc)).questions
    const second = generateQuestions(doc, analyzeDocument(doc)).questions
    expect(second).toEqual(first)
  })

  it('keeps no more than the per-term limit', () => {
    const doc = buildDoc()
    const { questions } = generateQuestions(doc, analyzeDocument(doc), { maxPerTerm: 1 })
    const keys = questions.map((q) => q.termKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('selectAnswerTerms', () => {
  const isWord = (w: string) => ['system', 'patient'].includes(w)

  it('drops single everyday words unless they were defined, bolded or are acronyms', () => {
    const picked = selectAnswerTerms(
      [
        term('system'),
        term('patient', { sources: ['definition'] }),
        term('kilovoltage'),
        term('web browser', { key: 'web browser' })
      ],
      10,
      isWord
    ).map((t) => t.text)
    expect(picked).toEqual(['patient', 'kilovoltage', 'web browser'])
  })

  it('drops terms that do not start with a letter', () => {
    expect(selectAnswerTerms([term('30-degree'), term('x-ray')], 10, isWord).map((t) => t.text)).toEqual(['x-ray'])
  })
})
