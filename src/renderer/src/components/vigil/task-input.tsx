import { useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarClock, CalendarDays, Repeat, Telescope } from 'lucide-react'

import { chime, step } from '@/lib/sound'
import { vigil, type Task } from '@/lib/vigil'
import { BUCKETS, bucket, planKey } from '@/lib/tasks'
import { PRIORITY_NAMES, bucketOf, readTask, type ReadTask, type Span } from '../../../../main/task-words'
import { Rolling, toast } from './ui'
import type { TokenPattern } from '@/extensions/tokens'
import type { BlockColor } from '@/extensions/block-color'

/** A date the way a chip says it: "Today 15:00", "Tue", "15 Oct". */
export function short(iso: string, allDay: boolean): string {
  const date = new Date(iso)
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 && days < 7 ? date.toLocaleDateString([], { weekday: 'short' }) : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  return allDay ? day : `${day} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/**
 * Linear's priority icons, drawn as Linear draws them: three bars filled to
 * the level, a filled square with a mark for Urgent, three dashes for none.
 */
export function PriorityIcon({ level, className = 'size-3.5' }: { level: number; className?: string }): React.JSX.Element {
  if (level === 1)
    return (
      <svg viewBox="0 0 16 16" className={className} aria-label="Urgent" style={{ color: 'var(--tt-color-text-orange)' }}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path d="M8 4v5M8 11.5v.5" stroke="var(--background, white)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  if (!level)
    return (
      <svg viewBox="0 0 16 16" className={`${className} text-muted-foreground`} aria-label="No priority">
        {[1.5, 6.5, 11.5].map((x) => <rect key={x} x={x} y="7.25" width="3" height="1.5" rx="0.5" fill="currentColor" />)}
      </svg>
    )
  return (
    <svg viewBox="0 0 16 16" className={className} aria-label={PRIORITY_NAMES[level]}>
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
    toast(level ? `Priority: ${PRIORITY_NAMES[level]}` : 'No priority', () => void vigil.saveTask(task.id, { priority: was }))
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

const TINT: Record<Span['kind'], BlockColor> = { date: 'blue', deadline: 'red', repeat: 'purple', priority: 'orange', plan: 'green' }

/**
 * The same lighting for a task typed in the box's editor, as token patterns
 * it paints with. `line` gives the words to read, or null when the note is
 * not a task. The patterns are read each time the editor paints, so each one
 * answers with what the words say now; one reading serves all five.
 */
export function taskTokens(line: () => string | null): TokenPattern[] {
  let last: [string | null, ReadTask | null] = [null, null]
  const read = (): ReadTask | null => {
    const text = line()
    if (text !== last[0]) last = [text, text?.trim() ? readTask(text) : null]
    return last[1]
  }
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (Object.keys(TINT) as Span['kind'][]).map((kind) => ({
    name: `task-${kind}`,
    color: TINT[kind],
    // The task is its first line; the rest is notes, and its words are only words.
    firstBlockOnly: true,
    get pattern() {
      const text = line() ?? ''
      const words = (read()?.spans ?? []).filter((one) => one.kind === kind).map((one) => escape(text.slice(one.from, one.to)))
      // Nothing to light: a pattern that never matches.
      return words.length ? new RegExp(words.join('|')) : /(?!)/
    }
  }))
}

/** What the words were read as, one small chip each: the date, the deadline, the repeat, the priority. */
export function TaskChips({ read }: { read: ReadTask | null }): React.JSX.Element {
  const chips: { key: string; icon: React.ReactNode; label: string; tint: string }[] = []
  if (read?.due)
    chips.push({ key: 'date', icon: <CalendarDays className="size-3" />, label: short(read.due, read.allDay), tint: TINT.date })
  if (read?.deadline) chips.push({ key: 'deadline', icon: <CalendarClock className="size-3" />, label: `Due by ${short(read.deadline, !read.deadlineTimed)}`, tint: TINT.deadline })
  if (read?.recurrence) chips.push({ key: 'repeat', icon: <Repeat className="size-3" />, label: read.recurrence.replace(/^every!?\s*/i, 'Every '), tint: TINT.repeat })
  if (read?.plan) chips.push({ key: 'plan', icon: <Telescope className="size-3" />, label: BUCKETS[bucketOf(read.plan)!], tint: TINT.plan })
  if (read?.priority) chips.push({ key: 'priority', icon: <PriorityIcon level={read.priority} className="size-3" />, label: PRIORITY_NAMES[read.priority], tint: TINT.priority })
  return (
    <span className="flex shrink-0 items-center gap-1">
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <motion.span
            key={chip.key}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.14 }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap"
            style={{ background: `var(--tt-color-highlight-${chip.tint})`, color: `var(--tt-color-text-${chip.tint})` }}
          >
            {chip.icon}
            <Rolling text={chip.label} by="word" />
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}

/**
 * The line a task is typed into, Todoist's way: the words it read as a date,
 * a deadline, a repeat or a priority light up where they stand, and chips at
 * the end say what it understood. A plain input over a copy of its own text,
 * so the typing is the browser's and only the colour is drawn.
 */
export function TaskInput({ value, onChange, inputRef, placeholder, className = '', onKeyDown, autoFocus }: {
  value: string
  onChange: (value: string) => void
  inputRef?: React.Ref<HTMLInputElement>
  placeholder?: string
  className?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
}): React.JSX.Element {
  const read = useMemo(() => (value.trim() ? readTask(value) : null), [value])
  const mirror = useRef<HTMLDivElement>(null)
  const follow = (event: React.SyntheticEvent<HTMLInputElement>): void => void (mirror.current && (mirror.current.scrollLeft = event.currentTarget.scrollLeft))
  const pieces: React.ReactNode[] = []
  let at = 0
  for (const span of read?.spans ?? []) {
    if (span.from < at) continue
    pieces.push(value.slice(at, span.from))
    pieces.push(<mark key={span.from} className="rounded-sm text-inherit" style={{ background: `var(--tt-color-highlight-${TINT[span.kind]})`, color: `var(--tt-color-text-${TINT[span.kind]})` }}>{value.slice(span.from, span.to)}</mark>)
    at = span.to
  }
  pieces.push(value.slice(at))
  return (
    <span className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}>
      <span className="relative min-w-0 flex-1">
        <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre">{pieces}</div>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => (onChange(event.target.value), follow(event))}
          onScroll={follow}
          onSelect={follow}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="relative w-full bg-transparent text-transparent caret-foreground outline-none placeholder:text-foreground/70"
        />
      </span>
      <TaskChips read={read} />
    </span>
  )
}
