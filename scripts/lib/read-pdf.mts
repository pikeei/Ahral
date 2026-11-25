import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractDocument, type ExtractedDocument } from '../../src/core/extract'

/** Reads and extracts a PDF from disk for the developer CLIs. */
export async function readPdf(file: string): Promise<{ path: string; doc: ExtractedDocument; ms: number }> {
  const path = resolve(file)
  const data = new Uint8Array(await readFile(path))
  // PDF.js wants a path ending in "/", even on Windows.
  const standardFontDataUrl = fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
    .replace(/\\/g, '/')
    .replace(/\/?$/, '/')
  const started = performance.now()
  const doc = await extractDocument(data, { standardFontDataUrl })
  return { path, doc, ms: Math.round(performance.now() - started) }
}
