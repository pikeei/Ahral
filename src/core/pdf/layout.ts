import { normalizeText } from '../text/normalize'
import { splitSentences } from '../text/sentences'
import type { RawPage, RawTextItem } from './types'

/*
 * Layout analysis: turns positioned text fragments into readable structure.
 *
 *   items ──► lines ──► reading order ──► drop headers/footers ──► blocks ──► sections + sentences
 *
 * Every threshold below is relative to font size or page size, never an
 * absolute number of points, so the rules behave the same on any page size.
 */

// ── Tunable thresholds ──────────────────────────────────────────────────────
/** Items whose baselines differ by less than this × font size share a line. */
const SAME_LINE_TOLERANCE = 0.5
/** A horizontal gap wider than this × font size between items means a space. */
const WORD_GAP = 0.15
/** A gap wider than this × font size splits a row into separate segments (columns, table cells). */
const SEGMENT_GAP = 2.5
/** Lines in the top/bottom fraction of the page are candidates for running headers/footers. */
const MARGIN_ZONE = 0.1
/** A line counts as a heading when its font is at least this × the body font size. */
const HEADING_SIZE_RATIO = 1.15
/** Within one block, consecutive lines are at most this × font size apart vertically. */
const MAX_LINE_SPACING = 2.0
/** Pages with fewer non-space characters than this are treated as having no text layer. */
const MIN_PAGE_CHARS = 25

