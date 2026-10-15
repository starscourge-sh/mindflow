import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { realMove } from '@/lib/real-move'
import { EASE, useByKeys } from '@/lib/motion'
import { unloaded, useLive, vigil, type PeriodPage, type Task } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { Kbd, Tags, toast } from './ui'
import { taskName } from '@/lib/tasks'
import { onToday, shiftTo } from './tasks-view'
import { WeekFit } from './week-fit'
import { dated, dayjs, dayKey, num } from '../../../../main/dates'
import { PlaybookLink, SeasonPart } from './season'

/**
 * Closing the week, Close the day's Sunday-evening sibling, in three short
 * parts: what went well (the week's numbers, and a line kept as the week's
 * summary); what moves on (each task still open: Next week, Someday or Let
 * go, N, S, L); and the one thing for next week, kept as next week's theme.
 * Closing it closes the week's ring, with the season's chord.
 */

const DONE_KEY = 'close-week:done'
/** This week's Monday, the key its page and its closing go by. */
const mondayNow = (): string => dayKey(dayjs().startOf('week'))
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Open the pass, from ⌘K or the weekly digest on Home. */
export const openCloseWeek = (): void => void window.dispatchEvent(new CustomEvent('vigil:close-week'))

/** Whether the week is offered for closing: Sunday from the evening hour, not closed yet. */
export function weekDue(eveningAt = '18:00', now = new Date()): boolean {
  const [h, m] = eveningAt.split(':').map(Number)
  return now.getDay() === 0 && now.getHours() * 60 + now.getMinutes() >= h * 60 + (m || 0) && !weekClosed()
}
export const weekClosed = (): boolean => read(DONE_KEY) === mondayNow()

/** The pass, over the window, when asked for. */
export function CloseWeekSheet(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const ask = (): void => (chime('season'), setOpen(true))
    window.addEventListener('vigil:close-week', ask)
    return () => window.removeEventListener('vigil:close-week', ask)
  }, [])
  if (!open) return null
  return <Pass onClose={() => setOpen(false)} />
}

type Choice = 'next' | 'someday' | 'bin'
const CHOICES: { id: Choice; label: string; key: string }[] = [
  { id: 'next', label: 'Next week', key: 'N' },
  { id: 'someday', label: 'Someday', key: 'S' },
  { id: 'bin', label: 'To the Bin', key: 'B' }
]
type Week = { caught: number; kept: number; reviewed: number; finished: number }

