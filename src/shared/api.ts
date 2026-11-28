// Contract between the main process and the renderer.
// Both sides import from here, so a renamed channel or changed payload
// becomes a compile error instead of a silent runtime failure.
//
// The UI never receives answers before the user has answered: questions are sent
// without them, and grading happens in the main process.

import type { BlueprintId, ContentArea } from '../core/exam/areas'
import type { AnswerStatus } from '../core/exam/grade'
import type { QuestionType } from '../core/generation/types'

export type { AnswerStatus, BlueprintId, ContentArea, QuestionType }

/** Practice gives feedback after each answer; a mock exam is timed and shows answers at the end. */
export type ExamMode = 'practice' | 'mock'

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  listDocuments: 'documents:list',
  importDocument: 'documents:import',
  importProgress: 'documents:import-progress',
  getDocument: 'documents:get',
  deleteDocument: 'documents:delete',
  startExam: 'exam:start',
  answerQuestion: 'exam:answer',
  finishExam: 'exam:finish',
  getReadiness: 'study:readiness',
  startStudyExam: 'study:start',
  recordAnswer: 'exam:record'
} as const

export interface AppInfo {
  appVersion: string
  /** What the app runs on: "Electron 45.5.0" or "Web". */
  platform: string
  sqlite: string
  /**
   * Whether documents and attempts are kept. A browser can refuse storage (some private
   * windows), and then everything is lost when the tab closes.
   */
  persistent: boolean
}

export interface DocumentSummary {
  id: number
  fileName: string
  pageCount: number
  questionCount: number
  importedAt: string
  attemptCount: number
  /** Percent on the most recent attempt, or null before the first one. */
  lastScore: number | null
}

export interface SectionOption {
  id: number
  label: string
  questionCount: number
  /** The same count split by question type, so the setup screen can tell what a choice matches. */
  countByType: Partial<Record<QuestionType, number>>
}

export interface AttemptView {
  id: number
  seed: number
  correct: number
  total: number
  percent: number
  finishedAt: string
}

export interface SectionScoreView {
  label: string
  correct: number
  total: number
  percent: number
}

export interface DocumentDetail {
  document: DocumentSummary
  warnings: string[]
  /** Sections that have questions, in document order. */
  sections: SectionOption[]
  questionCountByType: Partial<Record<QuestionType, number>>
  /** Most recent first. */
  attempts: AttemptView[]
  /** Weak sections across all attempts, weakest first. */
  weakSections: SectionScoreView[]
}

export type ImportStage = 'reading' | 'analyzing' | 'generating' | 'saving'

/** Where an import is. While reading, also how many pages are done, so a slow phone shows movement. */
export interface ImportProgress {
  stage: ImportStage
  page?: number
  pageCount?: number
}

export type ImportResponse =
  | { status: 'cancelled' }
  | { status: 'imported' | 'regenerated' | 'unchanged'; document: DocumentSummary; warnings: string[] }

export interface ExamSettings {
  questionCount: number
  types: QuestionType[]
  /** All sections when empty. */
  sectionIds: number[]
  acceptTypos: boolean
  /** Replays an earlier exam; a new random seed when omitted. */
  seed?: number
}

export interface ExamQuestionView {
  position: number
  type: QuestionType
  prompt: string
  /** Options in the order shown; absent for fill-in-the-blank. */
  options?: string[]
  page: number
  section: string
  /** Board content area, when known ("Image Production"). */
  area?: string
}

export interface ExamView {
  examId: number
  /** null for an exam drawn from the whole study set. */
  documentId: number | null
  mode: ExamMode
  /** Mock exams only: time allowed, at the real exam's pace. */
  timeLimitSeconds?: number
  seed: number
  warnings: string[]
  questions: ExamQuestionView[]
}

/** A multiple-choice pick (index into the shown options), or typed text. Empty text skips. */
export type ExamResponse = { choice: number } | { text: string }

export interface AnswerFeedback {
  position: number
  status: AnswerStatus
  correct: boolean
  given: string | null
  answer: string
  /** Plain-language explanation lines taken from the document. */
  lines: string[]
}

export interface ExamSummary {
  examId: number
  documentId: number | null
  mode: ExamMode
  /** Score per board content area, in the board exam's order. */
  byArea: SectionScoreView[]
  seed: number
  correct: number
  total: number
  percent: number
  answered: number
  byType: Partial<Record<QuestionType, { correct: number; total: number; percent: number }>>
  bySection: SectionScoreView[]
  weakSections: SectionScoreView[]
  /** Every question with what was answered and the feedback, in exam order. */
  review: (AnswerFeedback & { prompt: string; options?: string[] })[]
}

/** The API the preload script exposes to the UI as `window.api`. */
export interface AhralApi {
  getAppInfo(): Promise<AppInfo>
  /** Scores by board content area over the whole study set, and what to practise next. */
  getReadiness(blueprint: BlueprintId): Promise<Readiness>
  /** Starts a practice session or a mock exam drawn from every imported PDF. */
  startStudyExam(settings: StudySettings): Promise<ExamView>
  /** Mock exams: records (or changes) an answer without grading it; grading happens at the end. */
  recordAnswer(examId: number, position: number, response: ExamResponse): Promise<void>
  listDocuments(): Promise<DocumentSummary[]>
  /**
   * True on the website: the screen shows its own file input and passes the chosen file
   * to importDocument. False in the desktop app, where importDocument opens a system dialog.
   */
  readonly choosesFileInPage: boolean
  /** Imports a PDF: the given file on the website, or one picked in a system dialog on the desktop. */
  importDocument(file?: File): Promise<ImportResponse>
  /** Called as an import progresses; returns a function that stops listening. */
  onImportProgress(listener: (progress: ImportProgress) => void): () => void
  getDocument(id: number): Promise<DocumentDetail>
  deleteDocument(id: number): Promise<void>
  startExam(documentId: number, settings: ExamSettings): Promise<ExamView>
  answerQuestion(examId: number, position: number, response: ExamResponse): Promise<AnswerFeedback>
  finishExam(examId: number): Promise<ExamSummary>
}

/** An exam drawn from every imported PDF together. */
export interface StudySettings {
  mode: ExamMode
  /** Practice only: areas to draw from, all when empty. A mock exam covers all four. */
  areas: ContentArea[]
  /** Practice only: built-in bank topics to draw from, all when empty or missing. */
  topics?: string[]
  questionCount: number
  /** Practice only: question types, all when empty. A mock exam is multiple choice, like the real one. */
  types: QuestionType[]
  acceptTypos: boolean
  /** Which official question counts a mock exam follows. */
  blueprint: BlueprintId
  seed?: number
}

export interface AreaReadiness {
  area: ContentArea
  label: string
  /** Answers given in this area, over all attempts. */
  correct: number
  total: number
  percent: number
  /** Questions in the study set for this area, and how many of them suit a mock exam. */
  available: number
  mockAvailable: number
  /** Scored questions on the real exam (the chosen blueprint). */
  onExam: number
  /** Built-in bank topics in this area, with their question counts. */
  topics: { name: string; available: number }[]
}

export interface StudyAttemptView extends AttemptView {
  mode: ExamMode
  /** "Mock exam", "Practice", or the document's name for an exam from one PDF. */
  label: string
}

export interface Readiness {
  areas: AreaReadiness[]
  /** The area to practise next: the lowest score with enough answers, else the least practised. */
  weakest: ContentArea | null
  documentCount: number
  /** Every question available: the built-in bank plus imported PDFs. */
  questionCount: number
  /** Questions from the built-in bank. */
  bankCount: number
  recent: StudyAttemptView[]
}
