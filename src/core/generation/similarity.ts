import { STOPWORDS } from '../analysis/nlp'

/** Lowercase content words, with a crude plural fold, for overlap measures. */
export function contentWords(text: string): Set<string> {
  const words = new Set<string>()
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (word.length <= 2 || STOPWORDS.has(word)) continue
    words.add(word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)
  }
  return words
}

/** Share of words two texts have in common: |A ∩ B| / |A ∪ B|, from 0 (none) to 1 (same). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * Whole-word search that also matches a simple plural ("defect" finds "defects").
 * Case-insensitive, except for acronyms: "CR" must not match the "cr" in other text.
 */
export function termPattern(variants: string[]): RegExp {
  const clean = [...new Set(variants.map((v) => v.trim()).filter((v) => v !== ''))]
  const acronym = clean.length > 0 && clean.every((v) => /^[\p{Lu}\d&]{2,}s?$/u.test(v))
  const alternatives = clean
    .sort((a, b) => b.length - a.length)
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?:e?s)?(?![\\p{L}\\p{N}])`, acronym ? 'gu' : 'giu')
}
