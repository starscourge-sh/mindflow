import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TAGS } from '@/extensions/tokens'
import { ArrowRight, ArrowUpLeft, ChevronRight, GripVertical } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import ClockIcon from '@/components/ui/clock-icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { useLive, unloaded, vigil, when, type Finished, type Task } from '@/lib/vigil'
import { bucket, placed, taskName } from '@/lib/tasks'
import { byKeys, useByKeys } from '@/lib/motion'
import { readLines, tasksOf } from '../../../../main/day-lines'
import { dayKey, num, startOfDay } from '../../../../main/dates'
import { Book, Kbd, Rolling, Tags, Tip, Typed, refuse, toast, quietly } from './ui'
import { SortableList, SortableRow } from './sortable'
import { Struck, Tick } from './marks'
import { completeTask, dayCleared, landed, moveTo, onToday, shiftTo, startOn, taskMenu, useTaskNow } from './tasks-view'
import { RowMenu, type RowItem } from './row-menu'
import { PriorityMark } from './task-input'
import { dayClosed, openCloseDay } from './close-day'
import { useArrivals } from './note-list'
import { TomorrowBox } from './tomorrow-lines'
import { TAG } from '../../../../main/tag-words'

/** A line split round its #tags: the tags at the odd places. */
const byTags = (text: string): string[] => text.split(new RegExp(`(#${TAG})`, 'gu'))
const hasTagIn = (text: string): boolean => new RegExp(`#${TAG}`, 'u').test(text)

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

const Timer = alive(ClockIcon)

