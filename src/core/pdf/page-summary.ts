import type { PageSummary } from './layout-types'
import type { RawPage } from './types'

/** Per-page text statistics and the warnings derived from them (empty or scanned pages). */

/** Pages with fewer non-space characters than this are treated as having no text layer. */
const MIN_PAGE_CHARS = 25
/** A document is "likely scanned" when fewer than this share of its pages have text. */
const MIN_TEXT_PAGE_SHARE = 0.5

export function summarizePage(page: RawPage): PageSummary {
  const charCount = page.items.reduce((sum, item) => sum + item.text.replace(/\s/g, '').length, 0)
  return { pageNumber: page.pageNumber, charCount, hasText: charCount >= MIN_PAGE_CHARS }
}

export function isLikelyScanned(pages: PageSummary[]): boolean {
  return pages.length > 0 && pages.filter((p) => p.hasText).length / pages.length < MIN_TEXT_PAGE_SHARE
}

export function textLayerWarnings(pages: PageSummary[]): string[] {
  const empty = pages.filter((p) => !p.hasText).map((p) => p.pageNumber)
  if (pages.length === 0) return ['The PDF has no pages.']
  if (empty.length === pages.length) {
    return ['No text found. This PDF is probably scanned images; OCR support is planned for a later version.']
  }
  if (empty.length > 0) {
    return [`No extractable text on page(s) ${formatPageList(empty)} (images, diagrams or scanned pages).`]
  }
  return []
}

function formatPageList(pages: number[]): string {
  return pages.length > 10 ? `${pages.slice(0, 10).join(', ')} and ${pages.length - 10} more` : pages.join(', ')
}
