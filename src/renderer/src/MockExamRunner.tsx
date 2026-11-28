import { useEffect, useRef, useState } from 'react'
import type { ExamView } from '../../shared/api'
import { Button, ErrorBanner, errorMessage } from './ui'

const LETTERS = 'ABCDEFGH'

interface Props {
  exam: ExamView
  onFinish: () => Promise<void>
  onQuit: () => void
}

/**
 * A timed mock exam, like the board exam: answers can be changed and questions flagged
 * and revisited; nothing is marked until the end. When time runs out the exam finishes.
 */
export function MockExamRunner({ exam, onFinish, onQuit }: Props) {
  const [position, setPosition] = useState(0)
  const [answers, setAnswers] = useState<Map<number, number>>(new Map())
  const [flags, setFlags] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState<'finish' | 'quit' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deadline = useRef(Date.now() + (exam.timeLimitSeconds ?? 0) * 1000)
  const [secondsLeft, setSecondsLeft] = useState(exam.timeLimitSeconds ?? 0)
  const finishing = useRef(false)

  const question = exam.questions[position]
  const total = exam.questions.length

  async function finish() {
    if (finishing.current) return
    finishing.current = true
    setBusy(true)
    try {
      await onFinish()
    } catch (err) {
      finishing.current = false
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  // The clock: when time is up, the exam is handed in as it stands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one timer for the whole exam
  useEffect(() => {
    if (!exam.timeLimitSeconds) return
    const timer = setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) {
        clearInterval(timer)
        void finish()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!question) return <ErrorBanner message="This exam has no questions." />
  const options = question.options ?? []
  const chosen = answers.get(position)

  function choose(index: number) {
    const next = new Map(answers)
    next.set(position, index)
    setAnswers(next)
    window.api
      .recordAnswer(exam.examId, position, { choice: index })
      .catch((err: unknown) => setError(errorMessage(err)))
  }

  function toggleFlag() {
    const next = new Set(flags)
    if (next.has(position)) next.delete(position)
    else next.add(position)
    setFlags(next)
  }

  const unanswered = total - answers.size
  const clock = `${Math.floor(secondsLeft / 3600)}:${String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span data-testid="exam-progress">
          Question {position + 1} of {total}
          {question.area && <span className="text-slate-400"> · {question.area}</span>}
        </span>
        <span
          className={`font-mono text-base font-semibold ${secondsLeft < 300 ? 'text-red-700' : 'text-slate-900'}`}
          role="timer"
          aria-label={`Time left ${clock}`}
          data-testid="exam-timer"
        >
          {clock}
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg leading-relaxed whitespace-pre-line" data-testid="question-prompt">
          {question.prompt}
        </h2>
        <div role="radiogroup" aria-label="Options" className="mt-5 space-y-2">
          {options.map((option, i) => (
            // biome-ignore lint/a11y/useSemanticElements: styled option cards behave as a radio group
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosen === i}
              onClick={() => choose(i)}
              className={`flex w-full gap-3 rounded-md border p-3 text-left transition-colors ${
                chosen === i
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className="font-semibold text-slate-500">{LETTERS[i]}</span>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={toggleFlag} aria-pressed={flags.has(position)}>
          {flags.has(position) ? 'Unflag' : 'Flag for review'}
        </Button>
        <span className="flex-grow" />
        <Button variant="secondary" disabled={position === 0} onClick={() => setPosition(position - 1)}>
          Previous
        </Button>
        {position < total - 1 ? (
          <Button onClick={() => setPosition(position + 1)}>Next</Button>
        ) : (
          <Button onClick={() => setConfirming('finish')}>Review and finish</Button>
        )}
      </div>

      <nav aria-label="Questions" className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{answers.size} answered</span>
          <span>{flags.size} flagged</span>
          <span>{unanswered} unanswered</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {exam.questions.map((q) => {
            const answered = answers.has(q.position)
            const flagged = flags.has(q.position)
            return (
              <button
                key={q.position}
                type="button"
                onClick={() => setPosition(q.position)}
                aria-label={`Question ${q.position + 1}${answered ? ', answered' : ''}${flagged ? ', flagged' : ''}`}
                aria-current={q.position === position ? 'step' : undefined}
                className={`h-8 min-w-8 rounded border px-1 text-xs tabular-nums ${
                  q.position === position ? 'ring-2 ring-indigo-500' : ''
                } ${answered ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-600'} ${
                  flagged ? 'outline-2 outline-amber-500' : ''
                }`}
              >
                {q.position + 1}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {confirming === 'quit' ? (
          <span className="flex flex-wrap items-center gap-2">
            Leave without saving this exam?
            <Button variant="danger" onClick={onQuit}>
              Leave
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Stay
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming('quit')}>
            Quit exam
          </Button>
        )}
        {confirming !== 'finish' && position < total - 1 && (
          <Button variant="secondary" onClick={() => setConfirming('finish')}>
            Finish exam
          </Button>
        )}
      </div>

      {confirming === 'finish' && (
        <div
          role="alertdialog"
          aria-labelledby="finish-title"
          className="rounded-lg border border-slate-300 bg-white p-5"
        >
          <h3 id="finish-title" className="font-semibold">
            Finish the exam?
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {unanswered === 0
              ? 'Every question has an answer.'
              : `${unanswered} ${unanswered === 1 ? 'question has' : 'questions have'} no answer and will count as wrong.`}
            {flags.size > 0 && ` ${flags.size} ${flags.size === 1 ? 'is' : 'are'} flagged for review.`}
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => void finish()} disabled={busy}>
              Finish and see results
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Keep going
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
