import { useEffect, useState } from 'react'
import type { DocumentDetail, ExamSettings, QuestionType } from '../../shared/api'
import { Button, Card, ErrorBanner, errorMessage, formatDate, ScoreBar, scoreColor, TYPE_LABELS } from './ui'

const ALL_TYPES: QuestionType[] = ['cloze', 'mcq-term', 'mcq-definition']

interface Props {
  documentId: number
  onStart: (settings: ExamSettings) => Promise<void>
  onDeleted: () => void
}

export function DocumentView({ documentId, onStart, onDeleted }: Props) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<QuestionType[]>(ALL_TYPES)
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [acceptTypos, setAcceptTypos] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    window.api
      .getDocument(documentId)
      .then(setDetail)
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [documentId])

  if (!detail) return error ? <ErrorBanner message={error} /> : <p className="text-slate-500">Loading…</p>

  const { document, sections, questionCountByType, attempts, weakSections, warnings } = detail
  const available = ALL_TYPES.filter((t) => (questionCountByType[t] ?? 0) > 0)
  const chosenTypes = types.filter((t) => available.includes(t))

  async function start() {
    setError(null)
    setStarting(true)
    try {
      await onStart({ questionCount: count, types: chosenTypes, sectionIds, acceptTypos })
    } catch (err) {
      setError(errorMessage(err))
      setStarting(false)
    }
  }

  async function remove() {
    try {
      await window.api.deleteDocument(documentId)
      onDeleted()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold break-words">{document.fileName}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {document.pageCount} pages · {document.questionCount} questions · imported {formatDate(document.importedAt)}
        </p>
        {warnings.length > 0 && (
          <details className="mt-2 text-sm text-amber-800">
            <summary className="cursor-pointer">
              {warnings.length} {warnings.length === 1 ? 'note' : 'notes'} about this PDF
            </summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {document.questionCount === 0 ? (
        <Card>
          <p className="font-medium">No questions could be made from this PDF.</p>
          <p className="mt-1 text-sm text-slate-600">
            It may be scanned images without a text layer, or have no definitions Ahral can recognise.
          </p>
        </Card>
      ) : (
        <Card>
          <h3 className="font-semibold">New exam</h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Number of questions</span>
              <input
                type="number"
                min={1}
                max={document.questionCount}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(document.questionCount, Number(e.target.value) || 1)))}
                className="mt-1 block w-28 rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>

            <fieldset className="text-sm">
              <legend className="font-medium">Question types</legend>
              {available.map((t) => (
                <label key={t} className="mt-1 flex items-center gap-2">
                  <input type="checkbox" checked={types.includes(t)} onChange={() => setTypes(toggle(types, t))} />
                  {TYPE_LABELS[t]} <span className="text-slate-400">({questionCountByType[t]})</span>
                </label>
              ))}
            </fieldset>
          </div>

          {sections.length > 1 && (
            <fieldset className="mt-6 text-sm">
              <legend className="font-medium">
                Sections <span className="font-normal text-slate-500">(none ticked = all)</span>
              </legend>
              <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {sections.map((s) => (
                  <label key={s.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={sectionIds.includes(s.id)}
                      onChange={() => setSectionIds(toggle(sectionIds, s.id))}
                    />
                    <span>
                      {s.label} <span className="text-slate-400">({s.questionCount})</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={acceptTypos} onChange={(e) => setAcceptTypos(e.target.checked)} />
            Count near-miss spellings as correct
          </label>

          <Button className="mt-6" onClick={start} disabled={starting || chosenTypes.length === 0}>
            {starting ? 'Starting…' : 'Start exam'}
          </Button>
        </Card>
      )}

      {weakSections.length > 0 && (
        <Card>
          <h3 className="font-semibold">Review these sections</h3>
          <p className="mt-1 text-sm text-slate-500">Below 60% across all your attempts.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {weakSections.map((s) => (
              <li key={s.label}>
                <div className="flex justify-between gap-4">
                  <span>{s.label}</span>
                  <span className={scoreColor(s.percent)}>
                    {s.correct}/{s.total}
                  </span>
                </div>
                <ScoreBar percent={s.percent} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {attempts.length > 0 && (
        <Card>
          <h3 className="font-semibold">Past attempts</h3>
          <ul className="mt-3 divide-y divide-slate-100 text-sm" aria-label="Past attempts">
            {attempts.map((a) => (
              <li key={a.id} className="flex justify-between py-2">
                <span className="text-slate-600">{formatDate(a.finishedAt)}</span>
                <span>
                  <span className={`font-medium ${scoreColor(a.percent)}`}>{a.percent}%</span>
                  <span className="text-slate-500">
                    {' '}
                    ({a.correct}/{a.total})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-3 border-t border-slate-200 pt-4 text-sm">
        {confirmDelete ? (
          <>
            <span>Delete this document with all its exams and attempts? This cannot be undone.</span>
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Delete document…
          </Button>
        )}
      </div>
    </div>
  )
}
