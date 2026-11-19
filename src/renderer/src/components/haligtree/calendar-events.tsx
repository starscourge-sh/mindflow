import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { byKeys, spring, still } from '@/lib/motion'
import { edgeScroll } from '@/lib/edge-scroll'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Ban, Bell, CalendarDays, Check, ChevronRight, Clock, Copy, CopyPlus, FileText, Globe, Laptop, Link2, MapPin, Plus, Repeat as RepeatIcon, Scissors, Trash2, Users, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { clock } from '@/lib/clock'
import { moveToBin } from '@/lib/to-bin'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { changeEvent, events, inZone, inkOf, useCalendars, whenSaid, zoneGap, zoneShort, ZONES, cityOf, type Occurrence, type Repeat, type Scope, type useLayers } from '@/lib/events'
import { readEvent } from '../../../../main/event-words'
import { atOn, timeAlone } from '@/lib/tasks'
import { readTask } from '../../../../main/task-words'
import { isLast, nthOf, repeatSaid } from '../../../../main/event-repeat'
import { remindSaid } from '../../../../main/event-said'
import { lengthSaid } from '../../../../main/day-load'
import { dayjs, dayKey, num } from '../../../../main/dates'
import { DatePicker } from './date-picker'
import { TimeField } from './time-field'
import { RowMenu, copyLink, copyLinkItem, type RowItem } from './row-menu'
import { Island, Kbd, Prop, PropInput, Props, Tip, refuse, toast } from './ui'
import { quoted } from '../../../../main/clip'
import { IslandBox, useFold } from './islands'
import type { Place } from './cal-add'
import { clickOpens } from './month-plan'

/** As the grid draws hours: one hour's height, and the steps a time snaps to. */
export const HOUR = 56
const SNAP = 15
const snap = (minute: number): number => Math.max(0, Math.min(24 * 60 - SNAP, Math.round(minute / SNAP) * SNAP))

/** One time of an event as the calendar shows it: its colour, and whether it is your Mac's (read only). */
export type Shown = Occurrence & { color: string; readOnly?: boolean }

/**
 * An event's soft fill and its words, from its calendar's colour: a light
 * tint with darker words on a light page, a muted tint with lighter words in
 * the dark (--cal-fill and --cal-ink, main.css), so a title always reads.
 */
export const tint = (color: string, struck = false): React.CSSProperties => struck
  // Called off or done: struck through in a dashed outline, the way Notion Calendar shows a declined one.
  ? { background: 'var(--background)', color: `color-mix(in oklab, ${color} var(--cal-ink), var(--foreground))`, outline: `1.5px dashed color-mix(in oklab, ${color} 70%, transparent)`, outlineOffset: -1.5, textDecoration: 'line-through' }
  : {
      background: `color-mix(in oklab, ${color} var(--cal-fill), var(--background))`,
      color: `color-mix(in oklab, ${color} var(--cal-ink), var(--foreground))`,
      boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} var(--cal-edge), transparent)`
    }
/** An event's colour: its own, picked from a right-click's swatches, or its calendar's. */
export const colorFor = (one: Pick<Occurrence, 'ink'>, calendar: string): string => (one.ink ? inkOf(one.ink) : calendar)
/** A time as the calendar writes it: "09:30" on a 24-hour clock, the Mac's own way on a 12-hour one. */
export const hm = (date: string | Date): string => clock(date instanceof Date ? date.toISOString() : date).replace(/^(\d)(?=:\d\d$)/, '0$1')
/** "09:30 – 10:30", the way a block, the popover and Upcoming say a time. */
export const span = (from: string, to: string): string => `${hm(from)} – ${hm(to)}`

/**
 * An event (or a timed task) as one row of a list: a mark in its colour, its name, then its time and calendar. The
 * Calendar's Upcoming draws its rows with it, and so does quick capture's Today glance (box-glance.tsx).
 */
export function EventLine({ color, title, said, task = false, ...rest }: { color: string; title: string; said: string; /** A timed task: a ring, where an event has a square. */ task?: boolean } & React.ComponentProps<'button'>): React.JSX.Element {
  return (
    <button type="button" {...rest}
      className="flex items-start gap-2.5 rounded-md px-2 py-1 text-left outline-none transition-[background-color,scale] duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none">
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 ${task ? 'rounded-full border-[1.5px]' : 'rounded-[2px]'}`} style={task ? { borderColor: color } : { background: color }} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span dir="auto" className="truncate text-body font-semibold text-foreground">{title}</span>
        <span className="truncate text-control text-(--mf-muted-strong) tabular-nums">{said}</span>
      </span>
    </button>
  )
}

/** Your Mac's events as read-only times on the calendar, beside your own. */
export function macShown(list: { title: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null; layer: string }[]): Shown[] {
  return list.map((one, at) => ({
    key: `mac:${at}:${one.start}`, id: `mac:${at}`, series: null, start: one.start, end: one.end, allDay: one.allDay, title: one.title, place: null, people: [], video: null,
    notes: '', calendarId: one.layer, remind: null, repeat: null, repeatSaid: null, noted: 0, ink: null, cancelled: false, color: inkOf(one.color ?? 'gray'), readOnly: true
  }))
}

/** The part of each timed event inside a day, in minutes from its midnight: where its block goes. */
export function eventSpans(list: Shown[], day: string): { id: string; one: Shown; start: number; end: number }[] {
  const dayStart = dayjs(day).startOf('day')
  const dayEnd = dayStart.add(1, 'day')
  return list.filter((one) => !one.allDay && dayjs(one.start).isBefore(dayEnd) && dayjs(one.end).isAfter(dayStart)).map((one) => {
    const start = Math.max(0, dayjs(one.start).diff(dayStart, 'minute'))
    const end = Math.min(24 * 60, dayjs(one.end).diff(dayStart, 'minute'))
    return { id: `event:${one.key}`, one, start, end: Math.max(start + SNAP, end) }
  })
}
/** Whole-day events that cover a day. */
export const allDayOn = (list: Shown[], day: string): Shown[] =>
  list.filter((one) => one.allDay && dayKey(one.start) <= day && dayKey(dayjs(one.end).subtract(1, 'minute')) >= day)

// --- "This one, this and following, or all?" asked of a repeating event

/**
 * Asked in place, the way Google Calendar asks, over the page: which times a
 * change reaches. Esc or a click outside asks nothing and changes nothing.
 */
function askScope(verb: 'Change' | 'Delete', offerOne = true): Promise<Scope | null> {
  return new Promise((done) => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const end = (scope: Scope | null): void => (root.unmount(), host.remove(), done(scope))
    chime('open')
    root.render(<ScopeAsk verb={verb} offerOne={offerOne} onPick={end} />)
  })
}
function ScopeAsk({ verb, offerOne, onPick }: { verb: string; offerOne: boolean; onPick: (scope: Scope | null) => void }): React.JSX.Element {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  const choices: [Scope, string, string][] = [
    ...(offerOne ? [['one', 'This one', 'Only this time'] as [Scope, string, string]] : []),
    ['following', 'This and following', 'This time and every one after it'],
    ['all', 'All of them', 'Every time, before and after']
  ]
  return (
    <div data-scope-ask className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25" onPointerDown={(event) => event.target === event.currentTarget && (chime('away'), onPick(null))}
      onKeyDown={(event) => {
        if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), chime('away'), onPick(null))
        const n = Number(event.key)
        if (n >= 1 && n <= choices.length) (event.preventDefault(), chime('tap'), onPick(choices[n - 1][0]))
      }}>
      <div role="dialog" aria-label={`${verb} a repeating event`} className="flex w-80 flex-col gap-1 rounded-xl border bg-background p-3 shadow-(--mf-panel-shadow)">
        <h2 className="px-1 pb-1 text-body font-semibold text-foreground">{verb} a repeating event</h2>
        {choices.map(([scope, label, note], at) => (
          <button key={scope} ref={at === 0 ? first : undefined} type="button" data-scope={scope} onClick={() => (chime('tap'), onPick(scope))}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent">
            <Kbd>{at + 1}</Kbd>
            <span className="flex min-w-0 flex-col"><span className="text-body font-medium text-foreground">{label}</span><span className="text-control text-(--mf-muted-strong)">{note}</span></span>
          </button>
        ))}
        <Button variant="ghost" size="sm" className="mt-1 self-end" onClick={() => (chime('away'), onPick(null))}>Cancel <Kbd>Esc</Kbd></Button>
      </div>
    </div>
  )
}

/** A change to one time of an event: a repeating one asks which times first. Said with an Undo. */
export async function changeOne(one: Pick<Occurrence, 'key' | 'series'>, patch: Parameters<typeof events.save>[1], said: string, offerOne = true): Promise<string | null> {
  const scope = one.series ? await askScope('Change', offerOne) : 'one'
  if (!scope) return (chime('stay'), null)
  return changeEvent(events.save(one.key, patch, scope), said)
}
/** An event taken away: a one-off to the Bin; for a repeating one, the times asked for. */
export async function dropOne(one: Pick<Occurrence, 'key' | 'series' | 'id'>): Promise<boolean> {
  if (!one.series) return (await moveToBin([{ type: 'event', id: one.id }])) > 0
  const scope = await askScope('Delete')
  if (!scope) return (chime('stay'), false)
  chime('away')
  if (scope === 'all') return (await moveToBin([{ type: 'event', id: one.series }])) > 0
  return !!(await changeEvent(events.drop(one.key, scope), scope === 'one' ? 'That time is taken out' : 'That time and the ones after are taken out'))
}

/** "Notes for this": the note linked to this time, opened, or made and linked first. */
async function notesFor(one: Pick<Occurrence, 'key' | 'title' | 'start' | 'end' | 'allDay' | 'place' | 'people'>, open?: (type: string, id: string) => void, fresh = false): Promise<void> {
  const full = await events.one(one.key)
  const there = full?.linked[0]
  if (there && !fresh) return (chime('open'), open?.('capture', there.id))
  const line = (text: string): unknown => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const title = `${one.title} · ${dayjs(one.start).format('ddd D MMM')}`
  const body = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
    line(`When: ${whenSaid(one.start, one.end, one.allDay, clock)}`),
    ...(one.place ? [line(`Where: ${one.place}`)] : []),
    ...(one.people.length ? [line(`With: ${one.people.join(', ')}`)] : []),
    { type: 'paragraph' }
  ] }
  const id = await window.api.captures.create({ title, kind: 'note', body, medium: 'Meeting' })
  await events.link(one.key, id)
  chime('noted')
  toast('A note for this event, linked to it', () => void moveToBin([{ type: 'capture', id }]))
  open?.('capture', id)
}

