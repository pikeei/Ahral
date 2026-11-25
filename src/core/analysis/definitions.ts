import type { Block, Sentence } from '../pdf/layout'
import { STOPWORDS, tokenize, type Token } from './nlp'

/*
 * Definition detection with ordered regex patterns.
 *
 * Each pattern captures a TERM and its DEFINITION from one sentence and has a
 * confidence that reflects how often that wording really is a definition.
 * "X refers to Y" almost always is; "X is a Y" often is, but also matches
 * statements like "Testing is a good habit", so it scores lower.
 * Candidates then pass validation rules that reject vague subjects
 * ("This approach is a ...") and verb phrases posing as terms.
 *
 * Non-ASCII characters are written as \u escapes so the source survives any
 * editor or shell encoding. – = en dash, — = em dash.
 */

export interface Definition {
  term: string
  definition: string
  sentenceId: number
  page: number
  sectionId: number
  pattern: DefinitionPattern
  confidence: number
}

export type DefinitionPattern = 'defined-as' | 'refers-to' | 'glossary' | 'called' | 'is-a' | 'bold-lead'

export interface Alias {
  /** "Application Programming Interface" */
  long: string
  /** "API" */
  short: string
  sentenceId: number
}

const TERM = String.raw`((?:[\p{L}\p{N}][\p{L}\p{N}'.+#/-]*)(?:\s+[\p{L}\p{N}][\p{L}\p{N}'.+#/-]*){0,4})`
const ARTICLE = String.raw`(?:(?:the|a|an)\s+)?`
/**
 * " - " or " – " (spaces required), an em dash (spaces optional), or a colon.
 * A hyphen or en dash without spaces joins words or ranges ("open-source", "Swan–Ganz", "10–100").
 */
const SEPARATOR = String.raw`\s*(?:\s[-–]\s|—|:)\s*`
/** Answer-option label at the start of a sentence: "(D) The pathway by which ...". */
const OPTION_LABEL = /^\(?[A-Ea-e]\)\s+/

interface Rule {
  pattern: DefinitionPattern
  confidence: number
  regex: RegExp
  /** Which capture group holds the term and which the definition. */
  term: number
  definition: number
}

// Order matters: the first rule that produces a valid definition wins.
// The "d" flag records where each group matched, used to locate the term.
const RULES: Rule[] = [
  {
    pattern: 'defined-as',
    confidence: 0.95,
    regex: new RegExp(String.raw`^${ARTICLE}${TERM}\s+(?:is|are)\s+(?:defined|described)\s+as\s+(.+)$`, 'diu'),
    term: 1,
    definition: 2
  },
  {
    pattern: 'refers-to',
    confidence: 0.95,
    regex: new RegExp(String.raw`^${ARTICLE}${TERM}\s+(?:refers to|means|denotes|stands for)\s+(.+)$`, 'diu'),
    term: 1,
    definition: 2
  },
  {
    // Glossary style: "Selenium - a browser automation framework", "Postman: an API tool".
    pattern: 'glossary',
    confidence: 0.9,
    regex: new RegExp(String.raw`^${TERM}${SEPARATOR}(.+)$`, 'du'),
    term: 1,
    definition: 2
  },
  {
    // Reverse form: "A flaw that causes a failure is called a defect."
    pattern: 'called',
    confidence: 0.85,
    regex: new RegExp(String.raw`^(.+?)\s+(?:is|are)\s+(?:called|known as|termed)\s+${ARTICLE}${TERM}$`, 'diu'),
    term: 2,
    definition: 1
  },
  {
    pattern: 'is-a',
    confidence: 0.75,
    regex: new RegExp(String.raw`^${ARTICLE}${TERM}\s+(?:is|are)\s+((?:a|an|the|one of the)\s+.+)$`, 'diu'),
    term: 1,
    definition: 2
  }
]

const BOLD_LEAD_CONFIDENCE = 0.7
/** Added when the defined term is in bold: the author marked it as the key term. */
const BOLD_TERM_BONUS = 0.05

