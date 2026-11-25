import type { QuestionType } from '../generation/types'
import type { Exam } from './assemble'
import { type AnswerResult, type GradeOptions, gradeAnswer } from './grade'

/*
 * Scoring: totals, per question type, per section, and weak sections.
 * A weak section is one where the user got less than WEAK_SECTION_PERCENT
 * right on at least MIN_QUESTIONS_FOR_WEAK_SECTION questions, so one unlucky
 * answer doesn't label a whole chapter as weak.
 */

export const WEAK_SECTION_PERCENT = 60
export const MIN_QUESTIONS_FOR_WEAK_SECTION = 2

export interface Tally {
  correct: number
  total: number
  percent: number
}

export interface SectionScore extends Tally {
  sectionId: number
  title: string | null
}

export interface ExamResult extends Tally {
  answered: number
  byType: Partial<Record<QuestionType, Tally>>
  bySection: SectionScore[]
  /** Lowest score first. */
  weakSections: SectionScore[]
  /** In exam order. */
  answers: AnswerResult[]
}

export interface ScoreOptions extends GradeOptions {
  sectionTitles?: Map<number, string | null>
}

/** `responses` maps question id to the given answer; missing ids count as unanswered. */
export function scoreExam(exam: Exam, responses: Map<string, string | null>, options: ScoreOptions = {}): ExamResult {
  const answers = exam.items.map((item) => gradeAnswer(item.question, responses.get(item.question.id) ?? null, options))

  const byType: ExamResult['byType'] = {}
  const sections = new Map<number, { correct: number; total: number }>()
  exam.items.forEach((item, i) => {
    const correct = answers[i]?.correct ? 1 : 0
    const type = byType[item.question.type] ?? { correct: 0, total: 0, percent: 0 }
    byType[item.question.type] = tally(type.correct + correct, type.total + 1)
    const section = sections.get(item.question.sectionId) ?? { correct: 0, total: 0 }
    sections.set(item.question.sectionId, { correct: section.correct + correct, total: section.total + 1 })
  })

  const bySection = [...sections.entries()]
    .map(([sectionId, s]) => ({
      sectionId,
      title: options.sectionTitles?.get(sectionId) ?? null,
      ...tally(s.correct, s.total)
    }))
    .sort((a, b) => a.sectionId - b.sectionId)
  const weakSections = bySection
    .filter((s) => s.total >= MIN_QUESTIONS_FOR_WEAK_SECTION && s.percent < WEAK_SECTION_PERCENT)
    .sort((a, b) => a.percent - b.percent || a.sectionId - b.sectionId)

  return {
    ...tally(answers.filter((a) => a.correct).length, answers.length),
    answered: answers.filter((a) => a.status !== 'unanswered').length,
    byType,
    bySection,
    weakSections,
    answers
  }
}

export function tally(correct: number, total: number): Tally {
  return { correct, total, percent: total === 0 ? 0 : Math.round((100 * correct) / total) }
}
