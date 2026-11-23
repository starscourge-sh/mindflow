import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tagTint } from './tag-icon'
import { NoteList } from '@/components/note-link/note-link-menu'
import type { SuggestionListHandle } from '@/components/suggestion/suggestion-renderer'

/** One canvas for measuring where a # stands in a task's field. */
let measure: CanvasRenderingContext2D | undefined
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Timer, X } from 'lucide-react'

import { chime, step } from '@/lib/sound'
import { useLive, haligtree, type Task } from '@/lib/haligtree'
import { BUCKETS, PRIORITY_TINT, bucket, levelSaid, planKey } from '@/lib/tasks'
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
  const ink = { color: `var(--tt-color-text-${PRIORITY_TINT[level]})` }
  if (level === 1)
    return (
      <svg viewBox="0 0 16 16" aria-hidden className={className} style={ink}>
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
    <svg viewBox="0 0 16 16" aria-hidden className={className} style={ink}>
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
  void haligtree.saveTask(task.id, { priority: level }).then(() => {
    if (level) step(5 - level)
    else chime('off')
    quietly(() => void haligtree.saveTask(task.id, { priority: was }))
  })
}

/** Put a task in a later list, without a day, and say so: undo gives the day back. */
export function planFor(task: Pick<Task, 'id' | 'dueAt' | 'deadline' | 'planFor'>, which: keyof typeof BUCKETS): void {
  if (bucket(task) === which) return chime('nope')
  const was = { due: task.dueAt, plan: task.planFor }
  void haligtree.saveTask(task.id, { plan: planKey(which) }).then((before) => {
    chime('later')
    toast(`Moved to ${BUCKETS[which]}`, () => void haligtree.saveTask(task.id, { ...(was.due ? { due: was.due } : { plan: was.plan }), ...(before === true ? {} : before) }))
  })
}

export const TINT: Record<Span['kind'], BlockColor> = { date: 'blue', deadline: 'red', repeat: 'purple', priority: 'orange', plan: 'green', notify: 'pink', length: 'gray', snooze: 'gray', ready: 'yellow' }
/** How a word read from a task is lit, in the box and on a line: a priority in its own level's colour (lib/tasks.ts). */
export const tintOf = (span: Pick<Span, 'kind' | 'from' | 'to'>, text: string): BlockColor =>
  span.kind === 'priority' ? (PRIORITY_TINT[levelSaid(text.slice(span.from, span.to))] ?? TINT.priority) : TINT[span.kind]

/**
 * Words read as a date, a priority or a repeat that the person kept as plain words, by the chip's × or ⌫ just after
 * them (17 Nov: "why cant i opt out of the inferred date here"): read as words, and the task's name keeps them. Held
 * by the line that adds the task (`useKept`), and sent with it (lib/tasks.ts makeTask's `plain`).
 */
export type Kept = { list: { from: number; to: number; text: string }[]; set: (list: Kept['list']) => void }
export const useKept = (): Kept => {
  const [list, set] = useState<Kept['list']>([])
  return { list, set }
}
/** The kept words where they stand in `value` now: found again by their words, nearest where they were; gone with them. */
export const keptIn = (list: Kept['list'], value: string): Kept['list'] =>
  list.flatMap((one) => {
    if (value.slice(one.from, one.to) === one.text) return [one]
    let best = -1
    for (let at = value.indexOf(one.text); at >= 0; at = value.indexOf(one.text, at + 1)) if (best < 0 || Math.abs(at - one.from) < Math.abs(best - one.from)) best = at
    if (best >= 0) return [{ ...one, from: best, to: best + one.text.length }]
    // Cut back by ⌫ from its end ("!!!" to "!!"): what is left stays words, so each press deletes and none lights it again.
    let k = 0
    while (k < one.text.length && value[one.from + k] === one.text[k]) k++
    const end = one.from + k
    return k > 0 && (end === value.length || /\s/.test(value[end])) ? [{ from: one.from, to: end, text: one.text.slice(0, k) }] : []
  })

