import type { Definition } from '../analysis/definitions'
import { phraseKey } from '../analysis/nlp'
import { overlappingAnswers, sameAnswer } from '../text/answer'
import { contentWords, jaccard, termPattern } from './similarity'
import type { Question } from './types'

/*
 * Multiple-choice questions from detected definitions.
 *
 * Distractors (wrong options) come from the document's other defined terms,
 * so they are the same kind of thing as the answer. The main risk is a
 * distractor that is ALSO a correct answer, so every distractor must pass:
 *   - it is not the answer, an alias of it, or overlapping it ("API" vs "API testing");
 *   - it does not appear in the question itself;
 *   - its own definition is clearly different (word overlap below MAX_DEFINITION_OVERLAP),
 *     because "ampoule" and "vial" defined almost alike would make both right.
 */

export type McqRejection = 'answer-in-definition' | 'not-enough-distractors'

export const DISTRACTOR_COUNT = 3
/** Two definitions sharing more than this share of words are too alike to separate. */
export const MAX_DEFINITION_OVERLAP = 0.5
/** Definitions used as options must be of comparable length, or the odd one out is a giveaway. */
const MAX_LENGTH_RATIO = 2.5

interface DefinedTerm {
  definition: Definition
  words: Set<string>
}

/** "Which term is best described as ...?" with terms as options. */
export function generateTermMcq(definitions: Definition[], onReject: (reason: McqRejection) => void): Question[] {
  const defined = definitions.map((definition) => ({ definition, words: contentWords(definition.definition) }))
  const questions: Question[] = []

  for (const target of defined) {
    const { definition } = target
    if (termPattern([definition.term]).test(definition.definition)) {
      onReject('answer-in-definition')
      continue
    }

    const distractors = defined
      .filter((other) => other !== target && isSafeTermDistractor(other, target))
      .sort((a, b) => distractorScore(b, target) - distractorScore(a, target) || a.definition.term.localeCompare(b.definition.term))
      .slice(0, DISTRACTOR_COUNT)
    if (distractors.length < DISTRACTOR_COUNT) {
      onReject('not-enough-distractors')
      continue
    }

    questions.push({
      id: `mcq-term-${definition.sentenceId}`,
      type: 'mcq-term',
      prompt: `Which term is best described as: "${capitalize(definition.definition)}"?`,
      // Capitalize every option the same way; source casing ("Ionization" vs "anode") would hint at the answer.
      answer: capitalize(definition.term),
      acceptedAnswers: [capitalize(definition.term)],
      options: [definition.term, ...distractors.map((d) => d.definition.term)].map(capitalize),
      explanation: sourceText(definition),
      page: definition.page,
      sectionId: definition.sectionId,
      sentenceId: definition.sentenceId,
      termKey: phraseKey(definition.term),
      quality: round(0.7 * definition.confidence + 0.3 * sameSectionShare(distractors, target))
    })
  }
  return questions
}

/** "Which best describes X?" with definitions as options. */
export function generateDefinitionMcq(definitions: Definition[], onReject: (reason: McqRejection) => void): Question[] {
  const defined = definitions.map((definition) => ({ definition, words: contentWords(definition.definition) }))
  const questions: Question[] = []

  for (const target of defined) {
    const { definition } = target
    const answerLength = definition.definition.split(/\s+/).length
    const distractors = defined
      .filter((other) => {
        if (other === target || !isSafeTermDistractor(other, target)) return false
        // A wrong definition that mentions the term being asked about would confuse, not test.
        if (termPattern([definition.term]).test(other.definition.definition)) return false
        const ratio = other.definition.definition.split(/\s+/).length / answerLength
        return ratio <= MAX_LENGTH_RATIO && ratio >= 1 / MAX_LENGTH_RATIO
      })
      .sort((a, b) => distractorScore(b, target) - distractorScore(a, target) || a.definition.term.localeCompare(b.definition.term))
      .slice(0, DISTRACTOR_COUNT)
    if (distractors.length < DISTRACTOR_COUNT) {
      onReject('not-enough-distractors')
      continue
    }

    questions.push({
      id: `mcq-def-${definition.sentenceId}`,
      type: 'mcq-definition',
      prompt: `Which of the following best describes ${definition.term}?`,
      answer: capitalize(definition.definition),
      acceptedAnswers: [capitalize(definition.definition)],
      options: [definition.definition, ...distractors.map((d) => d.definition.definition)].map(capitalize),
      explanation: sourceText(definition),
      page: definition.page,
      sectionId: definition.sectionId,
      sentenceId: definition.sentenceId,
      termKey: phraseKey(definition.term),
      quality: round(0.6 * definition.confidence + 0.3 * sameSectionShare(distractors, target))
    })
  }
  return questions
}

function isSafeTermDistractor(other: DefinedTerm, target: DefinedTerm): boolean {
  const answer = target.definition.term
  const candidate = other.definition.term
  if (sameAnswer(candidate, answer) || overlappingAnswers(candidate, answer)) return false
  if (termPattern([candidate]).test(target.definition.definition)) return false
  return jaccard(other.words, target.words) <= MAX_DEFINITION_OVERLAP
}

/** Plausible distractors first: same section, similar shape and length as the answer. */
function distractorScore(other: DefinedTerm, target: DefinedTerm): number {
  const a = other.definition.term
  const b = target.definition.term
  let score = 0
  if (other.definition.sectionId === target.definition.sectionId) score += 2
  if (a.split(/\s+/).length === b.split(/\s+/).length) score += 1
  if (isAcronym(a) === isAcronym(b)) score += 1
  if (/^\p{Lu}/u.test(a) === /^\p{Lu}/u.test(b)) score += 0.5
  score -= Math.abs(a.length - b.length) / 20
  return score
}

function sameSectionShare(distractors: DefinedTerm[], target: DefinedTerm): number {
  return distractors.filter((d) => d.definition.sectionId === target.definition.sectionId).length / distractors.length
}

function isAcronym(text: string): boolean {
  return /^[\p{Lu}\d&]{2,8}s?$/u.test(text)
}

function sourceText(definition: Definition): string {
  return `${definition.term}: ${definition.definition}.`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