// --- copy, cut, paste and duplicate, on the grid and in the right-click menu

/** The event copied or cut, to paste: what it is and how long it lasts. */
let held: { one: Shown; cut: boolean } | null = null
export const holding = (): boolean => !!held
const fields = (one: Shown): Parameters<typeof events.add>[0] => ({
  title: one.title, allDay: one.allDay, place: one.place, people: one.people, video: one.video, notes: one.notes, calendarId: one.calendarId, remind: one.remind, ink: one.ink
})
export function copyEvent(one: Shown): void {
  if (one.readOnly) return chime('nope')
  held = { one, cut: false }
  chime('tap')
  toast(`${quoted(one.title || 'New event', 80)} copied: ⌘V puts a copy where you point`, undefined, 'info')
}
export function cutEvent(one: Shown): void {
  if (one.readOnly) return chime('nope')
  held = { one, cut: true }
  void dropOne(one)
}
/** A copy of what was copied or cut, at a time (or on a day, all day), as long as it was. */
export async function pasteEvent(day: string, minute?: number | null): Promise<void> {
  if (!held) return chime('nope')
  const { one, cut } = held
  const length = dayjs(one.end).diff(one.start, 'minute')
  const at = minute === undefined ? dayjs(one.start).diff(dayjs(one.start).startOf('day'), 'minute') : minute
  const start = at === null || one.allDay ? dayjs(day).startOf('day') : dayjs(day).startOf('day').add(at, 'minute')
  const end = one.allDay ? start.add(Math.max(1, Math.round(length / 1440)), 'day') : start.add(length, 'minute')
  if (cut) held = { one, cut: false }
  const made = events.add({ ...fields(one), start: start.toISOString(), end: end.toISOString() })
  chime('noted')
  await changeEvent(made, `Pasted for ${whenSaid(start.toISOString(), end.toISOString(), one.allDay, clock)}`)
}
/** Another of it, at the same time: side by side with it, to drag where it goes. */
export async function duplicateEvent(one: Shown): Promise<void> {
  if (one.readOnly) return chime('nope')
  chime('noted')
  await changeEvent(events.add({ ...fields(one), start: one.start, end: one.end }), 'Duplicated, at the same time')
}

const SWATCHES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']
/**
 * The right-click menu every event has, on the grid, the month and the
 * panel, as Notion Calendar's: its colour from a row of swatches, the
 * calendar it is on, Cut, Copy and Duplicate, then Delete.
 */
function eventMenu(one: Shown, { open, onOpen, calendars = [] }: { open: () => void; onOpen?: (type: string, id: string) => void; calendars?: { id: string; name: string; color: string }[] }): RowItem[] {
  if (one.readOnly) return [{ label: 'Open', keys: '↵', run: open }, 'separator', { label: 'Mac calendar, read only', run: () => chime('nope') }]
  return [
    { swatches: SWATCHES.map((color) => ({ color: inkOf(color), label: color, on: one.ink === color, run: () => void changeOne(one, { ink: one.ink === color ? null : color }, one.ink === color ? 'Back to its calendar’s colour' : `Coloured ${color}`) })) },
    'separator',
    { label: 'Open', keys: '↵', run: open },
    { label: one.noted ? 'Open its notes' : 'Notes for this', icon: <FileText />, run: () => void notesFor(one, onOpen) },
    ...(one.video ? [{ label: 'Join the video call', icon: <Video />, run: () => void events.join(one.video!) }] : []),
    ...(calendars.length > 1 ? [{ label: 'Block on calendar', icon: <CalendarDays />, items: calendars.map((cal) => ({ label: cal.name, icon: <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: inkOf(cal.color) }} />, trail: cal.id === one.calendarId ? <Check className="ml-auto size-3.5" /> : undefined, run: () => cal.id !== one.calendarId && void changeOne(one, { calendarId: cal.id }, `On ${cal.name} now`) })) }] : []),
    'separator',
    { label: 'Cut', icon: <Scissors />, keys: '⌘X', run: () => cutEvent(one) },
    { label: 'Copy', icon: <Copy />, keys: '⌘C', run: () => copyEvent(one) },
    { label: 'Duplicate', icon: <CopyPlus />, keys: '⌘D', run: () => void duplicateEvent(one) },
    copyLinkItem(`event:${one.key}`, one.title),
    { label: one.cancelled ? 'Not called off' : 'Call it off', icon: <Ban />, hint: 'Kept on the calendar, struck through', run: () => void changeOne(one, { cancelled: !one.cancelled }, one.cancelled ? 'On again' : 'Called off, struck through') },
    'separator',
    { label: 'Delete', icon: <Trash2 />, keys: '⌫', danger: true, run: () => void dropOne(one) }
  ]
}

// --- on the grid: an event as a solid block, moved and stretched by dragging

type Lift = { mode: 'move' | 'resize'; day: string; start: number; length: number; allDay?: string }

/**
 * A timed event at its hour, filled in its calendar's colour (a task is an
 * outline with its tick circle, so the two never look alike). Dragged, it
 * moves to another time or day; its bottom edge dragged, it lasts longer or
 * shorter. Each with an Undo; a repeating one asks which times first.
 */
export function EventBlock({ one, day, at, length, lane, onOpen, onNote, calendars }: {
  one: Shown; day: string; at: number; length: number; lane: { lane: number; of: number; room?: number }
  calendars?: { id: string; name: string; color: string }[]
  /** Opened: a click, ↵ or its menu's “Open”. The popover it opens in is tied to the block (cal-add.tsx). A ⇧- or ⌘-click only picks it. */
  onOpen: (key: string, at: HTMLElement | null) => void
  onNote?: (type: string, id: string) => void
}): React.JSX.Element {
  const [lift, setLift] = useState<Lift | null>(null)
  const self = useRef<HTMLDivElement>(null)
  const open = (): void => onOpen(one.key, self.current)
  const short = length < 45
  const width = 100 / lane.of
  const start = (event: React.PointerEvent, mode: Lift['mode']): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (one.readOnly) return
    const [x0, y0] = [event.clientX, event.clientY]
    const box = (event.currentTarget.closest('[data-cal-event]') ?? event.currentTarget).getBoundingClientRect()
    const grab = ((y0 - box.top) / HOUR) * 60
    let now: Lift | null = null
    // Held at the hours' top or bottom edge, they scroll (lib/edge-scroll.ts, as the Calendar's other carries), and the
    // time under the still pointer is read again as they pass; not while it is over the all-day lane.
    const hours = event.currentTarget.closest<HTMLElement>('[data-cal-scroll]')
    const edge = hours ? edgeScroll(hours) : null
    let [x, y] = [x0, y0]
    const scrolled = (): void => void (now && ((now = follow(x, y)), setLift(now)))
    hours?.addEventListener('scroll', scrolled, { passive: true })
    const follow = (x: number, y: number): Lift | null => {
      if (mode === 'resize') {
        const col = document.querySelector<HTMLElement>(`[data-cal-col="${day}"]`)
        const end = col ? snap(((y - col.getBoundingClientRect().top) / HOUR) * 60) : at + length
        return { mode, day, start: at, length: Math.max(SNAP, end - at) }
      }
      const under = document.elementsFromPoint(x, y).find((el) => !(el as HTMLElement).closest('[data-cal-ghost]'))?.closest<HTMLElement>('[data-cal-col], [data-cal-allday]')
      if (!under) return now
      if (under.dataset.calAllday) return { mode, day: under.dataset.calAllday, start: at, length, allDay: under.dataset.calAllday }
      const minute = snap(((y - under.getBoundingClientRect().top) / HOUR) * 60 - grab)
      return { mode, day: under.dataset.calCol!, start: Math.min(minute, 24 * 60 - SNAP), length }
    }
    const move = (e: PointerEvent): void => {
      if (!now && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return
      ;[x, y] = [e.clientX, e.clientY]
      if (!now) chime('lift')
      now = follow(e.clientX, e.clientY)
      setLift(now)
      if (now?.allDay) edge?.stop()
      else edge?.follow(e.clientY)
    }
    const done = (): void => {
      edge?.stop()
      hours?.removeEventListener('scroll', scrolled)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', esc, true)
    }
    const up = (e: PointerEvent): void => {
      done()
      if (!now) return
      const to = follow(e.clientX, e.clientY) ?? now
      setLift(null)
      void land(to)
    }
    const cancel = (): void => (done(), now && chime('stay'), setLift(null))
    const esc = (e: KeyboardEvent): void => void (e.key === 'Escape' && now && (e.preventDefault(), e.stopPropagation(), cancel()))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', esc, true)
  }
  const land = async (to: Lift): Promise<void> => {
    const pieceStart = dayjs(day).startOf('day').add(at, 'minute')
    if (to.mode === 'resize') {
      if (to.length === length) return chime('stay')
      const end = dayjs(day).startOf('day').add(to.start + to.length, 'minute')
      await changeOne(one, { end: end.toISOString() }, `Lasts until ${clock(end.toISOString())} now`)
      return
    }
    if (to.allDay) {
      const startDay = dayjs(to.allDay).startOf('day')
      await changeOne(one, { allDay: true, start: startDay.toISOString(), end: startDay.add(1, 'day').toISOString() }, `All day on ${startDay.format('ddd D MMM')}`)
      return
    }
    const target = dayjs(to.day).startOf('day').add(to.start, 'minute')
    const moved = target.diff(pieceStart, 'minute')
    if (!moved) return chime('stay')
    const begins = dayjs(one.start).add(moved, 'minute')
    await changeOne(one, { start: begins.toISOString(), end: dayjs(one.end).add(moved, 'minute').toISOString() }, `Moved to ${begins.format('ddd D MMM')}, ${clock(begins.toISOString())}`)
  }
  const name = one.title || 'New event'
  const said = `${name}, ${clock(dayjs(day).startOf('day').add(at, 'minute').toISOString())}, until ${clock(one.end)}`
  const fill = tint(one.color, one.cancelled)
  const target = lift && !lift.allDay ? document.querySelector<HTMLElement>(`[data-cal-col="${lift.day}"]`) : null
  return (
    <>
      <RowMenu items={() => eventMenu(one, { open, onOpen: onNote, calendars })}>
        <div ref={self} role="button" tabIndex={0} data-cal-event={one.key} data-cal-calendar={one.calendarId} data-cal-start={at} data-cal-length={length} data-readonly={one.readOnly || undefined} aria-label={said}
          onPointerDown={(event) => start(event, 'move')}
          onMouseDown={(event) => event.button === 0 && (event.preventDefault(), event.currentTarget.focus({ preventScroll: true }))}
          onClick={(event) => clickOpens(event) && open()} onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.preventDefault(), open())
            if ((event.key === 'Backspace' || event.key === 'Delete') && !one.readOnly) (event.preventDefault(), void dropOne(one))
          }}
          className={`group/event @container absolute z-[2] flex touch-none overflow-hidden rounded-[6px] text-left text-control leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring ${one.readOnly ? 'cursor-pointer' : 'cursor-grab'} ${lift ? 'opacity-35' : 'transition-[filter] duration-150 hover:brightness-[0.97] motion-reduce:transition-none'}`}
          style={{ top: (at / 60) * HOUR + 1, height: Math.max(20, (length / 60) * HOUR - 2), left: `calc(${lane.lane * width}% + ${lane.lane ? 1 : 3}px)`, width: `calc(${width}% - ${(lane.of === 1 ? 7 : lane.lane ? 3 : 4) + (lane.room ?? 0)}px)`, ...fill }}>
          <BlockWords one={one} day={day} at={at} length={length} short={short} />
          {!one.readOnly && (
            <span data-cal-event-resize aria-hidden onPointerDown={(event) => start(event, 'resize')} style={{ cursor: 'ns-resize' }}
              className="absolute inset-x-0 bottom-0 h-2 after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-foreground/50 after:opacity-0 after:transition-opacity group-hover/event:after:opacity-100 motion-reduce:after:transition-none" />
          )}
        </div>
      </RowMenu>
      {/* Where it would land, drawn in the column it is over. */}
      {/* Where it would land: an outline at the slot, and the block lifted a little off it, with its shadow. */}
      {lift && target && createPortal(
        <div data-cal-ghost className="pointer-events-none absolute inset-x-[3px] z-30 rounded-[6px] outline-2 outline-offset-0 outline-dashed"
          style={{ top: (lift.start / 60) * HOUR + 1, height: Math.max(20, (lift.length / 60) * HOUR - 2), outlineColor: one.color }}>
          <div className="absolute inset-0 flex translate-x-1.5 -translate-y-1 overflow-hidden rounded-[6px] text-control leading-snug shadow-(--mf-shadow-lift) outline-none transition-[translate,box-shadow] duration-150 ease-out starting:translate-x-0 starting:translate-y-0 starting:shadow-none motion-reduce:transition-none" style={tint(one.color)}>
            <BlockWords one={one} day={lift.day} at={lift.start} length={lift.length} short={lift.length < 45} />
          </div>
        </div>, target)}
    </>
  )
}

