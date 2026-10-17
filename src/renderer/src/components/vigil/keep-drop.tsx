import { chime } from '@/lib/sound'
import { useLive, vigil, type Item, type PeriodPage, type Settings, type Task } from '@/lib/vigil'
import { taskName } from '@/lib/tasks'
import { Island, toast } from './ui'
import { openOnes } from './goals-view'
import { isDaily, overCap } from '../../../../main/cadence'
import { num } from '../../../../main/dates'

/**
 * Keep or drop: in the periodic review, each habit (a routine) and each goal
 * asked once, at its own cadence. Habits kept every day come up in the week's
 * review; slower habits and goals in the month's, so nothing is asked twice.
 * Past the cap on active ones (Settings), a soft line says so; nothing is
 * stopped. Drop sends a routine to the Bin and lets a goal go, each with Undo.
 */
export function KeepOrDrop({ scale, period, page }: { scale: 'week' | 'month'; period: string; page: PeriodPage | null }): React.JSX.Element | null {
  const tasks = useLive(vigil.tasks, [] as Task[])
  const goals = openOnes(useLive(() => vigil.items('goal'), [] as Item[], [], ['item']))
  const settings = useLive(vigil.settings, null as Settings | null)
  const routines = tasks.filter((task) => task.status === 'open' && !!task.recurrence)
  const daily = routines.filter((task) => isDaily(task.recurrence))
  type Row = { id: string; name: string; how: string; type: 'routine' | 'goal' }
  const rows: Row[] = scale === 'week'
    ? daily.map((task) => ({ id: task.id, name: taskName(task.title).text, how: task.recurrence!, type: 'routine' }))
    : [
        ...routines.filter((task) => !isDaily(task.recurrence)).map((task) => ({ id: task.id, name: taskName(task.title).text, how: task.recurrence!, type: 'routine' as const })),
        ...goals.map((goal) => ({ id: goal.id, name: goal.title, how: 'a goal', type: 'goal' as const }))
      ]
  const active = routines.length + goals.length
  const cap = settings?.activeCap ?? 7
  const over = overCap(active, cap)
  const kept = new Set<string>(JSON.parse(page?.fields.kept ?? '[]') as string[])
  if (!page || (!rows.length && !over)) return null
  const keep = (row: Row): void => {
    const on = !kept.has(row.id)
    chime(on ? 'pin' : 'off')
    const next = on ? [...kept, row.id] : [...kept].filter((id) => id !== row.id)
    void vigil.savePeriod(period, { fields: { kept: next.length ? JSON.stringify(next) : null } })
  }
  const drop = async (row: Row): Promise<void> => {
    if (row.type === 'routine') {
      await vigil.saveTask(row.id, { status: 'dropped' })
      chime('away')
      toast(`“${row.name}” is in the Bin`, () => void vigil.saveTask(row.id, { status: 'open' }))
    } else {
      await vigil.closeGoal(row.id, 'let go')
      chime('away')
      toast(`“${row.name}” let go`, () => void vigil.reopenGoal(row.id))
    }
  }
  return (
    <section data-keep-drop={scale} className="mt-8">
      <h2 className="mb-1 text-body font-semibold text-foreground">Keep or drop</h2>
      <p className="mb-2 text-body text-foreground/85">
        {scale === 'week' ? 'Your daily habits, once a week: still worth it?' : 'Your slower habits and your goals, once a month: still worth it?'}
        {scale === 'month' && daily.length > 0 && ` The ${num(daily.length)} daily ${daily.length === 1 ? 'one is' : 'ones are'} asked in the week's review instead.`}
      </p>
      {over > 0 && (
        <p data-over-cap className="mb-3 rounded-lg border px-3 py-2 text-body text-foreground" style={{ borderColor: 'color-mix(in oklab, var(--tt-color-text-orange) 45%, transparent)' }}>
          <strong className="font-semibold" style={{ color: 'var(--tt-color-text-orange)' }}>{num(active)} going at once,</strong> {num(over)} past the {num(cap)} you set. Dropping one or two leaves more room for the rest.
        </p>
      )}
      {rows.length > 0 && (
        <Island>
          {rows.map((row) => (
            <div key={row.id} data-keep-row={row.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-foreground">{row.name}</span>
                <span className="block text-control text-foreground/75">{row.how}</span>
              </span>
              <button type="button" aria-pressed={kept.has(row.id)} onClick={() => keep(row)}
                className={`h-7 rounded-md px-2.5 text-control font-medium transition-colors ${kept.has(row.id) ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent'}`}>
                {kept.has(row.id) ? 'Kept' : 'Keep'}
              </button>
              <button type="button" onClick={() => void drop(row)} className="h-7 rounded-md px-2.5 text-control font-medium text-[var(--tt-color-text-red)] transition-colors hover:bg-accent">
                Drop
              </button>
            </div>
          ))}
        </Island>
      )}
    </section>
  )
}
