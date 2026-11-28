import { useEffect, useRef, useState } from 'react'
import type { AnswerFeedback, ExamResponse, ExamView } from '../../shared/api'
import {
  Button,
  ChoiceRow,
  type ChoiceState,
  ErrorBanner,
  errorMessage,
  explanationLines,
  LETTERS,
  questionLabel,
  ReportLink
} from './ui'

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
  const [answeredRight, setAnsweredRight] = useState(0)
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
      const result = await window.api.answerQuestion(exam.examId, position, response)
      setFeedback(result)
      if (result.correct) setAnsweredRight((n) => n + 1)
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
  function choiceState(index: number, option: string): ChoiceState {
    if (!feedback) return choice === index ? 'selected' : 'idle'
    if (option === feedback.answer) return 'right'
    if (option === feedback.given) return 'wrong'
    return 'faded'
  }

  /** Words as well as colour, so the result is clear without telling red from green. */
  function choiceTag(option: string): string | undefined {
    if (!feedback) return undefined
    const picked = option === feedback.given
    if (option === feedback.answer) return picked ? '✓ Your answer' : '✓ Correct answer'
    return picked ? '✗ Your answer' : undefined
  }

  const typedAnswerStyle = !feedback
    ? 'border-ink'
    : feedback.correct
      ? 'border-correct bg-white ring-1 ring-correct'
      : feedback.status === 'almost'
        ? 'border-accent bg-white ring-1 ring-accent'
        : 'border-incorrect bg-white ring-1 ring-incorrect'

  const verdictColor = !feedback
    ? ''
    : feedback.correct
      ? 'border-correct text-correct'
      : feedback.status === 'almost'
        ? 'border-accent text-amber-800'
        : 'border-incorrect text-incorrect'

  const progress = ((position + (feedback ? 1 : 0)) / exam.questions.length) * 100

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule pb-3">
        <span className="label grow text-ink" data-testid="exam-progress">
          Question {position + 1} of {exam.questions.length}
        </span>
        {answeredRight > 0 && <span className="label">{answeredRight} right</span>}
        {confirmQuit ? (
          <span className="flex items-center gap-2 text-sm">
            Leave without saving this attempt?
            <Button variant="danger" className="px-3" onClick={onQuit}>
              Leave
            </Button>
            <Button variant="ghost" className="px-3" onClick={() => setConfirmQuit(false)}>
              Stay
            </Button>
          </span>
        ) : (
          <Button variant="ghost" className="px-3" onClick={() => setConfirmQuit(true)}>
            Quit exam
          </Button>
        )}
      </div>
      <div className="h-1 bg-rule" aria-hidden="true">
        <div className="h-full bg-ink transition-all" style={{ width: `${progress}%` }} />
      </div>

      <section className="mt-8">
        <p className="label">{questionLabel(question)}</p>
        <h2
          className="mt-3 text-xl leading-normal font-medium whitespace-pre-line sm:text-2xl"
          data-testid="question-prompt"
        >
          {question.prompt}
        </h2>

        {options ? (
          <div role="radiogroup" aria-label="Options" ref={optionsRef} tabIndex={-1} className="mt-7 outline-none">
            {options.map((option, i) => (
              <ChoiceRow
                key={option}
                letter={LETTERS[i] ?? ''}
                text={option}
                state={choiceState(i, option)}
                tag={choiceTag(option)}
                checked={choice === i}
                disabled={feedback !== null}
                onClick={() => setChoice(i)}
              />
            ))}
          </div>
        ) : (
          <form
            className="mt-7"
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
              className={`mt-1 block w-full rounded-[2px] border bg-white px-3 py-2.5 ${typedAnswerStyle}`}
            />
          </form>
        )}

        {feedback && (
          <div aria-live="polite" data-testid="feedback" className={`mt-7 border-t-[3px] pt-3.5 ${verdictColor}`}>
            <p className="font-semibold">{feedback.lines[0]}</p>
            <div className="text-[15px] leading-relaxed text-ink">
              {explanationLines(feedback.lines, options !== undefined).map((line) => (
                <p key={line} className="mt-2">
                  {line}
                </p>
              ))}
            </div>
            <ReportLink question={question} answer={feedback.answer} />
          </div>
        )}
      </section>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="mt-8 flex justify-end gap-3 border-t border-rule pt-5">
        {feedback ? (
          <Button ref={nextRef} className="w-full sm:w-auto" onClick={next} disabled={busy}>
            {isLast ? 'See results' : 'Next question'}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => submit({ text: '' })} disabled={busy}>
              Skip
            </Button>
            <Button
              className="grow sm:grow-0"
              onClick={() => submit(options ? { choice: choice ?? -1 } : { text })}
              disabled={busy || (options ? choice === null : text.trim() === '')}
            >
              Check answer
            </Button>
          </>
        )}
      </div>
      {options && !feedback && (
        <p className="mt-3 hidden text-right font-mono text-[11px] text-muted sm:block">
          KEYS: A–D OR 1–4 TO CHOOSE · ENTER TO CHECK
        </p>
      )}
    </div>
  )
}
