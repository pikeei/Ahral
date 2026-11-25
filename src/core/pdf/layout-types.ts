/** Output types of the layout pipeline (see layout.ts). */

export interface Line {
  page: number
  text: string
  x: number
  xEnd: number
  y: number
  fontSize: number
  /** Most of the line's characters are bold. */
  bold: boolean
  /** Bold fragments inside the line (candidate key terms). */
  boldRuns: string[]
  /** 0 = left/only column, 1 = right column. */
  column: number
}

export type BlockKind = 'heading' | 'paragraph' | 'list-item'

export interface Block {
  id: number
  kind: BlockKind
  text: string
  /** Page the block starts on. */
  page: number
  /** Where the text crosses onto a later page: from `offset` on, text is on `page`. */
  pageBreaks: { offset: number; page: number }[]
  fontSize: number
  /** Heading level (1 = largest). Only set for headings. */
  level?: number
  boldRuns: string[]
  sectionId: number
}

export interface Section {
  id: number
  /** null for text that appears before the first heading. */
  title: string | null
  level: number
  /** The enclosing section (the chapter of a subsection), or null at the top level. */
  parentId: number | null
  pageStart: number
  pageEnd: number
}

export interface Sentence {
  id: number
  text: string
  page: number
  sectionId: number
  blockId: number
}

export interface PageSummary {
  pageNumber: number
  charCount: number
  hasText: boolean
}

export interface ExtractedDocument {
  pageCount: number
  pages: PageSummary[]
  bodyFontSize: number
  sections: Section[]
  blocks: Block[]
  sentences: Sentence[]
  /** Most pages have no text layer, so the PDF is probably scanned images. */
  likelyScanned: boolean
  warnings: string[]
}

export interface LayoutOptions {
  /**
   * Dictionary lookup (lowercase word -> known?). When given, words broken by
   * letters missing from the PDF's text layer are repaired. Without it, the
   * problem is only reported as a warning.
   */
  isWord?: (word: string) => boolean
}
