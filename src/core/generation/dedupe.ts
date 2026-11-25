import { contentWords, jaccard } from './similarity'
import type { Question } from './types'

/** Two prompts sharing more than this share of words ask the same thing. */
export const MAX_PROMPT_OVERLAP = 0.8

/**
 * Keeps the best questions and drops repeats, highest quality first:
 * - at most `maxPerTerm` questions about the same key term, and at most
 *   `maxPerTermAndType` of one type, so a term is tested in different ways;
 * - no two questions whose prompts are nearly the same text.
 * Keeping a few questions per term gives retakes some variety.
 */
export function dedupeQuestions(questions: Question[], maxPerTerm: number, maxPerTermAndType = 1): Question[] {
  const ranked = [...questions].sort((a, b) => b.quality - a.quality || a.id.localeCompare(b.id))
  const kept: Question[] = []
  const keptWords: Set<string>[] = []
  const perTerm = new Map<string, Question[]>()

  for (const question of ranked) {
    const sameTerm = perTerm.get(question.termKey) ?? []
    if (sameTerm.length >= maxPerTerm) continue
    if (sameTerm.filter((q) => q.type === question.type).length >= maxPerTermAndType) continue

    const words = contentWords(question.prompt)
    if (keptWords.some((other) => jaccard(words, other) > MAX_PROMPT_OVERLAP)) continue

    kept.push(question)
    keptWords.push(words)
    perTerm.set(question.termKey, [...sameTerm, question])
  }
  return kept
}
