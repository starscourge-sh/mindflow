import { JournalQuestions } from './journal'
import { useReading } from '@/lib/reads-in'
import { HabitTicks } from './habits'
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { chime, tear } from '@/lib/sound'
import { realMove } from '@/lib/real-move'
import { useByKeys } from '@/lib/motion'
import { notes, type Day } from '@/lib/notes'
import { unloaded, useLive, haligtree, when, type Settings, type Task } from '@/lib/haligtree'
import { placed, taskName } from '@/lib/tasks'
import { frogOn } from '@/lib/day-plan'
import { Button } from '@/components/ui/button'
import { Kbd, Tags, toast } from './ui'
import { shiftTo } from './tasks-view'
import { CloseWeekSheet } from './close-week'
import { DayLog } from './day-log'
import { dayjs, dayKey, num, startOfDay } from '../../../../main/dates'
import { TomorrowLines, TomorrowWhy, dayAfter, nightOf, readNight, takeBack, useNight } from './tomorrow-lines'
import { APP_NAME } from '../../../../main/name'

/**
 * Closing the day, an evening pass in five short parts: what got done; each
 * task still open sent to Tomorrow, moved to Next week, or moved to the Bin (T, N, B or D);
 * anything on your mind for tomorrow, a task a line (tomorrow-lines.tsx);
 * one line for today's page; and tomorrow's first task, the frog, which leads
 * Today and the day brief in the morning. Offered on Home once an evening
 * after the hour Settings gives, and from ⌘K any time.
 */

const DONE_KEY = 'close-day:done'
const AWAY_KEY = 'close-day:away'
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Offered again, then.
  }
}

/** Whether today has been closed already (in the small hours, the evening before). */
export const dayClosed = (): boolean => read(DONE_KEY) === nightOf()

/** Open the pass, from ⌘K or the offer on Home. */
export const openCloseDay = (): void => void window.dispatchEvent(new CustomEvent('haligtree:close-day'))

/** Whether the evening offer is due: on, past its hour, and not closed or put away today. */
export function offerDue(settings: Pick<Settings, 'closeDay' | 'closeDayAt'> | null, now = new Date()): boolean {
  if (!settings || settings.closeDay === false) return false
  const [h, m] = (settings.closeDayAt ?? '18:00').split(':').map(Number)
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + (m || 0)) return false
  const today = dayKey(now)
  return read(DONE_KEY) !== today && read(AWAY_KEY) !== today
}

/** On Home in the evening, once: a calm line offering the pass. */
export function CloseDayOffer(): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  useReading(!settings)
  const [, tick] = useState(0)
  useEffect(() => {
    const every = setInterval(() => tick((n) => n + 1), 60_000)
    const again = (): void => tick((n) => n + 1)
    window.addEventListener('haligtree:day-closed', again)
    return () => (clearInterval(every), window.removeEventListener('haligtree:day-closed', again))
  }, [])
  if (!offerDue(settings)) return null
  const away = (): void => {
    chime('fold')
    write(AWAY_KEY, dayKey())
    tick((n) => n + 1)
  }
  return (
    <section data-close-day-offer aria-label="Close the day" className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3">
      <p className="min-w-0 flex-1 text-body text-muted-foreground">
        <strong className="font-semibold text-foreground">It is evening.</strong> Close the day: see what got done, decide where the rest goes and pick the first thing for tomorrow.
      </p>
      <Button size="sm" onClick={() => openCloseDay()}>Close the day</Button>
      <button type="button" aria-label="Not today" onClick={away} className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </section>
  )
}

type Choice = 'tomorrow' | 'move' | 'bin'
const CHOICES: { id: Choice; label: string; key: string }[] = [
  { id: 'tomorrow', label: 'Tomorrow', key: 'T' },
  { id: 'move', label: 'Next week', key: 'N' },
  { id: 'bin', label: 'To the Bin', key: 'B' }
]

/** Today in four numbers, since midnight: the weekly digest's, for one day. */
type Today = { caught: number; kept: number; reviewed: number; finished: number }
const many = (n: number, one: string, more: string): React.JSX.Element => <><strong className="font-semibold tabular-nums">{num(n)}</strong> {n === 1 ? one : more}</>

