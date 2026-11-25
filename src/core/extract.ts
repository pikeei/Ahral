import { analyzeLayout, type ExtractedDocument, type LayoutOptions } from './pdf/layout'
import { type LoadPdfOptions, loadPdfPages } from './pdf/pdfjs-adapter'

export type { ExtractedDocument } from './pdf/layout'

export type ExtractOptions = LoadPdfOptions & LayoutOptions

/** PDF bytes → structured text (sections, blocks, sentences with page numbers). */
export async function extractDocument(data: Uint8Array, options: ExtractOptions = {}): Promise<ExtractedDocument> {
  return analyzeLayout(await loadPdfPages(data, options), options)
}
