import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TAGS } from '@/extensions/tokens'
import { ArrowRight, ArrowUpLeft, ChevronRight, GripVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { chime, tear } from '@/lib/sound'
import { focusToolsShown, useLive, unloaded, haligtree, when, type Finished, type Task } from '@/lib/haligtree'
import { bucket, placed, renameTask, taskName } from '@/lib/tasks'
import { byKeys, useByKeys } from '@/lib/motion'
import { readLines, tasksOf } from '../../../../main/day-lines'
import { dayKey, num, startOfDay } from '../../../../main/dates'
import { useToday } from '@/lib/use-today'
import { Count, Book, Kbd, Rolling, Tags, Tip, Typed, refuse, toast, quietly } from './ui'
import { DROP_LIT, SortableList, SortableRow } from './sortable'
import { Struck, Tick } from './marks'
import { completeTask, dayCleared, landed, moveTo, onToday, pickDate, shiftTo, startOn, taskMenu, useTaskNow } from './tasks-view'
import { RowMenu, openFromGrip, type RowItem } from './row-menu'
import { PriorityMark, planFor } from './task-input'
import { dayClosed, openCloseDay } from './close-day'
import { useArrivals } from './note-list'
import { TomorrowBox } from './tomorrow-lines'
import { TAG } from '../../../../main/tag-words'
import { Timer } from '@/components/ui/icons'
import { FromNote, type AtLink } from './at-notes'
import { DayLine, type LineHandle } from './day-line'

/** A line split round its #tags: the tags at the odd places. */
const byTags = (text: string): string[] => text.split(new RegExp(`(#${TAG})`, 'gu'))

/**
 * Write out your day: Today as a page you write, the way a running list in
 * Raycast Notes or Apple Notes reads. One line a thing, Enter for the next,
 * Tab to make a line a step of the one above, ⌥↑ ⌥↓ (or a drag) to reorder;
 * the order is the priority and the top three carry it. Every line is a real
 * task: ticking here ticks it everywhere, and a task due today shows here
 * whether it was written here or not, so there is one list, not two.
 *
 * Now is today. Next is what comes after, with no day yet (the backlog);
 * Later is someday. Moving a line between them moves its day: into Now is
 * today, into Next takes its day off, into Later puts it in Someday. Ticked
 * lines stay where they were, struck through, until the day ends or you
 * clear them.
 */

type Section = 'now' | 'next' | 'later'
const SECTIONS: { id: Section; label: string; said: string }[] = [
  { id: 'now', label: 'Now', said: 'Today' },
  { id: 'next', label: 'Next', said: 'Next, no day yet' },
  { id: 'later', label: 'Later', said: 'Someday' }
]

/** Where a line can be sent from Today: by a drag, its right-click menu, or a key once it is picked (Esc). */
type Place = 'today' | 'tomorrow' | 'week' | 'next' | 'month' | 'someday'
const PLACES: { id: Place; label: string; said: string; key?: string }[] = [
  { id: 'today', label: 'Today', said: 'Drop to do it today', key: 'T' },
  { id: 'tomorrow', label: 'Tomorrow', said: 'Drop to do it tomorrow', key: 'M' },
  { id: 'week', label: 'Next week', said: 'Drop to do it next week', key: 'W' },
  { id: 'next', label: 'Next, no day yet', said: 'Drop to take its day off, into Next', key: 'N' },
  { id: 'month', label: 'Later, this month', said: 'Drop to put it in This month' },
  { id: 'someday', label: 'Later, someday', said: 'Drop to put it in Later, Someday', key: 'L' }
]
/** A drop place's name as a place a line goes: Upcoming's tab is tomorrow, Later's is someday. */
const placeOf = (drop: string): Place | undefined => {
  const id = drop === 'upcoming' ? 'tomorrow' : drop === 'later' ? 'someday' : drop
  return PLACES.find((one) => one.id === id)?.id
}

/** Where the caret goes after the next draw: a line by its key, at its end, its start, or a place. */
type Want = { key: string; at: 'end' | 'start' | number; until: number }
/** A line being written that is not a task yet: after a task in a section, or a step at a place in one. */
type Draft = { section: Section; after: string | null; parent?: { id: string; at: number }; text: string }

/** Open from ⌘K: Today in its written layout, the caret on a new line. Kept until the page is there to take it. */
let pending = false
export function writeOutDay(): void {
  pending = true
  // Kept as Today's layout before Today is drawn, so it opens written out.
  try {
    const key = 'view:tasks:today'
    localStorage.setItem(key, JSON.stringify({ sort: 'manual', ...JSON.parse(localStorage.getItem(key) ?? '{}'), group: 'page' }))
  } catch {
    // Today hears the event instead.
  }
  window.dispatchEvent(new CustomEvent('haligtree:write-day'))
}
/** Whether Today shows as the written page. Read by the day's page, which shows the same list. */
export const writtenLayout = (): boolean => {
  try {
    return JSON.parse(localStorage.getItem('view:tasks:today') ?? '{}').group === 'page'
  } catch {
    return false
  }
}

const CLEARED = (day: string): string => `day-list:cleared:${day}`
/** The ticked lines cleared from a day's page with “Clear ticked”: the day's page leaves them out of its count too. */
export const readCleared = (day: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLEARED(day)) ?? '[]')
  } catch {
    return []
  }
}
const writeCleared = (day: string, ids: string[]): void => {
  try {
    localStorage.setItem(CLEARED(day), JSON.stringify(ids))
  } catch {
    // Shown again after a reload; nothing is lost.
  }
}

/** Your order first, then the order they were made in. */
const order = (a: Task, b: Task): number => (a.sortOrder ?? 1e6 + a.number) - (b.sortOrder ?? 1e6 + b.number)

/** Whether a task is on today's Now: open and for today, or ticked today. */
const inNow = (task: Task): boolean => {
  const day = placed(task)
  if (task.status === 'open') return !task.waitingOn && day !== null && day >= startOfDay() && day < startOfDay(1)
  return task.status === 'done' && !!task.completedAt && dayKey(task.completedAt) === dayKey() && (day ?? 0) < startOfDay(1)
}

/**
 * The day's three, the way Arc keeps pinned tabs while the day's tabs come and
 * go: the first three lines of Now, numbered 1 2 3. Until one of them is
 * ticked they follow the list, so a drag in the morning changes them; once
 * one is ticked they are kept for the day, here, and stay at the top of Now,
 * struck through when done, while the rest moves up under them.
 */
const THREE = (day: string): string => `day-list:three:${day}`
const readKept = (day: string): string[] | null => {
  try {
    const ids = JSON.parse(localStorage.getItem(THREE(day)) ?? 'null')
    return Array.isArray(ids) ? ids : null
  } catch {
    return null
  }
}
const keepThree = (day: string, ids: string[]): void => {
  try {
    localStorage.setItem(THREE(day), JSON.stringify(ids))
  } catch {
    // They go on following the list until kept.
  }
}
/** Today's three, kept or still following the list: read by quick capture's Today too, which marks them the same way. */
export const dayThree = (tasks: Task[], day = dayKey()): string[] =>
  readKept(day) ?? tasks.filter(inNow).filter((task) => !readCleared(day).includes(task.id)).sort(order).slice(0, 3).map((task) => task.id)

/** A line's number among the day's three, quiet in the margin where the handle shows on pointing; green once it is done. */
export function ThreeMark({ n, done = false, className = '' }: { n: number; done?: boolean; className?: string }): React.JSX.Element {
  return (
    <span data-three={n} aria-label={`One of today's three, number ${n}`} className={`text-control font-semibold tabular-nums ${className}`}
      style={{ color: done ? 'var(--tt-color-text-green)' : 'var(--foreground)' }}>{n}</span>
  )
}

