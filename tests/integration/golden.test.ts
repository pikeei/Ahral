import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import wordListPath from 'word-list'
import { analyzeDocument, type DocumentAnalysis } from '../../src/core/analysis/analyze'
import { describeQuestionBank, extractQuestionBank, type QuestionBankResult } from '../../src/core/bank/question-bank'
import { type ExtractedDocument, extractDocument } from '../../src/core/extract'
import { type GenerationResult, generateQuestions } from '../../src/core/generation/generate'
import { buildGoldenPdf } from '../fixtures/golden-pdf'

/*
 * Golden-file regression test for the whole pipeline: PDF -> extraction -> analysis -> questions.
 *
 * The fixture PDF reproduces the problems found in real books (see golden-pdf.ts). The output
 * is written as readable text to __golden__/pipeline.txt and compared on every run, so any
 * change in extraction or question quality shows up as a plain diff in review.
 *
 * After an intentional change, review the diff and update the file with:  npx vitest run -u
 */

const dictionary = new Set(readFileSync(wordListPath, 'utf8').split(/\r?\n/))
const isWord = (w: string) => dictionary.has(w)
const standardFontDataUrl = `${resolve('node_modules/pdfjs-dist/standard_fonts')}/`

let doc: ExtractedDocument
let analysis: DocumentAnalysis
let result: GenerationResult
let bank: QuestionBankResult

beforeAll(async () => {
  doc = await extractDocument(await buildGoldenPdf(), { standardFontDataUrl, isWord })
  analysis = analyzeDocument(doc)
  result = generateQuestions(doc, analysis, { isWord })
  bank = extractQuestionBank(doc.blocks)
})

describe('golden pipeline', () => {
  it('matches the reviewed output', async () => {
    await expect(summarize(doc, analysis, result, bank)).toMatchFileSnapshot('./__golden__/pipeline.txt')
  })

  // Invariants that must hold whatever the snapshot says.
  it('detects and repairs the missing letter', () => {
    expect(doc.warnings.some((w) => /missing letters: "f"/.test(w) && /Repaired \d+ words/.test(w))).toBe(true)
    const text = doc.sentences.map((s) => s.text).join(' ')
    for (const fixed of ['five most', 'femoral', 'Superficial arteries', 'infectious', 'effective']) {
      expect(text).toContain(fixed)
    }
  })

  it('removes running headers and page numbers', () => {
    const text = doc.sentences.map((s) => s.text).join(' ')
    expect(text).not.toContain('Radiography Review Notes')
    expect(text).not.toMatch(/Page \d/)
  })

  it('reads the two-column page left column first', () => {
    const texts = doc.sentences.map((s) => s.text)
    const leftEnd = texts.findIndex((t) => t.includes('practical during exposure'))
    const rightStart = texts.findIndex((t) => t.startsWith('Lead aprons'))
    expect(leftEnd).toBeGreaterThanOrEqual(0)
    expect(rightStart).toBeGreaterThan(leftEnd)
  })

  it('never puts a broken fragment into a question', () => {
    for (const q of result.questions) {
      const text = [q.prompt, q.answer, ...(q.options ?? []).map((o) => o.text)].join(' ')
      expect(text).not.toMatch(/(?<![\p{L}.'-])[oi](?![\p{L}.'-])/u)
      expect(text).not.toMatch(/\b(eedback|speci c|super cial|e ective|in ectious)\b/i)
    }
  })

  it('builds well-formed multiple-choice questions', () => {
    for (const q of result.questions.filter((x) => x.options)) {
      const texts = q.options!.map((o) => o.text)
      expect(texts).toHaveLength(4)
      expect(new Set(texts).size).toBe(4)
      expect(texts).toContain(q.answer)
      // Every option can be explained: it comes from a definition in the document.
      expect(q.options!.every((o) => o.source !== undefined)).toBe(true)
    }
  })

  it('imports the book’s own questions with their answer key from a later page', () => {
    expect(bank.stats).toEqual({ found: 2, imported: 2, withoutAnswer: 0, needsFigure: 0, malformed: 0 })
    const [pulse, contact] = bank.questions
    expect(pulse).toMatchObject({ answer: 'Superficial arteries', page: 3, explanationPage: 4, keepOptionOrder: true })
    expect(contact?.prompt).toBe(
      'Diseases that require contact precautions include\n1. MRSA\n2. wound infections\n3. influenza'
    )
    expect(contact?.answer).toBe('1 and 2 only')
    expect(contact?.explanation).toMatch(/^MRSA and wound infections spread by direct contact/)
  })

  it('never carries the book’s answer letters into generated questions', () => {
    // "(D) Irradiation damage is ..." in an answer key: the D belongs to another question.
    for (const q of result.questions) {
      expect([q.prompt, q.explanation, ...(q.options ?? []).map((o) => o.text)].join('\n')).not.toMatch(
        /(^|\n)\([A-H]\) /
      )
    }
  })

  it('references real pages', () => {
    for (const q of result.questions) {
      expect(q.page).toBeGreaterThanOrEqual(1)
      expect(q.page).toBeLessThanOrEqual(doc.pageCount)
    }
  })
})

/** A compact, human-readable view of everything the pipeline produced. */
function summarize(d: ExtractedDocument, a: DocumentAnalysis, r: GenerationResult, b: QuestionBankResult): string {
  const out: string[] = []
  out.push('WARNINGS', ...d.warnings.map((w) => `- ${w}`), '')
  out.push('SECTIONS', ...d.sections.map((s) => `- p${s.pageStart}-${s.pageEnd} ${s.title ?? '(untitled)'}`), '')
  out.push('SENTENCES', ...d.sentences.map((s) => `- p${s.page} ${s.text}`), '')
  out.push(
    'DEFINITIONS',
    ...a.definitions.map((x) => `- p${x.page} ${x.term} = ${x.definition}  [${x.pattern} ${x.confidence}]`),
    ''
  )
  out.push('TOP TERMS', ...a.terms.slice(0, 15).map((t) => `- ${t.text} (${t.score})`), '')
  out.push(`BOOK QUESTIONS (${describeQuestionBank(b.stats) ?? 'none'})`)
  for (const q of b.questions) {
    out.push(`[${q.id} p${q.page}, explained p${q.explanationPage}] ${q.prompt.replace(/\n/g, ' / ')}`)
    out.push(...(q.options ?? []).map((o) => `    ${o.text === q.answer ? '*' : '-'} ${o.text}`))
    out.push(`    because: ${q.explanation}`)
  }
  out.push('')
  out.push(`QUESTIONS (${r.questions.length})`)
  for (const q of r.questions) {
    out.push(`[${q.type} p${q.page} q${q.quality}] ${q.prompt}`)
    if (q.options) out.push(...q.options.map((o) => `    ${o.text === q.answer ? '*' : '-'} ${o.text}`))
    else out.push(`    = ${q.answer}`)
  }
  return `${out.join('\n')}\n`
}
