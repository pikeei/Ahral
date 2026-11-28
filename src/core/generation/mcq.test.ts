import { describe, expect, it } from 'vitest'
import { generateDefinitionMcq, generateTermMcq, type McqRejection } from './mcq'
import { definition } from './test-helpers'
import type { Question } from './types'

const TOOLS = [
  definition('Selenium', 'open-source framework used to automate web browsers', { page: 3 }),
  definition('Postman', 'tool used for sending requests to web services', { page: 4 }),
  definition('JMeter', 'tool for measuring performance under heavy load', { page: 5 }),
  definition('Cypress', 'JavaScript end-to-end framework that runs inside the browser', { page: 6 })
]

/** Measures (the same kind as a half value layer) that don't use the word "half". */
const GRID_MEASURES = [
  definition('Grid ratio', 'ratio of the height of the lead strips to the distance between them'),
  definition('Grid frequency', 'number of lead strips per inch of the grid'),
  definition('Focusing distance', 'distance range at which a focused grid can be used')
]

function terms(defs = TOOLS) {
  const rejected: McqRejection[] = []
  return { questions: generateTermMcq(defs, (r) => rejected.push(r)), rejected }
}

const texts = (q: Question) => q.options!.map((o) => o.text)

describe('generateTermMcq', () => {
  it('asks for the term and offers the other defined terms as distractors', () => {
    const q = terms().questions.find((x) => x.answer === 'Postman')!
    expect(q.prompt).toBe('Which term is best described as: "Tool used for sending requests to web services"?')
    expect(texts(q)).toHaveLength(4)
    expect(texts(q)).toContain('Postman')
    expect(new Set(texts(q)).size).toBe(4)
  })

  it('gives every option the definition and page it came from, for feedback', () => {
    const q = terms().questions.find((x) => x.answer === 'Postman')!
    const selenium = q.options!.find((o) => o.text === 'Selenium')
    expect(selenium?.source).toEqual({
      term: 'Selenium',
      definition: 'open-source framework used to automate web browsers',
      page: 3,
      sectionId: 1
    })
  })

  it('never offers a distractor whose definition is nearly the same (both would be right)', () => {
    const defs = [
      ...TOOLS,
      definition('Ampoule', 'small sealed glass container holding a single dose of medication'),
      definition('Vial', 'small sealed glass container holding a single dose of a medication')
    ]
    const q = terms(defs).questions.find((x) => x.answer === 'Ampoule')!
    expect(texts(q)).not.toContain('Vial')
  })

  it('never offers a distractor that appears in the definition', () => {
    const defs = [...TOOLS, definition('WebDriver', 'Selenium component that controls the browser through a driver')]
    const q = terms(defs).questions.find((x) => x.answer === 'WebDriver')!
    expect(texts(q)).not.toContain('Selenium')
  })

  it('never offers a distractor that overlaps the answer ("API" vs "API testing")', () => {
    const defs = [
      ...TOOLS,
      definition('API testing', 'framework for checking requests and responses of a service interface'),
      definition('API', 'library that lets two programs talk to each other')
    ]
    const q = terms(defs).questions.find((x) => x.answer === 'API testing')!
    expect(texts(q)).not.toContain('API')
  })

  it('skips a definition that contains its own term', () => {
    const { rejected } = terms([...TOOLS, definition('Load test', 'load test run with many virtual users')])
    expect(rejected).toContain('answer-in-definition')
  })

  it('needs three distractors', () => {
    const { questions, rejected } = terms(TOOLS.slice(0, 3))
    expect(questions).toEqual([])
    expect(rejected).toEqual(['not-enough-distractors', 'not-enough-distractors', 'not-enough-distractors'])
  })

  it('capitalizes all options the same way so casing does not hint at the answer', () => {
    const defs = TOOLS.map((d, i) => (i === 0 ? { ...d, term: 'selenium' } : d))
    for (const q of terms(defs).questions) {
      expect(texts(q).every((o) => /^\p{Lu}/u.test(o))).toBe(true)
    }
  })
})

