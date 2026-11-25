import type { Block, Sentence } from '../pdf/layout'
import type { Alias, Definition } from './definitions'
import { phraseKey, STOPWORDS, tokenize, type Token } from './nlp'

/*
 * Key-term extraction.
 *
 * 1. Index every 1–4 word phrase in the document, by its base-form key, with
 *    where it occurs (sentences, sections) and how it is usually written.
 * 2. Collect candidates from five sources: defined terms, bold text, acronyms,
 *    and noun phrases (adjective* noun+, found with the POS tagger).
 * 3. Score = TF-IDF across sections + bonuses for the stronger sources.
 *
 * TF-IDF treats each section as a "document": a phrase used often in one
 * section but rarely in others is characteristic of that section. A phrase
 * spread evenly everywhere ("software") gets a lower weight.
 */

export type TermSource = 'definition' | 'bold' | 'acronym' | 'heading' | 'noun-phrase'

export interface Term {
  /** Base-form key used for matching ("test plan"). */
  key: string
  /** Most common spelling in the document ("Test plan"). */
  text: string
  score: number
  /** Occurrences in body sentences. */
  frequency: number
  sectionIds: number[]
  sentenceIds: number[]
  sources: TermSource[]
  /** Other names for the same term (acronym ↔ long form). */
  alternatives: string[]
}

export const SCORE_BONUS: Record<TermSource, number> = {
  definition: 3,
  bold: 2,
  acronym: 1,
  heading: 1,
  'noun-phrase': 0
}

const MAX_PHRASE_WORDS = 4
/** A noun phrase found by the tagger alone must occur at least this often to count as a term. */
const MIN_FREQUENCY_FOR_NOUN_PHRASE = 2

/** Nouns too vague to be quiz answers on their own (they're fine inside phrases). */
const GENERIC_NOUNS = new Set([
  'thing', 'things', 'way', 'ways', 'example', 'part', 'use', 'type', 'kind', 'number', 'lot', 'time', 'something',
  'one', 'people', 'person', 'case', 'fact', 'point', 'level', 'set', 'step', 'area', 'order', 'form', 'side', 'end',
  'chapter', 'section', 'page', 'figure', 'table', 'item', 'list', 'value', 'result', 'information', 'data'
])

interface Occurrences {
  count: number
  sentenceIds: Set<number>
  sectionIds: Set<number>
  spellings: Map<string, number>
}

interface Candidate {
  key: string
  sources: Set<TermSource>
  /** Spelling to fall back on when the phrase isn't found in body text. */
  text: string
}

export function extractTerms(
  sentences: Sentence[],
  blocks: Block[],
  definitions: Definition[],
  aliases: Alias[]
): Term[] {
  const tokenized = sentences.map((sentence) => ({ sentence, tokens: tokenize(sentence.text) }))
  const index = buildPhraseIndex(tokenized)
  const sectionCount = new Set(sentences.map((s) => s.sectionId)).size

  const candidates = new Map<string, Candidate>()
  const add = (text: string, source: TermSource, key = phraseKey(text)) => {
    if (key === '') return
    const existing = candidates.get(key)
    if (existing) existing.sources.add(source)
    else candidates.set(key, { key, text, sources: new Set([source]) })
  }

  for (const d of definitions) add(d.term, 'definition')
  for (const run of boldTerms(blocks)) add(run, 'bold')
  for (const alias of aliases) add(alias.short, 'acronym')
  for (const { tokens } of tokenized) {
    for (const token of tokens) if (isAcronym(token)) add(token.text, 'acronym', token.key)
    for (const phrase of nounPhrases(tokens)) add(phrase.text, 'noun-phrase', phrase.key)
  }

  const headingKeys = new Set(
    blocks.filter((b) => b.kind === 'heading').flatMap((b) => phraseKeysOf(tokenize(b.text)))
  )
  const aliasByKey = aliasLookup(aliases)

  const terms: Term[] = []
  for (const candidate of candidates.values()) {
    const occurrences = index.get(candidate.key)
    const frequency = occurrences?.count ?? 0
    const onlyNounPhrase = candidate.sources.size === 1 && candidate.sources.has('noun-phrase')
    if (onlyNounPhrase && frequency < MIN_FREQUENCY_FOR_NOUN_PHRASE) continue
    if (!candidate.key.includes(' ') && GENERIC_NOUNS.has(candidate.key) && onlyNounPhrase) continue

    if (headingKeys.has(candidate.key)) candidate.sources.add('heading')
    const sectionIds = [...(occurrences?.sectionIds ?? [])]
    const sources = [...candidate.sources].sort((a, b) => SCORE_BONUS[b] - SCORE_BONUS[a])

    terms.push({
      key: candidate.key,
      text: occurrences ? mostCommon(occurrences.spellings) : candidate.text,
      score: round(scoreTerm(frequency, sectionIds.length, sectionCount, candidate.key, sources)),
      frequency,
      sectionIds,
      sentenceIds: [...(occurrences?.sentenceIds ?? [])],
      sources,
      alternatives: aliasByKey.get(candidate.key) ?? []
    })
  }

  return dropSubsumed(terms).sort((a, b) => b.score - a.score || b.frequency - a.frequency || a.key.localeCompare(b.key))
}

/** Sources strong enough that a term is kept even if it mostly appears inside longer terms. */
const STRONG_SOURCES: TermSource[] = ['definition', 'bold', 'acronym']

/**
 * Drops a shorter term when nearly all its uses are inside longer terms:
 * "plan" is dropped if it only ever appears as part of "test plan".
 * "testing" survives because it also appears on its own many times.
 */
