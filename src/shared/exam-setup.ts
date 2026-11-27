import type { QuestionType, SectionOption } from './api'

/*
 * Exam setup arithmetic shared by the setup screen and its tests: how many questions
 * the current choice of types and sections can draw from.
 */

/** Questions in one section of the chosen types. */
export function sectionMatches(section: SectionOption, types: QuestionType[]): number {
  return types.reduce((sum, type) => sum + (section.countByType[type] ?? 0), 0)
}

/** Questions of the chosen types in the chosen sections (no sections chosen = all of them). */
export function matchingQuestions(sections: SectionOption[], types: QuestionType[], sectionIds: number[]): number {
  const chosen = sectionIds.length > 0 ? sections.filter((s) => sectionIds.includes(s.id)) : sections
  return chosen.reduce((sum, section) => sum + sectionMatches(section, types), 0)
}
