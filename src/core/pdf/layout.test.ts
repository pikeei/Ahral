import { describe, expect, it } from 'vitest'
import { analyzeLayout, buildLines, isHeadingLine, type Line } from './layout'
import { item, page, paragraph, PAGE_HEIGHT } from './test-helpers'

const lineTexts = (lines: Line[]) => lines.map((l) => l.text)

describe('buildLines', () => {
  it('joins fragments on one baseline in left-to-right order, adding spaces only at gaps', () => {
    const lines = buildLines(
      page(1, [
        item('framework', 215, 700), // out of order on purpose
        item('Selenium', 72, 700),
        item('is a', 120, 700),
        item('open-', 150, 700),
        item('source', 177.5, 700) // touches "open-" exactly: no space
      ])
    )
    expect(lineTexts(lines)).toEqual(['Selenium is a open-source framework'])
  })

  it('keeps a slightly raised fragment (superscript) on its line', () => {
    const lines = buildLines(page(1, [item('E = mc', 72, 700), item('2', 105, 703, { size: 7 })]))
    expect(lines).toHaveLength(1)
  })

  it('splits a row with a wide gap into separate lines', () => {
    const lines = buildLines(page(1, [item('Left column text', 72, 700), item('Right column text', 330, 700)]))
    expect(lineTexts(lines)).toEqual(['Left column text', 'Right column text'])
  })

  it('records bold fragments inside a line', () => {
    const lines = buildLines(page(1, [item('Selenium', 72, 700, { bold: true }), item('is a browser tool.', 120, 700)]))
    expect(lines[0]?.boldRuns).toEqual(['Selenium'])
    expect(lines[0]?.bold).toBe(false)
  })
})

describe('reading order', () => {
  it('reads a two-column page left column first, with a full-width title on top', () => {
    const left = Array.from({ length: 8 }, (_, i) => `Left line ${i + 1}`)
    const right = Array.from({ length: 8 }, (_, i) => `Right line ${i + 1}`)
    const doc = analyzeLayout([
      page(1, [
        item('A title that spans across both columns of the page', 72, 740, { size: 11 }),
        ...paragraph(left, 72, 700),
        ...paragraph(right, 330, 700)
      ])
    ])
    const text = doc.blocks.map((b) => b.text).join(' | ')
    expect(text.indexOf('A title')).toBeLessThan(text.indexOf('Left line 1'))
    expect(text.indexOf('Left line 8')).toBeLessThan(text.indexOf('Right line 1'))
  })
})

describe('narrow column gutters', () => {
  it('keeps columns apart when the gutter is only about twice the font size', () => {
    // Left column ends at 72 + 30 chars * 5.5 = 237; right column starts 22pt later (2x the 11pt font).
    const left = Array.from({ length: 8 }, (_, i) => `Left column sentence number ${i + 1}.`.padEnd(30, ' '))
    const right = Array.from({ length: 8 }, (_, i) => `Right column sentence number ${i + 1}.`)
    const doc = analyzeLayout([page(1, [...paragraph(left, 72, 700), ...paragraph(right, 259, 700)])])
    const sentences = doc.sentences.map((s) => s.text)
    expect(sentences[0]).toBe('Left column sentence number 1.')
    expect(sentences.indexOf('Left column sentence number 8.')).toBeLessThan(sentences.indexOf('Right column sentence number 1.'))
  })
})

describe('table of contents', () => {
  it('drops lines with dot leaders', () => {
    const doc = analyzeLayout([
      page(1, paragraph(['Introduction . . . . . . . . . . 12', 'Test Levels.............. 15', 'Real sentence here.'], 72, 700))
    ])
    expect(doc.sentences.map((s) => s.text)).toEqual(['Real sentence here.'])
  })
})

describe('running headers and footers', () => {
  const bodyPage = (n: number) =>
    page(n, [
      item('Software Testing Reviewer', 72, PAGE_HEIGHT - 30), // header
      item(`Page ${n} of 4`, 280, 30), // footer
      ...paragraph([`Body sentence on page ${n}.`], 72, 600)
    ])

  it('removes text that repeats in the margins and page numbers', () => {
    const doc = analyzeLayout([1, 2, 3, 4].map(bodyPage))
    const all = doc.blocks.map((b) => b.text).join(' ')
    expect(all).not.toContain('Software Testing Reviewer')
    expect(all).not.toContain('Page')
    expect(doc.sentences.map((s) => s.text)).toEqual([1, 2, 3, 4].map((n) => `Body sentence on page ${n}.`))
  })

  it('keeps repeated text that is in the body area', () => {
    const pages = [1, 2, 3].map((n) => page(n, paragraph(['Remember this rule.'], 72, 500)))
    expect(analyzeLayout(pages).sentences).toHaveLength(3)
  })

  it('does not treat a margin line as repeated in a 2-page document', () => {
    const pages = [1, 2].map((n) => page(n, [item('Course notes', 72, PAGE_HEIGHT - 30), ...paragraph(['Text.'], 72, 600)]))
    expect(analyzeLayout(pages).blocks.some((b) => b.text === 'Course notes')).toBe(true)
  })
})

