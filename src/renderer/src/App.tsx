import { useEffect, useState } from 'react'
import type { AppInfo, ExamSummary, ExamView } from '../../shared/api'
import { DocumentView } from './DocumentView'
import { ExamRunner } from './ExamRunner'
import { Library } from './Library'
import { MockExamRunner } from './MockExamRunner'
import { Results } from './Results'
import { Study } from './Study'

/** Starts the same exam again (same questions, same order) from its seed. */
type Restart = (seed: number) => Promise<ExamView>

type Screen =
  | { name: 'loading' }
  | { name: 'study' }
  | { name: 'library' }
  | { name: 'document'; documentId: number }
  | { name: 'exam'; exam: ExamView; restart: Restart }
  | { name: 'results'; summary: ExamSummary; restart: Restart }

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getAppInfo()
      .then(setInfo)
      .catch((err: unknown) => setBackendError(String(err)))
    // The built-in question bank means there is always something to study, so start there.
    setScreen((now) => (now.name === 'loading' ? { name: 'study' } : now))
  }, [])

  async function run(start: Restart, seed?: number) {
    const exam = await start(seed ?? Math.floor(Math.random() * 2 ** 31))
    setScreen({ name: 'exam', exam, restart: start })
  }

  /** Where an exam returns to: its document's page, or Study for the whole study set. */
  const home = (documentId: number | null): Screen =>
    documentId === null ? { name: 'study' } : { name: 'document', documentId }

  const inExam = screen.name === 'exam'
  const tab =
    screen.name === 'study' ? 'study' : screen.name === 'library' || screen.name === 'document' ? 'library' : null

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight">Ahral</h1>
          {!inExam && (
            <nav aria-label="Main" className="flex gap-4 text-sm">
              {(['study', 'library'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-current={tab === name ? 'page' : undefined}
                  onClick={() => setScreen(name === 'study' ? { name: 'study' } : { name: 'library' })}
                  className={`py-1 ${tab === name ? 'font-semibold text-slate-900 underline decoration-2 underline-offset-8' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {name === 'study' ? 'Study' : 'Library'}
                </button>
              ))}
            </nav>
          )}
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

        {screen.name === 'loading' && <p className="text-slate-500">Loading…</p>}

        {screen.name === 'study' && (
          <Study
            onStart={(settings) => run((seed) => window.api.startStudyExam({ ...settings, seed }))}
            onOpenLibrary={() => setScreen({ name: 'library' })}
          />
        )}

        {screen.name === 'library' && <Library onOpen={(documentId) => setScreen({ name: 'document', documentId })} />}

        {screen.name === 'document' && (
          <>
            <BackLink onClick={() => setScreen({ name: 'library' })}>All documents</BackLink>
            <DocumentView
              key={screen.documentId}
              documentId={screen.documentId}
              onStart={(settings) => run((seed) => window.api.startExam(screen.documentId, { ...settings, seed }))}
              onDeleted={() => setScreen({ name: 'library' })}
            />
          </>
        )}

        {screen.name === 'exam' && screen.exam.mode === 'mock' && (
          <MockExamRunner
            key={screen.exam.examId}
            exam={screen.exam}
            onFinish={async () => {
              const summary = await window.api.finishExam(screen.exam.examId)
              setScreen({ name: 'results', summary, restart: screen.restart })
            }}
            onQuit={() => setScreen(home(screen.exam.documentId))}
          />
        )}

        {screen.name === 'exam' && screen.exam.mode === 'practice' && (
          <ExamRunner
            key={screen.exam.examId}
            exam={screen.exam}
            onFinish={async () => {
              const summary = await window.api.finishExam(screen.exam.examId)
              setScreen({ name: 'results', summary, restart: screen.restart })
            }}
            onQuit={() => setScreen(home(screen.exam.documentId))}
          />
        )}

        {screen.name === 'results' && (
          <Results
            summary={screen.summary}
            onRetake={() => void run(screen.restart, screen.summary.seed)}
            onDone={() => setScreen(home(screen.summary.documentId))}
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
