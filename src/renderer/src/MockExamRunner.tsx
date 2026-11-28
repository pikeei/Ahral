import { useEffect, useRef, useState } from 'react'
import type { ExamView } from '../../shared/api'
import { Button, ChoiceRow, ErrorBanner, errorMessage, LETTERS, ReportLink } from './ui'

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule pb-3">
        <span className="label grow">Mock exam · {total} questions · answers at the end</span>
        <span
          className={`font-mono text-[22px] font-medium tracking-wide ${secondsLeft < 300 ? 'text-incorrect' : 'text-ink'}`}
          role="timer"
          aria-label={`Time left ${clock}`}
          data-testid="exam-timer"
        >
          {clock}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-16 gap-y-6">
        <div className="flex flex-[0_0_160px] flex-wrap items-baseline gap-x-6 gap-y-1 sm:block">
          <p className="font-serif text-6xl leading-[0.9] font-medium tracking-tight sm:text-8xl">{position + 1}</p>
          <p className="label sm:mt-3" data-testid="exam-progress">
            Question {position + 1} of {total}
          </p>
          {question.area && (
            <>
              <p className="label mt-7 hidden sm:block">Area</p>
              <p className="text-[15px] font-medium sm:mt-1">{question.area}</p>
            </>
          )}
          <p className="label mt-5 hidden sm:block">Flagged</p>
          <p className="hidden font-mono text-[15px] sm:mt-1 sm:block">{flags.size}</p>
        </div>

        <section className="min-w-0 max-w-3xl flex-[999_1_480px]">
          <h2
            className="text-xl leading-normal font-medium whitespace-pre-line sm:text-2xl"
            data-testid="question-prompt"
          >
            {question.prompt}
          </h2>
          <div role="radiogroup" aria-label="Options" className="mt-8">
            {options.map((option, i) => (
              <ChoiceRow
                key={option}
                letter={LETTERS[i] ?? ''}
                text={option}
                state={chosen === i ? 'selected' : 'idle'}
                checked={chosen === i}
                onClick={() => choose(i)}
              />
            ))}
          </div>

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-rule pt-5">
            <Button variant="ghost" className="px-1" onClick={toggleFlag} aria-pressed={flags.has(position)}>
              {flags.has(position) ? 'Unflag' : 'Flag for review'}
            </Button>
            <span className="grow" />
            <Button variant="secondary" disabled={position === 0} onClick={() => setPosition(position - 1)}>
              Previous
            </Button>
            {position < total - 1 ? (
              <Button onClick={() => setPosition(position + 1)}>Next</Button>
            ) : (
              <Button onClick={() => setConfirming('finish')}>Review and finish</Button>
            )}
          </div>
          <div className="mt-2">
            <ReportLink question={question} />
          </div>
        </section>
      </div>

      <nav aria-label="Questions" className="border-t-[3px] border-ink pt-4">
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] tracking-wide text-muted uppercase">
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
                className={`h-8 min-w-8 px-1 font-mono text-xs tabular-nums ${
                  flagged
                    ? 'bg-accent text-ink'
                    : answered
                      ? 'bg-ink text-paper'
                      : 'text-muted shadow-[inset_0_0_0_1px_var(--color-rule)]'
                } ${q.position === position ? 'outline-2 outline-offset-1 outline-ink' : ''}`}
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
        <div role="alertdialog" aria-labelledby="finish-title" className="border-t-[3px] border-ink bg-white p-5">
          <h3 id="finish-title" className="font-serif text-2xl font-medium">
            Finish the exam?
          </h3>
          <p className="mt-2 text-[15px] text-muted">
            {unanswered === 0
              ? 'Every question has an answer.'
              : `${unanswered} ${unanswered === 1 ? 'question has' : 'questions have'} no answer and will count as wrong.`}
            {flags.size > 0 && ` ${flags.size} ${flags.size === 1 ? 'is' : 'are'} flagged for review.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
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
