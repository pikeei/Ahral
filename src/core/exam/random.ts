/**
 * Seeded randomness. Every random choice in an exam (which questions, their
 * order, option order) comes from one seed, so storing the seed is enough to
 * rebuild an attempt exactly, and tests are deterministic.
 */

export type Random = () => number

/** mulberry32: a tiny, fast PRNG with good distribution for shuffling. Returns numbers in [0, 1). */
export function createRandom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = result[i] as T
    result[i] = result[j] as T
    result[j] = swap
  }
  return result
}

/** A fresh seed for a new attempt. The only non-deterministic function in the exam engine. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}
