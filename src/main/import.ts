import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { analyzeDocument } from '../core/analysis/analyze'
import { buildGlossary } from '../core/exam/grade'
import { type ExtractOptions, extractDocument } from '../core/extract'
import { generateQuestions } from '../core/generation/generate'
import { PIPELINE_VERSION } from '../core/version'
import { type DocumentContent, findDocumentBySha, insertDocument, replaceDocumentContent } from './db/documents'

/*
 * Import: PDF bytes -> extraction -> analysis -> questions -> database.
 * The pipeline takes over a minute on a long book, so it runs once per file:
 * importing the same file again returns the stored copy, unless it was made by an
 * older pipeline version (or `force` is set), in which case it is regenerated in place.
 */

export interface ImportSource {
  data: Uint8Array
  fileName: string
  sourcePath?: string
}

export interface ImportOptions extends ExtractOptions {
  /** Regenerate even when the stored copy is up to date. */
  force?: boolean
}

export type ImportStatus = 'imported' | 'regenerated' | 'unchanged'

export interface ImportResult {
  documentId: number
  status: ImportStatus
  questionCount: number
  warnings: string[]
}

export async function importPdf(
  db: DatabaseSync,
  source: ImportSource,
  options: ImportOptions = {}
): Promise<ImportResult> {
  // Hash first: PDF.js may take over (detach) the byte buffer while parsing.
  const sha256 = createHash('sha256').update(source.data).digest('hex')
  const existing = findDocumentBySha(db, sha256)
  if (existing && existing.pipelineVersion === PIPELINE_VERSION && !options.force) {
    return {
      documentId: existing.id,
      status: 'unchanged',
      questionCount: existing.questionCount,
      warnings: existing.warnings
    }
  }

  const { force: _force, ...extractOptions } = options
  const content = await runPipeline(source.data.slice(), extractOptions)
  if (existing) {
    replaceDocumentContent(db, existing.id, PIPELINE_VERSION, content)
    return {
      documentId: existing.id,
      status: 'regenerated',
      questionCount: content.questions.length,
      warnings: content.warnings
    }
  }
  const documentId = insertDocument(
    db,
    { sha256, fileName: source.fileName, sourcePath: source.sourcePath ?? null, pipelineVersion: PIPELINE_VERSION },
    content
  )
  return { documentId, status: 'imported', questionCount: content.questions.length, warnings: content.warnings }
}

async function runPipeline(data: Uint8Array, options: ExtractOptions): Promise<DocumentContent> {
  const doc = await extractDocument(data, options)
  const analysis = analyzeDocument(doc)
  const { questions } = generateQuestions(doc, analysis, options.isWord ? { isWord: options.isWord } : {})
  return {
    pageCount: doc.pageCount,
    warnings: doc.warnings,
    sections: doc.sections,
    glossary: buildGlossary(analysis.definitions),
    questions
  }
}
