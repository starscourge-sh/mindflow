import { useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { DaysHeatmap } from './days-heatmap'
import { N, Section } from './stats-view'
import { num, plural } from '../../../../main/dates'

type Written = {
  today: number
  week: number
  lastWeek: number
  total: number
  daysWritten: number
  days: { day: string; words: number }[]
  notes: { id: string; type: string; title: string; private: boolean; words: number }[]
}

/** The made-up numbers for the example Stats page. */
const EXAMPLE: Written = {
  today: 640, week: 2180, lastWeek: 1710, total: 48210, daysWritten: 96,
  days: Array.from({ length: 120 }, (_, at) => ({ day: new Date(Date.now() - at * 86400000).toISOString().slice(0, 10), words: (at * 37) % 5 === 0 ? 0 : ((at * 131) % 900) + 40 })),
  notes: [{ id: 'a', type: 'article', title: 'Why old movies feel real', private: false, words: 420 }, { id: 'b', type: 'day', title: 'Today', private: false, words: 220 }]
}

const NAMED: Record<string, string> = { day: 'Journal', period: 'A week or month page' }

/**
 * Words written: today, this week against the same days of last week, and in
 * all; today's notes, each with the words it gained; and a year of writing
 * days, shaded by how much. Said as a record, never a target: no goal, no
 * run to keep.
 */
export function WritingSection({ example, onOpen }: { example: boolean; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const real = useLive(() => window.api.haligtree('words:stats') as Promise<Written>, null as Written | null)
  const words = example ? EXAMPLE : real
  useReading(!words)
  if (!words) return null
  const change = words.lastWeek ? Math.round(((words.week - words.lastWeek) / words.lastWeek) * 100) : null
  const amount = Object.fromEntries(words.days.map((one) => [one.day, one.words]))
  return (
    <Section title="Writing" big={{ value: num(words.today), label: words.today === 1 ? 'word written today' : 'words written today' }}>
      <p data-words-week>
        This week you wrote <N>{plural(words.week, 'word', 'words')}</N>
        {change === null ? (words.week ? ', with nothing on the same days last week to set it against.' : '.') : change === 0 ? ', the same as by this day last week.' : <>, {change > 0 ? 'up' : 'down'} <N>{`${Math.abs(change)}%`}</N> on the same days last week.</>}{' '}
        In all, <N>{plural(words.total, 'word', 'words')}</N> on <N>{plural(words.daysWritten, 'day', 'days')}</N>.
      </p>
      {words.notes.length > 0 && (
        <ul data-words-notes className="flex flex-col gap-1">
          {words.notes.map((one) => (
            <li key={one.id} className="flex items-baseline gap-3 text-body">
              {onOpen && one.type !== 'day' && one.type !== 'period' ? (
                <button type="button" onClick={() => onOpen(one.type, one.id)} className={`-my-0.5 min-w-0 flex-1 truncate py-0.5 text-left text-foreground hover:underline ${one.private ? 'private-text' : ''}`}>{one.title || 'Untitled'}</button>
              ) : <span className={`min-w-0 flex-1 truncate text-foreground ${one.private ? 'private-text' : ''}`}>{NAMED[one.type] ?? (one.title || 'Untitled')}</span>}
              <span className="shrink-0 font-semibold text-foreground tabular-nums">+{num(one.words)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* The newest weeks always in view: in a narrow window it is the oldest that go past the edge. */}
      <div data-words-year className="flex justify-end overflow-hidden"><DaysHeatmap amount={amount} weeks={52} className="shrink-0" /></div>
      <p className="text-control">Counted as you write: words you add to a note, a gem, a page or a day's page. Words taken out never count against you.</p>
    </Section>
  )
}
