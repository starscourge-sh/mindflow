import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { byKeys, useByKeys } from '@/lib/motion'
import { unloaded, useLive, vigil, type Settings, type Task } from '@/lib/vigil'
import { readLines } from '../../../../main/day-lines'
import { dated, dayjs, dayKey, num } from '../../../../main/dates'
import { clock } from '@/lib/clock'
import { Tip, Typed, toast } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'

/**
 * Tomorrow, written down before bed: one line per thing on your mind, each an
 * open task for tomorrow. In a sleep study (Scullin and others, 2018), people
 * who spent five minutes writing tomorrow's to-do list fell asleep faster than
 * people who wrote what they had done, and the more specific the list, the
 * faster. Close the day asks for it as a step; Today and Today's page offer
 * the same box after the evening hour. Both read and write one list a night,
 * so a line written in one shows in the other, never twice.
 *
 * A night runs from the evening hour to 4 in the morning: a thought written
 * at half past midnight is still for the day you wake into, on the same list.
 */

/** The small hours still belong to the night before. */
const NIGHT_ENDS = 4

/** The night a moment belongs to, named by its evening's day. */
export const nightOf = (now = new Date()): string => dayKey(now.getHours() < NIGHT_ENDS ? dayjs(now).subtract(1, 'day') : now)
/** The day a night's lines are for: the one you wake into. */
export const dayAfter = (night: string): string => dayKey(dayjs(night).add(1, 'day'))

const minutesOf = (at?: string): number => {
  const [h, m] = (at ?? '18:00').split(':').map(Number)
  return h * 60 + (m || 0)
}
/** Whether the box is offered now: on, and past the evening hour or in the small hours. */
export function eveningNow(settings: Pick<Settings, 'closeDayAt' | 'tomorrowBox'> | null, now = new Date()): boolean {
  if (!settings || settings.tomorrowBox === false) return false
  return now.getHours() < NIGHT_ENDS || now.getHours() * 60 + now.getMinutes() >= minutesOf(settings.closeDayAt)
}

/** One line of a night's list: its task, and whether this list made it (or found it already on your list). */
type Entry = { id: string; made: boolean }
const KEY = (night: string): string => `tomorrow-lines:${night}`
export const readNight = (night: string): Entry[] => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY(night)) ?? '[]')
    return Array.isArray(all) ? all.filter((one) => one && typeof one.id === 'string') : []
  } catch {
    return []
  }
}
const writeNight = (night: string, entries: Entry[]): void => {
  try {
    localStorage.setItem(KEY(night), JSON.stringify(entries.filter((one, at, all) => all.findIndex((two) => two.id === one.id) === at)))
  } catch {
    // Still tasks for tomorrow; only this list forgets them.
  }
  window.dispatchEvent(new CustomEvent('vigil:tomorrow-lines'))
}

/** A night's lines, kept in step across every box showing them. */
export function useNight(night: string): Entry[] {
  const [entries, setEntries] = useState(() => readNight(night))
  useEffect(() => {
    const again = (): void => setEntries(readNight(night))
    again()
    window.addEventListener('vigil:tomorrow-lines', again)
    window.addEventListener('storage', again)
    return () => (window.removeEventListener('vigil:tomorrow-lines', again), window.removeEventListener('storage', again))
  }, [night])
  return entries
}

/** Words made a task for `day`: undated, all day; a time with no day of its own ("call Sam at 3"), at that time on `day`. */
async function makeFor(text: string, day: string): Promise<Entry & { existed: boolean }> {
  const made = await vigil.addTask(text, undefined, true)
  if (!made.existed) {
    const task = await vigil.task(made.id)
    if (task?.dueAt && !task.recurrence && !task.planFor && dayKey(task.dueAt) < day) {
      const at = dayjs(task.dueAt)
      // Said as the first date it had, not a reschedule.
      await vigil.saveTask(made.id, { due: dayjs(day).hour(at.hour()).minute(at.minute()).startOf('minute').toISOString(), reschedules: 0 })
    }
  }
  return { id: made.id, made: !made.existed, existed: made.existed }
}
/** Lines made here, taken back out as if never written; lines found already on your list just leave this one. */
const unmake = (entries: Entry[]): Promise<unknown> => Promise.all(entries.filter((one) => one.made).map((one) => vigil.unmakeTask(one.id, false, [], [])))

