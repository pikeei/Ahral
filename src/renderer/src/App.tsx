import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/api'

type State = { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error'; message: string }

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    window.api
      .getAppInfo()
      .then((info) => setState({ status: 'ready', info }))
      .catch((err: unknown) => setState({ status: 'error', message: String(err) }))
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-3xl font-bold">Ahral</h1>
      <p className="mt-1 text-slate-600">Turn PDF reading material into practice exams — offline, no AI.</p>

      <section className="mt-8 max-w-md rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="system-check">
        <h2 id="system-check" className="font-semibold">
          System check
        </h2>

        {state.status === 'loading' && <p className="mt-2 text-slate-500">Checking…</p>}

        {state.status === 'error' && (
          <p role="alert" className="mt-2 text-red-700">
            Could not reach the app backend: {state.message}
          </p>
        )}

        {state.status === 'ready' && (
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">App</dt>
            <dd data-testid="app-version">{state.info.appVersion}</dd>
            <dt className="text-slate-500">Electron</dt>
            <dd>{state.info.electron}</dd>
            <dt className="text-slate-500">Node</dt>
            <dd>{state.info.node}</dd>
            <dt className="text-slate-500">SQLite</dt>
            <dd data-testid="sqlite-version">{state.info.sqlite}</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
