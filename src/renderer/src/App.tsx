import { useEffect, useState } from 'react'
import type { AppInfo, ExamSettings, ExamSummary, ExamView } from '../../shared/api'
import { DocumentView } from './DocumentView'
import { ExamRunner } from './ExamRunner'
import { Library } from './Library'
import { Results } from './Results'

type Screen =
  | { name: 'library' }
  | { name: 'document'; documentId: number }
  | { name: 'exam'; exam: ExamView; settings: ExamSettings }
  | { name: 'results'; summary: ExamSummary; settings: ExamSettings }

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'library' })
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getAppInfo()
      .then(setInfo)
      .catch((err: unknown) => setBackendError(String(err)))
  }, [])

  async function startExam(documentId: number, settings: ExamSettings) {
    const exam = await window.api.startExam(documentId, settings)
    setScreen({ name: 'exam', exam, settings })
  }

  const inExam = screen.name === 'exam'

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight">
            {inExam ? (
              'Ahral'
            ) : (
              <button type="button" onClick={() => setScreen({ name: 'library' })} className="hover:text-indigo-700">
                Ahral
              </button>
            )}
          </h1>
          <span className="text-sm text-slate-500">Practice exams from your PDFs, offline</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {backendError && (
          <p role="alert" className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
            Could not reach the app backend: {backendError}
          </p>
        )}
        {info && !info.persistent && (
          <p role="status" className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Ahral can&rsquo;t save in this tab: it may already be open in another tab, or this is a private window. You
            can still practise, but anything you do here will be gone when you close this tab.
          </p>
        )}

        {screen.name === 'library' && <Library onOpen={(documentId) => setScreen({ name: 'document', documentId })} />}

        {screen.name === 'document' && (
          <>
            <BackLink onClick={() => setScreen({ name: 'library' })}>All documents</BackLink>
            <DocumentView
              key={screen.documentId}
              documentId={screen.documentId}
              onStart={(settings) => startExam(screen.documentId, settings)}
              onDeleted={() => setScreen({ name: 'library' })}
            />
          </>
        )}

        {screen.name === 'exam' && (
          <ExamRunner
            key={screen.exam.examId}
            exam={screen.exam}
            onFinish={async () => {
              const summary = await window.api.finishExam(screen.exam.examId)
              setScreen({ name: 'results', summary, settings: screen.settings })
            }}
            onQuit={() => setScreen({ name: 'document', documentId: screen.exam.documentId })}
          />
        )}

        {screen.name === 'results' && (
          <Results
            summary={screen.summary}
            onRetake={() =>
              void startExam(screen.summary.documentId, { ...screen.settings, seed: screen.summary.seed })
            }
            onDone={() => setScreen({ name: 'document', documentId: screen.summary.documentId })}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 py-2 text-center text-xs text-slate-400">
        {info && (
          <>
            Ahral <span data-testid="app-version">{info.appVersion}</span> · {info.platform} · SQLite{' '}
            <span data-testid="sqlite-version">{info.sqlite}</span> · everything stays on this device
          </>
        )}
      </footer>
    </div>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 text-sm text-indigo-700 hover:underline">
      ← {children}
    </button>
  )
}
