import { describe, expect, it } from 'vitest'
import { detectMissingLetters } from './letter-frequency'

const PARAGRAPH =
  'The professor offered feedback on the final draft of the field report. Software testing is the process of ' +
  'evaluating a system to find defects before users do. Performance testing measures how a system behaves ' +
  'under load, while security testing looks for weaknesses that attackers could exploit. '

describe('detectMissingLetters', () => {
  it('reports nothing for normal English text', () => {
    expect(detectMissingLetters(PARAGRAPH.repeat(20))).toEqual([])
  })

  it('detects a letter that has been stripped from the text', () => {
    const broken = PARAGRAPH.replace(/f/g, '').repeat(20)
    expect(detectMissingLetters(broken)).toEqual([{ letter: 'f', ratio: 0 }])
  })

  it('does not judge short texts', () => {
    expect(detectMissingLetters(PARAGRAPH.replace(/f/g, ''))).toEqual([])
  })
})
