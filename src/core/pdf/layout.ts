import { buildBlocks } from './blocks'
import { dominantFontSize } from './font-size'
import type { ExtractedDocument, LayoutOptions } from './layout-types'
import { buildLines } from './lines'
import { isTableOfContentsLine, removeRunningHeadersFooters } from './margins'
import { isLikelyScanned, summarizePage, textLayerWarnings } from './page-summary'
import { orderForReading } from './reading-order'
import { repairMissingLetters } from './repair-blocks'
import { assignSections, extractSentences } from './sections'
import type { RawPage } from './types'

/*
 * Layout analysis: turns positioned text fragments into readable structure.
 *
 *   items -> lines -> reading order -> drop headers/footers/TOC -> blocks -> repair -> sections + sentences
 *   (lines.ts) (reading-order.ts)    (margins.ts)                (blocks.ts) (repair-blocks.ts) (sections.ts)
 *
 * Every threshold is relative to font size or page size, never an absolute
 * number of points, so the rules behave the same on any page size.
 */

export { buildBlocks, isHeadingLine } from './blocks'
export type {
  Block,
  BlockKind,
  ExtractedDocument,
  LayoutOptions,
  Line,
  PageSummary,
  Section,
  Sentence
} from './layout-types'
export { buildLines } from './lines'
export { removeRunningHeadersFooters } from './margins'
export { orderForReading } from './reading-order'

export function analyzeLayout(rawPages: RawPage[], options: LayoutOptions = {}): ExtractedDocument {
  const pages = rawPages.map(summarizePage)
  const warnings = textLayerWarnings(pages)
  const likelyScanned = isLikelyScanned(pages)

  const linesPerPage = rawPages.map((page) => orderForReading(buildLines(page)))
  const cleaned = removeRunningHeadersFooters(
    linesPerPage.map((lines, i) => ({ lines, height: rawPages[i]?.height ?? 0 }))
  )
  const allLines = cleaned.flat().filter((line) => !isTableOfContentsLine(line))

  const bodyFontSize = dominantFontSize(allLines)
  const blocks = buildBlocks(allLines, bodyFontSize)
  warnings.push(...repairMissingLetters(allLines, blocks, options.isWord))
  const sections = assignSections(blocks)
  const sentences = extractSentences(blocks)

  if (sentences.length === 0 && !likelyScanned) {
    warnings.push('No sentences could be extracted from this PDF.')
  }

  return { pageCount: rawPages.length, pages, bodyFontSize, sections, blocks, sentences, likelyScanned, warnings }
}
