import type { RawPage, RawTextItem } from './types'

/** Letter-size page in PDF points. */
export const PAGE_WIDTH = 612
export const PAGE_HEIGHT = 792

/**
 * A text fragment for layout tests. Width is estimated at half the font
 * size per character, which is close enough for proportional fonts.
 */
export function item(text: string, x: number, y: number, opts: { size?: number; bold?: boolean } = {}): RawTextItem {
  const size = opts.size ?? 11
  return {
    text,
    x,
    y,
    width: text.length * size * 0.5,
    height: size,
    fontSize: size,
    fontName: opts.bold ? 'Helvetica-Bold' : 'Helvetica',
    bold: opts.bold ?? false
  }
}

export function page(pageNumber: number, items: RawTextItem[]): RawPage {
  return { pageNumber, width: PAGE_WIDTH, height: PAGE_HEIGHT, items }
}

/** Lines of body text stacked from `top` downward with normal line spacing. */
export function paragraph(lines: string[], x: number, top: number, opts: { size?: number; spacing?: number } = {}): RawTextItem[] {
  const size = opts.size ?? 11
  const spacing = opts.spacing ?? size * 1.3
  return lines.map((text, i) => item(text, x, top - i * spacing, { size }))
}