/** What the words were read as, one small chip each: the date, the deadline, the repeat, the priority. With `onKeep`, each has an × that keeps its words as words. */
function TaskChips({ read, value, onKeep }: { read: ReadTask | null; value: string; onKeep?: (kind: Span['kind']) => void }): React.JSX.Element {
  const chips: { key: string; icon: React.ReactNode; label: string; tint: string; guess?: string }[] = []
  // A date only guessed at says so: a "?" and a dashed ring, and why on hover.
  const guess = (kind: string): string | undefined => read?.spans.find((one) => one.kind === kind && one.guess)?.guess
  const week = read?.spans.find((one) => one.kind === 'deadline' && one.week)?.week
  if (read?.due)
    chips.push({ key: 'date', icon: <CalendarDays className="size-3" />, label: short(read.due, read.allDay), tint: TINT.date, guess: guess('date') })
  if (read?.deadline) chips.push({ key: 'deadline', icon: <CalendarClock className="size-3" />, label: week ? `Due ${week}` : `Due by ${short(read.deadline, !read.deadlineTimed)}`, tint: TINT.deadline, guess: guess('deadline') })
  if (read?.recurrence) chips.push({ key: 'repeat', icon: <Repeat className="size-3" />, label: read.recurrence.replace(/^every!?\s*/i, 'Every '), tint: TINT.repeat })
  if (read?.plan) chips.push({ key: 'plan', icon: <Telescope className="size-3" />, label: BUCKETS[bucketOf(read.plan)!], tint: TINT.plan })
  if (read?.priority) chips.push({ key: 'priority', icon: <PriorityIcon level={read.priority} className="size-3" />, label: PRIORITY_NAMES[read.priority], tint: PRIORITY_TINT[read.priority] ?? TINT.priority })
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
            style={{ background: `var(--mf-chip-bg-${chip.tint})`, color: `var(--mf-chip-ink-${chip.tint})`, ...(chip.guess && { outline: '1px dashed currentColor', outlineOffset: -1 }) }}
          >
            {chip.icon}
            <Rolling text={chip.guess ? `${chip.label}?` : chip.label} by="word" />
            {onKeep && (
              <button type="button" data-keep-words={chip.key} tabIndex={-1}
                aria-label={`Keep “${read?.spans.filter((one) => one.kind === chip.key).map((one) => value.slice(one.from, one.to)).join(' ')}” as words`}
                onMouseDown={(event) => (event.preventDefault(), onKeep(chip.key as Span['kind']))}
                className="-mr-1 flex size-3.5 cursor-pointer items-center justify-center rounded-sm opacity-60 hover:bg-foreground/10 hover:opacity-100">
                <X className="size-2.5" />
              </button>
            )}
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
 * A popover's name field (the Calendar's event and task popovers): it grows to a second line rather than cut the name.
 * The words' own size and edges, so a task's lit words drawn under it (`TaskInput`) fall on them letter for letter.
 */
export const NAME_FIELD = 'block w-full min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-2 text-body outline-none [field-sizing:content] [overflow-wrap:anywhere] placeholder:text-muted-foreground'
/** A name is one line of words: a line break pasted into it is a space. */
export const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ')
/** ↵ in a name that wraps sends its form, as it did when it was one line; no line break is ever typed into a name. */
export const submitOnEnter = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void => {
  if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing || event.defaultPrevented) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

/**
 * The line a task is typed into, Todoist's way: the words it read as a date,
 * a deadline, a repeat or a priority light up where they stand, #tags too,
 * and chips at the end say what it understood. A "#" offers the tags in use,
 * most used first: ↑ ↓ pick, ↵ or Tab takes one, Esc puts them away. A plain
 * input over a copy of its own text, so the typing is the browser's and only
 * the colour is drawn: every key, ⌥3's "#" with it, types as it does anywhere.
 */
