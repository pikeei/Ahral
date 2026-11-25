import { describe, expect, it } from 'vitest'
import { checkSentence } from './sentence-filter'

const GOOD = 'Selenium is an open-source framework used to automate web browsers.'

describe('checkSentence', () => {
  it('accepts a clear, self-contained statement', () => {
    expect(checkSentence(GOOD)).toEqual({ ok: true, text: GOOD })
  })

  it('removes an answer-option label', () => {
    expect(checkSentence(`(A) ${GOOD}`)).toEqual({ ok: true, text: GOOD })
  })

  it.each([
    ['question', 'Which tool is commonly used to automate web browsers in testing?', 'question'],
    ['fragment without final punctuation', 'Selenium is an open-source framework used to automate browsers', 'not-a-statement'],
    ['too short', 'Selenium automates browsers.', 'too-short'],
    ['too long', `${'word '.repeat(45)}end.`, 'too-long'],
    ['starts with a reference', 'This framework is used to automate web browsers in most teams.', 'refers-elsewhere'],
    ['starts with a connector', 'However, the framework is used to automate web browsers in teams.', 'refers-elsewhere'],
    ['mentions a figure', 'The framework shown in Figure 3 automates web browsers for teams.', 'mentions-figure'],
    ['mostly numbers and symbols', '12.5 / 30.1 = 0.41 ; 18.2 / 30.1 = 0.60 ; 22 / 30 = 0.73 ; ok.', 'mostly-symbols'],
    ['all capitals', 'SELENIUM IS AN OPEN-SOURCE FRAMEWORK USED TO AUTOMATE WEB BROWSERS.', 'all-caps']
  ])('rejects: %s', (_name, sentence, reason) => {
    expect(checkSentence(sentence)).toEqual({ ok: false, reason })
  })
})

describe('checkSentence with a dictionary', () => {
  const words = new Set([
    'is', 'an', 'open', 'source', 'framework', 'used', 'to', 'automate', 'web', 'browsers', 'the', 'for', 'of',
    'tube', 'voltage', 'measured', 'in', 'units', 'and', 'left', 'side', 'marker', 'placed', 'on', 'there',
    'le', 'function', 'this'
  ])
  const isWord = (w: string) => words.has(w)

  it('accepts sentences whose words are all known', () => {
    expect(checkSentence(GOOD.replace('Selenium', 'The framework'), { isWord }).ok).toBe(true)
  })

  it.each([
    ['a broken lowercase word', 'The tube voltage is measured in units o kilovolts or tube.'],
    ['a lone "o" left over from "of"', 'The tube voltage is measured in units o the tube and used.'],
    ['a rare two-letter word that is usually a fragment ("le" for "left")', 'The le side marker is placed on the tube and used.'],
    ['a broken first word ("Eedback" for "Feedback")', 'Eedback of the tube voltage is measured in units and used.'],
    ['a capital T cut off by a lost "h"', 'T ere is a side marker placed on the tube and used.']
  ])('rejects %s', (_name, sentence) => {
    expect(checkSentence(sentence, { isWord })).toEqual({ ok: false, reason: 'unrecognized-words' })
  })

  it('accepts unknown words that are known key terms of the document', () => {
    const sentence = 'The tube voltage is measured in units and used for kilovoltage.'
    expect(checkSentence(sentence, { isWord, allowedWords: new Set(['kilovoltage']) }).ok).toBe(true)
  })

  it('does not treat "i.e." as a lone "i"', () => {
    expect(checkSentence('The tube voltage (i.e. the left side) is measured in units.', { isWord }).ok).toBe(true)
  })
})
