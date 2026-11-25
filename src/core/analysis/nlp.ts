import nlp from 'compromise'

/**
 * Thin wrapper around compromise (a rule-based English tagger: dictionaries
 * plus grammar rules, no machine-learned model). The rest of the code only
 * sees `Token`, so the tagger could be replaced without touching analysis logic.
 */
export interface Token {
  /** Text as written in the sentence. */
  text: string
  /** Lowercase base form used for matching: "browsers" → "browser". */
  key: string
  tags: Set<string>
  start: number
  end: number
  /** Punctuation after the token (",", ")", ":") that ends a phrase. */
  breaksAfter: boolean
}

interface CompromiseTerm {
  text: string
  post: string
  normal: string
  root?: string
  tags: string[]
  offset: { start: number; length: number }
}

export function tokenize(text: string): Token[] {
  const doc = nlp(text)
  doc.compute('root')
  const sentences = doc.json({ offset: true, terms: { normal: true } }) as { terms: CompromiseTerm[] }[]

  const tokens: Token[] = []
  let joinNext = false
  for (const sentence of sentences) {
    for (const term of sentence.terms) {
      if (term.text === '') continue
      const start = term.offset.start
      const token: Token = {
        text: term.text,
        key: (term.root ?? term.normal ?? term.text).toLowerCase(),
        tags: new Set(term.tags),
        start,
        end: start + term.offset.length,
        breaksAfter: /[,;:()[\]"!?.—–]/.test(term.post) || / - /.test(` ${term.post} `)
      }
      const previous = tokens[tokens.length - 1]
      if (joinNext && previous) {
        // compromise splits "open-source" in two; keep hyphenated words whole,
        // tagged like their last part ("open-source" behaves like "source").
        previous.text = text.slice(previous.start, token.end)
        previous.key = `${previous.key}-${token.key}`
        previous.tags = token.tags
        previous.end = token.end
        previous.breaksAfter = token.breaksAfter
      } else {
        tokens.push(token)
      }
      joinNext = term.post === '-'
    }
  }
  return tokens
}

/** Matching key for any phrase: "Test Plans" and "test plan" share the key "test plan". */
export function phraseKey(text: string): string {
  return tokenize(text)
    .map((t) => t.key)
    .join(' ')
}

/** Words that never make a useful term or definition subject on their own. */
export const STOPWORDS = new Set(
  (
    'a an the and or but nor so yet of in on at to for from by with without about into onto over under ' +
    'between through during before after above below up down out off than then as if when where while ' +
    'which who whom whose what that this these those it its they them their there here is are was were ' +
    'be been being am do does did has have had can could will would shall should may might must not no ' +
    'yes also very more most less least such each every any all both either neither some many much few ' +
    'other another same own only just even still too i me my we us our you your he him his she her one'
  ).split(' ')
)
