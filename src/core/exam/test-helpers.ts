import type { Option, Question } from '../generation/types'

export function question(id: string, opts: Partial<Question> = {}): Question {
  return {
    id,
    type: 'cloze',
    prompt: `Prompt ${id}`,
    answer: `answer ${id}`,
    acceptedAnswers: [`answer ${id}`],
    explanation: `Source sentence for ${id}.`,
    page: 1,
    sectionId: 1,
    sentenceId: 1,
    termKey: `term-${id}`,
    quality: 0.5,
    ...opts
  }
}

export function option(text: string, term = text, page = 1): Option {
  return { text, source: { term, definition: `definition of ${term}`, page, sectionId: 1 } }
}

/** `count` questions in one section, each about its own term. */
export function sectionOf(sectionId: number, count: number, opts: Partial<Question> = {}): Question[] {
  return Array.from({ length: count }, (_, i) => question(`s${sectionId}-${i}`, { sectionId, ...opts }))
}
