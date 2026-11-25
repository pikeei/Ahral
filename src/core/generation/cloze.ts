import type { Term } from '../analysis/terms'
import type { Sentence } from '../pdf/layout'
import { termPattern } from './similarity'
import { BLANK, type Question } from './types'

/*
 * Fill-in-the-blank (cloze) questions.
 *
 * For each eligible sentence, the highest-scoring key term in it is blanked.
 * The blank must not give itself away: the term (or an alias) must not appear
 * a second time in the sentence, and enough words must remain to recall it.
 */

export type ClozeRejection = 'no-key-term' | 'answer-repeated' | 'too-little-context'

export interface ClozeSource {
  sentence: Sentence
  /** Sentence text after the filter (answer-option label removed). */
  text: string
  /** This sentence is where a definition was detected. */
  isDefinition: boolean
}

/** Words that must remain around the blank. */
const MIN_CONTEXT_WORDS = 5

export function generateCloze(
  sources: ClozeSource[],
  answerTerms: Term[],
  onReject: (reason: ClozeRejection) => void
): Question[] {
  // Which candidate terms occur in which sentence (the term index already knows).
  const termsBySentence = new Map<number, Term[]>()
  for (const term of answerTerms) {
    for (const sentenceId of term.sentenceIds) {
      const list = termsBySentence.get(sentenceId) ?? []
      list.push(term)
      termsBySentence.set(sentenceId, list)
    }
  }
  const maxScore = Math.max(1, ...answerTerms.map((t) => t.score))
  const patterns = new Map<string, RegExp>()
  const patternFor = (term: Term) => {
    let pattern = patterns.get(term.key)
    if (!pattern) {
      // An acronym is matched by its exact spelling only; its lowercase key would match ordinary words.
      const acronym = /^[\p{Lu}\d&]{2,}s?$/u.test(term.text)
      pattern = termPattern(acronym ? [term.text] : [term.text, term.key])
      patterns.set(term.key, pattern)
    }
    return pattern
  }

  const questions: Question[] = []
  for (const source of sources) {
    const candidates = (termsBySentence.get(source.sentence.id) ?? []).sort((a, b) => b.score - a.score)
    if (candidates.length === 0) {
      onReject('no-key-term')
      continue
    }

    let made: Question | undefined
    let lastProblem: ClozeRejection = 'no-key-term'
    for (const term of candidates) {
      const matches = [...source.text.matchAll(patternFor(term))]
      if (matches.length === 0) continue // the key matched a different word form; try the next term
      const aliasShown = term.alternatives.some((alt) => termPattern([alt]).test(source.text))
      if (matches.length > 1 || aliasShown) {
        lastProblem = 'answer-repeated'
        continue
      }

      const match = matches[0]!
      const start = match.index
      const end = start + match[0].length
      const prompt = source.text.slice(0, start) + BLANK + source.text.slice(end)
      const contextWords = prompt.replace(BLANK, ' ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length
      if (contextWords < MIN_CONTEXT_WORDS) {
        lastProblem = 'too-little-context'
        continue
      }

      made = {
        id: `cloze-${source.sentence.id}-${term.key.replace(/\s+/g, '_')}`,
        type: 'cloze',
        prompt,
        answer: match[0],
        acceptedAnswers: [...new Set([match[0], term.text, ...term.alternatives])],
        explanation: source.text,
        page: source.sentence.page,
        sectionId: source.sentence.sectionId,
        sentenceId: source.sentence.id,
        termKey: term.key,
        quality: clozeQuality(term, maxScore, source, prompt)
      }
      break
    }

    if (made) questions.push(made)
    else onReject(lastProblem)
  }
  return questions
}

/**
 * 50% how important the term is, 20% whether the sentence is a definition,
 * 20% a comfortable sentence length, 10% a specific answer (phrase or acronym).
 */
function clozeQuality(term: Term, maxScore: number, source: ClozeSource, prompt: string): number {
  const words = prompt.split(/\s+/).length
  const lengthFit = words >= 10 && words <= 25 ? 1 : 0.5
  const specific = term.key.includes(' ') || term.sources.includes('acronym') ? 1 : 0
  const score = 0.5 * (term.score / maxScore) + 0.2 * (source.isDefinition ? 1 : 0) + 0.2 * lengthFit + 0.1 * specific
  return Math.round(score * 100) / 100
}