/** A block's name and time: the whole "09:30 – 10:30" where it fits on a line; in a narrow day an hour or more puts it on two. */
function BlockWords({ one, day, at, length, short }: { one: Shown; day: string; at: number; length: number; short: boolean }): React.JSX.Element {
  const from = dayjs(day).startOf('day').add(at, 'minute').toISOString()
  const to = dayjs(day).startOf('day').add(at + length, 'minute').toISOString()
  return (
    <span className={`flex min-w-0 flex-1 pr-1 pl-2 ${length < 30 ? 'items-center gap-1.5' : short ? 'items-start gap-1.5 pt-[3px]' : 'flex-col gap-px pt-1 @max-[104px]:gap-0 @max-[104px]:pt-0.5'}`}>
      <span className={`flex min-w-0 items-center gap-1 ${short ? '' : 'shrink-0'}`}>
        <span dir="auto" className="truncate font-semibold">{one.title || 'New event'}</span>
        {one.noted > 0 && <Tip label="Has notes"><FileText data-cal-event-noted aria-label="Has notes" className="size-3 shrink-0" /></Tip>}
        {one.repeat && <RepeatIcon role="img" aria-label="Repeats" className="size-3 shrink-0 opacity-80" />}
      </span>
      <span className={`shrink-0 truncate text-meta tabular-nums ${short ? 'hidden @[120px]:inline' : 'hidden @[4rem]:block'}`}>{short ? hm(from) : <><span className={`@[104px]:hidden ${length >= 60 ? 'block leading-tight' : ''}`}>{length >= 60 ? <>{hm(from)} –<br />{hm(to)}</> : hm(from)}</span><span className="hidden @[104px]:inline">{span(from, to)}</span></>}</span>
      {!short && length >= 75 && one.place && <span className="hidden truncate text-meta @[4rem]:block">{one.place}</span>}
    </span>
  )
}

/**
 * A whole-day event, or one on the month: a filled chip in its calendar's colour, its time first. Taken by its middle it
 * is carried to other days, and a whole-day one taken by an end (`ends`, the ends this piece of its bar holds) is made
 * longer or shorter: both are the Calendar's own carry (calendar-view.tsx, `onCarry`), with one card and the days lit.
 */
export function EventChip({ one, day, onOpen, onNote, month = false, calendars, span: across, onCarry, ends }: {
  one: Shown; day: string; onOpen: (key: string, at: HTMLElement | null) => void; onNote?: (type: string, id: string) => void; month?: boolean
  calendars?: { id: string; name: string; color: string }[]
  /** Where it lies across the all-day lane: the columns it covers. */
  span?: React.CSSProperties
  /** A press on it, or on one of its ends, that may become a carry. */
  onCarry?: (event: React.PointerEvent, one: Shown, edge: 'start' | 'end' | 'move', day: string) => void
  ends?: { start: boolean; end: boolean }
}): React.JSX.Element {
  const self = useRef<HTMLButtonElement>(null)
  const open = (): void => onOpen(one.key, self.current)
  const time = one.allDay ? '' : hm(dayKey(one.start) === day ? one.start : dayjs(day).startOf('day').toISOString())
  // An end to take: a narrow strip at the chip's edge, its own pointer saying it stretches (set on the strip itself: the
  // page's hand over everything inside a button is outside Tailwind's layers, and beat a class).
  const end = (edge: 'start' | 'end'): React.JSX.Element => (
    <span aria-hidden data-cal-bar-end={edge} onPointerDown={(event) => onCarry?.(event, one, edge, day)}
      className={`absolute inset-y-0 w-2 ${edge === 'start' ? 'left-0' : 'right-0'}`} style={{ cursor: 'ew-resize' }} />
  )
  return (
    <RowMenu items={() => eventMenu(one, { open, onOpen: onNote, calendars })}>
      <Tip label={`${time ? `${time} ` : ''}${one.title || 'New event'}`}>
      <button ref={self} type="button" data-cal-event-chip={one.key} data-cal-calendar={one.calendarId}
        // A press on one of its ends is that end's own (it stretches); the chip's is for the whole of it.
        onPointerDown={(event) => !(event.target as Element).closest('[data-cal-bar-end]') && onCarry?.(event, one, 'move', day)}
        onClick={(event) => clickOpens(event) && open()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => (event.key === 'Backspace' || event.key === 'Delete') && !one.readOnly && (event.preventDefault(), void dropOne(one))}
        className={`relative flex ${month ? 'mt-0.5 h-[calc(1.25rem-2px)]' : 'h-6'} min-w-0 shrink-0 touch-none items-center gap-1 rounded-[5px] pr-1.5 pl-2.5 text-left text-control`}
        {...{ style: { ...tint(one.color, one.cancelled), ...across } }}>
        {time && <span className="shrink-0 tabular-nums">{time}</span>}
        <span dir="auto" className="truncate font-semibold">{one.title || 'New event'}</span>
        {one.noted > 0 && <FileText data-cal-event-noted aria-label="Has notes" className="size-3 shrink-0" />}
        {one.allDay && !one.readOnly && ends?.start && end('start')}
        {one.allDay && !one.readOnly && ends?.end && end('end')}
      </button>
      </Tip>
    </RowMenu>
  )
}

// --- the side panel's layers: each calendar on or off, the tasks, your Mac's

/** The study plan's own colour on the Calendar: its tick in "My calendars" and its chips' edge. */
export const STUDY_INK = 'var(--tt-color-text-purple)'

