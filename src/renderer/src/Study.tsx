import { useEffect, useState } from 'react'
import type { AreaReadiness, BlueprintId, ContentArea, Readiness, StudySettings } from '../../shared/api'
import { Button, ErrorBanner, errorMessage, formatDate } from './ui'

const MOCK_LENGTHS = [200, 100, 50]
const PRACTICE_LENGTH = 20
/** ARRT's new content outline takes effect on this date. */
const NEW_OUTLINE_FROM = new Date('2027-03-01T00:00:00')

/** The exam outline in force today, so the question counts switch by themselves in March 2027. */
function currentBlueprint(today = new Date()): BlueprintId {
  return today >= NEW_OUTLINE_FROM ? '2027' : '2022'
}

/** Film step-wedge shades, lightest to darkest: the more cells filled, the better the score. */
const WEDGE = [
  '#e9e3d3',
  '#d9d0bb',
  '#c6bba2',
  '#afa28a',
  '#968972',
  '#7c705c',
  '#625847',
  '#4a4235',
  '#332d24',
  '#16150f'
]

function StepWedge({ area }: { area: AreaReadiness }) {
  const filled = area.total === 0 ? 0 : Math.round(area.percent / 10)
  return (
    <div
      role="img"
      aria-label={
        area.total === 0 ? `${area.label}: not practised yet` : `${area.label}: ${area.percent} percent correct`
      }
      className="grid h-7 grid-cols-10 gap-0.5"
    >
      {WEDGE.map((shade, i) => (
        <div key={shade} style={i < filled ? { background: shade } : { boxShadow: 'inset 0 0 0 1px #d8d2c3' }} />
      ))}
    </div>
  )
}

/** One line that sums up where the person stands. */
function headline(readiness: Readiness): string {
  const scored = readiness.areas.filter((a) => a.total > 0)
  if (scored.length === 0) return 'Pick an area and start practising.'
  const best = [...scored].sort((a, b) => b.percent - a.percent)[0]
  const weakest = readiness.areas.find((a) => a.area === readiness.weakest)
  if (!best || !weakest || best.area === weakest.area) return `${best?.label ?? 'Your areas'}: keep going.`
  return `Strong on ${best.label.toLowerCase()}. ${weakest.label} needs work.`
}

interface Props {
  onStart: (settings: Omit<StudySettings, 'seed'>) => Promise<void>
  onOpenLibrary: () => void
}

