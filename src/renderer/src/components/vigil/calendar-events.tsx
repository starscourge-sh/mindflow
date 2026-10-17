import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Bell, CalendarDays, Check, FileText, MapPin, Plus, Repeat as RepeatIcon, Trash2, Users, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { clock } from '@/lib/clock'
import { moveToBin } from '@/lib/to-bin'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { changeEvent, events, inZone, inkOf, useCalendars, whenSaid, zoneGap, zoneShort, ZONES, cityOf, type Occurrence, type Repeat, type Scope, type useLayers } from '@/lib/events'
import { readEvent } from '../../../../main/event-words'
import { isLast, nthOf, repeatSaid } from '../../../../main/event-repeat'
import { remindSaid } from '../../../../main/event-said'
import { dayjs, dayKey } from '../../../../main/dates'
import { DatePicker } from './date-picker'
import { TimeField } from './time-field'
import { RowMenu, type RowItem } from './row-menu'
import { Island, Kbd, Prop, PropInput, Props, Tip, toast } from './ui'

/** As the grid draws hours: one hour's height, and the steps a time snaps to. */
const HOUR = 48
const SNAP = 15
const snap = (minute: number): number => Math.max(0, Math.min(24 * 60 - SNAP, Math.round(minute / SNAP) * SNAP))

/** One time of an event as the calendar shows it: its colour, and whether it is your Mac's (read only). */
export type Shown = Occurrence & { color: string; readOnly?: boolean }

