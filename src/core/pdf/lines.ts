import { normalizeText } from '../text/normalize'
import { largestKey } from './font-size'
import type { Line } from './layout-types'
import type { RawPage, RawTextItem } from './types'

/** Step 1: positioned text items -> lines. */

/** Items whose baselines differ by less than this × font size share a line. */
const SAME_LINE_TOLERANCE = 0.5
/** A horizontal gap wider than this × font size between items means a space. */
const WORD_GAP = 0.15
/**
 * A gap wider than this × font size splits a row into separate segments (columns, table cells).
 * Word spaces are about 0.25 × font size; real column gutters can be as narrow as ~2×.
 * PDF.js already puts spaces inside an item's text, so gaps between items are rarely words.
 */
const SEGMENT_GAP = 1.5
/** A line counts as bold when at least this share of its characters is bold. */
const BOLD_LINE_SHARE = 0.6

export function buildLines(page: RawPage): Line[] {
  const items = page.items.filter((item) => item.text.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)

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
    bold: totalChars > 0 && boldChars / totalChars >= BOLD_LINE_SHARE,
    boldRuns: runs
      .filter((r) => r.bold)
      .map((r) => r.text.replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 2),
    column: 0
  }
}
