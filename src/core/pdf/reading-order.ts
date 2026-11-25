import type { Line } from './layout-types'

/** Step 2: reading order (single vs. two columns). */

/** Pages with fewer lines than this are always read top to bottom. */
const MIN_LINES_FOR_COLUMNS = 10
/** Each column needs at least this many lines. */
const MIN_LINES_PER_COLUMN = 5
/** The right column must hold at least this share of the page's lines... */
const MIN_RIGHT_SHARE = 0.25
/** ...and at most this share of lines may span both columns. */
const MAX_SPANNING_SHARE = 0.25

/**
 * Detects a two-column page and returns lines in reading order.
 *
 * Lines that span both columns (titles, full-width figure captions) split
 * the page into horizontal bands. Within each band the left column is read
 * before the right one, which handles a full-width title above two columns.
 */
export function orderForReading(lines: Line[]): Line[] {
  const topDown = (a: Line, b: Line) => b.y - a.y || a.x - b.x
  if (lines.length < MIN_LINES_FOR_COLUMNS) return [...lines].sort(topDown)

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
    leftCount >= MIN_LINES_PER_COLUMN &&
    rightCount >= MIN_LINES_PER_COLUMN &&
    rightCount >= lines.length * MIN_RIGHT_SHARE &&
    spanningCount <= lines.length * MAX_SPANNING_SHARE

  if (!twoColumns) return [...lines].sort(topDown)

  const ordered: Line[] = []
  let band: Line[] = []
  const flushBand = () => {
    ordered.push(
      ...band
        .filter(isLeft)
        .sort(topDown)
        .map((l) => ({ ...l, column: 0 }))
    )
    ordered.push(
      ...band
        .filter(isRight)
        .sort(topDown)
        .map((l) => ({ ...l, column: 1 }))
    )
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