/** Take a night's lines made since `since` back out, for an Undo that covers a whole sitting. */
export async function takeBack(night: string, ids: string[]): Promise<void> {
  const all = readNight(night)
  const gone = all.filter((one) => ids.includes(one.id))
  await unmake(gone)
  writeNight(night, all.filter((one) => !ids.includes(one.id)))
}

/** Specific lines, the kind that helped most. Neutral examples, typed in turn. */
const EXAMPLES = ['Email Sam the draft', 'Book the dentist at 9', 'Return the library books', 'Ask Ana when the essay is due', 'Buy bread on the way home']

/**
 * The lines themselves: what tonight's list holds, each written straight
 * into, and a new line at the end. Enter makes the next line; Backspace on an
 * empty one joins it up; a paste of several lines makes several, with one Undo.
 * Never takes the caret by itself.
 */
export function TomorrowLines({ night, alsoAbove = false, label = 'A line for tomorrow' }: {
  night: string
  /** Its lines are on the list above too (after midnight, tomorrow is today): still shown here, where they were written, with a line saying so. */
  alsoAbove?: boolean
  label?: string
}): React.JSX.Element {
  const day = dayAfter(night)
  const entries = useNight(night)
  const tasks = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  const byId = new Map(tasks.map((task) => [task.id, task]))
  // Gone, ticked or binned since: off the list. Ticked stays, struck, for the night.
  const lines = entries.map((one) => ({ ...one, task: byId.get(one.id) })).filter((one): one is Entry & { task: Task } => !!one.task && one.task.status !== 'dropped')
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const fresh = useRef<HTMLTextAreaElement>(null)
  const kept = useRef('')
  kept.current = draft

  const add = async (text: string): Promise<Entry | null> => {
    const words = text.trim()
    if (!words) return null
    const one = await makeFor(words, day)
    writeNight(night, [...readNight(night), { id: one.id, made: one.made }])
    if (one.existed) toast('Already on your list, so it is on tonight’s too, not added twice', undefined, 'info')
    else chime('bead')
    return one
  }
  // Words typed and not yet made a line are kept however the box goes: a page left, a sheet closed.
  useEffect(() => () => void (kept.current.trim() && add(kept.current)), []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Several lines pasted: a line each, one Undo for all. */
  const paste = async (text: string): Promise<void> => {
    const made: Entry[] = []
    for (const line of readLines(text)) {
      const words = line.text.trim()
      if (!words) continue
      const one = await makeFor(words, day)
      made.push(one)
      writeNight(night, [...readNight(night), { id: one.id, made: one.made }])
    }
    if (!made.length) return
    chime('gather')
    toast(made.length === 1 ? 'A line for tomorrow' : `${num(made.length)} lines for tomorrow`, () => void takeBack(night, made.map((one) => one.id)))
  }
  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const text = event.clipboardData.getData('text/plain')
    if (readLines(text).filter((one) => one.text.trim()).length < 2) return
    event.preventDefault()
    void paste(text)
  }

  /** A line taken out, with Undo: one made here is gone as if never written. */
  const remove = async (one: Entry & { task: Task }): Promise<void> => {
    chime('away')
    const all = readNight(night)
    const at = all.findIndex((two) => two.id === one.id)
    await unmake([one])
    writeNight(night, all.filter((two) => two.id !== one.id))
    toast(one.made ? 'Line taken out' : 'Off tonight’s list. It is still in your tasks', async () => {
      const back = one.made ? await makeFor(one.task.title, day) : { id: one.id, made: false }
      const now = readNight(night)
      writeNight(night, [...now.slice(0, at), { id: back.id, made: back.made }, ...now.slice(at)])
    })
  }
  /** A line its own words moved to a later day, brought back to tomorrow, at its time if it has one. */
  const keepFor = async (task: Task): Promise<void> => {
    const was = task.dueAt!
    const at = dayjs(was)
    await vigil.saveTask(task.id, { due: dayjs(day).hour(task.allDay ? 9 : at.hour()).minute(task.allDay ? 0 : at.minute()).startOf('minute').toISOString(), reschedules: 0 })
    chime('bead')
    toast('Back on tomorrow', () => void vigil.saveTask(task.id, { due: was, reschedules: 0 }))
  }
  const rename = (task: Task, text: string): void => {
    const words = text.trim()
    if (words && words !== task.title) void vigil.saveTask(task.id, { title: words })
  }

  const fields = (): HTMLTextAreaElement[] => [...(box.current?.querySelectorAll<HTMLTextAreaElement>('textarea[data-tomorrow-field]') ?? [])]
  const step = (from: HTMLTextAreaElement, by: -1 | 1): boolean => {
    const all = fields()
    const to = all[all.indexOf(from) + by]
    if (!to) return false
    to.focus()
    const at = by < 0 ? to.value.length : 0
    to.setSelectionRange(at, at)
    return true
  }
  const shared = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const field = event.currentTarget
    if (event.altKey || event.metaKey || event.shiftKey) return false
    if (event.key === 'Escape') return (field.blur(), false)
    if (event.key === 'ArrowUp' && !field.value.slice(0, field.selectionStart).includes('\n') && field.scrollHeight <= field.clientHeight + 4) return step(field, -1)
    if (event.key === 'ArrowDown' && field.scrollHeight <= field.clientHeight + 4) return step(field, 1)
    return false
  }
  const lineKeys = (one: Entry & { task: Task }) => (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const field = event.currentTarget
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey) {
      event.preventDefault()
      rename(one.task, field.value)
      return void fresh.current?.focus()
    }
    if (event.key === 'Backspace' && !field.value && field.selectionStart === 0) {
      event.preventDefault()
      step(field, -1) || step(field, 1)
      return void remove(one)
    }
    if (shared(event)) event.preventDefault()
  }
  const draftKeys = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const field = event.currentTarget
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey) {
      event.preventDefault()
      if (!draft.trim()) return
      const text = draft
      setDraft('')
      void add(text)
      return
    }
    // Backspace on the empty new line: back up to the end of the line above, as any editor joins up.
    if (event.key === 'Backspace' && !field.value) return void (step(field, -1) && event.preventDefault())
    if (shared(event)) event.preventDefault()
  }

  // The examples take turns while the line is empty: a new one every few seconds, typed in.
  const [example, setExample] = useState(() => Math.floor(Math.random() * EXAMPLES.length))
  useEffect(() => {
    if (draft || byKeys()) return
    const every = setInterval(() => setExample((at) => (at + 1) % EXAMPLES.length), 9000)
    return () => clearInterval(every)
  }, [draft])

  const lineClass = 'relative block w-full resize-none bg-transparent text-[0.9375rem] leading-snug text-foreground outline-none [field-sizing:content]'
  return (
    <div ref={box} data-tomorrow-lines={night}>
      {alsoAbove && lines.length > 0 && (
        <p data-tomorrow-above className="mb-1 text-[0.9375rem] text-foreground">
          {lines.length === 1 ? 'It is' : lines.length === 2 ? 'Both are' : `All ${num(lines.length)} are`} on today’s list too, since after midnight tomorrow is today.
        </p>
      )}
      <ul>
        {lines.map((one) => {
          const { task } = one
          const timed = task.dueAt && !task.allDay
          const moved = !!task.dueAt && dayKey(task.dueAt) > day && task.status !== 'done' && !task.recurrence
          const when = task.dueAt && dayKey(task.dueAt) !== day ? dated(task.dueAt, 'ddd D MMM') : timed ? clock(task.dueAt!) : ''
          const items = (): RowItem[] => [
            ...taskMenu(task, { open: () => (chime('open'), window.api.openInHome('task', task.id)), now: taskNow }).filter((item) => !(item && item !== 'separator' && 'label' in item && /^Move to the Bin/.test(item.label))),
            'separator',
            { label: one.made ? 'Take the line out' : 'Take it off', hint: one.made ? undefined : 'Off tonight’s list, still in your tasks', keys: '⌫', danger: true, run: () => void remove(one) }
          ]
          return (
            <RowMenu key={one.id} writes items={items}>
              <li data-tomorrow-line={task.id} className="mf-arrive flex items-start gap-2.5 py-1">
                {/* A bullet, not a tick box: these are for tomorrow, ticked there. */}
                <span aria-hidden className="grid h-[1.4rem] w-[1.0625rem] shrink-0 place-items-center"><span className="size-1.5 rounded-full" style={{ background: task.status === 'done' ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }} /></span>
                <textarea data-tomorrow-field rows={1} defaultValue={task.title} aria-label={task.title} key={task.title}
                  onKeyDown={lineKeys(one)} onPaste={onPaste} onBlur={(event) => rename(task, event.currentTarget.value)}
                  className={`${lineClass} min-w-0 flex-1 ${task.status === 'done' ? 'text-muted-foreground line-through' : ''}`} />
                {/* A date of its own in the words moves the line off tomorrow: said plainly, with the way back. */}
                {moved ? (
                  <span data-tomorrow-moved className="mt-[0.15rem] flex shrink-0 items-center gap-2 text-control tabular-nums">
                    <span className="font-medium text-foreground">For {when}</span>
                    <Tip label="Make it a line for tomorrow again">
                      <button type="button" onClick={() => void keepFor(task)} className="rounded px-1 font-medium text-[var(--tt-color-text-blue)] hover:bg-accent">Keep for tomorrow</button>
                    </Tip>
                  </span>
                ) : when && <span className="mt-[0.15rem] shrink-0 text-control font-medium text-muted-foreground tabular-nums">{when}</span>}
              </li>
            </RowMenu>
          )
        })}
      </ul>
      <RowMenu writes items={(field) => (field instanceof HTMLTextAreaElement && field.value.trim() ? [{ label: 'Make it a line', hint: 'A line for tomorrow', keys: '↵', run: () => void (setDraft(''), add(field.value)) }] : [])}>
        <div className="flex items-start gap-2.5 py-1">
          <span aria-hidden className="mt-[0.3rem] size-[1.0625rem] shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/45" />
          <div className="relative min-w-0 flex-1">
            {/* The example, typed in as the app's hints are, where the words will go. */}
            {!draft && (
              <span aria-hidden data-tomorrow-example className="pointer-events-none absolute inset-0 truncate text-[0.9375rem] leading-snug text-muted-foreground/80">
                <Typed key={example} text={lines.length ? 'Another one' : `${EXAMPLES[example]}`} step={30} delay={600} />
              </span>
            )}
            <textarea ref={fresh} data-tomorrow-field data-tomorrow-new rows={1} value={draft} aria-label={label}
              onChange={(event) => setDraft(event.target.value.replace(/\n/g, ''))}
              onKeyDown={draftKeys} onPaste={onPaste}
              onBlur={(event) => {
                if ((event.relatedTarget as Element | null)?.closest?.('[role=menu]') || !draft.trim()) return
                const text = draft
                setDraft('')
                void add(text)
              }}
              className={lineClass} />
          </div>
        </div>
      </RowMenu>
    </div>
  )
}

