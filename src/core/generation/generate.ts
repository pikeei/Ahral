import type { DocumentAnalysis } from '../analysis/analyze'
import type { Term } from '../analysis/terms'
import type { ExtractedDocument } from '../pdf/layout'
import { type ClozeRejection, type ClozeSource, generateCloze } from './cloze'
import { dedupeQuestions } from './dedupe'
import { isVagueDefinition } from './kind'
import { generateDefinitionMcq, generateTermMcq, type McqRejection } from './mcq'
import { checkSentence, type SentenceRejection } from './sentence-filter'
import type { Question, QuestionType } from './types'

export interface GenerateOptions {
  /** Dictionary lookup (lowercase). Enables the "no unrecognized words" filter and generic-word checks. */
  isWord?: (word: string) => boolean
  /** How many top-ranked terms may be blanked out in cloze questions. Default scales with document size. */
  maxAnswerTerms?: number
  /** Most questions kept about any one term. */
  maxPerTerm?: number
  /** Most questions of the same type about any one term. */
  maxPerTermAndType?: number
  /** Lowest definition confidence used for multiple-choice questions. */
  minDefinitionConfidence?: number
}

export interface GenerationStats {
  sentences: number
  usableSentences: number
  rejectedSentences: Partial<Record<SentenceRejection, number>>
  rejectedQuestions: Partial<Record<ClozeRejection | McqRejection | 'duplicate', number>>
  /** Generated types only: questions from the document's own question bank are counted separately. */
  byType: Record<Exclude<QuestionType, 'book-mcq'>, number>
}

export interface GenerationResult {
  /** Best first. */
  questions: Question[]
  stats: GenerationStats
}

const DEFAULTS = { maxPerTerm: 3, maxPerTermAndType: 2, minDefinitionConfidence: 0.75 }

/** About one answer term per 15 sentences, so a short handout and a 400-page book both get fair coverage. */
function defaultMaxAnswerTerms(sentenceCount: number): number {
  return Math.min(1500, Math.max(100, Math.round(sentenceCount / 15)))
}

/** Extracted document + analysis → ranked, deduplicated questions. */
export function generateQuestions(
  doc: ExtractedDocument,
  analysis: DocumentAnalysis,
  options: GenerateOptions = {}
): GenerationResult {
  const settings = { ...DEFAULTS, maxAnswerTerms: defaultMaxAnswerTerms(doc.sentences.length), ...options }
  const rejectedSentences: GenerationStats['rejectedSentences'] = {}
  const rejectedQuestions: GenerationStats['rejectedQuestions'] = {}
  const countSentence = (reason: SentenceRejection) =>
    (rejectedSentences[reason] = (rejectedSentences[reason] ?? 0) + 1)
  const countQuestion = (reason: keyof GenerationStats['rejectedQuestions']) =>
    (rejectedQuestions[reason] = (rejectedQuestions[reason] ?? 0) + 1)

  const allowedWords = allowedTermWords(analysis.terms)
  const definitionSentences = new Set(analysis.definitions.map((d) => d.sentenceId))
  const sentenceText = new Map(doc.sentences.map((s) => [s.id, s.text]))

  const sources: ClozeSource[] = []
  for (const sentence of doc.sentences) {
    const check = checkSentence(sentence.text, { isWord: settings.isWord, allowedWords })
    if (check.ok) sources.push({ sentence, text: check.text, isDefinition: definitionSentences.has(sentence.id) })
    else countSentence(check.reason)
  }

  const answerTerms = selectAnswerTerms(analysis.terms, settings.maxAnswerTerms, settings.isWord)
  const cloze = generateCloze(sources, answerTerms, countQuestion)

  // Definitions must come from a sentence that passes the same quality bar.
  const usable = new Set(sources.map((s) => s.sentence.id))
  const definitions = analysis.definitions.filter(
    (d) =>
      d.confidence >= settings.minDefinitionConfidence && usable.has(d.sentenceId) && !isVagueDefinition(d.definition)
  )
  const mcq = [
    ...generateTermMcq(definitions, countQuestion),
    ...generateDefinitionMcq(definitions, countQuestion)
  ].map((q) => ({ ...q, explanation: sentenceText.get(q.sentenceId) ?? q.explanation }))

  const all = [...cloze, ...mcq]
  const questions = dedupeQuestions(all, settings.maxPerTerm, settings.maxPerTermAndType)
  if (all.length > questions.length) rejectedQuestions.duplicate = all.length - questions.length

  return {
    questions,
    stats: {
      sentences: doc.sentences.length,
      usableSentences: sources.length,
      rejectedSentences,
      rejectedQuestions,
      byType: {
        cloze: questions.filter((q) => q.type === 'cloze').length,
        'mcq-term': questions.filter((q) => q.type === 'mcq-term').length,
        'mcq-definition': questions.filter((q) => q.type === 'mcq-definition').length
      }
    }
  }
}

/** A term seen at least this often counts as real vocabulary even if the dictionary lacks it. */
const MIN_FREQUENCY_FOR_ALLOWED_WORD = 5

/**
 * Words from key terms that are fine even when the dictionary doesn't list them
 * ("kilovoltage"). Only trustworthy terms count, and only words of 4+ letters:
 * noun phrases built from broken fragments ("of en") must not vouch for them.
 */
function allowedTermWords(terms: Term[]): Set<string> {
  const words = new Set<string>()
  for (const term of terms) {
    const trusted =
      term.sources.some((s) => s === 'definition' || s === 'bold' || s === 'acronym') ||
      term.frequency >= MIN_FREQUENCY_FOR_ALLOWED_WORD
    if (!trusted) continue
    for (const word of term.text.toLowerCase().match(/\p{L}{4,}/gu) ?? []) words.add(word)
  }
  return words
}

/**
 * Terms specific enough to be a blank's answer. A single everyday word that the
 * tagger found as a noun ("patient", "system") has too many plausible fillers,
 * so it only qualifies if the author defined it, bolded it, or it's an acronym.
 */
export function selectAnswerTerms(terms: Term[], max: number, isWord: ((w: string) => boolean) | undefined): Term[] {
  return terms
    .filter((term) => {
      // Must start with a letter: "30-degree" or "1:10" make poor blanks.
      if (!/^\p{L}/u.test(term.text) || !/\p{L}{2}/u.test(term.text)) return false
      const strong = term.sources.some((s) => s === 'definition' || s === 'bold' || s === 'acronym')
      const singleEverydayWord = !term.key.includes(' ') && (isWord?.(term.key) ?? false)
      return strong || !singleEverydayWord
    })
    .slice(0, max)
}
