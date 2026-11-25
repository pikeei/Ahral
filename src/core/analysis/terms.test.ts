import { describe, expect, it } from 'vitest'
import { analyzeDocument } from './analyze'
import { tokenize } from './nlp'
import { dropSubsumed, extractTerms, nounPhrases, scoreTerm, type Term } from './terms'
import { analyzeLayout } from '../pdf/layout'
import { item, page, paragraph } from '../pdf/test-helpers'
import { sentencesAndBlocks } from './test-helpers'

describe('tokenize', () => {
  it('keeps hyphenated words whole and reduces plurals to a base key', () => {
    const tokens = tokenize('An open-source framework automates browsers.')
    expect(tokens.map((t) => t.text)).toContain('open-source')
    expect(tokens.find((t) => t.text === 'browsers')?.key).toBe('browser')
  })
})

describe('nounPhrases', () => {
  const keys = (text: string) => nounPhrases(tokenize(text)).map((p) => p.key)

  it('finds adjective + noun chunks and skips verbs', () => {
    const found = keys('Selenium is an open-source framework used to automate web browsers.')
    expect(found).toEqual(expect.arrayContaining(['selenium', 'open-source framework', 'web browser']))
    expect(found).not.toContain('used')
    expect(found).not.toContain('automate')
  })

  it('does not run a phrase across a comma', () => {
    expect(keys('It supports Chrome, Firefox and Safari.')).not.toContain('chrome firefox')
  })
})

describe('scoreTerm', () => {
  it('scores a frequent term above a rare one', () => {
    expect(scoreTerm(8, 2, 5, 'oracle', [])).toBeGreaterThan(scoreTerm(2, 2, 5, 'oracle', []))
  })

  it('scores a term concentrated in few sections above one spread everywhere (IDF)', () => {
    expect(scoreTerm(5, 1, 5, 'stub', [])).toBeGreaterThan(scoreTerm(5, 5, 5, 'stub', []))
  })

  it('adds bonuses for definitions and bold text', () => {
    const base = scoreTerm(1, 1, 1, 'stub', [])
    expect(scoreTerm(1, 1, 1, 'stub', ['definition', 'bold'])).toBeCloseTo(base + 5)
  })
})

describe('dropSubsumed', () => {
  const term = (key: string, frequency: number, sources: Term['sources'] = ['noun-phrase']): Term => ({
    key, text: key, score: 1, frequency, sectionIds: [1], sentenceIds: [], sources, alternatives: []
  })

  it('drops a word that only appears inside a longer term', () => {
    const kept = dropSubsumed([term('test plan', 3), term('plan', 3)])
    expect(kept.map((t) => t.key)).toEqual(['test plan'])
  })

  it('keeps a word that also appears on its own', () => {
    const kept = dropSubsumed([term('unit testing', 3), term('testing', 10)])
    expect(kept.map((t) => t.key)).toEqual(['unit testing', 'testing'])
  })

  it('keeps defined or bold terms regardless', () => {
    const kept = dropSubsumed([term('test plan', 3), term('plan', 3, ['bold'])])
    expect(kept).toHaveLength(2)
  })

  it('matches whole words only ("test" is not inside "testing")', () => {
    const kept = dropSubsumed([term('testing', 5), term('test', 2)])
    expect(kept.map((t) => t.key)).toContain('test')
  })
})

describe('extractTerms', () => {
  it('ranks defined and bold terms above common words, and links acronyms', () => {
    const { sentences, blocks } = sentencesAndBlocks([
      { text: 'Postman is a tool used for testing an Application Programming Interface (API).', bold: ['Postman'] },
      'The API returns data to the system.',
      'The system stores data in the system database.',
      'Every system needs testing.'
    ])
    const analysis = analyzeDocument({
      pageCount: 1, pages: [], bodyFontSize: 11, sections: [], blocks, sentences, likelyScanned: false, warnings: []
    })
    const keys = analysis.terms.map((t) => t.key)

    expect(keys.indexOf('postman')).toBeLessThan(keys.indexOf('system'))
    expect(analysis.terms.find((t) => t.key === 'api')?.alternatives).toEqual(['Application Programming Interface'])
  })

  it('ignores noun phrases that appear only once', () => {
    const { sentences, blocks } = sentencesAndBlocks(['The flaky widget broke.', 'Testing found it. Testing helped.'])
    const keys = extractTerms(sentences, blocks, [], []).map((t) => t.key)
    expect(keys).not.toContain('flaky widget')
  })
})

describe('analyzeDocument (layout → analysis)', () => {
  it('finds definitions from a laid-out glossary list', () => {
    const doc = analyzeLayout([
      page(1, [
        item('1.2 Common Tools', 72, 720, { size: 14, bold: true }),
        ...paragraph(
          [
            '• Selenium - an open-source framework used to automate web browsers.',
            '• Postman - a tool used for API testing.',
            '• JMeter - an open-source tool for performance testing.'
          ],
          72,
          690
        )
      ])
    ])
    const analysis = analyzeDocument(doc)
    expect(analysis.definitions.map((d) => [d.term, d.pattern])).toEqual([
      ['Selenium', 'glossary'],
      ['Postman', 'glossary'],
      ['JMeter', 'glossary']
    ])
  })
})
