/**
 * Cleans text that comes out of PDFs without changing its meaning.
 *
 * - NFKC folds typographic ligatures ("ﬁ" → "fi") and full-width or
 *   non-breaking spaces into their plain forms.
 * - Soft hyphens and zero-width characters are invisible in the PDF
 *   but would break word matching later, so they are removed.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[­​-‍⁠﻿]/g, '')
    .replace(/[\t  -   　]/g, ' ')
    .replace(/ {2,}/g, ' ')
}
