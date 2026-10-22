import { unloaded, useLive, vigil, type Settings } from './vigil'
import { useMacEvents, type MacEvent } from './mac-calendar'
import { chime } from './sound'
import { toast } from '@/components/vigil/ui'
import type { Calendar, EventPatch, Occurrence, Scope } from '../../../main/events'
import { dayjs } from '../../../main/dates'
export type { Calendar, EventPatch, Occurrence, Scope }
export type { Repeat } from '../../../main/event-repeat'

/**
 * Calendar events in the windows (src/main/events.ts): reading them for a
 * span, the calendars and which are shown, and each change said with an
 * Undo, which ⌘Z reaches too.
 */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil<T>(channel, ...args)
type Made = { key: string; undo: string }

export const events = {
  between: (from: string, to: string) => call<Occurrence[]>('events', from, to),
  one: (key: string) => call<(Occurrence & { linked: { id: string; title: string }[] }) | null>('event', key),
  add: (patch: EventPatch) => call<Made>('event:add', patch),
  save: (key: string, patch: EventPatch, scope?: Scope) => call<Made | null>('event:save', key, patch, scope),
  drop: (key: string, scope?: Scope) => call<{ undo: string } | null>('event:drop', key, scope),
  undo: (token: string) => call<boolean>('events:undo', token),
  calendars: () => call<Calendar[]>('calendars'),
  setCalendar: (patch: Partial<Calendar> & { binned?: boolean }) => call<{ id: string; was: (Calendar & { binned: boolean }) | null } | null>('calendar:set', patch),
  link: (key: string, capture: string) => call<boolean>('event:note:link', key, capture),
  ofNote: (capture: string) => call<(Occurrence & { linked: { id: string; title: string }[] }) | null>('event:of-note', capture),
  join: (url: string) => call<boolean>('event:join', url),
  taskRemind: (id: string) => call<number | null>('task:remind', id),
  setTaskRemind: (id: string, before: number | null) => call<boolean>('task:remind:set', id, before)
}

/** The newest change's undo, for ⌘Z while the side panel is open (a dialog, so the toast leaves the key alone). */
let last: string | null = null
export const undoLastEvent = (): boolean => {
  if (!last) return false
  void events.undo(last).then((done) => done && chime('undo'))
  last = null
  return true
}

/** A change made, said, with its Undo. */
export async function changeEvent(run: Promise<{ undo: string } | null>, said: string): Promise<string | null> {
  const done = await run
  if (!done) return (chime('nope'), null)
  chime('tap')
  last = done.undo
  toast(said, () => void events.undo(done.undo).then((back) => back && chime('undo')))
  return 'key' in done ? (done as Made).key : null
}

/** A calendar's colour as the theme draws it: its ink, readable in light and dark. */
export const inkOf = (color: string | null | undefined): string =>
  !color ? 'var(--tt-color-text-blue)' : color.startsWith('#') ? color : `var(--tt-color-text-${color})`

/** The events of a span, read again on every change. */
export function useEvents(from: string, to: string): Occurrence[] {
  return useLive(() => events.between(from, to), [] as Occurrence[], [from, to])
}
export function useCalendars(): Calendar[] {
  return useLive(events.calendars, [] as Calendar[])
}

/** One of your Mac's calendars, read only, as the Calendar lists it beside your own. */
type MacLayer = { id: string; name: string; color: string | null }

/**
 * What the Calendar shows over a span: your own events (each calendar on or
 * off), the tasks as a layer of their own, and your Mac's calendars, read
 * only, each with its own switch too.
 */
