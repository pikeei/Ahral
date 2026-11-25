/**
 * Developer tool: show the definitions, acronyms and key terms found in a PDF.
 *
 *   npm run analyze -- samples/notes.pdf            top 25 terms
 *   npm run analyze -- samples/notes.pdf --top 60   more terms
 *   npm run analyze -- samples/notes.pdf --json     also write samples/notes.analysis.json
 */
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { analyzeDocument } from '../src/core/analysis/analyze'
import { readPdf } from './lib/read-pdf.mts'

const USAGE = `Usage: npm run analyze -- <file.pdf> [--top N] [--json]`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--top')
  if (!file) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  const topIndex = args.indexOf('--top')
  const top = topIndex >= 0 ? Number(args[topIndex + 1]) || 25 : 25

  const { path, doc, ms: extractMs } = await readPdf(file)
  const started = performance.now()
  const analysis = analyzeDocument(doc)
  const analyzeMs = Math.round(performance.now() - started)

  console.log(`\n${basename(path)}`)
  console.log(
    `Sentences: ${doc.sentences.length} · Definitions: ${analysis.definitions.length} · ` +
      `Acronyms: ${analysis.aliases.length} · Terms: ${analysis.terms.length} · ` +
      `extract ${extractMs} ms + analyze ${analyzeMs} ms`
  )

  console.log('\nDEFINITIONS')
  for (const d of analysis.definitions) {
    console.log(`  p${d.page}  ${d.term}  =  ${d.definition}`)
    console.log(`        ${d.pattern}, confidence ${d.confidence}`)
  }

  if (analysis.aliases.length > 0) {
    console.log('\nACRONYMS')
    for (const a of analysis.aliases) console.log(`  ${a.short}  =  ${a.long}`)
  }

  console.log(`\nTOP ${Math.min(top, analysis.terms.length)} TERMS  (score · frequency · sources)`)
  for (const t of analysis.terms.slice(0, top)) {
    const alt = t.alternatives.length > 0 ? `  aka ${t.alternatives.join(', ')}` : ''
    console.log(
      `  ${t.score.toFixed(2).padStart(6)}  ${String(t.frequency).padStart(3)}×  ${t.text}  [${t.sources.join(', ')}]${alt}`
    )
  }

  if (args.includes('--json')) {
    const out = `${path.replace(/\.pdf$/i, '')}.analysis.json`
    await writeFile(out, JSON.stringify(analysis, null, 2))
    console.log(`\nWrote ${out}`)
  }
}

main().catch((err: unknown) => {
  console.error(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
