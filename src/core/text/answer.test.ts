import { describe, expect, it } from 'vitest'
import { editDistance, normalizeAnswer, overlappingAnswers, sameAnswer } from './answer'

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['abc', 'abc', 0],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['milliamperage', 'milliamperge', 1],
    ['rad', 'rem', 2]
  ])('%s -> %s = %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected)
    expect(editDistance(b, a)).toBe(expected)
  })
})

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
