import type { Question } from '../generation/types'
import type { Block } from '../pdf/layout-types'

/*
 * Question banks: multiple-choice questions the document already contains, such as
 * a review book's "Questions" section with its "Answers and Explanations" key.
 *
 *   1. Which blood vessels are best suited for determination of pulse rate?
 *   (A) Superficial arteries
 *   (B) Deep arteries ...
 *   ...
 *   1. (A) Superficial arteries are best suited for ... (the answer key, often in a later section)
 *
 * Questions written by the book's authors beat anything generated, so they are imported
 * as they are: same wording, same option order, the book's own explanation.
 *
 * Recognised layouts:
 * - options as "(A) text", "A) text", "A. text" (or lowercase), one per block or several on one line;
 * - answers as "12. (C) explanation" or "12. C. explanation" in an answer key, or
 *   "Answer: C" right after the question's options;
 * - numbered sub-items inside a question ("1. MRSA  2. ...  (A) 1 only  (B) 1 and 2").
 */

export interface QuestionBankStats {
  /** Questions with at least three options. */
  found: number
  imported: number
  /** No answer found for the question number (or the answer letter has no option). */
  withoutAnswer: number
  /** Refers to a figure or image, which the app can't show. */
  needsFigure: number
  /** Unusable: two options with the same text. */
  malformed: number
}

export interface QuestionBankResult {
  questions: Question[]
  stats: QuestionBankStats
}

interface ParsedQuestion {
  number: number
  stem: string[]
  options: string[]
  page: number
  sectionId: number
  inlineAnswer?: Answer
}

interface Answer {
  number: number
  letter: string
  explanation: string
  page: number
}

const LETTERS = 'ABCDEFGH'
/** "12. Which ...", "12) Which ...", or "12." alone with the question in the next block. */
const NUMBERED = /^(\d{1,3})[.)](?:\s+(\S.*))?$/s
/** "12. (C) Because ..." or "12. C. Because ..." — never "12. A patient ...". */
const ANSWER_KEY = /^(\d{1,3})[.)]\s*(?:\(([A-Ha-h])\)|([A-Ha-h])[.)])(?:\s+(.*))?$/s
/** "Answer: C", "Ans. (C) because ...", "Correct answer: C". */
const INLINE_ANSWER = /^(?:correct\s+)?(?:answer|ans\.?)\s*[:.-]?\s*\(?([A-Ha-h])\)?(?:[.):]|\s|$)\s*(.*)$/is
/** An option label at the start of a block: "(A) ", "A) ", "A. ", "(a) ". */
const OPTION_START = /^(?:\(([A-Ha-h])\)|([A-Ha-h])[.)])\s+(\S.*)$/s
/** Option labels inside a block that holds several options. */
const OPTION_LABEL = /(?:^|\s)\(([A-Ha-h])\)\s+/g
const FIGURE =
  /\b(?:fig(?:ure|\.)?\s*\d|figures?\b|(?:image|radiograph|illustration|diagram|photo(?:graph)?)\s+(?:shown|below|above)|shown\s+(?:below|above|in\s+the))/i
const MIN_OPTIONS = 3

export function extractQuestionBank(blocks: Block[]): QuestionBankResult {
  const { questions, answers } = parseQuestionBlocks(blocks)
  const keys = groupAnswerSets(answers)
  const sets = groupQuestionSets(questions)

  const stats: QuestionBankStats = {
    found: questions.length,
    imported: 0,
    withoutAnswer: 0,
    needsFigure: 0,
    malformed: 0
  }
  const imported: Question[] = []
  // Sets whose answers follow each question don't use an answer key; the others take the keys in order.
  let nextKey = 0
  sets.forEach((set, setIndex) => {
    const key = set.some((q) => q.inlineAnswer) ? undefined : keys[nextKey++]
    for (const parsed of set) {
      const answer = parsed.inlineAnswer ?? key?.get(parsed.number)
      const index = answer ? LETTERS.indexOf(answer.letter) : -1
      const correct = parsed.options[index]
      if (!answer || correct === undefined) {
        stats.withoutAnswer++
        continue
      }
      if ([...parsed.stem, ...parsed.options].some((text) => FIGURE.test(text))) {
        stats.needsFigure++
        continue
      }
      if (new Set(parsed.options).size !== parsed.options.length) {
        stats.malformed++
        continue
      }
      imported.push(toQuestion(parsed, answer, correct, setIndex))
    }
  })
  stats.imported = imported.length
  return { questions: imported, stats }
}

/** One line for the document's notes, or nothing when the document has no question bank. */
export function describeQuestionBank(stats: QuestionBankStats): string | undefined {
  if (stats.found === 0) return undefined
  const skipped = [
    stats.withoutAnswer > 0 ? `${stats.withoutAnswer} without an answer in the key` : '',
    stats.needsFigure > 0 ? `${stats.needsFigure} that need a figure` : '',
    stats.malformed > 0 ? `${stats.malformed} with repeated options` : ''
  ].filter(Boolean)
  return `Imported ${stats.imported} of the ${stats.found} questions in this PDF${
    skipped.length > 0 ? `; skipped ${skipped.join(', ')}` : ''
  }.`
}

function toQuestion(parsed: ParsedQuestion, answer: Answer, correct: string, setIndex: number): Question {
  const letter = answer.letter
  return {
    id: `book-${setIndex + 1}-${parsed.number}`,
    type: 'book-mcq',
    prompt: parsed.stem.join('\n'),
    answer: correct,
    acceptedAnswers: [],
    options: parsed.options.map((text) => ({ text })),
    keepOptionOrder: true,
    explanation: answer.explanation || `The answer key gives (${letter}).`,
    explanationPage: answer.page,
    page: parsed.page,
    sectionId: parsed.sectionId,
    sentenceId: 0,
    termKey: `book-${setIndex + 1}-${parsed.number}`,
    // Written by the book's authors: ranked above every generated question.
    quality: 1
  }
}

