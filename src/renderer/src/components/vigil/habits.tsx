import { useEffect, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'

import { useLive, vigil, type Settings } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { dayjs, num, plural } from '../../../../main/dates'
import { Kbd, Tip, toast } from './ui'
import { N, Section } from './stats-view'

const call = <T,>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

/** This season's habits, in order, from Settings. */
export const useHabits = (): string[] => useLive(vigil.settings, null as Settings | null)?.habits ?? []

/** Add one, or take one off the season: its days stay, for Stats, and Undo puts it back. */
const setHabits = (next: string[]): Promise<unknown> => vigil.setSettings({ habits: next })
const addHabit = async (name: string): Promise<boolean> => {
  const clean = name.trim().replace(/\s+/g, ' ')
  const now = (await vigil.settings()).habits ?? []
  if (!clean || now.some((one) => one.toLowerCase() === clean.toLowerCase())) return (chime('nope'), false)
  await setHabits([...now, clean])
  chime('on')
  return true
}
const dropHabit = async (name: string): Promise<void> => {
  const was = (await vigil.settings()).habits ?? []
  await setHabits(was.filter((one) => one !== name))
  chime('off')
  toast(`“${name}” is off this season's list; its days stay in Stats`, () => void setHabits(was))
}

/** A field that adds a habit on ↵, the way a tag is added. */
function AddHabit({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <form data-habit-add className="flex h-7 min-w-40 items-center gap-1.5 rounded-full bg-accent/50 px-2.5 text-control focus-within:bg-accent"
      onSubmit={(event) => (event.preventDefault(), void addHabit(text).then((ok) => ok && setText('')))}>
      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
      <input autoFocus={autoFocus} value={text} onChange={(event) => setText(event.target.value)} aria-label="Add a habit" placeholder="Add a habit"
        onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), event.stopPropagation(), setText(''), onDone?.())}
        className="field-sizing-content min-w-24 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
    </form>
  )
}

