import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPdf, textLines } from '../../tests/fixtures/pdf-builder'
import { extractDocument } from './extract'
import { isBoldFontName } from './pdf/pdfjs-adapter'

// Integration tests: real PDF bytes → PDF.js → layout analysis.
const standardFontDataUrl = `${resolve('node_modules/pdfjs-dist/standard_fonts')}/`

describe('extractDocument (real PDFs)', () => {
  it('extracts headings, sections, bold terms and sentences with page numbers', async () => {
    const pdf = await buildPdf([
      [
        { text: 'Testing Tools Reviewer', y: 760, size: 9 },
        { text: 'Chapter 1 Automation', y: 700, size: 20, bold: true },
        { text: 'Selenium', y: 660, bold: true },
        // "Selenium" in Helvetica-Bold 11pt is about 49pt wide, so x=125 leaves a normal word gap.
        { text: 'is an open-source framework used to automate web', x: 125, y: 660 },
        ...textLines(['browsers. Postman is a tool for API testing.'], 645),
        { text: '1', x: 300, y: 30, size: 9 }
      ],
      [
        { text: 'Testing Tools Reviewer', y: 760, size: 9 },
        { text: 'Chapter 2 Performance', y: 700, size: 20, bold: true },
        ...textLines(['JMeter is a performance testing tool.'], 660),
        { text: '2', x: 300, y: 30, size: 9 }
      ],
      [
        { text: 'Testing Tools Reviewer', y: 760, size: 9 },
        ...textLines(['Load testing measures behaviour under expected load.'], 660),
        { text: '3', x: 300, y: 30, size: 9 }
      ]
    ])

    const doc = await extractDocument(pdf, { standardFontDataUrl })

    expect(doc.pageCount).toBe(3)
    expect(doc.warnings).toEqual([])
    expect(doc.bodyFontSize).toBe(11)
    expect(doc.sections.map((s) => [s.title, s.pageStart, s.pageEnd])).toEqual([
      ['Chapter 1 Automation', 1, 1],
      ['Chapter 2 Performance', 2, 3]
    ])
    expect(doc.sentences.map((s) => [s.text, s.page, s.sectionId])).toEqual([
      ['Selenium is an open-source framework used to automate web browsers.', 1, 1],
      ['Postman is a tool for API testing.', 1, 1],
      ['JMeter is a performance testing tool.', 2, 2],
      ['Load testing measures behaviour under expected load.', 3, 2]
    ])
    expect(doc.blocks.find((b) => b.text.startsWith('Selenium'))?.boldRuns).toEqual(['Selenium'])
  })

  it('reports a PDF with no text layer as likely scanned', async () => {
    const doc = await extractDocument(await buildPdf([[], []]), { standardFontDataUrl })
    expect(doc.likelyScanned).toBe(true)
  })

  it('rejects data that is not a PDF', async () => {
    await expect(extractDocument(new TextEncoder().encode('not a pdf'))).rejects.toThrow()
  })
})

describe('isBoldFontName', () => {
  it.each([
    ['Helvetica-Bold', true],
    ['ABCDEF+Arial-BoldMT', true],
    ['TimesNewRomanPS-BoldItalicMT', true],
    ['SourceSansPro-Semibold', true],
    ['Roboto-Black', true],
    ['Helvetica', false],
    ['ABCDEF+Calibri-Italic', false]
  ])('%s → %s', (name, expected) => {
    expect(isBoldFontName(name)).toBe(expected)
  })
})
