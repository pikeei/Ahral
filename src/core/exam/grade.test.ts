import { describe, expect, it } from 'vitest'
import { describeFeedback, gradeAnswer } from './grade'
import { option, question } from './test-helpers'

const termMcq = question('t1', {
  type: 'mcq-term',
  prompt: 'Which term is best described as: "Small container holding a single dose"?',
  answer: 'Ampoule',
  options: [option('Ampoule', 'Ampoule', 43), option('Vial', 'Vial', 43), option('Carafe', 'Carafe', 44)],
  explanation: 'An ampoule is a small container that usually holds a single dose of medication.',
  page: 43
})

const definitionMcq = question('d1', {
  type: 'mcq-definition',
  answer: 'Small container holding a single dose',
  options: [
    {
      text: 'Small container holding a single dose',
      source: { term: 'Ampoule', definition: 'x', page: 43, sectionId: 1 }
    },
    { text: 'Larger container holding many doses', source: { term: 'Vial', definition: 'y', page: 43, sectionId: 1 } }
  ]
})

const cloze = question('c1', {
  answer: 'patient dose',
  acceptedAnswers: ['patient dose', 'Patient dose'],
  explanation: 'Added filtration addresses patient protection, decreasing patient dose.',
  page: 256
})

describe('gradeAnswer: multiple choice', () => {
  it('marks the right option correct with the source as explanation', () => {
    const result = gradeAnswer(termMcq, 'Ampoule')
    expect(result).toMatchObject({ status: 'correct', correct: true })
    expect(result.feedback).toMatchObject({ answer: 'Ampoule', page: 43 })
  })

  it('explains a wrong option with its own definition and page', () => {
    const result = gradeAnswer(termMcq, 'Vial')
    expect(result).toMatchObject({ status: 'wrong', correct: false })
    expect(result.feedback.chosen).toEqual({ term: 'Vial', definition: 'definition of Vial', page: 43 })
  })

  it('on "which definition" questions, names the term the chosen description belongs to', () => {
    const result = gradeAnswer(definitionMcq, 'Larger container holding many doses')
    expect(result.feedback).toMatchObject({ chosen: { term: 'Vial' }, chosenIsDefinition: true })
  })

  it('treats an answer that is not one of the options as wrong without an explanation', () => {
    expect(gradeAnswer(termMcq, 'Syringe').feedback.chosen).toBeUndefined()
  })

  it('cites the page of a book question’s explanation, not of the question', () => {
    const book = question('b', {
      type: 'book-mcq',
      answer: 'Superficial arteries',
      options: [{ text: 'Superficial arteries' }, { text: 'Deep arteries' }, { text: 'Deep veins' }],
      explanation: 'Superficial arteries are best suited for determination of pulse rate.',
      explanationPage: 41,
      page: 27
    })
    const wrong = gradeAnswer(book, 'Deep veins')
    expect(wrong.status).toBe('wrong')
    expect(describeFeedback(wrong)).toEqual([
      'Not quite.',
      'The answer is: Superficial arteries.',
      'Superficial arteries are best suited for determination of pulse rate. (p. 41)'
    ])
  })
})

describe('gradeAnswer: typed answers', () => {
  it.each(['patient dose', 'Patient Dose', 'the patient dose', 'patient doses', ' patient  dose. '])(
    'accepts "%s"',
    (given) => {
      expect(gradeAnswer(cloze, given).status).toBe('correct')
    }
  )

  it('accepts an alternative name (acronym or long form)', () => {
    const q = question('a', { answer: 'PSP', acceptedAnswers: ['PSP', 'photostimulable phosphor'] })
    expect(gradeAnswer(q, 'Photostimulable Phosphor').status).toBe('correct')
  })

  it('flags a near-miss spelling, counted correct only when typos are accepted', () => {
    const q = question('m', { answer: 'milliamperage', acceptedAnswers: ['milliamperage'] })
    expect(gradeAnswer(q, 'milliamperge')).toMatchObject({
      status: 'almost',
      correct: false,
      feedback: { hint: 'spelling' }
    })
    expect(gradeAnswer(q, 'milliamperge', { acceptTypos: true }).correct).toBe(true)
  })

  it('requires short answers to be exact ("rem" is not "rad")', () => {
    const q = question('r', { answer: 'rad', acceptedAnswers: ['rad'] })
    expect(gradeAnswer(q, 'rem').status).toBe('wrong')
  })

  it('points out an incomplete answer', () => {
    expect(gradeAnswer(cloze, 'dose').feedback.hint).toBe('incomplete')
  })

  it('explains a typed answer that is another term from the document', () => {
    const glossary = [{ term: 'skin dose', definition: 'dose received at the skin surface', page: 250 }]
    const result = gradeAnswer(cloze, 'Skin dose', { glossary })
    expect(result.feedback.chosen).toEqual(glossary[0])
  })

  it.each([null, '', '   '])('marks %j as unanswered', (given) => {
    expect(gradeAnswer(cloze, given)).toMatchObject({ status: 'unanswered', correct: false })
  })
})

describe('describeFeedback', () => {
  it('quotes the source with its page for a correct answer', () => {
    expect(describeFeedback(gradeAnswer(cloze, 'patient dose'))).toEqual([
      'Correct.',
      'Added filtration addresses patient protection, decreasing patient dose. (p. 256)'
    ])
  })

  it('explains the chosen wrong option, then the answer', () => {
    expect(describeFeedback(gradeAnswer(termMcq, 'Vial'))).toEqual([
      'Not quite.',
      'Vial is a definition of Vial (p. 43).',
      'The answer is: Ampoule.',
      'An ampoule is a small container that usually holds a single dose of medication. (p. 43)'
    ])
  })

  it('names the term a wrong description belongs to', () => {
    const lines = describeFeedback(gradeAnswer(definitionMcq, 'Larger container holding many doses'))
    expect(lines[1]).toBe('The description you chose is of Vial (p. 43).')
  })

  it('gives the full answer for an incomplete one', () => {
    expect(describeFeedback(gradeAnswer(cloze, 'dose'))[1]).toBe(
      'Your answer is only part of it. The full answer is: patient dose.'
    )
  })

  it('handles spelling and unanswered cases', () => {
    const q = question('m', { answer: 'milliamperage', acceptedAnswers: ['milliamperage'] })
    expect(describeFeedback(gradeAnswer(q, 'milliamperge'))[0]).toBe('Almost: check the spelling.')
    expect(describeFeedback(gradeAnswer(q, 'milliamperge', { acceptTypos: true }))[0]).toBe(
      'Correct, but check the spelling:'
    )
    expect(describeFeedback(gradeAnswer(q, null))[0]).toBe('Not answered. The answer is: milliamperage.')
  })

  it('adds "an" before a definition starting with a vowel', () => {
    const q = question('v', {
      type: 'mcq-term',
      answer: 'A',
      options: [option('A'), { text: 'B', source: { term: 'B', definition: 'animal host', page: 2, sectionId: 1 } }]
    })
    expect(describeFeedback(gradeAnswer(q, 'B'))[1]).toBe('B is an animal host (p. 2).')
  })
})