/** Readiness by board content area, and the ways to study: practice by area or topic, or a timed mock exam. */
export function Study({ onStart, onOpenLibrary }: Props) {
  const blueprint = currentBlueprint()
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
  }, [blueprint])

  if (!readiness) return error ? <ErrorBanner message={error} /> : <p className="text-muted">Loading…</p>

  if (readiness.questionCount === 0) {
    return (
      <section className="max-w-xl border-t-[3px] border-ink pt-5">
        <h2 className="font-serif text-3xl font-medium">Set up your study set</h2>
        <p className="mt-2 text-muted">Import your review PDFs once on this device.</p>
        <Button className="mt-5" onClick={onOpenLibrary}>
          Go to Library
        </Button>
      </section>
    )
  }

  const area = practiceArea ?? readiness.weakest ?? 'all'
  const areaLabel = (a: ContentArea | 'all') =>
    a === 'all' ? 'All areas' : (readiness.areas.find((x) => x.area === a)?.label ?? a)
  const mockAvailable = readiness.areas.reduce((sum, a) => sum + a.mockAvailable, 0)
  const topics = area === 'all' ? [] : (readiness.areas.find((x) => x.area === area)?.topics ?? [])
  const topic = topics.some((t) => t.name === practiceTopic) ? practiceTopic : 'all'
  const fromPdfs = readiness.questionCount - readiness.bankCount
  const mockMinutes = Math.round((mockLength * 210) / 230)

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

  const select = 'mt-1 block w-full rounded-[2px] border border-ink bg-white px-2 py-2 text-[15px]'

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-wrap items-start gap-x-16 gap-y-12">
        <section aria-labelledby="readiness" className="min-w-0 flex-[999_1_520px]">
          <p className="label">Readiness</p>
          <h2
            id="readiness"
            className="mt-3 max-w-[16ch] font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-[52px]"
          >
            {headline(readiness)}
          </h2>
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-muted">
            {readiness.bankCount.toLocaleString()} built-in questions
            {fromPdfs > 0 && ` and ${fromPdfs.toLocaleString()} from your PDFs`}, by board exam content area. Each strip
            is a step wedge: the darker it gets, the more you answer correctly.
          </p>

          <table className="mt-10 w-full border-collapse text-[15px]">
            <caption className="sr-only">Score by content area</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className="label border-b border-ink pr-3 pb-2.5 font-medium">
                  Area
                </th>
                <th scope="col" className="label border-b border-ink pr-3 pb-2.5 font-medium">
                  Correct
                </th>
                <th scope="col" className="label w-[42%] border-b border-ink pr-3 pb-2.5 font-medium">
                  <span className="sr-only">Score as a </span>Step wedge
                </th>
                <th scope="col" className="label border-b border-ink pb-2.5 text-right font-medium">
                  On exam
                </th>
              </tr>
            </thead>
            <tbody>
              {readiness.areas.map((a) => (
                <tr key={a.area} data-testid={`area-${a.area}`}>
                  <th scope="row" className="border-b border-rule py-4 pr-4 text-left align-middle font-medium">
                    <span className="block">{a.label}</span>
                    {a.area === readiness.weakest && (
                      <span className="mt-1.5 inline-block bg-accent px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide">
                        PRACTISE NEXT
                      </span>
                    )}
                    <span className="mt-1 block font-mono text-[11px] font-normal text-muted">
                      {a.available} questions
                    </span>
                  </th>
                  <td className="border-b border-rule py-4 pr-4 font-serif text-3xl font-medium">
                    {a.total === 0 ? (
                      <span className="text-rule">–</span>
                    ) : (
                      <>
                        {a.percent}
                        <span className="text-base text-muted">%</span>
                      </>
                    )}
                  </td>
                  <td className="border-b border-rule py-4 pr-4">
                    <StepWedge area={a} />
                    <span className="mt-1.5 block font-mono text-[11px] text-muted">{a.total} answered</span>
                  </td>
                  <td className="border-b border-rule py-4 text-right font-mono text-sm">{a.onExam}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 font-mono text-[11px] text-muted">
            Scored questions per area on the ARRT radiography exam
            {blueprint === '2027' ? ' (outline from March 1, 2027)' : ' (outline through February 28, 2027)'}.
          </p>
        </section>

        <aside aria-label="Next session" className="min-w-0 flex-[1_1_300px] border-t-[3px] border-ink pt-5">
          <p className="label">Next session</p>
          <h3 className="mt-2.5 font-serif text-3xl leading-tight font-medium">
            {topic === 'all' ? areaLabel(area) : topic}, {PRACTICE_LENGTH} questions
          </h3>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
            An explanation after each answer. About 15 minutes.
          </p>
          <div className="mt-5 text-sm">
            <label htmlFor="practice-area" className="font-medium">
              Area
            </label>
            <select
              id="practice-area"
              value={area}
              onChange={(e) => {
                setPracticeArea(e.target.value as ContentArea | 'all')
                setPracticeTopic('all')
              }}
              className={select}
            >
              <option value="all">All areas</option>
              {readiness.areas.map((a) => (
                <option key={a.area} value={a.area} disabled={a.available === 0}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          {topics.length > 0 && (
            <div className="mt-3 text-sm">
              <label htmlFor="practice-topic" className="font-medium">
                Topic
              </label>
              <select
                id="practice-topic"
                value={topic}
                onChange={(e) => setPracticeTopic(e.target.value)}
                className={select}
              >
                <option value="all">All topics</option>
                {topics.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.available})
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            className="mt-5 w-full"
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

          <div className="mt-9 border-t border-rule pt-5">
            <p className="label">Full mock exam</p>
            <p className="mt-2.5 text-[15px] leading-relaxed">
              <span className="font-mono">{mockLength}</span> questions in the board exam&rsquo;s proportions, timed at{' '}
              <span className="font-mono">
                {Math.floor(mockMinutes / 60)} h {String(mockMinutes % 60).padStart(2, '0')} min
              </span>
              . Answers shown at the end.
            </p>
            <fieldset className="mt-3 text-sm">
              <legend className="sr-only">Length</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {MOCK_LENGTHS.map((n) => (
                  <label key={n} className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="mock-length"
                      className="accent-ink"
                      checked={mockLength === n}
                      onChange={() => setMockLength(n)}
                    />
                    {n} questions
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              disabled={starting || mockAvailable === 0}
              onClick={() =>
                start({ mode: 'mock', areas: [], questionCount: mockLength, types: [], acceptTypos: false, blueprint })
              }
            >
              Begin mock exam
            </Button>
          </div>

          {readiness.recent.length > 0 && (
            <div className="mt-9">
              <p className="label mb-2">Recent</p>
              <ul aria-label="Recent attempts">
                {readiness.recent.map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-rule py-2.5 text-sm"
                  >
                    <span>
                      {r.label}
                      <span className="block font-mono text-[11px] text-muted">{formatDate(r.finishedAt)}</span>
                    </span>
                    <span className="text-right font-mono">
                      {r.percent}%{' '}
                      <span className="text-muted">
                        ({r.correct}/{r.total})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