/** Why it is asked, in one plain sentence, with the study a point away. */
export function TomorrowWhy(): React.JSX.Element {
  return (
    <p data-tomorrow-why className="mt-2 pl-[1.6875rem] text-sm leading-snug text-pretty text-muted-foreground">
      <strong className="font-semibold text-foreground">Be specific: “email Sam the draft”, not “work stuff”.</strong>{' '}
      Writing tomorrow down before bed helps you fall asleep sooner.{' '}
      <Tip label="A 2018 sleep study (Scullin and others, Baylor University): people who listed tomorrow's tasks for 5 minutes before bed fell asleep faster than people who wrote what they had done, and the more specific the list, the faster.">
        <button type="button" className="mf-hit relative rounded-sm font-medium text-foreground/80 underline decoration-foreground/25 underline-offset-2 hover:text-foreground">Why?</button>
      </Tip>
    </p>
  )
}

/**
 * On Today and Today's page, after the evening hour: “For tomorrow”, at the
 * end of today's lines. Before the hour it is not there at all. It checks the
 * clock each minute, and stays while it is being written in, so the hour (or
 * 4 in the morning) never takes it out from under you.
 */
export function TomorrowBox({ className = '' }: { className?: string }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const every = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(every)
  }, [])
  const box = useRef<HTMLElement>(null)
  const [held, setHeld] = useState<string | null>(null)
  const due = !unloaded(settings) && eveningNow(settings, now)
  const night = due ? nightOf(now) : held
  // Read as it appears: a click inside never plays the entrance after.
  const keyed = useByKeys(!!night)
  if (!night) return null
  const day = dayAfter(night)
  // After midnight, tomorrow is today: its lines are on today's list already.
  const today = day === dayKey(now)
  return (
    <section ref={box} data-tomorrow-box aria-label="For tomorrow"
      onFocus={() => setHeld(night)}
      onBlur={(event) => !box.current?.contains(event.relatedTarget as Node | null) && setHeld(null)}
      className={`rounded-xl border bg-background px-4 pt-3 pb-3.5 ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-1 duration-300'} ${className}`}>
      <header className="mb-1 flex items-baseline gap-2">
        {/* Past midnight the day named is already today: “tomorrow” would be wrong beside it. */}
        <h3 className="text-lg font-semibold text-foreground">{today ? 'For the morning' : 'For tomorrow'}</h3>
        <span className="text-sm font-medium text-muted-foreground">{dayjs(day).format('dddd')}</span>
      </header>
      <p className="mb-1.5 text-[0.9375rem] text-foreground/85">Anything on your mind? One thing a line, and each becomes a task for {today ? 'today' : 'tomorrow'}.</p>
      <TomorrowLines night={night} alsoAbove={today} />
      <TomorrowWhy />
    </section>
  )
}

