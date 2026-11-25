/*
 * Decides which sentences are good material for questions.
 *
 * A question is only as good as its sentence: it must make sense on its own,
 * without the paragraph around it. Each rule rejects a specific failure and
 * reports why, so the CLI can show what the filter removed.
 */

export type SentenceRejection =
  | 'too-short'
  | 'too-long'
  | 'question'
  | 'not-a-statement'
  | 'refers-elsewhere'
  | 'mentions-figure'
  | 'mostly-symbols'
  | 'all-caps'
  | 'unrecognized-words'

export type SentenceCheck = { ok: true; text: string } | { ok: false; reason: SentenceRejection }

export interface SentenceFilterOptions {
  /** Dictionary lookup (lowercase). When given, sentences with unrecognized words are rejected. */
  isWord?: (word: string) => boolean
  /** Words that are fine even if not in the dictionary: the document's own key terms ("kilovoltage"). */
  allowedWords?: Set<string>
}

export const MIN_WORDS = 8
export const MAX_WORDS = 40

/** "(A) Superficial arteries are ..." in answer explanations: the label isn't part of the statement. */
const OPTION_LABEL = /^\(?[A-Ea-e]\)\s+/
/** First words that point to something outside the sentence, so it can't stand alone. */
const REFERS_ELSEWHERE = new Set([
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'we', 'you',
  'however', 'therefore', 'thus', 'hence', 'also', 'such', 'another', 'both', 'then', 'here', 'there', 'so', 'but',
  'and', 'or', 'because', 'which', 'otherwise', 'instead', 'likewise', 'similarly', 'consequently', 'furthermore',
  'moreover', 'additionally'
])
const MENTIONS_FIGURE = /\b(figure|fig\.|table|above|below|following|shown|illustrated)\b/i
/**
 * Two-letter words used in ordinary prose. Large word lists also contain rare
 * two-letter entries ("le", "ve", "di") that are usually fragments of broken words.
 */
const TWO_LETTER_WORDS = new Set([
  'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of',
  'oh', 'ok', 'on', 'or', 'ox', 'so', 'to', 'up', 'us', 'we'
])

export function checkSentence(raw: string, options: SentenceFilterOptions = {}): SentenceCheck {
  const text = raw.replace(OPTION_LABEL, '').trim()
  const words = text.split(/\s+/)

  if (/\?["'”’)]*$/.test(text)) return { ok: false, reason: 'question' }
  // Must end like a statement; list items and headings without a period are fragments.
  if (!/[.!]["'”’)\]]*$/.test(text)) return { ok: false, reason: 'not-a-statement' }
  if (words.length < MIN_WORDS) return { ok: false, reason: 'too-short' }
  if (words.length > MAX_WORDS) return { ok: false, reason: 'too-long' }

  const visible = text.replace(/\s/g, '')
  const letters = (visible.match(/\p{L}/gu) ?? []).length
  if (letters / visible.length < 0.7) return { ok: false, reason: 'mostly-symbols' }
  if (text === text.toUpperCase()) return { ok: false, reason: 'all-caps' }

  const first = (words[0] ?? '').toLowerCase().replace(/[^\p{L}]/gu, '')
  if (REFERS_ELSEWHERE.has(first)) return { ok: false, reason: 'refers-elsewhere' }
  if (MENTIONS_FIGURE.test(text)) return { ok: false, reason: 'mentions-figure' }

  if (options.isWord && hasUnrecognizedWord(text, options.isWord, options.allowedWords)) {
    return { ok: false, reason: 'unrecognized-words' }
  }
  return { ok: true, text }
}

/**
 * Checks lowercase words, plus the first word (capitalized only because it
 * starts the sentence). Other capitalized words are skipped: they are often
 * names and acronyms the dictionary doesn't list, while broken words ("rom",
 * "le", "Unction" at a sentence start) are lowercase or sentence-initial.
 * A lone "o" or "i" is never a real word in prose; it's a remnant of "of"/"if"/"To".
 */
function hasUnrecognizedWord(text: string, isWord: (w: string) => boolean, allowed: Set<string> | undefined): boolean {
  const known = (w: string) => (w.length === 2 ? TWO_LETTER_WORDS.has(w) : isWord(w)) || (allowed?.has(w) ?? false)
  if (/(?<![\p{L}\p{N}'.-])[oi](?![\p{L}\p{N}'.-])/u.test(text)) return true
  // "T ere", "T e": a capital T cut off from the rest of its word by a lost "h".
  if (/(?<![\p{L}\p{N}-])T \p{Ll}/u.test(text)) return true

  const first = /^["'“‘(]*(\p{Lu}\p{Ll}+)(?![\p{L}\p{N}-])/u.exec(text)?.[1]
  if (first && !known(first.toLowerCase())) return true

  for (const word of text.match(/(?<![\p{L}\p{N}])\p{Ll}{2,}(?![\p{L}\p{N}])/gu) ?? []) {
    if (!known(word)) return true
  }
  return false
}