/** First words that mean the subject refers to something else (anaphora) or is not a term. */
const BAD_TERM_START = new Set([
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'there', 'here', 'such', 'each', 'every', 'another',
  'other', 'some', 'many', 'most', 'which', 'what', 'who', 'our', 'your', 'their', 'his', 'her', 'my', 'both',
  'all', 'one', 'first', 'second', 'next', 'last', 'following', 'above', 'below', 'example', 'note', 'however'
])
/** Words that show the "term" is really a clause: "Testing cannot prove that software". */
const CLAUSE_WORDS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'can', 'cannot', 'could', 'will', 'would', 'should', 'may', 'might',
  'must', 'do', 'does', 'did', 'has', 'have', 'had', 'that', 'which', 'who', 'when', 'where', 'if', 'because', 'not'
])
/** Heads too generic to quiz on: "The goal is a ...", "The result is a ...". */
const GENERIC_TERMS = new Set([
  'goal', 'result', 'purpose', 'idea', 'answer', 'reason', 'problem', 'solution', 'thing', 'way', 'aim', 'point',
  'difference', 'advantage', 'disadvantage', 'benefit', 'output', 'outcome', 'focus', 'key', 'main', 'rule'
])

/** A definition starting with these refers to something outside itself: "It is important to ...". */
const BAD_DEFINITION_START = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'there', 'he', 'she', 'we', 'you', 'i'])

const MIN_DEFINITION_WORDS = 3
const MAX_DEFINITION_WORDS = 50

export function detectDefinitions(sentences: Sentence[], blocks: Block[]): Definition[] {
  const blocksById = new Map(blocks.map((b) => [b.id, b]))
  const best = new Map<string, Definition>()

  for (const sentence of sentences) {
    const block = blocksById.get(sentence.blockId)
    const found = matchRules(sentence, block) ?? matchBoldLead(sentence, block)
    if (!found) continue

    // Keep one definition per term: the most confident, then the earliest.
    const key = found.term.toLowerCase()
    const existing = best.get(key)
    if (!existing || found.confidence > existing.confidence) best.set(key, found)
  }
  return [...best.values()].sort((a, b) => a.sentenceId - b.sentenceId)
}

function matchRules(sentence: Sentence, block: Block | undefined): Definition | undefined {
  const label = OPTION_LABEL.exec(sentence.text)?.[0] ?? ''
  const text = stripEnd(sentence.text.slice(label.length))
  for (const rule of RULES) {
    const match = rule.regex.exec(text)
    const rawTerm = match?.[rule.term]
    const term = cleanTerm(rawTerm)
    const definition = cleanDefinition(match?.[rule.definition])
    if (!match || !rawTerm || !term || !definition) continue
    if (!isValidTerm(term) || !isValidDefinition(definition, term)) continue

    const termStart = label.length + (match.indices?.[rule.term]?.[0] ?? 0) + rawTerm.indexOf(term)
    if (!isNounPhrase(sentence.text, termStart, termStart + term.length)) continue

    const bold = block?.boldRuns.some((b) => sameText(b, term)) ?? false
    const confidence = Math.min(1, rule.confidence + (bold ? BOLD_TERM_BONUS : 0))
    return { term, definition, ...origin(sentence), pattern: rule.pattern, confidence }
  }
  return undefined
}

/** "Selenium An open-source framework ...", where "Selenium" is bold and starts the block. */
function matchBoldLead(sentence: Sentence, block: Block | undefined): Definition | undefined {
  if (!block || block.kind === 'heading' || !block.text.startsWith(sentence.text.slice(0, 20))) return undefined
  const lead = block.boldRuns.find((run) => sentence.text.startsWith(run))
  if (!lead) return undefined

  const term = cleanTerm(lead)
  const definition = cleanDefinition(sentence.text.slice(lead.length).replace(/^\s*[-–—:,]?\s*/, ''))
  if (!term || !definition || !isValidTerm(term) || !isValidDefinition(definition, term)) return undefined
  if (!isNounPhrase(sentence.text, 0, term.length)) return undefined
  return { term, definition, ...origin(sentence), pattern: 'bold-lead', confidence: BOLD_LEAD_CONFIDENCE }
}

/** Finds "Long Form (ACR)" pairs where the acronym matches the initials of the long form. */
export function detectAliases(sentences: Sentence[]): Alias[] {
  const aliases = new Map<string, Alias>()
  const pattern = /((?:[\p{Lu}][\p{L}-]*\s+(?:(?:of|and|for|the|to|in)\s+)?){1,7})\(([\p{Lu}][\p{Lu}\d&]{1,7})s?\)/gu

  for (const sentence of sentences) {
    for (const match of sentence.text.matchAll(pattern)) {
      const short = match[2] ?? ''
      const words = (match[1] ?? '').trim().split(/\s+/)
      const long = takeLongForm(words, short)
      if (long && !aliases.has(short)) aliases.set(short, { long, short, sentenceId: sentence.id })
    }
  }
  return [...aliases.values()]
}

