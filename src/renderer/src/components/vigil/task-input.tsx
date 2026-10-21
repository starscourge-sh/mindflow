import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Timer } from 'lucide-react'

import { chime, step } from '@/lib/sound'
import { useLive, vigil, type Task } from '@/lib/vigil'
import { BUCKETS, bucket, planKey } from '@/lib/tasks'
import { hoursSaid } from '@/lib/day-plan'
import { PRIORITY_NAMES, TAG_HERE, bucketOf, readTask, readySaid, type ReadTask, type Span } from '../../../../main/task-words'
import { Rolling, Tip, toast, quietly } from './ui'
import type { BlockColor } from '@/extensions/block-color'
import { short } from '@/lib/clock'
import { Bell, Timer as CalendarClock, Repeat, Bookmark as Telescope } from '@/components/ui/icons'

export { short }

/**
 * Linear's priority icons, drawn as Linear draws them: three bars filled to
 * the level, a filled square with a mark for Urgent, three dashes for none.
 */
/**
 * A task's priority on its row, with a tip saying which, the same on every
 * list. None keeps the mark's room, empty, so every title starts in line.
 */
/**
 * A task's priority, as a small mark before its title. Without one, it keeps
 * the mark's room only when `room` says another row in the same list has a
 * mark (`markRoom`), so titles start in line; otherwise nothing at all, and
 * the title sits right after the circle.
 */
export function PriorityMark({ level, className = 'size-3 shrink-0', room = false }: { level: number; className?: string; room?: boolean }): React.JSX.Element | null {
  if (!level) return room ? <span aria-hidden data-priority-slot="" className={`flex shrink-0 ${className}`} /> : null
  // Named as a picture, so it is read out as "Priority: High", not skipped as a bare shape.
  return <Tip label={`Priority: ${PRIORITY_NAMES[level]}`}><span role="img" data-mark data-priority={level} className="flex shrink-0"><PriorityIcon level={level} className={className} /></span></Tip>
}

/** Whether a list needs the priority mark's room: some row in it has a mark. */
export const markRoom = (tasks: readonly Pick<Task, 'priority'>[]): boolean => tasks.some((task) => !!task.priority)

/** Most pressing first, the order the Tasks page keeps: Urgent, High, Medium, Low, then none. */
export const byPriority = (a: Pick<Task, 'priority'>, b: Pick<Task, 'priority'>): number => (a.priority || 5) - (b.priority || 5)

export function PriorityIcon({ level, className = 'size-3.5' }: { level: number; className?: string }): React.JSX.Element {
  if (level === 1)
    return (
      <svg viewBox="0 0 16 16" aria-hidden className={className} style={{ color: 'var(--tt-color-text-orange)' }}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path d="M8 4v5M8 11.5v.5" stroke="var(--background, white)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  if (!level)
    return (
      <svg viewBox="0 0 16 16" aria-hidden className={`${className} text-muted-foreground`}>
        {[1.5, 6.5, 11.5].map((x) => <rect key={x} x={x} y="7.25" width="3" height="1.5" rx="0.5" fill="currentColor" />)}
      </svg>
    )
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      {[[1.5, 8], [6.5, 5], [11.5, 2]].map(([x, y], bar) => (
        <rect key={x} x={x} y={y} width="3" height={14 - y} rx="1" fill="currentColor" opacity={bar < 5 - level ? 1 : 0.3} />
      ))}
    </svg>
  )
}

/**
 * Set a task's priority, heard and undoable: each level its own note from the
 * same scale, higher the more it matters, and none falls away.
 */
export function setPriority(task: Pick<Task, 'id' | 'priority'>, level: number): void {
  if (task.priority === level) return chime('nope')
  const was = task.priority
  void vigil.saveTask(task.id, { priority: level }).then(() => {
    if (level) step(5 - level)
    else chime('off')
    quietly(() => void vigil.saveTask(task.id, { priority: was }))
  })
}

/** Put a task in a later list, without a day, and say so: undo gives the day back. */
export function planFor(task: Pick<Task, 'id' | 'dueAt' | 'deadline' | 'planFor'>, which: keyof typeof BUCKETS): void {
  if (bucket(task) === which) return chime('nope')
  const was = { due: task.dueAt, plan: task.planFor }
  void vigil.saveTask(task.id, { plan: planKey(which) }).then((before) => {
    chime('later')
    toast(`Moved to ${BUCKETS[which]}`, () => void vigil.saveTask(task.id, { ...(was.due ? { due: was.due } : { plan: was.plan }), ...(before === true ? {} : before) }))
  })
}

const TINT: Record<Span['kind'], BlockColor> = { date: 'blue', deadline: 'red', repeat: 'purple', priority: 'orange', plan: 'green', notify: 'pink', length: 'gray', snooze: 'gray', ready: 'yellow' }

