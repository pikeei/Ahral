import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Builds real PDF files from a simple description, so tests and demos have
 * PDFs with known content without committing binary files to the repo.
 */
export interface PdfLine {
  text: string
  x?: number
  y: number
  size?: number
  bold?: boolean
}

export async function buildPdf(pages: PdfLine[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  for (const lines of pages) {
    const page = doc.addPage([612, 792])
    for (const line of lines) {
      page.drawText(line.text, {
        x: line.x ?? 72,
        y: line.y,
        size: line.size ?? 11,
        font: line.bold ? bold : regular
      })
    }
  }
  return doc.save()
}

/** Lines of text from `top` downward with normal spacing. */
export function textLines(lines: string[], top: number, opts: { x?: number; size?: number } = {}): PdfLine[] {
  const size = opts.size ?? 11
  return lines.map((text, i) => ({ text, x: opts.x ?? 72, y: top - i * size * 1.35, size }))
}
