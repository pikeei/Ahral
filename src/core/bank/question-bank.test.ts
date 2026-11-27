import { describe, expect, it } from 'vitest'
import type { Block, BlockKind } from '../pdf/layout-types'
import { describeQuestionBank, extractQuestionBank, parseQuestionBlocks } from './question-bank'

let nextId = 1
function block(text: string, opts: { kind?: BlockKind; page?: number; sectionId?: number } = {}): Block {
  return {
    id: nextId++,
    kind: opts.kind ?? 'list-item',
    text,
    page: opts.page ?? 1,
    pageBreaks: [],
    fontSize: 10,
    boldRuns: [],
    sectionId: opts.sectionId ?? 1
  }
}
const heading = (text: string, page = 1) => block(text, { kind: 'heading', page })
const paragraph = (text: string, page = 1) => block(text, { kind: 'paragraph', page })

/** A question with options A-D, laid out one block per line as in most review books. */
function question(n: number, stem: string, options = ['alpha', 'beta', 'gamma', 'delta'], page = 1): Block[] {
  return [block(`${n}. ${stem}`, { page }), ...options.map((o, i) => block(`(${'ABCD'[i]}) ${o}`, { page }))]
}

describe('extractQuestionBank', () => {
  it('imports a question with its answer and explanation from a later answer key', () => {
    const blocks = [
      heading('Questions'),
      ...question(1, 'Which blood vessels are best suited for pulse rate?', [
        'Superficial arteries',
        'Deep arteries',
        'Superficial veins',
        'Deep veins'
      ]),
      heading('Answers and Explanations', 15),
      block('1. (A) Superficial arteries are best suited for determination of pulse rate.', { page: 15 }),
      paragraph('The radial pulse is the most commonly used.', 15)
    ]
    const { questions, stats } = extractQuestionBank(blocks)
    expect(stats).toEqual({ found: 1, imported: 1, withoutAnswer: 0, needsFigure: 0, malformed: 0 })
    expect(questions[0]).toEqual({
      id: 'book-1-1',
      type: 'book-mcq',
      prompt: 'Which blood vessels are best suited for pulse rate?',
      answer: 'Superficial arteries',
      acceptedAnswers: [],
      options: [
        { text: 'Superficial arteries' },
        { text: 'Deep arteries' },
        { text: 'Superficial veins' },
        { text: 'Deep veins' }
      ],
      keepOptionOrder: true,
      explanation:
        'Superficial arteries are best suited for determination of pulse rate. The radial pulse is the most commonly used.',
      explanationPage: 15,
      page: 1,
      sectionId: 1,
      sentenceId: 0,
      termKey: 'book-1-1',
      quality: 1
    })
  })

  it('reads a question whose number stands alone, with the text in the next block', () => {
    const blocks = [
      block('98.'),
      paragraph('Types of inflammatory bowel disease include'),
      block('(A) one'),
      block('(B) two'),
      block('(C) three'),
      block('98. (C) Both are inflammatory bowel diseases.')
    ]
    const [q] = extractQuestionBank(blocks).questions
    expect(q?.prompt).toBe('Types of inflammatory bowel disease include')
    expect(q?.answer).toBe('three')
  })

  it('keeps numbered statements as part of a combination question', () => {
    const blocks = [
      block('2. Diseases that require contact precautions include'),
      block('1. MRSA'),
      block('2. C. difficile'),
      block('3. influenza'),
      block('(A) 1 only (B) 1 and 2 only (C) 2 and 3 only (D) 1, 2, and 3'),
      block('3. Next question?'),
      ...['(A) a', '(B) b', '(C) c'].map((t) => block(t)),
      heading('Answers'),
      block('2. (B) MRSA and C. difficile spread by contact.'),
      block('3. (A) Because.')
    ]
    const { questions } = extractQuestionBank(blocks)
    expect(questions.map((q) => q.id)).toEqual(['book-1-2', 'book-1-3'])
    expect(questions[0]?.prompt).toBe(
      'Diseases that require contact precautions include\n1. MRSA\n2. C. difficile\n3. influenza'
    )
    expect(questions[0]?.options?.map((o) => o.text)).toEqual(['1 only', '1 and 2 only', '2 and 3 only', '1, 2, and 3'])
    expect(questions[0]?.answer).toBe('1 and 2 only')
  })

  it('keeps a numbered list inside an explanation without losing the next answers', () => {
    const blocks = [
      ...question(1, 'What must every image include?'),
      ...question(2, 'Second?'),
      heading('Answers'),
      block('1. (D) Every image must include'),
      block('1. the patient name'),
      block('2. the side marker'),
      block('2. (B) The second answer.')
    ]
    const { questions } = extractQuestionBank(blocks)
    expect(questions.map((q) => q.answer)).toEqual(['delta', 'beta'])
    expect(questions[0]?.explanation).toBe('Every image must include 1. the patient name 2. the side marker')
  })

  it('matches each run of questions with the answer key in the same position', () => {
    const blocks = [
      heading('Chapter 1 Questions'),
      ...question(1, 'Chapter one, first?'),
      ...question(2, 'Chapter one, second?'),
      heading('Chapter 2 Questions'),
      ...question(1, 'Chapter two, first?'),
      heading('Chapter 1 Answers'),
      block('1. (A) one-one'),
      block('2. (B) one-two'),
      heading('Chapter 2 Answers'),
      block('1. (C) two-one')
    ]
    const { questions } = extractQuestionBank(blocks)
    expect(questions.map((q) => [q.id, q.answer, q.explanation])).toEqual([
      ['book-1-1', 'alpha', 'one-one'],
      ['book-1-2', 'beta', 'one-two'],
      ['book-2-1', 'gamma', 'two-one']
    ])
  })

  it('reads an answer given right after the options', () => {
    const blocks = [
      ...question(1, 'Inline first?'),
      paragraph('Answer: C. Gamma is right.'),
      ...question(2, 'Inline second?'),
      paragraph('Correct answer: (A)'),
      heading('Unrelated key'),
      block('1. (D) This key belongs to no question set.')
    ]
    const { questions } = extractQuestionBank(blocks)
    expect(questions.map((q) => [q.answer, q.explanation])).toEqual([
      ['gamma', 'Gamma is right.'],
      ['alpha', 'The answer key gives (A).']
    ])
  })

  it.each([
    ['A. alpha', 'B. beta', 'C. gamma'],
    ['a) alpha', 'b) beta', 'c) gamma'],
    ['(a) alpha', '(b) beta', '(c) gamma']
  ])('accepts options written as "%s"', (a, b, c) => {
    const blocks = [block('1. Which?'), block(a), block(b), block(c), block('1. B. Beta.')]
    expect(extractQuestionBank(blocks).questions[0]?.answer).toBe('beta')
  })

  it('does not take a question starting with "A" for an answer', () => {
    const blocks = [block('12. A patient is unresponsive. What first?'), block('(A) x'), block('(B) y'), block('(C) z')]
    const { questions } = parseQuestionBlocks(blocks)
    expect(questions[0]?.stem).toEqual(['A patient is unresponsive. What first?'])
  })

  it('skips and counts questions it cannot use', () => {
    const blocks = [
      ...question(1, 'No answer in the key?'),
      ...question(2, 'The answer letter has no option?'),
      ...question(3, 'What is labeled C in Figure 2-1?'),
      ...question(4, 'Repeated options?', ['same', 'same', 'other']),
      ...question(5, 'Only two options?', ['yes', 'no']),
      ...question(6, 'Usable?'),
      heading('Answers'),
      block('2. (E) Out of range.'),
      block('3. (A) Figure.'),
      block('4. (C) Repeated.'),
      block('5. (A) Two.'),
      block('6. (A) Fine.')
    ]
    const { questions, stats } = extractQuestionBank(blocks)
    expect(questions.map((q) => q.id)).toEqual(['book-1-6'])
    // The two-option item is not counted as a question at all.
    expect(stats).toEqual({ found: 5, imported: 1, withoutAnswer: 2, needsFigure: 1, malformed: 1 })
  })

  it('reads study notes: "1.)" numbers, an explanation after the options ending in "Ans. A"', () => {
    const blocks = [
      block('1.) When a slow screen is used with a fast-screen exposure system, the images'),
      ...['(A) are too light.', '(B) are too dark.', '(C) have improved detail.', '(D) have poor detail.'].map((t) =>
        block(t)
      ),
      paragraph('The system expects a faster screen, so the film receives too little exposure.'),
      // A numbered list inside the explanation, written differently from the questions.
      block('1) Exposure artifacts include motion.'),
      block('2) Handling artifacts include static.'),
      paragraph('The images are too light. (Bushong, p 441) Ans. A'),
      block('2.) Exposure-type artifacts include'),
      block('1. motion'),
      block('2. static'),
      ...['(A) 1 only', '(B) 2 only', '(C) 1 and 2'].map((t) => block(t)),
      paragraph('Both happen during exposure. Ans. C')
    ]
    const { questions, stats, blockIds } = extractQuestionBank(blocks)
    expect(stats).toMatchObject({ found: 2, imported: 2 })
    expect(questions.map((q) => [q.prompt, q.answer])).toEqual([
      ['When a slow screen is used with a fast-screen exposure system, the images', 'are too light.'],
      ['Exposure-type artifacts include\n1. motion\n2. static', '1 and 2']
    ])
    expect(questions[0]?.explanation).toBe(
      'The system expects a faster screen, so the film receives too little exposure. 1) Exposure artifacts include motion. 2) Handling artifacts include static. The images are too light. (Bushong, p 441)'
    )
    // Question text and options are not prose for generated questions; explanations are.
    const kept = blocks.filter((b) => !blockIds.has(b.id)).map((b) => b.text)
    expect(kept).toEqual([
      'The system expects a faster screen, so the film receives too little exposure.',
      '1) Exposure artifacts include motion.',
      '2) Handling artifacts include static.',
      'The images are too light. (Bushong, p 441) Ans. A',
      'Both happen during exposure. Ans. C'
    ])
  })

  it('finds nothing in ordinary text', () => {
    const blocks = [
      paragraph('Radiation protection is important.'),
      block('1. Wear a lead apron.'),
      block('2. Keep your distance.')
    ]
    expect(extractQuestionBank(blocks)).toEqual({
      questions: [],
      stats: { found: 0, imported: 0, withoutAnswer: 0, needsFigure: 0, malformed: 0 },
      blockIds: new Set()
    })
  })
})

describe('describeQuestionBank', () => {
  it('says nothing for a document without questions', () => {
    expect(describeQuestionBank({ found: 0, imported: 0, withoutAnswer: 0, needsFigure: 0, malformed: 0 })).toBe(
      undefined
    )
  })

  it('reports what was imported and skipped', () => {
    expect(describeQuestionBank({ found: 10, imported: 10, withoutAnswer: 0, needsFigure: 0, malformed: 0 })).toBe(
      'Imported 10 of the 10 questions in this PDF.'
    )
    expect(describeQuestionBank({ found: 10, imported: 6, withoutAnswer: 2, needsFigure: 1, malformed: 1 })).toBe(
      'Imported 6 of the 10 questions in this PDF; skipped 2 without an answer in the key, 1 that need a figure, 1 with repeated options.'
    )
  })
})
