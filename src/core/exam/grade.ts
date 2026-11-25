import type { Definition } from '../analysis/definitions'
import type { Question } from '../generation/types'
import { editDistance, normalizeAnswer, overlappingAnswers, sameAnswer } from '../text/answer'

/*
 * Grading with explanations.
 *
 * Explanations are passages from the document, never invented text:
 * - the correct answer is explained by its source sentence and page;
 * - a wrong multiple-choice option is explained by its own definition (every
 *   option is a term defined in the document);
 * - a typed answer gets hints: a near-miss spelling, an incomplete answer
 *   ("dose" for "patient dose"), or the definition of the other term it names.
 */

export type AnswerStatus = 'correct' | 'almost' | 'wrong' | 'unanswered'
export type AnswerHint = 'spelling' | 'incomplete'

/** A defined term from the document, used to explain typed answers that name another term. */
export interface GlossaryEntry {
  term: string
  definition: string
  page: number
}

export interface Feedback {
  answer: string
  /** The source sentence that shows the answer, and its page. */
  explanation: string
  page: number
  /** What the chosen option or typed term actually is, when it is another term from the document. */
  chosen?: GlossaryEntry
  /** Whether `chosen.definition` is the option the user picked (on "which definition" questions). */
  chosenIsDefinition?: boolean
  hint?: AnswerHint
}

export interface AnswerResult {
  questionId: string
  status: AnswerStatus
  /** Counts toward the score. "almost" counts only when typos are accepted. */
  correct: boolean
  given: string | null
  feedback: Feedback
}

export interface GradeOptions {
  /** Count near-miss spellings of typed answers as correct. */
  acceptTypos?: boolean
  glossary?: GlossaryEntry[]
}

export function buildGlossary(definitions: Definition[]): GlossaryEntry[] {
  return definitions.map((d) => ({ term: d.term, definition: d.definition, page: d.page }))
}

export function gradeAnswer(question: Question, given: string | null, options: GradeOptions = {}): AnswerResult {
  const feedback: Feedback = {
    answer: question.answer,
    explanation: question.explanation,
    page: question.explanationPage ?? question.page
  }
  const result = (status: AnswerStatus, extra: Partial<Feedback> = {}): AnswerResult => ({
    questionId: question.id,
    status,
    correct: status === 'correct' || (status === 'almost' && (options.acceptTypos ?? false)),
    given,
    feedback: { ...feedback, ...extra }
  })

  if (given === null || normalizeAnswer(given) === '') return result('unanswered')
  return question.options ? gradeChoice(question, given, result) : gradeTyped(question, given, options, result)
}

type Build = (status: AnswerStatus, extra?: Partial<Feedback>) => AnswerResult

function gradeChoice(question: Question, given: string, result: Build): AnswerResult {
  if (given === question.answer) return result('correct')
  const source = question.options?.find((o) => o.text === given)?.source
  if (!source) return result('wrong')
  return result('wrong', {
    chosen: { term: source.term, definition: source.definition, page: source.page },
    chosenIsDefinition: question.type === 'mcq-definition'
  })
}

function gradeTyped(question: Question, given: string, options: GradeOptions, result: Build): AnswerResult {
  const accepted = [question.answer, ...question.acceptedAnswers]
  if (accepted.some((a) => sameAnswer(given, a))) return result('correct')
  if (accepted.some((a) => isNearMiss(given, a))) return result('almost', { hint: 'spelling' })

  const chosen = options.glossary?.find((entry) => sameAnswer(entry.term, given))
  // "dose" for "patient dose": part of the answer, but not all of it.
  const incomplete = normalizeAnswer(given).length < normalizeAnswer(question.answer).length
  const hint: AnswerHint | undefined =
    incomplete && overlappingAnswers(given, question.answer) ? 'incomplete' : undefined
  return result('wrong', { ...(chosen ? { chosen } : {}), ...(hint ? { hint } : {}) })
}

/**
 * One wrong letter in a word of 4-7 letters, or two in a longer one. Shorter
 * answers must be exact: "rad" and "rem" differ by one letter but are different units.
 */
function isNearMiss(given: string, answer: string): boolean {
  const a = normalizeAnswer(given)
  const b = normalizeAnswer(answer)
  const length = Math.max(a.length, b.length)
  if (length < 4) return false
  const allowed = length >= 8 ? 2 : 1
  return editDistance(a, b) <= allowed
}

/** Plain-language feedback, as shown after answering. */
export function describeFeedback(result: AnswerResult): string[] {
  const { feedback } = result
  const source = `${feedback.explanation} (p. ${feedback.page})`
  switch (result.status) {
    case 'correct':
      return ['Correct.', source]
    case 'unanswered':
      return [`Not answered. The answer is: ${feedback.answer}.`, source]
    case 'almost':
      return [
        result.correct ? 'Correct, but check the spelling:' : 'Almost: check the spelling.',
        `The answer is: ${feedback.answer}.`,
        source
      ]
    case 'wrong': {
      const lines = ['Not quite.']
      if (feedback.hint === 'incomplete')
        lines.push(`Your answer is only part of it. The full answer is: ${feedback.answer}.`)
      if (feedback.chosen) {
        lines.push(
          feedback.chosenIsDefinition
            ? `The description you chose is of ${feedback.chosen.term} (p. ${feedback.chosen.page}).`
            : `${feedback.chosen.term} is ${withArticle(feedback.chosen.definition)} (p. ${feedback.chosen.page}).`
        )
      }
      if (feedback.hint !== 'incomplete') lines.push(`The answer is: ${feedback.answer}.`)
      lines.push(source)
      return lines
    }
  }
}

/** Definitions are stored without a leading article ("small container ..."); add one back for a sentence. */
function withArticle(definition: string): string {
  if (/^(a|an|the)\s/i.test(definition)) return definition
  return `${/^[aeiou]/i.test(definition) ? 'an' : 'a'} ${definition}`
}