/**
 * In Settings, under its switch: the box as it will look, and when it comes,
 * said from the hour as it is set, so changing the hour shows its effect at once.
 */
export function TomorrowPreview({ at, on }: { at: string; on: boolean }): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const every = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(every)
  }, [])
  const showing = eveningNow({ closeDayAt: at, tomorrowBox: on }, now)
  const wait = (minutesOf(at) - (now.getHours() * 60 + now.getMinutes()) + 1440) % 1440
  const inWords = wait < 60 ? `${wait} min` : wait % 60 ? `${Math.floor(wait / 60)} h ${wait % 60} min` : `${wait / 60} h`
  const said = !on ? 'Off: Today and Today’s page never show it.'
    : showing ? 'Showing now, until 4 in the morning.'
    : `Shows from ${at}, in ${inWords}, until 4 in the morning.`
  return (
    <div data-tomorrow-preview className={`mt-2 max-w-md transition-opacity ${on ? '' : 'opacity-50'}`}>
      <p className="mb-1.5 text-[0.8125rem] font-medium text-foreground">{said}</p>
      <div aria-hidden className="pointer-events-none rounded-xl border bg-background px-3.5 py-2.5 select-none">
        <p className="flex items-baseline gap-2"><span className="text-[0.9375rem] font-semibold text-foreground">{now.getHours() < NIGHT_ENDS ? 'For the morning' : 'For tomorrow'}</span><span className="text-xs font-medium text-muted-foreground">{dayjs(now).add(now.getHours() < NIGHT_ENDS ? 0 : 1, 'day').format('dddd')}</span></p>
        {['Email Sam the draft', 'Book the dentist'].map((line, n) => (
          <p key={line} className="mt-1 flex items-center gap-2 text-control text-foreground">
            <span className="grid w-3 shrink-0 place-items-center"><span className="size-1.5 rounded-full bg-muted-foreground" /></span>{line}
            {n === 1 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">9:00</span>}
          </p>
        ))}
      </div>
    </div>
  )
}
