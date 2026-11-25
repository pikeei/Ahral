import type { ComponentProps, ReactNode } from 'react'
import type { ImportStage, QuestionType } from '../../shared/api'

/* Small shared pieces of UI and wording. */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>{children}</section>
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
  const color = percent >= 80 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(percent, 2)}%` }} />
    </div>
  )
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  cloze: 'Fill in the blank',
  'mcq-term': 'Pick the term',
  'mcq-definition': 'Pick the definition'
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
