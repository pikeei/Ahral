/**
 * Debug helper: inspect raw PDF.js text items on one page.
 *   npx tsx scripts/lib/dump-items.mts <file.pdf> <page> [contains]
 * Prints a per-font summary, then the items around the first match of `contains`.
 */
import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [file, pageArg, contains = ''] = process.argv.slice(2)
if (!file || !pageArg) throw new Error('usage: dump-items.mts <file.pdf> <page> [contains]')

const task = getDocument({ data: new Uint8Array(await readFile(file)), fontExtraProperties: true, verbosity: 0 })
const pdf = await task.promise
const page = await pdf.getPage(Number(pageArg))
const content = await page.getTextContent()
await page.getOperatorList()
const items = content.items.filter((i) => 'str' in i) as { str: string; transform: number[]; width: number; fontName: string }[]

const fontName = (id: string) => {
  try {
    return (page.commonObjs.get(id) as { name?: string; type?: string }).name ?? id
  } catch {
    return id
  }
}

const byFont = new Map<string, { items: number; chars: number; empty: number; sample: string }>()
for (const item of items) {
  const name = fontName(item.fontName)
  const entry = byFont.get(name) ?? { items: 0, chars: 0, empty: 0, sample: '' }
  entry.items++
  entry.chars += item.str.length
  if (item.str.trim() === '') entry.empty++
  if (entry.sample.length < 60 && item.str.trim() !== '') entry.sample += JSON.stringify(item.str) + ' '
  byFont.set(name, entry)
}
console.log('FONTS')
for (const [name, e] of byFont) console.log(`  ${name}: ${e.items} items, ${e.chars} chars, ${e.empty} blank  ${e.sample.slice(0, 80)}`)

const hit = items.findIndex((i) => i.str.includes(contains))
console.log(`\nITEMS around "${contains}"`)
for (const item of items.slice(Math.max(0, hit - 3), hit + 6)) {
  console.log(JSON.stringify({ str: item.str, x: Math.round(item.transform[4]!), y: Math.round(item.transform[5]!), w: Math.round(item.width), font: fontName(item.fontName) }))
}
await task.destroy()
