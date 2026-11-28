import { describe, expect, it } from 'vitest'
import { analyzeLayout, buildLines, isHeadingLine, type Line, sectionLabel } from './layout'
import { item, PAGE_HEIGHT, page, paragraph } from './test-helpers'

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

describe('fake-bold overprints', () => {
  it('keeps one copy of text drawn twice at nearly the same spot', () => {
    const lines = buildLines(
      page(1, [
        item('Answers and Explanations', 72, 700, { size: 14 }),
        item('Answers and Explanations', 72.6, 700.2, { size: 14 })
      ])
    )
    expect(lineTexts(lines)).toEqual(['Answers and Explanations'])
  })

  it('keeps the same text when it really appears twice', () => {
    const lines = buildLines(page(1, [item('Note', 72, 700), item('Note', 72, 500)]))
    expect(lineTexts(lines)).toEqual(['Note', 'Note'])
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
    expect(sentences.indexOf('Left column sentence number 8.')).toBeLessThan(
      sentences.indexOf('Right column sentence number 1.')
    )
  })
})

describe('table of contents', () => {
  it('drops lines with dot leaders', () => {
    const doc = analyzeLayout([
      page(
        1,
        paragraph(
          ['Introduction . . . . . . . . . . 12', 'Test Levels.............. 15', 'Real sentence here.'],
          72,
          700
        )
      )
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

  it('removes a header that runs through only one part of the book ("Answers: 1-14")', () => {
    // 20 pages; the answer pages (the last 4) carry a header whose numbers change on each page.
    const pages = Array.from({ length: 20 }, (_, i) => {
      const n = i + 1
      const header = n > 16 ? [item(`Answers: ${(n - 17) * 14 + 1}-${(n - 16) * 14}`, 72, PAGE_HEIGHT - 30)] : []
      return page(n, [...header, ...paragraph([`Body sentence on page ${n}.`], 72, 600)])
    })
    const all = analyzeLayout(pages)
      .blocks.map((b) => b.text)
      .join(' ')
    expect(all).not.toContain('Answers')
  })

  it('keeps repeated text that is in the body area', () => {
    const pages = [1, 2, 3].map((n) => page(n, paragraph(['Remember this rule.'], 72, 500)))
    expect(analyzeLayout(pages).sentences).toHaveLength(3)
  })

  it('does not treat a margin line as repeated in a 2-page document', () => {
    const pages = [1, 2].map((n) =>
      page(n, [item('Course notes', 72, PAGE_HEIGHT - 30), ...paragraph(['Text.'], 72, 600)])
    )
    expect(analyzeLayout(pages).blocks.some((b) => b.text === 'Course notes')).toBe(true)
  })
})

describe('headings and sections', () => {
  const line = (text: string, fontSize: number, bold = false): Line => ({
    page: 1,
    text,
    x: 72,
    xEnd: 300,
    y: 700,
    fontSize,
    bold,
    boldRuns: [],
    column: 0
  })

  it.each([
    ['larger font', line('Introduction', 16), true],
    ['numbered bold line', line('2.1 Test Levels', 11, true), true],
    ['ALL CAPS bold line', line('KEY TERMS', 11, true), true],
    ['bold term at body size', line('Selenium', 11, true), false],
    ['large text ending with a period', line('This is a sentence.', 16), false],
    ['plain body line', line('Testing finds defects', 11), false],
    // Lines of a boxed "Directions" paragraph set in a large font are not titles.
    ['large text starting in lowercase', line('section is followed by answers', 16), false],
    ['large text ending on "of the"', line('Select the answer or completion of the', 16), false],
    ['title ending on a full word', line('Radiation Protection and Safety', 16), true],
    ['single-letter image label', line('R', 16), false],
    [
      'too many words',
      line('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen', 16),
      false
    ]
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

  it('links subsections to their chapter and labels them with it', () => {
    const doc = analyzeLayout([
      page(1, [
        item('Chapter 1 Patient Care', 72, 740, { size: 20, bold: true }),
        item('Questions', 72, 710, { size: 14, bold: true }),
        ...paragraph(['Body text about patient care goes here.'], 72, 690),
        item('Answers and Explanations', 72, 660, { size: 14, bold: true }),
        ...paragraph(['More body text about the answers goes here.'], 72, 640),
        item('Chapter 2 Imaging', 72, 600, { size: 20, bold: true }),
        item('Answers and Explanations', 72, 570, { size: 14, bold: true }),
        ...paragraph(['Body text about imaging procedures goes here.'], 72, 550)
      ])
    ])
    expect(doc.sections.map((s) => [s.title, s.parentId])).toEqual([
      ['Chapter 1 Patient Care', null],
      ['Questions', 1],
      ['Answers and Explanations', 1],
      ['Chapter 2 Imaging', null],
      ['Answers and Explanations', 4]
    ])
    expect(sectionLabel(doc.sections, 5)).toBe('Chapter 2 Imaging › Answers and Explanations')
    expect(sectionLabel(doc.sections, 99)).toBe('(untitled)')
  })

  it('labels a deeply nested section with its two nearest levels only', () => {
    const doc = analyzeLayout([
      page(1, [
        item('Review Book Title', 72, 760, { size: 26, bold: true }),
        item('Chapter 3 Radiation', 72, 720, { size: 20, bold: true }),
        item('Answers and Explanations', 72, 690, { size: 14, bold: true }),
        ...paragraph(['Body text for the deepest section goes here.'], 72, 660)
      ])
    ])
    expect(sectionLabel(doc.sections, 3)).toBe('Chapter 3 Radiation › Answers and Explanations')
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

describe('rules typed as characters', () => {
  const blockTexts = (lines: string[]) => analyzeLayout([page(1, paragraph(lines, 72, 700))]).blocks.map((b) => b.text)

  it('splits text at a dash rule and drops the rule', () => {
    // Study notes: an option, a rule, then the explanation, all running together.
    expect(
      blockTexts([
        '(D) have poor detail. ————————————— When an automatic exposure control is used,',
        'the film is too light.'
      ])
    ).toEqual(['(D) have poor detail.', 'When an automatic exposure control is used, the film is too light.'])
  })

  it('treats a line of only underscores as a separator', () => {
    expect(blockTexts(['First part of the notes.', '____________________', 'Second part.'])).toEqual([
      'First part of the notes.',
      'Second part.'
    ])
  })

  it('keeps a fill-in blank and ordinary dashes inside a sentence', () => {
    expect(blockTexts(['The ________ controls contrast — mostly — in film-screen work.'])).toEqual([
      'The ________ controls contrast — mostly — in film-screen work.'
    ])
  })
})

describe('text layers that saved spaces as "(" or "$"', () => {
  it('repairs every line of a damaged page, even short ones', () => {
    const lines = [
      '1. The$dose$of$radiation$that$will$cause$a$skin$reaction(is(referred(to(as(the(',
      '(A) linear(energy(transfer((LET).(',
      'The(xEray$tube(and(the$doseDresponse$curve(are(shown.',
      'Ans.$C$ $'
    ]
    const doc = analyzeLayout([page(1, paragraph(lines, 72, 700, { spacing: 40 }))])
    expect(doc.blocks.map((b) => b.text)).toEqual([
      '1. The dose of radiation that will cause a skin reaction is referred to as the',
      '(A) linear energy transfer (LET).',
      'The x-ray tube and the dose-response curve are shown.',
      'Ans. C'
    ])
  })

  it('leaves a page alone when only one line looks like that', () => {
    const lines = ['Which is (are) characteristic(s) of$a(grid?', 'An ordinary sentence about grids.']
    const doc = analyzeLayout([page(1, paragraph(lines, 72, 700, { spacing: 40 }))])
    expect(doc.blocks.map((b) => b.text)).toEqual(lines)
  })
})

describe('sections without a heading', () => {
  it('are labelled by their pages instead of "(untitled)"', () => {
    const doc = analyzeLayout([1, 2, 3].map((n) => page(n, paragraph([`Plain notes on page ${n}.`], 72, 600))))
    expect(sectionLabel(doc.sections, doc.sections[0]!.id)).toBe('Pages 1–3')
  })
})

describe('paragraphs', () => {
  it('joins wrapped lines into one paragraph and removes line-break hyphens', () => {
    const doc = analyzeLayout([
      page(1, paragraph(['Selenium is used for browser automa-', 'tion in many teams.'], 72, 700))
    ])
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
    const doc = analyzeLayout([
      page(1, [...paragraph(['First paragraph'], 72, 700), ...paragraph(['Second paragraph'], 72, 640)])
    ])
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
    const doc = analyzeLayout([
      page(1, paragraph(['Done here.'], 72, 100)),
      page(2, paragraph(['fresh start'], 72, 740))
    ])
    expect(doc.blocks).toHaveLength(2)
  })

  it('makes each bullet its own list item and strips the bullet glyph', () => {
    const doc = analyzeLayout([
      page(
        1,
        paragraph(['• Selenium - browser automation', '• Postman - API testing', '1. Install Node first'], 72, 700)
      )
    ])
    expect(doc.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['list-item', 'Selenium - browser automation'],
      ['list-item', 'Postman - API testing'],
      ['list-item', '1. Install Node first']
    ])
  })
})

describe('repairing letters missing from the text layer', () => {
  // Enough "f"-less text (over 2000 letters) for the letter-frequency check to trigger.
  const filler = Array.from(
    { length: 40 },
    () => 'We gauge the radial pulse, the most common pulse point, in adults today.'
  )
  const dictionary = new Set([
    'the',
    'femoral',
    'artery',
    'of',
    'arm',
    'next',
    'sentence',
    'is',
    'here',
    'pulse',
    'points',
    'include'
  ])
  const isWord = (w: string) => dictionary.has(w)

  it('repairs a broken word that is hyphenated across two lines', () => {
    const doc = analyzeLayout(
      [page(1, paragraph([...filler, 'Pulse points include the emo-', 'ral artery.'], 72, 760, { size: 6 }))],
      { isWord }
    )
    expect(doc.sentences.at(-1)?.text).toBe('Pulse points include the femoral artery.')
    expect(doc.warnings.join(' ')).toMatch(/Repaired \d+ words/)
  })

  it('keeps sentence page numbers right after repairs change the text length', () => {
    const doc = analyzeLayout(
      [
        page(1, paragraph([...filler, 'Pulse points include the'], 72, 760, { size: 6 })),
        page(2, paragraph(['emoral artery o the arm. Next sentence is here.'], 72, 740, { size: 6 }))
      ],
      { isWord }
    )
    expect(doc.sentences.slice(-2).map((s) => [s.text, s.page])).toEqual([
      ['Pulse points include the femoral artery of the arm.', 1],
      ['Next sentence is here.', 2]
    ])
  })

  it('only warns when no dictionary is given', () => {
    const doc = analyzeLayout([page(1, paragraph([...filler, 'o the arm'], 72, 760, { size: 6 }))])
    expect(doc.sentences.at(-1)?.text).toContain('o the arm')
    expect(doc.warnings.join(' ')).toMatch(/missing letters: "f"/)
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
