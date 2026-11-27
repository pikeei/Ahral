import { splitSentences } from '../text/sentences'
import type { Block, Section, Sentence } from './layout-types'

/** Step 5: blocks -> sections and sentences (each sentence keeps its page and section). */

export function assignSections(blocks: Block[]): Section[] {
  const sections: Section[] = []
  // Open headings from outermost to innermost, used to find each section's parent.
  const open: Section[] = []
  let current: Section | undefined

  for (const block of blocks) {
    const lastPage = block.pageBreaks[block.pageBreaks.length - 1]?.page ?? block.page
    if (block.kind === 'heading') {
      const level = block.level ?? 1
      while ((open[open.length - 1]?.level ?? 0) >= level) open.pop()
      current = {
        id: sections.length + 1,
        title: block.text,
        level,
        parentId: open[open.length - 1]?.id ?? null,
        pageStart: block.page,
        pageEnd: lastPage
      }
      sections.push(current)
      open.push(current)
    } else if (!current) {
      current = {
        id: sections.length + 1,
        title: null,
        level: 1,
        parentId: null,
        pageStart: block.page,
        pageEnd: lastPage
      }
      sections.push(current)
    }
    current.pageEnd = Math.max(current.pageEnd, lastPage)
    block.sectionId = current.id
  }

  // A parent section ends where its last subsection ends.
  for (const section of [...sections].reverse()) {
    const parent = sections.find((s) => s.id === section.parentId)
    if (parent) parent.pageEnd = Math.max(parent.pageEnd, section.pageEnd)
  }
  return sections
}

/** Levels shown in a section label: enough to tell "Imaging › Answers" from "Radiation › Answers". */
const LABEL_LEVELS = 2

/**
 * "Patient Care and Education › Answers and Explanations": a section's title with its parent's.
 * Only the nearest levels are kept, so a book title heading that encloses every chapter
 * doesn't prefix every label.
 */
export function sectionLabel(sections: Section[], sectionId: number): string {
  const byId = new Map(sections.map((s) => [s.id, s]))
  const titles: string[] = []
  for (let s = byId.get(sectionId); s; s = s.parentId === null ? undefined : byId.get(s.parentId)) {
    if (s.title) titles.unshift(s.title)
  }
  return titles.length > 0 ? titles.slice(-LABEL_LEVELS).join(' › ') : '(untitled)'
}

/**
 * An answer-key or option label at the start of a sentence: "(D) Irradiation damage is ...".
 * The letter belongs to the book's own question, so it would mislead anywhere else.
 */
const LEADING_CHOICE_LABEL = /^\([A-Ha-h]\)\s+/

export function extractSentences(blocks: Block[]): Sentence[] {
  const sentences: Sentence[] = []
  for (const block of blocks) {
    if (block.kind === 'heading') continue
    for (const span of splitSentences(block.text)) {
      const text = span.text.replace(LEADING_CHOICE_LABEL, '')
      if (!/\p{L}/u.test(text)) continue
      sentences.push({
        id: sentences.length + 1,
        text,
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
