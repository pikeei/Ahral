import type { DatabaseSync } from 'node:sqlite'
import type { Exam, ExamConfig } from '../../core/exam/assemble'
import {
  type ExamResult,
  MIN_QUESTIONS_FOR_WEAK_SECTION,
  type Tally,
  tally,
  WEAK_SECTION_PERCENT
} from '../../core/exam/score'
import type { Question } from '../../core/generation/types'
import { transaction } from './connection'
import { fromJson, toJson } from './json'

/*
 * Exams (the questions picked for one sitting, in their shown order) and attempts
 * (how the user answered them). History across attempts drives weak-topic review.
 */

export interface StoredExam extends Exam {
  id: number
  documentId: number
  createdAt: string
}

export function saveExam(db: DatabaseSync, documentId: number, exam: Exam): StoredExam {
  return transaction(db, () => {
    const createdAt = new Date().toISOString()
    const { lastInsertRowid } = db
      .prepare('INSERT INTO exams (document_id, seed, config, warnings, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(documentId, exam.seed, toJson(exam.config), toJson(exam.warnings), createdAt)
    const id = Number(lastInsertRowid)
    const item = db.prepare('INSERT INTO exam_items (exam_id, position, question, option_order) VALUES (?, ?, ?, ?)')
    exam.items.forEach((it, i) => {
      item.run(id, i, toJson(it.question), it.optionOrder ? toJson(it.optionOrder) : null)
    })
    return { ...exam, id, documentId, createdAt }
  })
}

export function loadExam(db: DatabaseSync, id: number): StoredExam | undefined {
  const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as
    | { id: number; document_id: number; seed: number; config: string; warnings: string; created_at: string }
    | undefined
  if (!row) return undefined
  const items = db
    .prepare('SELECT question, option_order FROM exam_items WHERE exam_id = ? ORDER BY position')
    .all(id) as unknown as { question: string; option_order: string | null }[]
  return {
    id: row.id,
    documentId: row.document_id,
    seed: row.seed,
    config: fromJson<ExamConfig>(row.config),
    warnings: fromJson<string[]>(row.warnings),
    createdAt: row.created_at,
    items: items.map((it) => ({
      question: fromJson<Question>(it.question),
      ...(it.option_order === null ? {} : { optionOrder: fromJson<number[]>(it.option_order) })
    }))
  }
}

export interface AttemptInfo {
  acceptTypos: boolean
  startedAt: Date
  finishedAt: Date
  /** The label stored with each answer, e.g. "Imaging Procedures › Answers and Explanations". */
  sectionLabel: (sectionId: number) => string
}

export function saveAttempt(db: DatabaseSync, exam: StoredExam, result: ExamResult, info: AttemptInfo): number {
  if (result.answers.length !== exam.items.length) {
    throw new Error(
      `The result has ${result.answers.length} answers but exam ${exam.id} has ${exam.items.length} items`
    )
  }
  return transaction(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO attempts (exam_id, accept_typos, correct, total, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        exam.id,
        info.acceptTypos ? 1 : 0,
        result.correct,
        result.total,
        info.startedAt.toISOString(),
        info.finishedAt.toISOString()
      )
    const id = Number(lastInsertRowid)
    const answer = db.prepare(
      `INSERT INTO attempt_answers (attempt_id, position, question_id, section_label, given, status, correct)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    result.answers.forEach((a, i) => {
      const sectionId = exam.items[i]?.question.sectionId ?? 0
      answer.run(id, i, a.questionId, info.sectionLabel(sectionId), a.given, a.status, a.correct ? 1 : 0)
    })
    return id
  })
}

export interface AttemptSummary extends Tally {
  id: number
  examId: number
  seed: number
  acceptTypos: boolean
  startedAt: string
  finishedAt: string
}

/** A document's attempts, most recent first. */
export function listAttempts(db: DatabaseSync, documentId: number): AttemptSummary[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.exam_id, e.seed, a.accept_typos, a.correct, a.total, a.started_at, a.finished_at
       FROM attempts a JOIN exams e ON e.id = a.exam_id
       WHERE e.document_id = ?
       ORDER BY a.finished_at DESC, a.id DESC`
    )
    .all(documentId) as unknown as {
    id: number
    exam_id: number
    seed: number
    accept_typos: number
    correct: number
    total: number
    started_at: string
    finished_at: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    examId: r.exam_id,
    seed: r.seed,
    acceptTypos: r.accept_typos === 1,
    ...tally(r.correct, r.total),
    startedAt: r.started_at,
    finishedAt: r.finished_at
  }))
}

export interface SectionHistory extends Tally {
  label: string
  /** Below WEAK_SECTION_PERCENT on at least MIN_QUESTIONS_FOR_WEAK_SECTION answers, over all attempts. */
  weak: boolean
}

/** Score per section over every attempt on a document, lowest first. */
export function sectionHistory(db: DatabaseSync, documentId: number): SectionHistory[] {
  const rows = db
    .prepare(
      `SELECT aa.section_label AS label, SUM(aa.correct) AS correct, COUNT(*) AS total
       FROM attempt_answers aa
       JOIN attempts a ON a.id = aa.attempt_id
       JOIN exams e ON e.id = a.exam_id
       WHERE e.document_id = ?
       GROUP BY aa.section_label`
    )
    .all(documentId) as unknown as { label: string; correct: number; total: number }[]
  return rows
    .map((r) => {
      const t = tally(r.correct, r.total)
      return {
        label: r.label,
        ...t,
        weak: t.total >= MIN_QUESTIONS_FOR_WEAK_SECTION && t.percent < WEAK_SECTION_PERCENT
      }
    })
    .sort((a, b) => a.percent - b.percent || a.label.localeCompare(b.label))
}
