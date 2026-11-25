/**
 * Developer tool: run the extraction pipeline on a PDF and print what it found.
 *
 *   npm run extract -- samples/notes.pdf          summary + first sentences per section
 *   npm run extract -- samples/notes.pdf --all    every sentence
 *   npm run extract -- samples/notes.pdf --json   also write samples/notes.extract.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractDocument } from '../src/core/extract'

const USAGE = `Usage: npm run extract -- <file.pdf> [--all] [--json]
  --all   print every sentence (default: first 3 per section)
  --json  also write <file>.extract.json next to the PDF`

const SENTENCES_PER_SECTION = 3

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  const showAll = args.includes('--all')
  const writeJson = args.includes('--json')

  const path = resolve(file)
  const data = new Uint8Array(await readFile(path))
  // PDF.js wants a path ending in "/", even on Windows.
  const standardFontDataUrl = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
    .replace(/\\/g, '/')
    .replace(/\/?$/, '/')

  const started = performance.now()
  const doc = await extractDocument(data, { standardFontDataUrl })
  const ms = Math.round(performance.now() - started)

  const pagesWithText = doc.pages.filter((p) => p.hasText).length
  console.log(`\n${basename(path)}`)
  console.log(
    `Pages: ${doc.pageCount} (${pagesWithText} with text) · Body font: ${doc.bodyFontSize}pt · ` +
      `Sections: ${doc.sections.length} · Sentences: ${doc.sentences.length} · ${ms} ms`
  )
  for (const warning of doc.warnings) console.log(`! ${warning}`)

  for (const section of doc.sections) {
    const indent = '  '.repeat(Math.max(0, section.level - 1))
    const sentences = doc.sentences.filter((s) => s.sectionId === section.id)
    const pages = section.pageStart === section.pageEnd ? `p.${section.pageStart}` : `p.${section.pageStart}-${section.pageEnd}`
    console.log(`\n${indent}# ${section.title ?? '(before first heading)'}  [${pages}, ${sentences.length} sentences]`)

    const shown = showAll ? sentences : sentences.slice(0, SENTENCES_PER_SECTION)
    for (const s of shown) console.log(`${indent}  p${s.page}  ${s.text}`)
    if (shown.length < sentences.length) console.log(`${indent}  … ${sentences.length - shown.length} more (use --all)`)

    const bold = [...new Set(doc.blocks.filter((b) => b.sectionId === section.id).flatMap((b) => b.boldRuns))]
    if (bold.length > 0) console.log(`${indent}  bold: ${bold.join(', ')}`)
  }

  if (writeJson) {
    const out = path.replace(/\.pdf$/i, '') + '.extract.json'
    await writeFile(out, JSON.stringify(doc, null, 2))
    console.log(`\nWrote ${out}`)
  }
}

main().catch((err: unknown) => {
  console.error(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
