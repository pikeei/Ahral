/** How a question is answered and how it was built. */
export type QuestionType =
  /** A sentence with one key term blanked out; the answer is typed in. */
  | 'cloze'
  /** "Which term is best described as ...?" Options are terms. */
  | 'mcq-term'
  /** "Which best describes X?" Options are definitions. */
  | 'mcq-definition'

export interface Question {
  /** Stable id built from the source, so regenerating gives the same ids. */
  id: string
  type: QuestionType
  prompt: string
  /** The correct answer as shown to the user. */
  answer: string
  /** Other answers accepted for typed questions (alternate spellings, acronym/long form). */
  acceptedAnswers: string[]
  /** Multiple-choice options including the answer, unshuffled; shuffling happens per exam attempt. */
  options?: string[]
  /** The source sentence, shown after answering. */
  explanation: string
  page: number
  sectionId: number
  sentenceId: number
  /** The key term the question tests, used to limit questions per term. */
  termKey: string
  /** 0-1 ranking score; higher means more likely to be a good question. */
  quality: number
}

export const BLANK = '_____'