type Section = 'now' | 'next' | 'later'
const SECTIONS: { id: Section; label: string; said: string }[] = [
  { id: 'now', label: 'Now', said: 'Today' },
  { id: 'next', label: 'Next', said: 'Next, no day yet' },
  { id: 'later', label: 'Later', said: 'Someday' }
]

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
  window.dispatchEvent(new CustomEvent('vigil:write-day'))
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
  const tasks = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  const today = dayKey()
  const [ticked, setTicked] = useState<Record<string, { task: Task; was?: Finished; pen: boolean }>>({})
  const [cleared, setCleared] = useState<string[]>(() => readCleared(today))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState<Record<Section, boolean>>({ now: true, next: false, later: false })
  const fields = useRef(new Map<string, HTMLTextAreaElement>())
  const want = useRef<Want | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Lines made here this sitting: taking one out deletes it, as if it was never written.
  const fresh = useRef(new Set<string>())

  const start = startOfDay()
  const end = startOfDay(1)
  const inNow = (task: Task): boolean => {
    const day = placed(task)
    if (task.status === 'open') return !task.waitingOn && day !== null && day >= start && day < end
    return task.status === 'done' && !!task.completedAt && dayKey(task.completedAt) === today && (day ?? 0) < end
  }
  const ids = new Set(tasks.map((task) => task.id))
  const now = [...tasks.filter(inNow), ...Object.values(ticked).map((one) => one.task).filter((task) => !ids.has(task.id) || !inNow(tasks.find((one) => one.id === task.id)!))]
    .filter((task, at, all) => all.findIndex((one) => one.id === task.id) === at && !cleared.includes(task.id))
    .sort(order)
  const before = tasks.filter((task) => task.status === 'open' && !task.waitingOn && (placed(task) ?? Infinity) < start)
  const next = tasks.filter((task) => task.status === 'open' && !task.waitingOn && !task.dueAt && !task.deadline && !task.planFor && !task.recurrence).sort(order)
  const later = tasks.filter((task) => task.status === 'open' && !task.waitingOn && !task.dueAt && !!bucket(task)).sort(order)
  const lists: Record<Section, Task[]> = { now, next, later }
  const done = (task: Task): boolean => !!ticked[task.id] || task.status === 'done'
  const openNow = now.filter((task) => !done(task))
  const top = new Set(openNow.slice(0, 3).map((task) => task.id))
  const arrived = useArrivals([...now, ...next, ...later].map((task) => task.id), 'day-list')

  // The caret where it was asked for, once the line it asked for is drawn:
  // asked for again on the draws just after, since a line that moves (a new
  // line made a step) is a new field, and the old one goes with the caret in it.
  const place = (asked: Want): boolean => {
    const field = fields.current.get(asked.key)
    if (!field || !field.isConnected) return false
    if (document.activeElement !== field) {
      field.focus()
      const at = asked.at === 'end' ? field.value.length : asked.at === 'start' ? 0 : asked.at
      field.setSelectionRange(at, at)
    }
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
    window.addEventListener('vigil:write-day', take)
    return () => window.removeEventListener('vigil:write-day', take)
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

  const renumber = (list: string[]): Promise<unknown> => Promise.all(list.map((id, at) => vigil.saveTask(id, { sortOrder: at })))
  /** What moving into a section changes on the task: its day, or its want of one. */
  const into = (section: Section, task?: Pick<Task, 'dueAt'>) =>
    section === 'now' ? { due: shiftTo(0, task?.dueAt) } : section === 'next' ? { due: null, plan: null } : { plan: 'someday' }

  /** A written line made a task in its section, after `after` (or first). Gives back its id. */
  const add = async (section: Section, text: string, after: string | null, list = lists[section].map((task) => task.id)): Promise<string | null> => {
    const words = text.trim()
    if (!words) return null
    onWrite?.()
    const made = await vigil.addTask(words, undefined, section === 'now')
    if (!made.existed) fresh.current.add(made.id)
    // The same words as a task already open: that one comes here, not a second.
    if (made.existed) {
      await vigil.saveTask(made.id, into(section))
      toast('Already on your list, so it moved here instead of being added twice', undefined, 'info')
    } else if (section !== 'now') await vigil.saveTask(made.id, into(section))
    const order = list.filter((id) => id !== made.id)
    order.splice(after ? order.indexOf(after) + 1 : 0, 0, made.id)
    await renumber(order)
    // A day in the words ("call Sam friday") takes it there: said, so it never just vanishes.
    if (section === 'now' && !made.existed) {
      const task = await vigil.task(made.id)
      if (task && !inNow(task)) toast(await landed(made, 'today'), () => void vigil.saveTask(made.id, { due: shiftTo(0) }))
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
      if (one.steps.length) await vigil.saveTask(id, { subtasks: one.steps })
      if (one.done) await vigil.saveTask(id, { status: 'done' })
      list = [...list.slice(0, last ? list.indexOf(last) + 1 : 0), id, ...list.slice(last ? list.indexOf(last) + 1 : 0)].filter((one, at, all) => all.indexOf(one) === at)
      last = id
    }
    if (!made.length) return
    chime('gather')
    quietly(() => void Promise.all(made.filter((one) => !one.was).map((one) => vigil.unmakeTask(one.id, false, [], []))))
    if (last) go(`t:${last}`)
  }

  /** Ticked, heard, struck through in place; the last of today's gets its ending. */
  const tick = (task: Task): void => {
    const was = ticked[task.id]?.was ?? (task.status === 'done' && task.completedAt ? { dueAt: task.dueAt, doneAt: task.completedAt, notifiedAt: new Date().toISOString(), deadlineAt: task.deadline } : undefined)
    if (was || task.status === 'done') {
      chime('off')
      setTicked(({ [task.id]: _, ...rest }) => rest)
      if (was) void vigil.undoneTask(task.id, was)
      return
    }
    chime('done')
    setTicked((all) => ({ ...all, [task.id]: { task, pen: !byKeys() } }))
    void vigil.doneTask(task.id).then(async (was) => {
      setTicked((all) => ({ ...all, [task.id]: { task, was, pen: all[task.id]?.pen ?? false } }))
      const back = (): void => {
        chime('undo')
        setTicked(({ [task.id]: _, ...rest }) => rest)
        void vigil.undoneTask(task.id, was)
      }
      if (!(await vigil.tasks()).some(onToday)) return dayCleared(back)
      quietly(back)
    })
  }

  /** A line taken out: one written just now is gone as if never written; an older one is closed. Undo brings either back. */
  const remove = async (task: Task, section: Section): Promise<void> => {
    chime('away')
    if (fresh.current.has(task.id) && !task.subtasks?.length) {
      const list = lists[section].map((one) => one.id)
      const above = list[list.indexOf(task.id) - 1] ?? null
      await vigil.unmakeTask(task.id, false, [], [])
      quietly(() => void add(section, task.title, above).then((id) => id && go(`t:${id}`)))
    } else {
      await vigil.saveTask(task.id, { status: 'dropped' })
      // Undo puts it back as it was, ticked at the same time, with the caret on it again.
      toast('Line taken out. It is in the Bin', () => void vigil.saveTask(task.id, { status: task.status, ...(task.status === 'done' ? { completedAt: task.completedAt } : {}) }).then(() => go(`t:${task.id}`)))
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
      return go(`t:${task.id}`, fields.current.get(`t:${task.id}`)?.selectionStart ?? 'end')
    }
    const target = SECTIONS[SECTIONS.findIndex((one) => one.id === section) + by]?.id
    if (!target || compact) return chime('nope')
    await crossTo(task, target, by < 0 ? 'end' : 'start')
  }
  const crossTo = async (task: Task, target: Section, where: 'start' | 'end'): Promise<void> => {
    const was = { due: task.dueAt, plan: task.planFor, sortOrder: task.sortOrder }
    setOpen((all) => ({ ...all, [target]: true }))
    await vigil.saveTask(task.id, into(target, task))
    const list = lists[target].map((one) => one.id).filter((id) => id !== task.id)
    await renumber(where === 'start' ? [task.id, ...list] : [...list, task.id])
    chime('move')
    quietly(() => void vigil.saveTask(task.id, { due: was.due, plan: was.plan, sortOrder: was.sortOrder }))
    go(`t:${task.id}`)
  }

  /** Tab: the line becomes a step of the one above it. */
  const indent = async (task: Task, section: Section): Promise<void> => {
    const list = lists[section]
    const above = list[list.findIndex((one) => one.id === task.id) - 1]
    if (!above) return chime('nope')
    if (task.subtasks?.length) return refuse('A line with steps of its own stays a line')
    const steps = above.subtasks ?? []
    await vigil.saveTask(above.id, { subtasks: [...steps, { text: task.title, done: done(task) }] })
    if (fresh.current.has(task.id)) await vigil.unmakeTask(task.id, false, [], [])
    else await vigil.saveTask(task.id, { status: 'dropped' })
    chime('tuck')
    quietly(() => void Promise.all([vigil.saveTask(above.id, { subtasks: steps }), fresh.current.has(task.id) ? add(section, task.title, above.id) : vigil.saveTask(task.id, { status: task.status })]))
    go(`s:${above.id}:${steps.length}`)
  }
  /** Shift-Tab on a step: a line of its own again, just under the one it was in. */
  const outdent = async (parent: Task, at: number, section: Section): Promise<void> => {
    const steps = parent.subtasks ?? []
    const step = steps[at]
    await vigil.saveTask(parent.id, { subtasks: steps.filter((_, n) => n !== at) })
    const id = await add(section, step.text, parent.id)
    if (id && step.done) await vigil.saveTask(id, { status: 'done' })
    chime('untuck')
    if (id) {
      quietly(() => void Promise.all([vigil.saveTask(parent.id, { subtasks: steps }), vigil.unmakeTask(id, false, [], [])]))
      go(`t:${id}`)
    }
  }
  const saveSteps = (parent: Task, steps: Task['subtasks']): Promise<unknown> => vigil.saveTask(parent.id, { subtasks: steps ?? [] })
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
    await Promise.all(list.map((task) => vigil.saveTask(task.id, into('now', task))))
    await renumber([...now.map((task) => task.id).filter((id) => !list.some((one) => one.id === id)), ...list.map((task) => task.id)])
    onWrite?.()
    chime('gather')
    quietly(() => void Promise.all(was.map((one) => vigil.saveTask(one.id, { due: one.due, plan: one.plan, sortOrder: one.sortOrder }))))
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
    void vigil.saveTask(task.id, { estimate: minutes }).then(() => {
      chime(minutes ? 'tap' : 'off')
      quietly(() => void vigil.saveTask(task.id, { estimate: was }))
    })
  }

  // --- the keys of a line ---------------------------------------------------

  /** Up and down between lines, as one page: the line before or after this one on screen. */
  const step = (from: HTMLTextAreaElement, by: -1 | 1): boolean => {
    const all = [...(box.current?.querySelectorAll<HTMLTextAreaElement>('textarea[data-line]') ?? [])]
    const to = all[all.indexOf(from) + by]
    if (!to) return false
    to.focus()
    const at = by < 0 ? to.value.length : 0
    to.setSelectionRange(at, at)
    return true
  }
  /** Keys every line shares: up and down, Escape. True when the key was taken. */
  const shared = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const field = event.currentTarget
    const atStart = field.selectionStart === 0 && field.selectionEnd === 0
    const atEnd = field.selectionStart === field.value.length
    if (event.key === 'Escape') return (field.blur(), true)
    if (!event.altKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowUp' && (atStart || !field.value.slice(0, field.selectionStart).includes('\n') && field.scrollHeight <= field.clientHeight + 4)) return step(field, -1)
    if (!event.altKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowDown' && (atEnd || field.scrollHeight <= field.clientHeight + 4)) return step(field, 1)
    return false
  }
  const caretAtStart = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0

  const taskKeys = (task: Task, section: Section) => (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const list = lists[section]
    const at = list.findIndex((one) => one.id === task.id)
    const field = event.currentTarget
    if (event.key === 'Enter' && event.metaKey) return void (event.preventDefault(), tick(task))
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      rename(task, field.value)
      // From the start of a line with words, a new line above it, as in any editor.
      if (caretAtStart(event) && field.value.trim()) return void setDraft({ section, after: list[at - 1]?.id ?? null, text: '' }), go('draft')
      const below = list[at + 1]
      if (!below) return go(`new:${section}`)
      setDraft({ section, after: task.id, text: '' })
      return go('draft')
    }
    if (event.key === 'Backspace' && caretAtStart(event) && !field.value) {
      event.preventDefault()
      step(field, -1)
      return void remove(task, section)
    }
    // ⇧⇥ on a line that is not a step: out of the page, as ⇧⇥ goes anywhere else, rather than a "nope".
    if (event.key === 'Tab' && event.shiftKey) return void rename(task, field.value)
    if (event.key === 'Tab') return void (event.preventDefault(), rename(task, field.value), void indent(task, section))
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return void (event.preventDefault(), rename(task, field.value), void shiftLine(task, section, event.key === 'ArrowUp' ? -1 : 1))
    if (shared(event)) event.preventDefault()
  }
  const stepKeys = (parent: Task, n: number, section: Section) => (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const steps = parent.subtasks ?? []
    const field = event.currentTarget
    if (event.key === 'Enter' && event.metaKey) return void (event.preventDefault(), tickStep(parent, n))
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      renameStep(parent, n, field.value)
      setDraft({ section, after: parent.id, parent: { id: parent.id, at: n + 1 }, text: '' })
      return go('draft')
    }
    if (event.key === 'Backspace' && caretAtStart(event) && !field.value) {
      event.preventDefault()
      step(field, -1)
      return takeStep(parent, n)
    }
    if (event.key === 'Tab' && event.shiftKey) return void (event.preventDefault(), renameStep(parent, n, field.value), void outdent(parent, n, section))
    if (event.key === 'Tab') return void (event.preventDefault(), chime('nope'))
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const to = n + (event.key === 'ArrowUp' ? -1 : 1)
      if (to < 0 || to >= steps.length) return chime('nope')
      const moved = [...steps]
      ;[moved[n], moved[to]] = [moved[to], moved[n]]
      chime('shift')
      void saveSteps(parent, moved).then(() => go(`s:${parent.id}:${to}`))
      return
    }
    if (shared(event)) event.preventDefault()
  }
  /** The new line at a section's end, and a draft between lines: both become a task on Enter. */
  const draftKeys = (section: Section, key: string, after: () => string | null, parent?: { id: string; at: number }) => (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const field = event.currentTarget
    const text = field.value
    const owner = parent ? lists[section].find((one) => one.id === parent.id) : undefined
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!text.trim()) {
        // An empty step: Enter steps back out, as in any outline.
        if (parent) return void (setDraft({ section, after: parent.id, text: '' }), go('draft'))
        if (key === 'draft') return void (setDraft(null), step(field, 1))
        return chime('nope')
      }
      if (parent && owner) {
        // Emptied first, so the same field, kept for the next step, never saves these words twice.
        field.value = ''
        const steps = owner.subtasks ?? []
        void saveSteps(owner, [...steps.slice(0, parent.at), { text: text.trim(), done: false }, ...steps.slice(parent.at)]).then(() => {
          chime('bead')
          setDraft({ section, after: owner.id, parent: { id: owner.id, at: parent.at + 1 }, text: '' })
          go('draft')
        })
        return
      }
      field.value = ''
      if (key === 'draft') setDraft(null)
      void add(section, text, after()).then((id) => {
        if (!id) return
        if (key === 'draft') {
          setDraft({ section, after: id, text: '' })
          go('draft')
        } else go(key)
      })
      return
    }
    if (event.key === 'Tab' && !event.shiftKey && !parent) {
      // A new line made a step of the line above it.
      event.preventDefault()
      const above = after() ? lists[section].find((one) => one.id === after()) : lists[section].at(-1)
      if (!above) return chime('nope')
      chime('tuck')
      setDraft({ section, after: above.id, parent: { id: above.id, at: (above.subtasks ?? []).length }, text })
      return go('draft')
    }
    if (event.key === 'Tab' && event.shiftKey && parent) {
      event.preventDefault()
      chime('untuck')
      setDraft({ section, after: parent.id, text })
      return go('draft')
    }
    if (event.key === 'Backspace' && !text && key === 'draft') {
      event.preventDefault()
      setDraft(null)
      step(field, -1)
      return
    }
    if (shared(event)) event.preventDefault()
  }

  const rename = (task: Task, text: string): void => {
    const words = text.trim()
    if (!words || words === task.title) return
    void vigil.saveTask(task.id, { title: words })
  }
  const renameStep = (parent: Task, n: number, text: string): void => {
    const steps = parent.subtasks ?? []
    const words = text.trim()
    if (!words || words === steps[n]?.text) return
    void saveSteps(parent, steps.map((one, at) => (at === n ? { ...one, text: words } : one)))
  }
  /** A paste of several lines: each a line of its own. One line pastes as words. */
  const onPaste = (section: Section, after: () => string | null) => (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const text = event.clipboardData.getData('text/plain')
    if (readLines(text).length < 2) return
    event.preventDefault()
    void paste(section, text, after())
  }

  // --- drawn -----------------------------------------------------------------

  const field = (key: string) => (node: HTMLTextAreaElement | null): void => {
    if (node) fields.current.set(key, node)
    else fields.current.delete(key)
  }
  /**
   * A line being written, right-clicked: its words made a task (a step, under
   * a line) as Enter makes them, and the words' own Cut, Copy and Paste.
   */
  const writtenMenu = (step: boolean) => (field: HTMLElement | null): RowItem[] =>
    field instanceof HTMLTextAreaElement && field.value.trim()
      ? [{ label: step ? 'Make it a step' : 'Make it a task', keys: '↵', run: () => void setTimeout(() => (field.focus(), field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))), 0) }]
      : []
  /** Focus gone into a right-click menu: the line is still being written, not left. */
  const intoMenu = (event: React.FocusEvent): boolean => !!(event.relatedTarget as Element | null)?.closest?.('[role=menu]')
  const draftLine = (section: Section, depth: 0 | 1): React.JSX.Element => (
    <RowMenu writes items={writtenMenu(!!draft?.parent)}>
    <div className={`flex items-start gap-2.5 py-1 ${depth ? 'pl-8' : 'pl-6'}`}>
      <span aria-hidden className={`mt-[0.3rem] shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/50 ${depth ? 'size-3.5' : 'size-[1.0625rem]'}`} />
      <div className="relative min-w-0 flex-1">
      <TagTint />
      <textarea data-line data-draft ref={field('draft')} rows={1} defaultValue={draft?.text} aria-label="A new line"
        onKeyDown={draftKeys(section, 'draft', () => draft?.after ?? null, draft?.parent)}
        onPaste={onPaste(section, () => draft?.after ?? null)}
        onBlur={(event) => {
          if (intoMenu(event)) return
          // Left with words in it, they are kept; left empty, the draft goes.
          const text = event.currentTarget.value.trim()
          const was = draft
          setDraft(null)
          if (!text || !was) return
          if (was.parent) {
            const owner = lists[section].find((one) => one.id === was.parent!.id)
            if (owner) void saveSteps(owner, [...(owner.subtasks ?? []).slice(0, was.parent.at), { text, done: false }, ...(owner.subtasks ?? []).slice(was.parent.at)])
          } else void add(section, text, was.after)
        }}
        className={`relative block w-full resize-none bg-transparent leading-snug outline-none [field-sizing:content] placeholder:text-muted-foreground ${depth ? 'text-control' : 'text-[0.9375rem]'}`} />
      </div>
    </div>
    </RowMenu>
  )

  const row = (task: Task, section: Section): React.JSX.Element => {
    const struck = done(task)
    const steps = task.subtasks ?? []
    const allSteps = steps.length > 0 && steps.every((one) => one.done)
    const first = section === 'now' && top.has(task.id)
    const draftHere = draft && draft.section === section && draft.after === task.id
    return (
      <SortableRow key={task.id} id={task.id}>
        <div data-day-line={task.id} data-section={section} data-done={struck || undefined} data-top={first || undefined}
          className={`group/line relative rounded-md ${task.id === openId ? 'bg-accent/50' : ''} ${arrived(task.id) ? 'mf-arrive' : ''}`}>
          {/* Right-clicked, the menu a task has on every list, with the words' own Cut, Copy and Paste after it. */}
          <RowMenu writes items={taskMenu(task, { open: () => (chime('open'), onOpenTask ? onOpenTask(task.id) : window.api.openInHome('task', task.id)), complete: () => tick(task), now: taskNow })}>
          <div className="flex items-start gap-2.5 py-1 pr-1">
            {/* The handle, shown on pointing; the whole row drags, the words never. */}
            {/* Shown on the line being written too: it says the line can move, and ⌥↑ ⌥↓ (said under the list) moves it from the keys. */}
            <span aria-hidden title="Drag to move it, or ⌥↑ ⌥↓" className="mt-[0.3rem] w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/line:opacity-60 group-focus-within/line:opacity-60">
              <GripVertical className="size-3.5" />
            </span>
            <Tip label={struck ? 'Not done after all' : 'Done  ⌘↵'}>
              <button type="button" role="checkbox" aria-checked={struck} aria-label={task.title} onClick={() => tick(task)}
                className="mt-[0.2rem] grid size-[1.0625rem] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
                style={{ borderColor: struck ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 75%, transparent)', background: struck ? 'var(--tt-color-text-green)' : undefined }}>
                {struck && <Tick seed={task.id} draw={!!ticked[task.id]?.pen} className="size-2.5 text-white" />}
              </button>
            </Tip>
            <div className="relative min-w-0 flex-1">
              {struck ? (
                // Done, the words are struck by hand where they were written, and left there.
                <button type="button" onClick={() => tick(task)} className="block w-full text-left">
                  <span className="block min-w-0 text-[0.9375rem] leading-snug text-muted-foreground"><Struck seed={task.id} draw={!!ticked[task.id]?.pen}><TintedWords text={task.title} /></Struck></span>
                </button>
              ) : (
                <LineField data-line register={field(`t:${task.id}`)} value={task.title} aria-label={task.title}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={taskKeys(task, section)}
                  onPaste={onPaste(section, () => task.id)}
                  onBlur={(event) => rename(task, event.currentTarget.value)}
                  className={`block w-full resize-none bg-transparent leading-snug text-foreground outline-none [field-sizing:content] ${first ? 'text-[0.9375rem] font-semibold' : 'text-[0.9375rem]'}`} />
              )}
            </div>
            {/* On pointing: start on it, give it a length, or put it off a day. */}
            {!struck && (
              // Over the end of the line rather than beside it, so the words keep the whole width in a narrow pane.
              <span className="pointer-events-none absolute top-0.5 right-0 flex items-center gap-0.5 rounded-md bg-background pl-2 opacity-0 transition-opacity group-focus-within/line:pointer-events-auto group-focus-within/line:opacity-100 group-hover/line:pointer-events-auto group-hover/line:opacity-100">
                {section === 'now' ? (
                  <>
                    <Tip label="Start a session on it">
                      <button type="button" aria-label="Start a session on it" onClick={() => startOn(task)} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Timer className="size-3.5" />Start
                      </button>
                    </Tip>
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
              </span>
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
            <div data-day-step={`${task.id}:${n}`} className={`flex items-start gap-2 py-0.5 pl-12 transition-opacity ${struck ? 'opacity-55' : ''}`}>
              <button type="button" role="checkbox" aria-checked={one.done} aria-label={one.text} onClick={() => tickStep(task, n)}
                className="relative after:absolute after:-inset-[5px] after:rounded-full mt-[0.2rem] grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors"
                style={{ borderColor: one.done ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 65%, transparent)', background: one.done ? 'var(--tt-color-text-green)' : undefined }}>
                {one.done && <Tick seed={`${task.id}:${n}`} className="size-2 text-white" />}
              </button>
              <LineField data-line register={field(`s:${task.id}:${n}`)} value={one.text} aria-label={one.text}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={stepKeys(task, n, section)}
                onBlur={(event) => renameStep(task, n, event.currentTarget.value)}
                wrap="min-w-0 flex-1"
                className={`resize-none bg-transparent text-control leading-snug outline-none [field-sizing:content] ${one.done ? 'text-muted-foreground line-through decoration-foreground/40' : 'text-foreground'}`} />
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
          {/* The top three and the rest: a line under the third, only when there is a rest, saying what it parts. */}
          {section === 'now' && task.id === openNow[2]?.id && openNow.length > 3 && (
            <div data-top-three className="my-1.5 ml-6 flex items-center gap-2 text-control text-muted-foreground">
              <span>The rest, once the first three are done</span>
              <span aria-hidden className="h-px flex-1 bg-border/70" />
            </div>
          )}
        </div>
      </SortableRow>
    )
  }

  const newLine = (section: Section, placeholder: string): React.JSX.Element => (
    <RowMenu writes items={writtenMenu(false)}>
    <div className="flex items-start gap-2.5 py-1 pl-6">
      <span aria-hidden className="mt-[0.3rem] size-[1.0625rem] shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/40" />
      <div className="relative min-w-0 flex-1">
      <TagTint />
      <textarea data-line data-new={section} ref={field(`new:${section}`)} rows={1} aria-label={`A new line in ${SECTIONS.find((one) => one.id === section)!.label}`} placeholder={placeholder}
        onKeyDown={draftKeys(section, `new:${section}`, () => lists[section].at(-1)?.id ?? null)}
        onPaste={onPaste(section, () => lists[section].at(-1)?.id ?? null)}
        onBlur={(event) => {
          const text = event.currentTarget.value.trim()
          if (!text || intoMenu(event)) return
          event.currentTarget.value = ''
          void add(section, text, lists[section].at(-1)?.id ?? null)
        }}
        className="relative block w-full resize-none bg-transparent text-[0.9375rem] leading-snug outline-none [field-sizing:content] placeholder:text-muted-foreground/80" />
      </div>
    </div>
    </RowMenu>
  )

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
    return (
      <section key={id} data-day-section={id} aria-label={label} className={id === 'now' ? '' : 'mt-7'}>
        <header className={`mb-1 flex items-baseline gap-2 pl-6 ${compact ? 'sr-only' : ''}`}>
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
          {id === 'now' && <NowCount open={openNow.length + before.length} done={now.length - openNow.length} />}
          <span className="flex-1" />
          {id === 'now' && now.some(done) && !compact && (
            <button type="button" onClick={clearTicked} className="rounded-md px-1.5 py-0.5 text-control text-muted-foreground hover:bg-accent hover:text-foreground">Clear ticked</button>
          )}
        </header>
        {id === 'now' && openNow.length >= 10 && (
          <p data-day-many className="mb-1 pl-6 text-sm font-medium text-[var(--tt-color-text-orange)]">{num(openNow.length)} for one day is a lot. The top three are the ones that count.</p>
        )}
        {(id === 'now' || open[id]) && (
          <>
            <SortableList items={longer ? shown.slice(0, 8) : shown} keyOf={(task) => task.id} onMove={move(id)}>
              {(items) => items.map((task) => row(task, id))}
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
  return (
    <div ref={box} data-day-list className={`relative ${compact ? '' : 'mx-auto max-w-[44rem]'}`}>
      {/* Yesterday's, and anything older still open: faded, above, each to bring in or leave. */}
      {before.length > 0 && !compact && (
        <section data-day-before aria-label="Still open from before" className="mb-6 rounded-xl bg-foreground/[0.03] px-4 py-3">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Still open from before</p>
            <span className="text-sm text-muted-foreground tabular-nums">{num(before.length)}</span>
            <span className="flex-1" />
            {before.length > 1 && <Button size="sm" variant="secondary" onClick={() => void bring(before)}>Bring all</Button>}
          </div>
          <ul>
            {before.slice(0, 6).map((task) => (
              <li key={task.id} data-before={task.id} className="group/before flex items-center gap-3 py-1">
                {/* Done already, just not ticked: ticked here, with Undo. */}
                <Tip label="Done already">
                  <button type="button" role="checkbox" aria-checked={false} aria-label={`Done: ${task.title}`} onClick={() => void completeTask(task)}
                    className="grid size-[1.0625rem] shrink-0 place-items-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:border-[var(--tt-color-text-green)]" />
                </Tip>
                {onOpenTask
                  ? <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-auto truncate text-left text-[0.9375rem] text-foreground/70 hover:text-foreground">{taskName(task.title).text}</button>
                  : <span className="min-w-0 flex-auto truncate text-[0.9375rem] text-foreground/70">{taskName(task.title).text}</span>}
                <Tags tags={taskName(task.title).tags} />
                <span className="shrink-0 text-control text-muted-foreground">{when(task.dueAt ?? task.deadline, !task.dueAt || !!task.allDay)}</span>
                <button type="button" onClick={() => void bring([task])} className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-control font-medium text-foreground hover:bg-accent">
                  <ArrowRight className="size-3.5" /> Bring it
                </button>
              </li>
            ))}
            {before.length > 6 && <li className="py-1 text-sm text-muted-foreground">and {num(before.length - 6)} more, all in “Bring all”</li>}
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
          <span><Kbd>⇥</Kbd> a step of the line above</span>
          <span><Kbd>⌥↑</Kbd> <Kbd>⌥↓</Kbd> move</span>
          <span><Kbd>⌘↵</Kbd> tick</span>
          <span><Kbd>Esc</Kbd> stop writing</span>
        </p>
      )}
    </div>
  )
}

/**
 * A line's words, written straight into: kept as typed while it has the
 * caret, and brought up to date from the task when it does not, so a rename
 * from anywhere else shows without the field being made again under you.
 */
function LineField({ value, register, wrap = 'w-full', className, ...rest }: { value: string; register: (node: HTMLTextAreaElement | null) => void; /** The box around it, in its row. */ wrap?: string } & Omit<React.ComponentProps<'textarea'>, 'value' | 'ref'>): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const node = ref.current
    if (node && document.activeElement !== node && node.value !== value) node.value = value
  }, [value])
  return (
    <div className={`relative ${wrap}`}>
      <TagTint />
      <textarea rows={1} defaultValue={value} ref={(node) => { ref.current = node; register(node) }} className={`relative block w-full ${className ?? ''}`} {...rest} />
    </div>
  )
}

/**
 * A written line's #tags tinted where they are typed, as a note tints them:
 * the words drawn again behind the field, see-through, with only each tag's
 * ground showing, in its colour from the Tags page. Read from the field (the
 * one after it) as it is typed in, left or filled again, in its own font.
 */
function TagTint(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [font, setFont] = useState<React.CSSProperties>({})
  const read = useCallback((): void => {
    const field = ref.current?.nextElementSibling
    if (!(field instanceof HTMLTextAreaElement)) return
    setText(field.value)
    if (!hasTagIn(field.value)) return
    // Each part of the font on its own: the shorthand reads empty when the font has features or a variable axis set.
    const look = getComputedStyle(field)
    const next: React.CSSProperties = { fontFamily: look.fontFamily, fontSize: look.fontSize, fontWeight: look.fontWeight, fontStyle: look.fontStyle, lineHeight: look.lineHeight, letterSpacing: look.letterSpacing, wordSpacing: look.wordSpacing, fontFeatureSettings: look.fontFeatureSettings, fontVariationSettings: look.fontVariationSettings, fontOpticalSizing: look.fontOpticalSizing as React.CSSProperties['fontOpticalSizing'] }
    setFont((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next))
  }, [])
  // Each draw, as the words may have been put back from the task under it.
  useLayoutEffect(read)
  useEffect(() => {
    const field = ref.current?.nextElementSibling
    if (!field) return
    const again = (): void => (read(), void requestAnimationFrame(read))
    const events = ['input', 'focusin', 'focusout']
    for (const one of events) field.addEventListener(one, again)
    return () => { for (const one of events) field.removeEventListener(one, again) }
  }, [read])
  const color = TAGS[0].color as (value: string) => string
  return (
    <div ref={ref} aria-hidden data-tag-tint style={font} className="pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent select-none">
      {hasTagIn(text) && byTags(text).map((part, at) => at % 2
        ? <span key={at} data-tag-tint-tag className="rounded-[0.25rem]" style={{ background: `var(--tt-color-highlight-${color(part.slice(1))})`, boxShadow: `0 0 0 0.12em var(--tt-color-highlight-${color(part.slice(1))})` }}>{part}</span>
        : part)}
    </div>
  )
}

/** A line's words as written, each #tag on its tinted ground, as the line had it before it was ticked. */
function TintedWords({ text }: { text: string }): React.JSX.Element {
  const color = TAGS[0].color as (value: string) => string
  return <>{byTags(text).map((part, at) => at % 2
    ? <span key={at} className="rounded-[0.25rem]" style={{ background: `var(--tt-color-highlight-${color(part.slice(1))})`, boxShadow: `0 0 0 0.12em var(--tt-color-highlight-${color(part.slice(1))})` }}>{part}</span>
    : part)}</>
}

/** "2 of 5 done", rolling as it changes; nothing before anything is written. */
function NowCount({ open, done }: { open: number; done: number }): React.JSX.Element | null {
  const all = open + done
  // Before anything is ticked, the page's own count says it.
  if (!all || !done) return null
  return (
    <span data-now-count className="text-sm font-medium tabular-nums" style={{ color: !open ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }}>
      <Rolling text={`${num(done)} of ${num(all)} done`} by="word" />
    </span>
  )
}