const MINUTES = [15, 30, 45, 60, 90, 120]
const lengthSaid = (minutes: number): string => (minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`)

export function DayList({ compact = false, onWrite, focusEmpty = true, onOpenTask, openId }: {
  /** The task open beside the page: its line is lit. */
  openId?: string
  /** A line's task opened beside the page, its date, notes and steps all there. */
  onOpenTask?: (id: string) => void
  /** On the day's page: Now only, with a way to the rest in Today. */
  compact?: boolean
  /** Something was written: Today keeps this layout from now on. */
  onWrite?: () => void
  /** With nothing written yet, the caret waits on the first line. */
  focusEmpty?: boolean
}): React.JSX.Element | null {
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const taskNow = useTaskNow()
  // Kept current: left open past midnight, the list is drawn again for the new day.
  const today = useToday()
  const [ticked, setTicked] = useState<Record<string, { task: Task; was?: Finished; pen: boolean; day: string }>>({})
  const [cleared, setCleared] = useState<string[]>(() => readCleared(today))
  // Left open past midnight: what was ticked or cleared yesterday is yesterday's, not today's Now.
  const [dayOf, setDayOf] = useState(today)
  if (dayOf !== today) {
    setDayOf(today)
    setCleared(readCleared(today))
    setTicked((all) => Object.fromEntries(Object.entries(all).filter(([, one]) => one.day === today)))
  }
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState<Record<Section, boolean>>({ now: true, next: false, later: false })
  // The line picked with Esc (lit, no caret in it): T, M, W, N and L move it, ↑ ↓ pick the one beside it, ↵ writes in it again.
  const [picked, setPicked] = useState<{ id: string; section: Section } | null>(null)
  const fields = useRef(new Map<string, LineHandle>())
  const want = useRef<Want | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Lines made here this sitting: taking one out deletes it, as if it was never written.
  const fresh = useRef(new Set<string>())
  // The note each line was last linked to with @ here, so a pick is put on its task once.
  const sourced = useRef(new Map<string, string>())

  const start = startOfDay()
  const ids = new Set(tasks.map((task) => task.id))
  const written = [...tasks.filter(inNow), ...Object.values(ticked).filter((one) => one.day === today).map((one) => one.task).filter((task) => !ids.has(task.id) || !inNow(tasks.find((one) => one.id === task.id)!))]
    .filter((task, at, all) => all.findIndex((one) => one.id === task.id) === at && !cleared.includes(task.id))
    .sort(order)
  // The day's three first, in the order they were kept (or the first three still), then the rest in your order.
  const kept = readKept(today)
  const three = kept ?? written.slice(0, 3).map((task) => task.id)
  const now = [...three.flatMap((id) => written.filter((task) => task.id === id)), ...written.filter((task) => !three.includes(task.id))]
  const before = tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < start)
  const next = tasks.filter((task) => task.status === 'open' && !task.waitingOn && !task.dueAt && !task.deadline && !task.planFor && !task.recurrence).sort(order)
  const later = tasks.filter((task) => task.status === 'open' && !task.waitingOn && !task.dueAt && !!bucket(task)).sort(order)
  const lists: Record<Section, Task[]> = { now, next, later }
  const done = (task: Task): boolean => ticked[task.id]?.day === today || task.status === 'done'
  const openNow = now.filter((task) => !done(task))
  const top = new Set(openNow.slice(0, 3).map((task) => task.id))
  // The first of the three ticked, here or anywhere: they are kept for the day from now on.
  const settle = !kept && now.some((task) => three.includes(task.id) && done(task))
  useEffect(() => {
    if (settle) keepThree(today, three)
  }, [settle]) // eslint-disable-line react-hooks/exhaustive-deps
  // How the three stand, the ones cleared after ticking counted as done.
  const threeDone = three.filter((id) => cleared.includes(id) || now.some((task) => task.id === id && done(task))).length
  const threeThere = three.filter((id) => cleared.includes(id) || now.some((task) => task.id === id)).length
  const arrived = useArrivals([...now, ...next, ...later].map((task) => task.id), 'day-list')

  // The caret where it was asked for, once the line it asked for is drawn:
  // asked for again on the draws just after, and as a line arrives, since a
  // line that moves (a new line made a step) is a new editor, and the old one
  // goes with the caret in it.
  const place = (asked: Want): boolean => {
    const line = fields.current.get(asked.key)
    if (!line) return false
    if (!line.focused()) line.focus(asked.at)
    return true
  }
  useLayoutEffect(() => {
    const asked = want.current
    if (!asked) return
    if (Date.now() > asked.until) return void (want.current = null)
    place(asked)
  })
  const go = (key: string, at: Want['at'] = 'end'): void => {
    want.current = { key, at, until: Date.now() + 700 }
    place(want.current)
  }
  // From ⌘K, or a fresh empty day: the caret on Now's new line.
  useEffect(() => {
    const take = (): void => {
      if (!pending) return
      pending = false
      requestAnimationFrame(() => go('new:now'))
    }
    take()
    window.addEventListener('haligtree:write-day', take)
    return () => window.removeEventListener('haligtree:write-day', take)
  }, [])
  const loaded = !unloaded(tasks)
  // Next and Later open by themselves while they are short; a long one waits to be opened.
  const sized = useRef(false)
  useEffect(() => {
    if (!loaded || sized.current) return
    sized.current = true
    setOpen((all) => ({ ...all, next: next.length > 0 && next.length <= 6, later: later.length > 0 && later.length <= 6 }))
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  const empty = loaded && !now.length
  useEffect(() => {
    if (empty && focusEmpty && !compact) requestAnimationFrame(() => go('new:now'))
  }, [empty]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- the writes, each heard and each undoable ----------------------------

  const renumber = (list: string[]): Promise<unknown> => haligtree.saveTasks(list.map((id, at) => ({ id, patch: { sortOrder: at } })))
  /** What moving into a section changes on the task: its day, or its want of one. */
  const into = (section: Section, task?: Pick<Task, 'dueAt'>) =>
    section === 'now' ? { due: shiftTo(0, task?.dueAt) } : section === 'next' ? { due: null, plan: null } : { plan: 'someday' }

  /** A written line made a task in its section, after `after` (or first). Gives back its id. */
  const add = async (section: Section, text: string, after: string | null, list = lists[section].map((task) => task.id), link?: AtLink): Promise<string | null> => {
    const words = text.trim()
    if (!words) return null
    onWrite?.()
    // A note picked with @: the task is made from it, and its name in the words is never read as a date.
    const made = await haligtree.addTask(words, link?.id, section === 'now', link?.plain.map(({ from, to }) => ({ from: from - text.indexOf(words), to: to - text.indexOf(words) })))
    if (!made.existed) fresh.current.add(made.id)
    // The same words as a task already open: that one comes here, not a second.
    if (made.existed) {
      await haligtree.saveTask(made.id, into(section))
      toast('Already on your list, so it moved here instead of being added twice', undefined, 'info')
    } else if (section !== 'now') await haligtree.saveTask(made.id, into(section))
    const order = list.filter((id) => id !== made.id)
    order.splice(after ? order.indexOf(after) + 1 : 0, 0, made.id)
    await renumber(order)
    // A day in the words ("call Sam friday") takes it there: said, so it never just vanishes.
    if (section === 'now' && !made.existed) {
      const task = await haligtree.task(made.id)
      if (task && !inNow(task)) toast(await landed(made, 'today'), () => void haligtree.saveTask(made.id, { due: shiftTo(0) }))
    }
    chime('bead')
    return made.id
  }

  /** Several lines pasted at once: a task each, the indented ones its steps, ticked ones done. One undo for all. */
  const paste = async (section: Section, text: string, after: string | null): Promise<void> => {
    const made: { id: string; was: boolean }[] = []
    let list = lists[section].map((task) => task.id)
    let last = after
    const lines = tasksOf(readLines(text))
    for (const one of lines) {
      const id = await add(section, one.text, last, list)
      if (!id) continue
      const isNew = fresh.current.has(id)
      made.push({ id, was: !isNew })
      if (one.steps.length) await haligtree.saveTask(id, { subtasks: one.steps })
      if (one.done) await haligtree.saveTask(id, { status: 'done' })
      list = [...list.slice(0, last ? list.indexOf(last) + 1 : 0), id, ...list.slice(last ? list.indexOf(last) + 1 : 0)].filter((one, at, all) => all.indexOf(one) === at)
      last = id
    }
    if (!made.length) return
    chime('gather')
    quietly(() => void Promise.all(made.filter((one) => !one.was).map((one) => haligtree.unmakeTask(one.id, false, [], []))))
    if (last) go(`t:${last}`)
  }

  /** Ticked, heard, struck through in place; the last of today's gets its ending. */
  const tick = (task: Task): void => {
    const was = ticked[task.id]?.was ?? (task.status === 'done' && task.completedAt ? { dueAt: task.dueAt, doneAt: task.completedAt, notifiedAt: new Date().toISOString(), deadlineAt: task.deadline } : undefined)
    if (was || task.status === 'done') {
      chime('off')
      setTicked(({ [task.id]: _, ...rest }) => rest)
      if (was) void haligtree.undoneTask(task.id, was)
      return
    }
    chime('done')
    setTicked((all) => ({ ...all, [task.id]: { task, pen: !byKeys(), day: today } }))
    void haligtree.doneTask(task.id).then(async (was) => {
      setTicked((all) => ({ ...all, [task.id]: { task, was, pen: all[task.id]?.pen ?? false, day: today } }))
      const back = (): void => {
        chime('undo')
        setTicked(({ [task.id]: _, ...rest }) => rest)
        void haligtree.undoneTask(task.id, was)
      }
      if (!(await haligtree.tasks()).some(onToday)) return dayCleared(back)
      quietly(back)
    })
  }

  /** A line taken out: one written just now is gone as if never written; an older one is closed. Undo brings either back. */
  const remove = async (task: Task, section: Section): Promise<void> => {
    tear()
    if (fresh.current.has(task.id) && !task.subtasks?.length) {
      const list = lists[section].map((one) => one.id)
      const above = list[list.indexOf(task.id) - 1] ?? null
      await haligtree.unmakeTask(task.id, false, [], [])
      quietly(() => void add(section, task.title, above).then((id) => id && go(`t:${id}`)))
    } else {
      await haligtree.saveTask(task.id, { status: 'dropped' })
      // Undo puts it back as it was, ticked at the same time, with the caret on it again.
      toast('Line taken out. It is in the Bin', () => void haligtree.saveTask(task.id, { status: task.status, ...(task.status === 'done' ? { completedAt: task.completedAt } : {}) }).then(() => go(`t:${task.id}`)))
    }
  }

  /** A line moved up or down its section, or over the edge into the one beside it. */
  const shiftLine = async (task: Task, section: Section, by: -1 | 1): Promise<void> => {
    const list = lists[section].map((one) => one.id)
    const at = list.indexOf(task.id)
    const to = at + by
    if (to >= 0 && to < list.length) {
      chime('shift')
      ;[list[at], list[to]] = [list[to], list[at]]
      await renumber(list)
      return go(`t:${task.id}`, fields.current.get(`t:${task.id}`)?.caret().at ?? 'end')
    }
    const target = SECTIONS[SECTIONS.findIndex((one) => one.id === section) + by]?.id
    if (!target || compact) return chime('nope')
    await crossTo(task, target, by < 0 ? 'end' : 'start')
  }
  const crossTo = async (task: Task, target: Section, where: 'start' | 'end'): Promise<void> => {
    const was = { due: task.dueAt, plan: task.planFor, sortOrder: task.sortOrder }
    setOpen((all) => ({ ...all, [target]: true }))
    await haligtree.saveTask(task.id, into(target, task))
    const list = lists[target].map((one) => one.id).filter((id) => id !== task.id)
    await renumber(where === 'start' ? [task.id, ...list] : [...list, task.id])
    chime('move')
    quietly(() => void haligtree.saveTask(task.id, { due: was.due, plan: was.plan, sortOrder: was.sortOrder }))
    go(`t:${task.id}`)
  }

  /**
   * A line sent somewhere else, by a drag, its menu or a key: today, tomorrow,
   * next week, Next (no day yet) or Later. Said in a notice with Undo, as a
   * task moved from any list is.
   */
  const sendTo = async (task: Task, section: Section, place: Place): Promise<void> => {
    if (task.status !== 'open') return chime('nope')
    if (place === 'tomorrow' || place === 'week') return moveTo(task, place === 'week' ? 7 : 1)
    if (place === 'month' || place === 'someday') return planFor(task, place)
    const target: Section = place === 'today' ? 'now' : 'next'
    if (target === section) return chime('stay')
    const was = { due: task.dueAt, plan: task.planFor, sortOrder: task.sortOrder }
    setOpen((all) => ({ ...all, [target]: true }))
    await haligtree.saveTask(task.id, into(target, task))
    // At the top of Next, where it is seen; at the end of today's list.
    const list = lists[target].map((one) => one.id).filter((id) => id !== task.id)
    await renumber(target === 'next' ? [task.id, ...list] : [...list, task.id])
    if (target === 'now') onWrite?.()
    chime('move')
    toast(target === 'now' ? 'Moved to Today' : 'Moved to Next, with no day yet', () => void haligtree.saveTask(task.id, { due: was.due, plan: was.plan, sortOrder: was.sortOrder }))
  }
  /** What a place does with a line, said under the line while it is carried there and on its button. */
  const placeSaid = (drop: string): string => PLACES.find((one) => one.id === placeOf(drop))?.said ?? ''
  /** A line dropped on a place (a tab, the box for tomorrow, Next's heading, one at the list's foot). */
  const dropOn = (section: Section) => (id: string, place: string): void => {
    const task = lists[section].find((one) => one.id === id)
    const to = placeOf(place)
    if (task && to) void sendTo(task, section, to)
  }

  /** Tab: the line becomes a step of the one above it. */
  const indent = async (task: Task, section: Section): Promise<void> => {
    const list = lists[section]
    const above = list[list.findIndex((one) => one.id === task.id) - 1]
    if (!above) return chime('nope')
    if (task.subtasks?.length) return refuse('A line with steps of its own stays a line')
    const steps = above.subtasks ?? []
    await haligtree.saveTask(above.id, { subtasks: [...steps, { text: task.title, done: done(task) }] })
    if (fresh.current.has(task.id)) await haligtree.unmakeTask(task.id, false, [], [])
    else await haligtree.saveTask(task.id, { status: 'dropped' })
    chime('tuck')
    quietly(() => void Promise.all([haligtree.saveTask(above.id, { subtasks: steps }), fresh.current.has(task.id) ? add(section, task.title, above.id) : haligtree.saveTask(task.id, { status: task.status })]))
    go(`s:${above.id}:${steps.length}`)
  }
  /** Shift-Tab on a step: a line of its own again, just under the one it was in. */
  const outdent = async (parent: Task, at: number, section: Section): Promise<void> => {
    const steps = parent.subtasks ?? []
    const step = steps[at]
    await haligtree.saveTask(parent.id, { subtasks: steps.filter((_, n) => n !== at) })
    const id = await add(section, step.text, parent.id)
    if (id && step.done) await haligtree.saveTask(id, { status: 'done' })
    chime('untuck')
    if (id) {
      quietly(() => void Promise.all([haligtree.saveTask(parent.id, { subtasks: steps }), haligtree.unmakeTask(id, false, [], [])]))
      go(`t:${id}`)
    }
  }
  const saveSteps = (parent: Task, steps: Task['subtasks']): Promise<unknown> => haligtree.saveTask(parent.id, { subtasks: steps ?? [] })
  const takeStep = (parent: Task, at: number): void => {
    const steps = parent.subtasks ?? []
    chime('away')
    void saveSteps(parent, steps.filter((_, n) => n !== at)).then(() => quietly(() => void saveSteps(parent, steps)))
  }
  const tickStep = (parent: Task, at: number): void => {
    const steps = parent.subtasks ?? []
    chime(steps[at].done ? 'off' : 'done')
    void saveSteps(parent, steps.map((one, n) => (n === at ? { ...one, done: !one.done } : one)))
  }

  /** Into Now, from before or from Next or Later, at its end. */
  const bring = async (list: Task[]): Promise<void> => {
    if (!list.length) return
    const was = list.map((task) => ({ id: task.id, due: task.dueAt, plan: task.planFor, sortOrder: task.sortOrder }))
    await haligtree.saveTasks(list.map((task) => ({ id: task.id, patch: into('now', task) })))
    await renumber([...now.map((task) => task.id).filter((id) => !list.some((one) => one.id === id)), ...list.map((task) => task.id)])
    onWrite?.()
    chime('gather')
    quietly(() => void haligtree.saveTasks(was.map((one) => ({ id: one.id, patch: { due: one.due, plan: one.plan, sortOrder: one.sortOrder } }))))
  }
  const clearTicked = (): void => {
    const gone = now.filter(done).map((task) => task.id)
    const kept = cleared
    const all = [...kept, ...gone]
    setCleared(all)
    writeCleared(today, all)
    chime('sweep')
    quietly(() => (setCleared(kept), writeCleared(today, kept)))
  }
  const setLength = (task: Task, minutes: number | null): void => {
    const was = task.estimate
    void haligtree.saveTask(task.id, { estimate: minutes }).then(() => {
      chime(minutes ? 'tap' : 'off')
      quietly(() => void haligtree.saveTask(task.id, { estimate: was }))
    })
  }

  // --- the keys of a line ---------------------------------------------------

  /** Up and down between lines, as one page: the line before or after this one on screen. */
  const step = (from: HTMLElement, by: -1 | 1): boolean => {
    const all = [...(box.current?.querySelectorAll<HTMLElement>('[data-line]') ?? [])]
    const to = all[all.findIndex((one) => one === from || one.contains(from)) + by]
    if (!to) return false
    const line = to.dataset.lineKey ? fields.current.get(to.dataset.lineKey) : undefined
    if (!line) return false
    line.focus(by < 0 ? 'end' : 'start')
    return true
  }
  /** A written line's own element, to step from. */
  const lineEl = (key: string): HTMLElement | null => box.current?.querySelector<HTMLElement>(`[data-line-key="${CSS.escape(key)}"]`) ?? null
  /** Keys every written line shares: up and down off its edges, Escape. True when the key was taken. */
  const sharedLine = (event: KeyboardEvent, line: LineHandle, key: string): boolean => {
    const from = lineEl(key)
    if (event.key === 'Escape') return (line.blur(), true)
    const plain = !event.altKey && !event.metaKey && !event.shiftKey && !event.ctrlKey
    if (plain && event.key === 'ArrowUp' && line.edge('up')) return !!from && step(from, -1)
    if (plain && event.key === 'ArrowDown' && line.edge('down')) return !!from && step(from, 1)
    return false
  }
  const taskKeys = (task: Task, section: Section) => (event: KeyboardEvent, line: LineHandle): boolean => {
    const list = lists[section]
    const at = list.findIndex((one) => one.id === task.id)
    const key = `t:${task.id}`
    const { text, link } = line.read()
    if (event.key === 'Enter' && event.metaKey) return (tick(task), true)
    if (event.key === 'Enter' && !event.shiftKey) {
      rename(task, text, link)
      // From the start of a line with words, a new line above it, as in any editor.
      if (line.caret().start && text.trim()) return (setDraft({ section, after: list[at - 1]?.id ?? null, text: '' }), go('draft'), true)
      if (!list[at + 1]) return (go(`new:${section}`), true)
      setDraft({ section, after: task.id, text: '' })
      return (go('draft'), true)
    }
    if (event.key === 'Backspace' && line.caret().start && !text) {
      const from = lineEl(key)
      if (from) step(from, -1)
      return (void remove(task, section), true)
    }
    // Shift-Tab on a line that is not a step: out of the page, as it goes anywhere else, rather than a "nope".
    if (event.key === 'Tab' && event.shiftKey) return (rename(task, text, link), false)
    if (event.key === 'Tab') return (rename(task, text, link), void indent(task, section), true)
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return (rename(task, text, link), void shiftLine(task, section, event.key === 'ArrowUp' ? -1 : 1), true)
    // Esc: done writing, the line left picked, so a key can move it (as a row on the Tasks pages is moved).
    if (event.key === 'Escape') return (rename(task, text, link), line.blur(), setPicked({ id: task.id, section }), true)
    return sharedLine(event, line, key)
  }
  const stepKeys = (parent: Task, n: number, section: Section) => (event: KeyboardEvent, line: LineHandle): boolean => {
    const steps = parent.subtasks ?? []
    const key = `s:${parent.id}:${n}`
    const { text } = line.read()
    if (event.key === 'Enter' && event.metaKey) return (tickStep(parent, n), true)
    if (event.key === 'Enter' && !event.shiftKey) {
      // An empty step: Enter brings it out a level, a new line of its own under the line it was in, as outliners do.
      if (!text.trim()) {
        chime('untuck')
        void saveSteps(parent, steps.filter((_, at) => at !== n))
        setDraft({ section, after: parent.id, text: '' })
        return (go('draft'), true)
      }
      renameStep(parent, n, text)
      setDraft({ section, after: parent.id, parent: { id: parent.id, at: n + 1 }, text: '' })
      return (go('draft'), true)
    }
    if (event.key === 'Backspace' && line.caret().start && !text) {
      const from = lineEl(key)
      if (from) step(from, -1)
      return (takeStep(parent, n), true)
    }
    if (event.key === 'Tab' && event.shiftKey) return (renameStep(parent, n, text), void outdent(parent, n, section), true)
    if (event.key === 'Tab') return (chime('nope'), true)
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const to = n + (event.key === 'ArrowUp' ? -1 : 1)
      if (to < 0 || to >= steps.length) return (chime('nope'), true)
      const moved = [...steps]
      ;[moved[n], moved[to]] = [moved[to], moved[n]]
      chime('shift')
      void saveSteps(parent, moved).then(() => go(`s:${parent.id}:${to}`))
      return true
    }
    return sharedLine(event, line, key)
  }
  /**
   * The new line at a section's end, or a draft between lines (a step, under
   * a line), made a task or a step: by Enter and by the right-click menu alike.
   */
  const commit = (section: Section, key: string, after: () => string | null, parent: Draft['parent'], line: LineHandle): void => {
    const { text, link } = line.read()
    const owner = parent ? lists[section].find((one) => one.id === parent.id) : undefined
    if (!text.trim()) {
      // An empty step: Enter brings it out a level, as in any outline.
      if (parent) return void (chime('untuck'), setDraft({ section, after: parent.id, text: '' }), go('draft'))
      if (key === 'draft') {
        const from = lineEl(key)
        if (from) step(from, 1)
        return setDraft(null)
      }
      return chime('nope')
    }
    // Emptied first, so the line, kept for the next one, never saves these words twice.
    line.clear()
    if (parent && owner) {
      const steps = owner.subtasks ?? []
      void saveSteps(owner, [...steps.slice(0, parent.at), { text: text.trim(), done: false }, ...steps.slice(parent.at)]).then(() => {
        chime('bead')
        // The next step right under it, at the same depth.
        setDraft({ section, after: owner.id, parent: { id: owner.id, at: parent.at + 1 }, text: '' })
        go('draft')
      })
      return
    }
    if (key === 'draft') setDraft(null)
    void add(section, text, after(), undefined, link).then((id) => {
      if (!id) return
      if (key === 'draft') (setDraft({ section, after: id, text: '' }), go('draft'))
      else go(key)
    })
  }
  const draftKeys = (section: Section, key: string, after: () => string | null, parent?: Draft['parent']) => (event: KeyboardEvent, line: LineHandle): boolean => {
    const { text } = line.read()
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey) return (commit(section, key, after, parent, line), true)
    if (event.key === 'Tab' && !event.shiftKey) {
      // A step is as deep as a line goes: said, and the caret stays where it is.
      if (parent) return (chime('nope'), true)
      // A new line made a step of the line above it, its words going with it.
      const above = after() ? lists[section].find((one) => one.id === after()) : lists[section].at(-1)
      if (!above) return (chime('nope'), true)
      chime('tuck')
      line.clear()
      setDraft({ section, after: above.id, parent: { id: above.id, at: (above.subtasks ?? []).length }, text })
      return (go('draft'), true)
    }
    if (event.key === 'Tab' && event.shiftKey) {
      // Shift-Tab on a line that is not a step: out of the page, as it goes anywhere else.
      if (!parent) return false
      chime('untuck')
      line.clear()
      setDraft({ section, after: parent.id, text })
      return (go('draft'), true)
    }
    if (event.key === 'Backspace' && !text && key === 'draft') {
      const from = lineEl(key)
      if (from) step(from, -1)
      setDraft(null)
      return true
    }
    return sharedLine(event, line, key)
  }

  /**
   * A line's words kept as its title. A priority, a length or a day written
   * into them is read as quick capture reads it, taken out of the words and
   * set on the task, with Undo.
   */
  const rename = (task: Task, text: string, link?: AtLink): void => {
    if (link) source(task, link)
    const words = text.trim()
    if (!words || words === task.title) return
    // A note's name picked with @ is read as words, never as a date.
    void renameTask(task, words, link?.plain.map(({ from, to }) => ({ from: from - text.indexOf(words), to: to - text.indexOf(words) })) ?? [])
      .then((set) => set && (chime('tap'), quietly(set.undo)))
  }
  /** A note picked with @ in a written line: the task is made from it now, with Undo. */
  const source = (task: Task, link: AtLink): void => {
    // Once for each pick: Enter and then leaving the line read the same note, and the task as drawn may not have it yet.
    if (link.id === task.captureId || sourced.current.get(task.id) === link.id) return
    sourced.current.set(task.id, link.id)
    void haligtree.sourceTask(task.id, link.id).then((was) => {
      chime('settled')
      toast('Made from that note now', () => void haligtree.sourceTask(task.id, was))
    })
  }
  const renameStep = (parent: Task, n: number, text: string): void => {
    const steps = parent.subtasks ?? []
    const words = text.trim()
    if (!words || words === steps[n]?.text) return
    void saveSteps(parent, steps.map((one, at) => (at === n ? { ...one, text: words } : one)))
  }
  /** A paste of several lines into a written line: each a line of its own. True when taken; one line pastes as words. */
  const pasteLines = (section: Section, text: string, after: string | null): boolean => {
    if (readLines(text).length < 2) return false
    void paste(section, text, after)
    return true
  }

  // The picked line's keys, ahead of the page's own (the Journal's T for today, the Tasks page's row keys).
  useEffect(() => {
    if (!picked) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (document.activeElement?.closest('input, textarea, [contenteditable=true], [role=menu], [role=dialog]')) return
      const list = lists[picked.section]
      const at = list.findIndex((one) => one.id === picked.id)
      if (at < 0) return setPicked(null)
      const take = (): void => (event.preventDefault(), event.stopImmediatePropagation())
      if (event.key === 'Escape') return (take(), setPicked(null))
      if (event.key === 'Enter') return (take(), setPicked(null), go(`t:${picked.id}`))
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        take()
        const to = list[at + (event.key === 'ArrowUp' ? -1 : 1)]
        return to ? (chime('tick'), setPicked({ id: to.id, section: picked.section })) : chime('nope')
      }
      const place = PLACES.find((one) => one.key && one.key.toLowerCase() === event.key.toLowerCase())
      if (!place) return
      take()
      setPicked(null)
      void sendTo(list[at], picked.section, place.id)
    }
    // A press anywhere but on the line (or its menu) lets it go.
    const off = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest(`[data-day-line="${CSS.escape(picked.id)}"], [role=menu]`)) setPicked(null)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', off, true)
    return () => (window.removeEventListener('keydown', onKey, true), window.removeEventListener('pointerdown', off, true))
  })
  /** The ways to send a line elsewhere, first in its right-click menu: the places, then a date of its own. */
  const sendItems = (task: Task, section: Section, open: () => void): RowItem[] => task.status !== 'open' ? [] : [
    { heading: 'Move it to' },
    ...PLACES.filter((one) => !(one.id === 'today' && section === 'now') && !(one.id === 'next' && section === 'next'))
      .map((one) => ({ label: one.label, keys: one.key, run: () => void sendTo(task, section, one.id) })),
    { label: 'Pick a date…', run: () => pickDate(task.id, open) },
    'separator'
  ]
  /** Places a carried line can go that the page shows nowhere else: under the list, only while it is carried. */
  const foot = (section: Section): React.ReactNode => {
    const shown = (compact ? ['tomorrow', 'next', 'someday'] as Place[] : document.querySelector('[data-tomorrow-box]') ? [] : ['tomorrow'] as Place[])
      .filter((id) => !(id === 'next' && section === 'next') && !(id === 'someday' && section === 'later'))
    if (!shown.length) return null
    return (
      <div data-drop-foot className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        <span className="mr-1 text-control text-muted-foreground">Or drop it on</span>
        {shown.map((id) => (
          <div key={id} data-row-drop={id} className={`flex h-8 items-center rounded-md border border-dashed border-foreground/25 px-3 text-control font-medium text-muted-foreground ${DROP_LIT}`}>
            {id === 'tomorrow' ? 'Tomorrow' : id === 'next' ? 'Next' : 'Later'}
          </div>
        ))}
      </div>
    )
  }

  // --- drawn -----------------------------------------------------------------

  // A line told of as it arrives (the caret put there when it was asked for), and as it goes, unless another took its place.
  const field = (key: string) => (line: LineHandle | null, was?: LineHandle): void => {
    if (line) {
      fields.current.set(key, line)
      const asked = want.current
      if (asked?.key === key && Date.now() <= asked.until) place(asked)
    } else if (fields.current.get(key) === was) fields.current.delete(key)
  }
  /**
   * A line being written, right-clicked: its words made a task (a step, under
   * a line) as Enter makes them, and the words' own Cut, Copy and Paste.
   */
  const writtenMenu = (section: Section, key: string, after: () => string | null, parent?: Draft['parent']) => (): RowItem[] => {
    const line = fields.current.get(key)
    return line?.read().text.trim()
      ? [{ label: parent ? 'Make it a step' : 'Make it a task', keys: '↵', run: () => commit(section, key, after, parent, line) }]
      : []
  }
  const draftLine = (section: Section, depth: 0 | 1): React.JSX.Element => {
    const after = (): string | null => draft?.after ?? null
    const was = draft
    return (
      <RowMenu writes items={writtenMenu(section, 'draft', after, draft?.parent)}>
        {/* At the depth it is written at: a step's place and size under a line, a line's at the top. */}
        <div className={depth ? 'flex items-start gap-2 py-0.5 pl-12' : 'flex items-start gap-2.5 py-1 pl-6'}>
          <span aria-hidden className={`mt-[0.2rem] shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/50 ${depth ? 'size-3.5' : 'size-[1.0625rem]'}`} />
          <DayLine lineKey="draft" register={field('draft')} value={draft?.text ?? ''} label="A new line" attrs={{ 'data-draft': depth ? 'step' : 'line' }}
            onKey={draftKeys(section, 'draft', after, draft?.parent)}
            onPaste={(text) => !draft?.parent && pasteLines(section, text, after())}
            onLeave={({ text, link }) => {
              // Left with words in it, they are kept; left empty, the draft goes. A draft moved on since (by Tab) stays.
              setDraft((now) => (now === was ? null : now))
              if (!text.trim() || !was) return
              if (was.parent) {
                const owner = lists[section].find((one) => one.id === was.parent!.id)
                if (owner) void saveSteps(owner, [...(owner.subtasks ?? []).slice(0, was.parent.at), { text: text.trim(), done: false }, ...(owner.subtasks ?? []).slice(was.parent.at)])
              } else void add(section, text, was.after, undefined, link)
            }}
            className={`min-w-0 flex-1 leading-snug text-foreground ${depth ? 'text-control' : 'text-[0.9375rem]'}`} />
        </div>
      </RowMenu>
    )
  }

  const row = (task: Task, section: Section): React.JSX.Element => {
    const struck = done(task)
    const steps = task.subtasks ?? []
    const allSteps = steps.length > 0 && steps.every((one) => one.done)
    const first = section === 'now' && top.has(task.id)
    const rank = section === 'now' ? three.indexOf(task.id) + 1 : 0
    const draftHere = draft && draft.section === section && draft.after === task.id
    return (
      <SortableRow key={task.id} id={task.id}>
        <div data-day-line={task.id} data-section={section} data-done={struck || undefined} data-top={first || undefined} data-rank={rank || undefined}
          data-picked={picked?.id === task.id || undefined}
          className={`group/line relative rounded-md ${task.id === openId || picked?.id === task.id ? 'bg-accent/50' : ''} ${arrived(task.id) ? 'mf-arrive' : ''}`}>
          {/* Right-clicked, the menu a task has on every list, with the words' own Cut, Copy and Paste after it. */}
          {/* Where it can go first, each with its key once the line is picked (Esc). */}
          <RowMenu writes items={(() => {
            const open = (): void => (chime('open'), onOpenTask ? onOpenTask(task.id) : window.api.openInHome('task', task.id))
            return [...sendItems(task, section, open), ...taskMenu(task, { open, complete: () => tick(task), now: taskNow })]
          })()}>
          <div className="flex items-start gap-2.5 py-1 pr-1">
            {/* The handle, shown on pointing; the whole row drags, the words never. */}
            {/* Shown on the line being written too: it says the line can move, and ⌥↑ ⌥↓ (said under the list) moves it from the keys. */}
            {/* One of the day's three: its number in the same place, giving way to the handle on pointing. */}
            <span title="Click for its menu. Drag to reorder it, or onto “Next”, “Later” or tomorrow. ⌥↑ ⌥↓ reorder; Esc, then M, W, N or L, moves it." data-grip onClick={openFromGrip} className="relative mt-[0.3rem] w-3.5 shrink-0 cursor-pointer active:cursor-grabbing">
              {rank > 0 && <ThreeMark n={rank} done={struck} className="absolute inset-x-0 -top-[0.15rem] text-center leading-[1.3rem] transition-opacity group-hover/line:opacity-0 group-focus-within/line:opacity-0" />}
              <GripVertical aria-hidden className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/line:opacity-60 group-focus-within/line:opacity-60" />
            </span>
            <Tip label={struck ? 'Not done after all' : 'Done  ⌘↵'}>
              <button type="button" role="checkbox" aria-checked={struck} aria-label={task.title} onClick={() => tick(task)}
                className="mf-hit relative mt-[0.2rem] grid size-[1.0625rem] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
                style={{ borderColor: struck ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 75%, transparent)', background: struck ? 'var(--tt-color-text-green)' : undefined }}>
                {struck && <Tick seed={task.id} draw={!!ticked[task.id]?.pen} className="size-2.5 text-white" />}
              </button>
            </Tip>
            <div className="relative min-w-0 flex-1">
              {struck ? (
                // Done, the words are struck by hand where they were written, and left there.
                <button type="button" onClick={() => tick(task)} className="mf-hit relative block w-full text-left">
                  <span className="block min-w-0 text-[0.9375rem] leading-snug text-muted-foreground"><Struck seed={task.id} draw={!!ticked[task.id]?.pen}><TintedWords text={task.title} /></Struck></span>
                </button>
              ) : (
                <DayLine lineKey={`t:${task.id}`} register={field(`t:${task.id}`)} value={task.title} label={task.title}
                  onKey={taskKeys(task, section)}
                  onPaste={(text) => pasteLines(section, text, task.id)}
                  onLeave={({ text, link }) => rename(task, text, link)}
                  className={`w-full leading-snug text-foreground ${first ? 'text-[0.9375rem] font-semibold' : 'text-[0.9375rem]'}`} />
              )}
              <FromNote task={task} />
            </div>
            {/* On pointing: start on it, give it a length, or put it off a day. */}
            {!struck && (
              // Over the end of the line rather than beside it, so the words keep the whole width in a narrow pane;
              // beside it on the line being written, which its own tools must never cover.
              <InUse className="pointer-events-none absolute top-0.5 right-0 group-focus-within/line:static group-focus-within/line:-mt-0.5 group-focus-within/line:shrink-0 flex items-center gap-0.5 rounded-md bg-background pl-2 opacity-0 transition-opacity starting:opacity-0 group-focus-within/line:pointer-events-auto group-focus-within/line:opacity-100 group-hover/line:pointer-events-auto group-hover/line:opacity-100">{() => <>
                {section === 'now' ? (
                  <>
                    {focusToolsShown() && <Tip label="Start a session on it">
                      <button type="button" aria-label="Start a session on it" onClick={() => startOn(task)} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Timer className="size-3.5" />Start
                      </button>
                    </Tip>}
                    <DropdownMenu>
                      <Tip label="How long it takes">
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label="How long it takes" className="h-6 rounded-md px-1.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground">
                            {task.estimate ? `~${lengthSaid(task.estimate)}` : 'Time'}
                          </button>
                        </DropdownMenuTrigger>
                      </Tip>
                      <DropdownMenuContent align="end">
                        {MINUTES.map((minutes) => <DropdownMenuItem key={minutes} onSelect={() => setLength(task, minutes)}>{lengthSaid(minutes)}</DropdownMenuItem>)}
                        {task.estimate ? <DropdownMenuItem onSelect={() => setLength(task, null)}>No length</DropdownMenuItem> : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Tip label="Tomorrow instead">
                      <button type="button" aria-label="Tomorrow instead" onClick={() => moveTo(task, 1)} className="h-6 rounded-md px-1.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground">Tomorrow</button>
                    </Tip>
                  </>
                ) : (
                  <Tip label="Into today">
                    <button type="button" aria-label="Into today" onClick={() => void bring([task])} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowUpLeft className="size-3.5" />Today</button>
                  </Tip>
                )}
                {/* Everything else about it (a day, a time, notes, how it repeats) is in its panel. */}
                {onOpenTask && (
                  <Tip label="Open it: day, time, notes and more">
                    <button type="button" data-open-line={task.id} aria-label="Open it" onClick={() => (chime('tap'), onOpenTask(task.id))} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground">Open<ChevronRight className="size-3.5" /></button>
                  </Tip>
                )}
              </>}</InUse>
            )}
            {/* A length given, and how much it matters, kept in sight when not pointing; the words keep the line's start. */}
            {!struck && task.priority ? <span className="mt-[0.2rem] shrink-0 group-hover/line:hidden group-focus-within/line:hidden"><PriorityMark level={task.priority} /></span> : null}
            {!struck && task.estimate ? <span className="mt-[0.1rem] shrink-0 text-control font-medium text-muted-foreground tabular-nums group-hover/line:hidden group-focus-within/line:hidden">~{lengthSaid(task.estimate)}</span> : null}
          </div>
          </RowMenu>
          {/* Its steps, the lines written under it. */}
          {steps.map((one, n) => (
            // A step: ticked, made a line of its own, or taken out, and the words' own Cut, Copy and Paste.
            <RowMenu key={n} writes items={struck ? [] : [
              { label: one.done ? 'Not done' : 'Mark it done', run: () => tickStep(task, n) },
              { label: 'Make it a task', hint: 'A task of its own', keys: '⇧⇥', run: () => void outdent(task, n, section) },
              'separator',
              { label: 'Take the step out', danger: true, run: () => takeStep(task, n) }
            ]}>
            <div data-day-step={`${task.id}:${n}`} className={`group/step relative flex items-start gap-2 py-0.5 pl-12 transition-opacity ${struck ? 'opacity-55' : ''}`}>
              {/* Its menu from a grip, as the line's: a right click in the words would put the caret there first. */}
              {!struck && <span data-grip title="Click for its menu" onClick={openFromGrip} className="absolute top-[0.3rem] left-[1.75rem] cursor-pointer"><GripVertical aria-hidden className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/step:opacity-60" /></span>}
              <button type="button" role="checkbox" aria-checked={one.done} aria-label={one.text} onClick={() => tickStep(task, n)}
                className="relative after:absolute after:-inset-[5px] after:rounded-full mt-[0.2rem] grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors"
                style={{ borderColor: one.done ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 65%, transparent)', background: one.done ? 'var(--tt-color-text-green)' : undefined }}>
                {one.done && <Tick seed={`${task.id}:${n}`} className="size-2 text-white" />}
              </button>
              <DayLine lineKey={`s:${task.id}:${n}`} register={field(`s:${task.id}:${n}`)} value={one.text} label={one.text}
                onKey={stepKeys(task, n, section)}
                onLeave={({ text }) => renameStep(task, n, text)}
                className={`flex-1 text-control leading-snug ${one.done ? 'text-muted-foreground line-through decoration-foreground/40' : 'text-foreground'}`} />
            </div>
            </RowMenu>
          )).flatMap((line, n) => (draftHere && draft.parent?.at === n ? [<div key={`d${n}`}>{draftLine(section, 1)}</div>, line] : [line]))}
          {draftHere && draft.parent && draft.parent.at >= steps.length && draftLine(section, 1)}
          {/* Every step ticked, the line itself is offered: never ticked for you. */}
          {allSteps && !struck && (
            <div className="pl-12 pt-0.5 pb-1">
              <button type="button" data-steps-done onClick={() => tick(task)} className="rounded-md bg-foreground/[0.05] px-2 py-0.5 text-control font-medium text-foreground hover:bg-accent">
                Every step done. Tick it off?
              </button>
            </div>
          )}
          {draftHere && !draft.parent && draftLine(section, 0)}
        </div>
      </SortableRow>
    )
  }

  const newLine = (section: Section, placeholder: string): React.JSX.Element => {
    const key = `new:${section}`
    const after = (): string | null => lists[section].at(-1)?.id ?? null
    return (
      <RowMenu writes items={writtenMenu(section, key, after)}>
        <div className="flex items-start gap-2.5 py-1 pl-6">
          <span aria-hidden className="mt-[0.2rem] size-[1.0625rem] shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/40" />
          <DayLine lineKey={key} register={field(key)} value="" placeholder={placeholder} attrs={{ 'data-new': section }}
            label={`A new line in ${SECTIONS.find((one) => one.id === section)!.label}`}
            onKey={draftKeys(section, key, after)}
            onPaste={(text) => pasteLines(section, text, after())}
            onLeave={({ text, link }) => {
              // Left with words in it, they are a line.
              if (!text.trim()) return
              fields.current.get(key)?.clear()
              void add(section, text, after(), undefined, link)
            }}
            className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-foreground" />
        </div>
      </RowMenu>
    )
  }

  const move = (section: Section) => (id: string, target: string, after: boolean): void => {
    const list = lists[section].map((one) => one.id).filter((one) => one !== id)
    list.splice(list.indexOf(target) + (after ? 1 : 0), 0, id)
    void renumber(list)
  }
  const section = (id: Section): React.JSX.Element => {
    const list = lists[id]
    const { label, said } = SECTIONS.find((one) => one.id === id)!
    const shown = id === 'now' || open[id] ? list : []
    const longer = id !== 'now' && list.length > 8 && open[id] !== true
    // A faint rule between the sections, with room above and below it, so each reads as its own; the Journal's
    // short list, which has no headings, keeps plain space.
    return (
      <section key={id} data-day-section={id} aria-label={label} className={id === 'now' ? '' : compact ? 'mt-7' : 'mt-8 border-t border-foreground/[0.08] pt-7'}>
        {/* A line carried onto a heading goes into that section: Now is today, Next takes its day off, Later is someday. */}
        <header data-row-drop={compact ? undefined : id === 'now' ? 'today' : id === 'next' ? 'next' : 'someday'}
          className={`mb-1 flex items-baseline gap-2 rounded-md pl-6 ${compact ? 'sr-only' : DROP_LIT}`}>
          {id === 'now' ? (
            <h3 className="text-lg font-semibold text-foreground">{label}</h3>
          ) : (
            <button type="button" aria-expanded={open[id]} data-section-toggle={id} onClick={() => (chime(open[id] ? 'fold' : 'slide'), setOpen((all) => ({ ...all, [id]: !all[id] })))}
              className="-ml-6 flex items-baseline gap-2 rounded-md py-0.5 pr-2 pl-1 text-lg font-semibold text-foreground transition-colors hover:bg-accent/60">
              {/* Turned down when open: it reads as something that opens, not a heading over nothing. */}
              <ChevronRight aria-hidden className={`size-4 self-center text-muted-foreground transition-transform duration-200 ${open[id] ? 'rotate-90' : ''}`} />
              {label}
              <span className="text-sm font-medium text-muted-foreground tabular-nums">{list.length ? <Rolling text={list.length} /> : null}</span>
            </button>
          )}
          {id !== 'now' && <span className="text-sm text-muted-foreground">· {said.replace(/^Next, /, '')}</span>}
          {/* Late ones still open count too, so this says what Today's List and Close the day say. */}
          {id === 'now' && <NowCount open={openNow.length + before.length} late={before.length} done={now.length - openNow.length} three={threeThere === 3 ? threeDone : undefined} />}
          <span className="flex-1" />
          {id === 'now' && now.some(done) && !compact && (
            <button type="button" onClick={clearTicked} className="flex h-6 items-center rounded-md px-2 text-control text-muted-foreground hover:bg-accent hover:text-foreground">Clear ticked</button>
          )}
        </header>
        {id === 'now' && openNow.length >= 10 && (
          <p data-day-many className="mb-1 pl-6 text-sm font-medium text-[var(--tt-color-text-orange)]">{num(openNow.length)} for one day is a lot. The top three are the ones that count.</p>
        )}
        {(id === 'now' || open[id]) && (
          <>
            <SortableList items={longer ? shown.slice(0, 8) : shown} keyOf={(task) => task.id} onMove={move(id)} places={{ drop: dropOn(id), said: placeSaid, foot: foot(id) }}>
              {/* The top three, then the rest of today: a small heading inside Now, under the third, only when there is a rest.
                  No rule and no section's room above it: it is still today, so it never reads as a list of its own ahead of
                  Next (note 94925dc0: "why would 'the rest' be in front of 'next'"). Its own line between the rows, never part
                  of one, so a row dragged leaves it where it is. */}
              {(items) => items.flatMap((task) => id === 'now' && task.id === openNow[2]?.id && openNow.length > 3 ? [row(task, id), (
                <div key="top-three" data-top-three className="mt-4 mb-1 ml-6 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-foreground">Also today</span>
                  <span className="text-sm text-muted-foreground">· after the first three</span>
                </div>
              )] : [row(task, id)])}
            </SortableList>
            {draft && draft.section === id && draft.after === null && !draft.parent && draftLine(id, 0)}
            {newLine(id, id === 'now' ? (list.length ? 'Another line' : 'The first thing, the one that matters most') : id === 'next' ? 'Something for after today' : 'Something for someday')}
          </>
        )}
      </section>
    )
  }

  // The ending, read as it appears: a click later never plays it again.
  const keyed = useByKeys(loaded && now.length > 0 && !openNow.length)
  if (!loaded) return null
  const allDone = now.length > 0 && !openNow.length
  // Today's own column, the List's width: no narrower one of its own, so Today's List, Page and Matrix line up.
  return (
    <div ref={box} data-day-list className="relative">
      {/* Yesterday's, and anything older still open: faded, above, each to bring in or leave. */}
      {before.length > 0 && !compact && (
        <section data-day-before aria-label="Still open from before" className="mb-6 rounded-xl bg-foreground/[0.03] px-4 py-3">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Still open from before</p>
            <Count n={before.length} className="text-sm text-muted-foreground" />
            <span className="flex-1" />
            {before.length > 1 && <Button size="sm" variant="secondary" onClick={() => void bring(before)}>Move all to today</Button>}
          </div>
          <ul>
            {before.slice(0, 6).map((task) => (
              <li key={task.id} data-before={task.id} className="group/before flex items-center gap-3 py-1">
                {/* Done already, just not ticked: ticked here, with Undo. */}
                <Tip label="Done already">
                  <button type="button" role="checkbox" aria-checked={false} aria-label={`Done: ${task.title}`} onClick={() => void completeTask(task)}
                    className="mf-hit relative grid size-[1.0625rem] shrink-0 place-items-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:border-[var(--tt-color-text-green)]" />
                </Tip>
                {onOpenTask
                  ? <button type="button" onClick={() => onOpenTask(task.id)} className="-my-0.5 min-w-0 flex-auto truncate py-0.5 text-left text-[0.9375rem] text-foreground/70 hover:text-foreground">{taskName(task.title).text}</button>
                  : <span className="min-w-0 flex-auto truncate text-[0.9375rem] text-foreground/70">{taskName(task.title).text}</span>}
                <Tags tags={taskName(task.title).tags} />
                <span className="shrink-0 text-control text-muted-foreground">{when(task.dueAt ?? task.deadline, !task.dueAt || !!task.allDay)}</span>
                <Tip label="Move it to today's list">
                  <button type="button" onClick={() => void bring([task])} className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-control font-medium text-foreground hover:bg-accent">
                    <ArrowRight className="size-3.5" /> To today
                  </button>
                </Tip>
              </li>
            ))}
            {before.length > 6 && <li className="py-1 text-sm text-muted-foreground">and {num(before.length - 6)} more, all in “Move all to today”</li>}
          </ul>
        </section>
      )}
      {/* A day with nothing written yet: the question, and the caret already on the first line. */}
      {empty && !compact && (
        <div data-day-empty className="mb-3 pl-6">
          <h2 className="font-heading text-title font-semibold text-foreground">What matters today?</h2>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground"><Typed text="Write it out, one thing a line. The first three are the ones that count." step={24} /></p>
        </div>
      )}
      {section('now')}
      {/* The last one ticked: an ending in place, the size of the day. */}
      {allDone && (
        <div data-day-all-done className={`mt-3 flex items-center gap-3 pl-6 ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-1 duration-500'}`}>
          <Book size={28} seed="day-done" done className="" />
          <p className="text-[0.9375rem] font-semibold text-foreground">{now.length === 1 ? 'The one thing, done.' : `All ${num(now.length)} done.`} <span className="font-normal text-muted-foreground">The rest of the day is yours.</span></p>
          {!dayClosed() && !compact && <Button size="sm" variant="secondary" onClick={() => openCloseDay()}>Close the day</Button>}
        </div>
      )}
      {/* In the evening: tomorrow written down before bed, a task a line (tomorrow-lines.tsx). */}
      {!compact && <TomorrowBox className="mt-6" />}
      {!compact && section('next')}
      {!compact && section('later')}
      {!compact && (
        <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-sm text-muted-foreground">
          <span><Kbd>↵</Kbd> next line</span>
          <span><Kbd>@</Kbd> link a note</span>
          <span><Kbd>⇥</Kbd> a step of the line above</span>
          <span><Kbd>⌥↑</Kbd> <Kbd>⌥↓</Kbd> reorder</span>
          <span><Kbd>Esc</Kbd> then <Kbd>M</Kbd> <Kbd>W</Kbd> <Kbd>N</Kbd> <Kbd>L</Kbd> tomorrow, next week, Next, Later</span>
          <span><Kbd>⌘↵</Kbd> tick</span>

        </p>
      )}
    </div>
  )
}