export function TaskInput({ value, onChange, inputRef, placeholder, className = '', onKeyDown, onBlur, autoFocus, label, kept, attrs, trail, grows = false }: {
  value: string
  /** A name field that grows to a second line rather than cut the name (`NAME_FIELD`): ↵ still sends its form. */
  grows?: boolean
  /** The field's own marks and handlers beyond these (a subtask's `data-subtask`, its paste). */
  attrs?: React.InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string | number | undefined>
  /** Drawn after the words in place of the chips, from the field's own reading of them (a subtask's offer to be a task). */
  trail?: (read: ReadTask | null) => React.ReactNode
  /** Words kept as plain words (`useKept`): the chips' × and ⌫ just after lit words keep them. */
  kept?: Kept
  onChange: (value: string) => void
  inputRef?: React.Ref<HTMLInputElement>
  placeholder?: string
  className?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  label?: string
}): React.JSX.Element {
  const plain = useMemo(() => (kept ? keptIn(kept.list, value) : []), [kept, value])
  const read = useMemo(() => (value.trim() ? readTask(value, new Date(), plain) : null), [value, plain])
  // Kept words deleted are let go, not held for later: typed again ("!!!" after ⌫ and a fresh start), they are read
  // again (the user, 23 Nov: "if i backspace sometimes then start again ... it stop inferring?").
  useEffect(() => {
    if (kept && plain.length !== kept.list.length) kept.set(plain)
  }, [kept, plain])
  // Keep a reading's words as words: one act, its own quiet sound, the chip folding away as the words go plain.
  const keep = (spans: Span[]): void => {
    if (!kept || !spans.length) return
    chime('off')
    kept.set([...plain, ...spans.map((one) => ({ from: one.from, to: one.to, text: value.slice(one.from, one.to) }))])
  }
  const mirror = useRef<HTMLDivElement>(null)
  const own = useRef<HTMLInputElement | null>(null)
  const follow = (event: React.SyntheticEvent<HTMLInputElement>): void => void (mirror.current && (mirror.current.scrollLeft = event.currentTarget.scrollLeft))
  // The tag being typed, and the tags in use that start with it, then hold it.
  const [caret, setCaret] = useState<number | null>(null)
  const [shut, setShut] = useState<string | null>(null)
  const all = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>)
  const typed = caret === null ? null : TAG_AT.exec(value.slice(0, caret))
  const part = typed ? typed[1].toLowerCase() : null
  const offered = part === null || shut === value ? []
    : [...all.filter((one) => one.tag.startsWith(part)), ...all.filter((one) => !one.tag.startsWith(part) && one.tag.includes(part))].filter((one) => one.tag !== part).slice(0, 6)
  const list = useRef<SuggestionListHandle>(null)
  // Where the # being typed stands in the field, as drawn (its scroll taken off): the list opens under it.
  const tagAt = (() => {
    const el = own.current
    if (!el || caret === null || part === null) return 0
    const paint = (measure ??= document.createElement('canvas').getContext('2d')!)
    paint.font = getComputedStyle(el).font
    return Math.max(0, Math.min(el.clientWidth - 240, paint.measureText(value.slice(0, caret - part.length - 1)).width - el.scrollLeft - 8))
  })()
  const take = (tag: string): void => {
    if (caret === null || part === null) return
    const from = caret - part.length
    const next = `${value.slice(0, from)}${tag} ${value.slice(caret).replace(/^\s+/, '')}`
    const end = from + tag.length + 1
    onChange(next)
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
  const spans: { from: number; to: number; tint: string; guess?: boolean }[] = (read?.spans ?? []).map((span) => ({ from: span.from, to: span.to, tint: tintOf(span, value), guess: !!span.guess }))
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
    pieces.push(<mark key={span.from} className="rounded-sm text-inherit" style={{ background: `var(--mf-chip-bg-${span.tint})`, color: `var(--mf-chip-ink-${span.tint})`, ...(span.guess && { outline: '1px dashed currentColor', outlineOffset: -1 }) }}>{value.slice(span.from, span.to)}</mark>)
    cut = span.to
  }
  pieces.push(value.slice(cut))
  const where = (event: React.SyntheticEvent<HTMLInputElement>): void => {
    const el = event.currentTarget
    setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null)
  }
  const field: React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement> & { 'data-task-input': string } = {
    ref: (node) => {
      own.current = node
      if (typeof inputRef === 'function') inputRef(node)
      else if (inputRef) (inputRef as React.RefObject<HTMLInputElement | null>).current = node
    },
    ...attrs,
    'data-task-input': '',
    'aria-label': label,
    autoFocus,
    value,
    'aria-expanded': offered.length > 0,
    'aria-autocomplete': 'list',
    onChange: (event) => (onChange(grows ? oneLine(event.target.value) : event.target.value), follow(event), where(event)),
    onScroll: follow,
    onSelect: (event) => (follow(event), where(event)),
    onBlur: (event) => (setCaret(null), onBlur?.(event)),
    onKeyDown: (event) => {
      // ⌫ just after lit words (as Todoist's): the first press keeps them as words, the next deletes as ever.
      const el = event.currentTarget
      const after = kept && event.key === 'Backspace' && !event.metaKey && !event.altKey && !event.ctrlKey && el.selectionStart === el.selectionEnd
        ? read?.spans.filter((one) => one.to === el.selectionStart) ?? [] : []
      if (after.length) return (event.preventDefault(), keep(after))
      if (offered.length && !event.metaKey && !event.altKey) {
        // A tag typed out whole is kept as typed: ↵ adds the task, Tab still takes the one offered.
        const keys = event.key === 'Tab' ? new KeyboardEvent('keydown', { key: 'Enter' }) : event.key === 'Enter' && all.some((one) => one.tag === part) ? null : event.nativeEvent
        if (keys && list.current?.onKeyDown({ event: keys } as never)) return (event.preventDefault(), event.stopPropagation(), chime('settled'))
        if (event.key === 'Escape') return (event.preventDefault(), event.stopPropagation(), setShut(value))
      }
      onKeyDown?.(event)
      if (grows) submitOnEnter(event)
    },
    placeholder
  }
  return (
    <span className={`flex min-w-0 flex-1 items-center gap-2 ${className}`}>
      <span className="relative min-w-0 flex-1">
        {/* The words drawn under the field, lit where they were read; wrapped as the field wraps them when it grows. */}
        <div ref={mirror} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${grows ? 'py-2 whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre'}`}>{pieces}</div>
        {grows
          ? <textarea {...(field as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} rows={1} className={`${NAME_FIELD} relative text-transparent caret-foreground`} />
          : <input {...field} className="relative w-full bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground placeholder-shown:text-ellipsis" />}
        {offered.length > 0 && (
          // The editor's own # list (note-link-menu.tsx NoteList), at the # being typed, never at the field's far left.
          <div data-tag-offers className="tiptap-suggestion-popup absolute top-full mt-1.5" style={{ left: tagAt }}
            onMouseDown={(event) => event.preventDefault()}>
            <NoteList ref={list} items={offered.map((one) => ({ id: one.tag, label: `#${one.tag}`, hint: String(one.count), tint: tagTint(one.tag), group: 'Tags' }))} command={(item) => take(item.id)} />
          </div>
        )}
      </span>
      {trail ? trail(read) : <TaskChips read={read} value={value} onKeep={kept && ((kind) => keep(read?.spans.filter((one) => one.kind === kind) ?? []))} />}
    </span>
  )
}
