import { detectMissingLetters } from '../text/letter-frequency'
import { createRepairer } from '../text/repair'
import type { Block, Line } from './layout-types'

/**
 * Step 4b: letters missing from the text layer.
 *
 * Detects letters the PDF's font failed to map (see text/letter-frequency.ts)
 * and, given a dictionary, repairs the broken words in place. Returns warnings.
 *
 * Runs on blocks, after words hyphenated across lines are rejoined ("emo-" +
 * "ral" -> "emoral" -> "femoral"). Each page's part of a block is repaired
 * separately so the page-break offsets can be recalculated exactly.
 */
export function repairMissingLetters(
  lines: Line[],
  blocks: Block[],
  isWord: ((word: string) => boolean) | undefined
): string[] {
  const missing = detectMissingLetters(lines.map((l) => l.text).join(' '))
  if (missing.length === 0) return []

  const letters = missing.map((m) => `"${m.letter}" (${Math.round(m.ratio * 100)}% of the usual amount)`).join(', ')
  const problem = `This PDF's text layer is missing letters: ${letters}, so words containing them are broken (for example "of" becomes "o").`
  if (!isWord) return [`${problem} Questions may contain errors.`]

  // Only the curated dictionary decides what a repair may produce: the document's own broken
  // forms ("lef") must never become targets. The document does break ties, though: how often
  // each dictionary word appears intact here ("left" far more often than "file").
  const counts = new Map<string, number>()
  for (const line of lines) {
    for (const word of line.text.toLowerCase().match(/\p{L}+/gu) ?? []) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const repair = createRepairer({
    missingLetters: missing.map((m) => m.letter),
    isWord,
    frequency: (w) => counts.get(w) ?? 0
  })

  let repairs = 0
  for (const block of blocks) {
    // Cut the text at page breaks, repair each piece, then rebuild text and offsets.
    const cuts = [0, ...block.pageBreaks.map((b) => b.offset), block.text.length]
    const pages = [block.page, ...block.pageBreaks.map((b) => b.page)]
    let text = ''
    const pageBreaks: Block['pageBreaks'] = []
    for (const [i, page] of pages.entries()) {
      if (i > 0) pageBreaks.push({ offset: text.length, page })
      // Only the block's first piece starts a sentence; later pieces continue across a page break.
      const result = repair(block.text.slice(cuts[i], cuts[i + 1]), { startsSentence: i === 0 })
      text += result.text
      repairs += result.repairs
    }
    block.text = text
    block.pageBreaks = pageBreaks
    block.boldRuns = block.boldRuns.map((run) => repair(run).text)
  }
  return [`${problem} Repaired ${repairs} words using a dictionary; uncommon terms may still be broken.`]
}