/**
 * What a line shows only while it is pointed at or written in (its tools),
 * made only then, so a long list draws them for the line in use and not for
 * every line. Kept while one of its menus is open.
 */
function InUse({ className, children }: { className: string; children: () => React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [inUse, setInUse] = useState(false)
  useEffect(() => {
    const row = ref.current?.closest<HTMLElement>('[data-day-line]')
    if (!row) return
    const look = (): void => setInUse(row.matches(':hover') || row.contains(document.activeElement) || !!ref.current?.querySelector('[data-state=open]'))
    const events = ['pointerenter', 'pointerleave', 'focusin', 'focusout']
    for (const one of events) row.addEventListener(one, look)
    look()
    return () => { for (const one of events) row.removeEventListener(one, look) }
  }, [])
  return <span ref={ref} className={className}>{inUse ? children() : null}</span>
}

/** A line's words as written, each #tag on its tinted ground, as the line had it before it was ticked. */
function TintedWords({ text }: { text: string }): React.JSX.Element {
  const color = TAGS[0].color as (value: string) => string
  return <>{byTags(text).map((part, at) => at % 2
    ? <span key={at} className="rounded-[0.25rem]" style={{ background: `var(--tt-color-highlight-${color(part.slice(1))})`, boxShadow: `0 0 0 0.12em var(--tt-color-highlight-${color(part.slice(1))})` }}>{part}</span>
    : part)}</>
}

/**
 * "Your three: 2 of 3 done" once the day has three, then "4 done today, 5 to go"
 * when there is more (the late ones named); with fewer than three, the same. Rolling as it
 * changes; nothing before anything is written.
 */
function NowCount({ open, late, done, three }: { open: number; /** Of the open, those from earlier days, in "Still open from before". */ late: number; done: number; /** How many of the day's three are done, when it has three. */ three?: number }): React.JSX.Element | null {
  const all = open + done
  if (!all) return null
  return (
    <>
      {three !== undefined && (
        <span data-three-count className="text-sm font-semibold tabular-nums" style={{ color: three === 3 ? 'var(--tt-color-text-green)' : 'var(--foreground)' }}>
          <Rolling text={`Your three: ${num(three)} of 3 done`} by="word" />
        </span>
      )}
      {/* Before anything is ticked, the page's own count says it; past the three, the whole list. */}
      {done > 0 && (three === undefined || all > 3) && (
        <span data-now-count className="text-sm font-medium tabular-nums" style={{ color: !open ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }}>
          {/* Said as what it is: done today, and what is left, the late ones from earlier days named, since they sit in their own box. */}
          <Rolling text={`${num(done)} done today, ${num(open)} to go${late ? ` (${num(late)} from before)` : ''}`} by="word" />
        </span>
      )}
    </>
  )
}
