import type {
  AnswerFeedback,
  AppInfo,
  DocumentDetail,
  DocumentSummary,
  ExamResponse,
  ExamSettings,
  ExamSummary,
  ExamView,
  ImportResponse,
  ImportStage
} from '../shared/api'

/*
 * Messages between the page and the backend worker (backend.worker.ts). The worker does
 * what Electron's main process does in the desktop app: database, PDF import, grading.
 */

/** Where the worker loads its static data from; sent once, before any call. */
export interface WorkerConfig {
  /** Folder of PDF.js's standard fonts, ending in "/". */
  fontsUrl: string
  /** The English word list used to repair broken words. */
  dictionaryUrl: string
  appVersion: string
}

/** What the worker can be asked to do: the app's API, with the chosen file passed in. */
export interface Backend {
  getAppInfo(): AppInfo
  listDocuments(): DocumentSummary[]
  importPdf(file: { data: ArrayBuffer; fileName: string }): Promise<ImportResponse>
  getDocument(id: number): DocumentDetail
  deleteDocument(id: number): void
  startExam(documentId: number, settings: ExamSettings): ExamView
  answerQuestion(examId: number, position: number, response: ExamResponse): AnswerFeedback
  finishExam(examId: number): ExamSummary
}

export type Method = keyof Backend

export type ToWorker =
  | { type: 'init'; config: WorkerConfig }
  | { type: 'call'; id: number; method: Method; args: unknown[] }

export type FromWorker =
  | { type: 'result'; id: number; value: unknown }
  | { type: 'error'; id: number; message: string }
  | { type: 'progress'; stage: ImportStage }