/** What the words were read as, one small chip each: the date, the deadline, the repeat, the priority. */
export function TaskChips({ read }: { read: ReadTask | null }): React.JSX.Element {
  const chips: { key: string; icon: React.ReactNode; label: string; tint: string; guess?: string }[] = []
  // A date only guessed at says so: a "?" and a dashed ring, and why on hover.
  const guess = (kind: string): string | undefined => read?.spans.find((one) => one.kind === kind && one.guess)?.guess
  const week = read?.spans.find((one) => one.kind === 'deadline' && one.week)?.week
  if (read?.due)
    chips.push({ key: 'date', icon: <CalendarDays className="size-3" />, label: short(read.due, read.allDay), tint: TINT.date, guess: guess('date') })
  if (read?.deadline) chips.push({ key: 'deadline', icon: <CalendarClock className="size-3" />, label: week ? `Due ${week}` : `Due by ${short(read.deadline, !read.deadlineTimed)}`, tint: TINT.deadline, guess: guess('deadline') })
  if (read?.recurrence) chips.push({ key: 'repeat', icon: <Repeat className="size-3" />, label: read.recurrence.replace(/^every!?\s*/i, 'Every '), tint: TINT.repeat })
  if (read?.plan) chips.push({ key: 'plan', icon: <Telescope className="size-3" />, label: BUCKETS[bucketOf(read.plan)!], tint: TINT.plan })
  if (read?.priority) chips.push({ key: 'priority', icon: <PriorityIcon level={read.priority} className="size-3" />, label: PRIORITY_NAMES[read.priority], tint: TINT.priority })
  if (read?.estimate) chips.push({ key: 'length', icon: <Timer className="size-3" />, label: `~${hoursSaid(read.estimate)}`, tint: TINT.length })
  if (read?.snooze) chips.push({ key: 'snooze', icon: <Telescope className="size-3" />, label: `Hidden until ${short(read.snooze, true)}`, tint: TINT.snooze })
  if (read?.getReady) chips.push({ key: 'ready', icon: <CalendarClock className="size-3" />, label: `Get ready ${readySaid(read.getReady)}`, tint: TINT.ready })
  if (read?.notify) chips.push({ key: 'notify', icon: <Bell className="size-3" />, label: { pull: 'Pull', quiet: 'Quiet', alerts: 'Alert' }[read.notify], tint: TINT.notify })
  return (
    <span className="flex shrink-0 items-center gap-1">
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <motion.span
            key={chip.key}
            data-task-chip={chip.key}
            layout="position"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.14 }}
            data-guess={chip.guess ? 'true' : undefined}
            title={chip.guess ? `A guess: ${chip.guess.replace(/^Read/, 'read')}` : undefined}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap"
            style={{ background: `var(--tt-color-highlight-${chip.tint})`, color: `var(--tt-color-text-${chip.tint})`, ...(chip.guess && { outline: '1px dashed currentColor', outlineOffset: -1 }) }}
          >
            {chip.icon}
            <Rolling text={chip.guess ? `${chip.label}?` : chip.label} by="word" />
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}


/** A #tag in the words, lit as tags are. */
const TAG_TINT = 'brown'
const TAGS = new RegExp(String.raw`(^|\s)(#${TAG_HERE})`, 'gu')
/** The #word the caret is in, from its "#" up to the caret. */
const TAG_AT = new RegExp(String.raw`(?:^|\s)#((?:${TAG_HERE})?)$`, 'u')

/**
 * The line a task is typed into, Todoist's way: the words it read as a date,
 * a deadline, a repeat or a priority light up where they stand, #tags too,
 * and chips at the end say what it understood. A "#" offers the tags in use,
 * most used first: ↑ ↓ pick, ↵ or Tab takes one, Esc puts them away. A plain
 * input over a copy of its own text, so the typing is the browser's and only
 * the colour is drawn: every key, ⌥3's "#" with it, types as it does anywhere.
 */
