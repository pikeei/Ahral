import type { Block, Sentence } from '../pdf/layout'

/** Builds one sentence per entry, each in its own paragraph block. */
export function sentencesAndBlocks(
  entries: (string | { text: string; bold?: string[]; sectionId?: number; page?: number })[]
): { sentences: Sentence[]; blocks: Block[] } {
  const sentences: Sentence[] = []
  const blocks: Block[] = []
  entries.forEach((entry, i) => {
    const e = typeof entry === 'string' ? { text: entry } : entry
    const id = i + 1
    blocks.push({
      id,
      kind: 'paragraph',
      text: e.text,
      page: e.page ?? 1,
      pageBreaks: [],
      fontSize: 11,
      boldRuns: e.bold ?? [],
      sectionId: e.sectionId ?? 1
    })
    sentences.push({ id, text: e.text, page: e.page ?? 1, sectionId: e.sectionId ?? 1, blockId: id })
  })
  return { sentences, blocks }
}
