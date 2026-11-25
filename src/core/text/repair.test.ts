import { describe, expect, it } from 'vitest'
import { createRepairer } from './repair'

// A small dictionary standing in for the real word list.
const WORDS = new Set([
  'of', 'off', 'the', 'there', 'these', 'five', 'feedback', 'specific', 'certification', 'professor', 'pro',
  'after', 'often', 'before', 'infection', 'effects', 'difficile', 'superficial', 'thorax', 'technologist',
  'this', 'book', 'a', 'is', 'used', 'for', 'determination', 'pulse', 'rate', 'arteries', 'patient', 'ten',
  'flow', 'file', 'trial', 'rial', 'in', 'and', 'with', 'fib', 'deep', 'veins', 'if', 'femoral', 'fi', 'wonder',
  'you', 'are', 'how', 'little', 'time', 'was', 'left', 'one', 'which', 'figure', 'shows', 'it', 'done',
  'head', 'lead', 'read', 'here', 'arti', 'acts', 'artifacts', 'image', 'ore', 'be', 'all', 'befall', 'will',
  'right', 'so', 'befit', 'calculate', 'add', 'to'
])
const repair = createRepairer({ missingLetters: ['f'], isWord: (w) => WORDS.has(w) })
const fixed = (text: string) => repair(text).text

describe('repair: missing f and ligatures', () => {
  it.each([
    ['restores a missing f at the start of a word', 'eedback', 'feedback'],
    ['turns a lone "o" into "of" (shortest insertion wins over "off")', 'editions o this book', 'editions of this book'],
    ['restores "fi" across the gap PDF.js left', 'speci c', 'specific'],
    ['restores "fi" inside a word', 'certi cation', 'certification'],
    ['restores "ff" across a gap', 'somatic e ects', 'somatic effects'],
    ['restores "ffi" across a gap', 'Clostridium di cile', 'Clostridium difficile'],
    ['restores "ft" across a gap', 'a er completion', 'after completion'],
    ['joins when the left part is a real word ("pro")', 'pro essor', 'professor'],
    ['prefers joining ("o ten" -> "often") over two separate fixes', 'o ten', 'often'],
    ['restores the "Th" ligature ("T e" -> "The")', 'T e radial pulse', 'The radial pulse'],
    ['restores "There" and "These"', 'T ere are T ese', 'There are These'],
    ['restores "fi" at the start ("ve" -> "five")', 'T e ve most easily', 'The five most easily'],
    ['restores a leading "Th"', 'orax', 'Thorax'],
    ['restores a leading capital T', 'Radiologic echnologist', 'Radiologic Technologist'],
    ['keeps punctuation and spacing', 'Super cial arteries, o course.', 'Superficial arteries, of course.'],
    ['turns a lone "i" into "if" (not "fi", which is also a word)', 'wonder i you are', 'wonder if you are'],
    ['restores "ft" that came out as a bare "f"', 'how little time was lef.', 'how little time was left.'],
    ['restores a lost first letter when only one letter fits', 'the one hich is used', 'the one which is used'],
    ['capitalizes a restored first letter at a sentence start', 'Done. igure 3 shows it.', 'Done. Figure 3 shows it.'],
    ['joins two real words that are halves of one long word', 'image arti acts and be ore', 'image artifacts and before']
  ])('%s', (_name, input, expected) => {
    expect(fixed(input)).toBe(expected)
  })
})

describe('repair: leaves good text alone', () => {
  it.each([
    ['known words', 'the patient is used for this'],
    ['acronyms in capitals', 'MRSA and PACS'],
    ['unknown words that no insertion can fix', 'kilovoltage and Saia'],
    ['short fragments are not given a leading T', 'rial'],
    ['answer-option letters ("fib" is a word, but "(B)" must stay)', '(B) Deep arteries (D) Deep veins'],
    ['a lost first letter that several letters could fill', 'the ead is here'],
    ['two function words side by side ("be all" is not "befall")', 'it will be all right'],
    ['two real words whose join would be short ("be it" is not "befit")', 'so be it'],
    ['a lone "o" at a sentence start (could be "To" or "Of")', 'Done. o calculate it, add.'],
    ['abbreviations with single letters', 'add it (i.e., e.g. this) to the book'],
    ['text without letters', '1, 2, and 3 (A)']
  ])('%s', (_name, input) => {
    expect(fixed(input)).toBe(input)
  })

  it('capitalizes a restored first letter when told the text starts a sentence', () => {
    expect(repair('igure 3 shows it.', { startsSentence: true }).text).toBe('Figure 3 shows it.')
    expect(repair('igure 3 shows it.').text).toBe('figure 3 shows it.')
  })

  it('leaves a word broken when two repairs are equally likely ("le": file or left)', () => {
    expect(fixed('time was le')).toBe('time was le')
  })

  it('breaks the tie with how often each word appears intact in the document', () => {
    const withFrequency = createRepairer({
      missingLetters: ['f'],
      isWord: (w) => WORDS.has(w),
      frequency: (w) => ({ left: 13, file: 1 })[w] ?? 0
    })
    expect(withFrequency('time was le').text).toBe('time was left')
  })

  it('does not break a tie on weak evidence (2 vs 0)', () => {
    const weak = createRepairer({
      missingLetters: ['f'],
      isWord: (w) => WORDS.has(w),
      frequency: (w) => ({ file: 2 })[w] ?? 0
    })
    expect(weak('time was le').text).toBe('time was le')
  })

  it('counts the repairs it makes', () => {
    expect(repair('o eedback').repairs).toBe(2)
  })

  it('does nothing when no letters are missing', () => {
    const none = createRepairer({ missingLetters: [], isWord: (w) => WORDS.has(w) })
    expect(none('o eedback')).toEqual({ text: 'o eedback', repairs: 0 })
  })
})
