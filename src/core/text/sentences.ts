/**
 * Rule-based sentence splitter.
 *
 * A boundary is sentence-ending punctuation, optional closing quotes or
 * brackets, whitespace, and then something that can start a sentence
 * (a capital letter, digit, quote or bracket). A period is NOT a boundary
 * after a known abbreviation ("e.g.", "Dr."), an initial ("J. Smith"),
 * a dotted acronym ("U.S."), or a reference word followed by a number ("Fig. 3").
 *
 * Known trade-off: an abbreviation at the very end of a sentence
 * ("... in the U.S. The next ...") is not split. That costs one merged
 * sentence; the opposite mistake would cut sentences in half far more often.
 */

/** Abbreviations that never end a sentence. Stored lowercase, without the final period. */
const ALWAYS_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs',
  'e.g', 'i.e', 'cf', 'al', 'approx', 'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'viz', 'resp'
])

/** Abbreviations that only stay attached when a number follows ("Fig. 3", "p. 45", "Jan. 5"). */
const NUMBER_ABBREVIATIONS = new Set([
  'fig', 'figs', 'eq', 'eqs', 'no', 'nos', 'p', 'pp', 'vol', 'ch', 'chap', 'sec', 'ref', 'art', 'tab',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
])

const BOUNDARY = /([.!?]+)(["'”’)\]]*)(\s+)/g
const SENTENCE_START = /[\p{Lu}\p{N}"'“‘([]/u

export interface SentenceSpan {
  text: string
  /** Offset of the first character of `text` in the input. */
  start: number
}

export function splitSentences(text: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = []
  let start = 0

  for (const match of text.matchAll(BOUNDARY)) {
    const [, punctuation = '', closers = '', space = ''] = match
    const punctuationIndex = match.index
    const end = punctuationIndex + punctuation.length + closers.length
    const nextStart = end + space.length
    const next = text[nextStart]

    if (next === undefined || !SENTENCE_START.test(next)) continue
    if (punctuation === '.' && endsWithAbbreviation(text.slice(start, punctuationIndex), next)) continue

    pushTrimmed(sentences, text.slice(start, end), start)
    start = nextStart
  }

  pushTrimmed(sentences, text.slice(start), start)
  return sentences
}

function endsWithAbbreviation(before: string, nextChar: string): boolean {
  const word = (/(\S+)$/.exec(before)?.[1] ?? '').replace(/^["'“‘([]+/, '')
  const lower = word.toLowerCase()

  if (ALWAYS_ABBREVIATIONS.has(lower)) return true
  if (/^\p{Lu}$/u.test(word)) return true // initial, e.g. "J. Smith"
  if (/^(\p{L}\.)+\p{L}$/u.test(word)) return true // dotted acronym, e.g. "U.S", "Ph.D"
  if (NUMBER_ABBREVIATIONS.has(lower) && /\d/.test(nextChar)) return true
  return false
}

function pushTrimmed(out: SentenceSpan[], raw: string, rawStart: number): void {
  const text = raw.trim()
  if (text === '') return
  const leading = raw.length - raw.trimStart().length
  out.push({ text, start: rawStart + leading })
}