export function CalendarLayers({ layers }: { layers: ReturnType<typeof useLayers> }): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  // One press, one calendar: a second click while the first is saving, or on a "New calendar" not yet named, opens that one instead of making another.
  const making = useRef(false)
  const add = async (): Promise<void> => {
    const unnamed = layers.calendars.find((one) => one.name === 'New calendar')
    if (unnamed) return void (chime('open'), setEditing(unnamed.id))
    if (making.current) return
    making.current = true
    const made = await events.setCalendar({ name: 'New calendar' }).finally(() => (making.current = false))
    if (!made) return
    chime('noted')
    setEditing(made.id)
    toast('A new calendar', () => void events.setCalendar({ id: made.id, binned: true }))
  }
  const deleteCalendar = async (one: { id: string; name: string }, to: { id: string; name: string }): Promise<void> => {
    const moved = await events.moveEvents(one.id, to.id)
    const done = await events.setCalendar({ id: one.id, binned: true })
    if (!done) return void (await events.moveEvents(to.id, one.id, moved), toast('The last calendar stays: an event needs one', undefined, 'info'))
    chime('away')
    toast(`${one.name} deleted${moved.length ? `. Its ${moved.length === 1 ? 'event moved' : `${num(moved.length)} events moved`} to ${to.name}` : ''}`, () => void events.setCalendar({ id: one.id, binned: false }).then(() => void (moved.length && events.moveEvents(to.id, one.id, moved))))
  }
  const island = useFold('calendar.calendars', { total: layers.calendars.length + 2 })
  const macIsland = useFold('calendar.mac', { total: layers.mac.length })
  // Each calendar a box ticked in its own colour, as Calendar on the Mac has them: ticked, its events show.
  // Its other choices (rename, colour, delete) are on the row's own right-click menu, as anywhere else.
  const row = (id: string, name: string, color: string, menu?: RowItem[]): React.JSX.Element => {
    const on = layers.shown(id)
    const li = (
      <li key={id} data-cal-layer={id} className="group/layer flex items-center rounded-md hover:bg-accent/60">
        <button type="button" role="checkbox" aria-checked={on} aria-label={`Show ${name}`} onClick={() => (chime(on ? 'off' : 'on'), layers.toggle(id, !on))}
          onDoubleClick={menu ? () => (chime('open'), setEditing(id)) : undefined}
          className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors duration-150 motion-reduce:transition-none"
            style={{ borderColor: on ? color : 'color-mix(in oklab, var(--foreground) 35%, transparent)', background: on ? color : 'transparent' }}>
            <Check className={`size-3 text-background transition-[opacity,scale] duration-150 motion-reduce:transition-none ${on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3.5} />
          </span>
          <span className={`min-w-0 flex-1 truncate transition-colors duration-150 ${on ? 'text-foreground' : 'text-muted-foreground'}`}>{name}</span>
        </button>
      </li>
    )
    return menu ? <RowMenu key={id} items={menu}>{li}</RowMenu> : li
  }
  return (
    <div data-cal-layers className="flex flex-col">
      {/* The Inbox's island: ticked, a calendar's events show; its own menu (right-click) renames, recolours or deletes it. */}
      <IslandBox name="My calendars" island={island} shown={layers.calendars.length + 2} icon={<CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />}>
      <ul className="flex flex-col">
        {layers.calendars.map((one) => editing === one.id
          ? <CalendarEdit key={one.id} one={one} onDone={() => setEditing(null)} />
          : row(one.id, one.name, inkOf(one.color), [
              { label: 'Rename', run: () => setEditing(one.id) },
              { heading: 'Colour' },
              { swatches: COLORS.map((color) => ({ color: inkOf(color), label: color, on: one.color === color, run: () => void events.setCalendar({ id: one.id, color }).then(() => chime('tap')) })) },
              'separator',
              ...(() => {
                // Its events are kept: they move to the first other calendar, said in the row and in the toast.
                const to = layers.calendars.find((other) => other.id !== one.id)
                return to ? [{ label: `Delete, its events go to ${to.name}`, danger: true, run: () => void deleteCalendar(one, to) }] : [{ heading: 'The last calendar stays: an event needs one' }]
              })()
            ]))}
        {row('tasks', 'Tasks', 'var(--tt-brand-color-400)')}
        {row('study', 'Study', STUDY_INK)}
        <li>
          <button type="button" data-cal-layer-add onClick={() => void add()}
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-body text-(--mf-muted-strong) outline-none transition-[background-color,scale] duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none">
            <Plus aria-hidden className="size-4 shrink-0" />New calendar
          </button>
        </li>
      </ul>
      </IslandBox>
      {layers.mac.length > 0 && (
        <IslandBox name="Mac calendars" island={macIsland} shown={layers.mac.length} icon={<Laptop aria-hidden className="size-4 shrink-0 text-muted-foreground" />}>
          <ul className="flex flex-col">{layers.mac.map((one) => row(one.id, one.name, inkOf(one.color ?? 'gray')))}</ul>
        </IslandBox>
      )}
    </div>
  )
}

const COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown', 'gray']
function CalendarEdit({ one, onDone }: { one: { id: string; name: string; color: string }; onDone: () => void }): React.JSX.Element {
  const [name, setName] = useState(one.name)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.select(), [])
  const save = (patch: { name?: string; color?: string }): void => void events.setCalendar({ id: one.id, ...patch }).then(() => chime('tap'))
  return (
    <li data-cal-layer-edit={one.id} className="flex flex-col gap-1.5 rounded-lg border bg-background p-2">
      <input ref={field} value={name} aria-label="The calendar's name" onChange={(event) => setName(event.target.value)}
        onBlur={() => name.trim() && name !== one.name && save({ name })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.preventDefault(), name.trim() && save({ name }), onDone())
          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), onDone())
        }}
        className="h-7 rounded-md border bg-transparent px-2 text-body text-foreground outline-none focus-visible:border-foreground/25" />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Its colour">
        {COLORS.map((color) => (
          <button key={color} type="button" role="radio" aria-checked={one.color === color} aria-label={color} onClick={() => save({ color })}
            className="flex size-6 items-center justify-center rounded-full shrink-0 ring-offset-2 ring-offset-background transition-[scale] duration-150 ease-out active:scale-[0.95] motion-reduce:transition-none aria-checked:ring-2 aria-checked:ring-foreground/60" style={{ background: inkOf(color) }}>
            {one.color === color && <Check className="size-3.5 text-background" />}
          </button>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="self-end" onClick={() => (chime('tap'), onDone())}>Done</Button>
    </li>
  )
}

// --- a name typed over an event, read as the new-event line reads words

/**
 * What a name typed over an event sets: the name alone, or, when its words
 * hold a when ("standup 4pm @Room 2"), its time, place and people too, with
 * how that is said. A time alone keeps its day; a day alone keeps a timed
 * event's hour, as a task's do. One reading for the name on its page (the
 * side panel) and the line in its popover (cal-add.tsx).
 */
export function renamed(one: Pick<Occurrence, 'title' | 'start' | 'end' | 'allDay' | 'people'>, title: string, known: string[]): { patch: Parameters<typeof events.save>[1] & { start?: string; end?: string; allDay?: boolean }; said: string; name: string } {
  const read = readEvent(title, new Date(), known)
  // Only when the task reader finds a when too: "Lunch with May" names a person, not a month.
  if (!read.start || !read.title || !readTask(title).due) return { patch: { title }, said: 'Renamed', name: title }
  const [start, end] = [dayjs(one.start), dayjs(one.end)]
  const dayOnly = read.allDay && !one.allDay
  const allDay = read.allDay && !dayOnly
  const from = dayjs(timeAlone(title) ? atOn(read.start, one.start) : dayOnly ? atOn(one.start, read.start) : read.start)
  const to = allDay ? from.add(1, 'day') : read.ends && read.end ? from.add(dayjs(read.end).diff(dayjs(read.start)), 'ms') : from.add(Math.max(1, end.diff(start, 'minute')), 'minute')
  const when = whenSaid(from.toISOString(), to.toISOString(), allDay, clock)
  return {
    patch: { title: read.title, start: from.toISOString(), end: to.toISOString(), allDay, ...(read.place && { place: read.place }), ...(read.people.length && { people: [...new Set([...(one.people ?? []), ...read.people])] }) },
    said: `${read.title === one.title ? 'Moved to' : 'Renamed,'} ${when}${read.place ? `, at ${read.place}` : ''}`, name: read.title
  }
}

// --- a new event from words, in the popover beside its draft

/** A phrase carried on after a comma: its first letter small, the rest as it is (a day's name keeps its capital). */
const smallStart = (said: string): string => said.charAt(0).toLowerCase() + said.slice(1)

/**
 * The new event's first line, in the popover beside its draft (cal-add.tsx):
 * its words say the rest ("lunch with Sam fri 1-2pm @Cafe"), and the slot
 * drawn fills in what they leave out. What it understood is shown under it as
 * you type, before it is made.
 */
export function NewEvent({ ask, held, onMade, words, picked, onName, onPlace, one }: {
  /** The event the line is open on: its name to write over, read as a new one's words are; ↵ keeps the change, said with Undo. */
  one?: Shown
  /** The slot it was put in: a day (to `until`, days dragged across in Month), or a time on it for a length. */
  ask: { day: string; minute: number | null; length: number; until?: string }
  /** Told where it will be as its words are read: its draft on the grid is drawn there. */
  onPlace?: (to: Place) => void
  held?: React.MutableRefObject<(() => Promise<void>) | null>
  onMade: (key: string) => void
  /** The words, when what holds this form keeps them (the popover, so they stay as Event turns to Task). */
  words?: [string, (text: string) => void]
  /** The calendar chosen, kept by what holds this form too: the draft on the grid wears its colour. */
  picked?: [string | null, (id: string) => void]
  /** Told the name read out of the words as it changes: the draft on the grid says it. */
  onName?: (name: string) => void
}): React.JSX.Element {
  const ownText = useState(one?.title ?? '')
  const [text, setText] = words ?? ownText
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => (requestAnimationFrame(() => (field.current?.focus(), field.current?.setSelectionRange(field.current.value.length, field.current.value.length))), () => void (held && (held.current = null))), []) // eslint-disable-line react-hooks/exhaustive-deps
  const known = useKnownPeople()
  const calendars = useCalendars()
  const ownCalendar = useState<string | null>(null)
  const [calendar, setCalendar] = picked ?? ownCalendar
  const slotStart = ask.minute === null ? dayjs(ask.day).startOf('day') : dayjs(ask.day).startOf('day').add(ask.minute, 'minute')
  const slotEnd = ask.minute === null ? (ask.until && ask.until > ask.day ? dayjs(ask.until).startOf('day') : slotStart).add(1, 'day') : slotStart.add(Math.max(SNAP, ask.length || 60), 'minute')
  const read = useMemo(() => readEvent(text, new Date(), known), [text, known])
  useEffect(() => onName?.(read.title), [read.title]) // eslint-disable-line react-hooks/exhaustive-deps
  // Open on an event: what its line would set, read the way its name is read on its page.
  const set = useMemo(() => (one ? renamed(one, text.trim() || one.title, known) : null), [one, text, known])
  const changed = !!one && !one.readOnly && !!text.trim() && (set!.name !== one.title || !!set!.patch.start)
  // A time alone ("lunch 2pm", "standup every week 9am") is on the day its draft is on, as a task's is (lib/tasks.ts,
  // timeAlone); words that name a day keep their own. Read as today's, a new event written on Friday's draft was made
  // today, and a weekly one started from today.
  const alone = !one && !!read.start && !read.allDay && timeAlone(text)
  const readStart = alone ? atOn(read.start!, slotStart.toISOString()) : read.start
  const readEnd = alone && read.end ? dayjs(readStart).add(dayjs(read.end).diff(dayjs(read.start)), 'ms').toISOString() : read.end
  const allDay = one ? (set!.patch.allDay ?? one.allDay) : read.start ? read.allDay : ask.minute === null
  const start = one ? (set!.patch.start ?? one.start) : readStart ?? slotStart.toISOString()
  const end = readStart ? (readEnd ?? dayjs(readStart).add(1, allDay ? 'day' : 'hour').toISOString()) : slotEnd.toISOString()
  const fixedEnd = one ? (set!.patch.end ?? one.end) : allDay ? dayjs(start).startOf('day').add(Math.max(1, dayjs(end).diff(dayjs(start).startOf('day'), 'day')), 'day').toISOString() : end
  // Where the words put a new one, for its draft to be drawn there: "fri 1pm" moves it to Friday at 13:00.
  const lastDay = dayKey(dayjs(fixedEnd).subtract(1, 'minute'))
  const drawnAt: Place = allDay ? { day: dayKey(start), minute: null, length: 0, ...(lastDay > dayKey(start) && { until: lastDay }) }
    : { day: dayKey(start), minute: dayjs(start).hour() * 60 + dayjs(start).minute(), length: Math.max(SNAP, dayjs(fixedEnd).diff(dayjs(start), 'minute')) }
  useLayoutEffect(() => void (!one && onPlace?.(drawnAt)), [drawnAt.day, drawnAt.minute, drawnAt.length, drawnAt.until]) // eslint-disable-line react-hooks/exhaustive-deps
  const on = one?.calendarId ?? calendar ?? calendars.find((cal) => !cal.hidden)?.id ?? calendars[0]?.id ?? 'personal'
  const place = one ? (set!.patch.place ?? one.place) : read.place
  const people = one ? (set!.patch.people ?? one.people) : read.people
  const busy = useRef(false)
  const save = async (stay = true): Promise<void> => {
    if (one) {
      // Nothing changed (or one of your Mac's, read only): ↵ only closes it.
      if (!changed && text.trim()) return void (stay && onMade(one.key))
      if (!text.trim()) return refuse('An event needs a name: type one')
      if (busy.current) return
      busy.current = true
      const key = await changeOne(one, set!.patch, set!.said)
      busy.current = false
      if (stay && key) onMade(key)
      return
    }
    if (!read.title) return refuse('Nothing to add yet: type a name for the event')
    if (busy.current) return
    busy.current = true
    const made = await events.add({ title: read.title, start, end: fixedEnd, allDay, place: read.place, people: read.people, repeat: read.repeat, calendarId: on })
    busy.current = false
    void changeEvent(Promise.resolve(made), `Added for ${whenSaid(start, fixedEnd, allDay, clock)}`)
    if (stay) onMade(made.key)
  }
  // Kept as the panel goes (clicked away from, ⌘↵): made, said in the notice.
  if (held) held.current = (one ? changed : read.title) ? () => save(false) : null
  return (
    <form data-new-event data-event-open={one?.key} className="flex flex-col px-3 pt-2.5 pb-3" onSubmit={(event) => (event.preventDefault(), void save())}>
      <div className="flex w-full flex-col gap-2.5">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border pr-1 pl-3 text-body focus-within:border-foreground/25">
          <input ref={field} data-new-event-words value={text} readOnly={one?.readOnly} onChange={(event) => setText(event.target.value)} aria-label={one ? 'The event’s name' : `A new event for ${dayjs(ask.day).format('dddd D MMMM')}`}
            placeholder="Lunch with Sam fri 1pm" className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground" />
          {/* A new one's ↵ is the popover's one filled button; on one that exists it is a quiet key (keeping a name is not
              the main thing there), and one of your Mac's, read only, has nothing to keep. */}
          {!one?.readOnly && <Button type="submit" size="sm" variant={one ? 'ghost' : undefined} data-new-event-add aria-label={one ? 'Keep' : 'Add'}><span className="hidden @[40rem]/page:inline">{one ? 'Keep' : 'Add'}</span> <Kbd>↵</Kbd></Button>}
        </div>
        {/* What it will be, plain to read, before it is made. The repeat goes on after a comma, so only its first letter
            turns small: a day's name keeps its capital ("weekly on Sunday", never "weekly on sunday"). */}
        <div data-new-event-said className="flex flex-col gap-1 text-body text-foreground [overflow-wrap:anywhere]">
          <p><strong className="font-semibold">{(one ? set!.name : read.title) || 'An event'}</strong>, {whenSaid(start, fixedEnd, allDay, clock)}{one ? (one.repeatSaid ? `, ${smallStart(one.repeatSaid)}` : '') : read.repeat ? `, ${smallStart(repeatSaid(read.repeat, start))}` : ''}.</p>
          {(place || people.length > 0) && <p>{place && <>At <strong className="font-semibold">{place}</strong>. </>}{people.length > 0 && <>With <strong className="font-semibold">{people.join(', ')}</strong>.</>}</p>}
        </div>
        {/* Which calendar a new one will be on; one that exists has it as a row under its line (EventRows). */}
        {!one && <CalendarPick calendars={calendars} on={on} onPick={(cal) => (chime('tap'), setCalendar(cal.id))} />}
        {/* One quiet line, never a paragraph, saying by example what the words can hold; it gives way in a short window, so nothing in the popover is cut. */}
        {one?.readOnly
          ? <p data-new-event-hint className="text-control text-muted-foreground">From your Mac’s calendar: change it in Calendar.</p>
          : <p data-new-event-hint className="truncate text-control text-muted-foreground [@media(max-height:520px)]:hidden">{one ? 'Type fri 1pm, @Cafe or with Sam to change it.' : 'Reads fri 1pm, @Cafe, with Sam, every week.'}</p>}
      </div>
    </form>
  )
}

/** The calendars, each a chip with its colour, the one it is on lit: for a new event's line, and an open event's Calendar row. */
function CalendarPick({ calendars, on, onPick }: { calendars: ReturnType<typeof useCalendars>; on: string; onPick: (cal: { id: string; name: string }) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="On which calendar">
      {calendars.map((cal) => (
        <button key={cal.id} type="button" role="radio" aria-checked={on === cal.id} data-new-event-calendar={cal.id} onClick={() => onPick(cal)}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-control text-foreground transition-colors hover:bg-accent aria-checked:bg-accent aria-checked:font-medium motion-reduce:transition-none">
          <span aria-hidden className="size-2 rounded-full shrink-0" style={{ background: inkOf(cal.color) }} />{cal.name}
        </button>
      ))}
    </div>
  )
}

/**
 * One quiet line of the popover an event or a task is open in (cal-add.tsx): what it is, what it says now, and, opened
 * in place under it, the control that changes it (the one its page has). The popover keeps its width; its height
 * follows on the app's spring.
 */
/**
 * What a quiet row opens, under its line. It comes down from under the line and goes back up under it on the app's
 * spring, clipped by its own lower edge: the rows after it ride that edge, and the popover is as tall as what it holds
 * at every frame. It stays drawn until it has gone (taken off the page at once, it left bare surface for as long as
 * the popover took to close over it). At once by a key, with Motion off and with Reduce motion.
 */
function Fold({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element | null {
  const box = useRef<HTMLDivElement>(null)
  const [here, setHere] = useState(open)
  const height = useMotionValue<number | string>(open ? 'auto' : 0)
  const whole = useTransform(height, (now) => (typeof now === 'number' ? Math.max(0, Math.round(now)) : now))
  const was = useRef(open)
  if (open && !here) setHere(true)
  useLayoutEffect(() => {
    if (was.current === open) return
    const el = box.current
    if (!el) return
    was.current = open
    const full = el.scrollHeight
    if (still() || byKeys()) {
      height.set(open ? 'auto' : 0)
      if (!open) setHere(false)
      return
    }
    const from = height.get()
    height.set(typeof from === 'number' ? from : open ? 0 : full)
    // Said to the popover's own box (cal-add.tsx, `Sized`): while this moves, the box is simply as tall as what it holds.
    el.setAttribute('data-fold-moving', '')
    const going = animate(height as MotionValue<number>, open ? full : 0, {
      ...spring.slow,
      onComplete: () => {
        el.removeAttribute('data-fold-moving')
        if (open) height.set('auto')
        else setHere(false)
      }
    })
    return () => going.stop()
  }, [open, here, height])
  if (!here) return null
  return <motion.div ref={box} data-quiet-body style={{ height: whole }} className="overflow-hidden">{children}</motion.div>
}

export function QuietRow({ icon: Icon, name, said, open, onOpen, row, children }: {
  icon: typeof Bell; name: string; said: React.ReactNode; open: boolean; onOpen: (open: boolean) => void
  /** Its name for a probe. */
  row: string
  children: React.ReactNode
}): React.JSX.Element {
  // Opened or closed by a key (↵ or Space on the line), its chevron is simply turned, as what it opens is simply there
  // (`Fold`): by a key the choices came at once while the chevron still turned for 150ms.
  const [keyed, setKeyed] = useState(false)
  return (
    <div data-quiet-row={row} data-open={open || undefined} className="flex flex-col">
      <button type="button" aria-expanded={open} onClick={() => (setKeyed(byKeys()), chime(open ? 'fold' : 'open'), onOpen(!open))}
        // A press answers at once: the row gives a little, as every row of a list here does (DESIGN.md, Alive Not Ingratiating).
        className="group/head flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-control text-foreground outline-none transition-[background-color,scale] duration-150 ease-(--mf-ease) hover:bg-accent focus-visible:bg-accent active:scale-[0.98] motion-reduce:transition-none">
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="shrink-0">{name}</span>
        <span data-quiet-said className="min-w-0 flex-1 truncate text-right font-medium">{said}</span>
        <ChevronRight aria-hidden className={`size-3.5 shrink-0 text-muted-foreground group-hover/head:text-foreground ${keyed ? '' : 'transition-transform duration-150 ease-(--mf-ease) motion-reduce:transition-none'} ${open ? 'rotate-90' : ''}`} />
      </button>
      <Fold open={open}><div className="pb-1.5">{children}</div></Fold>
    </div>
  )
}

/**
 * The quiet rows under an open event's line in its popover: its calendar, place, people, reminder and repeat, what
 * the app keeps for an event today. Place and people are the fields its page has, written in where they are; the
 * others are a line that opens its choices in place, one at a time. Each change is kept as it is made, said with Undo.
 */
export function EventRows({ one, onKey }: { one: Shown; onKey: (key: string) => void }): React.JSX.Element {
  const calendars = useCalendars()
  const known = useKnownPeople()
  // Each row opens and closes itself alone. One at a time, a row pressed under an open one went up from under the
  // pointer as that one shut over it: what is pressed never moves (interaction.md, controls stay put).
  const [open, setOpen] = useState<ReadonlySet<'calendar' | 'remind' | 'repeat'>>(new Set())
  const turn = (row: 'calendar' | 'remind' | 'repeat') => (on: boolean): void => setOpen((was) => { const next = new Set(was); if (on) next.add(row); else next.delete(row); return next })
  const save = async (patch: Parameters<typeof events.save>[1], said: string, offerOne = true): Promise<void> => {
    const key = await changeOne(one, patch, said, offerOne)
    if (key && key !== one.key) onKey(key)
  }
  const on = calendars.find((cal) => cal.id === one.calendarId)
  return (
    <div data-event-rows className="flex flex-col px-1 pb-2">
      <QuietRow row="calendar" icon={CalendarDays} name="Calendar" open={open.has('calendar')} onOpen={turn('calendar')}
        said={<span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: inkOf(on?.color) }} />{on?.name ?? 'Calendar'}</span>}>
        <div className="px-1"><CalendarPick calendars={calendars} on={one.calendarId} onPick={(cal) => cal.id !== one.calendarId && void save({ calendarId: cal.id }, `On ${cal.name} now`)} /></div>
      </QuietRow>
      {/* The page's own field, without its example and its tip here: in a popover the example read as a place already set,
          and nothing floats over the popover. Its word, like “People” under it, says what goes there. */}
      <PropInput key={`place-${one.place ?? ''}`} icon={MapPin} value={one.place ?? ''} placeholder="Place" lead="At" onSave={(place) => place !== (one.place ?? '') && void save({ place: place || null }, place ? `At ${place}` : 'No place now')} />
      <PeopleField people={one.people} known={known} onSave={(people) => void save({ people }, people.length ? `With ${people.join(', ')}` : 'Nobody named now')} />
      <QuietRow row="remind" icon={Bell} name="Reminder" said={remindName(one.remind)} open={open.has('remind')} onOpen={turn('remind')}>
        <RemindChoices value={one.remind} allDay={one.allDay} start={one.start} onSave={(remind) => void save({ remind }, remind === null ? 'No reminder now' : `Reminds you ${remindName(remind).toLowerCase()}`)} />
      </QuietRow>
      <QuietRow row="repeat" icon={RepeatIcon} name="Repeat" said={one.repeatSaid || 'Does not repeat'} open={open.has('repeat')} onOpen={turn('repeat')}>
        <RepeatChoices one={one} onSave={(repeat) => void save({ repeat }, repeat ? repeatSaid(repeat, one.start) : 'Does not repeat now', false)} />
      </QuietRow>
    </div>
  )
}

/** The names your notes are from (Sources' people), to spell someone the way you already do. */
function useKnownPeople(): string[] {
  const sources = useLive(() => window.api.haligtree<{ field: string; name: string }[]>('sources'), [] as { field: string; name: string }[])
  return useMemo(() => sources.filter((one) => one.field === 'attribution').map((one) => one.name), [sources])
}

// --- the event itself, in the side panel, the way a task opens there

const REMINDERS: [number | null, string][] = [[null, 'None'], [0, 'At its time'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day']]
const remindName = (minutes: number | null): string => minutes === null ? 'No reminder' : minutes === 0 ? 'At its time' : `${minutes >= 1440 && minutes % 1440 === 0 ? `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'}` : minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}` : `${minutes} minutes`} before`
const plan = 'min-w-0 px-1 text-control'

/**
 * An event open in the side panel, in TaskDetail's shape: its name to write
 * over, when it is, its notes, and down the side when, repeat, calendar,
 * reminder, place, people and video link, with "Notes for this" and the
 * notes already linked. ⌫ outside a field takes it to the Bin; Esc closes.
 */
export function EventDetail({ eventKey, onKey, onClose, onOpen }: { eventKey: string; onKey: (key: string) => void; onClose: () => void; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const one = useLive(() => events.one(eventKey), undefined as Awaited<ReturnType<typeof events.one>> | undefined, [eventKey])
  const calendars = useCalendars()
  const known = useKnownPeople()
  if (one === undefined) return null
  if (!one) return <p className="px-4 @[40rem]/page:px-12 pt-6 text-body text-foreground/85">This event is no longer here.</p>
  const save = async (patch: Parameters<typeof events.save>[1], said: string, offerOne = true): Promise<void> => {
    const key = await changeOne(one, patch, said, offerOne)
    if (key && key !== eventKey) onKey(key)
  }
  const start = dayjs(one.start)
  const end = dayjs(one.end)
  // A new name read as the new-event box reads words, as a task's name is: "standup 4pm @Room 2" moves it to 4pm on its own day and sets the place, said with Undo.
  const rename = (title: string, field: HTMLTextAreaElement): Promise<void> => {
    const set = renamed(one, title, known)
    // The words read are taken out of the name in place, as a task's name is (the field keeps its key when the name comes out the same).
    field.value = set.name
    return save(set.patch, set.said)
  }
  const hhmm = (at: dayjs.Dayjs): string => at.format('HH:mm')
  const atTime = (day: dayjs.Dayjs, time: string): dayjs.Dayjs => { const [h, m] = time.split(':').map(Number); return day.startOf('day').hour(h).minute(m) }
  const color = inkOf(calendars.find((cal) => cal.id === one.calendarId)?.color)
  return (
    <div data-event-detail={one.key} className="note-pane flex min-w-0 shrink-0 flex-col [--mf-padding:1rem_3.25rem]"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement
        if ((event.key === 'Backspace' || event.key === 'Delete') && !['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable) {
          event.preventDefault()
          void dropOne(one).then((gone) => gone && onClose())
        }
      }}>
      <div className="flex min-w-0 shrink-0 flex-col pt-4 pb-3">
        <div className="page-narrow mx-auto mb-1 flex w-full items-center gap-2 px-4 @[40rem]/page:px-12">
          <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: color }} />
          <span className="text-control font-medium text-foreground">Event</span>
          <Tip label="Paste it into any note to link to this event">
            <Button data-copy-event-link variant="ghost" size="sm" className="ml-auto" onClick={() => copyLink(`event:${one.key}`, one.title)}><Link2 className="size-3.5" /> Copy link</Button>
          </Tip>
        </div>
        <textarea key={one.title} dir="auto" rows={1} data-event-title aria-label="The event's name" defaultValue={one.title}
          className="page-narrow mx-auto mb-1 block w-full shrink-0 resize-none overflow-hidden bg-transparent px-4 @[40rem]/page:px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none [field-sizing:content]"
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
          onBlur={(event) => { const title = event.target.value.replace(/\s*\n\s*/g, ' ').trim(); if (title && title !== one.title) void rename(title, event.target) }} />
        {/* When, on its own line and plain to read. */}
        <div data-event-when className="page-narrow mx-auto mb-3 flex w-full flex-col gap-1 px-4 @[40rem]/page:px-12 text-[0.9375rem] text-foreground">
          {one.allDay ? <p>{whenSaid(one.start, one.end, one.allDay, clock)}</p> : (
            <p className="flex items-center gap-2 tabular-nums">
              <Clock aria-hidden className="size-4 shrink-0 text-foreground/70" />
              <span className="font-medium">{hm(one.start)}</span><span aria-hidden className="text-foreground/60">→</span><span className="font-medium">{hm(one.end)}</span>
              <span className="text-muted-foreground">{lengthSaid(end.diff(start, 'minute'))}</span>
            </p>
          )}
          {!one.allDay && <p className="pl-6 text-foreground/85">{start.format('ddd, MMM D')}{end.isSame(start, 'day') ? '' : ` – ${end.format('ddd, MMM D')}`}</p>}
          {!one.allDay && <p className="flex items-center gap-2 text-body text-(--mf-muted-strong)"><Globe aria-hidden className="size-4 shrink-0 text-foreground/70" />{zoneShort(Intl.DateTimeFormat().resolvedOptions().timeZone, start.toDate())} {cityOf(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>}
          {one.repeatSaid && <p className="flex items-center gap-2 text-body text-foreground/85"><RepeatIcon aria-hidden className="size-4 shrink-0 text-foreground/70" />{one.repeatSaid}</p>}
        </div>
        {one.video && (
          <div className="page-narrow mx-auto mb-3 w-full px-4 @[40rem]/page:px-12">
            <Button data-event-join onClick={() => (chime('open'), void events.join(one.video!))}><Video /> Join the video call</Button>
          </div>
        )}
        <textarea key={`notes:${one.notes}`} data-event-notes aria-label="Notes about the event" defaultValue={one.notes} rows={4} placeholder="Add notes: the agenda, what to bring, what to ask"
          onBlur={(event) => event.target.value !== one.notes && void save({ notes: event.target.value }, 'Notes kept')}
          className="page-narrow mx-auto block w-full resize-none bg-transparent px-4 @[40rem]/page:px-12 text-body leading-relaxed text-foreground outline-none placeholder:text-muted-foreground [field-sizing:content]" />
        {/* Meeting notes: a note of its own for this time, linked both ways. */}
        <div className="page-narrow mx-auto mt-4 flex w-full flex-col gap-1 px-4 @[40rem]/page:px-12">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-event-notes-for onClick={() => void notesFor(one, onOpen)}><FileText /> Notes for this</Button>
            {one.linked.length > 0 && <Button variant="ghost" size="sm" data-event-notes-another onClick={() => void notesFor(one, onOpen, true)}><Plus /> Another note</Button>}
          </div>
          {one.linked.map((note) => (
            <button key={note.id} type="button" data-event-linked={note.id} onClick={() => (chime('open'), onOpen?.('capture', note.id))}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-body text-foreground hover:bg-accent">
              <FileText className="size-4 shrink-0" /><span className="truncate">{note.title}</span>
            </button>
          ))}
        </div>
      </div>
      <Props>
        <Island compact title="When">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-control text-foreground">
            <span>All day</span>
            <Switch data-event-allday checked={one.allDay} onCheckedChange={(allDay) => void save(allDay
              ? { allDay, start: start.startOf('day').toISOString(), end: start.startOf('day').add(Math.max(1, end.subtract(1, 'minute').startOf('day').diff(start.startOf('day'), 'day') + 1), 'day').toISOString() }
              : { allDay, start: start.hour(9).toISOString(), end: start.hour(10).toISOString() }, allDay ? 'All day now' : 'Has a time now')} />
          </div>
          <DatePicker lead="Starts" value={one.start} onChange={(day) => {
            if (!day) return
            const to = dayjs(day).startOf('day').hour(start.hour()).minute(start.minute())
            void save({ start: to.toISOString(), end: to.add(end.diff(start), 'ms').toISOString() }, `Moved to ${to.format('ddd D MMM')}`)
          }} />
          {!one.allDay && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-control text-foreground">
              <TimeField label="Starts at" value={hhmm(start)} onChange={(time) => { const to = atTime(start, time); void save({ start: to.toISOString(), end: to.add(end.diff(start), 'ms').toISOString() }, `Starts at ${clock(to.toISOString())}`) }} />
              <span>to</span>
              <TimeField label="Ends at" value={hhmm(end)} onChange={(time) => { let to = atTime(start, time); if (!to.isAfter(start)) to = to.add(1, 'day'); void save({ end: to.toISOString() }, `Ends at ${clock(to.toISOString())}`) }} />
            </div>
          )}
          {one.allDay && (
            <DatePicker lead="Ends" value={end.subtract(1, 'day').toISOString()} onChange={(day) => {
              if (!day || dayjs(day).isBefore(start, 'day')) return chime('nope')
              void save({ end: dayjs(day).startOf('day').add(1, 'day').toISOString() }, `Until ${dayjs(day).format('ddd D MMM')}`)
            }} />
          )}
        </Island>
        <RepeatPicker one={one} onSave={(repeat) => void save({ repeat }, repeat ? repeatSaid(repeat, one.series ? one.start : one.start) : 'Does not repeat now', false)} />
        <Island compact title="Calendar">
          <div className="flex flex-col p-1" role="radiogroup" aria-label="On which calendar">
            {calendars.map((cal) => (
              <button key={cal.id} type="button" role="radio" aria-checked={one.calendarId === cal.id} data-event-calendar={cal.id}
                onClick={() => one.calendarId !== cal.id && void save({ calendarId: cal.id }, `On ${cal.name} now`)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-foreground hover:bg-accent aria-checked:font-medium">
                <span aria-hidden className="size-2.5 rounded-full shrink-0" style={{ background: inkOf(cal.color) }} />
                <span className="flex-1">{cal.name}</span>
                {one.calendarId === cal.id && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </Island>
        <RemindPicker value={one.remind} allDay={one.allDay} start={one.start} onSave={(remind) => void save({ remind }, remind === null ? 'No reminder now' : `Reminds you ${remindName(remind).toLowerCase()}`)} />
        <Island compact title="Details">
          <PropInput key={`place-${one.place ?? ''}`} icon={MapPin} value={one.place ?? ''} placeholder="Place" lead="At" ghost="Place: Cafe on the corner" does="Where it is. It shows on the block, and in the reminder" onSave={(place) => place !== (one.place ?? '') && void save({ place: place || null }, place ? `At ${place}` : 'No place now')} />
          <PeopleField people={one.people} known={known} onSave={(people) => void save({ people }, people.length ? `With ${people.join(', ')}` : 'Nobody named now')} />
          <PropInput key={`video-${one.video ?? ''}`} icon={Video} value={one.video ?? ''} placeholder="Video link" ghost="Video link: https://…" does="A call's address. “Join the video call” opens it, only when you click it" onSave={(video) => video !== (one.video ?? '') && void save({ video: video || null }, video ? 'Video link kept' : 'No video link now')} />
        </Island>
        <Island compact title="Event">
          <Prop icon={Trash2} onClick={() => void dropOne(one).then((gone) => gone && onClose())}>Move to the Bin <span className="font-normal">(⌫)</span></Prop>
        </Island>
      </Props>
    </div>
  )
}

/** Who is coming: each a chip with its ×; typed, the names you already have are offered first. */
function PeopleField({ people, known, onSave }: { people: string[]; known: string[]; onSave: (people: string[]) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const offered = text.trim() ? known.filter((name) => name.toLowerCase().includes(text.trim().toLowerCase()) && !people.includes(name)).slice(0, 5) : []
  const add = (name: string): void => {
    const clean = name.trim()
    if (!clean || people.includes(clean)) return setText('')
    setText('')
    onSave([...people, clean])
  }
  return (
    <div data-event-people className="flex flex-col gap-1 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {/* As far from its words as the place's mark is from its own (8px), so the two fields' words start on one edge. */}
        <Users className="mr-1 size-4 shrink-0" />
        {people.map((name) => (
          <span key={name} className="flex h-6 items-center gap-1 rounded-full bg-accent pr-1 pl-2 text-control text-foreground">
            {name}
            <button type="button" aria-label={`Take ${name} off`} onClick={() => onSave(people.filter((one) => one !== name))} className="flex size-4 items-center justify-center rounded-full shrink-0 hover:bg-foreground/10"><X className="size-3" /></button>
          </span>
        ))}
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder={people.length ? 'Add someone' : 'People'} aria-label="Add someone"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') (event.preventDefault(), add(offered[0] && !known.includes(text.trim()) && offered[0].toLowerCase().startsWith(text.trim().toLowerCase()) ? offered[0] : text))
            if (event.key === 'Backspace' && !text && people.length) onSave(people.slice(0, -1))
          }}
          className="h-6 min-w-20 flex-1 bg-transparent text-control text-foreground outline-none placeholder:text-muted-foreground" />
      </div>
      {offered.length > 0 && (
        <div className="flex flex-col pl-6">
          {offered.map((name) => <button key={name} type="button" onClick={() => add(name)} className="rounded-sm px-1.5 py-0.5 text-left text-control text-foreground hover:bg-accent">{name}</button>)}
        </div>
      )}
    </div>
  )
}

/** How long before it reminds you: the usual choices, and any number of minutes. */
function RemindPicker({ value, onSave, allDay = false, start, task = false }: { value: number | null; onSave: (minutes: number | null) => void; allDay?: boolean; start: string; task?: boolean }): React.JSX.Element {
  return (
    <Island compact title={task ? 'Remind me before' : 'Reminder'} actions={<span data-remind-said className="text-control font-medium text-foreground">{remindName(value)}</span>}>
      <RemindChoices value={value} onSave={onSave} allDay={allDay} start={start} task={task} />
    </Island>
  )
}
/** The reminder's choices themselves: in its island on the event's page, and under its row in the event's popover. */
function RemindChoices({ value, onSave, allDay = false, start, task = false }: { value: number | null; onSave: (minutes: number | null) => void; allDay?: boolean; start: string; task?: boolean }): React.JSX.Element {
  const choices = task ? REMINDERS.filter(([minutes]) => minutes !== 0) : REMINDERS
  const custom = value !== null && !choices.some(([minutes]) => minutes === value)
  return (
    <>
      <div data-remind-choices className="grid grid-cols-4 gap-1 p-1">
        {choices.map(([minutes, label]) => (
          <Button key={label} variant={value === minutes ? 'secondary' : 'ghost'} size="sm" className={plan} data-remind={minutes ?? 'none'} onClick={() => value !== minutes && onSave(minutes)}>{label}</Button>
        ))}
      </div>
      <PropInput icon={Bell} type="number" value={custom ? String(value) : ''} placeholder="Custom" ghost="Custom: 45" does="Any number of minutes before" suffix="minutes before"
        onSave={(minutes) => minutes !== '' && Number(minutes) !== value && onSave(Math.max(0, Number(minutes)))} />
      {value !== null && <p className="px-2 py-1.5 text-xs leading-relaxed">A Mac notification: {quoted(remindSaid(value, start, allDay), 80)}. Held in quiet hours, and shown once they end.</p>}
    </>
  )
}

/**
 * How it repeats: the usual choices named for this event ("Monthly on the
 * last Friday"), and a custom one (every so many days, weeks, months or
 * years, the weekdays, the nth weekday or the date), with how it ends.
 */
function RepeatPicker({ one, onSave }: { one: Occurrence; onSave: (repeat: Repeat | null) => void }): React.JSX.Element {
  return (
    <Island compact title="Repeat" actions={<span data-repeat-said className="max-w-40 truncate text-control font-medium text-foreground">{one.repeat ? 'Repeats' : 'Does not repeat'}</span>}>
      <RepeatChoices one={one} onSave={onSave} />
    </Island>
  )
}
/** How it repeats, the choices themselves: in its island on the event's page, and under its row in the event's popover. */
function RepeatChoices({ one, onSave }: { one: Occurrence; onSave: (repeat: Repeat | null) => void }): React.JSX.Element {
  const at = dayjs(one.start)
  const nth = nthOf(at)
  const last = isLast(at)
  const presets: [string, Repeat | null][] = [
    ['none', null],
    ['daily', { freq: 'daily' }],
    ['weekdays', { freq: 'weekly', days: [1, 2, 3, 4, 5] }],
    ['weekly', { freq: 'weekly', days: [at.day()] }],
    ...(nth <= 4 ? [['nth', { freq: 'monthly', by: 'nth', nth }] as [string, Repeat]] : []),
    ...(last ? [['last', { freq: 'monthly', by: 'nth', nth: -1 }] as [string, Repeat]] : []),
    ['date', { freq: 'monthly', by: 'date' }],
    ['yearly', { freq: 'yearly' }]
  ]
  const rule = one.repeat
  const same = (a: Repeat | null, b: Repeat | null): boolean => JSON.stringify(a && { ...a, until: undefined, count: undefined, every: a.every ?? 1 }) === JSON.stringify(b && { ...b, until: undefined, count: undefined, every: b.every ?? 1 })
  const picked = presets.find(([, preset]) => same(preset, rule))?.[0] ?? 'custom'
  const [custom, setCustom] = useState(picked === 'custom')
  const keepEnd = (next: Repeat | null): Repeat | null => (next && rule ? { ...next, until: rule.until, count: rule.count } : next)
  return (
    <>
      <div data-repeat-choices className="flex flex-col p-1">
        {presets.map(([id, preset]) => (
          <button key={id} type="button" data-repeat={id} aria-pressed={picked === id && !custom} onClick={() => (setCustom(false), !same(preset, rule) && onSave(keepEnd(preset)))}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-foreground hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium">
            <RepeatIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">{preset ? repeatSaid(preset, one.start) : 'Does not repeat'}</span>
          </button>
        ))}
        <button type="button" data-repeat="custom" aria-pressed={custom || picked === 'custom'} onClick={() => (chime('open'), setCustom(true))}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-foreground hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium">
          <RepeatIcon className="size-3.5 shrink-0 opacity-70" /><span className="flex-1">{picked === 'custom' && rule ? repeatSaid(rule, one.start) : 'Custom…'}</span>
        </button>
      </div>
      {(custom || picked === 'custom') && <CustomRepeat start={one.start} rule={rule ?? { freq: 'weekly', days: [at.day()] }} onSave={onSave} />}
      {rule && <RepeatEnd rule={rule} onSave={onSave} />}
    </>
  )
}

const UNITS: [Repeat['freq'], string, string][] = [['daily', 'day', 'days'], ['weekly', 'week', 'weeks'], ['monthly', 'month', 'months'], ['yearly', 'year', 'years']]
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
function CustomRepeat({ start, rule, onSave }: { start: string; rule: Repeat; onSave: (repeat: Repeat) => void }): React.JSX.Element {
  const at = dayjs(start)
  const every = rule.every ?? 1
  const set = (patch: Partial<Repeat>): void => onSave({ ...rule, ...patch })
  return (
    <div data-repeat-custom className="flex flex-col gap-2 px-2 py-2 text-control text-foreground">
      <div className="flex flex-wrap items-center gap-1.5">
        <span>Every</span>
        <input type="number" min={1} max={99} defaultValue={every} key={every} aria-label="Every how many" data-repeat-every
          onBlur={(event) => { const n = Math.max(1, Math.min(99, Math.round(Number(event.target.value) || 1))); if (n !== every) set({ every: n }) }}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className="h-7 w-12 rounded-md border bg-transparent px-1.5 text-center tabular-nums outline-none focus-visible:border-foreground/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        {UNITS.map(([freq, one, many]) => (
          <button key={freq} type="button" data-repeat-unit={freq} aria-pressed={rule.freq === freq} onClick={() => rule.freq !== freq && onSave({ freq, every, until: rule.until, count: rule.count, ...(freq === 'weekly' ? { days: [at.day()] } : {}) })}
            className="h-7 rounded-full px-2.5 hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium">{every === 1 ? one : many}</button>
        ))}
      </div>
      {rule.freq === 'weekly' && (
        <div className="flex gap-1" role="group" aria-label="On these days">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const on = (rule.days?.length ? rule.days : [at.day()]).includes(day)
            return (
              <button key={day} type="button" data-repeat-day={day} aria-pressed={on} aria-label={dayjs().day(day).format('dddd')}
                onClick={() => { const now = rule.days?.length ? rule.days : [at.day()]; const next = on ? now.filter((one) => one !== day) : [...now, day]; if (next.length) set({ days: next }); else chime('nope') }}
                className="flex size-7 items-center justify-center rounded-full shrink-0 font-medium hover:bg-accent aria-pressed:bg-foreground aria-pressed:text-background">{LETTERS[day]}</button>
            )
          })}
        </div>
      )}
      {rule.freq === 'monthly' && (
        <div className="flex flex-wrap gap-1">
          <button type="button" aria-pressed={rule.by !== 'nth'} onClick={() => set({ by: 'date', nth: undefined })} className="h-7 rounded-full px-2.5 hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium">{repeatSaid({ freq: 'monthly' }, start).replace('Monthly on', 'On')}</button>
          {nthOf(at) <= 4 && <button type="button" aria-pressed={rule.by === 'nth' && rule.nth !== -1} onClick={() => set({ by: 'nth', nth: nthOf(at) })} className="h-7 rounded-full px-2.5 hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium">On the {['', 'first', 'second', 'third', 'fourth'][nthOf(at)]} {at.format('dddd')}</button>}
          {isLast(at) && <button type="button" aria-pressed={rule.by === 'nth' && rule.nth === -1} onClick={() => set({ by: 'nth', nth: -1 })} className="h-7 rounded-full px-2.5 hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium">On the last {at.format('dddd')}</button>}
        </div>
      )}
    </div>
  )
}