export function dropSubsumed(terms: Term[]): Term[] {
  return terms.filter((term) => {
    if (term.sources.some((s) => STRONG_SOURCES.includes(s))) return true
    const insideLonger = terms
      .filter((other) => other.key !== term.key && ` ${other.key} `.includes(` ${term.key} `))
      .reduce((sum, other) => sum + other.frequency, 0)
    return term.frequency - insideLonger >= MIN_FREQUENCY_FOR_NOUN_PHRASE
  })
}

/**
 * log(1 + tf) dampens raw counts so a term used 40 times doesn't drown out
 * one used 5 times; smoothed IDF never reaches zero, so single-section
 * documents still rank by frequency.
 */
export function scoreTerm(
  frequency: number,
  sectionsWithTerm: number,
  totalSections: number,
  key: string,
  sources: TermSource[]
): number {
  const idf = Math.log((totalSections + 1) / (sectionsWithTerm + 1)) + 1
  const tfidf = Math.log1p(frequency) * idf
  const bonus = sources.reduce((sum, s) => sum + SCORE_BONUS[s], 0)
  const phraseBonus = 0.5 * (key.split(' ').length - 1) // multi-word phrases are more specific
  return tfidf + bonus + phraseBonus
}

// ── Phrase index ────────────────────────────────────────────────────────────
function buildPhraseIndex(tokenized: { sentence: Sentence; tokens: Token[] }[]): Map<string, Occurrences> {
  const index = new Map<string, Occurrences>()
  for (const { sentence, tokens } of tokenized) {
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= MAX_PHRASE_WORDS && i + n <= tokens.length; n++) {
        const phrase = tokens.slice(i, i + n)
        // Don't let a phrase run across a comma, bracket or dash.
        if (phrase.slice(0, -1).some((t) => t.breaksAfter)) break
        const key = phrase.map((t) => t.key).join(' ')
        const spelling = sentence.text.slice(phrase[0]!.start, phrase[phrase.length - 1]!.end)

        let entry = index.get(key)
        if (!entry) {
          entry = { count: 0, sentenceIds: new Set(), sectionIds: new Set(), spellings: new Map() }
          index.set(key, entry)
        }
        entry.count++
        entry.sentenceIds.add(sentence.id)
        entry.sectionIds.add(sentence.sectionId)
        entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1)
      }
    }
  }
  return index
}

function phraseKeysOf(tokens: Token[]): string[] {
  const keys: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= MAX_PHRASE_WORDS && i + n <= tokens.length; n++) {
      keys.push(
        tokens
          .slice(i, i + n)
          .map((t) => t.key)
          .join(' ')
      )
    }
  }
  return keys
}

// ── Candidate sources ───────────────────────────────────────────────────────
const isNoun = (t: Token) => (t.tags.has('Noun') || t.tags.has('Acronym')) && !t.tags.has('Pronoun')
const isModifier = (t: Token) => t.tags.has('Adjective') || isNoun(t)

function isContentToken(t: Token): boolean {
  if (STOPWORDS.has(t.key) || !/\p{L}{2}/u.test(t.text)) return false
  if (t.tags.has('Determiner') || t.tags.has('Pronoun') || t.tags.has('Value') || t.tags.has('Adverb')) return false
  if (t.tags.has('Verb') && !t.tags.has('Gerund') && !isNoun(t)) return false
  return isModifier(t)
}

/**
 * Noun phrases as "adjective* noun+" chunks, up to 3 words, ending in a noun.
 * From "an open-source framework used to automate web browsers" this yields
 * "framework", "source framework", "open-source framework", "browser", "web browser".
 */
export function nounPhrases(tokens: Token[]): { key: string; text: string }[] {
  const phrases: { key: string; text: string }[] = []
  let chunk: Token[] = []

  const flush = () => {
    for (let end = 0; end < chunk.length; end++) {
      if (!isNoun(chunk[end]!)) continue
      for (let start = Math.max(0, end - 2); start <= end; start++) {
        const words = chunk.slice(start, end + 1)
        phrases.push({ key: words.map((t) => t.key).join(' '), text: words.map((t) => t.text).join(' ') })
      }
    }
    chunk = []
  }

  for (const token of tokens) {
    if (isContentToken(token)) {
      chunk.push(token)
      if (token.breaksAfter) flush()
    } else {
      flush()
    }
  }
  flush()
  return phrases
}

function isAcronym(token: Token): boolean {
  return /^[\p{Lu}][\p{Lu}\d&]{1,7}s?$/u.test(token.text) && !/^[IVXLCDM]+$/.test(token.text)
}

/** Short bold fragments from body text. Bold sentences or headings are not terms. */
function boldTerms(blocks: Block[]): string[] {
  return blocks
    .filter((b) => b.kind !== 'heading')
    .flatMap((b) => b.boldRuns)
    .map((run) => run.replace(/[\s:,;\-–—]+$/, '').trim())
    .filter((run) => {
      const words = run.split(/\s+/)
      return words.length <= 5 && /\p{L}/u.test(run) && !/[.!?]$/.test(run) && !words.every((w) => STOPWORDS.has(w.toLowerCase()))
    })
}

function aliasLookup(aliases: Alias[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const { long, short } of aliases) {
    map.set(phraseKey(short), [...(map.get(phraseKey(short)) ?? []), long])
    map.set(phraseKey(long), [...(map.get(phraseKey(long)) ?? []), short])
  }
  return map
}

function mostCommon(counts: Map<string, number>): string {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ''
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