export function useLayers(from: Date, to: Date): {
  calendars: Calendar[]
  mac: MacLayer[]
  macEvents: (MacEvent & { layer: string })[]
  shown: (id: string) => boolean
  tasks: boolean
  toggle: (id: string, on: boolean) => void
  colorOf: (calendarId: string) => string
  /** Every read it is made of has answered: the calendars, the settings and your Mac's events. */
  ready: boolean
} {
  const calendars = useCalendars()
  const settings = useLive(vigil.settings, null as Settings | null)
  const hidden = new Set(settings?.calendarHidden ?? [])
  const read = useMacEvents(from, to)
  const named = [...new Set(read.events.map((one) => one.calendar || 'Calendar'))]
  const mac = named.map((name) => ({ id: `mac:${name}`, name, color: read.events.find((one) => (one.calendar || 'Calendar') === name)?.color ?? null }))
  const shown = (id: string): boolean => (id.startsWith('mac:') || id === 'tasks' ? !hidden.has(id) : !calendars.find((one) => one.id === id)?.hidden)
  const toggle = (id: string, on: boolean): void => {
    if (id.startsWith('mac:') || id === 'tasks') {
      const next = new Set(hidden)
      if (on) next.delete(id)
      else next.add(id)
      void vigil.setSettings({ calendarHidden: [...next] })
    } else void events.setCalendar({ id, hidden: !on })
  }
  return {
    calendars,
    mac,
    macEvents: read.events.map((one) => ({ ...one, layer: `mac:${one.calendar || 'Calendar'}` })).filter((one) => !hidden.has(one.layer)),
    shown,
    tasks: !hidden.has('tasks'),
    toggle,
    colorOf: (id) => inkOf(calendars.find((one) => one.id === id)?.color),
    ready: !unloaded(calendars) && !!settings && !unloaded(read)
  }
}

// --- a second time zone, for the grid's second hour column

/** How far a zone is ahead of UTC at a moment, in minutes. */
function zoneOffset(zone: string, at = new Date()): number {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(at).map((part) => [part.type, part.value]))
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute))
    return Math.round((wall - Math.floor(at.getTime() / 60000) * 60000) / 60000)
  } catch {
    return -at.getTimezoneOffset()
  }
}
/** The moment as the clock in that zone reads it, shifted onto this Mac's clock so `clock()` can say it. */
export const inZone = (zone: string, at: Date): Date => new Date(at.getTime() + (zoneOffset(zone, at) + at.getTimezoneOffset()) * 60000)
/** A zone's short name ("EDT", "CEST", "AEDT"); where there is none in common use, "GMT+5:30". */
export function zoneShort(zone: string, at = new Date()): string {
  for (const locale of ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ']) {
    try {
      const name = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value
      if (name && !/^(GMT|UTC)[+-]/.test(name)) return name
    } catch {
      return zone
    }
  }
  const off = zoneOffset(zone, at)
  return `GMT${off < 0 ? '-' : '+'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, '0')}` : ''}`
}
/** "3 hours ahead", "5 hours 30 minutes behind", "the same time": the zone beside this Mac's own. */
export function zoneGap(zone: string, at = new Date()): string {
  const gap = zoneOffset(zone, at) + at.getTimezoneOffset()
  if (!gap) return 'the same time as here'
  const hours = Math.floor(Math.abs(gap) / 60)
  const minutes = Math.abs(gap) % 60
  const said = [hours && `${hours} ${hours === 1 ? 'hour' : 'hours'}`, minutes && `${minutes} minutes`].filter(Boolean).join(' ')
  return `${said} ${gap > 0 ? 'ahead' : 'behind'}`
}
/** Cities the zone list still files under an older name. */
const RENAMED: Record<string, string> = { Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh', Kiev: 'Kyiv', Katmandu: 'Kathmandu', Rangoon: 'Yangon', Godthab: 'Nuuk' }
/** A zone's city as people say it: "New York", "Kolkata". */
export const cityOf = (id: string): string => { const last = id.split('/').pop()!.replace(/_/g, ' '); return RENAMED[last] ?? last }
/** Every zone the Mac knows, by its city. */
export const ZONES: { id: string; city: string }[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone').map((id) => ({ id, city: cityOf(id) }))
  } catch {
    return [{ id: 'UTC', city: 'UTC' }]
  }
})()

/** "Fri 23 Oct, 13:00 – 14:00" or "Fri 23 Oct, all day": when an event is, said once. */
export function whenSaid(start: string, end: string, allDay: boolean, clock: (iso: string) => string): string {
  const a = dayjs(start)
  const b = dayjs(end)
  if (allDay) {
    const last = b.subtract(1, 'day')
    return last.isAfter(a, 'day') ? `${a.format('ddd D MMM')} – ${last.format('ddd D MMM')}, all day` : `${a.format('ddd D MMM')}, all day`
  }
  return b.isSame(a, 'day') ? `${a.format('ddd D MMM')}, ${clock(start)} – ${clock(end)}` : `${a.format('ddd D MMM')}, ${clock(start)} – ${b.format('ddd D MMM')}, ${clock(end)}`
}