function Pass({ onClose }: { onClose: () => void }): React.JSX.Element {
  // Opened by a key it is simply there, read once: a click inside never plays the entrance after.
  const keyed = useByKeys(true)
  const monday = mondayNow()
  const nextMonday = dayKey(dayjs(monday).add(7, 'day'))
  const tasks = useLive(vigil.tasks, [] as Task[])
  const week = useLive(() => window.api.vigil('digest:week') as Promise<Week>, null as Week | null)
  const page = useLive(() => vigil.period(`week:${monday}`), null as PeriodPage | null, [monday])
  const ahead = useLive(() => vigil.period(`week:${nextMonday}`), null as PeriodPage | null, [nextMonday])
  // What was open when the pass opened: the list stays put as you choose.
  const [still, setStill] = useState<Task[] | null>(null)
  useEffect(() => {
    if (still || unloaded(tasks)) return
    setStill(tasks.filter(onToday))
  }, [tasks, still])
  const open = useMemo(() => still ?? [], [still])
  const [chosen, setChosen] = useState<Record<string, Choice>>({})
  const [cursor, setCursor] = useState(0)
  const [well, setWell] = useState<string | null>(null)
  const [one, setOne] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  // Monday is day 1: the days of this week gone by, today counted.
  const gone = ((new Date().getDay() + 6) % 7) + 1

  const choose = async (task: Task, choice: Choice): Promise<void> => {
    const was = chosen[task.id]
    if (was === choice) return chime('nope')
    if (was) await vigil.saveTask(task.id, { status: 'open', due: task.dueAt, plan: task.planFor })
    if (choice === 'bin') await vigil.saveTask(task.id, { status: 'dropped' })
    else if (choice === 'someday') await vigil.saveTask(task.id, { due: null, plan: 'someday' })
    // Next Monday, at the time it had.
    else await vigil.saveTask(task.id, { due: shiftTo(8 - gone, task.dueAt) })
    chime(choice === 'bin' ? 'away' : choice === 'someday' ? 'later' : 'move')
    setChosen((all) => ({ ...all, [task.id]: choice }))
    const next = open.findIndex((other, at) => at > open.indexOf(task) && !chosen[other.id] && other.id !== task.id)
    if (next >= 0) setCursor(next)
  }
  const save = (period: string, key: string, text: string | null): Promise<unknown> | null =>
    text === null ? null : vigil.savePeriod(period, { fields: { [key]: text.trim() || null } })
  const finish = (): void => {
    if (closing) return
    setClosing(true)
    void Promise.all([save(`week:${monday}`, 'summary', well), save(`week:${nextMonday}`, 'theme', one)]).then(() => {
      try {
        localStorage.setItem(DONE_KEY, monday)
      } catch {
        // Offered again, then.
      }
      window.dispatchEvent(new CustomEvent('vigil:week-closed'))
      // The ring closes first, with the season's chord; then the sheet goes.
      chime('season')
      const thing = (one ?? ahead?.fields.theme ?? '').trim()
      setTimeout(() => (onClose(), toast(thing ? `Week closed. Next week: ${thing}` : 'Week closed')), calm() ? 150 : 900)
    })
  }
  const close = (): void => (chime('fold'), onClose())

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') return void (event.preventDefault(), event.stopImmediatePropagation(), close())
      if (event.key === 'Enter' && event.metaKey) return void (event.preventDefault(), finish())
      const field = (document.activeElement as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')
      if (field || event.metaKey || event.ctrlKey || event.altKey) return
      const task = open[cursor]
      if (event.key === 'j' || event.key === 'ArrowDown') (event.preventDefault(), setCursor((at) => Math.min(open.length - 1, at + 1)))
      else if (event.key === 'k' || event.key === 'ArrowUp') (event.preventDefault(), setCursor((at) => Math.max(0, at - 1)))
      else if (task && ['n', 's', 'b', 'd'].includes(event.key.toLowerCase())) (event.preventDefault(), void choose(task, ({ n: 'next', s: 'someday', b: 'bin', d: 'bin' } as const)[event.key.toLowerCase() as 'n' | 's' | 'b' | 'd']))
      else return
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const heading = 'text-control font-semibold tracking-[0.01em] text-foreground'
  const parts: [string, number][] = week ? [['caught', week.caught], ['kept', week.kept], ['reviewed', week.reviewed], ['finished', week.finished]] : []
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[6vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Close the week"
        data-close-week
        className={`flex max-h-[86vh] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <WeekRing gone={gone} closed={closing} />
          <h2 className="font-heading text-heading font-semibold text-foreground">Close the week</h2>
          <span className="text-meta text-muted-foreground">{dated(monday)} to {dated(dayjs(monday).add(6, 'day'))}</span>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-4">
          {/* Once a quarter: the season's part first. */}
          <SeasonPart />
          {/* 1. What went well. */}
          <section data-close-well>
            <h3 className={heading}>What went well</h3>
            {parts.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                {parts.map(([label, n]) => (
                  <span key={label} className="flex items-baseline gap-1.5">
                    <span className="font-heading text-[1.375rem] leading-none font-semibold text-foreground tabular-nums">{num(n)}</span>
                    <span className="text-control text-muted-foreground">{label}</span>
                  </span>
                ))}
              </p>
            )}
            <input value={well ?? page?.fields.summary ?? ''} onChange={(event) => setWell(event.target.value)} placeholder="What went well, in a line" aria-label="What went well"
              className="mt-2.5 w-full rounded-md border bg-transparent px-2.5 py-1.5 text-body text-foreground outline-none placeholder:text-muted-foreground focus:border-ring" />
            <p className="mt-1 text-control text-muted-foreground">Kept as the week's summary, on its page.</p>
          </section>

          {/* 2. What moves on. */}
          <section data-close-moves>
            <h3 className={heading}>What moves on <span className="font-normal text-muted-foreground">{open.length ? `${num(Object.keys(chosen).length)} of ${num(open.length)} decided` : ''}</span></h3>
            {open.length ? (
              <ul className="mt-1.5 flex flex-col">
                {open.map((task, at) => (
                  <li key={task.id} data-close-task={task.id} data-cursor={at === cursor || undefined} onMouseMove={(event) => realMove(event) && setCursor(at)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${at === cursor ? 'bg-accent/50' : ''}`}>
                    <span className={`line-clamp-2 min-w-0 flex-auto text-body [overflow-wrap:anywhere] ${chosen[task.id] === 'bin' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{taskName(task.title).text}</span>
                    <Tags tags={taskName(task.title).tags} go={false} />
                    <span className="flex shrink-0 items-center gap-1">
                      {CHOICES.map((choice) => (
                        <button key={choice.id} type="button" aria-pressed={chosen[task.id] === choice.id} onClick={() => void choose(task, choice.id)}
                          className={`flex h-6 items-center gap-1 rounded-md px-2 text-control transition-colors ${chosen[task.id] === choice.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                          {choice.label}<kbd className={`font-sans text-[0.6875rem] ${at === cursor ? 'opacity-80' : 'opacity-45'}`}>{choice.key}</kbd>
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : still && <p className="mt-1 text-body text-muted-foreground">Nothing left open this week. A clean finish.</p>}
          </section>

          {/* Does next week fit: each day's meetings and tasks against the working day. */}
          <WeekFit monday={nextMonday} />

          {/* 3. The one thing for next week. */}
          <section data-close-one>
            <h3 className={heading}>The one thing for next week</h3>
            <input value={one ?? ahead?.fields.theme ?? ''} onChange={(event) => setOne(event.target.value)} placeholder="If only one thing gets done, it is…" aria-label="The one thing for next week"
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), finish())}
              className="mt-1.5 w-full rounded-md border bg-transparent px-2.5 py-1.5 text-body text-foreground outline-none placeholder:text-muted-foreground focus:border-ring" />
            <p className="mt-1 text-control text-muted-foreground">It heads next week's page.</p>
          </section>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <PlaybookLink onLeave={onClose} />
          <span className="flex-1" />
          <Button size="sm" onClick={finish} disabled={closing}>Close the week <Kbd>⌘↵</Kbd></Button>
        </div>
      </div>
    </div>
  )
}

const calm = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** The week as a ring: a seventh a day, the days gone by drawn, closed all the way round once the week is. */
function WeekRing({ gone, closed }: { gone: number; closed: boolean }): React.JSX.Element {
  const r = 9
  const around = 2 * Math.PI * r
  return (
    <svg data-week-ring={closed ? 'closed' : 'open'} viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
      <motion.circle cx="12" cy="12" r={r} fill="none" stroke="var(--tt-brand-color-400)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={around}
        initial={false} animate={{ strokeDashoffset: around * (1 - (closed ? 1 : Math.min(gone, 6.4) / 7)) }}
        transition={{ duration: calm() ? 0 : 0.7, ease: EASE }} />
    </svg>
  )
}
