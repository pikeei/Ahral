import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RawPage, RawTextItem } from './types'

export interface LoadPdfOptions {
  /**
   * Folder with PDF.js's bundled standard fonts (pdfjs-dist/standard_fonts/).
   * Only needed in Node; without it PDF.js still extracts text but may log font warnings.
   */
  standardFontDataUrl?: string
}

/**
 * The only place that talks to PDF.js. It converts PDF.js output into
 * plain `RawPage` data, which the rest of the pipeline works on.
 * Uses the "legacy" build because it runs in both Node and Electron.
 */
export async function loadPdfPages(data: Uint8Array, options: LoadPdfOptions = {}): Promise<RawPage[]> {
  const task = getDocument({
    // PDF.js takes ownership of (detaches) the buffer it's given, so pass a copy.
    data: data.slice(),
    // Exposes real font names like "Arial-BoldMT", which is how bold text is detected.
    fontExtraProperties: true,
    verbosity: 0,
    ...(options.standardFontDataUrl ? { standardFontDataUrl: options.standardFontDataUrl } : {})
  })

  try {
    const pdf = await task.promise
    const pages: RawPage[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view
      const content = await page.getTextContent()
      // Fonts are only fully loaded once the page's drawing operations are parsed;
      // after that, their real names can be looked up.
      await page.getOperatorList()

      const items: RawTextItem[] = []
      for (const raw of content.items) {
        if (!('str' in raw) || raw.str.trim() === '') continue
        const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = raw.transform as number[]
        // Skip rotated text (watermarks, vertical margin labels): it's never body text.
        if (Math.abs(b) > 0.01 * Math.abs(a) || Math.abs(c) > 0.01 * Math.abs(d)) continue

        const fontName = realFontName(page.commonObjs, raw.fontName)
        items.push({
          text: raw.str,
          x: e - x0,
          y: f - y0,
          width: raw.width,
          height: raw.height,
          fontSize: Math.hypot(c, d) || raw.height,
          fontName,
          bold: isBoldFontName(fontName)
        })
      }

      pages.push({ pageNumber, width: x1 - x0, height: y1 - y0, items })
      page.cleanup()
    }

    return pages
  } finally {
    await task.destroy()
  }
}

function realFontName(commonObjs: { get(id: string): unknown }, id: string): string {
  try {
    const font = commonObjs.get(id) as { name?: unknown } | undefined
    return typeof font?.name === 'string' ? font.name : id
  } catch {
    return id // font not loaded (e.g. a broken PDF): fall back to the internal id
  }
}

/** "ABCDEF+Arial-BoldMT" → bold. The 6-letter prefix marks an embedded font subset. */
export function isBoldFontName(fontName: string): boolean {
  const name = fontName.replace(/^[A-Z]{6}\+/, '')
  return /bold|black|heavy|semibold|demi/i.test(name)
}
