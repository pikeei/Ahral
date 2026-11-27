import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import type { DocumentSummary, ImportProgress } from '../../shared/api'
import { Button, Card, ErrorBanner, errorMessage, formatDate, STAGE_LABELS, scoreColor } from './ui'

/** Above this size a PDF can take several minutes on a phone. */
const LARGE_PDF_BYTES = 30 * 1024 * 1024

export function Library({ onOpen }: { onOpen: (documentId: number) => void }) {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [importing, setImporting] = useState(false)
  const [largeFile, setLargeFile] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api
      .listDocuments()
      .then(setDocuments)
      .catch((err: unknown) => setError(errorMessage(err)))
    return window.api.onImportProgress(setProgress)
  }, [])

  useEffect(() => {
    if (!importing) return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [importing])

  function chooseFile() {
    if (window.api.choosesFileInPage) {
      // A real input on the page, opened straight from the tap: the only way that works everywhere.
      fileInput.current?.click()
    } else {
      void importPdf()
    }
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so that choosing the same file again still counts as a change.
    event.target.value = ''
    if (file) void importPdf(file)
  }

  async function importPdf(file?: File) {
    setError(null)
    setNotice(null)
    setImporting(true)
    setLargeFile((file?.size ?? 0) > LARGE_PDF_BYTES)
    setProgress(null)
    setSeconds(0)
    try {
      const result = await window.api.importDocument(file)
      if (result.status === 'cancelled') return
      setDocuments(await window.api.listDocuments())
      if (result.status === 'unchanged') setNotice(`${result.document.fileName} is already in your library.`)
      else onOpen(result.document.id)
    } catch (err) {
      setError(`Import failed: ${errorMessage(err)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Your documents</h2>
        <Button onClick={chooseFile} disabled={importing}>
          Import PDF
        </Button>
        {window.api.choosesFileInPage && (
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onFileChosen}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="file-input"
          />
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {notice && <p className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-900">{notice}</p>}

      {importing && (
        <Card>
          <p className="font-medium" aria-live="polite" data-testid="import-stage">
            {progressText(progress)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {seconds} s.{' '}
            {largeFile ? 'A large PDF can take several minutes on a phone.' : 'A long book takes a minute or two.'} This
            only happens once per PDF. Stay on this page until it finishes.
          </p>
          <ProgressBar progress={progress} />
        </Card>
      )}

      {documents === null && !error && <p className="text-slate-500">Loading…</p>}

      {documents?.length === 0 && !importing && (
        <Card className="text-center">
          <p className="font-medium">No documents yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Import a PDF with selectable text (lecture notes, a reviewer, a textbook). Ahral finds its terms and
            definitions and turns them into practice questions, all on this device.
          </p>
        </Card>
      )}

      {documents && documents.length > 0 && (
        <ul className="space-y-3" aria-label="Documents">
          {documents.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOpen(d.id)}
                className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.fileName}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {d.pageCount} pages · {d.questionCount} questions · imported {formatDate(d.importedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  {d.lastScore === null ? (
                    <span className="text-slate-500">Not taken yet</span>
                  ) : (
                    <>
                      <span className={`block text-lg font-semibold ${scoreColor(d.lastScore)}`}>{d.lastScore}%</span>
                      <span className="text-slate-500">
                        last of {d.attemptCount} {d.attemptCount === 1 ? 'attempt' : 'attempts'}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function progressText(progress: ImportProgress | null): string {
  if (!progress) return 'Opening the PDF…'
  if (progress.stage === 'reading' && progress.page && progress.pageCount) {
    return `Reading page ${progress.page} of ${progress.pageCount}…`
  }
  return `${STAGE_LABELS[progress.stage]}…`
}

/** Fills as pages are read (most of the wait); pulses during the steps that have no count. */
function ProgressBar({ progress }: { progress: ImportProgress | null }) {
  const page = progress?.stage === 'reading' ? progress.page : undefined
  const pageCount = progress?.pageCount
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
      {page && pageCount ? (
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width]"
          style={{ width: `${Math.round((page / pageCount) * 100)}%` }}
        />
      ) : (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-500" />
      )}
    </div>
  )
}
