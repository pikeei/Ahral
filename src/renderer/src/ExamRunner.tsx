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
  const optionsRef = useRef<HTMLDivElement>(null)

  const question = exam.questions[position]
  const isLast = position === exam.questions.length - 1

  // Focus the input (or the options) for each new question, and the Next button once answered.
  // Without this, focus stays on the button under the mouse: after "Next question" that is
  // the new question's Skip button, and pressing Enter to check a choice would skip it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for each new question too
  useEffect(() => {
    if (feedback) nextRef.current?.focus()
    else (inputRef.current ?? optionsRef.current)?.focus()
  }, [feedback, position])

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

  /** After answering: the right option is green; a wrong pick is red; the rest fade. */
  function optionResult(option: string): 'right' | 'wrong-pick' | 'other' {
    if (option === feedback?.answer) return 'right'
    if (option === feedback?.given) return 'wrong-pick'
    return 'other'
  }

  function optionStyle(index: number, option: string): string {
    if (!feedback) {
      return choice === index
        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
        : 'border-slate-200 bg-white hover:border-slate-300'
    }
    return {
      right: 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600',
      'wrong-pick': 'border-red-600 bg-red-100 text-red-950 ring-1 ring-red-600',
      other: 'border-slate-200 bg-white text-slate-500'
    }[optionResult(option)]
  }

  /** Words as well as colour, so the result is clear without telling red from green. */
  function optionTag(option: string) {
    if (!feedback) return null
    const result = optionResult(option)
    if (result === 'other') return null
    const picked = option === feedback.given
    return (
      <span
        className={`ml-auto shrink-0 self-start rounded-full px-2 py-0.5 text-xs font-semibold ${
          result === 'right' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}
      >
        {result === 'right' ? (picked ? '✓ Your answer' : '✓ Correct answer') : '✗ Your answer'}
      </span>
    )
  }

  const typedAnswerStyle = !feedback
    ? 'border-slate-300'
    : feedback.correct
      ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
      : feedback.status === 'almost'
        ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
        : 'border-red-600 bg-red-50 text-red-950 ring-1 ring-red-600'

  const feedbackStyle = !feedback
    ? ''
    : feedback.correct
      ? 'bg-emerald-50 text-emerald-950'
      : feedback.status === 'almost'
        ? 'bg-amber-50 text-amber-950'
        : 'bg-red-50 text-red-950'

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
        <h2 className="mt-2 text-lg leading-relaxed whitespace-pre-line" data-testid="question-prompt">
          {question.prompt}
        </h2>

        {options ? (
          <div
            role="radiogroup"
            aria-label="Options"
            ref={optionsRef}
            tabIndex={-1}
            className="mt-5 space-y-2 outline-none"
          >
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
                <span className="font-semibold opacity-70">{LETTERS[i]}</span>
                <span>{option}</span>
                {optionTag(option)}
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
              className={`mt-1 block w-full rounded-md border px-3 py-2 ${typedAnswerStyle}`}
            />
          </form>
        )}

        {feedback && (
          <div aria-live="polite" data-testid="feedback" className={`mt-5 rounded-md p-4 text-sm ${feedbackStyle}`}>
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