/**
 * Your day in Haligtree, in two lines, looking back before looking ahead, the
 * way Dia's daily wrap does but with nothing but counting: what you caught
 * and saved, then what you reviewed and finished.
 */
function DayInHaligtree({ day }: { day: Today }): React.JSX.Element {
  const { caught, kept, reviewed, finished } = day
  const first = caught && kept ? <>You caught {many(caught, 'thing', 'things')} and saved {many(kept, 'thing to keep', 'things to keep')}.</>
    : caught ? <>You caught {many(caught, 'thing', 'things')}.</>
    : kept ? <>You saved {many(kept, 'thing to keep', 'things to keep')}.</>
    : <>Nothing caught or saved today.</>
  const second = reviewed && finished ? <>You reviewed {many(reviewed, 'card', 'cards')} and finished {many(finished, 'task', 'tasks')}.</>
    : reviewed ? <>You reviewed {many(reviewed, 'card', 'cards')}.</>
    : finished ? <>You finished {many(finished, 'task', 'tasks')}.</>
    : <>No reviews or tasks finished today.</>
  return (
    <section data-close-look aria-label={`Your day in ${APP_NAME}`}>
      <h3 className="text-control font-semibold tracking-[0.01em] text-foreground">Your day in {APP_NAME}</h3>
      <p data-close-look-line className="mt-1 text-body text-foreground">{first}</p>
      <p data-close-look-line className="text-body text-foreground">{second}</p>
    </section>
  )
}

/** A paragraph added to the foot of a day's page. */
function withLine(body: unknown, line: string): unknown {
  const doc = body && typeof body === 'object' && Array.isArray((body as { content?: unknown[] }).content) ? (body as { type: string; content: unknown[] }) : { type: 'doc', content: [] }
  const content = doc.content.filter((node, at, all) => !(at === all.length - 1 && (node as { type?: string; content?: unknown[] }).type === 'paragraph' && !(node as { content?: unknown[] }).content?.length))
  return { ...doc, content: [...content, { type: 'paragraph', content: [{ type: 'text', text: line }] }] }
}

/** The pass itself, over the window. */
export function CloseDaySheet(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const ask = (): void => (chime('open'), setOpen(true))
    window.addEventListener('haligtree:close-day', ask)
    return () => window.removeEventListener('haligtree:close-day', ask)
  }, [])
  // The week's own closing lives beside the day's, wherever the day's is.
  return (
    <>
      <CloseWeekSheet />
      {open && <Pass onClose={() => setOpen(false)} />}
    </>
  )
}

