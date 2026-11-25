/**
 * Repairs words broken by letters missing from a PDF's text layer.
 *
 * When a PDF's font has no character mapping for "f" and the f-ligatures
 * (fi, fl, ff, ffi, ffl, ft) or the "Th" ligature, those glyphs vanish from
 * the extracted text: "of" -> "o", "feedback" -> "eedback",
 * "specific" -> "speci c" (PDF.js leaves a space where the glyph was),
 * "The" -> "T e".
 *
 * The repair is deterministic and conservative. A word is only changed if it
 * is NOT a known word and inserting one missing sequence produces exactly
 * the kind of known word described below. Unknown words that can't be
 * repaired (rare medical terms, names) are left as they are.
 *
 * Order of attempts for each unknown word:
 *   1. Join with the next word across the gap: "speci" + "fi" + "c" -> "specific".
 *   2. Insert inside the word: "eedback" -> "feedback", "o" -> "of".
 * Among several matches, the shortest insertion wins ("o" -> "of", not "off").
 */

export interface RepairOptions {
  /** Letters detected as missing, e.g. ["f"]. */
  missingLetters: string[]
  /** Returns true for known words (lowercase input). Known words are never changed. */
  isWord: (word: string) => boolean
  /**
   * How often a word appears intact in the document (lowercase input). Breaks ties
   * when several repairs give real words: "le" could be "file" or "left".
   */
  frequency?: (word: string) => number
}

export interface RepairResult {
  text: string
  repairs: number
}

/** Ligatures that start with "f": fonts that lose "f" usually lose these too. */
const F_LIGATURES = ['fi', 'fl', 'ff', 'ft', 'ffi', 'ffl']
/** Prefixing "T" to short fragments matches too many unrelated words, so only longer ones qualify. */
const MIN_LENGTH_FOR_LEADING_T = 4
/** Shortest fragment that may get a lost first letter back ("hich" -> "which"). */
const MIN_LENGTH_FOR_INITIAL = 3
const SINGLE_LETTER_REPAIRS: Record<string, string> = { o: 'of', i: 'if' }

export type Repairer = (text: string, context?: { startsSentence?: boolean }) => RepairResult

export function createRepairer(options: RepairOptions): Repairer {
  const inserts = buildInserts(options.missingLetters)
  // A font that lost its f-ligatures has usually lost the "Th" ligature too ("T e" for "The").
  const brokenLigatures = options.missingLetters.includes('f')
  const isKnown = (word: string) => isKnownWord(word, options.isWord)
  // Every check below asks "would this repair produce a real word?"
  const isTarget = (word: string) => options.isWord(word)

  const repairWord = (word: string, sentenceStart: boolean): string | undefined => {
    // A lone letter is a fixed case: "o" -> "of", "i" -> "if" (never "fi", which is also a word).
    if (word.length === 1) return brokenLigatures ? SINGLE_LETTER_REPAIRS[word] : undefined

    const lower = word.toLowerCase()
    const candidates: Candidate[] = []
    for (const insert of inserts) {
      for (let at = 0; at <= lower.length; at++) {
        if (isTarget(lower.slice(0, at) + insert + lower.slice(at))) {
          candidates.push({ text: word.slice(0, at) + insert + word.slice(at), cost: insert.length })
        }
      }
    }
    if (candidates.length > 0) return pickCandidate(candidates, options.frequency)
    if (!brokenLigatures) return undefined

    // "lef" -> "left": an "ft" ligature that came out as a bare "f".
    for (let at = lower.indexOf('f'); at >= 0; at = lower.indexOf('f', at + 1)) {
      if (isTarget(lower.slice(0, at + 1) + 't' + lower.slice(at + 1))) {
        return word.slice(0, at + 1) + 't' + word.slice(at + 1)
      }
    }
    if (word.length >= MIN_LENGTH_FOR_LEADING_T) {
      // "orax" -> "Thorax", "echnologist" -> "Technologist": a capital T or Th was lost at the start.
      for (const lead of ['Th', 'T']) {
        if (isTarget((lead + lower).toLowerCase())) return lead + word
      }
    }
    if (word.length >= MIN_LENGTH_FOR_INITIAL && word === lower) {
      // "hich" -> "which", "igure" -> "Figure": a first letter was lost. Only when exactly one
      // letter makes a known word ("ead" could be head, lead, read... so it is left alone).
      const fits = [...'abcdefghijklmnopqrstuvwxyz'].filter((letter) => isTarget(letter + lower))
      if (fits.length === 1) {
        const letter = sentenceStart ? fits[0]!.toUpperCase() : fits[0]!
        return letter + word
      }
    }
    return undefined
  }

  const joinWords = (left: string, right: string): string | undefined => {
    const joinInserts = brokenLigatures && left === 'T' ? ['h', ...inserts] : inserts
    const candidates: Candidate[] = joinInserts
      .map((insert) => ({ text: left + insert + right, cost: insert.length }))
      .filter((c) => isTarget(c.text.toLowerCase()))
    return candidates.length > 0 ? pickCandidate(candidates, options.frequency) : undefined
  }

  return (text, context = {}) => {
    if (inserts.length === 0) return { text, repairs: 0 }
    const startsSentence = context.startsSentence ?? false
    // Split into words and the text between them, keeping everything so it can be rebuilt exactly.
    const pieces = text.match(/\p{L}+|[^\p{L}]+/gu) ?? []
    const out: string[] = []
    let repairs = 0

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!
      if (!isWordPiece(piece)) {
        out.push(piece)
        continue
      }

      const gap = pieces[i + 1]
      const next = pieces[i + 2]
      if (gap === ' ' && next && isWordPiece(next) && (!isKnown(piece) || !isKnown(next))) {
        const joined = joinWords(piece, next)
        if (joined) {
          out.push(joined)
          repairs++
          i += 2
          continue
        }
      }

      if (!isKnown(piece) && isRepairable(piece)) {
        const sentenceStart = isSentenceStart(out, startsSentence)
        const fixed = repairWord(piece, sentenceStart)
        if (fixed) {
          // Letters restored in front of a word at a sentence start are capitalized ("igure" -> "Figure").
          const restoredInFront = !fixed.endsWith(piece) ? false : fixed.length > piece.length
          out.push(sentenceStart && restoredInFront ? fixed[0]!.toUpperCase() + fixed.slice(1) : fixed)
          repairs++
          continue
        }
      }
      out.push(piece)
    }
    return { text: out.join(''), repairs }
  }
}