function RepeatEnd({ rule, onSave }: { rule: Repeat; onSave: (repeat: Repeat) => void }): React.JSX.Element {
  const end = rule.count ? 'count' : rule.until ? 'until' : 'never'
  const pill = 'h-7 rounded-full px-2.5 hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium'
  return (
    <div data-repeat-end className="flex flex-col gap-1.5 px-2 py-2 text-control text-foreground">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1">Ends</span>
        <button type="button" data-repeat-end-never aria-pressed={end === 'never'} className={pill} onClick={() => end !== 'never' && onSave({ ...rule, until: null, count: null })}>Never</button>
        <button type="button" data-repeat-end-until aria-pressed={end === 'until'} className={pill} onClick={() => end !== 'until' && onSave({ ...rule, count: null, until: dayjs().add(3, 'month').format('YYYY-MM-DD') })}>On a day</button>
        <button type="button" data-repeat-end-count aria-pressed={end === 'count'} className={pill} onClick={() => end !== 'count' && onSave({ ...rule, until: null, count: 10 })}>After</button>
      </div>
      {end === 'until' && <DatePicker lead="Last day" value={dayjs(rule.until!).hour(12).toISOString()} onChange={(day) => day && onSave({ ...rule, until: dayjs(day).format('YYYY-MM-DD') })} />}
      {end === 'count' && (
        <label className="flex items-center gap-1.5">
          <input type="number" min={1} max={999} key={rule.count} defaultValue={rule.count ?? 10} aria-label="How many times" data-repeat-count
            onBlur={(event) => { const n = Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 1))); if (n !== rule.count) onSave({ ...rule, count: n }) }}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            className="h-7 w-14 rounded-md border bg-transparent px-1.5 text-center tabular-nums outline-none focus-visible:border-foreground/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          times
        </label>
      )}
    </div>
  )
}

