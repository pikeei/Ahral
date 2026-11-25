import type { Question, QuestionType } from '../generation/types'
import { createRandom, type Random, shuffle } from './random'

/*
 * Exam assembly: picks questions for one attempt and fixes their order.
 *
 * - Sections get seats in proportion to how many questions they have, so a
 *   long chapter is tested more than a short one, but every chapter appears.
 * - Within a section, better questions are more likely to be picked, but not
 *   certain: a retake with a new seed gives a different mix.
 * - One question per key term, so an exam never asks the same thing twice.
 * - Question order and option order are shuffled; all from one seed.
 */

export interface ExamConfig {
  questionCount: number
  /** Allowed question types; all when omitted. */
  types?: QuestionType[]
  /** Only questions from these sections; all when omitted. */
  sectionIds?: number[]
  /** Leave out questions ranked below this quality (0-1). */
  minQuality?: number
}

export interface ExamItem {
  question: Question
  /** Display order of the options as indexes into `question.options`. */
  optionOrder?: number[]
}

export interface Exam {
  seed: number
  config: ExamConfig
  items: ExamItem[]
  warnings: string[]
}

/**
 * Every question keeps a chance of being picked; quality only tilts the odds.
 * A question of quality 1 is about 5 times as likely to come first as one of quality 0.
 */
const BASE_WEIGHT = 0.25

export function assembleExam(questions: Question[], config: ExamConfig, seed: number): Exam {
  if (!Number.isInteger(config.questionCount) || config.questionCount < 1) {
    throw new RangeError(`questionCount must be a positive whole number, got ${config.questionCount}`)
  }
  const random = createRandom(seed)
  const pool = questions.filter(
    (q) =>
      (!config.types || config.types.includes(q.type)) &&
      (!config.sectionIds || config.sectionIds.includes(q.sectionId)) &&
      q.quality >= (config.minQuality ?? 0)
  )

  const picked = pickQuestions(pool, config.questionCount, random)
  const items = shuffle(picked, random).map((question) => ({
    question,
    ...(question.options ? { optionOrder: shuffle([...question.options.keys()], random) } : {})
  }))

  const warnings: string[] = []
  if (items.length < config.questionCount) {
    warnings.push(
      items.length === 0
        ? 'No questions match these settings.'
        : `Only ${items.length} different questions match these settings, so the exam has ${items.length} instead of ${config.questionCount}.`
    )
  }
  return { seed, config, items, warnings }
}

/** The options of an exam item in the order they are shown. */
export function displayedOptions(item: ExamItem): NonNullable<Question['options']> {
  const options = item.question.options ?? []
  return (item.optionOrder ?? [...options.keys()]).flatMap((i) => options[i] ?? [])
}

function pickQuestions(pool: Question[], count: number, random: Random): Question[] {
  // Weighted random order (Efraimidis-Spirakis): sort by random^(1/weight), highest first.
  const ranked = pool
    .map((question) => ({ question, key: random() ** (1 / (BASE_WEIGHT + question.quality)) }))
    .sort((a, b) => b.key - a.key)
    .map((r) => r.question)

  const bySection = new Map<number, Question[]>()
  for (const question of ranked) {
    const list = bySection.get(question.sectionId) ?? []
    list.push(question)
    bySection.set(question.sectionId, list)
  }

  const usedTerms = new Set<string>()
  const picked: Question[] = []
  const take = (question: Question) => {
    if (picked.length >= count || usedTerms.has(question.termKey)) return
    usedTerms.add(question.termKey)
    picked.push(question)
  }

  for (const [sectionId, quota] of sectionQuotas(bySection, count)) {
    const list = bySection.get(sectionId) ?? []
    for (const question of list) {
      if (picked.filter((q) => q.sectionId === sectionId).length >= quota) break
      take(question)
    }
  }
  // Sections that ran out of distinct terms leave seats; fill them from the overall ranking.
  for (const question of ranked) take(question)
  return picked
}

/**
 * Seats per section in proportion to its size, rounded with the largest-remainder method
 * so they add up exactly. A very small section can get no seat in a short exam.
 */
function sectionQuotas(bySection: Map<number, Question[]>, count: number): Map<number, number> {
  const total = [...bySection.values()].reduce((sum, list) => sum + list.length, 0)
  const seats = Math.min(count, total)
  const entries = [...bySection.entries()].map(([sectionId, list]) => {
    const exact = (list.length / total) * seats
    return { sectionId, seats: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let left = seats - entries.reduce((sum, e) => sum + e.seats, 0)
  for (const entry of [...entries].sort((a, b) => b.remainder - a.remainder || a.sectionId - b.sectionId)) {
    if (left === 0) break
    entry.seats++
    left--
  }
  return new Map(entries.map((e) => [e.sectionId, e.seats]))
}
