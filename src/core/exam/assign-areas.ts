import type { Question } from '../generation/types'
import type { Block, Section } from '../pdf/layout-types'
import { areaFromText, areaFromTitle, type ContentArea } from './areas'

/** Blocks at the start of a document that may hold its title ("Chapter 3: Radiation Protection"). */
const TITLE_BLOCKS = 3

/**
 * Places each question in a board content area, from the most specific clue available:
 * its section's title or an enclosing one ("Radiation Protection › Questions"), then the
 * document's title, then the topic words of the question itself (mixed practice tests).
 * A question none of these place keeps no area: it is used in practice, not in mock exams.
 */
export function assignAreas(doc: { sections: Section[]; blocks: Block[] }, questions: Question[]): Question[] {
  const byId = new Map(doc.sections.map((s) => [s.id, s]))
  const sectionAreas = new Map<number, ContentArea | undefined>()
  const areaOfSection = (sectionId: number): ContentArea | undefined => {
    if (!sectionAreas.has(sectionId)) {
      let area: ContentArea | undefined
      for (let s = byId.get(sectionId); s && !area; s = s.parentId === null ? undefined : byId.get(s.parentId)) {
        if (s.title) area = areaFromTitle(s.title)
      }
      sectionAreas.set(sectionId, area)
    }
    return sectionAreas.get(sectionId)
  }
  const title = doc.blocks
    .slice(0, TITLE_BLOCKS)
    .map((b) => b.text)
    .join(' ')
  const documentArea = areaFromTitle(title)

  return questions.map((q) => {
    const area =
      areaOfSection(q.sectionId) ??
      documentArea ??
      areaFromText([q.prompt, q.answer, ...(q.options ?? []).map((o) => o.text), q.explanation].join(' '))
    return area ? { ...q, area } : q
  })
}