// --- a timed task's reminder before its time, in the task's own panel

export function TaskRemindBefore({ id, due, allDay }: { id: string; due: string | null; allDay: boolean }): React.JSX.Element | null {
  const before = useLive(() => events.taskRemind(id), null as number | null, [id])
  if (!due || allDay) return null
  return <RemindPicker task value={before} start={due} onSave={(minutes) => void events.setTaskRemind(id, minutes).then(() => (chime('tap'), toast(minutes === null ? 'No reminder before it now' : `Reminds you ${remindName(minutes).toLowerCase()}`, () => void events.setTaskRemind(id, before))))} />
}

// --- a note made for an event says so, and opens the event

export function EventSource({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const one = useLive(() => events.ofNote(id), null as Awaited<ReturnType<typeof events.ofNote>>, [id])
  if (!one) return null
  return (
    <div className="page-narrow mx-auto mb-2 w-full px-4 @[40rem]/page:px-12">
      <Tip label="Open the event in the Calendar">
        <button type="button" data-note-event={one.key} onClick={() => (chime('open'), onOpen ? onOpen('event', one.key) : window.api.openInHome('event', one.key))}
          className="-mx-2 flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left text-body text-foreground transition-colors hover:bg-accent motion-reduce:transition-none">
          <CalendarDays className="size-4 shrink-0" />
          <span className="truncate">From the event <strong className="font-semibold">{one.title}</strong>, {whenSaid(one.start, one.end, one.allDay, clock)}</span>
        </button>
      </Tip>
    </div>
  )
}

// --- a second time zone beside the hours

/** The second zone set in Settings › Calendar, or none. */
export function useSecondZone(): string | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const zone = settings?.secondZone
  return zone && knownZone(zone) ? zone : null
}
/** Whether the Mac knows a zone by that name ("Asia/Kolkata" and its older "Asia/Calcutta" both). */
const knownZone = (zone: string): boolean => {
  try {
    return !!new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    return false
  }
}
const twelve = (globalThis as { api?: { twelveHour?: boolean } }).api?.twelveHour === true
/** The hour column's width: room for a second set of times when there is a second zone. */
export const gutterOf = (zone: string | null): string => (zone ? (twelve ? '9rem' : '6.5rem') : '3.5rem')

