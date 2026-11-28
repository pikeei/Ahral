import type { AhralApi, ImportProgress, ImportResponse } from '../shared/api'
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
  const progressListeners = new Set<(progress: ImportProgress) => void>()
  // Once the worker has died, every call fails at once instead of waiting for an answer that never comes.
  let failure: Error | undefined

  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data
    if (message.type === 'progress') {
      for (const listener of progressListeners) listener(message.progress)
      return
    }
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (message.type === 'result') call?.resolve(message.value)
    else call?.reject(new Error(message.message))
  }
  worker.onerror = (event) => {
    failure = new Error(
      `Ahral's background worker stopped (${event.message || 'the browser gave no reason'}). ` +
        'This browser may be too old: Ahral needs Safari 16.4 or later, or a recent Chrome, Edge or Firefox.'
    )
    for (const call of pending.values()) call.reject(failure)
    pending.clear()
  }

  function call<M extends Method>(method: M, args: Parameters<Backend[M]>, transfer: Transferable[] = []) {
    return new Promise<Awaited<ReturnType<Backend[M]>>>((resolve, reject) => {
      if (failure) {
        reject(failure)
        return
      }
      const id = nextId++
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      send({ type: 'call', id, method, args }, transfer)
    })
  }

  return {
    getAppInfo: () => call('getAppInfo', []),
    getReadiness: (blueprint) => call('getReadiness', [blueprint]),
    startStudyExam: (settings) => call('startStudyExam', [settings]),
    recordAnswer: (examId, position, response) => call('recordAnswer', [examId, position, response]),
    listDocuments: () => call('listDocuments', []),
    // The library screen shows a real file input (a hidden one opened from code does not
    // open on iPhones, iPads and some Android browsers) and hands the chosen file here.
    choosesFileInPage: true,
    importDocument: async (file?: File): Promise<ImportResponse> => {
      if (!file) return { status: 'cancelled' }
      const data = await file.arrayBuffer()
      const awake = await keepScreenAwake()
      try {
        // The bytes are moved to the worker, not copied.
        return await call('importPdf', [{ data, fileName: file.name }], [data])
      } finally {
        await awake?.release().catch(() => undefined)
      }
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
 * Phones pause a page when the screen locks, which would stall a long import. Where the
 * browser allows it, the screen stays on until the import ends. Not every browser can.
 */
async function keepScreenAwake(): Promise<WakeLockSentinel | undefined> {
  try {
    return await navigator.wakeLock?.request('screen')
  } catch {
    return undefined
  }
}
