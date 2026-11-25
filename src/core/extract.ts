import { analyzeLayout, type ExtractedDocument } from './pdf/layout'
import { loadPdfPages, type LoadPdfOptions } from './pdf/pdfjs-adapter'

export type { ExtractedDocument } from './pdf/layout'

/** PDF bytes → structured text (sections, blocks, sentences with page numbers). */
export async function extractDocument(data: Uint8Array, options?: LoadPdfOptions): Promise<ExtractedDocument> {
  return analyzeLayout(await loadPdfPages(data, options))
}
