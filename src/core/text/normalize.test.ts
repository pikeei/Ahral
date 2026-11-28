import { describe, expect, it } from 'vitest'
import { normalizeText, repairSubstitutedSpaces } from './normalize'

describe('normalizeText', () => {
  it.each([
    ['expands ligatures', 'eﬃcient deﬁnition', 'efficient definition'],
    ['removes soft hyphens', 'auto­mation', 'automation'],
    ['removes zero-width characters', 'Sele​nium', 'Selenium'],
    ['turns non-breaking and thin spaces into spaces', 'Node js API', 'Node js API'],
    ['collapses repeated spaces', 'a   b', 'a b'],
    ['removes symbol-font bullets (private-use characters)', ' A digital image', ' A digital image'],
    ['leaves normal text alone', 'Postman is an API testing tool.', 'Postman is an API testing tool.']
  ])('%s', (_name, input, expected) => {
    expect(normalizeText(input)).toBe(expected)
  })
})

describe('repairSubstitutedSpaces', () => {
  it.each([
    [
      'spaces saved as "$" and "("',
      '1. The$dose$of$radiation$that$will$cause$a$skin$reaction(is(referred(to(as(the(',
      '1. The dose of radiation that will cause a skin reaction is referred to as the'
    ],
    [
      'a real bracket after a stand-in space',
      '(A) linear(energy(transfer((LET).(',
      '(A) linear energy transfer (LET).'
    ],
    [
      'a citation and an answer',
      'skin$ erythema$dose$(SED).$$ (Bushong,$p$488)$ Ans.$C$ $',
      'skin erythema dose (SED). (Bushong, p 488) Ans. C'
    ],
    [
      'hyphens saved as E or D',
      'The(xEray$tube(and(the$doseDresponse$curve$are(allEorEnothing',
      'The x-ray tube and the dose-response curve are all-or-nothing'
    ],
    ['a bullet glyph', '( ! Erythema( is( the(reddening$ of$ skin', 'Erythema is the reddening of skin'],
    ['units with capitals stay', 'Use$70$kVp$and$10$mAs$(about$2$mSv)', 'Use 70 kVp and 10 mAs (about 2 mSv)']
  ])('repairs %s', (_name, input, expected) => {
    expect(repairSubstitutedSpaces(input)).toBe(expected)
  })

  it.each([
    'Which of the following is (are) characteristic(s) of a 16:1 grid?',
    'The dose(s) and the site(s) of exposure are recorded (Bushong, p 488).',
    'It costs $5 per film, or $50 (about 10%) per box.',
    'Its MeDia and xEray are product names.'
  ])('leaves ordinary text alone: %s', (text) => {
    expect(repairSubstitutedSpaces(text)).toBe(text)
  })
})