describe('headings and sections', () => {
  const line = (text: string, fontSize: number, bold = false): Line => ({
    page: 1, text, x: 72, xEnd: 300, y: 700, fontSize, bold, boldRuns: [], column: 0
  })

  it.each([
    ['larger font', line('Introduction', 16), true],
    ['numbered bold line', line('2.1 Test Levels', 11, true), true],
    ['ALL CAPS bold line', line('KEY TERMS', 11, true), true],
    ['bold term at body size', line('Selenium', 11, true), false],
    ['large text ending with a period', line('This is a sentence.', 16), false],
    ['plain body line', line('Testing finds defects', 11), false],
    ['too many words', line('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen', 16), false]
  ])('%s → %s', (_name, l, expected) => {
    expect(isHeadingLine(l, 11)).toBe(expected)
  })

  it('assigns sentences to the section under each heading, with levels by size', () => {
    const doc = analyzeLayout([
      page(1, [
        ...paragraph(['Preface text before any heading.'], 72, 760),
        item('Chapter 1 Testing', 72, 720, { size: 20, bold: true }),
        item('1.1 Tools', 72, 690, { size: 14, bold: true }),
        ...paragraph(['Selenium automates browsers. Postman tests APIs.'], 72, 660)
      ])
    ])
    expect(doc.sections.map((s) => [s.title, s.level])).toEqual([
      [null, 1],
      ['Chapter 1 Testing', 1],
      ['1.1 Tools', 2]
    ])
    expect(doc.sentences.map((s) => [s.text, s.sectionId])).toEqual([
      ['Preface text before any heading.', 1],
      ['Selenium automates browsers.', 3],
      ['Postman tests APIs.', 3]
    ])
  })

  it('merges a heading that wraps onto two lines', () => {
    const doc = analyzeLayout([
      page(1, [
        item('Introduction to Software', 72, 720, { size: 18 }),
        item('Quality Assurance', 72, 698, { size: 18 }),
        ...paragraph(['Body text is the most common size, so it sets the baseline.'], 72, 660)
      ])
    ])
    expect(doc.sections.map((s) => s.title)).toEqual(['Introduction to Software Quality Assurance'])
  })
})

describe('paragraphs', () => {
  it('joins wrapped lines into one paragraph and removes line-break hyphens', () => {
    const doc = analyzeLayout([page(1, paragraph(['Selenium is used for browser automa-', 'tion in many teams.'], 72, 700))])
    expect(doc.sentences.map((s) => s.text)).toEqual(['Selenium is used for browser automation in many teams.'])
  })

  it('keeps the hyphen when the document uses the hyphenated word elsewhere', () => {
    const doc = analyzeLayout([
      page(1, [
        ...paragraph(['Selenium is an open-', 'source framework.'], 72, 700),
        ...paragraph(['Many open-source tools exist.'], 72, 600)
      ])
    ])
    expect(doc.sentences[0]?.text).toBe('Selenium is an open-source framework.')
  })

  it('starts a new paragraph after a large vertical gap', () => {
    const doc = analyzeLayout([page(1, [...paragraph(['First paragraph'], 72, 700), ...paragraph(['Second paragraph'], 72, 640)])])
    expect(doc.blocks.map((b) => b.text)).toEqual(['First paragraph', 'Second paragraph'])
  })

  it('continues a sentence across a page break and reports the page where it starts', () => {
    const doc = analyzeLayout([
      page(1, paragraph(['Intro sentence. Regression testing checks that', 'existing features'], 72, 100)),
      page(2, paragraph(['still work after a change. Next sentence.'], 72, 740))
    ])
    expect(doc.sentences.map((s) => [s.text, s.page])).toEqual([
      ['Intro sentence.', 1],
      ['Regression testing checks that existing features still work after a change.', 1],
      ['Next sentence.', 2]
    ])
  })

  it('does not continue across a page when the previous text ended a sentence', () => {
    const doc = analyzeLayout([page(1, paragraph(['Done here.'], 72, 100)), page(2, paragraph(['fresh start'], 72, 740))])
    expect(doc.blocks).toHaveLength(2)
  })

  it('makes each bullet its own list item and strips the bullet glyph', () => {
    const doc = analyzeLayout([
      page(1, paragraph(['• Selenium - browser automation', '• Postman - API testing', '1. Install Node first'], 72, 700))
    ])
    expect(doc.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['list-item', 'Selenium - browser automation'],
      ['list-item', 'Postman - API testing'],
      ['list-item', '1. Install Node first']
    ])
  })
})

describe('text layer detection', () => {
  it('flags a PDF with no text as likely scanned', () => {
    const doc = analyzeLayout([page(1, []), page(2, [])])
    expect(doc.likelyScanned).toBe(true)
    expect(doc.warnings[0]).toMatch(/scanned/)
  })

  it('lists pages without text in an otherwise normal PDF', () => {
    const text = paragraph(['This page has a normal amount of text on it.'], 72, 700)
    const doc = analyzeLayout([page(1, text), page(2, []), page(3, text)])
    expect(doc.likelyScanned).toBe(false)
    expect(doc.warnings).toEqual(['No extractable text on page(s) 2 (images, diagrams or scanned pages).'])
  })
})
