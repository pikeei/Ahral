import type { DatabaseSync } from 'node:sqlite'
import { assembleExam, displayedOptions } from '../core/exam/assemble'
import { describeFeedback, type GradeOptions, gradeAnswer } from '../core/exam/grade'
import { newSeed } from '../core/exam/random'
import { scoreExam } from '../core/exam/score'
import type { QuestionType } from '../core/generation/types'
import { sectionLabel } from '../core/pdf/sections'
import type {
  AnswerFeedback,
  DocumentDetail,
  DocumentSummary,
  ExamResponse,
  ExamSettings,
  ExamSummary,
  ExamView
} from '../shared/api'
import {
  type DocumentRecord,
  deleteDocument,
  getDocument,
  listDocuments,
  loadGlossary,
  loadQuestions,
  loadSections
} from './db/documents'
import { listAttempts, type StoredExam, saveAttempt, saveExam, sectionHistory } from './db/exams'

/*
 * What the UI can do, on top of the database: browse documents, take an exam one
 * answer at a time, and finish it. No Electron here, so it is unit-tested directly.
 *
 * An exam in progress lives in memory until it is finished; only finished attempts are saved.
 */

interface Session {
  exam: StoredExam
  labelOf: (sectionId: number) => string
  gradeOptions: GradeOptions
  responses: Map<string, string | null>
  feedback: Map<number, AnswerFeedback>
  startedAt: Date
}

export class ExamService {
  private readonly sessions = new Map<number, Session>()

  constructor(private readonly db: DatabaseSync) {}

  listDocuments(): DocumentSummary[] {
    return listDocuments(this.db).map((d) => this.summarize(d))
  }

  getDocument(id: number): DocumentDetail {
    const document = this.requireDocument(id)
    const sections = loadSections(this.db, id)
    const questions = loadQuestions(this.db, id)
    const perSection = new Map<number, Partial<Record<QuestionType, number>>>()
    const byType: DocumentDetail['questionCountByType'] = {}
    for (const q of questions) {
      const counts = perSection.get(q.sectionId) ?? {}
      counts[q.type] = (counts[q.type] ?? 0) + 1
      perSection.set(q.sectionId, counts)
      byType[q.type] = (byType[q.type] ?? 0) + 1
    }
    const total = (counts: Partial<Record<QuestionType, number>> = {}) =>
      Object.values(counts).reduce((sum, n) => sum + n, 0)
    return {
      document: this.summarize(document),
      warnings: document.warnings,
      sections: sections
        .filter((s) => perSection.has(s.id))
        .map((s) => ({
          id: s.id,
          label: sectionLabel(sections, s.id),
          questionCount: total(perSection.get(s.id)),
          countByType: perSection.get(s.id) ?? {}
        })),
      questionCountByType: byType,
      attempts: listAttempts(this.db, id).map((a) => ({
        id: a.id,
        seed: a.seed,
        correct: a.correct,
        total: a.total,
        percent: a.percent,
        finishedAt: a.finishedAt
      })),
      weakSections: sectionHistory(this.db, id)
        .filter((s) => s.weak)
        .map(({ label, correct, total, percent }) => ({ label, correct, total, percent }))
    }
  }

  deleteDocument(id: number): void {
    for (const [examId, session] of this.sessions) {
      if (session.exam.documentId === id) this.sessions.delete(examId)
    }
    deleteDocument(this.db, id)
  }

  startExam(documentId: number, settings: ExamSettings, seed: number = settings.seed ?? newSeed()): ExamView {
    this.requireDocument(documentId)
    const sections = loadSections(this.db, documentId)
    const labelOf = (sectionId: number) => sectionLabel(sections, sectionId)
    const assembled = assembleExam(
      loadQuestions(this.db, documentId),
      {
        questionCount: settings.questionCount,
        ...(settings.types.length > 0 ? { types: settings.types } : {}),
        ...(settings.sectionIds.length > 0 ? { sectionIds: settings.sectionIds } : {})
      },
      seed
    )
    // An empty exam is never started (or saved): say why instead.
    if (assembled.items.length === 0) {
      throw new Error(
        'No questions match these settings. The sections you picked have no questions of the types you picked.'
      )
    }
    const exam = saveExam(this.db, documentId, assembled)
    this.sessions.set(exam.id, {
      exam,
      labelOf,
      gradeOptions: { acceptTypos: settings.acceptTypos, glossary: loadGlossary(this.db, documentId) },
      responses: new Map(),
      feedback: new Map(),
      startedAt: new Date()
    })
    return {
      examId: exam.id,
      documentId,
      seed: exam.seed,
      warnings: exam.warnings,
      questions: exam.items.map((item, position) => {
        const options = displayedOptions(item).map((o) => o.text)
        return {
          position,
          type: item.question.type,
          prompt: item.question.prompt,
          ...(item.question.options ? { options } : {}),
          page: item.question.page,
          section: labelOf(item.question.sectionId)
        }
      })
    }
  }

