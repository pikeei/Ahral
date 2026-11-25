import { describe, expect, it } from 'vitest'
import { normalizeAnswer, overlappingAnswers, sameAnswer } from './answer'

describe('normalizeAnswer', () => {
  it.each([
    ['The Open-Source tool.', 'open source tool'],
    ['  Selenium  ', 'selenium'],
    ['an API', 'api'],
    ['C++', 'c++'],
    ['C#', 'c#']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected)
  })
})

describe('sameAnswer', () => {
  it.each([
    ['Defects', 'defect', true],
    ['the Test Plan', 'test plan', true],
    ['C++', 'C', false],
    ['process', 'proces', false],
    ['Selenium', 'Cypress', false]
  ])('%s vs %s -> %s', (a, b, expected) => {
    expect(sameAnswer(a, b)).toBe(expected)
  })
})

describe('overlappingAnswers', () => {
  it.each([
    ['API', 'API testing', true],
    ['test', 'testing', false],
    ['load test', 'Load tests', true],
    ['Selenium', 'Postman', false]
  ])('%s vs %s -> %s', (a, b, expected) => {
    expect(overlappingAnswers(a, b)).toBe(expected)
  })
})
