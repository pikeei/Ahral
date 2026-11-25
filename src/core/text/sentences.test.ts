import { describe, expect, it } from 'vitest'
import { splitSentences } from './sentences'

const texts = (input: string) => splitSentences(input).map((s) => s.text)

describe('splitSentences', () => {
  it.each([
    ['splits on periods followed by a capital', 'Selenium automates browsers. Postman tests APIs.', ['Selenium automates browsers.', 'Postman tests APIs.']],
    ['splits on ? and !', 'Is it fast? Yes! It is.', ['Is it fast?', 'Yes!', 'It is.']],
    ['keeps closing quotes with the sentence', 'He said "stop." Then he left.', ['He said "stop."', 'Then he left.']],
    ['splits before a digit', 'There are two tools. 3 more exist.', ['There are two tools.', '3 more exist.']],
    ['does not split before a lowercase word', 'Use version 2. it works.', ['Use version 2. it works.']],
    ['does not split after e.g. and i.e.', 'Use a tool, e.g. Selenium. Then test.', ['Use a tool, e.g. Selenium.', 'Then test.']],
    ['does not split after titles', 'Dr. Smith wrote it. Prof. Lee agreed.', ['Dr. Smith wrote it.', 'Prof. Lee agreed.']],
    ['does not split after initials', 'Written by J. R. Smith in 2020. It sold well.', ['Written by J. R. Smith in 2020.', 'It sold well.']],
    ['does not split dotted acronyms', 'Based in the U.S. Army base. Done.', ['Based in the U.S. Army base.', 'Done.']],
    ['keeps "Fig. 3" together', 'See Fig. 3 for details. It shows the flow.', ['See Fig. 3 for details.', 'It shows the flow.']],
    ['splits after "no." when no number follows', 'The answer is No. That is final.', ['The answer is No.', 'That is final.']],
    ['keeps decimals intact', 'Version 3.5 is stable. Use it.', ['Version 3.5 is stable.', 'Use it.']],
    ['keeps text without final punctuation', 'Install Node first. Then run npm install', ['Install Node first.', 'Then run npm install']]
  ])('%s', (_name, input, expected) => {
    expect(texts(input)).toEqual(expected)
  })

  it('returns nothing for blank input', () => {
    expect(splitSentences('   ')).toEqual([])
  })

  it('reports the start offset of each sentence', () => {
    const input = 'First one.  Second one.'
    const spans = splitSentences(input)
    expect(spans.map((s) => input.slice(s.start, s.start + s.text.length))).toEqual(['First one.', 'Second one.'])
  })
})
