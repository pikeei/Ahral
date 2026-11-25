import { splitSentences } from '../text/sentences'
import type { Block, Section, Sentence } from './layout-types'

/** Step 5: blocks -> sections and sentences (each sentence keeps its page and section). */

export function assignSections(blocks: Block[]): Section[] {
  const sections: Section[] = []
  let current: Section | undefined

  for (const block of blocks) {
    const lastPage = block.pageBreaks[block.pageBreaks.length - 1]?.page ?? block.page
    if (block.kind === 'heading') {
      current = {
        id: sections.length + 1,
        title: block.text,
        level: block.level ?? 1,
        pageStart: block.page,
        pageEnd: lastPage
      }
      sections.push(current)
    } else if (!current) {
      current = { id: sections.length + 1, title: null, level: 1, pageStart: block.page, pageEnd: lastPage }
      sections.push(current)
    }
    current.pageEnd = Math.max(current.pageEnd, lastPage)
    block.sectionId = current.id
  }
  return sections
}

export function extractSentences(blocks: Block[]): Sentence[] {
  const sentences: Sentence[] = []
  for (const block of blocks) {
    if (block.kind === 'heading') continue
    for (const span of splitSentences(block.text)) {
      if (!/\p{L}/u.test(span.text)) continue
      sentences.push({
        id: sentences.length + 1,
        text: span.text,
        page: pageAtOffset(block, span.start),
        sectionId: block.sectionId,
        blockId: block.id
      })
    }
  }
  return sentences
}

function pageAtOffset(block: Block, offset: number): number {
  let page = block.page
  for (const pageBreak of block.pageBreaks) {
    if (offset >= pageBreak.offset) page = pageBreak.page
  }
  return page
}
