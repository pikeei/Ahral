/**
 * Plain-data view of a PDF page's text, independent of PDF.js.
 * Layout logic only depends on these types, so it can be unit-tested
 * with hand-written fixtures instead of real PDF files.
 *
 * Coordinates are PDF points (1/72 inch) with the origin at the
 * bottom-left of the page, so a larger `y` is higher on the page.
 */
export interface RawTextItem {
  text: string
  x: number
  /** Baseline position. */
  y: number
  width: number
  height: number
  fontSize: number
  fontName: string
  bold: boolean
}

export interface RawPage {
  pageNumber: number
  width: number
  height: number
  items: RawTextItem[]
}