// ── Output types ────────────────────────────────────────────────────────────
export interface Line {
  page: number
  text: string
  x: number
  xEnd: number
  y: number
  fontSize: number
  /** Most of the line's characters are bold. */
  bold: boolean
  /** Bold fragments inside the line (candidate key terms for Stage 2). */
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

// ── Pipeline ────────────────────────────────────────────────────────────────
export function analyzeLayout(rawPages: RawPage[]): ExtractedDocument {
  const pages = rawPages.map(summarizePage)
  const warnings = textLayerWarnings(pages)
  const likelyScanned = pages.length > 0 && pages.filter((p) => p.hasText).length / pages.length < 0.5

  const linesPerPage = rawPages.map((page) => orderForReading(buildLines(page)))
  const cleaned = removeRunningHeadersFooters(
    linesPerPage.map((lines, i) => ({ lines, height: rawPages[i]?.height ?? 0 }))
  )
  const allLines = cleaned.flat()

  const bodyFontSize = dominantFontSize(allLines)
  const blocks = buildBlocks(allLines, bodyFontSize)
  const sections = assignSections(blocks)
  const sentences = extractSentences(blocks)

  if (sentences.length === 0 && !likelyScanned) {
    warnings.push('No sentences could be extracted from this PDF.')
  }

  return {
    pageCount: rawPages.length,
    pages,
    bodyFontSize,
    sections,
    blocks,
    sentences,
    likelyScanned,
    warnings
  }
}

// ── Step 1: items → lines ───────────────────────────────────────────────────
export function buildLines(page: RawPage): Line[] {
  const items = page.items
    .filter((item) => item.text.trim() !== '')
    .sort((a, b) => b.y - a.y || a.x - b.x)

  // Group items into rows that share a baseline (within tolerance, so
  // superscripts and slightly misaligned fragments stay on their line).
  const rows: RawTextItem[][] = []
  for (const item of items) {
    const row = rows[rows.length - 1]
    const anchor = row?.[0]
    if (row && anchor) {
      const tolerance = Math.max(anchor.fontSize, item.fontSize) * SAME_LINE_TOLERANCE
      if (Math.abs(anchor.y - item.y) <= tolerance) {
        row.push(item)
        continue
      }
    }
    rows.push([item])
  }

  const lines: Line[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    // A wide horizontal gap means two unrelated pieces of text on the same
    // baseline (two columns, a table): keep them as separate lines.
    let segment: RawTextItem[] = []
    for (const item of row) {
      const prev = segment[segment.length - 1]
      if (prev && item.x - (prev.x + prev.width) > Math.max(prev.fontSize, item.fontSize) * SEGMENT_GAP) {
        lines.push(toLine(segment, page.pageNumber))
        segment = []
      }
      segment.push(item)
    }
    if (segment.length > 0) lines.push(toLine(segment, page.pageNumber))
  }
  return lines.filter((line) => line.text !== '')
}

function toLine(items: RawTextItem[], page: number): Line {
  let text = ''
  let prevEnd = Number.NEGATIVE_INFINITY
  let prevSize = 0
  const runs: { text: string; bold: boolean }[] = []
  const charsBySize = new Map<number, number>()
  let boldChars = 0
  let totalChars = 0

  for (const item of items) {
    const piece = normalizeText(item.text)
    const gap = item.x - prevEnd
    const needsSpace =
      text !== '' && gap > Math.min(item.fontSize, prevSize) * WORD_GAP && !/\s$/.test(text) && !/^\s/.test(piece)
    const added = (needsSpace ? ' ' : '') + piece
    text += added

    const last = runs[runs.length - 1]
    if (last && last.bold === item.bold) last.text += added
    else runs.push({ text: added, bold: item.bold })

    const chars = piece.replace(/\s/g, '').length
    const size = Math.round(item.fontSize * 10) / 10
    charsBySize.set(size, (charsBySize.get(size) ?? 0) + chars)
    totalChars += chars
    if (item.bold) boldChars += chars

    prevEnd = item.x + item.width
    prevSize = item.fontSize
  }

  const fontSize = largestKey(charsBySize)
  const reference = items.find((i) => Math.round(i.fontSize * 10) / 10 === fontSize) ?? items[0]

  return {
    page,
    text: text.replace(/\s+/g, ' ').trim(),
    x: items[0]?.x ?? 0,
    xEnd: Math.max(...items.map((i) => i.x + i.width)),
    y: reference?.y ?? 0,
    fontSize,
    bold: totalChars > 0 && boldChars / totalChars >= 0.6,
    boldRuns: runs
      .filter((r) => r.bold)
      .map((r) => r.text.replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 2),
    column: 0
  }
}

// ── Step 2: reading order (single vs. two columns) ─────────────────────────
/**
 * Detects a two-column page and returns lines in reading order.
 *
 * Lines that span both columns (titles, full-width figures captions) split
 * the page into horizontal bands. Within each band the left column is read
 * before the right one, which handles a full-width title above two columns.
 */
export function orderForReading(lines: Line[]): Line[] {
  const topDown = (a: Line, b: Line) => b.y - a.y || a.x - b.x
  if (lines.length < 10) return [...lines].sort(topDown)

  const left = Math.min(...lines.map((l) => l.x))
  const right = Math.max(...lines.map((l) => l.xEnd))
  const mid = (left + right) / 2
  const tolerance = (right - left) * 0.02

  const isSpanning = (l: Line) => l.x < mid - tolerance && l.xEnd > mid + tolerance
  const isRight = (l: Line) => !isSpanning(l) && l.x >= mid - tolerance
  const isLeft = (l: Line) => !isSpanning(l) && !isRight(l)

  const leftCount = lines.filter(isLeft).length
  const rightCount = lines.filter(isRight).length
  const spanningCount = lines.length - leftCount - rightCount
  const twoColumns =
    leftCount >= 5 && rightCount >= 5 && rightCount >= lines.length * 0.25 && spanningCount <= lines.length * 0.25

  if (!twoColumns) return [...lines].sort(topDown)

  const ordered: Line[] = []
  let band: Line[] = []
  const flushBand = () => {
    ordered.push(...band.filter(isLeft).sort(topDown).map((l) => ({ ...l, column: 0 })))
    ordered.push(...band.filter(isRight).sort(topDown).map((l) => ({ ...l, column: 1 })))
    band = []
  }
  for (const line of [...lines].sort(topDown)) {
    if (isSpanning(line)) {
      flushBand()
      ordered.push(line)
    } else {
      band.push(line)
    }
  }
  flushBand()
  return ordered
}

// ── Step 3: running headers, footers and page numbers ──────────────────────
const PAGE_NUMBER_PATTERNS = [
  /^(page\s*)?#(\s*(of|\/)\s*#)?$/i, // "12", "Page 12", "12 of 40", "12/40"
  /^[-–—]\s*#\s*[-–—]$/, // "- 12 -"
  /^[ivxlcdm]{1,7}$/i // roman numerals in front matter
]

/** Normalizes a line so "Chapter 2 · page 14" and "Chapter 2 · page 15" match. */
function marginKey(text: string): string {
  return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
}

export function removeRunningHeadersFooters(pages: { lines: Line[]; height: number }[]): Line[][] {
  const inMargin = (line: Line, height: number) =>
    height > 0 && (line.y > height * (1 - MARGIN_ZONE) || line.y < height * MARGIN_ZONE)

  // Count on how many pages each margin text appears.
  const pagesWithKey = new Map<string, number>()
  for (const { lines, height } of pages) {
    const keys = new Set(lines.filter((l) => inMargin(l, height)).map((l) => marginKey(l.text)))
    for (const key of keys) pagesWithKey.set(key, (pagesWithKey.get(key) ?? 0) + 1)
  }
  // Needs at least 3 pages to call something "repeated"; page numbers are removed regardless.
  const repeatThreshold = pages.length >= 3 ? Math.max(2, Math.ceil(pages.length * 0.5)) : Number.POSITIVE_INFINITY

  return pages.map(({ lines, height }) =>
    lines.filter((line) => {
      if (!inMargin(line, height)) return true
      const key = marginKey(line.text)
      if (PAGE_NUMBER_PATTERNS.some((p) => p.test(key))) return false
      return (pagesWithKey.get(key) ?? 0) < repeatThreshold
    })
  )
}

// ── Step 4: lines → blocks (headings, paragraphs, list items) ──────────────
/** Bullet glyphs are removed from list items; numbers and letters ("1.", "a)") are kept. */
const BULLET_GLYPH = /^[•●○◦▪▫■□‣⁃∙·*\-–—]\s+/
const LIST_MARKER = /^(\(?\d{1,3}[.)]|\(?[a-z][.)]|\([A-Z]\))\s+/
const NUMBERED_HEADING = /^((\d+\.)*\d+\.?|[A-Z]\.|chapter|section|part|unit|lesson|module|appendix)\s/i
const TERMINAL_PUNCTUATION = /[.!?:;]["'”’)\]]*$/

export function isHeadingLine(line: Line, bodyFontSize: number): boolean {
  const text = line.text
  const words = text.split(' ')
  if (!/\p{L}/u.test(text) || words.length > 15 || /[.,;]$/.test(text)) return false
  if (line.fontSize >= bodyFontSize * HEADING_SIZE_RATIO) return true
  // Bold at body size is common for key terms inside a paragraph, so a bold line
  // only counts as a heading when it also looks like one: numbered, or ALL CAPS.
  if (line.bold && line.fontSize >= bodyFontSize * 0.95) {
    const allCaps = text === text.toUpperCase() && /\p{Lu}{2}/u.test(text)
    return NUMBERED_HEADING.test(text) || allCaps
  }
  return false
}

export function buildBlocks(lines: Line[], bodyFontSize: number): Block[] {
  const vocabulary = buildVocabulary(lines)
  const headingSizes = [...new Set(lines.filter((l) => isHeadingLine(l, bodyFontSize)).map((l) => l.fontSize))].sort(
    (a, b) => b - a
  )

  const blocks: Block[] = []
  let current: Block | undefined
  let prev: Line | undefined

  for (const line of lines) {
    const heading = isHeadingLine(line, bodyFontSize)
    const isListStart = !heading && (BULLET_GLYPH.test(line.text) || LIST_MARKER.test(line.text))
    const kind: BlockKind = heading ? 'heading' : isListStart ? 'list-item' : 'paragraph'

    if (current && prev && continuesBlock(current, prev, line, kind)) {
      appendLine(current, line, vocabulary)
    } else {
      current = {
        id: blocks.length + 1,
        kind,
        text: kind === 'list-item' ? line.text.replace(BULLET_GLYPH, '') : line.text,
        page: line.page,
        pageBreaks: [],
        fontSize: line.fontSize,
        boldRuns: heading ? [] : [...line.boldRuns],
        sectionId: 0,
        ...(heading ? { level: Math.min(headingSizes.indexOf(line.fontSize) + 1 || 1, 6) } : {})
      }
      blocks.push(current)
    }
    prev = line
  }
  return blocks
}

function continuesBlock(block: Block, prev: Line, line: Line, kind: BlockKind): boolean {
  if (kind === 'list-item') return false
  if ((block.kind === 'heading') !== (kind === 'heading')) return false

  const maxSize = Math.max(prev.fontSize, line.fontSize)
  const sameFlow = prev.page === line.page && prev.column === line.column
  const verticalGap = prev.y - line.y
  const closeBelow = sameFlow && verticalGap > 0 && verticalGap <= maxSize * MAX_LINE_SPACING

  // Multi-line heading: same size, directly below.
  if (kind === 'heading') return closeBelow && Math.abs(prev.fontSize - line.fontSize) < 0.5

  if (Math.abs(prev.fontSize - line.fontSize) > maxSize * 0.15) return false
  if (closeBelow) return true

  // A paragraph that runs over a page or column break: the previous text
  // stops mid-sentence and the new line starts in lowercase.
  return !TERMINAL_PUNCTUATION.test(block.text) && /^\p{Ll}/u.test(line.text)
}

function appendLine(block: Block, line: Line, vocabulary: Set<string>): void {
  const lastPage = block.pageBreaks[block.pageBreaks.length - 1]?.page ?? block.page
  const hyphenated = /(\p{L}+)-$/u.exec(block.text)
  const nextWord = /^(\p{Ll}+)/u.exec(line.text)

  let joined: string
  if (hyphenated?.[1] && nextWord?.[1]) {
    // "automa-" + "tion": drop the hyphen, unless the document itself uses the
    // hyphenated form elsewhere ("open-" + "source" → "open-source").
    const withHyphen = `${hyphenated[1]}-${nextWord[1]}`.toLowerCase()
    const withoutHyphen = `${hyphenated[1]}${nextWord[1]}`.toLowerCase()
    const keepHyphen = vocabulary.has(withHyphen) && !vocabulary.has(withoutHyphen)
    joined = keepHyphen ? block.text : block.text.slice(0, -1)
  } else {
    joined = `${block.text} `
  }

  if (line.page !== lastPage) block.pageBreaks.push({ offset: joined.length, page: line.page })
  block.text = joined + line.text
  block.boldRuns.push(...line.boldRuns)
}

function buildVocabulary(lines: Line[]): Set<string> {
  const words = new Set<string>()
  for (const line of lines) {
    for (const word of line.text.toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) ?? []) words.add(word)
  }
  return words
}

// ── Step 5: sections and sentences ─────────────────────────────────────────
function assignSections(blocks: Block[]): Section[] {
  const sections: Section[] = []
  let current: Section | undefined

  for (const block of blocks) {
    const lastPage = block.pageBreaks[block.pageBreaks.length - 1]?.page ?? block.page
    if (block.kind === 'heading') {
      current = { id: sections.length + 1, title: block.text, level: block.level ?? 1, pageStart: block.page, pageEnd: lastPage }
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

function extractSentences(blocks: Block[]): Sentence[] {
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

// ── Helpers ─────────────────────────────────────────────────────────────────
function summarizePage(page: RawPage): PageSummary {
  const charCount = page.items.reduce((sum, item) => sum + item.text.replace(/\s/g, '').length, 0)
  return { pageNumber: page.pageNumber, charCount, hasText: charCount >= MIN_PAGE_CHARS }
}

function textLayerWarnings(pages: PageSummary[]): string[] {
  const empty = pages.filter((p) => !p.hasText).map((p) => p.pageNumber)
  if (pages.length === 0) return ['The PDF has no pages.']
  if (empty.length === pages.length) {
    return ['No text found. This PDF is probably scanned images; OCR support is planned for a later version.']
  }
  if (empty.length > 0) {
    return [`No extractable text on page(s) ${formatPageList(empty)} (images, diagrams or scanned pages).`]
  }
  return []
}

function formatPageList(pages: number[]): string {
  return pages.length > 10 ? `${pages.slice(0, 10).join(', ')} and ${pages.length - 10} more` : pages.join(', ')
}

/** The font size used by the most characters: almost always the body text. */
function dominantFontSize(lines: Line[]): number {
  const chars = new Map<number, number>()
  for (const line of lines) chars.set(line.fontSize, (chars.get(line.fontSize) ?? 0) + line.text.length)
  return largestKey(chars)
}

function largestKey(counts: Map<number, number>): number {
  let best = 0
  let bestCount = -1
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key
      bestCount = count
    }
  }
  return best
}
