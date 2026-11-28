/**
 * Fact check for the built-in question bank (src/content/bank/*.json).
 *
 *   npm run check-bank                       check every bank file against samples/*.pdf
 *   npm run check-bank -- src/content/bank/safety.json
 *
 * The bank is written from scratch; the reference PDFs only confirm the facts. For each
 * question, the text of the right answer and the key words of the question must appear
 * together in a sentence (or two neighbouring sentences) of a reference PDF. A question with
 * no such passage is flagged for review instead of being trusted.
 *
 * The findings, with short excerpts from the PDFs, go to samples/bank-review/ (git-ignored):
 * the excerpts are the PDFs' text and are never published.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { extractDocument } from '../src/core/extract'
import { contentWords } from '../src/core/generation/similarity'
import { PIPELINE_VERSION } from '../src/core/version'
import { loadDictionary, standardFontDataUrl } from './lib/read-pdf.mts'

interface BankQuestion {
  id: string
  area: string
  topic: string
  stem: string
  options: string[]
  answer: number
  explanation: string
}

interface Passage {
  pdf: string
  page: number
  text: string
}

const REFERENCES = 'samples'
const CACHE = 'samples/.cache'
const REVIEW = 'samples/bank-review'
/** Share of the answer's words a passage must contain. */
const MIN_ANSWER_COVERAGE = 0.8
/** Key words of the question a passage must also contain. */
const MIN_STEM_WORDS = 2

function numbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? []
}

async function referencePassages(): Promise<Passage[]> {
  mkdirSync(CACHE, { recursive: true })
  const dictionary = await loadDictionary()
  const passages: Passage[] = []
  for (const file of readdirSync(REFERENCES).filter((f) => f.endsWith('.pdf') && f !== 'demo-reviewer.pdf')) {
    const data = readFileSync(`${REFERENCES}/${file}`)
    const sha = createHash('sha256').update(data).digest('hex').slice(0, 16)
    const cached = `${CACHE}/${sha}.v${PIPELINE_VERSION}.json`
    let sentences: { text: string; page: number }[]
    if (existsSync(cached)) {
      sentences = JSON.parse(readFileSync(cached, 'utf8'))
    } else {
      const doc = await extractDocument(new Uint8Array(data), {
        standardFontDataUrl: standardFontDataUrl(),
        isWord: (w) => dictionary.has(w)
      })
      sentences = doc.sentences.map((s) => ({ text: s.text, page: s.page }))
      writeFileSync(cached, JSON.stringify(sentences))
    }
    // Each sentence alone and joined with the next, since a fact can span two.
    sentences.forEach((s, i) => {
      passages.push({ pdf: file, page: s.page, text: s.text })
      const next = sentences[i + 1]
      if (next) passages.push({ pdf: file, page: s.page, text: `${s.text} ${next.text}` })
    })
  }
  return passages
}

interface Finding {
  supported: boolean
  best?: Passage & { answerCoverage: number; stemWords: number }
}

function check(q: BankQuestion, passages: Passage[], prepared: { words: Set<string>; nums: Set<string> }[]): Finding {
  const answer = q.options[q.answer] ?? ''
  const answerWords = [...contentWords(answer)]
  const answerNumbers = numbers(answer)
  const stemWords = [...contentWords(q.stem)].filter((w) => !answerWords.includes(w))
  let best: Finding['best']
  passages.forEach((p, i) => {
    const facts = prepared[i]
    if (!facts) return
    const { words, nums } = facts
    // Every number in the answer must be there exactly ("50 mSv" is not "5 mSv").
    if (!answerNumbers.every((n) => nums.has(n))) return
    const covered = answerWords.filter((w) => words.has(w)).length
    const answerCoverage = answerWords.length === 0 ? 1 : covered / answerWords.length
    const stemHits = stemWords.filter((w) => words.has(w)).length
    const score = answerCoverage * 10 + stemHits
    if (!best || score > best.answerCoverage * 10 + best.stemWords) {
      best = { ...p, answerCoverage, stemWords: stemHits }
    }
  })
  const supported = !!best && best.answerCoverage >= MIN_ANSWER_COVERAGE && best.stemWords >= MIN_STEM_WORDS
  return best ? { supported, best } : { supported }
}

async function main(): Promise<void> {
  const files =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : readdirSync('src/content/bank')
          .filter((f) => f.endsWith('.json'))
          .map((f) => `src/content/bank/${f}`)
  console.log('Reading the reference PDFs (cached after the first run) ...')
  const passages = await referencePassages()
  const prepared = passages.map((p) => ({ words: contentWords(p.text), nums: new Set(numbers(p.text)) }))
  mkdirSync(REVIEW, { recursive: true })

  for (const file of files) {
    const bank = JSON.parse(readFileSync(file, 'utf8')) as BankQuestion[]
    const lines: string[] = [`# Review: ${basename(file)} (${bank.length} questions)`, '']
    let supported = 0
    for (const q of bank) {
      const finding = check(q, passages, prepared)
      if (finding.supported) supported++
      const b = finding.best
      lines.push(
        `## ${q.id} · ${q.topic} · ${finding.supported ? 'SUPPORTED' : 'NEEDS REVIEW'}`,
        '',
        q.stem,
        ...q.options.map((o, i) => `- ${'ABCD'[i]}. ${o}${i === q.answer ? '  **(answer)**' : ''}`),
        '',
        `Explanation: ${q.explanation}`,
        '',
        b
          ? `Closest passage (${b.pdf}, p. ${b.page}; answer words ${Math.round(b.answerCoverage * 100)}%, question words ${b.stemWords}): ${b.text.slice(0, 300)}`
          : 'No passage found.',
        ''
      )
    }
    const out = `${REVIEW}/${basename(file, '.json')}.md`
    writeFileSync(out, lines.join('\n'))
    console.log(`${basename(file)}: ${supported} of ${bank.length} supported by the reference PDFs; review: ${out}`)
  }
}

main().catch((err: unknown) => {
  console.error(`Check failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
