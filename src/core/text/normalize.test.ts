import { describe, expect, it } from 'vitest'
import { normalizeText } from './normalize'

describe('normalizeText', () => {
  it.each([
    ['expands ligatures', 'eﬃcient deﬁnition', 'efficient definition'],
    ['removes soft hyphens', 'auto­mation', 'automation'],
    ['removes zero-width characters', 'Sele​nium', 'Selenium'],
    ['turns non-breaking and thin spaces into spaces', 'Node js API', 'Node js API'],
    ['collapses repeated spaces', 'a   b', 'a b'],
    ['leaves normal text alone', 'Postman is an API testing tool.', 'Postman is an API testing tool.']
  ])('%s', (_name, input, expected) => {
    expect(normalizeText(input)).toBe(expected)
  })
})
