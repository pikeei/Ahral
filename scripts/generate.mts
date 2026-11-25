/**
 * Developer tool: generate questions from a PDF and print them for review.
 *
 *   npm run generate -- samples/notes.pdf            stats + a sample of each question type
 *   npm run generate -- samples/notes.pdf --all      every question
 *   npm run generate -- samples/notes.pdf --json     also write samples/notes.questions.json
 */
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { analyzeDocument } from '../src/core/analysis/analyze'
import { generateQuestions } from '../src/core/generation/generate'
import type { Question, QuestionType } from '../src/core/generation/types'
import { loadDictionary, readPdf } from './lib/read-pdf.mts'

const USAGE = 'Usage: npm run generate -- <file.pdf> [--all] [--json]'
const SAMPLE_PER_TYPE = 8

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  const { path, doc, ms: extractMs } = await readPdf(file)
  const dictionary = await loadDictionary()
  let started = performance.now()
  const analysis = analyzeDocument(doc)
  const analyzeMs = Math.round(performance.now() - started)
  started = performance.now()
  const { questions, stats } = generateQuestions(doc, analysis, { isWord: (w) => dictionary.has(w) })
  const generateMs = Math.round(performance.now() - started)

  console.log(`\n${basename(path)}`)
  console.log(`extract ${extractMs} ms · analyze ${analyzeMs} ms · generate ${generateMs} ms`)
  console.log(`Sentences: ${stats.sentences} · usable for questions: ${stats.usableSentences}`)
  console.log(`Rejected sentences: ${formatCounts(stats.rejectedSentences)}`)
  console.log(`Rejected questions: ${formatCounts(stats.rejectedQuestions)}`)
  console.log(
    `Questions: ${questions.length} (cloze ${stats.byType.cloze}, term MCQ ${stats.byType['mcq-term']}, ` +
      `definition MCQ ${stats.byType['mcq-definition']})`
  )

  const types: QuestionType[] = ['cloze', 'mcq-term', 'mcq-definition']
  for (const type of types) {
    const ofType = questions.filter((q) => q.type === type)
    const shown = args.includes('--all') ? ofType : spread(ofType, SAMPLE_PER_TYPE)
    console.log(`\n=== ${type} (${shown.length} of ${ofType.length}, spread across the ranking) ===`)
    for (const q of shown) printQuestion(q)
  }

  if (args.includes('--json')) {
    const out = `${path.replace(/\.pdf$/i, '')}.questions.json`
    await writeFile(out, JSON.stringify({ stats, questions }, null, 2))
    console.log(`\nWrote ${out}`)
  }
}

function printQuestion(q: Question): void {
  console.log(`\n[p${q.page} · quality ${q.quality}] ${q.prompt}`)
  if (q.options) {
    for (const [i, option] of q.options.entries()) {
      console.log(`   ${option.text === q.answer ? '*' : ' '} ${String.fromCharCode(65 + i)}. ${option.text}`)
    }
    return
  }
  const others = q.acceptedAnswers.filter((a) => a !== q.answer)
  console.log(`   answer: ${q.answer}${others.length > 0 ? `  (also: ${others.join(', ')})` : ''}`)
}

/** Evenly spaced picks across the ranked list, so the sample shows best, middle and worst. */
function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * (items.length - 1)) / (count - 1))]).filter(
    (item): item is T => item !== undefined
  )
}

function formatCounts(counts: Partial<Record<string, number>>): string {
  const entries = Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  return entries.length === 0 ? 'none' : entries.map(([k, v]) => `${k} ${v}`).join(', ')
}

main().catch((err: unknown) => {
  console.error(`Generation failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
