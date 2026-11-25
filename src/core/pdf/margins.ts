import type { Line } from './layout-types'

/** Step 3: running headers, footers, page numbers and table-of-contents lines. */

/** Lines in the top/bottom fraction of the page are candidates for running headers/footers. */
const MARGIN_ZONE = 0.1
/** Margin text on at least this share of pages is a running header or footer. */
const REPEATED_SHARE = 0.1

const PAGE_NUMBER_PATTERNS = [
  /^(page\s*)?#(\s*(of|\/)\s*#)?$/i, // "12", "Page 12", "12 of 40", "12/40"
  /^[-–—]\s*#\s*[-–—]$/, // "- 12 -"
  /^[ivxlcdm]{1,7}$/i // roman numerals in front matter
]

/** Five or more dots in a row, with or without spaces: a table-of-contents leader. */
const DOT_LEADER = /(?:\.\s?){5,}/

/** "Introduction . . . . . 12" is navigation, not content. */
export function isTableOfContentsLine(line: Line): boolean {
  return DOT_LEADER.test(line.text)
}

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
  // A running header may cover only one part of a book ("Answers: 213-228" on the answer
  // pages), so a tenth of the pages is enough.
  const repeatThreshold =
    pages.length >= 3 ? Math.max(2, Math.ceil(pages.length * REPEATED_SHARE)) : Number.POSITIVE_INFINITY

  return pages.map(({ lines, height }) =>
    lines.filter((line) => {
      if (!inMargin(line, height)) return true
      const key = marginKey(line.text)
      if (PAGE_NUMBER_PATTERNS.some((p) => p.test(key))) return false
      return (pagesWithKey.get(key) ?? 0) < repeatThreshold
    })
  )
}