/** The other zone's time at each of this Mac's hours, down the left of the hour column, quieter. */
export function ZoneHours({ zone, day }: { zone: string; day: string }): React.JSX.Element {
  return (
    <div data-cal-zone-hours={zone} aria-hidden className="absolute inset-y-0 left-0 w-1/2">
      {Array.from({ length: 23 }, (_, n) => n + 1).map((hour) => {
        const at = inZone(zone, dayjs(day).startOf('day').hour(hour).toDate())
        return <span key={hour} data-zone-hour={hour} className="absolute left-1.5 -translate-y-1/2 text-control text-muted-foreground tabular-nums" style={{ top: hour * HOUR }}>{clock(at.toISOString())}</span>
      })}
    </div>
  )
}
/** Over the two hour columns: each zone's short name. */
export function ZoneHeads({ zone, day }: { zone: string; day: string }): React.JSX.Element {
  const at = dayjs(day).hour(12).toDate()
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <span data-cal-zone-heads className="flex items-end justify-between self-end px-1.5 pb-1 text-control font-medium">
      <Tip label={`${cityOf(zone)}: ${zoneGap(zone, at)}`}><span data-cal-zone-name className="text-muted-foreground">{zoneShort(zone, at)}</span></Tip>
      <span className="text-(--mf-muted-strong)">{zoneShort(here, at)}</span>
    </span>
  )
}

