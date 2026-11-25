/**
 * Writes samples/demo-reviewer.pdf: a small reviewer that exercises the layout
 * rules (running header, page numbers, headings, bold terms, bullets,
 * a hyphenated line break, a paragraph crossing a page, and a two-column page).
 *
 *   npm run sample-pdf
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { buildPdf, textLines, type PdfLine } from '../tests/fixtures/pdf-builder'

const header = (n: number): PdfLine[] => [
  { text: 'Software Testing Reviewer', y: 760, size: 9 },
  { text: `Page ${n}`, x: 290, y: 30, size: 9 }
]

const page1: PdfLine[] = [
  ...header(1),
  { text: 'Chapter 1 Fundamentals of Testing', y: 700, size: 20, bold: true },
  ...textLines(
    [
      'Software testing is the process of evaluating a system to find defects before',
      'users do. A defect is a flaw in a component that can cause it to fail. Testing',
      'cannot prove that software is free of defects; it can only show that they are pres-',
      'ent.'
    ],
    665
  ),
  { text: '1.1 Test Levels', y: 590, size: 14, bold: true },
  ...textLines(
    [
      'Unit testing verifies individual functions or classes in isolation. Integration',
      'testing checks that components work together. System testing evaluates the',
      'complete application against its requirements. Regression testing confirms that'
    ],
    560
  )
]

const page2: PdfLine[] = [
  ...header(2),
  ...textLines(['existing features still work after a change.'], 720),
  { text: '1.2 Common Tools', y: 680, size: 14, bold: true },
  ...textLines(
    [
      '• Selenium - an open-source framework used to automate web browsers.',
      '• Cypress - a JavaScript-based end-to-end testing framework.',
      '• Postman - a tool used for API testing.',
      '• JMeter - an open-source tool for performance testing.'
    ],
    650
  ),
  { text: 'KEY TERMS', y: 570, bold: true },
  { text: 'Test case', y: 545, bold: true },
  { text: 'refers to a set of conditions used to determine whether a feature works.', x: 128, y: 545 },
  { text: 'Test plan', y: 530, bold: true },
  { text: 'is a document that describes the scope and approach of testing.', x: 128, y: 530 }
]

const left = [
  'Performance testing measures how a',
  'system behaves under load. Load',
  'testing applies the expected number',
  'of users. Stress testing pushes the',
  'system beyond its limits to find the',
  'breaking point. Both help teams plan',
  'capacity before release.'
]
const right = [
  'Security testing looks for weaknesses',
  'that attackers could exploit. Common',
  'techniques include penetration testing',
  'and vulnerability scanning. Usability',
  'testing checks how easily real users',
  'can complete tasks. It is often done',
  'with think-aloud sessions.'
]
const page3: PdfLine[] = [
  ...header(3),
  { text: 'Chapter 2 Non-Functional Testing', y: 700, size: 20, bold: true },
  ...textLines(left, 660, { x: 72 }),
  ...textLines(right, 660, { x: 320 })
]

await mkdir('samples', { recursive: true })
await writeFile('samples/demo-reviewer.pdf', await buildPdf([page1, page2, page3]))
console.log('Wrote samples/demo-reviewer.pdf')
