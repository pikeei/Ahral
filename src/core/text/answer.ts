/**
 * Normalizes an answer for comparison: case, punctuation, hyphens, extra
 * spaces and a leading article don't matter ("The Open-Source tool." equals
 * "open source tool"). "+" and "#" are kept so "C++" and "C#" stay distinct from "C".
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

/** Same answer after normalization, also treating a trailing plural "s" as equal ("defects" = "defect"). */
export function sameAnswer(a: string, b: string): boolean {
  const x = normalizeAnswer(a)
  const y = normalizeAnswer(b)
  return x === y || singular(x) === singular(y)
}

/** One answer contains the other as whole words ("API" and "API testing"). */
export function overlappingAnswers(a: string, b: string): boolean {
  const x = ` ${singular(normalizeAnswer(a))} `
  const y = ` ${singular(normalizeAnswer(b))} `
  return x.includes(y) || y.includes(x)
}

/** Levenshtein distance: the fewest single-letter edits that turn one text into the other. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution))
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

function singular(text: string): string {
  return text
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ')
}
