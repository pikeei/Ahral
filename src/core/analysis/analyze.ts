import type { ExtractedDocument } from '../pdf/layout'
import { type Alias, type Definition, detectAliases, detectDefinitions } from './definitions'
import { extractTerms, type Term } from './terms'

export interface DocumentAnalysis {
  definitions: Definition[]
  aliases: Alias[]
  /** Sorted by score, highest first. */
  terms: Term[]
}

/** Extracted text → definitions, acronyms and ranked key terms. */
export function analyzeDocument(doc: ExtractedDocument): DocumentAnalysis {
  const definitions = detectDefinitions(doc.sentences, doc.blocks)
  const aliases = detectAliases(doc.sentences)
  const terms = extractTerms(doc.sentences, doc.blocks, definitions, aliases)
  return { definitions, aliases, terms }
}