export function TaskInput({ value, onChange, inputRef, placeholder, className = '', onKeyDown, autoFocus, label }: {
  value: string
  onChange: (value: string) => void
  inputRef?: React.Ref<HTMLInputElement>
  placeholder?: string
  className?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  label?: string
}): React.JSX.Element {
  const read = useMemo(() => (value.trim() ? readTask(value) : null), [value])
  const mirror = useRef<HTMLDivElement>(null)
  const own = useRef<HTMLInputElement | null>(null)
  const follow = (event: React.SyntheticEvent<HTMLInputElement>): void => void (mirror.current && (mirror.current.scrollLeft = event.currentTarget.scrollLeft))
  // The tag being typed, and the tags in use that start with it, then hold it.
  const [caret, setCaret] = useState<number | null>(null)
  const [pick, setPick] = useState(0)
  const [shut, setShut] = useState<string | null>(null)
  const all = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const typed = caret === null ? null : TAG_AT.exec(value.slice(0, caret))
  const part = typed ? typed[1].toLowerCase() : null
  const offered = part === null || shut === value ? []
    : [...all.filter((one) => one.tag.startsWith(part)), ...all.filter((one) => !one.tag.startsWith(part) && one.tag.includes(part))].filter((one) => one.tag !== part).slice(0, 6)
  const at = Math.min(pick, Math.max(0, offered.length - 1))
  const take = (tag: string): void => {
    if (caret === null || part === null) return
    const from = caret - part.length
    const next = `${value.slice(0, from)}${tag} ${value.slice(caret).replace(/^\s+/, '')}`
    const end = from + tag.length + 1
    chime('tap')
    onChange(next)
    setPick(0)
    landing.current = end
    setCaret(end)
  }
  // Where the caret goes once a tag taken is in the words: set before the next key can land.
  const landing = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = own.current
    if (landing.current === null || !el) return
    el.focus()
    el.setSelectionRange(landing.current, landing.current)
    landing.current = null
  }, [value])
  const spans: { from: number; to: number; tint: string; guess?: boolean }[] = (read?.spans ?? []).map((span) => ({ from: span.from, to: span.to, tint: TINT[span.kind], guess: !!span.guess }))
  for (const match of value.matchAll(TAGS)) {
    const from = match.index + match[1].length
    const to = from + match[2].length
    if (!spans.some((span) => span.from < to && from < span.to)) spans.push({ from, to, tint: TAG_TINT })
  }
  spans.sort((a, b) => a.from - b.from)
  const pieces: React.ReactNode[] = []
  let cut = 0
  for (const span of spans) {
    if (span.from < cut) continue
    pieces.push(value.slice(cut, span.from))
    pieces.push(<mark key={span.from} className="rounded-sm text-inherit" style={{ background: `var(--tt-color-highlight-${span.tint})`, color: `var(--tt-color-text-${span.tint})`, ...(span.guess && { outline: '1px dashed currentColor', outlineOffset: -1 }) }}>{value.slice(span.from, span.to)}</mark>)
    cut = span.to
  }
  pieces.push(value.slice(cut))
  const where = (event: React.SyntheticEvent<HTMLInputElement>): void => {
    const el = event.currentTarget
    setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null)
  }
  return (
    <span className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}>
      <span className="relative min-w-0 flex-1">
        <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre">{pieces}</div>
        <input
          ref={(node) => {
            own.current = node
            if (typeof inputRef === 'function') inputRef(node)
            else if (inputRef) (inputRef as React.RefObject<HTMLInputElement | null>).current = node
          }}
          data-task-input
          aria-label={label}
          autoFocus={autoFocus}
          value={value}
          aria-expanded={offered.length > 0}
          aria-autocomplete="list"
          onChange={(event) => (onChange(event.target.value), follow(event), where(event))}
          onScroll={follow}
          onSelect={(event) => (follow(event), where(event))}
          onBlur={() => setCaret(null)}
          onKeyDown={(event) => {
            if (offered.length && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                return setPick((at + (event.key === 'ArrowDown' ? 1 : offered.length - 1)) % offered.length)
              }
              // A tag typed out whole is kept as typed: ↵ adds the task, Tab still takes the one offered.
              if (event.key === 'Tab' || (event.key === 'Enter' && !all.some((one) => one.tag === part))) return (event.preventDefault(), event.stopPropagation(), take(offered[at].tag))
              if (event.key === 'Escape') return (event.preventDefault(), event.stopPropagation(), setShut(value))
            }
            onKeyDown?.(event)
          }}
          placeholder={placeholder}
          className="relative w-full bg-transparent text-transparent caret-foreground outline-none placeholder:text-foreground/70 placeholder-shown:text-ellipsis"
        />
        {offered.length > 0 && (
          <div data-tag-offers role="listbox" aria-label="Tags in use"
            className="absolute top-full left-0 z-50 mt-1.5 flex w-56 flex-col rounded-lg bg-popover p-1 text-control text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">
            {offered.map((one, index) => (
              <button key={one.tag} type="button" role="option" aria-selected={index === at} data-tag-offer={one.tag} tabIndex={-1}
                onMouseDown={(event) => (event.preventDefault(), take(one.tag))} onPointerEnter={() => setPick(index)}
                className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors ${index === at ? 'bg-accent' : ''}`}>
                <span className="truncate">#{one.tag}</span>
                <span className="shrink-0 tabular-nums text-foreground/75">{one.count}</span>
              </button>
            ))}
          </div>
        )}
      </span>
      <TaskChips read={read} />
    </span>
  )
}
