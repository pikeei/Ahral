import { readFile } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import wordListPath from 'word-list'
import { runPipeline } from '../app/pipeline'
import type { WorkerInput, WorkerMessage } from './worker-pipeline'

/*
 * Runs the PDF pipeline in a worker thread. A long book takes about a minute of
 * pure computation; on the main thread that would freeze every window for that long.
 */

async function run(): Promise<void> {
  const { data, standardFontDataUrl } = workerData as WorkerInput
  const post = (message: WorkerMessage) => parentPort?.postMessage(message)
  try {
    const dictionary = new Set((await readFile(wordListPath, 'utf8')).split(/\r?\n/))
    const content = await runPipeline(data, {
      standardFontDataUrl,
      isWord: (w) => dictionary.has(w),
      onStage: (stage) => post({ type: 'stage', stage })
    })
    post({ type: 'done', content })
  } catch (err) {
    post({ type: 'failed', message: err instanceof Error ? err.message : String(err) })
  }
}

void run()
