import type { ExamSummary, QuestionType } from '../../shared/api'
import { Button, Card, explanationLines, ScoreBar, scoreColor, TYPE_LABELS } from './ui'

interface Props {
  summary: ExamSummary
  onRetake: () => void
  onDone: () => void
}

const STATUS_LABELS = { correct: 'Correct', almost: 'Almost', wrong: 'Wrong', unanswered: 'Skipped' } as const
const STATUS_STYLES = {
  correct: 'bg-emerald-100 text-emerald-800',
  almost: 'bg-amber-100 text-amber-800',
  wrong: 'bg-red-100 text-red-800',
  unanswered: 'bg-slate-100 text-slate-700'
} as const

export function Results({ summary, onRetake, onDone }: Props) {
  const types = Object.entries(summary.byType) as [QuestionType, { correct: number; total: number }][]

  return (
    <div className="space-y-6">
      <Card className="text-center">
        <p className="text-sm text-slate-500">Your score</p>
        <p className={`mt-1 text-5xl font-bold ${scoreColor(summary.percent)}`} data-testid="score">
          {summary.percent}%
        </p>
        <p className="mt-2 text-slate-600">
          {summary.correct} of {summary.total} correct
          {summary.answered < summary.total && ` · ${summary.total - summary.answered} skipped`}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Button variant="secondary" onClick={onRetake}>
            Retake these questions
          </Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </Card>

      {summary.weakSections.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <h3 className="font-semibold">Review these sections</h3>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {summary.weakSections.map((s) => (
              <li key={s.label}>
                {s.label}: {s.correct}/{s.total}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <h3 className="font-semibold">By question type</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {types.map(([type, t]) => (
              <li key={type}>
                <div className="flex justify-between">
                  <span>{TYPE_LABELS[type]}</span>
                  <span>
                    {t.correct}/{t.total}
                  </span>
                </div>
                <ScoreBar percent={(100 * t.correct) / t.total} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="font-semibold">By section</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {summary.bySection.map((s) => (
              <li key={s.label}>
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate" title={s.label}>
                    {s.label}
                  </span>
                  <span className="shrink-0">
                    {s.correct}/{s.total}
                  </span>
                </div>
                <ScoreBar percent={s.percent} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold">Review your answers</h3>
        <ol className="mt-3 space-y-4">
          {summary.review.map((r) => (
            <li key={r.position} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-line">
                  <span className="text-slate-400">{r.position + 1}. </span>
                  {r.prompt}
                </p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
              <p className="mt-1 text-sm">
                <span className="text-slate-500">Your answer: </span>
                {r.given ?? <em className="text-slate-400">none</em>}
              </p>
              {!r.correct && (
                <p className="text-sm">
                  <span className="text-slate-500">Answer: </span>
                  <span className="font-medium">{r.answer}</span>
                </p>
              )}
              <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                {explanationLines(r.lines, true).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
