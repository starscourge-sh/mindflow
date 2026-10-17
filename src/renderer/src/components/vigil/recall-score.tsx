import { useState } from 'react'
import { chime } from '@/lib/sound'
import { useLive, vigil } from '@/lib/vigil'
import { toast } from './ui'
import { dayjs, num } from '../../../../main/dates'

/**
 * A score for the sitting, 1 to 5, given once the day's cards are done: how
 * well you felt you remembered, apart from each card's grade. Kept with the
 * tags of the cards it held, so each topic gets a line over time.
 */

const SAID = ['Barely any', 'A little', 'About half', 'Most of it', 'All of it'] as const
type Score = { at: string; score: number; cards: number; tags: string[] }

export function RecallScore({ ids }: { ids: string[] }): React.JSX.Element | null {
  const [given, setGiven] = useState<{ score: number; row: number } | null>(null)
  const scores = useLive(vigil.recallScores, [] as Score[])
  if (!ids.length) return null
  const give = async (score: number): Promise<void> => {
    if (given) await vigil.unsaveRecall(given.row)
    const row = await vigil.saveRecall(score, ids)
    chime('noted')
    setGiven({ score, row })
    toast(`Kept: ${score} out of 5`, () => void vigil.unsaveRecall(row).then(() => setGiven(null)))
  }
  return (
    <section data-recall-score className="flex w-full flex-col gap-2">
      <h3 className="text-body font-semibold text-foreground">How much did you remember, 1 to 5?</h3>
      <div role="radiogroup" aria-label="How much did you remember" className="flex flex-wrap gap-1.5">
        {SAID.map((label, at) => (
          <button key={label} type="button" role="radio" aria-checked={given?.score === at + 1} data-recall={at + 1} onClick={() => void give(at + 1)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-control transition-colors ${given?.score === at + 1 ? 'border-foreground bg-foreground text-background' : 'text-foreground hover:bg-accent'}`}>
            <strong className="font-semibold tabular-nums">{at + 1}</strong> {label}
          </button>
        ))}
      </div>
      <RecallChart scores={scores} />
    </section>
  )
}

/** Each topic's scores over time, a line a tag, the busiest first; every sitting together on top. */
function RecallChart({ scores }: { scores: Score[] }): React.JSX.Element | null {
  if (!scores.length) return null
  const tags = new Map<string, Score[]>()
  for (const one of scores) for (const tag of one.tags) tags.set(tag, [...(tags.get(tag) ?? []), one])
  const lines: [string, Score[]][] = [['Every sitting', scores], ...[...tags].sort((a, b) => b[1].length - a[1].length).slice(0, 6)]
  return (
    <div data-recall-chart className="mt-2 flex w-full flex-col gap-1.5">
      <p className="text-control font-medium text-foreground/80">Your recall over time, by topic</p>
      {lines.map(([name, list]) => {
        const last = list.slice(-12)
        const mean = list.reduce((sum, one) => sum + one.score, 0) / list.length
        return (
          <div key={name} data-recall-line={name} className="grid grid-cols-[8rem_minmax(0,1fr)_5.5rem] items-center gap-3">
            <span className="truncate text-control text-foreground">{name === 'Every sitting' ? name : `#${name}`}</span>
            <Spark points={last} />
            <span className="text-right text-control text-foreground tabular-nums">{mean.toFixed(1)} <span className="text-foreground/75">avg, {num(list.length)}</span></span>
          </div>
        )
      })}
    </div>
  )
}

/** Scores 1 to 5 as a line of dots, oldest left; each dot says its day and score. */
function Spark({ points }: { points: Score[] }): React.JSX.Element {
  const width = 160
  const height = 28
  const x = (at: number): number => (points.length === 1 ? width / 2 : 4 + (at * (width - 8)) / (points.length - 1))
  const y = (score: number): number => height - 4 - ((score - 1) / 4) * (height - 8)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-7 w-full max-w-40" role="img" aria-label={points.map((one) => `${dayjs(one.at).format('D MMM')}: ${one.score}`).join(', ')}>
      <line x1="0" x2={width} y1={y(3)} y2={y(3)} stroke="var(--border)" strokeDasharray="2 3" />
      {points.length > 1 && <polyline fill="none" stroke="var(--tt-color-text-blue)" strokeWidth="1.5" points={points.map((one, at) => `${x(at)},${y(one.score)}`).join(' ')} />}
      {points.map((one, at) => <circle key={at} cx={x(at)} cy={y(one.score)} r="2.5" fill="var(--tt-color-text-blue)"><title>{`${dayjs(one.at).format('D MMMM')}: ${one.score} of 5`}</title></circle>)}
    </svg>
  )
}
