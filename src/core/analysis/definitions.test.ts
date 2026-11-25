import { describe, expect, it } from 'vitest'
import { detectAliases, detectDefinitions, isValidTerm } from './definitions'
import { sentencesAndBlocks } from './test-helpers'

function detectOne(text: string, bold: string[] = []) {
  const { sentences, blocks } = sentencesAndBlocks([{ text, bold }])
  return detectDefinitions(sentences, blocks)[0]
}

describe('detectDefinitions: patterns that should match', () => {
  it.each([
    ['is-a', 'Selenium is an open-source framework used to automate web browsers.', 'Selenium', 'open-source framework used to automate web browsers'],
    ['is-a with leading article', 'A defect is a flaw in a component that can cause it to fail.', 'defect', 'flaw in a component that can cause it to fail'],
    ['refers-to', 'Test case refers to a set of conditions used to determine whether a feature works.', 'Test case', 'set of conditions used to determine whether a feature works'],
    ['defined-as', 'Regression testing is defined as re-running tests after every change.', 'Regression testing', 're-running tests after every change'],
    ['glossary with spaced hyphen', 'Postman - a tool used for API testing', 'Postman', 'tool used for API testing'],
    ['glossary with colon', 'JMeter: an open-source tool for performance testing.', 'JMeter', 'open-source tool for performance testing'],
    ['glossary with em dash', 'Smoke test — a quick check that the build is stable.', 'Smoke test', 'quick check that the build is stable'],
    ['called (reverse form)', 'A flaw that causes a failure is called a defect.', 'defect', 'flaw that causes a failure'],
    ['after an answer-option label', '(D) A vector is an animal host that transmits an infection.', 'vector', 'animal host that transmits an infection'],
    ['glossary with spaced en dash', 'Ampoule – a small container that holds a single dose.', 'Ampoule', 'small container that holds a single dose']
  ])('%s', (_name, text, term, definition) => {
    expect(detectOne(text)).toMatchObject({ term, definition })
  })

  it('uses a bold lead term when no wording pattern matches', () => {
    const found = detectOne('Selenium An open-source framework for automating browsers.', ['Selenium'])
    expect(found).toMatchObject({ term: 'Selenium', pattern: 'bold-lead', confidence: 0.7 })
  })

  it('raises confidence when the term is bold', () => {
    const plain = detectOne('A test plan is a document that describes the scope of testing.')
    const bold = detectOne('A test plan is a document that describes the scope of testing.', ['test plan'])
    expect(bold!.confidence).toBeGreaterThan(plain!.confidence)
  })
})

describe('detectDefinitions: sentences that must not match', () => {
  it.each([
    ['vague subject (this)', 'This approach is a good way to start testing.'],
    ['pronoun subject', 'It is a tool for testing APIs.'],
    ['clause as subject', 'Testing cannot prove that software is free of defects.'],
    ['verb before colon', 'Common techniques include: penetration testing and scanning.'],
    ['generic subject', 'The goal is a stable release every single week.'],
    ['definition repeats the term', 'Testing is the testing of software components.'],
    ['definition too short', 'Open-source tools - free software.'],
    ['hyphenated word is not a glossary separator', 'Cross-browser testing checks many browsers.'],
    ['statement without a definition pattern', 'Unit testing verifies individual functions in isolation.'],
    ['en dash inside a name', 'Swan–Ganz catheter is a(n) flow-directed device.'],
    ['numeric range is not a definition', 'Neutrons: 10–100 keV 20'],
    ['name with credentials', 'Jane Doe, MS, RT(R): Program Director at the school of radiography.'],
    ['place as a term', 'New York: McGraw-Hill published the book in 2009.'],
    ['definition starting with a pronoun', 'Study schedule: It is important to establish a routine.']
  ])('%s', (_name, text) => {
    expect(detectOne(text)).toBeUndefined()
  })
})

describe('detectDefinitions: across a document', () => {
  it('keeps one definition per term, the most confident one', () => {
    const { sentences, blocks } = sentencesAndBlocks([
      'Selenium is a tool that many teams use for testing.',
      'Selenium refers to a framework used to automate web browsers.'
    ])
    const found = detectDefinitions(sentences, blocks)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ pattern: 'refers-to', sentenceId: 2 })
  })

  it('records the page and section of the source sentence', () => {
    const { sentences, blocks } = sentencesAndBlocks([{ text: 'Postman - a tool used for API testing', page: 7, sectionId: 3 }])
    expect(detectDefinitions(sentences, blocks)[0]).toMatchObject({ page: 7, sectionId: 3, sentenceId: 1 })
  })
})

describe('isValidTerm', () => {
  it.each([
    ['Selenium', true],
    ['Software Development Life Cycle', true],
    ['these tools', false],
    ['one of six main phases of the', false],
    ['goal', false],
    ['the', false]
  ])('%s → %s', (term, expected) => {
    expect(isValidTerm(term)).toBe(expected)
  })
})

describe('detectAliases', () => {
  it('pairs a long form with its acronym when the initials match', () => {
    const { sentences } = sentencesAndBlocks([
      'An Application Programming Interface (API) lets programs talk to each other.',
      'Teams follow the Software Development Life Cycle (SDLC) to plan work.'
    ])
    expect(detectAliases(sentences).map((a) => [a.short, a.long])).toEqual([
      ['API', 'Application Programming Interface'],
      ['SDLC', 'Software Development Life Cycle']
    ])
  })

  it('ignores brackets whose letters do not match the words before them', () => {
    const { sentences } = sentencesAndBlocks(['We use Some Random Words (XYZ) here.'])
    expect(detectAliases(sentences)).toEqual([])
  })
})
