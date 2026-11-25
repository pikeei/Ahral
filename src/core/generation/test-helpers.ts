import type { Definition } from '../analysis/definitions'
import type { Term } from '../analysis/terms'
import type { Sentence } from '../pdf/layout'
import type { ClozeSource } from './cloze'

export function term(text: string, opts: Partial<Term> = {}): Term {
  return {
    key: text.toLowerCase(),
    text,
    score: 5,
    frequency: 3,
    sectionIds: [1],
    sentenceIds: [],
    sources: ['noun-phrase'],
    alternatives: [],
    ...opts
  }
}

export function source(id: number, text: string, opts: Partial<Sentence> = {}): ClozeSource {
  return { sentence: { id, text, page: 1, sectionId: 1, blockId: id, ...opts }, text, isDefinition: false }
}

let nextSentenceId = 100
export function definition(term: string, text: string, opts: Partial<Definition> = {}): Definition {
  return {
    term,
    definition: text,
    sentenceId: nextSentenceId++,
    page: 1,
    sectionId: 1,
    pattern: 'glossary',
    confidence: 0.9,
    ...opts
  }
}
