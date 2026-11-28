import imageProduction from '../content/bank/image-production.json'
import imageProduction2 from '../content/bank/image-production-2.json'
import patientCare from '../content/bank/patient-care.json'
import patientCare2 from '../content/bank/patient-care-2.json'
import patientCare3 from '../content/bank/patient-care-3.json'
import procedures from '../content/bank/procedures.json'
import procedures2 from '../content/bank/procedures-2.json'
import procedures3 from '../content/bank/procedures-3.json'
import safety from '../content/bank/safety.json'
import safety2 from '../content/bank/safety-2.json'
import { CONTENT_AREAS, type ContentArea } from '../core/exam/areas'
import type { Question } from '../core/generation/types'

/*
 * The built-in question bank (src/content/bank/*.json): original questions whose facts were
 * checked against the reference PDFs (npm run check-bank). Everyone gets these without
 * importing anything.
 */

export interface BankEntry {
  id: string
  area: string
  topic: string
  stem: string
  options: string[]
  answer: number
  explanation: string
}

/** Prefix of bank question ids, so they never clash with an imported document's "<id>/..." ids. */
export const BANK_PREFIX = 'bank/'

/**
 * Number scales ("1 mSv, 5 mSv, 50 mSv") and fractions read best in their written order,
 * so their options are not shuffled. Everything else is.
 */
function isScale(options: string[]): boolean {
  return options.every((o) => /^[\d./]/.test(o.trim()))
}

export function toQuestion(entry: BankEntry): Question {
  const area = entry.area as ContentArea
  const answer = entry.options[entry.answer]
  if (!CONTENT_AREAS.includes(area)) throw new Error(`${entry.id}: unknown area "${entry.area}"`)
  if (answer === undefined || entry.options.length < 2) throw new Error(`${entry.id}: bad options or answer`)
  return {
    id: `${BANK_PREFIX}${entry.id}`,
    type: 'book-mcq',
    prompt: entry.stem,
    answer,
    acceptedAnswers: [],
    options: entry.options.map((text) => ({ text })),
    ...(isScale(entry.options) ? { keepOptionOrder: true } : {}),
    explanation: entry.explanation,
    page: 0,
    sectionId: 0,
    sentenceId: 0,
    termKey: `${BANK_PREFIX}${entry.id}`,
    quality: 1,
    area,
    topic: entry.topic
  }
}

export const BUILT_IN_BANK: Question[] = [
  ...patientCare,
  ...patientCare2,
  ...patientCare3,
  ...safety,
  ...safety2,
  ...imageProduction,
  ...imageProduction2,
  ...procedures,
  ...procedures2,
  ...procedures3
].map(toQuestion)