/** Your Mac's events as read-only times on the calendar, beside your own. */
export function macShown(list: { title: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null; layer: string }[]): Shown[] {
  return list.map((one, at) => ({
    key: `mac:${at}:${one.start}`, id: `mac:${at}`, series: null, start: one.start, end: one.end, allDay: one.allDay, title: one.title, place: null, people: [], video: null,
    notes: '', calendarId: one.layer, remind: null, repeat: null, repeatSaid: null, noted: 0, color: inkOf(one.color ?? 'gray'), readOnly: true
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
export function askScope(verb: 'Change' | 'Delete', offerOne = true): Promise<Scope | null> {
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
            <span className="flex min-w-0 flex-col"><span className="text-body font-medium text-foreground">{label}</span><span className="text-control text-foreground/80">{note}</span></span>
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
export async function notesFor(one: Pick<Occurrence, 'key' | 'title' | 'start' | 'end' | 'allDay' | 'place' | 'people'>, open?: (type: string, id: string) => void, fresh = false): Promise<void> {
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

/** The right-click menu every event has, on the grid, the month and the panel. */
export function eventMenu(one: Shown, { open, onOpen }: { open: () => void; onOpen?: (type: string, id: string) => void }): RowItem[] {
  if (one.readOnly) return [{ label: 'From your Mac’s calendar, read only', run: () => chime('nope') }]
  return [
    { label: 'Open', keys: '↵', run: open },
    { label: one.noted ? 'Open its notes' : 'Notes for this', run: () => void notesFor(one, onOpen) },
    ...(one.video ? [{ label: 'Join the video call', run: () => void events.join(one.video!) }] : []),
    { label: 'Move to the Bin', keys: '⌫', danger: true, run: () => void dropOne(one) }
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
export function EventBlock({ one, day, at, length, lane, onOpen, onNote }: {
  one: Shown; day: string; at: number; length: number; lane: { lane: number; of: number }
  onOpen: (key: string) => void
  onNote?: (type: string, id: string) => void
}): React.JSX.Element {
  const [lift, setLift] = useState<Lift | null>(null)
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
      if (!now) chime('lift')
      now = follow(e.clientX, e.clientY)
      setLift(now)
    }
    const done = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', esc, true)
    }
    const up = (e: PointerEvent): void => {
      done()
      if (!now) return (chime('open'), onOpen(one.key))
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
  const fill = { background: `color-mix(in oklab, ${one.color} 30%, var(--background))` }
  const target = lift && !lift.allDay ? document.querySelector<HTMLElement>(`[data-cal-col="${lift.day}"]`) : null
  return (
    <>
      <RowMenu items={eventMenu(one, { open: () => onOpen(one.key), onOpen: onNote })}>
        <div role="button" tabIndex={0} data-cal-event={one.key} data-cal-calendar={one.calendarId} data-cal-start={at} data-cal-length={length} data-readonly={one.readOnly || undefined} aria-label={said}
          onPointerDown={(event) => start(event, 'move')}
          onClick={(event) => one.readOnly && (event.stopPropagation(), toast('From your Mac’s calendar: change it in Calendar', undefined, 'info'))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.preventDefault(), chime('open'), onOpen(one.key))
            if ((event.key === 'Backspace' || event.key === 'Delete') && !one.readOnly) (event.preventDefault(), void dropOne(one))
          }}
          className={`group/event @container absolute z-[2] flex touch-none overflow-hidden rounded-md text-left text-control leading-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring ${one.readOnly ? 'cursor-default' : 'cursor-grab'} ${lift ? 'outline-dashed outline-1 outline-foreground/40 [&>span]:invisible' : 'transition-shadow duration-150 hover:shadow-(--mf-panel-shadow) motion-reduce:transition-none'}`}
          style={{ top: (at / 60) * HOUR + 1, height: Math.max(18, (length / 60) * HOUR - 2), left: `calc(${lane.lane * width}% + 2px)`, width: `calc(${width}% - 4px)`, ...fill }}>
          <BlockWords one={one} day={day} at={at} length={length} short={short} />
          {!one.readOnly && (
            <span data-cal-event-resize aria-hidden onPointerDown={(event) => start(event, 'resize')}
              className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-foreground/50 after:opacity-0 after:transition-opacity group-hover/event:after:opacity-100 motion-reduce:after:transition-none" />
          )}
        </div>
      </RowMenu>
      {/* Where it would land, drawn in the column it is over. */}
      {lift && target && createPortal(
        <div data-cal-ghost className="pointer-events-none absolute inset-x-1 z-30 flex overflow-hidden rounded-md text-control leading-tight text-foreground shadow-(--mf-shadow-lift)"
          style={{ top: (lift.start / 60) * HOUR + 1, height: Math.max(18, (lift.length / 60) * HOUR - 2), ...fill }}>
          <BlockWords one={one} day={lift.day} at={lift.start} length={lift.length} short={lift.length < 45} />
        </div>, target)}
    </>
  )
}

function BlockWords({ one, day, at, length, short }: { one: Shown; day: string; at: number; length: number; short: boolean }): React.JSX.Element {
  const from = dayjs(day).startOf('day').add(at, 'minute').toISOString()
  const to = dayjs(day).startOf('day').add(at + length, 'minute').toISOString()
  return (
    <span className={`flex min-w-0 flex-1 px-1.5 py-0.5 ${short ? 'items-center gap-1.5' : 'flex-col'}`}>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-semibold">{one.title || 'New event'}</span>
        {one.noted > 0 && <Tip label="Has notes"><FileText data-cal-event-noted aria-label="Has notes" className="size-3 shrink-0" /></Tip>}
        {one.repeat && <RepeatIcon aria-label="Repeats" className="size-3 shrink-0 opacity-80" />}
      </span>
      <span className={`shrink-0 truncate tabular-nums text-foreground/85 ${short ? 'hidden @[10rem]:inline' : 'hidden @[5rem]:block'}`}>{clock(from)}{short ? '' : ` – ${clock(to)}`}{!short && one.place ? ` · ${one.place}` : ''}</span>
    </span>
  )
}

/** A whole-day event, or one on the month: a filled chip in its calendar's colour, its time first. */
export function EventChip({ one, day, onOpen, onNote, month = false }: { one: Shown; day: string; onOpen: (key: string) => void; onNote?: (type: string, id: string) => void; month?: boolean }): React.JSX.Element {
  const [carried, setCarried] = useState<{ x: number; y: number } | null>(null)
  const start = (event: React.PointerEvent): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (one.readOnly) return
    const [x0, y0] = [event.clientX, event.clientY]
    let moving = false
    const under = (x: number, y: number): string | null => {
      const el = document.elementsFromPoint(x, y).find((hit) => !(hit as HTMLElement).closest('[data-cal-ghost]'))?.closest<HTMLElement>('[data-cal-allday], [data-month-plan] [data-day]')
      return el?.dataset.calAllday ?? el?.dataset.day ?? null
    }
    const move = (e: PointerEvent): void => {
      if (!moving && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return
      if (!moving) chime('lift')
      moving = true
      setCarried({ x: e.clientX, y: e.clientY })
    }
    const done = (): void => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up), window.removeEventListener('keydown', esc, true))
    const up = (e: PointerEvent): void => {
      done()
      setCarried(null)
      if (!moving) return (chime('open'), onOpen(one.key))
      const to = under(e.clientX, e.clientY)
      const days = to ? dayjs(to).diff(dayjs(day).startOf('day'), 'day') : 0
      if (!days) return chime('stay')
      const begins = dayjs(one.start).add(days, 'day')
      void changeOne(one, { start: begins.toISOString(), end: dayjs(one.end).add(days, 'day').toISOString() }, `Moved to ${begins.format('ddd D MMM')}`)
    }
    const esc = (e: KeyboardEvent): void => void (e.key === 'Escape' && moving && (e.preventDefault(), e.stopPropagation(), done(), setCarried(null), (moving = false), chime('stay')))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', esc, true)
  }
  const time = one.allDay ? '' : clock(dayKey(one.start) === day ? one.start : dayjs(day).startOf('day').toISOString())
  return (
    <>
      <RowMenu items={eventMenu(one, { open: () => onOpen(one.key), onOpen: onNote })}>
        <button type="button" data-cal-event-chip={one.key} data-cal-calendar={one.calendarId} title={`${time ? `${time} ` : ''}${one.title}`}
          onPointerDown={start}
          onClick={(event) => one.readOnly && (event.stopPropagation(), toast('From your Mac’s calendar: change it in Calendar', undefined, 'info'))}
          onKeyDown={(event) => (event.key === 'Backspace' || event.key === 'Delete') && !one.readOnly && (event.preventDefault(), void dropOne(one))}
          className={`flex ${month ? 'h-5' : 'h-6'} min-w-0 shrink-0 touch-none items-center gap-1 rounded-sm px-1.5 text-left text-control text-foreground ${carried ? 'opacity-40' : ''}`}
          style={{ background: `color-mix(in oklab, ${one.color} 30%, var(--background))` }}>
          {time && <span className="shrink-0 font-medium tabular-nums">{time}</span>}
          <span className="truncate">{one.title || 'New event'}</span>
          {one.noted > 0 && <FileText data-cal-event-noted aria-label="Has notes" className="size-3 shrink-0" />}
        </button>
      </RowMenu>
      {carried && createPortal(
        <div data-cal-ghost style={{ left: carried.x + 8, top: carried.y + 8, background: `color-mix(in oklab, ${one.color} 30%, var(--background))` }}
          className="pointer-events-none fixed z-50 max-w-56 truncate rounded-md px-2 py-1 text-control text-foreground shadow-(--mf-shadow-lift)">{one.title}</div>, document.body)}
    </>
  )
}

// --- the side panel's layers: each calendar on or off, the tasks, your Mac's

export function CalendarLayers({ layers }: { layers: ReturnType<typeof useLayers> }): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const add = async (): Promise<void> => {
    const made = await events.setCalendar({ name: 'New calendar' })
    if (!made) return
    chime('noted')
    setEditing(made.id)
    toast('A new calendar', () => void events.setCalendar({ id: made.id, binned: true }))
  }
  const row = (id: string, name: string, color: string, extra?: React.ReactNode): React.JSX.Element => (
    <li key={id} data-cal-layer={id} className="group/layer flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent/60">
      <Switch size="sm" checked={layers.shown(id)} onCheckedChange={(on) => layers.toggle(id, on)} aria-label={`Show ${name}`} style={{ ['--primary' as string]: color }} />
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className={`min-w-0 flex-1 truncate text-body ${layers.shown(id) ? 'text-foreground' : 'text-foreground/70'}`}>{name}</span>
      {extra}
    </li>
  )
  return (
    <div data-cal-layers className="flex flex-col gap-1">
      <div className="flex items-center px-1">
        <h2 className="flex-1 text-body font-semibold text-foreground">Calendars</h2>
        <Tip label="Add a calendar"><Button variant="ghost" size="icon-sm" data-cal-layer-add aria-label="Add a calendar" onClick={() => void add()}><Plus /></Button></Tip>
      </div>
      <ul className="flex flex-col">
        {layers.calendars.map((one) => editing === one.id
          ? <CalendarEdit key={one.id} one={one} onDone={() => setEditing(null)} />
          : row(one.id, one.name, inkOf(one.color), (
            <RowMenu items={[
              { label: 'Rename or recolour', run: () => setEditing(one.id) },
              { label: 'Remove this calendar', danger: true, run: () => void events.setCalendar({ id: one.id, binned: true }).then((done) => done ? (chime('away'), toast(`${one.name} removed, with its events`, () => void events.setCalendar({ id: one.id, binned: false }))) : toast('The last calendar stays: an event needs one', undefined, 'info')) }
            ]}>
              <button type="button" aria-label={`Change ${one.name}`} onClick={() => (chime('open'), setEditing(one.id))} className="rounded-sm px-1 text-control text-foreground/80 opacity-0 group-hover/layer:opacity-100 hover:bg-accent focus-visible:opacity-100">Edit</button>
            </RowMenu>
          )))}
        {row('tasks', 'Tasks', 'var(--tt-brand-color-400)')}
      </ul>
      {layers.mac.length > 0 && (
        <>
          <h3 className="mt-2 px-1 text-control font-semibold text-foreground">Your Mac’s calendar <span className="font-normal">(read only)</span></h3>
          <ul className="flex flex-col">{layers.mac.map((one) => row(one.id, one.name, inkOf(one.color ?? 'gray')))}</ul>
        </>
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
        className="h-7 rounded-md border bg-transparent px-2 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Its colour">
        {COLORS.map((color) => (
          <button key={color} type="button" role="radio" aria-checked={one.color === color} aria-label={color} onClick={() => save({ color })}
            className="flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform active:scale-90 motion-reduce:transition-none aria-checked:ring-2 aria-checked:ring-foreground/60" style={{ background: inkOf(color) }}>
            {one.color === color && <Check className="size-3.5 text-background" />}
          </button>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="self-end" onClick={() => (chime('tap'), onDone())}>Done</Button>
    </li>
  )
}

// --- a new event from words, in the side panel

/**
 * The new event's first line: its words say the rest ("lunch with Sam fri
 * 1-2pm @Cafe"), and the slot dragged across fills in what they leave out.
 * What it understood is shown under it as you type, before it is made.
 */
export function NewEvent({ ask, onMade }: { ask: { day: string; minute: number | null; length: number }; onMade: (key: string) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => void requestAnimationFrame(() => field.current?.focus()), [])
  const known = useKnownPeople()
  const calendars = useCalendars()
  const [calendar, setCalendar] = useState<string | null>(null)
  const slotStart = ask.minute === null ? dayjs(ask.day).startOf('day') : dayjs(ask.day).startOf('day').add(ask.minute, 'minute')
  const slotEnd = ask.minute === null ? slotStart.add(1, 'day') : slotStart.add(Math.max(SNAP, ask.length || 60), 'minute')
  const read = useMemo(() => readEvent(text, new Date(), known), [text, known])
  const allDay = read.start ? read.allDay : ask.minute === null
  const start = read.start ?? slotStart.toISOString()
  const end = read.start ? (read.end ?? dayjs(read.start).add(1, allDay ? 'day' : 'hour').toISOString()) : slotEnd.toISOString()
  const fixedEnd = allDay ? dayjs(start).startOf('day').add(Math.max(1, dayjs(end).diff(dayjs(start).startOf('day'), 'day')), 'day').toISOString() : end
  const on = calendar ?? calendars.find((one) => !one.hidden)?.id ?? calendars[0]?.id ?? 'personal'
  const busy = useRef(false)
  const save = async (): Promise<void> => {
    if (!read.title) return chime('nope')
    if (busy.current) return
    busy.current = true
    const made = await events.add({ title: read.title, start, end: fixedEnd, allDay, place: read.place, people: read.people, repeat: read.repeat, calendarId: on })
    busy.current = false
    void changeEvent(Promise.resolve(made), `Added for ${whenSaid(start, fixedEnd, allDay, clock)}`)
    onMade(made.key)
  }
  return (
    <form data-new-event className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4 pb-4" onSubmit={(event) => (event.preventDefault(), void save())}>
      <h2 className="page-narrow mx-auto mb-3 w-full px-12 font-heading text-title font-semibold tracking-[-0.018em] text-foreground">New event</h2>
      <div className="page-narrow mx-auto flex w-full flex-col gap-3 px-12">
        <div className="flex min-h-10 items-center gap-2 rounded-lg border pr-1 pl-3 text-body focus-within:ring-1 focus-within:ring-ring">
          <input ref={field} data-new-event-words value={text} onChange={(event) => setText(event.target.value)} aria-label={`A new event for ${dayjs(ask.day).format('dddd D MMMM')}`}
            placeholder="Add an event: “lunch with Sam fri 1-2pm @Cafe”" className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-foreground/70" />
          <Button type="submit" size="sm" data-new-event-add>Add <Kbd>↵</Kbd></Button>
        </div>
        {/* What it will be, plain to read, before it is made. */}
        <div data-new-event-said className="flex flex-col gap-1 text-body text-foreground">
          <p><strong className="font-semibold">{read.title || 'An event'}</strong>, {whenSaid(start, fixedEnd, allDay, clock)}{read.repeat ? `, ${repeatSaid(read.repeat, start).toLowerCase()}` : ''}.</p>
          {(read.place || read.people.length > 0) && <p>{read.place && <>At <strong className="font-semibold">{read.place}</strong>. </>}{read.people.length > 0 && <>With <strong className="font-semibold">{read.people.join(', ')}</strong>.</>}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="On which calendar">
          {calendars.map((one) => (
            <button key={one.id} type="button" role="radio" aria-checked={on === one.id} data-new-event-calendar={one.id} onClick={() => (chime('tap'), setCalendar(one.id))}
              className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-control text-foreground transition-colors hover:bg-accent aria-checked:bg-accent aria-checked:font-medium motion-reduce:transition-none">
              <span aria-hidden className="size-2 rounded-full" style={{ background: inkOf(one.color) }} />{one.name}
            </button>
          ))}
        </div>
        <p className="text-body text-foreground/85">Then the place, people, video link, reminder, repeat and notes are on the event as it opens here. A day or time in the words wins.</p>
      </div>
    </form>
  )
}

/** The names your notes are from (Sources' people), to spell someone the way you already do. */
function useKnownPeople(): string[] {
  const sources = useLive(() => window.api.vigil<{ field: string; name: string }[]>('sources'), [] as { field: string; name: string }[])
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
  if (!one) return <p className="px-12 pt-6 text-body text-foreground/85">This event is no longer here.</p>
  const save = async (patch: Parameters<typeof events.save>[1], said: string, offerOne = true): Promise<void> => {
    const key = await changeOne(one, patch, said, offerOne)
    if (key && key !== eventKey) onKey(key)
  }
  const start = dayjs(one.start)
  const end = dayjs(one.end)
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
        <div className="page-narrow mx-auto mb-1 flex w-full items-center gap-2 px-12">
          <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: color }} />
          <span className="text-control font-medium text-foreground">Event</span>
        </div>
        <textarea key={one.title} rows={1} data-event-title aria-label="The event's name" defaultValue={one.title}
          className="page-narrow mx-auto mb-1 block w-full shrink-0 resize-none overflow-hidden bg-transparent px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none [field-sizing:content]"
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
          onBlur={(event) => { const title = event.target.value.replace(/\s*\n\s*/g, ' ').trim(); if (title && title !== one.title) void save({ title }, 'Renamed') }} />
        {/* When, on its own line and plain to read. */}
        <p data-event-when className="page-narrow mx-auto mb-3 w-full px-12 text-[0.9375rem] text-foreground">{whenSaid(one.start, one.end, one.allDay, clock)}{one.repeatSaid ? <><br /><span className="text-foreground/85">{one.repeatSaid}</span></> : null}</p>
        {one.video && (
          <div className="page-narrow mx-auto mb-3 w-full px-12">
            <Button data-event-join onClick={() => (chime('open'), void events.join(one.video!))}><Video /> Join the video call</Button>
          </div>
        )}
        <textarea key={`notes:${one.notes}`} data-event-notes aria-label="Notes about the event" defaultValue={one.notes} rows={4} placeholder="Add notes: the agenda, what to bring, what to ask"
          onBlur={(event) => event.target.value !== one.notes && void save({ notes: event.target.value }, 'Notes kept')}
          className="page-narrow mx-auto block w-full resize-none bg-transparent px-12 text-body leading-relaxed text-foreground outline-none placeholder:text-foreground/70 [field-sizing:content]" />
        {/* Meeting notes: a note of its own for this time, linked both ways. */}
        <div className="page-narrow mx-auto mt-4 flex w-full flex-col gap-1 px-12">
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
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: inkOf(cal.color) }} />
                <span className="flex-1">{cal.name}</span>
                {one.calendarId === cal.id && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </Island>
        <RemindPicker value={one.remind} allDay={one.allDay} start={one.start} onSave={(remind) => void save({ remind }, remind === null ? 'No reminder now' : `Reminds you ${remindName(remind).toLowerCase()}`)} />
        <Island compact title="Details">
          <PropInput icon={MapPin} value={one.place ?? ''} placeholder="Place" ghost="Place: Cafe on the corner" does="Where it is. It shows on the block, and in the reminder" onSave={(place) => place !== (one.place ?? '') && void save({ place: place || null }, place ? `At ${place}` : 'No place now')} />
          <PeopleField people={one.people} known={known} onSave={(people) => void save({ people }, people.length ? `With ${people.join(', ')}` : 'Nobody named now')} />
          <PropInput icon={Video} value={one.video ?? ''} placeholder="Video link" ghost="Video link: https://…" does="A call's address. “Join the video call” opens it, only when you click it" onSave={(video) => video !== (one.video ?? '') && void save({ video: video || null }, video ? 'Video link kept' : 'No video link now')} />
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
        <Users className="size-4 shrink-0" />
        {people.map((name) => (
          <span key={name} className="flex h-6 items-center gap-1 rounded-full bg-accent pr-1 pl-2 text-control text-foreground">
            {name}
            <button type="button" aria-label={`Take ${name} off`} onClick={() => onSave(people.filter((one) => one !== name))} className="flex size-4 items-center justify-center rounded-full hover:bg-foreground/10"><X className="size-3" /></button>
          </span>
        ))}
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder={people.length ? 'Add someone' : 'People'} aria-label="Add someone"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') (event.preventDefault(), add(offered[0] && !known.includes(text.trim()) && offered[0].toLowerCase().startsWith(text.trim().toLowerCase()) ? offered[0] : text))
            if (event.key === 'Backspace' && !text && people.length) onSave(people.slice(0, -1))
          }}
          className="h-6 min-w-20 flex-1 bg-transparent text-control text-foreground outline-none placeholder:text-foreground/70" />
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
export function RemindPicker({ value, onSave, allDay = false, start, task = false }: { value: number | null; onSave: (minutes: number | null) => void; allDay?: boolean; start: string; task?: boolean }): React.JSX.Element {
  const choices = task ? REMINDERS.filter(([minutes]) => minutes !== 0) : REMINDERS
  const custom = value !== null && !choices.some(([minutes]) => minutes === value)
  return (
    <Island compact title={task ? 'Remind me before' : 'Reminder'} actions={<span data-remind-said className="text-control font-medium text-foreground">{remindName(value)}</span>}>
      <div data-remind-choices className="grid grid-cols-4 gap-1 p-1">
        {choices.map(([minutes, label]) => (
          <Button key={label} variant={value === minutes ? 'secondary' : 'ghost'} size="sm" className={plan} data-remind={minutes ?? 'none'} onClick={() => value !== minutes && onSave(minutes)}>{label}</Button>
        ))}
      </div>
      <PropInput icon={Bell} type="number" value={custom ? String(value) : ''} placeholder="Custom" ghost="Custom: 45" does="Any number of minutes before" suffix="minutes before"
        onSave={(minutes) => minutes !== '' && Number(minutes) !== value && onSave(Math.max(0, Number(minutes)))} />
      {value !== null && <p className="px-2 py-1.5 text-xs leading-relaxed">A Mac notification: “{remindSaid(value, start, allDay)}”. Held in quiet hours, and shown once they end.</p>}
    </Island>
  )
}

/**
 * How it repeats: the usual choices named for this event ("Monthly on the
 * last Friday"), and a custom one (every so many days, weeks, months or
 * years, the weekdays, the nth weekday or the date), with how it ends.
 */
function RepeatPicker({ one, onSave }: { one: Occurrence; onSave: (repeat: Repeat | null) => void }): React.JSX.Element {
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
    <Island compact title="Repeat" actions={<span data-repeat-said className="max-w-40 truncate text-control font-medium text-foreground">{rule ? 'Repeats' : 'Does not repeat'}</span>}>
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
    </Island>
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
          className="h-7 w-12 rounded-md border bg-transparent px-1.5 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
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
                className="flex size-7 items-center justify-center rounded-full font-medium hover:bg-accent aria-pressed:bg-foreground aria-pressed:text-background">{LETTERS[day]}</button>
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
            className="h-7 w-14 rounded-md border bg-transparent px-1.5 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
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
    <div className="page-narrow mx-auto mb-2 w-full px-12">
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
  const settings = useLive(vigil.settings, null as Settings | null)
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
      <span className="text-foreground/80">{zoneShort(here, at)}</span>
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
            <Button variant="outline" size="sm" data-zone-pick>{city(value)} <span className="font-normal text-foreground/80">{zoneShort(value, now)}</span></Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 gap-1 p-1.5" data-zone-list>
            <input autoFocus value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a city or zone" aria-label="Find a city or zone"
              onKeyDown={(event) => event.key === 'Enter' && found[0] && (event.preventDefault(), chime('tap'), set(found[0].id), setOpen(false))}
              className="h-8 rounded-md border bg-transparent px-2 text-body text-foreground outline-none placeholder:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/30" />
            <div className="flex max-h-64 flex-col overflow-y-auto">
              {found.map((one) => (
                <button key={one.id} type="button" data-zone={one.id} onClick={() => (chime('tap'), set(one.id), setOpen(false))}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-control text-foreground hover:bg-accent aria-pressed:bg-accent" aria-pressed={one.id === value}>
                  <span className="min-w-0 flex-1 truncate">{one.city} <span className="text-foreground/75">{one.id.split('/')[0]}</span></span>
                  <span className="shrink-0 tabular-nums text-foreground/80">{clock(inZone(one.id, now).toISOString())} {zoneShort(one.id, now)}</span>
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
