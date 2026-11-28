import { describe, expect, it } from 'vitest'
import { isVagueDefinition, kindOf } from './kind'
import { generateTermMcq } from './mcq'
import { definition } from './test-helpers'

describe('kindOf', () => {
  it.each([
    ['Osteoporosis', 'condition, often seen in the elderly, marked by porous bone', 'condition'],
    ['Densitometer', 'device used to read optical density', 'device'],
    ['Sensitometry', 'method of quality control for the automatic film processor', 'procedure'],
    ['Glutaraldehyde', 'hardener that is added to the developer solution', 'substance'],
    ['Grid ratio', 'height of the lead strips to the width of the interspace material', 'measure'],
    ['Quantum mottle', 'grainy appearance seen in fast imaging systems', 'effect'],
    ['Acetabulum', 'bony socket that receives the head of the femur', 'anatomy'],
    ['Res ipsa loquitur', 'doctrine meaning the thing speaks for itself', 'principle'],
    // No class word at the start: the term's ending decides.
    ['Hematemesis', 'presence of blood in vomit', 'condition'],
    ['Cystourethrography', 'radiographic look at the bladder and urethra during voiding', 'procedure']
  ])('%s is a %s... -> %s', (term, text, kind) => {
    expect(kindOf(term, text)).toBe(kind)
  })

  it('is unknown when neither the definition nor the term says', () => {
    expect(kindOf('Reviewing', 'how you retain the material you have read')).toBeUndefined()
  })
})

describe('isVagueDefinition', () => {
  it.each([
    'important consideration when determining the causes of film fog',
    'problem, especially in cool, dry weather',
    'key step if you want to retain the material you have read',
    'example of a negative-contrast agent'
  ])('rejects "%s"', (text) => {
    expect(isVagueDefinition(text)).toBe(true)
  })

  it('accepts a real definition, even one with "important" later on', () => {
    expect(isVagueDefinition('single most important way to limit scattered radiation')).toBe(false)
  })
})

describe('wrong options of the same kind', () => {
  it('drops a question that could only offer things of another kind', () => {
    // One condition among substances: "Osteoporosis" would be the only disease on offer.
    const defs = [
      definition('Osteoporosis', 'condition of porous and fragile bone in the elderly'),
      definition('Glutaraldehyde', 'hardener added to the developer solution'),
      definition('Silver', 'metal that cannot be poured into the public sewer'),
      definition('Air', 'agent that gives negative contrast on a radiograph'),
      definition('Barium sulfate', 'agent swallowed for positive contrast in the GI tract')
    ]
    const questions = generateTermMcq(defs, () => {})
    expect(questions.find((q) => q.answer === 'Osteoporosis')).toBeUndefined()
    // The four substances do make questions, with each other as wrong options.
    const silver = questions.find((q) => q.answer === 'Silver')
    expect(silver?.options?.map((o) => o.text).sort()).toEqual(['Air', 'Barium sulfate', 'Glutaraldehyde', 'Silver'])
  })
})