/** Takes as many trailing capitalized words as the acronym has letters, if the initials match. */
function takeLongForm(words: string[], acronym: string): string | undefined {
  const letters = acronym.replace(/[^\p{Lu}]/gu, '')
  const content = words.filter((w) => !/^(of|and|for|the|to|in)$/.test(w))
  if (content.length < letters.length) return undefined
  const tail = content.slice(-letters.length)
  const initials = tail.map((w) => w[0]?.toUpperCase()).join('')
  if (initials !== letters) return undefined
  // Rebuild from the first word of the tail, keeping small connector words ("Bill of Materials").
  const firstIndex = words.lastIndexOf(tail[0] ?? '')
  return words.slice(firstIndex).join(' ')
}

// --- Validation ---------------------------------------------------------------
export function isValidTerm(term: string): boolean {
  const words = term.toLowerCase().split(/\s+/)
  if (words.length > 5 || term.length > 60 || !/\p{L}/u.test(term)) return false
  // Commas, semicolons and brackets mean a list or a name with credentials ("Jane Doe, MS, RT(R)").
  if (/[,;()[\]]/.test(term)) return false
  if (BAD_TERM_START.has(words[0] ?? '')) return false
  if (words.some((w) => CLAUSE_WORDS.has(w))) return false
  if (words.every((w) => STOPWORDS.has(w))) return false
  if (words.length === 1 && GENERIC_TERMS.has(words[0] ?? '')) return false
  return true
}

/**
 * The term must look like a noun phrase to the tagger, either inside its
 * sentence or on its own. Each view fixes the other's mistakes: in context,
 * "A defect is ..." tags "defect" as a noun (alone it reads as a verb); alone,
 * "Smoke test" is noun + noun (before a dash, "test" reads as a verb).
 */
export function isNounPhrase(sentence: string, start: number, end: number): boolean {
  const inContext = tokenize(sentence).filter((t) => t.start >= start && t.end <= end)
  // People and places ("George Spahn", "New York") are nouns, but not study terms.
  if (inContext.length > 0 && inContext.every((t) => t.tags.has('Person') || t.tags.has('Place'))) return false
  return looksLikeNounPhrase(inContext) || looksLikeNounPhrase(tokenize(sentence.slice(start, end)))
}

const NON_NOUN_TAGS = ['Verb', 'Adjective', 'Adverb', 'Determiner', 'Preposition', 'Pronoun', 'Conjunction', 'Value']

/** Noun, acronym, or a word the tagger doesn't recognize as anything else (product names like "JMeter"). */
function isNounLike(tags: Set<string>): boolean {
  if (tags.has('Noun') || tags.has('Acronym') || tags.has('ProperNoun')) return true
  return !NON_NOUN_TAGS.some((tag) => tags.has(tag))
}

/**
 * - ends in a noun-like word: rejects "Common techniques include";
 * - no verb after the first word: rejects "Testers write tests";
 * - a base-form verb as the first word is allowed, because it usually
 *   modifies the noun after it: "Test case", "Stress testing".
 */
function looksLikeNounPhrase(tokens: Token[]): boolean {
  const last = tokens[tokens.length - 1]
  if (!last || !isNounLike(last.tags)) return false
  const isVerb = (tags: Set<string>) => tags.has('Verb') && !tags.has('Gerund') && !isNounLike(tags)
  return tokens.every((t, i) => !isVerb(t.tags) || (i === 0 && tokens.length > 1 && t.tags.has('Infinitive')))
}

export function isValidDefinition(definition: string, term: string): boolean {
  const words = definition.split(/\s+/)
  if (words.length > MAX_DEFINITION_WORDS) return false
  // Count real words only, so "10-100 keV 20" doesn't pass as a three-word definition.
  if (words.filter((w) => /\p{L}{2}/u.test(w)).length < MIN_DEFINITION_WORDS) return false
  if (BAD_DEFINITION_START.has(words[0]?.toLowerCase() ?? '')) return false
  // A definition that just repeats the term ("Testing is the testing of ...") teaches nothing.
  return !definition.toLowerCase().startsWith(term.toLowerCase())
}

// --- Helpers ------------------------------------------------------------------
function cleanTerm(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const term = raw.trim().replace(/^(the|a|an)\s+/i, '').replace(/[\s,;:]+$/, '')
  return term === '' ? undefined : term
}

function cleanDefinition(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const definition = stripEnd(raw.trim()).replace(/^(a|an|the)\s+/i, '')
  return definition === '' ? undefined : definition
}

function stripEnd(text: string): string {
  return text.replace(/[\s.;:]+$/, '')
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function origin(sentence: Sentence) {
  return { sentenceId: sentence.id, page: sentence.page, sectionId: sentence.sectionId }
}
