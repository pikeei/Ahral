import { useEffect, useRef, useState } from 'react'
import type { AnswerFeedback, ExamResponse, ExamView } from '../../shared/api'
import { Button, ErrorBanner, errorMessage, explanationLines, TYPE_LABELS } from './ui'

const LETTERS = 'ABCDEFGH'

interface Props {
  exam: ExamView
  onFinish: () => Promise<void>
  onQuit: () => void
}

/** One question at a time: answer, see why it is right or wrong, move on. */
export function ExamRunner({ exam, onFinish, onQuit }: Props) {
  const [position, setPosition] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const question = exam.questions[position]
  const isLast = position === exam.questions.length - 1

  // Focus the input for each new question, and the Next button once answered.
  useEffect(() => {
    if (feedback) nextRef.current?.focus()
    else inputRef.current?.focus()
  }, [feedback])

  // Keyboard shortcuts for multiple choice: A-D or 1-4 to choose, Enter to check.
  useEffect(() => {
    if (!question?.options || feedback) return
    const count = question.options.length
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.altKey || e.metaKey) return
      const key = e.key.toUpperCase()
      const index = LETTERS.includes(key) ? LETTERS.indexOf(key) : Number(key) - 1
      if (index >= 0 && index < count) setChoice(index)
      else if (e.key === 'Enter' && choice !== null && !(e.target instanceof HTMLButtonElement)) {
        void submit({ choice })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!question) return <ErrorBanner message="This exam has no questions." />
  const options = question.options

  async function submit(response: ExamResponse) {
    if (busy || feedback) return
    setBusy(true)
    setError(null)
    try {
      setFeedback(await window.api.answerQuestion(exam.examId, position, response))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function next() {
    if (isLast) {
      setBusy(true)
      try {
        await onFinish()
      } catch (err) {
        setError(errorMessage(err))
        setBusy(false)
      }
      return
    }
    setPosition(position + 1)
    setChoice(null)
    setText('')
    setFeedback(null)
  }

  function optionStyle(index: number, option: string): string {
    if (!feedback) {
      return choice === index
        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
        : 'border-slate-200 bg-white hover:border-slate-300'
    }
    if (option === feedback.answer) return 'border-emerald-500 bg-emerald-50'
    if (option === feedback.given) return 'border-red-400 bg-red-50'
    return 'border-slate-200 bg-white opacity-60'
  }

  const progress = ((position + (feedback ? 1 : 0)) / exam.questions.length) * 100

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span data-testid="exam-progress">
            Question {position + 1} of {exam.questions.length}
          </span>
          {confirmQuit ? (
            <span className="flex items-center gap-2">
              Leave without saving this attempt?
              <Button variant="danger" className="px-3 py-1" onClick={onQuit}>
                Leave
              </Button>
              <Button variant="ghost" className="px-3 py-1" onClick={() => setConfirmQuit(false)}>
                Stay
              </Button>
            </span>
          ) : (
            <Button variant="ghost" className="px-3 py-1" onClick={() => setConfirmQuit(true)}>
              Quit exam
            </Button>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          {TYPE_LABELS[question.type]} · {question.section}
        </p>
        <h2 className="mt-2 text-lg leading-relaxed" data-testid="question-prompt">
          {question.prompt}
        </h2>

        {options ? (
          <div role="radiogroup" aria-label="Options" className="mt-5 space-y-2">
            {options.map((option, i) => (
              // biome-ignore lint/a11y/useSemanticElements: styled option cards behave as a radio group
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={choice === i}
                disabled={feedback !== null}
                onClick={() => setChoice(i)}
                className={`flex w-full gap-3 rounded-md border p-3 text-left transition-colors ${optionStyle(i, option)}`}
              >
                <span className="font-semibold text-slate-500">{LETTERS[i]}</span>
                <span>{option}</span>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault()
              void submit({ text })
            }}
          >
            <label className="block text-sm font-medium" htmlFor="answer">
              Your answer
            </label>
            <input
              id="answer"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={feedback !== null}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-50"
            />
          </form>
        )}

        {feedback && (
          <div
            aria-live="polite"
            data-testid="feedback"
            className={`mt-5 rounded-md p-4 text-sm ${
              feedback.correct ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'
            }`}
          >
            <p className="font-semibold">{feedback.lines[0]}</p>
            {explanationLines(feedback.lines, options !== undefined).map((line) => (
              <p key={line} className="mt-1">
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex justify-end gap-3">
        {feedback ? (
          <Button ref={nextRef} onClick={next} disabled={busy}>
            {isLast ? 'See results' : 'Next question'}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => submit({ text: '' })} disabled={busy}>
              Skip
            </Button>
            <Button
              onClick={() => submit(options ? { choice: choice ?? -1 } : { text })}
              disabled={busy || (options ? choice === null : text.trim() === '')}
            >
              Check answer
            </Button>
          </>
        )}
      </div>
      {options && !feedback && (
        <p className="text-right text-xs text-slate-400">Keys: A–D or 1–4 to choose, Enter to check</p>
      )}
    </div>
  )
}
