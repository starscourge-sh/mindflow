import { Notification, ipcMain, shell } from 'electron'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'

import { atomically, changed, database, setting } from './captures'
import { gate } from './vigil'
import { dayjs } from './dates'
import { remindSaid } from './event-said'
import { occurrences, readRepeat, repeatSaid, splitAt, type Repeat } from './event-repeat'

/**
 * Calendar events, beside tasks, the way Google Calendar, Notion Calendar and
 * Apple Calendar keep them: a start and an end (or a whole day), a place,
 * people, a video link, notes, and the calendar it is on (Personal, Work,
 * Uni to start), whose colour it takes. An event can repeat; one time of a
 * series changed on its own is a row of its own pointing back at the series
 * (Google's way), and one time taken out is listed on the series. Each can
 * remind you before it starts, as a Mac notification, held in quiet hours
 * like a task's alert. Meeting notes are notes linked to one time of an event.
 *
 * Every channel starts `vigil:`, so the preload passes it through.
 */

export type Calendar = { id: string; name: string; color: string; hidden: boolean }

/** One time an event happens: a one-off, one time of a series, or a time of a series changed on its own. */
export type Occurrence = {
  /** Which time this is: the event's id, or `series@its original start` for a time of a series. */
  key: string
  /** The row it is drawn from (the series itself for an unchanged time). */
  id: string
  /** The series it belongs to, if it repeats. */
  series: string | null
  start: string
  end: string
  allDay: boolean
  title: string
  place: string | null
  people: string[]
  video: string | null
  notes: string
  calendarId: string
  /** Minutes before it starts that it reminds you; null for no reminder, 0 at its time. */
  remind: number | null
  repeat: Repeat | null
  repeatSaid: string | null
  /** How many notes are linked to this time. */
  noted: number
  /** Its own colour, over its calendar's (a right-click's swatches); null for the calendar's. */
  ink: string | null
  /** Called off: kept on the calendar, struck through. */
  cancelled: boolean
}

export type EventPatch = Partial<{
  title: string
  start: string
  end: string
  allDay: boolean
  place: string | null
  people: string[]
  video: string | null
  notes: string
  calendarId: string
  remind: number | null
  repeat: Repeat | null
  ink: string | null
  cancelled: boolean
}>

/** Which times of a repeating event a change reaches. */
export type Scope = 'one' | 'following' | 'all'

type Row = {
  id: string; title: string; start_at: string; end_at: string; all_day: number; place: string | null; people: string | null
  video: string | null; notes: string | null; calendar_id: string | null; remind: number | null; repeat: string | null
  exdates: string | null; series_id: string | null; original_start: string | null; binned_at: string | null; created_at: string; updated_at: string
  ink: string | null; cancelled: number | null
}

/** Calendar colours: the theme's own named inks, so each reads in light and dark. */
export const CAL_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown', 'gray']
const STARTERS: [string, string][] = [['Personal', 'blue'], ['Work', 'orange'], ['Uni', 'purple']]
/** The reminders offered, in minutes before; anything else is a custom one. */
export const REMIND_CHOICES = [0, 5, 10, 15, 30, 60, 1440]

const clean = (text: unknown, most: number): string => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, most)
const iso = (value: unknown): string | null => {
  const at = dayjs(String(value ?? ''))
  return value && at.isValid() ? at.toISOString() : null
}
const list = (json: string | null): string[] => {
  try {
    const got = JSON.parse(json ?? '[]')
    return Array.isArray(got) ? got.map(String) : []
  } catch {
    return []
  }
}
const now = (): string => new Date().toISOString()

let db: DatabaseSync
let home: (type: string, id: string) => void = () => undefined

