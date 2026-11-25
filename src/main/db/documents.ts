import type { DatabaseSync } from 'node:sqlite'
import type { GlossaryEntry } from '../../core/exam/grade'
import type { Option, Question, QuestionType } from '../../core/generation/types'
import type { Section } from '../../core/pdf/layout-types'
import { transaction } from './connection'
import { fromJson, toJson } from './json'

/*
 * Imported documents and everything generated from them. A document is identified by
 * the SHA-256 of its file, so importing the same PDF twice (even renamed) finds the first copy.
 */

export interface DocumentMeta {
  sha256: string
  fileName: string
  sourcePath: string | null
  pipelineVersion: number
}

/** What the pipeline produced for one document. */
export interface DocumentContent {
  pageCount: number
  warnings: string[]
  sections: Section[]
  glossary: GlossaryEntry[]
  questions: Question[]
}

export interface DocumentRecord extends DocumentMeta {
  id: number
  pageCount: number
  warnings: string[]
  questionCount: number
  importedAt: string
  updatedAt: string
}

interface DocumentRow {
  id: number
  sha256: string
  file_name: string
  source_path: string | null
  page_count: number
  pipeline_version: number
  warnings: string
  imported_at: string
  updated_at: string
  question_count: number
}

const SELECT_DOCUMENT = `
  SELECT d.*, (SELECT COUNT(*) FROM questions q WHERE q.document_id = d.id) AS question_count
  FROM documents d`

export function insertDocument(db: DatabaseSync, meta: DocumentMeta, content: DocumentContent): number {
  return transaction(db, () => {
    const now = new Date().toISOString()
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO documents (sha256, file_name, source_path, page_count, pipeline_version, warnings, imported_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        meta.sha256,
        meta.fileName,
        meta.sourcePath,
        content.pageCount,
        meta.pipelineVersion,
        toJson(content.warnings),
        now,
        now
      )
    const id = Number(lastInsertRowid)
    writeContent(db, id, content)
    return id
  })
}

/** Replaces a document's sections, glossary and questions (after regenerating). Its exams and attempts are kept. */
export function replaceDocumentContent(
  db: DatabaseSync,
  id: number,
  pipelineVersion: number,
  content: DocumentContent
): void {
  transaction(db, () => {
    const { changes } = db
      .prepare('UPDATE documents SET page_count = ?, pipeline_version = ?, warnings = ?, updated_at = ? WHERE id = ?')
      .run(content.pageCount, pipelineVersion, toJson(content.warnings), new Date().toISOString(), id)
    if (Number(changes) === 0) throw new Error(`No document with id ${id}`)
    for (const table of ['sections', 'glossary', 'questions']) {
      db.prepare(`DELETE FROM ${table} WHERE document_id = ?`).run(id)
    }
    writeContent(db, id, content)
  })
}

/** Deletes a document with its questions, exams and attempts. */
export function deleteDocument(db: DatabaseSync, id: number): boolean {
  return Number(db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes) > 0
}

export function getDocument(db: DatabaseSync, id: number): DocumentRecord | undefined {
  const row = db.prepare(`${SELECT_DOCUMENT} WHERE d.id = ?`).get(id) as DocumentRow | undefined
  return row && toDocument(row)
}

export function findDocumentBySha(db: DatabaseSync, sha256: string): DocumentRecord | undefined {
  const row = db.prepare(`${SELECT_DOCUMENT} WHERE d.sha256 = ?`).get(sha256) as DocumentRow | undefined
  return row && toDocument(row)
}

/** Most recently imported first. */
export function listDocuments(db: DatabaseSync): DocumentRecord[] {
  const rows = db.prepare(`${SELECT_DOCUMENT} ORDER BY d.imported_at DESC, d.id DESC`).all() as unknown as DocumentRow[]
  return rows.map(toDocument)
}

export function loadSections(db: DatabaseSync, documentId: number): Section[] {
  const rows = db
    .prepare(`SELECT id, title, level, parent_id, page_start, page_end FROM sections WHERE document_id = ? ORDER BY id`)
    .all(documentId) as unknown as {
    id: number
    title: string | null
    level: number
    parent_id: number | null
    page_start: number
    page_end: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    level: r.level,
    parentId: r.parent_id,
    pageStart: r.page_start,
    pageEnd: r.page_end
  }))
}

export function loadGlossary(db: DatabaseSync, documentId: number): GlossaryEntry[] {
  return db
    .prepare('SELECT term, definition, page FROM glossary WHERE document_id = ? ORDER BY position')
    .all(documentId) as unknown as GlossaryEntry[]
}

interface QuestionRow {
  id: string
  type: QuestionType
  prompt: string
  answer: string
  accepted_answers: string
  options: string | null
  keep_option_order: number
  explanation: string
  explanation_page: number | null
  page: number
  section_id: number
  sentence_id: number
  term_key: string
  quality: number
}

/** In the order the generator produced them. */
export function loadQuestions(db: DatabaseSync, documentId: number): Question[] {
  const rows = db
    .prepare('SELECT * FROM questions WHERE document_id = ? ORDER BY position')
    .all(documentId) as unknown as QuestionRow[]
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    prompt: r.prompt,
    answer: r.answer,
    acceptedAnswers: fromJson<string[]>(r.accepted_answers),
    ...(r.options === null ? {} : { options: fromJson<Option[]>(r.options) }),
    ...(r.keep_option_order === 1 ? { keepOptionOrder: true } : {}),
    explanation: r.explanation,
    ...(r.explanation_page === null ? {} : { explanationPage: r.explanation_page }),
    page: r.page,
    sectionId: r.section_id,
    sentenceId: r.sentence_id,
    termKey: r.term_key,
    quality: r.quality
  }))
}

function writeContent(db: DatabaseSync, documentId: number, content: DocumentContent): void {
  const section = db.prepare(
    'INSERT INTO sections (document_id, id, title, level, parent_id, page_start, page_end) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const s of content.sections) {
    section.run(documentId, s.id, s.title, s.level, s.parentId, s.pageStart, s.pageEnd)
  }

  const entry = db.prepare(
    'INSERT INTO glossary (document_id, position, term, definition, page) VALUES (?, ?, ?, ?, ?)'
  )
  content.glossary.forEach((g, i) => {
    entry.run(documentId, i, g.term, g.definition, g.page)
  })

  const question = db.prepare(
    `INSERT INTO questions (document_id, id, position, type, prompt, answer, accepted_answers, options,
       keep_option_order, explanation, explanation_page, page, section_id, sentence_id, term_key, quality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  content.questions.forEach((q, i) => {
    question.run(
      documentId,
      q.id,
      i,
      q.type,
      q.prompt,
      q.answer,
      toJson(q.acceptedAnswers),
      q.options ? toJson(q.options) : null,
      q.keepOptionOrder ? 1 : 0,
      q.explanation,
      q.explanationPage ?? null,
      q.page,
      q.sectionId,
      q.sentenceId,
      q.termKey,
      q.quality
    )
  })
}

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    sha256: row.sha256,
    fileName: row.file_name,
    sourcePath: row.source_path,
    pageCount: row.page_count,
    pipelineVersion: row.pipeline_version,
    warnings: fromJson<string[]>(row.warnings),
    questionCount: row.question_count,
    importedAt: row.imported_at,
    updatedAt: row.updated_at
  }
}