export function parseQuestionBlocks(blocks: Block[]): { questions: ParsedQuestion[]; answers: Answer[] } {
  const questions: ParsedQuestion[] = []
  const answers: Answer[] = []
  let current: ParsedQuestion | undefined
  let lastAnswer: Answer | undefined

  const close = () => {
    if (current && current.options.length >= MIN_OPTIONS) questions.push(current)
    current = undefined
  }

  for (const [index, block] of blocks.entries()) {
    const text = block.text.trim()
    if (block.kind === 'heading') {
      close()
      lastAnswer = undefined
      continue
    }

    // "12. (C) ..." always starts an answer, even right after a numbered line. The looser
    // "12. C. ..." doesn't while a question is still being read: there it's a statement
    // in a combination question ("2. C. difficile").
    const key = ANSWER_KEY.exec(text)
    if (key && (key[2] !== undefined || !(current && current.options.length === 0))) {
      close()
      lastAnswer = {
        number: Number(key[1]),
        letter: (key[2] ?? key[3] ?? '').toUpperCase(),
        explanation: (key[4] ?? '').trim(),
        page: block.page
      }
      answers.push(lastAnswer)
      continue
    }

    const inline = INLINE_ANSWER.exec(text)
    if (inline && current && current.options.length >= MIN_OPTIONS) {
      current.inlineAnswer = {
        number: current.number,
        letter: (inline[1] ?? '').toUpperCase(),
        explanation: (inline[2] ?? '').trim(),
        page: block.page
      }
      close()
      continue
    }

    const options = splitOptions(text)
    if (options && current && options[0]?.letter === LETTERS[current.options.length]) {
      for (const option of options) {
        if (option.letter === LETTERS[current.options.length]) current.options.push(option.text)
      }
      continue
    }

    const numbered = NUMBERED.exec(text)
    if (numbered) {
      // A numbered line before any options is part of the question ("1. MRSA" in a combination question).
      if (current && current.options.length === 0) {
        current.stem.push(text)
        continue
      }
      // Inside an explanation, a numbered list ("1. the patient's name") is part of it,
      // unless options follow, which makes it the next question.
      if (lastAnswer && !current && !optionsFollow(blocks, index)) {
        lastAnswer.explanation = `${lastAnswer.explanation} ${text}`.trim()
        continue
      }
      lastAnswer = undefined
      close()
      current = {
        number: Number(numbered[1]),
        stem: numbered[2] ? [numbered[2].trim()] : [],
        options: [],
        page: block.page,
        sectionId: block.sectionId
      }
      continue
    }

    if (current && current.options.length === 0) {
      // A question that wraps into a second block.
      current.stem.push(text)
    } else if (lastAnswer && !current) {
      // An explanation that continues into the next paragraph.
      lastAnswer.explanation = `${lastAnswer.explanation} ${text}`.trim()
    } else {
      close()
    }
  }
  close()
  return { questions, answers }
}

/** How far ahead an "(A)" option may be for a numbered line to count as a question (stem blocks, sub-items). */
const OPTION_LOOKAHEAD = 10

/** Whether an "(A)" option follows the block at `index` before the next heading or answer key. */
function optionsFollow(blocks: Block[], index: number): boolean {
  for (const block of blocks.slice(index + 1, index + 1 + OPTION_LOOKAHEAD)) {
    const text = block.text.trim()
    if (block.kind === 'heading' || ANSWER_KEY.test(text)) return false
    if (splitOptions(text)?.[0]?.letter === 'A') return true
  }
  return false
}

/** "(A) 1 only (B) 1 and 2" -> two options. Returns undefined when the text doesn't start with an option. */
function splitOptions(text: string): { letter: string; text: string }[] | undefined {
  const start = OPTION_START.exec(text)
  if (!start) return undefined
  const first = (start[1] ?? start[2] ?? '').toUpperCase()
  const labels = [...text.matchAll(OPTION_LABEL)]
  const offset = LETTERS.indexOf(first)
  const sequential = labels.length > 1 && labels.every((m, i) => (m[1] ?? '').toUpperCase() === LETTERS[offset + i])
  if (!sequential) return [{ letter: first, text: (start[3] ?? '').trim() }]
  return labels.map((m, i) => {
    const from = (m.index ?? 0) + m[0].length
    const to = labels[i + 1]?.index ?? text.length
    return { letter: (m[1] ?? '').toUpperCase(), text: text.slice(from, to).trim() }
  })
}

/**
 * Questions come in numbered runs (a chapter's 1-130, then a practice test's 1-200).
 * A run ends where the numbering starts again from a lower number.
 */
function groupQuestionSets(questions: ParsedQuestion[]): ParsedQuestion[][] {
  return splitRuns(questions, (q) => q.number)
}

/** Answer keys in the same runs, so the n-th set of questions uses the n-th key. */
function groupAnswerSets(answers: Answer[]): Map<number, Answer>[] {
  return splitRuns(answers, (a) => a.number).map((run) => new Map(run.map((a) => [a.number, a])))
}

function splitRuns<T>(items: T[], numberOf: (item: T) => number): T[][] {
  const runs: T[][] = []
  let previous = Number.POSITIVE_INFINITY
  for (const item of items) {
    const n = numberOf(item)
    if (runs.length === 0 || n <= previous) runs.push([])
    runs[runs.length - 1]?.push(item)
    previous = n
  }
  return runs
}
