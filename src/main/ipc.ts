import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import type { SqlDatabase } from '../app/db/sql'
import { getSqliteVersion } from '../app/db/sql'
import { ExamService } from '../app/exam-service'
import { importPdf } from '../app/import'
import {
  type AppInfo,
  type ExamResponse,
  type ExamSettings,
  type ImportResponse,
  type ImportStage,
  IpcChannels
} from '../shared/api'
import { workerPipeline } from './worker-pipeline'

/** PDF.js's bundled fonts. PDF.js wants forward slashes and a trailing "/", even on Windows. */
function standardFontDataUrl(): string {
  return `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/')}/`
}

/*
 * Every value from the UI is checked before use: the renderer is our own code,
 * but the main process is the one with file and database access.
 */
function id(value: unknown, name = 'id'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new TypeError(`Invalid ${name}`)
  return value
}

function settings(value: unknown): ExamSettings {
  const s = value as ExamSettings
  if (typeof s !== 'object' || s === null) throw new TypeError('Invalid exam settings')
  id(s.questionCount, 'question count')
  if (!Array.isArray(s.types) || !Array.isArray(s.sectionIds)) throw new TypeError('Invalid exam settings')
  for (const sectionId of s.sectionIds) id(sectionId, 'section id')
  if (s.seed !== undefined) id(s.seed, 'seed')
  return { ...s, acceptTypos: s.acceptTypos === true }
}

function response(value: unknown): ExamResponse {
  const r = value as ExamResponse
  if (typeof r === 'object' && r !== null) {
    if ('choice' in r) return { choice: id(r.choice, 'choice') }
    if ('text' in r && typeof r.text === 'string') return { text: r.text.slice(0, 500) }
  }
  throw new TypeError('Invalid answer')
}

export function registerIpcHandlers(db: SqlDatabase): void {
  const service = new ExamService(db)
  let importing = false

  ipcMain.handle(
    IpcChannels.getAppInfo,
    (): AppInfo => ({
      appVersion: app.getVersion(),
      platform: `Electron ${process.versions.electron}`,
      sqlite: getSqliteVersion(db),
      persistent: true
    })
  )

  ipcMain.handle(IpcChannels.listDocuments, () => service.listDocuments())
  ipcMain.handle(IpcChannels.getDocument, (_e, documentId: unknown) => service.getDocument(id(documentId)))
  ipcMain.handle(IpcChannels.deleteDocument, (_e, documentId: unknown) => service.deleteDocument(id(documentId)))

  ipcMain.handle(IpcChannels.importDocument, async (event): Promise<ImportResponse> => {
    if (importing) throw new Error('An import is already running')
    const options: OpenDialogOptions = {
      title: 'Import a PDF',
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
      properties: ['openFile']
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const pick = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const path = pick.filePaths[0]
    if (pick.canceled || !path) return { status: 'cancelled' }

    importing = true
    try {
      const progress = (stage: ImportStage) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcChannels.importProgress, stage)
      }
      const inWorker = workerPipeline(standardFontDataUrl(), progress)
      const result = await importPdf(
        db,
        { data: new Uint8Array(await readFile(path)), fileName: basename(path), sourcePath: path },
        {
          pipeline: async (data) => {
            const content = await inWorker(data)
            progress('saving')
            return content
          }
        }
      )
      const document = service.listDocuments().find((d) => d.id === result.documentId)
      if (!document) throw new Error('The imported document could not be found')
      return { status: result.status, document, warnings: result.warnings }
    } finally {
      importing = false
    }
  })

  ipcMain.handle(IpcChannels.startExam, (_e, documentId: unknown, examSettings: unknown) =>
    service.startExam(id(documentId), settings(examSettings))
  )
  ipcMain.handle(IpcChannels.answerQuestion, (_e, examId: unknown, position: unknown, answer: unknown) =>
    service.answer(id(examId), id(position, 'position'), response(answer))
  )
  ipcMain.handle(IpcChannels.finishExam, (_e, examId: unknown) => service.finish(id(examId)))
}
