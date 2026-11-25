import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { PIPELINE_VERSION } from '../core/version'
import { type DocumentContent, findDocumentBySha, insertDocument, replaceDocumentContent } from './db/documents'
import { type PipelineOptions, runPipeline } from './pipeline'

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

/** Runs the pipeline somewhere: in this thread by default, or in a worker (the desktop app). */
export type Pipeline = (data: Uint8Array) => Promise<DocumentContent>

export interface ImportOptions extends PipelineOptions {
  /** Regenerate even when the stored copy is up to date. */
  force?: boolean
  /** Replaces the in-thread pipeline; `PipelineOptions` are then ignored. */
  pipeline?: Pipeline
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

  const { force: _force, pipeline, ...pipelineOptions } = options
  const content = await (pipeline ?? ((data) => runPipeline(data, pipelineOptions)))(source.data.slice())
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
