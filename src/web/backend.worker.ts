import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { migrate } from '../app/db/migrations'
import { getSqliteVersion, type SqlDatabase } from '../app/db/sql'
import { wrapWasmDatabase } from '../app/db/wasm'
import { ExamService } from '../app/exam-service'
import { importPdf } from '../app/import'
import { runPipeline } from '../app/pipeline'
import type { ImportProgress } from '../shared/api'
import type { Backend, FromWorker, Method, ToWorker, WorkerConfig } from './protocol'

/*
 * The website's backend, in a worker so a minute-long import never freezes the page.
 * SQLite runs as WebAssembly and keeps the database in the browser's private storage for
 * this site (the Origin Private File System). Nothing is sent anywhere.
 */

const worker = self as unknown as {
  postMessage(message: FromWorker): void
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
}
const post = (message: FromWorker) => worker.postMessage(message)

let config: WorkerConfig | undefined
let dictionary: Promise<Set<string>> | undefined

/** How long the browser's private storage may take to open before the app runs without saving. */
const STORAGE_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms))
  ])
}

interface State {
  db: SqlDatabase
  service: ExamService
  persistent: boolean
}

const state: Promise<State> = (async () => {
  const sqlite3 = await sqlite3InitModule()
  let raw: InstanceType<typeof sqlite3.oo1.DB>
  let persistent = true
  try {
    // The "SAH pool" storage works without special server headers, so it runs on any static host.
    // A time limit, because a browser that never answers would otherwise leave the app on "Loading…".
    const pool = await withTimeout(sqlite3.installOpfsSAHPoolVfs({ name: 'ahral' }), STORAGE_TIMEOUT_MS)
    raw = new pool.OpfsSAHPoolDb('/ahral.db')
  } catch {
    // No private storage (some private windows): still usable, but nothing is kept.
    raw = new sqlite3.oo1.DB(':memory:')
    persistent = false
  }
  const db = wrapWasmDatabase(raw)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return { db, service: new ExamService(db), persistent }
})()

/** Loaded on the first import only: about 2.7 MB of words. */
function loadDictionary(url: string): Promise<Set<string>> {
  dictionary ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load the dictionary (${response.status})`)
      return response.text()
    })
    .then((text) => new Set(text.split(/\r?\n/)))
  return dictionary
}

/** PDF.js normally starts its own worker; here it runs inside this one ("fake worker"). */
let pdfjsReady: Promise<void> | undefined
function preparePdfjs(): Promise<void> {
  pdfjsReady ??= import('pdfjs-dist/legacy/build/pdf.worker.mjs').then((module) => {
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = module
  })
  return pdfjsReady
}

function requireConfig(): WorkerConfig {
  if (!config) throw new Error('The backend was not initialised')
  return config
}

const methods = (s: State): Backend => ({
  getAppInfo: () => ({
    appVersion: requireConfig().appVersion,
    platform: 'Web',
    sqlite: getSqliteVersion(s.db),
    persistent: s.persistent
  }),
  getReadiness: (blueprint) => s.service.readiness(blueprint),
  startStudyExam: (settings) => s.service.startStudyExam(settings),
  recordAnswer: (examId, position, response) => s.service.record(examId, position, response),
  listDocuments: () => s.service.listDocuments(),
  importPdf: async ({ data, fileName }) => {
    const { fontsUrl, dictionaryUrl } = requireConfig()
    const progress = (update: ImportProgress) => post({ type: 'progress', progress: update })
    progress({ stage: 'reading' })
    const [words] = await Promise.all([loadDictionary(dictionaryUrl), preparePdfjs()])
    const result = await importPdf(
      s.db,
      { data: new Uint8Array(data), fileName },
      {
        pipeline: async (bytes) => {
          const content = await runPipeline(bytes, {
            standardFontDataUrl: fontsUrl,
            isWord: (w) => words.has(w),
            onStage: (stage) => progress({ stage }),
            onPage: (page, pageCount) => progress({ stage: 'reading', page, pageCount })
          })
          progress({ stage: 'saving' })
          return content
        }
      }
    )
    const document = s.service.listDocuments().find((d) => d.id === result.documentId)
    if (!document) throw new Error('The imported document could not be found')
    return { status: result.status, document, warnings: result.warnings }
  },
  getDocument: (id) => s.service.getDocument(id),
  deleteDocument: (id) => s.service.deleteDocument(id),
  startExam: (documentId, settings) => s.service.startExam(documentId, settings),
  answerQuestion: (examId, position, response) => s.service.answer(examId, position, response),
  finishExam: (examId) => s.service.finish(examId)
})

worker.onmessage = async (event) => {
  const message = event.data
  if (message.type === 'init') {
    config = message.config
    return
  }
  try {
    const backend = methods(await state)
    const fn = backend[message.method as Method] as (...args: unknown[]) => unknown
    const value = await fn(...message.args)
    post({ type: 'result', id: message.id, value })
  } catch (err) {
    post({ type: 'error', id: message.id, message: err instanceof Error ? err.message : String(err) })
  }
}
