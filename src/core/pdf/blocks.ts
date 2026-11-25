import type { Block, BlockKind, Line } from './layout-types'

/** Step 4: lines -> blocks (headings, paragraphs, list items). */

/** A line counts as a heading when its font is at least this × the body font size. */
const HEADING_SIZE_RATIO = 1.15
/** Within one block, consecutive lines are at most this × font size apart vertically. */
const MAX_LINE_SPACING = 2.0
/** Lines whose font sizes differ by more than this share belong to different blocks. */
const MAX_SIZE_CHANGE = 0.15
/** Longest line, in words, that can still be a heading. */
const MAX_HEADING_WORDS = 15

/** Bullet glyphs are removed from list items; numbers and letters ("1.", "a)") are kept. */
const BULLET_GLYPH = /^[•●○◦▪▫■□‣⁃∙·*\-–—]\s+/
const LIST_MARKER = /^(\(?\d{1,3}[.)]|\(?[a-z][.)]|\([A-Z]\))\s+/
const NUMBERED_HEADING = /^((\d+\.)*\d+\.?|[A-Z]\.|chapter|section|part|unit|lesson|module|appendix)\s/i
const TERMINAL_PUNCTUATION = /[.!?:;]["'”’)\]]*$/
/**
 * A line that starts in lowercase or stops on a small connecting word is the middle of
 * a sentence ("section is followed by answers or by completions of the"), not a title,
 * even when it is set in a large font, as in a boxed "Directions" paragraph.
 */
const STARTS_LOWERCASE = /^\p{Ll}/u
const ENDS_ON_CONNECTING_WORD = /\b(?:the|a|an|of|and|or|to|by|in|for|with|that|is|are)$/i

export function isHeadingLine(line: Line, bodyFontSize: number): boolean {
  const text = line.text
  const words = text.split(' ')
  if (!/\p{L}/u.test(text) || words.length > MAX_HEADING_WORDS || /[.,;]$/.test(text)) return false
  if (STARTS_LOWERCASE.test(text) || ENDS_ON_CONNECTING_WORD.test(text)) return false
  // A lone letter in a large font is a label on an image ("L", "R" side markers), not a title.
  if (!/\p{L}{2}/u.test(text)) return false
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

  if (Math.abs(prev.fontSize - line.fontSize) > maxSize * MAX_SIZE_CHANGE) return false
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
    // hyphenated form elsewhere ("open-" + "source" -> "open-source").
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
