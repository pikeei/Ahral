import { describe, expect, it } from 'vitest'
import { assembleExam, displayedOptions } from './assemble'
import { option, question, sectionOf } from './test-helpers'

const ids = (exam: ReturnType<typeof assembleExam>) => exam.items.map((i) => i.question.id)

describe('assembleExam', () => {
  it('picks the requested number of questions', () => {
    const exam = assembleExam(sectionOf(1, 20), { questionCount: 8 }, 1)
    expect(exam.items).toHaveLength(8)
    expect(exam.warnings).toEqual([])
    expect(exam.seed).toBe(1)
  })

  it('rebuilds exactly the same exam from the same seed', () => {
    const pool = [...sectionOf(1, 20), ...sectionOf(2, 20)]
    expect(assembleExam(pool, { questionCount: 10 }, 123)).toEqual(assembleExam(pool, { questionCount: 10 }, 123))
  })

  it('gives a different mix with a different seed (retakes vary)', () => {
    const pool = sectionOf(1, 40)
    expect(ids(assembleExam(pool, { questionCount: 10 }, 1))).not.toEqual(
      ids(assembleExam(pool, { questionCount: 10 }, 2))
    )
  })

  it('never asks two questions about the same term', () => {
    const pool = sectionOf(1, 20).map((q, i) => ({ ...q, termKey: `term-${i % 5}` }))
    const exam = assembleExam(pool, { questionCount: 10 }, 4)
    expect(exam.items).toHaveLength(5)
    expect(new Set(exam.items.map((i) => i.question.termKey)).size).toBe(5)
    expect(exam.warnings[0]).toMatch(/Only 5 different questions/)
  })

  it('shares seats between sections in proportion to their size', () => {
    const exam = assembleExam([...sectionOf(1, 30), ...sectionOf(2, 10)], { questionCount: 8 }, 5)
    const fromSection = (id: number) => exam.items.filter((i) => i.question.sectionId === id).length
    expect([fromSection(1), fromSection(2)]).toEqual([6, 2])
  })

  it('fills seats from other sections when one runs out of distinct terms', () => {
    const small = sectionOf(2, 10).map((q) => ({ ...q, termKey: 'same-term' }))
    const exam = assembleExam([...sectionOf(1, 10), ...small], { questionCount: 8 }, 6)
    expect(exam.items).toHaveLength(8)
  })

  it('filters by type, section and quality', () => {
    const pool = [
      ...sectionOf(1, 5),
      ...sectionOf(2, 5, { type: 'mcq-term', options: [option('A'), option('B')] }),
      ...sectionOf(3, 5, { quality: 0.1 })
    ]
    expect(
      assembleExam(pool, { questionCount: 20, types: ['mcq-term'] }, 1).items.every(
        (i) => i.question.type === 'mcq-term'
      )
    ).toBe(true)
    expect(
      assembleExam(pool, { questionCount: 20, sectionIds: [1] }, 1).items.every((i) => i.question.sectionId === 1)
    ).toBe(true)
    expect(
      assembleExam(pool, { questionCount: 20, minQuality: 0.3 }, 1).items.some((i) => i.question.sectionId === 3)
    ).toBe(false)
  })

  it('favors higher-quality questions without always picking them', () => {
    const pool = [question('good', { quality: 1 }), question('weak', { quality: 0 })]
    let goodFirst = 0
    for (let seed = 0; seed < 500; seed++) {
      if (assembleExam(pool, { questionCount: 1 }, seed).items[0]?.question.id === 'good') goodFirst++
    }
    expect(goodFirst).toBeGreaterThan(300)
    expect(goodFirst).toBeLessThan(500)
  })

  it('shuffles options, and displayedOptions returns them in that order', () => {
    const q = question('m', { type: 'mcq-term', options: [option('A'), option('B'), option('C'), option('D')] })
    const exam = assembleExam([q], { questionCount: 1 }, 11)
    const item = exam.items[0]!
    expect([...item.optionOrder!].sort()).toEqual([0, 1, 2, 3])
    expect(displayedOptions(item).map((o) => o.text)).toEqual(item.optionOrder!.map((i) => q.options![i]!.text))
  })

  it('keeps the document’s option order where the options depend on it ("1 and 2 only")', () => {
    const texts = ['1 only', '1 and 2 only', '2 and 3 only', '1, 2, and 3']
    const q = question('b', { type: 'book-mcq', options: texts.map((t) => ({ text: t })), keepOptionOrder: true })
    for (const seed of [1, 2, 3]) {
      const item = assembleExam([q], { questionCount: 1 }, seed).items[0]!
      expect(item.optionOrder).toBeUndefined()
      expect(displayedOptions(item).map((o) => o.text)).toEqual(texts)
    }
  })

  it('warns when nothing matches', () => {
    expect(assembleExam([], { questionCount: 5 }, 1).warnings).toEqual(['No questions match these settings.'])
  })

  it.each([0, -1, 2.5, Number.NaN])('rejects an invalid question count (%s)', (questionCount) => {
    expect(() => assembleExam(sectionOf(1, 5), { questionCount }, 1)).toThrow(RangeError)
  })
})
