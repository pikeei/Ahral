/**
 * Detects letters that are systematically missing from a PDF's text layer.
 *
 * Some PDFs (often produced by conversion tools) draw certain glyphs with a
 * font whose character map is broken, so a letter such as "f" is visible on
 * the page but absent from the extracted text ("of" becomes "o"). Comparing
 * letter frequencies with typical English catches this without a dictionary.
 */

/** Approximate share (%) of each common letter in English text. */
const ENGLISH_FREQUENCY: Record<string, number> = {
  e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7.0, n: 6.7, s: 6.3, h: 6.1, r: 6.0, d: 4.3,
  l: 4.0, c: 2.8, u: 2.8, m: 2.4, w: 2.4, f: 2.2, g: 2.0, y: 2.0, p: 1.9
}

/** Below this many letters, frequencies are too noisy to judge. */
const MIN_LETTERS = 2000
/**
 * Flag a letter found at less than this fraction of its usual frequency.
 * Real text varies (medical text has few "w"s, about 0.4×), but a broken
 * character map drops a letter almost entirely (under 0.1×).
 */
const MISSING_RATIO = 0.25

export interface MissingLetter {
  letter: string
  /** Observed frequency divided by the expected English frequency. */
  ratio: number
}

export function detectMissingLetters(text: string): MissingLetter[] {
  const counts = new Map<string, number>()
  let total = 0
  for (const ch of text.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') {
      counts.set(ch, (counts.get(ch) ?? 0) + 1)
      total++
    }
  }
  if (total < MIN_LETTERS) return []

  const missing: MissingLetter[] = []
  for (const [letter, expectedPercent] of Object.entries(ENGLISH_FREQUENCY)) {
    const observedPercent = (100 * (counts.get(letter) ?? 0)) / total
    const ratio = observedPercent / expectedPercent
    if (ratio < MISSING_RATIO) missing.push({ letter, ratio: Math.round(ratio * 100) / 100 })
  }
  return missing
}
