import type { Line } from './layout-types'

/** The key with the highest count; ties go to the first seen. */
export function largestKey(counts: Map<number, number>): number {
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

/** The font size used by the most characters: almost always the body text. */
export function dominantFontSize(lines: Line[]): number {
  const chars = new Map<number, number>()
  for (const line of lines) chars.set(line.fontSize, (chars.get(line.fontSize) ?? 0) + line.text.length)
  return largestKey(chars)
}
