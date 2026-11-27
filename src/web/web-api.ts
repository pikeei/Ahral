import type { AhralApi, ImportResponse, ImportStage } from '../shared/api'
import type { Backend, FromWorker, Method, ToWorker, WorkerConfig } from './protocol'

/*
 * window.api for the website: the same calls the desktop app's preload script offers,
 * answered by the backend worker instead of Electron's main process. The screens use
 * window.api and don't know which one they talk to.
 */

export function createWebApi(config: WorkerConfig): AhralApi {
  const worker = new Worker(new URL('./backend.worker.ts', import.meta.url), { type: 'module' })
  const send = (message: ToWorker, transfer: Transferable[] = []) => worker.postMessage(message, transfer)
  send({ type: 'init', config })

  let nextId = 1
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  const progressListeners = new Set<(stage: ImportStage) => void>()

  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data
    if (message.type === 'progress') {
      for (const listener of progressListeners) listener(message.stage)
      return
    }
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (message.type === 'result') call?.resolve(message.value)
    else call?.reject(new Error(message.message))
  }
  worker.onerror = (event) => {
    const error = new Error(`The app's background worker stopped: ${event.message || 'unknown error'}`)
    for (const call of pending.values()) call.reject(error)
    pending.clear()
  }

  function call<M extends Method>(method: M, args: Parameters<Backend[M]>, transfer: Transferable[] = []) {
    return new Promise<Awaited<ReturnType<Backend[M]>>>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      send({ type: 'call', id, method, args }, transfer)
    })
  }

  return {
    getAppInfo: () => call('getAppInfo', []),
    listDocuments: () => call('listDocuments', []),
    importDocument: async (): Promise<ImportResponse> => {
      const file = await pickPdf()
      if (!file) return { status: 'cancelled' }
      const data = await file.arrayBuffer()
      // The bytes are moved to the worker, not copied.
      return call('importPdf', [{ data, fileName: file.name }], [data])
    },
    onImportProgress: (listener) => {
      progressListeners.add(listener)
      return () => progressListeners.delete(listener)
    },
    getDocument: (id) => call('getDocument', [id]),
    deleteDocument: (id) => call('deleteDocument', [id]),
    startExam: (documentId, settings) => call('startExam', [documentId, settings]),
    answerQuestion: (examId, position, response) => call('answerQuestion', [examId, position, response]),
    finishExam: (examId) => call('finishExam', [examId])
  }
}

/**
 * Opens the browser's file picker. Must run straight from a click (no await before it),
 * or browsers block it. Resolves with undefined when the picker is closed without a file.
 */
function pickPdf(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.addEventListener('change', () => resolve(input.files?.[0]))
    input.addEventListener('cancel', () => resolve(undefined))
    input.click()
  })
}