function Pass({ onClose }: { onClose: () => void }): React.JSX.Element {
  // Opened by a key it is simply there, read once: a click inside never plays the entrance after.
  const keyed = useByKeys(true)
  // The day being closed: in the small hours, still the evening before, and
  // “tomorrow” the day you wake into (the same night Today's box writes for).
  const night = useMemo(() => nightOf(), [])
  const today = night
  const tomorrow = dayAfter(night)
  /** Days from the calendar date now to tomorrow: 1 in the evening, 0 after midnight. */
  const ahead = dayjs(tomorrow).diff(dayjs().startOf('day'), 'day')
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const settings = useLive(haligtree.settings, null as Settings | null)
  const day = useLive(() => notes.day(today), null as Day | null, [today])
  const counted = useLive(() => window.api.haligtree<Today>('digest:day'), null as Today | null)
  // What each open task was when the pass opened: the list stays put as you choose.
  const [still, setStill] = useState<Task[] | null>(null)
  useEffect(() => {
    if (still || unloaded(tasks)) return
    setStill(tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < startOfDay(1, today)))
  }, [tasks, still])
  const open = useMemo(() => still ?? [], [still])
  const [chosen, setChosen] = useState<Record<string, Choice>>({})
  const [cursor, setCursor] = useState(0)
  const [line, setLine] = useState('')
  const [lineKept, setLineKept] = useState(false)
  const frog = frogOn(settings, tomorrow)
  // Tonight's lines for tomorrow: the same list Today's box writes to. Those
  // there when the pass opened stay if it is undone; the ones written here go.
  const [already] = useState(() => readNight(night).map((one) => one.id))
  const [skipped, setSkipped] = useState(false)
  const live = new Set(tasks.filter((task) => task.status !== 'dropped').map((task) => task.id))
  const thoughts = useNight(night).filter((one) => live.has(one.id))

  // Tomorrow's candidates: what you just sent there, and what was already on it.
  const fresh = new Map(tasks.map((task) => [task.id, task]))
  const forTomorrow = [
    ...open.filter((task) => chosen[task.id] === 'tomorrow').map((task) => fresh.get(task.id) ?? task),
    ...tasks.filter((task) => task.status === 'open' && !open.some((one) => one.id === task.id) && dayKey(new Date(placed(task) ?? 0)) === tomorrow)
  ]

  const choose = async (task: Task, choice: Choice): Promise<void> => {
    const was = chosen[task.id]
    if (was === choice) return chime('nope')
    // Back to how it was first, then the new choice: changing your mind is free.
    if (was) await haligtree.saveTask(task.id, { status: 'open', due: task.dueAt, plan: task.planFor })
    if (choice === 'bin') await haligtree.saveTask(task.id, { status: 'dropped' })
    else await haligtree.saveTask(task.id, { due: shiftTo(choice === 'tomorrow' ? ahead : ahead + 6, task.dueAt) })
    choice === 'bin' ? tear() : chime(choice === 'tomorrow' ? 'later' : 'move')
    setChosen((all) => ({ ...all, [task.id]: choice }))
    // A frog moved to the Bin or past tomorrow is no longer tomorrow's.
    if (frog === task.id && choice !== 'tomorrow') void haligtree.setSettings({ frog: null })
    const next = open.findIndex((one, at) => at > open.indexOf(task) && !chosen[one.id] && one.id !== task.id)
    if (next >= 0) setCursor(next)
  }
  // Every one not decided yet, to tomorrow at once: the usual end of a written day. One undo for all.
  const carry = async (): Promise<void> => {
    const rest = open.filter((task) => !chosen[task.id])
    if (!rest.length) return chime('nope')
    await Promise.all(rest.map((task) => haligtree.saveTask(task.id, { due: shiftTo(ahead, task.dueAt) })))
    chime('later')
    setChosen((all) => ({ ...all, ...Object.fromEntries(rest.map((task) => [task.id, 'tomorrow' as Choice])) }))
    toast(rest.length === 1 ? 'Carried to tomorrow' : `${num(rest.length)} carried to tomorrow`, () => {
      void Promise.all(rest.map((task) => haligtree.saveTask(task.id, { due: task.dueAt, plan: task.planFor })))
      setChosen((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !rest.some((task) => task.id === id))))
    })
  }
  const pickFrog = (task: Task): void => {
    const off = frog === task.id
    void haligtree.setSettings({ frog: off ? null : { id: task.id, day: tomorrow } })
    chime(off ? 'off' : 'pin')
  }
  const keepLine = async (): Promise<void> => {
    const text = line.trim()
    if (!text) return
    const now = await notes.day(today)
    await notes.saveDay(today, { body: withLine(now.body, text) })
    chime('noted')
    setLineKept(true)
  }
  // A line typed and not yet kept is kept on the way out, however the sheet is left.
  const keepTyped = (): void => void (!lineKept && line.trim() && keepLine())
  const finish = (): void => {
    keepTyped()
    write(DONE_KEY, today)
    window.dispatchEvent(new CustomEvent('haligtree:day-closed'))
    chime('settled')
    onClose()
    // Read once the sheet has gone, so a line typed and left in the box is counted too.
    setTimeout(() => {
      const ids = new Set(tasks.filter((task) => task.status !== 'dropped').map((task) => task.id))
      const all = readNight(night).filter((one) => ids.has(one.id) || !already.includes(one.id))
      const fresh = all.filter((one) => !already.includes(one.id)).map((one) => one.id)
      const things = all.length ? `${num(all.length)} ${all.length === 1 ? 'thing' : 'things'} for tomorrow` : ''
      const said = frog ? `Day closed. ${things ? `${things}, and it` : 'Tomorrow'} starts with the one you picked` : `Day closed${things ? `. ${things}` : ''}`
      // One Undo: the day open again, and the lines written in this pass taken back out.
      toast(said, () => {
        write(DONE_KEY, '')
        window.dispatchEvent(new CustomEvent('haligtree:day-closed'))
        void takeBack(night, fresh)
      })
    }, 120)
  }
  const close = (): void => (keepTyped(), chime('fold'), onClose())

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') return void (event.preventDefault(), event.stopImmediatePropagation(), close())
      if (event.key === 'Enter' && event.metaKey) return void (event.preventDefault(), finish())
      const field = (document.activeElement as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')
      if (field || event.metaKey || event.ctrlKey || event.altKey) return
      const task = open[cursor]
      if (event.key === 'j' || event.key === 'ArrowDown') (event.preventDefault(), setCursor((at) => Math.min(open.length - 1, at + 1)))
      else if (event.key === 'k' || event.key === 'ArrowUp') (event.preventDefault(), setCursor((at) => Math.max(0, at - 1)))
      else if (task && ['t', 'n', 'b', 'd'].includes(event.key.toLowerCase())) (event.preventDefault(), void choose(task, ({ t: 'tomorrow', n: 'move', b: 'bin', d: 'bin' } as const)[event.key.toLowerCase() as 't' | 'n' | 'b' | 'd']))
      else return
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const done = day?.done ?? []
  const heading = 'text-control font-semibold tracking-[0.01em] text-foreground'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[6vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Close the day"
        data-close-day
        className={`flex max-h-[86vh] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-baseline gap-2 border-b px-5 py-3">
          <h2 className="font-heading text-heading font-semibold text-foreground">Close the day</h2>
          <span className="text-meta text-muted-foreground">{dayjs().format('dddd D MMMM')}</span>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-4">
          {/* 0. The day looked back on, in two lines. */}
          {counted && <DayInHaligtree day={counted} />}
          {/* Done against left, in one line, before the lists that say which. */}
          {done.length + open.length > 0 && (
            <p data-close-tally className="text-heading font-semibold tabular-nums" style={{ color: !open.length ? 'var(--tt-color-text-green)' : 'var(--foreground)' }}>
              {num(done.length)} of {num(done.length + open.length)} done
              {open.length > 0 && <span className="font-normal text-muted-foreground">, {num(open.length)} left</span>}
            </p>
          )}
          {/* 1. What got done. */}
          <section data-close-done>
            <h3 className={heading}>What got done</h3>
            {done.length ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {done.slice(0, 6).map((one) => <li key={one.id} className="truncate text-body text-foreground"><span aria-hidden className="mr-2 text-[var(--tt-color-text-green)]">✓</span>{taskName(one.title).text}</li>)}
                {done.length > 6 && <li className="text-control text-muted-foreground">and {num(done.length - 6)} more</li>}
              </ul>
            ) : day && <p className="mt-1 text-body text-muted-foreground">No tasks ticked off today. Days like that count too.</p>}
          </section>

          {/* 2. Each open task: Tomorrow, Next week or the Bin. */}
          <section data-close-open>
            <div className="flex items-center gap-2">
              <h3 className={heading}>Still open <span className="font-normal text-muted-foreground">{open.length && Object.keys(chosen).length ? `${num(Object.keys(chosen).length)} of ${num(open.length)} decided` : ''}</span></h3>
              <span className="flex-1" />
              {open.some((task) => !chosen[task.id]) && <Button data-close-carry size="sm" variant="secondary" onClick={() => void carry()}>Carry the rest to tomorrow</Button>}
            </div>
            {open.length ? (
              <ul className="mt-1.5 flex flex-col">
                {open.map((task, at) => (
                  <li key={task.id} data-close-task={task.id} data-cursor={at === cursor || undefined} onMouseMove={(event) => realMove(event) && setCursor(at)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${at === cursor ? 'bg-accent/50' : ''}`}>
                    <span className={`line-clamp-2 min-w-0 flex-auto text-body [overflow-wrap:anywhere] ${chosen[task.id] === 'bin' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{taskName(task.title).text}</span>
                    <Tags tags={taskName(task.title).tags} go={false} />
                    <span className="flex shrink-0 items-center gap-1">
                      {CHOICES.map((one) => (
                        <button key={one.id} type="button" aria-pressed={chosen[task.id] === one.id} onClick={() => void choose(task, one.id)}
                          className={`flex h-6 items-center gap-1 rounded-md px-2 text-control transition-colors ${chosen[task.id] === one.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                          {one.label}<kbd className={`font-sans text-[0.6875rem] ${at === cursor ? 'opacity-80' : 'opacity-45'}`}>{one.key}</kbd>
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : still && <p className="mt-1 text-body text-muted-foreground">Nothing left open today.</p>}
          </section>

          {/* 3. Anything on your mind for tomorrow: a line each, a task each, so it is out of your head before bed. */}
          <section data-close-tomorrow>
            <div className="flex items-center gap-2">
              <h3 className={heading}>Anything on your mind for tomorrow?</h3>
              <span className="flex-1" />
              {!skipped && !thoughts.length && <Button data-close-tomorrow-skip size="sm" variant="ghost" onClick={() => (chime('fold'), setSkipped(true))}>Nothing tonight</Button>}
            </div>
            {skipped && !thoughts.length ? (
              <p className="mt-1 text-body text-muted-foreground">Nothing on your mind tonight. <button type="button" onClick={() => (chime('slide'), setSkipped(false))} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/60">Add one after all</button></p>
            ) : (
              <div className="mt-1.5">
                <TomorrowLines night={night} label="Anything on your mind for tomorrow" />
                <TomorrowWhy />
              </div>
            )}
          </section>

          {/* 4. One line for today's page. */}
          <section data-close-line className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0">
            <h3 className={heading}>One line for today's page</h3>
            {lineKept ? (
              <p className="mt-1.5 text-body text-foreground">“{line.trim()}” <span className="text-muted-foreground">is on today's page.</span></p>
            ) : (
              <form className="mt-1.5 flex items-center gap-2 rounded-md border px-2.5 py-1.5 focus-within:border-ring" onSubmit={(event) => (event.preventDefault(), void keepLine())}>
                <input value={line} onChange={(event) => setLine(event.target.value)} placeholder="What today was, in a line" aria-label="One line for today's page"
                  className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground" />
                <Kbd>↵</Kbd>
              </form>
            )}
            </div>
            {/* Today's captures beside the writing, to write the line from. */}
            <DayLog day={today} only={['captured']} title="What you caught today" empty="Nothing caught today." className="max-h-52 min-w-0 overflow-y-auto" />
          </section>

          {/* This season's habits, a tick each: kept beside the day's own words, so a gap keeps its reason. */}
          <HabitTicks day={today} heading={heading} />

          {/* The night's two questions, kept by day for the year's look back in Stats. */}
          <JournalQuestions day={today} heading={heading} />

          {/* 5. Tomorrow's first task: the frog. */}
          <section data-close-frog>
            <h3 className={heading}>Tomorrow's one big thing</h3>
            {forTomorrow.length ? (
              <ul className="mt-1.5 flex flex-col">
                {forTomorrow.map((task) => (
                  <li key={task.id}>
                    <button type="button" role="radio" aria-checked={frog === task.id} onClick={() => pickFrog(task)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50">
                      <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]" style={{ borderColor: frog === task.id ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }}>
                        {frog === task.id && <span className="size-2 rounded-full bg-[var(--tt-color-text-green)]" />}
                      </span>
                      <span className="min-w-0 flex-auto truncate text-body text-foreground">{taskName(task.title).text}</span>
                      <Tags tags={taskName(task.title).tags} go={false} />
                      {task.dueAt && <span className="shrink-0 text-control text-muted-foreground">{when(task.dueAt, !!task.allDay)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-body text-muted-foreground">Send a task to Tomorrow above, and pick the one to do first.</p>}
            {frog && <p className="mt-1.5 text-control text-muted-foreground">It will be first on tomorrow's list, and in the morning's brief.</p>}
          </section>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <span className="flex-1" />
          <Button size="sm" onClick={finish}>Close the day <Kbd>⌘↵</Kbd></Button>
        </div>
      </div>
    </div>
  )
}
