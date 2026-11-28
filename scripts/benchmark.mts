/**
 * Quality benchmark: how many of the questions Ahral makes are actually good?
 *
 *   npm run benchmark -- samples/notes.pdf samples/book.pdf     score these PDFs
 *   npm run benchmark -- --per-type 40 samples/notes.pdf        a bigger sample per question type
 *
 * For each PDF and question type, a fixed sample of questions is drawn and compared with the
 * grades in samples/benchmark/labels.json ("good", or "bad" with a reason). Questions without a
 * grade are written to samples/benchmark/to-grade.md, with their options and explanation, so
 * they can be graded and added to labels.json.
 *
 * The sample is picked by a fingerprint of each question's text (type, prompt, answer), so it
 * is the same set every run, and a grade stays attached to the exact question it was given to.
 * When a rule change rewrites a question, it becomes a new question that needs a grade.
 *
 * samples/ is git-ignored: the grades quote the PDFs, which are not ours to publish.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { runPipeline } from '../src/app/pipeline'
import type { Question, QuestionType } from '../src/core/generation/types'
import { loadDictionary, standardFontDataUrl } from './lib/read-pdf.mts'

/** Why a question is bad. One reason per question: the most serious one. */
export const BAD_REASONS = {
  'wrong-answer': 'The marked answer is wrong, or another option is also right',
  'not-answerable': 'Cannot be answered from the question as shown (missing context, figure, or the blank is a guess)',
  'broken-text': 'Garbled words, merged text or leftovers from the PDF make it hard to read',
  'not-a-question': 'A fragment or a sentence that does not test anything',
  giveaway: 'The answer is obvious from wording alone, without knowing the subject',
  'weak-options': 'Wrong options are unrelated or absurd, so the right one is easy to spot'
} as const
type BadReason = keyof typeof BAD_REASONS

interface Label {
  verdict: 'good' | 'bad'
  reason?: BadReason
  note?: string
  /** Kept so labels.json is readable on its own. */
  pdf: string
  type: QuestionType
  prompt: string
  answer: string
}

const DIR = 'samples/benchmark'
const LABELS = `${DIR}/labels.json`
const TO_GRADE = `${DIR}/to-grade.md`
const TYPES: QuestionType[] = ['book-mcq', 'cloze', 'mcq-term', 'mcq-definition']

/**
 * Identifies a question as it was graded: the PDF, its wording, its answer and its options in
 * order (the same question with other wrong options can be good in one PDF and bad in another).
 */
function fingerprint(pdf: string, q: Pick<Question, 'type' | 'prompt' | 'answer' | 'options'>): string {
  const options = (q.options ?? []).map((o) => o.text).join('\n')
  return createHash('sha1').update([pdf, q.type, q.prompt, q.answer, options].join('\n\n')).digest('hex').slice(0, 12)
}

function percent(n: number, d: number): string {
  return d === 0 ? '  -' : `${Math.round((100 * n) / d)}%`.padStart(4)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const perTypeIndex = args.indexOf('--per-type')
  const perType = perTypeIndex >= 0 ? Number(args[perTypeIndex + 1]) : 25
  const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--per-type')
  if (files.length === 0) {
    console.error('Usage: npm run benchmark -- [--per-type N] <file.pdf> [more.pdf ...]')
    process.exitCode = 1
    return
  }

  mkdirSync(DIR, { recursive: true })
  const labels: Record<string, Label> = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, 'utf8')) : {}
  const dictionary = await loadDictionary()
  const toGrade: string[] = []
  const reasons: Partial<Record<BadReason, number>> = {}
  const totals = new Map<QuestionType, { graded: number; good: number }>()

  console.log(`Sample: up to ${perType} questions per type and PDF\n`)
  console.log(`${'PDF'.padEnd(34)} ${'type'.padEnd(15)} made  sample graded  good`)
  for (const file of files) {
    const pdf = basename(file)
    const content = await runPipeline(new Uint8Array(await readFile(file)), {
      standardFontDataUrl: standardFontDataUrl(),
      isWord: (w) => dictionary.has(w)
    })
    for (const type of TYPES) {
      const all = content.questions.filter((q) => q.type === type)
      if (all.length === 0) continue
      const sample = all
        .map((q) => ({ q, key: fingerprint(pdf, q) }))
        .sort((a, b) => a.key.localeCompare(b.key))
        .slice(0, perType)
      let graded = 0
      let good = 0
      for (const { q, key } of sample) {
        const label = labels[key]
        if (!label) {
          toGrade.push(formatForGrading(key, pdf, q))
          continue
        }
        graded++
        if (label.verdict === 'good') good++
        else if (label.reason) reasons[label.reason] = (reasons[label.reason] ?? 0) + 1
      }
      const total = totals.get(type) ?? { graded: 0, good: 0 }
      totals.set(type, { graded: total.graded + graded, good: total.good + good })
      console.log(
        `${pdf.slice(0, 34).padEnd(34)} ${type.padEnd(15)} ${String(all.length).padStart(4)} ${String(sample.length).padStart(7)} ${String(graded).padStart(6)}  ${percent(good, graded)}`
      )
    }
  }

  console.log('\nGood, all PDFs:')
  for (const [type, t] of totals)
    console.log(`  ${type.padEnd(15)} ${percent(t.good, t.graded)}  (${t.good}/${t.graded})`)
  const bad = Object.entries(reasons).sort((a, b) => b[1] - a[1])
  if (bad.length > 0) {
    console.log('\nWhy questions were bad:')
    for (const [reason, n] of bad)
      console.log(`  ${String(n).padStart(3)}  ${reason}: ${BAD_REASONS[reason as BadReason]}`)
  }

  writeFileSync(
    TO_GRADE,
    toGrade.length > 0
      ? `# Questions to grade (${toGrade.length})\n\nAdd each to ${LABELS} under its key, as\n{ "verdict": "good" } or { "verdict": "bad", "reason": "<one of: ${Object.keys(BAD_REASONS).join(', ')}>" }.\n\n${toGrade.join('\n')}`
      : '# Nothing to grade\n'
  )
  if (toGrade.length > 0) console.log(`\n${toGrade.length} sampled questions have no grade yet: see ${TO_GRADE}`)
}

function formatForGrading(key: string, pdf: string, q: Question): string {
  const options = (q.options ?? []).map(
    (o, i) => `   ${'ABCDEFGH'[i]}. ${o.text}${o.text === q.answer ? '   <- marked answer' : ''}`
  )
  return [
    `## ${key}  (${pdf}, ${q.type}, p. ${q.page})`,
    '',
    `Q: ${q.prompt}`,
    ...(options.length > 0 ? options : [`   Answer: ${q.answer}`]),
    `   Explanation (p. ${q.explanationPage ?? q.page}): ${q.explanation}`,
    ''
  ].join('\n')
}

main().catch((err: unknown) => {
  console.error(`Benchmark failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