function tables(): void {
  db.exec(`create table if not exists calendars (
      id text primary key, name text not null, color text not null, hidden integer not null default 0, sort integer not null default 0, binned_at text, created_at text not null
    );
    create table if not exists events (
      id text primary key, title text not null, start_at text not null, end_at text not null, all_day integer not null default 0,
      place text, people text, video text, notes text, calendar_id text, remind integer, repeat text, exdates text,
      series_id text, original_start text, binned_at text, created_at text not null, updated_at text not null
    );
    create index if not exists events_by_start on events(start_at);
    create index if not exists events_by_series on events(series_id);
    create table if not exists event_notes (event_key text not null, capture_id text not null, created_at text not null, primary key (event_key, capture_id));
    create table if not exists event_told (key text primary key, at text not null);
    create table if not exists task_remind (task_id text primary key, before integer not null);`)
  // An event's own colour and its being called off, added after the first events were kept.
  const have = new Set((db.prepare('pragma table_info(events)').all() as { name: string }[]).map((one) => one.name))
  if (!have.has('ink')) db.exec('alter table events add column ink text')
  if (!have.has('cancelled')) db.exec('alter table events add column cancelled integer')
  // Personal, Work and Uni, once: renamed, recoloured or removed as you like after.
  if (!db.prepare('select 1 from calendars limit 1').get()) {
    const add = db.prepare('insert into calendars (id, name, color, sort, created_at) values (?, ?, ?, ?, ?)')
    STARTERS.forEach(([name, color], at) => add.run(name.toLowerCase(), name, color, at, now()))
  }
}

export function calendars(): Calendar[] {
  return (db.prepare('select id, name, color, hidden from calendars where binned_at is null order by sort, created_at').all() as { id: string; name: string; color: string; hidden: number }[])
    .map((row) => ({ ...row, hidden: !!row.hidden }))
}

const noteCounts = (): Map<string, number> =>
  new Map((db.prepare("select event_key as key, count(*) as n from event_notes n join captures c on c.id = n.capture_id where c.status != 'discarded' group by event_key").all() as { key: string; n: number }[]).map((row) => [row.key, row.n]))

/** One time of a row, as the calendar draws it. */
function shape(row: Row, key: string, start: string, end: string, noted: Map<string, number>, master?: Row): Occurrence {
  const rule = readRepeat((master ?? row).repeat)
  return {
    key, id: row.id, series: master?.id ?? (rule ? row.id : null), start, end, allDay: !!row.all_day, title: row.title,
    place: row.place, people: list(row.people), video: row.video, notes: row.notes ?? '', calendarId: row.calendar_id ?? 'personal',
    remind: row.remind, repeat: rule, repeatSaid: rule ? repeatSaid(rule, (master ?? row).start_at) : null, noted: noted.get(key) ?? 0,
    ink: row.ink ?? null, cancelled: !!row.cancelled
  }
}