interface Candidate {
  text: string
  /** Number of inserted letters. */
  cost: number
}

/**
 * Chooses between repairs that all give real words, or none if it's a coin toss:
 * 1. only one distinct word -> it;
 * 2. otherwise the fewest inserted letters, if that leaves one word;
 * 3. otherwise the word that appears intact most often in this document, if it clearly leads.
 * Leaving a word broken is better than silently swapping in the wrong word.
 */
function pickCandidate(candidates: Candidate[], frequency: ((word: string) => number) | undefined): string | undefined {
  const distinct = [...new Map(candidates.map((c) => [c.text.toLowerCase(), c])).values()]
  if (distinct.length === 1) return distinct[0]!.text

  const minCost = Math.min(...distinct.map((c) => c.cost))
  const cheapest = distinct.filter((c) => c.cost === minCost)
  if (cheapest.length === 1) return cheapest[0]!.text

  if (!frequency) return undefined
  const ranked = cheapest
    .map((c) => ({ text: c.text, count: frequency(c.text.toLowerCase()) }))
    .sort((a, b) => b.count - a.count)
  const [first, second] = ranked
  // In a damaged document the competing words are the ones least likely to appear intact,
  // so counts are tiny. Act only on a clear lead, not on 2 vs 0.
  const clearLead = first && second && first.count >= MIN_TIEBREAK_COUNT && first.count >= 2 * second.count
  return clearLead ? first.text : undefined
}

/** Fewest intact occurrences for a word to win a tie on document frequency. */
const MIN_TIEBREAK_COUNT = 3

function buildInserts(missingLetters: string[]): string[] {
  const inserts: string[] = []
  for (const letter of missingLetters) {
    inserts.push(letter)
    if (letter === 'f') inserts.push(...F_LIGATURES)
    else inserts.push(letter + letter)
  }
  // Shortest first, so "o" becomes "of" rather than "off".
  return [...new Set(inserts)].sort((a, b) => a.length - b.length)
}

/** True right after sentence-ending punctuation, or at the very start if the caller says the text starts a sentence. */
function isSentenceStart(previous: string[], textStartsSentence: boolean): boolean {
  const before = previous.join('').trimEnd()
  return before === '' ? textStartsSentence : /[.!?:]["'”’)]*$/.test(before)
}

/**
 * Single letters are labels ("(B)", "J. Smith"), not broken words, with two
 * exceptions: a lone "o" or "i" is almost always "of" or "if" with the f lost.
 */
function isRepairable(word: string): boolean {
  return word.length > 1 || word === 'o' || word === 'i'
}

function isWordPiece(piece: string): boolean {
  return /^\p{L}+$/u.test(piece)
}

function isKnownWord(word: string, isWord: (w: string) => boolean): boolean {
  if (word.length === 1) return /^[aAI]$/.test(word)
  // ALL-CAPS tokens are acronyms or headings (MRSA, PACS): never "repair" them.
  if (word === word.toUpperCase()) return true
  return isWord(word.toLowerCase())
}
