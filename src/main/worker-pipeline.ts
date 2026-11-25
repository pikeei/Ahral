import type { DocumentContent } from './db/documents'
import type { Pipeline } from './import'
import createImportWorker from './import-worker?nodeWorker'
import type { PipelineStage } from './pipeline'

export interface WorkerInput {
  data: Uint8Array
  standardFontDataUrl: string
}

export type WorkerMessage =
  | { type: 'stage'; stage: PipelineStage }
  | { type: 'done'; content: DocumentContent }
  | { type: 'failed'; message: string }

/** A pipeline that runs in a worker thread (see import-worker.ts), one worker per import. */
export function workerPipeline(standardFontDataUrl: string, onStage: (stage: PipelineStage) => void): Pipeline {
  return (data) =>
    new Promise((resolve, reject) => {
      const input: WorkerInput = { data, standardFontDataUrl }
      // The bytes are moved to the worker rather than copied.
      const worker = createImportWorker({ workerData: input, transferList: [data.buffer as ArrayBuffer] })
      let settled = false
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          fn()
        }
      }
      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'stage') onStage(message.stage)
        else if (message.type === 'done') settle(() => resolve(message.content))
        else settle(() => reject(new Error(message.message)))
      })
      worker.on('error', (err) => settle(() => reject(err)))
      worker.on('exit', (code) =>
        settle(() => reject(new Error(`The import worker stopped unexpectedly (code ${code})`)))
      )
    })
}