  /** Grades one answer and explains it. Each question can be answered once. */
  answer(examId: number, position: number, response: ExamResponse): AnswerFeedback {
    const session = this.requireSession(examId)
    const item = session.exam.items[position]
    if (!item) throw new RangeError(`Exam ${examId} has no question ${position}`)
    if (session.feedback.has(position)) throw new Error(`Question ${position} has already been answered`)

    let given: string | null
    if ('choice' in response) {
      const option = displayedOptions(item)[response.choice]
      if (!option) throw new RangeError(`Question ${position} has no option ${response.choice}`)
      given = option.text
    } else {
      given = response.text.trim() === '' ? null : response.text.trim()
    }
    session.responses.set(item.question.id, given)

    const result = gradeAnswer(item.question, given, session.gradeOptions)
    const feedback: AnswerFeedback = {
      position,
      status: result.status,
      correct: result.correct,
      given,
      answer: item.question.answer,
      lines: describeFeedback(result)
    }
    session.feedback.set(position, feedback)
    return feedback
  }

  /** Scores the exam (unanswered questions count as wrong), saves the attempt and ends the session. */
  finish(examId: number): ExamSummary {
    const session = this.requireSession(examId)
    const { exam } = session
    const sectionTitles = new Map(
      exam.items.map((it) => [it.question.sectionId, session.labelOf(it.question.sectionId)])
    )
    const result = scoreExam(exam, session.responses, { ...session.gradeOptions, sectionTitles })
    saveAttempt(this.db, exam, result, {
      acceptTypos: session.gradeOptions.acceptTypos ?? false,
      startedAt: session.startedAt,
      finishedAt: new Date(),
      sectionLabel: session.labelOf
    })
    this.sessions.delete(examId)

    const toView = (s: { title: string | null; correct: number; total: number; percent: number }) => ({
      label: s.title ?? '(untitled)',
      correct: s.correct,
      total: s.total,
      percent: s.percent
    })
    return {
      examId,
      documentId: exam.documentId,
      seed: exam.seed,
      correct: result.correct,
      total: result.total,
      percent: result.percent,
      answered: result.answered,
      byType: result.byType as Partial<Record<QuestionType, { correct: number; total: number; percent: number }>>,
      bySection: result.bySection.map(toView),
      weakSections: result.weakSections.map(toView),
      review: exam.items.map((item, position) => {
        const answer = result.answers[position]
        const options = item.question.options ? displayedOptions(item).map((o) => o.text) : undefined
        return {
          position,
          prompt: item.question.prompt,
          ...(options ? { options } : {}),
          status: answer?.status ?? 'unanswered',
          correct: answer?.correct ?? false,
          given: answer?.given ?? null,
          answer: item.question.answer,
          lines: answer ? describeFeedback(answer) : []
        }
      })
    }
  }

  private summarize(document: DocumentRecord): DocumentSummary {
    const attempts = listAttempts(this.db, document.id)
    return {
      id: document.id,
      fileName: document.fileName,
      pageCount: document.pageCount,
      questionCount: document.questionCount,
      importedAt: document.importedAt,
      attemptCount: attempts.length,
      lastScore: attempts[0]?.percent ?? null
    }
  }

  private requireDocument(id: number): DocumentRecord {
    const document = getDocument(this.db, id)
    if (!document) throw new Error(`No document with id ${id}`)
    return document
  }

  private requireSession(examId: number): Session {
    const session = this.sessions.get(examId)
    if (!session) throw new Error(`Exam ${examId} is not in progress`)
    return session
  }
}
