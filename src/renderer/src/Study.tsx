import { useEffect, useState } from 'react'
import type { BlueprintId, ContentArea, Readiness, StudySettings } from '../../shared/api'
import { Button, Card, ErrorBanner, errorMessage, formatDate, ScoreBar, scoreColor } from './ui'

const BLUEPRINT_KEY = 'ahral.blueprint'
const BLUEPRINT_LABELS: Record<BlueprintId, string> = {
  '2022': 'Through February 28, 2027',
  '2027': 'From March 1, 2027'
}
const MOCK_LENGTHS = [200, 100, 50]
const PRACTICE_LENGTH = 20

/** Which exam version the person is sitting; kept on this device only. */
function savedBlueprint(): BlueprintId {
  try {
    return window.localStorage.getItem(BLUEPRINT_KEY) === '2027' ? '2027' : '2022'
  } catch {
    return '2022'
  }
}

interface Props {
  onStart: (settings: Omit<StudySettings, 'seed'>) => Promise<void>
  onOpenLibrary: () => void
}

/** Readiness by board content area, and the ways to study: practice by area or a timed mock exam. */
export function Study({ onStart, onOpenLibrary }: Props) {
  const [blueprint, setBlueprint] = useState<BlueprintId>(savedBlueprint)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [practiceArea, setPracticeArea] = useState<ContentArea | 'all' | null>(null)
  const [practiceTopic, setPracticeTopic] = useState('all')
  const [mockLength, setMockLength] = useState(200)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    window.api
      .getReadiness(blueprint)
      .then(setReadiness)
      .catch((err: unknown) => setError(errorMessage(err)))
    try {
      window.localStorage.setItem(BLUEPRINT_KEY, blueprint)
    } catch {
      // Storage may be off (a private window): the choice just isn't remembered.
    }
  }, [blueprint])

  if (!readiness) return error ? <ErrorBanner message={error} /> : <p className="text-slate-500">Loading…</p>

  if (readiness.questionCount === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Set up your study set</h2>
        <p className="mt-1 text-sm text-slate-600">
          Import your review PDFs once on this device. Ahral sorts their questions into the four board exam areas.
        </p>
        <Button className="mt-4" onClick={onOpenLibrary}>
          Go to Library
        </Button>
      </Card>
    )
  }

  const area = practiceArea ?? readiness.weakest ?? 'all'
  const areaLabel = (a: ContentArea | 'all') =>
    a === 'all' ? 'All areas' : (readiness.areas.find((x) => x.area === a)?.label ?? a)
  const mockAvailable = readiness.areas.reduce((sum, a) => sum + a.mockAvailable, 0)
  const topics = area === 'all' ? [] : (readiness.areas.find((x) => x.area === area)?.topics ?? [])
  const topic = topics.some((t) => t.name === practiceTopic) ? practiceTopic : 'all'
  const fromPdfs = readiness.questionCount - readiness.bankCount

  async function start(settings: Omit<StudySettings, 'seed'>) {
    setError(null)
    setStarting(true)
    try {
      await onStart(settings)
    } catch (err) {
      setError(errorMessage(err))
      setStarting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Readiness</h2>
          <p className="mt-1 text-sm text-slate-500">
            {readiness.bankCount.toLocaleString()} built-in questions
            {fromPdfs > 0 && ` and ${fromPdfs.toLocaleString()} from your PDFs`}, by board exam content area.
          </p>
        </div>
        <label className="text-sm">
          <span className="block text-slate-500">Your exam date</span>
          <select
            value={blueprint}
            onChange={(e) => setBlueprint(e.target.value as BlueprintId)}
            className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5"
          >
            {(Object.keys(BLUEPRINT_LABELS) as BlueprintId[]).map((id) => (
              <option key={id} value={id}>
                {BLUEPRINT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card>
        <table className="w-full text-sm">
          <caption className="sr-only">Score by content area</caption>
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th scope="col" className="pb-2 font-medium">
                Area
              </th>
              <th scope="col" className="pb-2 font-medium">
                Correct
              </th>
              <th scope="col" className="w-2/5 pb-2 font-medium">
                <span className="sr-only">Score bar</span>
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                On the exam
              </th>
            </tr>
          </thead>
          <tbody>
            {readiness.areas.map((a) => (
              <tr key={a.area} className="border-t border-slate-100" data-testid={`area-${a.area}`}>
                <th scope="row" className="py-3 pr-3 text-left font-medium">
                  {a.label}
                  {a.area === readiness.weakest && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                      Practise next
                    </span>
                  )}
                  <span className="block text-xs font-normal text-slate-500">{a.available} questions</span>
                </th>
                <td className={`py-3 pr-3 font-semibold ${a.total === 0 ? 'text-slate-400' : scoreColor(a.percent)}`}>
                  {a.total === 0 ? '–' : `${a.percent}%`}
                  <span className="block text-xs font-normal text-slate-500">{a.total} answered</span>
                </td>
                <td className="py-3 pr-3">{a.total > 0 && <ScoreBar percent={a.percent} />}</td>
                <td className="py-3 text-right tabular-nums">{a.onExam}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <h3 className="font-semibold">Practice</h3>
          <p className="mt-1 text-sm text-slate-600">
            {PRACTICE_LENGTH} questions with an explanation after each answer.
          </p>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Area</span>
            <select
              value={area}
              onChange={(e) => {
                setPracticeArea(e.target.value as ContentArea | 'all')
                setPracticeTopic('all')
              }}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="all">All areas</option>
              {readiness.areas.map((a) => (
                <option key={a.area} value={a.area} disabled={a.available === 0}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {topics.length > 0 && (
            <label className="mt-3 block text-sm">
              <span className="font-medium">Topic</span>
              <select
                value={topic}
                onChange={(e) => setPracticeTopic(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
              >
                <option value="all">All topics</option>
                {topics.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.available})
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            className="mt-4 w-full"
            disabled={starting}
            onClick={() =>
              start({
                mode: 'practice',
                areas: area === 'all' ? [] : [area],
                topics: topic === 'all' ? [] : [topic],
                questionCount: PRACTICE_LENGTH,
                types: [],
                acceptTypos: false,
                blueprint
              })
            }
          >
            Practise {topic === 'all' ? areaLabel(area) : topic}
          </Button>
        </Card>

        <Card>
          <h3 className="font-semibold">Mock exam</h3>
          <p className="mt-1 text-sm text-slate-600">
            Multiple choice in the board exam&rsquo;s proportions, timed at its pace. Answers at the end.
          </p>
          <fieldset className="mt-4 text-sm">
            <legend className="font-medium">Length</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {MOCK_LENGTHS.map((n) => (
                <label key={n} className="flex items-center gap-2">
                  <input type="radio" name="mock-length" checked={mockLength === n} onChange={() => setMockLength(n)} />
                  {n} questions
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            className="mt-4 w-full"
            variant="secondary"
            disabled={starting || mockAvailable === 0}
            onClick={() =>
              start({ mode: 'mock', areas: [], questionCount: mockLength, types: [], acceptTypos: false, blueprint })
            }
          >
            Begin mock exam
          </Button>
        </Card>
      </div>

      {readiness.recent.length > 0 && (
        <Card>
          <h3 className="font-semibold">Recent</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm" aria-label="Recent attempts">
            {readiness.recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-4 py-2">
                <span>
                  {r.label}
                  <span className="text-slate-500"> · {formatDate(r.finishedAt)}</span>
                </span>
                <span className={`font-medium ${scoreColor(r.percent)}`}>
                  {r.percent}%{' '}
                  <span className="font-normal text-slate-500">
                    ({r.correct}/{r.total})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
