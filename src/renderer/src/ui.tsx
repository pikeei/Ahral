import type { ComponentProps, ReactNode } from 'react'
import type { ExamQuestionView, ImportStage, QuestionType } from '../../shared/api'

/* Small shared pieces of UI and wording. */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'border border-ink bg-ink text-paper hover:bg-slate-700 disabled:border-slate-400 disabled:bg-slate-400',
  secondary:
    'border border-ink bg-transparent text-ink hover:bg-white disabled:border-slate-300 disabled:text-slate-400',
  danger: 'border border-incorrect bg-incorrect text-white hover:bg-red-800 disabled:bg-red-300',
  ghost: 'text-muted hover:bg-slate-100 hover:text-ink'
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-[2px] px-5 py-2 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border-t-[3px] border-ink pt-5 ${className}`}>{children}</section>
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="font-medium underline" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}

/** Green from 80%, amber from 60%, red below: the same threshold as weak sections. */
export function scoreColor(percent: number): string {
  if (percent >= 80) return 'text-emerald-700'
  if (percent >= 60) return 'text-amber-700'
  return 'text-red-700'
}

export function ScoreBar({ percent }: { percent: number }) {
  const color = percent >= 80 ? 'bg-correct' : percent >= 60 ? 'bg-accent' : 'bg-incorrect'
  return (
    <div className="h-2 w-full overflow-hidden bg-slate-100" aria-hidden="true">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(percent, 2)}%` }} />
    </div>
  )
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  cloze: 'Fill in the blank',
  'mcq-term': 'Pick the term',
  'mcq-definition': 'Pick the definition',
  'book-mcq': 'From the book'
}

export const STAGE_LABELS: Record<ImportStage, string> = {
  reading: 'Reading pages',
  analyzing: 'Finding terms and definitions',
  generating: 'Writing questions',
  saving: 'Saving'
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** "Error invoking remote method 'exam:start': Error: No document with id 4" -> "No document with id 4". */
export function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

/**
 * Feedback lines after the headline ("Not quite."). `answerShown` drops "The answer is: ..."
 * where the answer is already on screen (a highlighted option, or the Answer row in the review).
 */
export function explanationLines(lines: string[], answerShown: boolean): string[] {
  return lines.slice(1).filter((line) => !(answerShown && line.startsWith('The answer is:')))
}

export const LETTERS = 'ABCDEFGH'

/** Where reports about built-in questions go. */
const REPORT_EMAIL = 'paulkenneth.ilan@gmail.com'

/** The small line above a question: "Safety · Dose limits" for the built-in bank, else type and section. */
export function questionLabel(q: ExamQuestionView): string {
  if (q.bankId) return [q.area, q.section].filter(Boolean).join(' · ')
  return `${TYPE_LABELS[q.type]} · ${q.section}`
}

/** A mail link that reports a problem with a built-in question, with its id and text filled in. */
export function ReportLink({ question, answer }: { question: ExamQuestionView; answer?: string }) {
  if (!question.bankId) return null
  const body = [
    `Question ${question.bankId}: ${question.prompt}`,
    ...(question.options ?? []).map((o, i) => `${LETTERS[i]}. ${o}`),
    ...(answer ? [`Answer shown: ${answer}`] : []),
    '',
    'What is wrong with it?',
    ''
  ].join('\n')
  const href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`RadReady question report: ${question.bankId}`)}&body=${encodeURIComponent(body)}`
  return (
    <a href={href} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted underline hover:text-ink">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 14V2.5h9l-2 3 2 3H3" />
      </svg>
      Report a problem with this question
    </a>
  )
}

export type ChoiceState = 'idle' | 'selected' | 'right' | 'wrong' | 'faded'

const CHOICE_ROW: Record<ChoiceState, string> = {
  idle: 'hover:bg-white',
  selected: 'bg-white shadow-[inset_0_0_0_2px_var(--color-ink)]',
  right: 'bg-white shadow-[inset_0_0_0_2px_var(--color-correct)]',
  wrong: 'bg-white shadow-[inset_0_0_0_2px_var(--color-incorrect)]',
  faded: 'text-muted'
}

const CHOICE_LETTER: Record<ChoiceState, string> = {
  idle: 'shadow-[inset_0_0_0_1px_var(--color-ink)]',
  selected: 'bg-ink text-paper',
  right: 'bg-correct text-white',
  wrong: 'bg-incorrect text-white',
  faded: 'shadow-[inset_0_0_0_1px_var(--color-muted)]'
}

/** One answer option, as in the mockup: a lettered square and the text, ringed when chosen or marked. */
export function ChoiceRow({
  letter,
  text,
  state,
  tag,
  checked,
  ...props
}: ComponentProps<'button'> & { letter: string; text: string; state: ChoiceState; tag?: string; checked: boolean }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: styled option rows behave as a radio group
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={`relative flex min-h-11 w-full items-start gap-4 border-t border-rule px-3 py-3.5 text-left last:border-b disabled:cursor-default ${CHOICE_ROW[state]}`}
      {...props}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center font-mono text-sm font-medium ${CHOICE_LETTER[state]}`}
      >
        {letter}
      </span>
      <span className="grow pt-1 text-[17px] leading-snug">{text}</span>
      {tag && (
        <span
          className={`shrink-0 self-center px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide text-white ${state === 'right' ? 'bg-correct' : 'bg-incorrect'}`}
        >
          {tag}
        </span>
      )}
    </button>
  )
}