describe('generateDefinitionMcq', () => {
  it('asks for the definition and offers other definitions as distractors', () => {
    const q = generateDefinitionMcq(TOOLS, () => {}).find((x) => x.termKey === 'jmeter')!
    expect(q.prompt).toBe('Which of the following best describes JMeter?')
    expect(q.answer).toBe('Tool for measuring performance under heavy load')
    expect(texts(q)).toHaveLength(4)
    expect(texts(q)).toContain(q.answer)
  })

  it('records which term each wrong definition belongs to', () => {
    const q = generateDefinitionMcq(TOOLS, () => {}).find((x) => x.termKey === 'jmeter')!
    const wrong = q.options!.filter((o) => o.text !== q.answer)
    expect(wrong.map((o) => o.source?.term).sort()).toEqual(['Cypress', 'Postman', 'Selenium'])
  })

  it('leaves out definitions of very different length (the odd one out is a giveaway)', () => {
    const long = definition(
      'Regression testing',
      'process of re-running functional and non-functional tests after every change to make sure that previously developed and tested software still performs correctly'
    )
    const qs = generateDefinitionMcq([...TOOLS, long], () => {})
    const q = qs.find((x) => x.termKey === 'postman')!
    expect(texts(q).some((o) => o.startsWith('Process of re-running'))).toBe(false)
  })
})

describe('choosing plausible wrong options', () => {
  // A radiation-biology topic with unrelated terms mixed in, like a real review book.
  const RADIATION = [
    definition('Irradiation damage', 'result of the effects of irradiation on water or on macromolecules'),
    definition('Mutation', 'result of damage to the base sequence of DNA after irradiation'),
    definition('Chromosome break', 'result of a double-strand break on the same DNA rung'),
    definition('Remnant radiation', 'radiation that emerges from the patient to form the image'),
    definition('Pair production', 'interaction that occurs only at energies above 1.02 MeV'),
    definition('Thoracentesis', 'procedure used to remove fluid from the pleural cavity'),
    definition('Catheter', 'flexible tube inserted into the body to drain fluids')
  ]
  const rejectedFor = (defs: typeof RADIATION) => {
    const rejected: McqRejection[] = []
    return { questions: generateDefinitionMcq(defs, (r) => rejected.push(r)), rejected }
  }

  it('prefers options of the same topic and kind over unrelated ones', () => {
    const q = rejectedFor(RADIATION).questions.find((x) => x.termKey === 'mutation')!
    const wrong = q.options!.filter((o) => o.text !== q.answer).map((o) => o.source?.term)
    // Both other kinds of radiation damage ("result of ..."). Before, one-word terms of the
    // same shape as "Mutation" won: "Catheter" and "Thoracentesis", which are easy to rule out.
    expect(wrong).toEqual(expect.arrayContaining(['Chromosome break', 'Irradiation damage']))
    expect(wrong).not.toContain('Thoracentesis')
  })

  it('hides a clue word by choosing a wrong option that repeats it too', () => {
    // "Irradiation damage" ... "effects of irradiation": "Mutation" also mentions irradiation.
    const q = rejectedFor(RADIATION).questions.find((x) => x.termKey === 'irradiation damage')!
    const wrong = q.options!.filter((o) => o.text !== q.answer).map((o) => o.text)
    expect(wrong.some((t) => /irradiation/i.test(t))).toBe(true)
  })

  it('drops the question when only the right option repeats a word of the term', () => {
    const giveaway = [
      definition('Half value layer', 'thickness of absorber that reduces the beam to one half'),
      ...GRID_MEASURES
    ]
    const { questions, rejected } = rejectedFor(giveaway)
    expect(questions.find((x) => x.termKey === 'half value layer')).toBeUndefined()
    expect(rejected).toContain('answer-gives-away')
  })

  it('drops a "which term" question whose prompt repeats a word of the answer only', () => {
    const giveaway = [
      definition('Half value layer', 'thickness of absorber that reduces the beam to one half'),
      ...GRID_MEASURES
    ]
    const rejected: McqRejection[] = []
    const questions = generateTermMcq(giveaway, (r) => rejected.push(r))
    expect(questions.find((x) => x.termKey === 'half value layer')).toBeUndefined()
    expect(rejected).toContain('answer-gives-away')
  })
})
