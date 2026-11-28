import {
  AREA_LABELS,
  areaQuotas,
  BLUEPRINTS,
  type BlueprintId,
  CONTENT_AREAS,
  type ContentArea
} from '../core/exam/areas'
import { assembleExam, displayedOptions, type Exam, type ExamItem } from '../core/exam/assemble'
import { describeFeedback, type GlossaryEntry, type GradeOptions, gradeAnswer } from '../core/exam/grade'
import { createRandom, newSeed, shuffle } from '../core/exam/random'
import { scoreExam } from '../core/exam/score'
import type { Question, QuestionType } from '../core/generation/types'
import { sectionLabel } from '../core/pdf/sections'
import type {
  AnswerFeedback,
  DocumentDetail,
  DocumentSummary,
  ExamResponse,
  ExamSettings,
  ExamSummary,
  ExamView,
  Readiness,
  StudySettings
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
import {
  areaHistory,
  type ExamMode,
  listAttempts,
  listStudyAttempts,
  type StoredExam,
  saveAttempt,
  saveExam,
  sectionHistory
} from './db/exams'
import type { SqlDatabase } from './db/sql'

/*
 * What the UI can do, on top of the database: browse documents, practise one PDF or the
 * whole study set, sit a timed mock exam, and see readiness by board content area.
 * No Electron and no browser here, so it is unit-tested directly.
 *
 * An exam in progress lives in memory until it is finished; only finished attempts are saved.
 */

/** The board exam is multiple choice, so a mock exam uses only these. */
const MOCK_TYPES: QuestionType[] = ['book-mcq', 'mcq-term', 'mcq-definition']
/** The real exam: 230 questions (200 scored, 30 pilot) in 3 hours 30 minutes. A mock keeps that pace. */
const SECONDS_PER_QUESTION = (3.5 * 3600) / 230
/** An area needs this many answers before its score decides what to practise next. */
const MIN_ANSWERS_FOR_SCORE = 10

interface Session {
  exam: StoredExam
  labelOf: (question: Question) => string
  gradeOptions: GradeOptions
  responses: Map<string, string | null>
  feedback: Map<number, AnswerFeedback>
  startedAt: Date
}

/** A question from one document, given an id that is unique across the study set. */
interface PooledQuestion {
  question: Question
  label: string
}

export class ExamService {
  private readonly sessions = new Map<number, Session>()

  constructor(private readonly db: SqlDatabase) {}

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

  /** Practice from one document. */
  startExam(documentId: number, settings: ExamSettings, seed: number = settings.seed ?? newSeed()): ExamView {
    this.requireDocument(documentId)
    const sections = loadSections(this.db, documentId)
    const assembled = assembleExam(
      loadQuestions(this.db, documentId),
      {
        questionCount: settings.questionCount,
        ...(settings.types.length > 0 ? { types: settings.types } : {}),
        ...(settings.sectionIds.length > 0 ? { sectionIds: settings.sectionIds } : {})
      },
      seed
    )
    if (assembled.items.length === 0) {
      throw new Error(
        'No questions match these settings. The sections you picked have no questions of the types you picked.'
      )
    }
    return this.begin(documentId, assembled, 'practice', {
      labelOf: (q) => sectionLabel(sections, q.sectionId),
      gradeOptions: { acceptTypos: settings.acceptTypos, glossary: loadGlossary(this.db, documentId) }
    })
  }

  /** Practice or a mock exam drawn from every imported document together. */
  startStudyExam(settings: StudySettings, seed: number = settings.seed ?? newSeed()): ExamView {
    const { questions, labels, glossary } = this.studySet()
    if (questions.length === 0) throw new Error('Import your study PDFs first: there are no questions yet.')
    const assembled =
      settings.mode === 'mock'
        ? assembleMock(questions, settings.questionCount, settings.blueprint, seed)
        : assembleExam(
            settings.areas.length > 0 ? questions.filter((q) => q.area && settings.areas.includes(q.area)) : questions,
            { questionCount: settings.questionCount, ...(settings.types.length > 0 ? { types: settings.types } : {}) },
            seed
          )
    if (assembled.items.length === 0) {
      throw new Error('No questions match these settings: try another area or question type.')
    }
    const view = this.begin(null, assembled, settings.mode, {
      labelOf: (q) => labels.get(q.id) ?? '',
      gradeOptions: { acceptTypos: settings.acceptTypos, glossary }
    })
    return settings.mode === 'mock'
      ? { ...view, timeLimitSeconds: Math.round(assembled.items.length * SECONDS_PER_QUESTION) }
      : view
  }

  /** Grades one answer and explains it (practice). Each question can be answered once. */
  answer(examId: number, position: number, response: ExamResponse): AnswerFeedback {
    const session = this.requireSession(examId)
    if (session.exam.mode === 'mock') throw new Error('A mock exam shows answers at the end')
    const { item, given } = this.resolve(session, examId, position, response)
    if (session.feedback.has(position)) throw new Error(`Question ${position} has already been answered`)
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

  /** Records (or changes) an answer without grading it (mock exam). Empty text clears it. */
  record(examId: number, position: number, response: ExamResponse): void {
    const session = this.requireSession(examId)
    const { item, given } = this.resolve(session, examId, position, response)
    session.responses.set(item.question.id, given)
  }

  /** Scores the exam (unanswered questions count as wrong), saves the attempt and ends the session. */
  finish(examId: number): ExamSummary {
    const session = this.requireSession(examId)
    const { exam } = session
    const sectionTitles = new Map(exam.items.map((it) => [it.question.sectionId, session.labelOf(it.question)]))
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
    const byArea = CONTENT_AREAS.flatMap((area) => {
      const answers = exam.items.flatMap((it, i) => (it.question.area === area ? [result.answers[i]] : []))
      if (answers.length === 0) return []
      const correct = answers.filter((a) => a?.correct).length
      return [{ label: AREA_LABELS[area], correct, total: answers.length, percent: percentOf(correct, answers.length) }]
    })
    return {
      examId,
      documentId: exam.documentId,
      mode: exam.mode,
      byArea,
      seed: exam.seed,
      correct: result.correct,
      total: result.total,
      percent: result.percent,
      answered: result.answered,
      byType: result.byType,
      bySection: exam.documentId === null ? [] : result.bySection.map(toView),
      weakSections: exam.documentId === null ? [] : result.weakSections.map(toView),
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

  /** Scores by board content area over every attempt, and what to practise next. */
  readiness(blueprintId: BlueprintId = '2022'): Readiness {
    const blueprint = BLUEPRINTS[blueprintId]
    const { questions } = this.studySet()
    const history = new Map(areaHistory(this.db).map((h) => [h.area, h]))
    const areas = CONTENT_AREAS.map((area) => {
      const h = history.get(area)
      const inArea = questions.filter((q) => q.area === area)
      return {
        area,
        label: AREA_LABELS[area],
        correct: h?.correct ?? 0,
        total: h?.total ?? 0,
        percent: h?.percent ?? 0,
        available: inArea.length,
        mockAvailable: inArea.filter((q) => MOCK_TYPES.includes(q.type)).length,
        onExam: blueprint.counts[area]
      }
    })
    const practisable = areas.filter((a) => a.available > 0)
    const scored = practisable.filter((a) => a.total >= MIN_ANSWERS_FOR_SCORE)
    const weakest =
      (scored.length === practisable.length && scored.length > 0
        ? [...scored].sort((a, b) => a.percent - b.percent)[0]
        : [...practisable].sort((a, b) => a.total - b.total)[0]
      )?.area ?? null
    const documents = listDocuments(this.db)
    const names = new Map(documents.map((d) => [d.id, d.fileName.replace(/\.pdf$/i, '')]))
    return {
      areas,
      weakest,
      documentCount: documents.length,
      questionCount: questions.length,
      recent: listStudyAttempts(this.db, 8).map((a) => ({
        id: a.id,
        seed: a.seed,
        correct: a.correct,
        total: a.total,
        percent: a.percent,
        finishedAt: a.finishedAt,
        mode: a.mode,
        label:
          a.documentId !== null ? (names.get(a.documentId) ?? 'Practice') : a.mode === 'mock' ? 'Mock exam' : 'Practice'
      }))
    }
  }

  /**
   * Every document's questions together. Ids, term keys and section ids are only unique within
   * a document, so each question gets "<document id>/" in front of its id and term key, and a
   * label naming its document and section.
   */
  private studySet(): { questions: Question[]; labels: Map<string, string>; glossary: GlossaryEntry[] } {
    const pooled: PooledQuestion[] = []
    const glossary: GlossaryEntry[] = []
    for (const document of listDocuments(this.db)) {
      const sections = loadSections(this.db, document.id)
      const name = document.fileName.replace(/\.pdf$/i, '')
      for (const q of loadQuestions(this.db, document.id)) {
        const section = sectionLabel(sections, q.sectionId)
        pooled.push({
          question: { ...q, id: `${document.id}/${q.id}`, termKey: `${document.id}/${q.termKey}` },
          label: /^Pages? \d/.test(section) ? name : `${name} · ${section}`
        })
      }
      glossary.push(...loadGlossary(this.db, document.id))
    }
    return {
      questions: pooled.map((p) => p.question),
      labels: new Map(pooled.map((p) => [p.question.id, p.label])),
      glossary
    }
  }

  private begin(
    documentId: number | null,
    assembled: Exam,
    mode: ExamMode,
    session: Pick<Session, 'labelOf' | 'gradeOptions'>
  ): ExamView {
    const exam = saveExam(this.db, documentId, assembled, mode)
    this.sessions.set(exam.id, { exam, ...session, responses: new Map(), feedback: new Map(), startedAt: new Date() })
    return {
      examId: exam.id,
      documentId,
      mode,
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
          section: session.labelOf(item.question),
          ...(item.question.area ? { area: AREA_LABELS[item.question.area] } : {})
        }
      })
    }
  }

  private resolve(
    session: Session,
    examId: number,
    position: number,
    response: ExamResponse
  ): { item: ExamItem; given: string | null } {
    const item = session.exam.items[position]
    if (!item) throw new RangeError(`Exam ${examId} has no question ${position}`)
    if ('choice' in response) {
      const option = displayedOptions(item)[response.choice]
      if (!option) throw new RangeError(`Question ${position} has no option ${response.choice}`)
      return { item, given: option.text }
    }
    return { item, given: response.text.trim() === '' ? null : response.text.trim() }
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

/**
 * A mock exam: multiple-choice questions only, each area getting its share of seats as in
 * the board exam. An area short of questions gives its leftover seats to the others, and
 * the exam says so.
 */
export function assembleMock(questions: Question[], count: number, blueprintId: BlueprintId, seed: number): Exam {
  const eligible = questions.filter((q) => q.area && MOCK_TYPES.includes(q.type))
  const quotas = areaQuotas(BLUEPRINTS[blueprintId], count)
  const picked: ExamItem[] = []
  const warnings: string[] = []
  const used = new Set<string>()
  CONTENT_AREAS.forEach((area: ContentArea, i) => {
    const part = assembleExam(
      eligible.filter((q) => q.area === area),
      { questionCount: Math.max(1, quotas[area]) },
      seed + i
    )
    const items = part.items.slice(0, quotas[area])
    if (items.length < quotas[area]) {
      warnings.push(
        `${AREA_LABELS[area]} has ${items.length} suitable questions, short of the ${quotas[area]} the exam gives it.`
      )
    }
    for (const item of items) used.add(item.question.id)
    picked.push(...items)
  })
  // Seats left by a short area go to questions from the other areas.
  if (picked.length < count) {
    const rest = assembleExam(
      eligible.filter((q) => !used.has(q.id)),
      { questionCount: count - picked.length },
      seed + CONTENT_AREAS.length
    )
    picked.push(...rest.items)
  }
  if (picked.length < count) {
    warnings.push(`Only ${picked.length} suitable questions in the study set, so the exam has ${picked.length}.`)
  }
  return {
    seed,
    config: { questionCount: count, types: MOCK_TYPES },
    items: shuffle(picked, createRandom(seed)),
    warnings
  }
}

function percentOf(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((100 * correct) / total)
}
