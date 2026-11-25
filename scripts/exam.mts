/**
 * Developer tool: take a practice exam in the terminal, with feedback after each answer.
 *
 *   npm run exam -- samples/notes.pdf                     10 questions, new random seed
 *   npm run exam -- samples/notes.pdf --count 20 --seed 42
 *   npm run exam -- samples/notes.pdf --types cloze       only fill-in-the-blank
 *   npm run exam -- samples/notes.pdf --typos             accept near-miss spellings
 *   npm run exam -- samples/notes.pdf --auto              answer automatically (for a quick demo)
 *
 * Multiple choice: type the option letter. Fill-in-the-blank: type the word(s). Empty = skip.
 */
import { createInterface } from 'node:readline/promises'
import { analyzeDocument } from '../src/core/analysis/analyze'
import { assembleExam, displayedOptions, type ExamItem } from '../src/core/exam/assemble'
import { buildGlossary, describeFeedback, type GradeOptions, gradeAnswer } from '../src/core/exam/grade'
import { newSeed } from '../src/core/exam/random'
import { scoreExam } from '../src/core/exam/score'
import { generateQuestions } from '../src/core/generation/generate'
import type { QuestionType } from '../src/core/generation/types'
import { sectionLabel } from '../src/core/pdf/layout'
import { loadDictionary, readPdf } from './lib/read-pdf.mts'

const USAGE =
  'Usage: npm run exam -- <file.pdf> [--count N] [--seed N] [--types cloze,mcq-term,mcq-definition] [--typos] [--auto]'
const QUESTION_TYPES: QuestionType[] = ['cloze', 'mcq-term', 'mcq-definition']

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flagValue = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const file = args.find((a, i) => !a.startsWith('--') && !['--count', '--seed', '--types'].includes(args[i - 1] ?? ''))
  if (!file) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  const questionCount = Number(flagValue('--count') ?? 10)
  const seed = flagValue('--seed') !== undefined ? Number(flagValue('--seed')) : newSeed()
  const types = flagValue('--types')
    ?.split(',')
    .filter((t): t is QuestionType => QUESTION_TYPES.includes(t as QuestionType))
  const auto = args.includes('--auto')

  console.log(`Reading ${file} ...`)
  const { doc } = await readPdf(file)
  const dictionary = await loadDictionary()
  const isWord = (w: string) => dictionary.has(w)
  const analysis = analyzeDocument(doc)
  const { questions } = generateQuestions(doc, analysis, { isWord })
  const exam = assembleExam(questions, { questionCount, ...(types ? { types } : {}) }, seed)
  for (const warning of exam.warnings) console.log(`! ${warning}`)

  const gradeOptions: GradeOptions = {
    acceptTypos: args.includes('--typos'),
    glossary: buildGlossary(analysis.definitions)
  }
  const responses = new Map<string, string | null>()
  const terminal = auto ? undefined : createInterface({ input: process.stdin, output: process.stdout })

  for (const [n, item] of exam.items.entries()) {
    console.log(`\n${n + 1}/${exam.items.length}  ${item.question.prompt}`)
    const options = displayedOptions(item)
    for (const [i, o] of options.entries()) console.log(`    ${letter(i)}. ${o.text}`)

    const raw = terminal
      ? await terminal.question(options.length > 0 ? 'Your choice: ' : 'Your answer: ')
      : autoAnswer(item, n)
    if (auto) console.log(`  > ${raw}`)
    const given = options.length > 0 ? (options[raw.trim().toUpperCase().charCodeAt(0) - 65]?.text ?? null) : raw
    responses.set(item.question.id, given?.trim() ? given : null)

    const result = gradeAnswer(item.question, responses.get(item.question.id) ?? null, gradeOptions)
    for (const line of describeFeedback(result)) console.log(`  ${line}`)
  }
  terminal?.close()

  const sectionTitles = new Map(doc.sections.map((s) => [s.id, sectionLabel(doc.sections, s.id)]))
  const result = scoreExam(exam, responses, { ...gradeOptions, sectionTitles })
  console.log(`\nScore: ${result.correct}/${result.total} (${result.percent}%), answered ${result.answered}`)
  for (const [type, t] of Object.entries(result.byType)) console.log(`  ${type}: ${t.correct}/${t.total}`)
  console.log('By section:')
  for (const s of result.bySection) console.log(`  ${s.percent}%  ${s.correct}/${s.total}  ${s.title ?? '(untitled)'}`)
  if (result.weakSections.length > 0) {
    console.log(`Review these sections: ${result.weakSections.map((s) => s.title ?? '(untitled)').join('; ')}`)
  }
  console.log(`\nSeed ${seed}: run again with --seed ${seed} for the same exam.`)
}

/** Demo answers: right on even questions, a typical mistake on odd ones. */
function autoAnswer(item: ExamItem, n: number): string {
  const options = displayedOptions(item)
  if (options.length > 0) {
    const index = options.findIndex((o) =>
      n % 2 === 0 ? o.text === item.question.answer : o.text !== item.question.answer
    )
    return letter(Math.max(0, index))
  }
  if (n % 2 === 0) return item.question.answer
  // A one-letter typo, or the last word only (an incomplete answer).
  const words = item.question.answer.split(' ')
  return words.length > 1 ? (words.at(-1) ?? '') : item.question.answer.slice(0, -1)
}

function letter(i: number): string {
  return String.fromCharCode(65 + i)
}

main().catch((err: unknown) => {
  console.error(`Exam failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