/** The season's habits to change, in Settings: each with its ×, and a field for one more. */
export function HabitList(): React.JSX.Element {
  const habits = useHabits()
  return (
    <div data-habit-list className="flex flex-wrap items-center gap-1.5">
      {habits.map((one) => (
        <span key={one} className="flex h-7 items-center gap-1 rounded-full bg-accent py-0.5 pr-1 pl-2.5 text-control text-foreground">
          {one}
          <button type="button" aria-label={`Take “${one}” off this season`} onClick={() => void dropHabit(one)}
            className="mf-hit relative flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <AddHabit />
    </div>
  )
}

/**
 * Close the day's tick for each of this season's habits: a press each, or
 * its number key, about fifteen seconds in all. Nothing reminds you, and a
 * habit not ticked is only that.
 */
export function HabitTicks({ day, heading }: { day: string; heading: string }): React.JSX.Element {
  const habits = useHabits()
  const [done, setDone] = useState<string[] | null>(null)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    let here = true
    void call<string[]>('habits:day', day).then((list) => here && setDone(list))
    return () => void (here = false)
  }, [day])
  const latest = useRef({ habits, done })
  latest.current = { habits, done }
  const tick = (name: string): void => {
    const on = !(latest.current.done ?? []).includes(name)
    setDone((was) => (on ? [...(was ?? []), name] : (was ?? []).filter((one) => one !== name)))
    chime(on ? 'done' : 'off')
    void call('habits:tick', day, name, on)
  }
  // 1 to 9 tick the habits in order while no field has the keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || !/^[1-9]$/.test(event.key)) return
      if ((document.activeElement as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      const name = latest.current.habits[Number(event.key) - 1]
      if (!name) return
      event.preventDefault()
      event.stopPropagation()
      tick(name)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section data-close-habits>
      <div className="flex items-center gap-2">
        <h3 className={heading}>This season's habits</h3>
        {habits.length > 0 && done && <span className="text-control font-medium text-foreground tabular-nums">{num(habits.filter((one) => done.includes(one)).length)} of {num(habits.length)}</span>}
      </div>
      {habits.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {habits.map((name, at) => {
            const on = !!done?.includes(name)
            return (
              <button key={name} type="button" role="checkbox" aria-checked={on} data-habit={name} onClick={() => tick(name)}
                className={`flex h-8 items-center gap-2 rounded-full border px-3 text-control transition-colors duration-150 ${on ? 'border-transparent bg-[color-mix(in_oklab,var(--tt-color-text-green)_16%,transparent)] text-foreground' : 'text-foreground hover:bg-accent/60'}`}>
                <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors ${on ? 'border-[var(--tt-color-text-green)] bg-[var(--tt-color-text-green)] text-background' : 'border-muted-foreground/70'}`}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                {name}
                {at < 9 && <Kbd>{String(at + 1)}</Kbd>}
              </button>
            )
          })}
          {adding ? <AddHabit autoFocus onDone={() => setAdding(false)} /> : (
            <Tip label="Add a habit for this season">
              <button type="button" aria-label="Add a habit" onClick={() => (chime('slide'), setAdding(true))}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-4" /></button>
            </Tip>
          )}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-body text-muted-foreground">Name a habit you are keeping this season, and tick it here each night.</p>
          <AddHabit />
        </div>
      )}
    </section>
  )
}

type Done = { day: string; habit: string }
const WEEKS = 12

/** A habit's days, worked out: runs, the longest gap, and the last 30 days set beside the 30 before. */
export function habitNumbers(days: Set<string>, today = dayjs().format('YYYY-MM-DD')): { run: number; best: number; gap: number; last30: number; before30: number } {
  const first = [...days].sort()[0]
  if (!first) return { run: 0, best: 0, gap: 0, last30: 0, before30: 0 }
  const span = Math.max(0, dayjs(today).diff(dayjs(first), 'day'))
  let best = 0
  let gap = 0
  let on = 0
  let off = 0
  for (let at = 0; at <= span; at++) {
    const day = dayjs(first).add(at, 'day').format('YYYY-MM-DD')
    if (days.has(day)) (on++, (off = 0), (best = Math.max(best, on)))
    // Today not ticked yet is not a gap: the day is not over.
    else if (day !== today) (off++, (on = 0), (gap = Math.max(gap, off)))
  }
  // The run up to today, or up to yesterday while today is still open.
  let run = 0
  for (let at = days.has(today) ? 0 : 1; days.has(dayjs(today).subtract(at, 'day').format('YYYY-MM-DD')); at++) run++
  const within = (from: number, to: number): number => [...days].filter((day) => { const ago = dayjs(today).diff(dayjs(day), 'day'); return ago >= from && ago < to }).length
  return { run, best, gap, last30: within(0, 30), before30: within(30, 60) }
}

/** One day of a habit's grid: done, or a gap that, pointed at, shows that day's own line from Close the day. */
function HabitDay({ day, done, future }: { day: string; done: boolean; future: boolean }): React.JSX.Element {
  const [why, setWhy] = useState<string | null>(null)
  const label = `${dayjs(day).format('ddd D MMM')}: ${done ? 'done' : 'not ticked'}${!done && why ? `. ${why}` : ''}`
  return (
    <Tip label={future ? '' : label}>
      <div data-habit-day={day} data-done={done || undefined}
        onPointerEnter={() => !done && why === null && void call<{ well: string; learned: string; line: string } | null>('habits:why', day).then((said) => setWhy(said?.line || said?.well || said?.learned ? `“${said.line || said.well || said.learned}”` : 'Nothing written that day'))}
        className={`size-2.5 rounded-[2px] ${future ? 'opacity-0' : done ? 'bg-[var(--tt-color-text-green)]' : 'bg-border/70'}`} />
    </Tip>
  )
}

/**
 * Each habit's last twelve weeks as a grid, with its runs, its longest gap
 * and the trend, said as a record: no streak to keep, nothing broken. A gap
 * pointed at shows what you wrote that night, so it keeps its reason.
 */
export function HabitGrid({ example }: { example: boolean }): React.JSX.Element | null {
  const habits = useHabits()
  const from = dayjs().subtract(WEEKS * 7 + 60, 'day').format('YYYY-MM-DD')
  const real = useLive(() => call<Done[]>('habits:since', from), [] as Done[], [from])
  const names = example ? ['Read twenty pages', 'Walk outside'] : [...new Set([...habits, ...real.map((one) => one.habit)])]
  const rows = example
    ? names.flatMap((habit, h) => Array.from({ length: 90 }, (_, at) => ((at * (h + 3)) % 7 < 5 ? [{ habit, day: dayjs().subtract(at + 1, 'day').format('YYYY-MM-DD') }] : [])).flat())
    : real
  if (!names.length) return null
  const today = dayjs().format('YYYY-MM-DD')
  // Monday-led weeks, the last one this week.
  const start = dayjs().subtract((dayjs().day() + 6) % 7, 'day').subtract((WEEKS - 1) * 7, 'day')
  const grid = Array.from({ length: WEEKS * 7 }, (_, at) => start.add(at, 'day').format('YYYY-MM-DD'))
  return (
    <Section title="Habits">
      {names.map((name) => {
        const days = new Set(rows.filter((one) => one.habit === name).map((one) => one.day))
        const n = habitNumbers(days, today)
        const trend = n.before30 ? Math.round(((n.last30 - n.before30) / n.before30) * 100) : null
        return (
          <div key={name} data-habit-grid={name} className="space-y-2">
            <p className="flex flex-wrap items-baseline gap-x-2 text-body">
              <span className="font-semibold text-foreground">{name}</span>
              {!habits.includes(name) && !example && <span className="text-control">not this season</span>}
            </p>
            <div className="grid w-fit grid-flow-col grid-rows-7 gap-[3px]">
              {grid.map((day) => <HabitDay key={day} day={day} done={days.has(day)} future={day > today} />)}
            </div>
            <p data-habit-numbers data-run={n.run} data-best={n.best} data-gap={n.gap} data-last30={n.last30}>
              Done on <N>{plural(n.last30, 'day', 'days')}</N> of the last 30
              {trend === null ? '. ' : trend === 0 ? ', as many as the 30 before. ' : <>, {trend > 0 ? 'up' : 'down'} <N>{`${Math.abs(trend)}%`}</N> on the 30 before. </>}
              {n.run > 1 ? <>On a run of <N>{plural(n.run, 'day', 'days')}</N>. </> : ''}
              {n.best > 1 ? <>Longest run <N>{plural(n.best, 'day', 'days')}</N>{n.gap ? <>, longest gap <N>{plural(n.gap, 'day', 'days')}</N>.</> : '.'}</> : ''}
            </p>
          </div>
        )
      })}
      <p className="text-control">Ticked on Close the day. A gap pointed at shows what you wrote that night.</p>
    </Section>
  )
}