/** Every time an event happens between two moments, a series' times spread out, its changed times in their place. */
export function eventsBetween(from: string, to: string): Occurrence[] {
  const noted = noteCounts()
  const live = 'binned_at is null and coalesce(calendar_id, \'personal\') not in (select id from calendars where binned_at is not null)'
  const out: Occurrence[] = []
  for (const row of db.prepare(`select * from events where ${live} and series_id is null and repeat is null and start_at < ? and end_at > ?`).all(to, from) as Row[])
    out.push(shape(row, row.id, row.start_at, row.end_at, noted))
  const masters = db.prepare(`select * from events where ${live} and series_id is null and repeat is not null and start_at < ?`).all(to) as Row[]
  const changedTimes = db.prepare('select * from events where series_id = ?')
  for (const master of masters) {
    const rule = readRepeat(master.repeat)
    if (!rule) continue
    const length = dayjs(master.end_at).diff(master.start_at)
    const own = changedTimes.all(master.id) as Row[]
    const skip = new Set([...list(master.exdates), ...own.map((one) => one.original_start ?? '')])
    for (const at of occurrences(rule, master.start_at, dayjs(from).subtract(length, 'ms').toDate(), to)) {
      const start = at.toISOString()
      if (skip.has(start)) continue
      const end = dayjs(at).add(length, 'ms').toISOString()
      if (end <= from) continue
      out.push(shape(master, `${master.id}@${start}`, start, end, noted, master))
    }
    for (const one of own) if (!one.binned_at && one.start_at < to && one.end_at > from) out.push(shape(one, `${master.id}@${one.original_start}`, one.start_at, one.end_at, noted, master))
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** What a key names: the row, the series when it is a time of one, and that time's original start. */
function resolve(key: string): { row: Row | null; master: Row | null; at: string | null } {
  const [id, at] = key.split('@')
  const first = db.prepare('select * from events where id = ?').get(id) as Row | undefined
  if (!at) return { row: first ?? null, master: first?.repeat ? first : null, at: null }
  const own = db.prepare('select * from events where series_id = ? and original_start = ?').get(id, at) as Row | undefined
  return { row: own ?? null, master: first ?? null, at }
}

/** One time, read back by its key, with the notes linked to it. */
export function eventOf(key: string): (Occurrence & { linked: { id: string; title: string }[] }) | null {
  const { row, master, at } = resolve(key)
  const noted = noteCounts()
  let one: Occurrence | null = null
  if (row && !at) one = shape(row, key, row.start_at, row.end_at, noted)
  else if (row && master) one = shape(row, key, row.start_at, row.end_at, noted, master)
  else if (master && at) one = shape(master, key, at, dayjs(at).add(dayjs(master.end_at).diff(master.start_at), 'ms').toISOString(), noted, master)
  if (!one) return null
  const linked = db.prepare(`select c.id, coalesce(nullif(c.title, ''), 'Untitled') as title from event_notes n join captures c on c.id = n.capture_id
    where n.event_key = ? and c.status != 'discarded' order by n.created_at`).all(key) as { id: string; title: string }[]
  return { ...one, linked }
}

// --- changes, each with an undo that puts every row of the series back as it was

const undos = new Map<string, { rows: Row[]; made: string[]; notes?: { event_key: string; capture_id: string; created_at: string }[] }>()
/** Every row of an event: itself and, for a series, each time changed on its own. */
const group = (id: string): Row[] => db.prepare('select * from events where id = ? or series_id = ?').all(id, id) as Row[]
const keep = (rows: Row[], made: string[] = []): string => {
  const token = randomUUID()
  undos.set(token, { rows, made })
  if (undos.size > 200) undos.delete(undos.keys().next().value!)
  return token
}
const COLUMNS = ['id', 'title', 'start_at', 'end_at', 'all_day', 'place', 'people', 'video', 'notes', 'calendar_id', 'remind', 'repeat', 'exdates', 'series_id', 'original_start', 'binned_at', 'created_at', 'updated_at', 'ink', 'cancelled'] as const
const put = (row: Row): void => void db.prepare(`insert or replace into events (${COLUMNS.join(', ')}) values (${COLUMNS.map(() => '?').join(', ')})`).run(...COLUMNS.map((column) => row[column] ?? null))

/** A patch as columns: only what it names, cleaned. */
function columns(patch: EventPatch): Partial<Row> {
  const out: Partial<Row> = {}
  if (patch.title !== undefined) out.title = clean(patch.title, 200) || 'New event'
  if (patch.start !== undefined) out.start_at = iso(patch.start) ?? undefined
  if (patch.end !== undefined) out.end_at = iso(patch.end) ?? undefined
  if (patch.allDay !== undefined) out.all_day = patch.allDay ? 1 : 0
  if (patch.place !== undefined) out.place = clean(patch.place, 200) || null
  if (patch.people !== undefined) out.people = JSON.stringify([...new Set((patch.people ?? []).map((one) => clean(one, 80)).filter(Boolean))])
  if (patch.video !== undefined) out.video = /^https?:\/\/\S+$/i.test(clean(patch.video, 1000)) ? clean(patch.video, 1000) : null
  if (patch.notes !== undefined) out.notes = String(patch.notes ?? '').slice(0, 20000)
  if (patch.calendarId !== undefined && calendars().some((one) => one.id === patch.calendarId)) out.calendar_id = patch.calendarId
  if (patch.remind !== undefined) out.remind = patch.remind === null || !Number.isFinite(Number(patch.remind)) ? null : Math.max(0, Math.min(40320, Math.round(Number(patch.remind))))
  if (patch.ink !== undefined) out.ink = patch.ink && CAL_COLORS.includes(patch.ink) ? patch.ink : null
  if (patch.cancelled !== undefined) out.cancelled = patch.cancelled ? 1 : 0
  if (patch.repeat !== undefined) out.repeat = patch.repeat && readRepeat(JSON.stringify(patch.repeat)) ? JSON.stringify(patch.repeat) : null
  for (const key of Object.keys(out) as (keyof Row)[]) if (out[key] === undefined) delete out[key]
  return out
}
/** An end never before its start: a whole day lasts at least the day, a timed one at least five minutes. */
const fit = (row: Row): Row => {
  if (row.all_day) {
    const start = dayjs(row.start_at).startOf('day')
    const end = dayjs(row.end_at)
    return { ...row, start_at: start.toISOString(), end_at: (end.isAfter(start) ? end.startOf('day').isSame(end) ? end : end.add(1, 'day').startOf('day') : start.add(1, 'day')).toISOString() }
  }
  return dayjs(row.end_at).diff(row.start_at, 'minute') >= 5 ? row : { ...row, end_at: dayjs(row.start_at).add(5, 'minute').toISOString() }
}

export function addEvent(patch: EventPatch): { key: string; undo: string } {
  const at = now()
  const start = iso(patch.start) ?? dayjs().add(1, 'hour').startOf('hour').toISOString()
  const row = fit({
    id: randomUUID(), title: 'New event', start_at: start, end_at: iso(patch.end) ?? dayjs(start).add(1, 'hour').toISOString(), all_day: 0,
    place: null, people: '[]', video: null, notes: '', calendar_id: calendars()[0]?.id ?? 'personal', remind: setting<number | null>('eventRemind', 10),
    repeat: null, exdates: null, series_id: null, original_start: null, binned_at: null, created_at: at, updated_at: at,
    ...columns(patch)
  } as Row)
  // A whole day has no minutes before it: its reminder is only what was asked for.
  if (row.all_day && patch.remind === undefined) row.remind = null
  put(row)
  changed()
  return { key: row.repeat ? `${row.id}@${row.start_at}` : row.id, undo: keep([], [row.id]) }
}

/** Fields that are not about when: they reach the times changed on their own too, on "All". */
const NOT_TIME = ['title', 'place', 'people', 'video', 'notes', 'calendar_id', 'remind', 'ink', 'cancelled'] as const

export function saveEvent(key: string, patch: EventPatch, scope: Scope = 'one'): { key: string; undo: string } | null {
  const { row, master, at } = resolve(key)
  const set = columns(patch)
  return atomically(() => {
    // A one-off, or a series reached as itself.
    if (!at && row) {
      const was = group(row.id)
      const next = fit({ ...row, ...set, updated_at: now() })
      put(next)
      // No longer repeating: its own times go with the series they were part of.
      if (row.repeat && !next.repeat) db.prepare('delete from events where series_id = ?').run(row.id)
      changed()
      return { key: next.repeat ? `${next.id}@${next.start_at}` : next.id, undo: keep(was) }
    }
    if (!master || !at) return null
    const was = group(master.id)
    const current = row ?? { ...master, start_at: at, end_at: dayjs(at).add(dayjs(master.end_at).diff(master.start_at), 'ms').toISOString() }
    if (scope === 'one') {
      const own = fit({ ...current, ...set, id: row?.id ?? randomUUID(), repeat: null, exdates: null, series_id: master.id, original_start: at, updated_at: now() })
      put(own)
      changed()
      return { key, undo: keep(was) }
    }
    const first = at === master.start_at
    if (scope === 'all' || first) {
      // The whole series moves by as much as this time moved, and takes its new length.
      const moved = set.start_at ? dayjs(set.start_at).diff(current.start_at) : 0
      const length = set.start_at || set.end_at ? dayjs(set.end_at ?? current.end_at).diff(set.start_at ?? current.start_at) : dayjs(master.end_at).diff(master.start_at)
      const start = dayjs(master.start_at).add(moved, 'ms')
      const next = fit({ ...master, ...set, start_at: start.toISOString(), end_at: start.add(length, 'ms').toISOString(), updated_at: now() })
      put(next)
      const shared = Object.fromEntries(NOT_TIME.filter((one) => one in set).map((one) => [one, set[one]]))
      for (const own of db.prepare('select * from events where series_id = ?').all(master.id) as Row[]) {
        if (moved || set.repeat !== undefined) db.prepare('delete from events where id = ?').run(own.id)
        else put({ ...own, ...shared, updated_at: now() })
      }
      if (moved) db.prepare('update events set exdates = null where id = ?').run(master.id)
      changed()
      return { key: next.repeat ? `${next.id}@${dayjs(current.start_at).add(moved, 'ms').toISOString()}` : next.id, undo: keep(was) }
    }
    // This and following: the series stops the day before, and a new one starts here with the change.
    const rule = readRepeat(master.repeat)!
    const { before, after } = splitAt(rule, master.start_at, at)
    put({ ...master, repeat: JSON.stringify(before), updated_at: now() })
    const fresh = randomUUID()
    const start = set.start_at ?? current.start_at
    const length = dayjs(set.end_at ?? current.end_at).diff(set.start_at ?? current.start_at)
    const next = fit({ ...master, ...set, id: fresh, start_at: start, end_at: dayjs(start).add(length, 'ms').toISOString(), repeat: set.repeat !== undefined ? set.repeat : JSON.stringify(after),
      exdates: JSON.stringify(list(master.exdates).filter((one) => one >= at)), created_at: now(), updated_at: now() })
    put(next)
    db.prepare('update events set exdates = ? where id = ?').run(JSON.stringify(list(master.exdates).filter((one) => one < at)), master.id)
    if (start === at) db.prepare('update events set series_id = ? where series_id = ? and original_start >= ?').run(fresh, master.id, at)
    else db.prepare('delete from events where series_id = ? and original_start >= ?').run(master.id, at)
    changed()
    return { key: next.repeat ? `${fresh}@${next.start_at}` : fresh, undo: keep(was, [fresh]) }
  })
}

/** Taken away: a one-off or a whole series to the Bin; one time of a series, or the rest of it, left out of it. */
export function dropEvent(key: string, scope: Scope = 'one'): { undo: string } | null {
  const { row, master, at } = resolve(key)
  return atomically(() => {
    const id = !at ? row?.id : master?.id
    if (!id) return null
    const was = group(id)
    const all = !at || scope === 'all' || (scope === 'following' && at === master!.start_at)
    if (all) {
      const stamp = now()
      db.prepare('update events set binned_at = ? where id = ? or (series_id = ? and binned_at is null)').run(stamp, id, id)
    } else if (scope === 'one') {
      if (row) db.prepare('delete from events where id = ?').run(row.id)
      db.prepare('update events set exdates = ? where id = ?').run(JSON.stringify([...new Set([...list(master!.exdates), at!])]), master!.id)
    } else {
      const { before } = splitAt(readRepeat(master!.repeat)!, master!.start_at, at!)
      db.prepare('update events set repeat = ? where id = ?').run(JSON.stringify(before), master!.id)
      db.prepare('delete from events where series_id = ? and original_start >= ?').run(master!.id, at!)
    }
    changed()
    return { undo: keep(was) }
  })
}

export function undoEvents(token: string): boolean {
  const kept = undos.get(token)
  if (!kept) return false
  undos.delete(token)
  atomically(() => {
    const ids = new Set([...kept.made, ...kept.rows.map((row) => row.id)])
    for (const id of ids) db.prepare('delete from events where id = ? or series_id = ?').run(id, id)
    for (const row of kept.rows) put(row)
  })
  changed()
  return true
}

// --- the Bin: a one-off or a whole series goes there, and comes back with its changed times

export const eventsInBin = (): { type: string; id: string; title: string; kind: string; at: string }[] =>
  database().prepare("select 'event' as type, id, title, 'event' as kind, binned_at as at from events where binned_at is not null and series_id is null").all() as never
export const eventFromBin = (id: string): boolean => {
  const row = database().prepare('select binned_at from events where id = ?').get(id) as { binned_at: string | null } | undefined
  if (!row?.binned_at) return false
  database().prepare('update events set binned_at = null where (id = ? or series_id = ?) and binned_at = ?').run(id, id, row.binned_at)
  return true
}
export const eventToBin = (id: string): boolean =>
  database().prepare('update events set binned_at = ? where (id = ? or series_id = ?) and binned_at is null').run(now(), id, id).changes > 0
/** Let go for good: only one in the Bin, and with it its changed times and its note links (the notes stay). */
export const forgetEvents = (id?: string): number => {
  const d = database()
  const ids = (id ? d.prepare('select id from events where id = ? and binned_at is not null and series_id is null').all(id) : d.prepare('select id from events where binned_at is not null and series_id is null').all()) as { id: string }[]
  for (const one of ids) {
    d.prepare('delete from events where id = ? or series_id = ?').run(one.id, one.id)
    d.prepare("delete from event_notes where event_key = ? or event_key like ? escape '\\'").run(one.id, `${one.id.replace(/[\\%_]/g, '\\$&')}@%`)
  }
  return ids.length
}

// --- reminders: from the database every half minute, so they come after a restart too

let heldSince: number | null = null
/** In tests, the notifications shown, newest last. */
const told: { title: string; body: string }[] = []

type Due = { key: string; title: string; body: string; fire: number; open: [string, string] }

/** Every reminder that comes between two moments: events', and timed tasks' set to remind before. */
export function remindersBetween(from: number, to: number): Due[] {
  const out: Due[] = []
  // A reminder can be as much as four weeks before: those starting up to then are looked at.
  for (const one of eventsBetween(new Date(from).toISOString(), new Date(to + 40320 * 60000).toISOString())) {
    if (one.remind === null) continue
    const start = one.allDay ? dayjs(one.start).hour(9).valueOf() : dayjs(one.start).valueOf()
    const fire = start - one.remind * 60000
    if (fire <= from || fire > to) continue
    const where = one.place ? `, at ${one.place}` : ''
    out.push({ key: `event:${one.key}:${one.start}:${one.remind}`, title: one.title, body: `${remindSaid(one.remind, one.start, one.allDay)}${where}`, fire, open: ['event', one.key] })
  }
  const tasks = db.prepare(`select t.id, t.title, t.due_at, r.before from task_remind r join tasks t on t.id = r.task_id
    where t.status = 'open' and t.due_at is not null and t.all_day = 0`).all() as { id: string; title: string; due_at: string; before: number }[]
  for (const task of tasks) {
    const fire = dayjs(task.due_at).valueOf() - task.before * 60000
    if (fire <= from || fire > to) continue
    out.push({ key: `task:${task.id}:${task.due_at}:${task.before}`, title: task.title.replace(/(^|\s)#[^\s#]+/g, '').trim() || task.title, body: remindSaid(task.before, task.due_at), fire, open: ['task', task.id] })
  }
  return out.sort((a, b) => a.fire - b.fire)
}

let timer: ReturnType<typeof setTimeout> | undefined
function checkReminders(): number {
  const { blackout, hidePrivate } = gate()
  if (blackout || hidePrivate) {
    heldSince ??= Date.now()
    return 0
  }
  const at = Date.now()
  // Due in the last hour, or, after a hold, since an hour before it began: shown once it lifts.
  const due = remindersBetween(Math.min(at, heldSince ?? at) - 3600000, at)
  heldSince = null
  let shown = 0
  for (const one of due) {
    if (db.prepare('select 1 from event_told where key = ?').get(one.key)) continue
    db.prepare('insert into event_told (key, at) values (?, ?)').run(one.key, now())
    shown += 1
    told.push({ title: one.title, body: one.body })
    if (!Notification.isSupported()) continue
    const sounds = setting('sounds', true)
    const note = new Notification({ title: one.title, body: one.body, silent: !sounds })
    note.on('click', () => home(...one.open))
    note.show()
  }
  // The next one to the second, rather than up to half a minute late.
  clearTimeout(timer)
  const next = remindersBetween(at, at + 30_000)[0]
  if (next) timer = setTimeout(checkReminders, Math.max(500, next.fire - Date.now() + 50))
  return shown
}

export function registerEvents(open: (type: string, id: string) => void): void {
  db = database()
  home = open
  tables()
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))

  handle('calendars', () => calendars())
  // Made or changed: name, colour, shown or hidden. Gives back what it was, for an undo.
  handle('calendar:set', (patch: Partial<Calendar> & { binned?: boolean }) => {
    const was = patch.id ? (db.prepare('select id, name, color, hidden, binned_at from calendars where id = ?').get(patch.id) as (Calendar & { binned_at: string | null }) | undefined) : undefined
    const id = was?.id ?? randomUUID()
    const name = patch.name !== undefined ? clean(patch.name, 40) || was?.name || 'Calendar' : was?.name ?? 'New calendar'
    const color = patch.color && CAL_COLORS.includes(patch.color) ? patch.color : (was?.color ?? CAL_COLORS[calendars().length % CAL_COLORS.length])
    const hidden = patch.hidden !== undefined ? (patch.hidden ? 1 : 0) : was?.hidden ? 1 : 0
    const binned = patch.binned === undefined ? (was?.binned_at ?? null) : patch.binned ? now() : null
    // The last calendar stays: an event always has one to be on.
    if (binned && !was?.binned_at && calendars().length <= 1) return null
    db.prepare(`insert into calendars (id, name, color, hidden, sort, binned_at, created_at) values (?, ?, ?, ?, (select coalesce(max(sort), 0) + 1 from calendars), ?, ?)
      on conflict (id) do update set name = excluded.name, color = excluded.color, hidden = excluded.hidden, binned_at = excluded.binned_at`).run(id, name, color, hidden, binned, now())
    changed()
    return { id, was: was ? { id: was.id, name: was.name, color: was.color, hidden: !!was.hidden, binned: !!was.binned_at } : null }
  })
  handle('events', (from: string, to: string) => eventsBetween(String(from), String(to)))
  handle('event', (key: string) => eventOf(String(key)))
  handle('event:add', (patch: EventPatch) => addEvent(patch ?? {}))
  handle('event:save', (key: string, patch: EventPatch, scope?: Scope) => saveEvent(String(key), patch ?? {}, scope))
  handle('event:drop', (key: string, scope?: Scope) => dropEvent(String(key), scope))
  handle('events:undo', (token: string) => undoEvents(String(token)))
  // A note for one time of an event: linked by id both ways, so each shows the other.
  handle('event:note:link', (key: string, capture: string) => {
    db.prepare('insert or ignore into event_notes (event_key, capture_id, created_at) values (?, ?, ?)').run(String(key), String(capture), now())
    changed()
    return true
  })
  handle('event:of-note', (capture: string) => {
    const link = db.prepare('select event_key from event_notes where capture_id = ? order by created_at limit 1').get(String(capture)) as { event_key: string } | undefined
    return link ? eventOf(link.event_key) : null
  })
  // The video link, opened only when you click it, and only a web address.
  handle('event:join', (url: string) => {
    if (!/^https?:\/\//i.test(String(url))) return false
    void shell.openExternal(String(url))
    return true
  })
  handle('task:remind', (id: string) => (db.prepare('select before from task_remind where task_id = ?').get(String(id)) as { before: number } | undefined)?.before ?? null)
  handle('task:remind:set', (id: string, before: number | null) => {
    if (before === null || !Number.isFinite(Number(before))) db.prepare('delete from task_remind where task_id = ?').run(String(id))
    else db.prepare('insert or replace into task_remind (task_id, before) values (?, ?)').run(String(id), Math.max(0, Math.min(40320, Math.round(Number(before)))))
    changed()
    return true
  })
  // What is set to remind you over the next two days; and, for the QA runs, the check now and what it showed.
  handle('reminders:next', () => remindersBetween(Date.now(), Date.now() + 2 * 86400000).map(({ key, title, body, fire }) => ({ key, title, body, at: new Date(fire).toISOString() })))
  handle('reminders:check', () => checkReminders())
  handle('reminders:told', () => told)
  setInterval(checkReminders, 30_000)
  // Once the app is up: what came due while it was closed (in the last hour) shows now.
  setTimeout(checkReminders, 4000)
}
