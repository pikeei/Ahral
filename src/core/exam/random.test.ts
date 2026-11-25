import { describe, expect, it } from 'vitest'
import { createRandom, shuffle } from './random'

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b))
  })

  it('gives a different sequence for a different seed', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)())
  })

  it('stays within [0, 1)', () => {
    const random = createRandom(7)
    for (let i = 0; i < 1000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('returns a permutation and leaves the input unchanged', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const result = shuffle(input, createRandom(3))
    expect([...result].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('is deterministic for a seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], createRandom(9))).toEqual(shuffle([1, 2, 3, 4, 5], createRandom(9)))
  })

  it('puts every item in the first place about equally often', () => {
    const firsts = new Map<number, number>()
    for (let seed = 0; seed < 4000; seed++) {
      const first = shuffle([0, 1, 2, 3], createRandom(seed))[0]!
      firsts.set(first, (firsts.get(first) ?? 0) + 1)
    }
    for (const count of firsts.values()) expect(count).toBeGreaterThan(850) // expected ~1000 each
  })
})