/**
 * Settings › Calendar › “Show a second time zone”: a switch, the zone picked
 * from every one the Mac knows by its city, and the two clocks side by side
 * as the setting's own preview.
 */
export function SecondZoneSetting({ value, set }: { value: string | null; set: (zone: string | null) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const every = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(every) }, [])
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone
  const words = find.trim().toLowerCase()
  const found = (words ? ZONES.filter((one) => `${one.id} ${one.city}`.toLowerCase().replace(/_/g, ' ').includes(words) || zoneShort(one.id, now).toLowerCase() === words) : ZONES).slice(0, 80)
  const zone = value ?? (here === 'America/New_York' ? 'Europe/London' : 'America/New_York')
  const city = cityOf
  return (
    <span className="flex flex-wrap items-center gap-2">
      {value && (
        <span data-zone-preview className="text-control text-foreground tabular-nums">
          {clock(now.toISOString())} here, <strong className="font-semibold">{clock(inZone(value, now).toISOString())}</strong> in {city(value)} ({zoneShort(value, now)}), {zoneGap(value, now)}
        </span>
      )}
      {value && (
        <Popover open={open} onOpenChange={(next) => (next && chime('open'), setOpen(next), setFind(''))}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-zone-pick>{city(value)} <span className="font-normal text-(--mf-muted-strong)">{zoneShort(value, now)}</span></Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 gap-1 p-1.5" data-zone-list>
            <input autoFocus value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a city or zone" aria-label="Find a city or zone"
              onKeyDown={(event) => event.key === 'Enter' && found[0] && (event.preventDefault(), chime('tap'), set(found[0].id), setOpen(false))}
              className="h-8 rounded-md border bg-transparent px-2 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30" />
            <div className="flex max-h-64 flex-col overflow-y-auto">
              {found.map((one) => (
                <button key={one.id} type="button" data-zone={one.id} onClick={() => (chime('tap'), set(one.id), setOpen(false))}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-control text-foreground hover:bg-accent aria-pressed:bg-accent" aria-pressed={one.id === value}>
                  <span className="min-w-0 flex-1 truncate">{one.city} <span className="text-muted-foreground">{one.id.split('/')[0]}</span></span>
                  <span className="shrink-0 tabular-nums text-(--mf-muted-strong)">{clock(inZone(one.id, now).toISOString())} {zoneShort(one.id, now)}</span>
                </button>
              ))}
              {!found.length && <p className="px-2 py-1 text-control text-foreground/85">No zone by that name.</p>}
            </div>
          </PopoverContent>
        </Popover>
      )}
      <Switch data-zone-switch checked={!!value} onCheckedChange={(on) => set(on ? zone : null)} aria-label="Show a second time zone" />
    </span>
  )
}

// --- an event found by search

/** How search marks an event: the calendar's page mark. */
export const EVENT_KIND = { id: 'event', label: 'Event', icon: CalendarDays, tint: 'var(--tt-color-text-blue)' }

/** Search's preview of an event: its name, when, where, who and its notes. */
export function EventPeek({ id }: { id: string }): React.JSX.Element | null {
  const one = useLive(() => events.one(id), null as Awaited<ReturnType<typeof events.one>>, [id])
  if (!one) return null
  return (
    <div data-event-peek={id} className="flex flex-col gap-2 p-4 text-body text-foreground">
      <p dir="auto" className="font-heading text-xl font-semibold text-pretty">{one.title}</p>
      <p>{whenSaid(one.start, one.end, one.allDay, clock)}{one.repeatSaid ? `. ${one.repeatSaid}` : ''}</p>
      {one.place && <p>At <strong className="font-semibold">{one.place}</strong></p>}
      {one.people.length > 0 && <p>With <strong className="font-semibold">{one.people.join(', ')}</strong></p>}
      {one.notes && <p className="whitespace-pre-wrap text-foreground/85">{one.notes}</p>}
    </div>
  )
}
