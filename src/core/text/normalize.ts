/**
 * Cleans text that comes out of PDFs without changing its meaning.
 *
 * - NFKC folds typographic ligatures ("ﬁ" → "fi") and full-width or
 *   non-breaking spaces into their plain forms.
 * - Soft hyphens and zero-width characters are invisible in the PDF
 *   but would break word matching later, so they are removed.
 * - Private-use characters are symbol-font glyphs (bullets, check boxes) with no
 *   meaning as text; they showed up as "" before explanations, so they are removed.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[­​-‍⁠﻿]/g, '')
    .replace(/[-]/g, '')
    .replace(/[\t  -   　]/g, ' ')
    .replace(/ {2,}/g, ' ')
}

/*
 * Some PDFs have a damaged text layer that looks fine on screen but where spaces were saved
 * as "(" or "$" and hyphens as "E" or "D":
 *   "The$dose$of$radiation(is(referred" -> "The dose of radiation is referred"
 *   "linear(energy(transfer((LET).(" -> "linear energy transfer (LET)."
 *   "xEray", "doseDresponse" -> "x-ray", "dose-response"
 * Only a line that clearly has this damage is changed: one where "(" or "$" follows a letter,
 * digit or punctuation mark again and again. In ordinary text a bracket comes after a space,
 * so "characteristic(s)" or "dose(s)" alone never trigger it.
 */
const STAND_IN_AFTER_WORD = /(?<=[\p{L}\p{N}.,;:'’)])[($]/gu
const MIN_STAND_INS = 2
/** Share of the line's space-separated words that must carry a stand-in for the line to count as damaged. */
const MIN_STAND_IN_SHARE = 0.3

/** Whether a line clearly shows the damage (stand-ins stuck to words, again and again). */
export function hasSubstitutedSpaces(line: string): boolean {
  const standIns = line.match(STAND_IN_AFTER_WORD)?.length ?? 0
  const words = line.split(/\s+/).filter((w) => w !== '').length
  return standIns >= MIN_STAND_INS && standIns >= words * MIN_STAND_IN_SHARE
}

/**
 * Repairs a damaged line. Without `force`, only a line that clearly has the damage is
 * changed; `force` is for lines on a page already known to be damaged ("Ans.$C$ $").
 */
export function repairSubstitutedSpaces(line: string, options: { force?: boolean } = {}): string {
  if (!options.force && !hasSubstitutedSpaces(line)) return line
  return (
    line
      .replace(/\$/g, ' ')
      // A "(" stuck to the word before it was a space; one after a space is a real bracket.
      .replace(/(?<=[\p{L}\p{N}.,;:'’)])\(/gu, ' ')
      // A "(" followed by a space or the end of the line is a leftover space too.
      .replace(/\((?=\s|$)/g, ' ')
      // Hyphens saved as a capital E or D between lowercase letters ("xEray", "longDterm").
      .replace(/(?<=\p{Ll})[ED](?=\p{Ll})/gu, '-')
      // A lone "!" was a bullet glyph.
      .replace(/(^|\s)!(?=\s)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
