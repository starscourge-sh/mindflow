import { Notification, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import * as chrono from 'chrono-node'
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'

import { LABEL, LIST, changed, database } from './captures'

/**
 * Everything past the capture: nuggets and articles, the review queue, tasks,
 * tags, pins, privacy, the numbers, and the five settings the plan allows.
 *
 * Nuggets and articles share one table, `nuggets`, told apart by `tier`: they
 * carry the same prompt, schedule and surfacing fields, and an article is a
 * nugget with a title and more words. Every channel here starts `vigil:`, and
 * the preload passes only those through.
 */

const now = (): string => new Date().toISOString()
const ago = (days: number): string => new Date(Date.now() - days * 86400000).toISOString()
const body = <T extends { body?: unknown }>(row: T): T => ({ ...row, body: JSON.parse((row.body as string) ?? 'null') })

/** A document's words, whether it is Markdown or the editor's JSON. */
export function plain(value: unknown): string {
  if (typeof value === 'string') return value
  const walk = (node: { text?: string; content?: unknown[] }): string =>
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join('\n')
  return value ? walk(value as { content?: unknown[] }) : ''
}

/** `#tags` in a text, lower-cased, once each. A heading's `# ` is not one. */
const tagsIn = (text: string): string[] =>
  [...new Set([...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase()))]

// --- settings and the privacy gate ----------------------------------------

/**
 * The settings and their defaults. The plan budgeted five; the argument for
 * the rest is that you asked for them, and each is one value read in one place.
 */
const DEFAULTS = {
  // Pages sit in a centred column, as Notion lays them out, unless this is on.
  fullWidth: false,
  // The small sounds on complete, promote and grade.
  sounds: true,
  // How loud they are, from silent to full.
  volume: 1,
  // Things ease in and out rather than appearing at once.
  motion: true,
  // Which of the nine packs they play through.
  soundPack: 'soft' as string,
  // The share of prompt opens that show a hint, and how many rot cards.
  hintRate: 0.1,
  rotCount: 3,
  retention: 0.9,
  newPerDay: 10,
  reviewsPerDay: 50,
  quietStart: '22:00',
  quietEnd: '07:00',
  safeMode: false,
  // The plan's fifth setting: how a task with a time tells you it is time.
  // Pull: it rises in Today. Quiet: the menu bar counts it. Alerts: a system
  // notification over your work, useful for "leave now", corrosive by default.
  notify: 'quiet' as 'pull' | 'quiet' | 'alerts'
}
export type Settings = typeof DEFAULTS

function settings(): Settings {
  const rows = database().prepare('select key, value from settings').all() as { key: string; value: string }[]
  return { ...DEFAULTS, ...Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)])) }
}

/**
 * What may surface unasked right now. Safe mode is a blackout on everything
 * the app volunteers; quiet hours only keep private items back. Search, lists
 * and a review you opened are never gated: you can hide what the app offers,
 * never what you asked for.
 */
export function gate(): { blackout: boolean; hidePrivate: boolean } {
  const { safeMode, quietStart, quietEnd } = settings()
  if (safeMode) return { blackout: true, hidePrivate: true }
  const time = new Date().toTimeString().slice(0, 5)
  const quiet =
    quietStart <= quietEnd ? time >= quietStart && time < quietEnd : time >= quietStart || time < quietEnd
  return { blackout: false, hidePrivate: quiet }
}

// --- spaced repetition ----------------------------------------------------

/** A stored card back as `ts-fsrs` wants it: its dates are Dates again. */
const cardOf = (state: string | null): Card => {
  if (!state) return createEmptyCard()
  const card = JSON.parse(state)
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined }
}
// The plan's learning steps, ten minutes then a day, and fuzz so cards learnt
// together spread over the days around their due date instead of landing at once.
const scheduler = (): ReturnType<typeof fsrs> =>
  fsrs(generatorParameters({ request_retention: settings().retention, learning_steps: ['10m', '1d'], enable_fuzz: true }))

/** When each of the four grades would bring an item back, for the buttons. */
const preview = (state: string | null): Record<number, string> => {
  const record = scheduler().repeat(cardOf(state), new Date())
  return Object.fromEntries([1, 2, 3, 4].map((grade) => [grade, record[grade as Grade].card.due.toISOString()]))
}

// --- tasks ----------------------------------------------------------------

const RECURRENCE = /\bevery(!)?\s+(day|weekday|week|month|year|\d+\s+(?:days?|weeks?|months?))\b/i

/** The next date in a series, from `from`. `every 3 days`, `every weekday`. */
function advance(from: Date, rule: string): Date {
  const next = new Date(from)
  const [, , unit] = RECURRENCE.exec(rule) ?? []
  const count = Number(/\d+/.exec(unit ?? '')?.[0] ?? 1)
  if (/day/.test(unit) && !/weekday/.test(unit)) next.setDate(next.getDate() + count)
  else if (/weekday/.test(unit)) do next.setDate(next.getDate() + 1); while ([0, 6].includes(next.getDay()))
  else if (/week/.test(unit)) next.setDate(next.getDate() + 7 * count)
  else if (/month/.test(unit)) next.setMonth(next.getMonth() + count)
  else if (/year/.test(unit)) next.setFullYear(next.getFullYear() + 1)
  return next
}

/**
 * A task from one line of text, the way Todoist reads it: "collect parcel
 * tomorrow 5pm", "water the plants every! 3 days". The date and the repeat are
 * taken out of the title. A date with no time is all day.
 */
function taskFrom(text: string): { title: string; due: string | null; allDay: boolean; recurrence: string | null; until: string | null } {
  let title = text.trim()
  // "until December": a series can end. Read first, so its date is not the due date.
  const ending = /\buntil\s+(.+)$/i.exec(title)
  const until = ending ? chrono.parseDate(ending[1], new Date(), { forwardDate: true }) : null
  if (ending && until) title = title.slice(0, ending.index).trim()
  const repeat = RECURRENCE.exec(title)
  if (repeat) title = title.replace(repeat[0], '').trim()
  const [found] = chrono.parse(title, new Date(), { forwardDate: true })
  if (found) title = (title.slice(0, found.index) + title.slice(found.index + found.text.length)).replace(/\s+/g, ' ').trim()
  let due = found?.start.date() ?? null
  if (!due && repeat) due = new Date()
  const allDay = !!due && !found?.start.isCertain('hour')
  if (due && allDay) due.setHours(9, 0, 0, 0)
  return { title, due: due?.toISOString() ?? null, allDay, recurrence: repeat?.[0] ?? null, until: until?.toISOString() ?? null }
}

function addTask(text: string, origin: string | null = null): string {
  const id = randomUUID()
  const task = taskFrom(text)
  database()
    .prepare(
      `insert into tasks (id, number, title, due_at, all_day, recurrence, repeat_until, origin_capture_id, created_at)
       values (?, (select coalesce(max(number), 0) + 1 from tasks), ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, task.title || text, task.due, task.allDay ? 1 : 0, task.recurrence, task.until, origin, now())
  return id
}

// --- the registration -----------------------------------------------------

export function registerVigil(): void {
  const db = database()
  const column = (table: string, definition: string): void => {
    try {
      db.exec(`alter table ${table} add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  // The tables first, so a new database gets every column added below.
  db.exec(`
    create table if not exists tasks (
      id text primary key, number integer, title text not null, notes text,
      status text not null default 'open', due_at text, all_day integer not null default 0,
      recurrence text, origin_capture_id text, created_at text not null, completed_at text
    );
    create table if not exists task_done (task_id text not null, done_at text not null);
    create table if not exists glosses (id text primary key, item_id text not null, body text not null, author text not null default 'user', created_at text not null);
    create table if not exists review_log (item_id text not null, grade integer not null, reviewed_at text not null, ms integer, first integer not null default 0);
    create table if not exists settings (key text primary key, value text not null);
  `)
  // Renamed in place, so what was typed as a source is kept as attribution.
  for (const table of ['captures', 'nuggets']) {
    try {
      db.exec(`alter table ${table} rename column cite to attribution`)
    } catch {
      // Already renamed, or never had it.
    }
  }
  column('captures', 'private integer not null default 0')
  column('captures', 'pinned_at text')
  column('nuggets', "tier text not null default 'nugget'")
  column('nuggets', "title text not null default ''")
  column('nuggets', 'prompt text')
  column('nuggets', 'private integer not null default 0')
  column('nuggets', 'pinned_at text')
  column('nuggets', 'state text')
  column('nuggets', 'due_at text')
  column('nuggets', 'suspended integer not null default 0')
  column('nuggets', 'origins text')
  column('nuggets', 'updated_at text')
  column('captures', 'remind_at text')
  column('nuggets', 'remind_at text')
  column('tasks', 'waiting_on text')
  column('hint_events', 'dwell_ms integer')
  column('captures', 'discharge integer not null default 0')
  column('captures', 'attribution text')
  column('captures', 'medium text')
  column('captures', 'exited_at text')
  column('captures', 'session_id text')
  column('captures', 'first_used_at text')
  column('captures', 'surfaced_at text')
  column('captures', 'surfacing_weight real not null default 1')
  // Kept by the database, so no exit can forget them: when a capture left the
  // inbox, and when it was first used (opened, exited or given a who or where),
  // which time to first use is measured by. Not in its first minute: that is
  // still the capturing.
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
  db.exec(`create trigger if not exists capture_exit after update of status on captures when new.status is not old.status begin
      update captures set exited_at = case when new.status = 'open' then null else ${stamp} end where id = new.id; end;
    create trigger if not exists capture_used after update of status, attribution, medium on captures
      when new.first_used_at is null and julianday('now') - julianday(new.captured_at) > 1.0 / 1440 begin
      update captures set first_used_at = ${stamp} where id = new.id; end;`)
  column('nuggets', 'attribution text')
  column('nuggets', 'context text')
  column('nuggets', "mode text not null default 'encounter'")
  column('tasks', 'subtasks text')
  column('tasks', 'estimate integer')
  column('tasks', 'sort_order real')
  column('tasks', 'notified_at text')
  column('tasks', 'repeat_until text')
  column('tasks', 'important integer not null default 0')
  column('tasks', 'deadline_at text')
  column('tasks', 'blocker text')
  column('tasks', 'reschedules integer not null default 0')
  column('nuggets', 'superseded_by text')
  column('nuggets', 'edited_since_review integer not null default 0')
  db.exec('create table if not exists task_links (task_id text not null, item_id text not null, primary key (task_id, item_id))')
  // A tag's colour, and whether it makes a task: the plan's labels, a colour
  // and a string with one behaviour you choose. Seeded with the four labels
  // the plan collapses into todo, because seeded beats empty.
  db.exec(`create table if not exists tag_meta (tag text primary key, color text, action integer not null default 0);
    insert or ignore into tag_meta (tag, color, action) values ('bug', 'red', 1), ('fix', 'orange', 1), ('feature', 'blue', 1), ('improvement', 'green', 1);`)
  column('tag_meta', 'alias_of text')

  // One-time changes, counted in the file itself. Bits default private: the
  // plan's one fail-safe kind, where the screen-share risk actually lives.
  const version = (db.prepare('pragma user_version').get() as { user_version: number }).user_version
  if (version < 1) {
    db.exec("update captures set private = 1 where kind = 'bit'; update nuggets set private = 1 where kind = 'bit'; pragma user_version = 1")
  }
  // The eight kinds: a kind is what you can tell apart, at capture and at
  // review. Tip, idea and question failed that and become notes; a turn of
  // phrase is a quote. Keep-or-offload is gone: everything open waits.
  if (version < 2) {
    db.exec(`
      update captures set kind = 'quote' where kind = 'saying';
      update captures set kind = 'note' where kind in ('tip', 'idea', 'question', 'self');
      update nuggets set kind = 'quote' where kind = 'saying';
      update nuggets set kind = 'note' where kind in ('tip', 'idea', 'question', 'self');
      update captures set discharge = 0;
      pragma user_version = 2`)
  }

  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))
  const write = <T>(result: T): T => (changed(), result)

  // --- settings and privacy
  handle('settings', () => settings())
  handle('settings:set', (patch: Partial<Settings>) => {
    for (const [key, value] of Object.entries(patch))
      db.prepare('insert or replace into settings (key, value) values (?, ?)').run(key, JSON.stringify(value))
    return write(settings())
  })
  handle('private', (table: 'captures' | 'nuggets', id: string, on: boolean) =>
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set private = ? where id = ?`).run(on ? 1 : 0, id))
  )

  // A few capture fields set one at a time from the properties column.
  const CAPTURE_FIELDS = { attribution: 'attribution', medium: 'medium', capturedAt: 'captured_at' } as const
  // Many at once, from a selection: a tag added to each, or one date for all,
  // for filling in when a batch of old things was really written.
  handle('captures:bulk', (ids: string[], change: { tag?: string; capturedAt?: string }) => {
    for (const id of ids) {
      if (change.capturedAt) db.prepare('update captures set captured_at = ? where id = ?').run(change.capturedAt, id)
      if (!change.tag) continue
      const tag = `#${change.tag.replace(/^#/, '')}`
      const row = db.prepare('select body from captures where id = ?').get(id) as { body: string }
      const body = JSON.parse(row.body ?? 'null')
      const next = body && typeof body === 'object'
        ? { ...body, content: [...(body.content ?? []), { type: 'paragraph', content: [{ type: 'text', text: tag }] }] }
        : `${body ?? ''}\n${tag}`.trim()
      db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(next), id)
    }
    return write(ids.length)
  })
  handle('capture:set', (id: string, field: keyof typeof CAPTURE_FIELDS, value: string | number | null) => {
    const column = CAPTURE_FIELDS[field]
    if (!column) return null
    return write(db.prepare(`update captures set ${column} = ? where id = ?`).run(value, id))
  })
  // A capture made while a session runs belongs to it: what you noticed while
  // doing the work is the work's record too.
  handle('capture:session', (id: string) =>
    db.prepare('update captures set session_id = (select id from sessions where ended_at is null order by started_at desc limit 1) where id = ?').run(id)
  )

  // What you have typed before in a field, most used first: the autocomplete
  // for attribution and medium. Never a preset list: seeding "book, podcast"
  // would lean you toward medium, the less useful half.
  handle('values', (field: 'attribution' | 'medium') =>
    (db.prepare(`select ${field} as v, count(*) n from captures where ${field} is not null and ${field} != '' group by v order by n desc limit 50`).all() as { v: string }[]).map((row) => row.v)
  )

  // --- the capture exits
  // Promote: a nugget made from the capture, which stays as it was. A word
  // comes with its prompt, the one kind with a natural question and answer.
  const promote = (id: string): string | null => {
    const capture = db.prepare(`select kind, body, private, attribution, ${LABEL} as title from captures where id = ? and status != 'promoted'`).get(id) as Record<string, string> | undefined
    if (!capture) return null
    // A quote's whole claim is "someone said this", so it does not become a
    // nugget until it says who.
    if (capture.kind === 'quote' && !capture.attribution && !/^[^:]{2,40}:/.test(capture.title)) return 'needs-source'
    const nugget = randomUUID()
    db.prepare(
      `insert into nuggets (id, capture_id, kind, title, body, prompt, private, attribution, mode, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nugget, id, capture.kind, capture.title, capture.body, capture.kind === 'word' ? `What does "${capture.title}" mean?` : null,
      capture.private, capture.attribution, 'encounter', now(), now())
    db.prepare("update captures set status = 'promoted' where id = ?").run(id)
    return write(nugget)
  }
  handle('promote', promote)
  // Resolve elsewhere: the capture becomes a task, and remembers it did.
  handle('toTask', (id: string) => {
    const capture = db.prepare(`select ${LABEL} as title from captures where id = ?`).get(id) as { title: string } | undefined
    if (!capture) return null
    const task = addTask(capture.title, id)
    db.prepare("update captures set status = 'resolved' where id = ?").run(id)
    return write(task)
  })

  // Three open captures, leaning old: the rot sampler. Random, so a sample and
  // never a queue to finish. Gated: nothing in safe mode, no private ones in
  // quiet hours.
  ipcMain.handle('captures:rot', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return []
    // Not one whose nugget was a hint in the last three days, and the same the
    // other way: the same thing twice in a row is a nag, not a surprise.
    const rot = db
      .prepare(
        `select ${LIST}, body from captures where status = 'open' ${hidePrivate ? 'and private = 0' : ''}
         and id not in (select nugget_id from hint_events where shown_at >= ? union select capture_id from nuggets where id in (select nugget_id from hint_events where shown_at >= ?))
         order by (julianday('now') - julianday(captured_at) + 1) * (abs(random()) % 1000) desc limit ${Math.max(0, Math.min(10, settings().rotCount))}`
      )
      .all(ago(3), ago(3))
      .map(body)
    for (const row of rot) db.prepare('update captures set surfaced_at = ? where id = ?').run(now(), row.id as string)
    return rot
  })

  // One hint: a nugget or article, picked at random but leaning towards the
  // ones not seen for longest and the ones voted up. Logged, so a stop rate can
  // be worked out. Gated like everything else that arrives unasked.
  ipcMain.handle('hints:next', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return null
    // A third of the time, a note-to-self on rotation: the one that has gone
    // longest unseen, unconditionally. Otherwise a weighted random encounter.
    const pushed = Math.random() < 1 / 3
      ? (db.prepare(`select id, capture_id as captureId, kind, tier, title, body from nuggets where mode = 'pushed' and suspended = 0 and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) ${hidePrivate ? 'and private = 0' : ''}
          order by coalesce(last_visited_at, '') limit 1`).get(ago(3)) as Record<string, string> | undefined)
      : undefined
    // Half the time, or always while there are few nuggets, an old capture
    // still open: the link you meant to read, the thing you meant to look up.
    // An open link is an unread one, so links come up three times as often.
    // Never one a rot card showed in the last three days.
    const few = (db.prepare('select count(*) n from nuggets where suspended = 0').get() as { n: number }).n < 20
    const old = !pushed && (few || Math.random() < 0.5)
      ? (db.prepare(`select id, id as captureId, kind, title, body from captures where status = 'open' and coalesce(surfaced_at, '') < ?
          and captured_at < ? ${hidePrivate ? 'and private = 0' : ''}
          and id not in (select nugget_id from hint_events where shown_at >= ?)
          order by (julianday('now') - julianday(captured_at)) * (case kind when 'link' then 3 else 1 end) * surfacing_weight * (abs(random()) % 1000) desc limit 1`).get(ago(3), ago(7), ago(3)) as Record<string, string> | undefined)
      : undefined
    const hint = pushed ?? old ?? db
      .prepare(
        `select id, capture_id as captureId, kind, tier, title, body from nuggets where suspended = 0 and mode != 'pushed' and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) ${hidePrivate ? 'and private = 0' : ''}
         order by (julianday('now') - julianday(coalesce(last_visited_at, '2000-01-01'))) * surfacing_weight * (abs(random()) % 1000) desc
         limit 1`
      )
      .get(ago(3)) as Record<string, string> | undefined
    if (!hint) return null
    if (!old) db.prepare('update nuggets set last_visited_at = ? where id = ?').run(now(), hint.id)
    // A capture's id goes in the same column: either way, what was shown.
    const { lastInsertRowid } = db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(hint.id, now())
    return { ...body(hint), event: Number(lastInsertRowid) }
  })
  // The Luhmann move: two unrelated things side by side, for the connection
  // you would never have gone looking for.
  handle('random', () => db.prepare('select id, kind, title, body from nuggets order by random() limit 2').all().map(body))
  // Dwell: how long the hint was in front of you before the window went. The
  // signal every hint produces, where a vote is the rare one.
  ipcMain.handle('hints:dwell', (_event, event: number, ms: number) =>
    void db.prepare('update hint_events set dwell_ms = ? where rowid = ? and dwell_ms is null').run(Math.round(ms), event))
  // The hint rate, tuned by its own instrument: if hints have stopped stopping
  // you (under one in ten over the last month, with enough shown to tell),
  // half as many are shown. Legible: it says so, rather than going quiet.
  handle('hints:rate', () => {
    const { hintRate } = settings()
    const { shown, stopped } = db.prepare(
      "select count(*) shown, sum(reaction = 'up' or dwell_ms >= 4000) stopped from hint_events where shown_at >= ?"
    ).get(new Date(Date.now() - 30 * 86400000).toISOString()) as { shown: number; stopped: number | null }
    const low = shown >= 20 && (stopped ?? 0) / shown < 0.1
    return { rate: low ? hintRate / 2 : hintRate, tuned: low, shown, stopped: stopped ?? 0 }
  })
  // Up makes it come back more, down less. Never a schedule, never a grade.
  ipcMain.handle('hints:react', (_event, event: number, id: string, reaction: 'up' | 'down') => {
    // Up: this one comes back half as often again; down, two-thirds as often.
    // A hint is a nugget or an old capture, so whichever it is.
    for (const table of ['nuggets', 'captures'])
      db.prepare(`update ${table} set surfacing_weight = surfacing_weight * ? where id = ?`).run(reaction === 'up' ? 1.5 : 1 / 1.5, id)
    db.prepare('update hint_events set reaction = ? where rowid = ?').run(reaction, event)
  })

  // --- nuggets and articles
  const ITEM = `id, tier, kind, title, prompt, private, pinned_at as pinnedAt, due_at as dueAt, suspended,
    state is not null as reviewed, created_at as createdAt, capture_id as captureId, remind_at as remindAt,
    (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) as lapses, attribution, context, mode, superseded_by as supersededBy`
  handle('items', (tier: string) =>
    db.prepare(`select ${ITEM} from nuggets where tier = ? order by created_at desc`).all(tier)
  )
  handle('item', (id: string) => {
    const row = db.prepare(`select ${ITEM}, body, origins from nuggets where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const glosses = db.prepare('select id, body, author, created_at as createdAt from glosses where item_id = ? order by created_at').all(id)
    return { ...body(row), origins: JSON.parse((row.origins as string) ?? '[]'), glosses }
  })
  handle('item:save', (id: string, patch: { body?: unknown; title?: string; prompt?: string | null; kind?: string; suspended?: boolean; attribution?: string | null; context?: string | null; mode?: string }) => {
    const allowed = ['body', 'title', 'prompt', 'kind', 'suspended', 'attribution', 'context', 'mode']
    const sets = Object.entries(patch).filter(([key, value]) => value !== undefined && allowed.includes(key))
    // A meaningful change to something you are tested on brings it back sooner,
    // a 30% cut to what is left of its interval, never a reset: fixing a
    // sentence should not cost months. Once per review, not once per save, or
    // typing would shrink it to nothing. "Meaningful" is more than a few
    // letters: what differs once the shared start and end are taken off.
    const before = db.prepare('select body, prompt, state, due_at, edited_since_review from nuggets where id = ?').get(id) as
      { body: string; prompt: string | null; state: string | null; due_at: string | null; edited_since_review: number } | undefined
    const changed = (a: string, b: string): boolean => {
      let start = 0
      while (start < a.length && a[start] === b[start]) start++
      let end = 0
      while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
      return Math.max(a.length, b.length) - start - end > 12
    }
    if (before?.state && !before.edited_since_review && before.due_at && new Date(before.due_at).getTime() > Date.now() &&
      ((patch.body !== undefined && changed(plain(JSON.parse(before.body ?? 'null')), plain(patch.body))) ||
        (patch.prompt !== undefined && changed(before.prompt ?? '', patch.prompt ?? '')))) {
      const left = new Date(before.due_at).getTime() - Date.now()
      db.prepare('update nuggets set due_at = ?, edited_since_review = 1 where id = ?').run(new Date(Date.now() + left * 0.7).toISOString(), id)
    }
    for (const [key, value] of sets) {
      const stored = key === 'body' ? JSON.stringify(value) : key === 'suspended' ? (value ? 1 : 0) : value
      db.prepare(`update nuggets set ${key} = ?, updated_at = ? where id = ?`).run(stored as string, now(), id)
    }
    return write(true)
  })
  // An article from nuggets: their bodies in order, the first one's title, and
  // the derivation edge kept so the article knows what it was made from.
  handle('article', (ids: string[]) => {
    const parts = ids.map((id) => db.prepare('select title, body from nuggets where id = ?').get(id) as { title: string; body: string })
    const text = parts.map((part) => plain(JSON.parse(part.body))).join('\n\n')
    const id = randomUUID()
    db.prepare(
      `insert into nuggets (id, tier, kind, title, body, origins, created_at, updated_at) values (?, 'article', 'note', ?, ?, ?, ?, ?)`
    ).run(id, parts[0]?.title ?? 'Untitled', JSON.stringify(text), JSON.stringify(ids), now(), now())
    return write(id)
  })
  // A nugget from selected words: the excerpt, with the note it came from and
  // that note's source carried down.
  handle('nugget:from', (text: string, origin: { captureId?: string; attribution?: string | null }) => {
    const id = randomUUID()
    const attribution = origin.attribution ?? (origin.captureId ? (db.prepare('select attribution from captures where id = ?').get(origin.captureId) as { attribution: string | null } | undefined)?.attribution : null)
    db.prepare("insert into nuggets (id, capture_id, kind, title, body, attribution, created_at, updated_at) values (?, ?, 'note', ?, ?, ?, ?, ?)")
      .run(id, origin.captureId ?? null, text.split('\n')[0].slice(0, 160), JSON.stringify(text), attribution ?? null, now(), now())
    // An excerpt is a container: once something is pulled out of it, it has done its job.
    if (origin.captureId) db.prepare("update captures set status = 'promoted' where id = ? and kind = 'excerpt' and status = 'open'").run(origin.captureId)
    return write(id)
  })
  // Wrong, and corrected: the correction becomes its own nugget, the wrong one
  // leaves review at once and points to it. Nothing is deleted: the wrong
  // version beside the right one teaches more than either alone.
  handle('supersede', (id: string, truth: string) => {
    const old = db.prepare('select kind, attribution, private from nuggets where id = ?').get(id) as { kind: string; attribution: string | null; private: number }
    const fixed = randomUUID()
    db.prepare('insert into nuggets (id, kind, title, body, attribution, private, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(fixed, old.kind, truth.split('\n')[0].slice(0, 160), JSON.stringify(truth), old.attribution, old.private, now(), now())
    db.prepare('update nuggets set superseded_by = ?, suspended = 1 where id = ?').run(fixed, id)
    return write(fixed)
  })
  // Two captures that are the same thought: this one's words join the other's,
  // and this one is discarded, so it is still there to restore.
  handle('capture:merge', (id: string, intoNumber: number) => {
    const from = db.prepare('select body from captures where id = ?').get(id) as { body: string } | undefined
    const into = db.prepare('select id, body from captures where number = ?').get(intoNumber) as { id: string; body: string } | undefined
    if (!from || !into || into.id === id) return null
    const a = JSON.parse(into.body ?? 'null'), b = JSON.parse(from.body ?? 'null')
    const joined = a && b && typeof a === 'object' && typeof b === 'object'
      ? { ...a, content: [...(a.content ?? []), ...(b.content ?? [])] }
      : `${plain(a)}\n\n${plain(b)}`
    db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(joined), into.id)
    db.prepare("update captures set status = 'discarded' where id = ?").run(id)
    return write(into.id)
  })
  // A gloss is a row, never an edit: past-you stays readable beside present-you.
  handle('gloss', (itemId: string, text: string) =>
    write(db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)').run(randomUUID(), itemId, text, now()))
  )

  // --- review
  // Due items with a prompt, most at risk first, inside the day's two limits so
  // the queue can always be finished.
  handle('review:queue', () => {
    const { newPerDay, reviewsPerDay } = settings()
    const today = new Date().toISOString().slice(0, 10)
    const done = db.prepare('select sum(first) as fresh, count(*) - sum(first) as old from review_log where reviewed_at >= ?').get(today) as { fresh: number | null; old: number | null }
    const due = db
      .prepare(`select ${ITEM}, body, state from nuggets where coalesce(prompt, '') != '' and suspended = 0 and state is not null and due_at <= ? order by due_at limit ?`)
      .all(now(), Math.max(0, reviewsPerDay - (done.old ?? 0))) as Record<string, unknown>[]
    const fresh = db
      .prepare(`select ${ITEM}, body, state from nuggets where coalesce(prompt, '') != '' and suspended = 0 and state is null and (due_at is null or due_at <= ?) order by created_at limit ?`)
      .all(now(), Math.max(0, newPerDay - (done.fresh ?? 0))) as Record<string, unknown>[]
    return [...due, ...fresh].map((row) => ({ ...body(row), state: undefined, intervals: preview(row.state as string | null) }))
  })
  // Bury: not today. The timing is wrong, the item is fine, and the schedule is
  // left as it was; it is simply back tomorrow.
  handle('review:bury', (id: string) => {
    const tomorrow = new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
    return write(db.prepare('update nuggets set due_at = ? where id = ?').run(tomorrow, id))
  })
  handle('review:counts', () => {
    const due = db.prepare(`select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and (due_at is null or due_at <= ?)`).get(now()) as { n: number }
    return due.n
  })
  // Only a graded review moves a schedule: not opening, not searching.
  handle('review:grade', (id: string, grade: Grade, ms: number) => {
    const row = db.prepare('select state from nuggets where id = ?').get(id) as { state: string | null }
    const { card } = scheduler().next(cardOf(row.state), new Date(), grade)
    db.prepare('update nuggets set state = ?, due_at = ?, edited_since_review = 0 where id = ?').run(JSON.stringify(card), card.due.toISOString(), id)
    db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, ?)').run(id, grade, now(), ms, row.state ? 0 : 1)
    return write(card.due.toISOString())
  })

  // --- tasks
  const TASK = `id, number, title, status, due_at as dueAt, all_day as allDay, recurrence, origin_capture_id as captureId,
    created_at as createdAt, completed_at as completedAt, waiting_on as waitingOn, estimate, sort_order as sortOrder, repeat_until as repeatUntil,
    important, deadline_at as deadline, blocker, reschedules`
  handle('tasks', () => db.prepare(`select ${TASK} from tasks order by status, important desc, coalesce(sort_order, 1e12), due_at is null, due_at, created_at`).all())
  handle('task', (id: string) => {
    const row = db.prepare(`select ${TASK}, notes, subtasks from tasks where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const done = db.prepare('select done_at as at from task_done where task_id = ? order by done_at desc').all(id)
    // What the task is about, linked from nuggets and articles: shown as a
    // checklist on it, and the material comes up first when you open it.
    const linked = db.prepare(`select n.id, n.tier, n.kind, n.title from task_links l join nuggets n on n.id = l.item_id where l.task_id = ?`).all(id)
    return { ...row, notes: JSON.parse((row.notes as string) ?? 'null'), subtasks: JSON.parse((row.subtasks as string) ?? '[]'), done, linked }
  })
  handle('task:add', (text: string, origin?: string) => write(addTask(text, origin ?? null)))
  // Study this: a task made from a nugget or an article, linked to it, so the
  // reading has a when and the material is waiting when the task opens.
  handle('study', (itemId: string, text: string) => {
    const task = addTask(text)
    db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task, itemId)
    return write(task)
  })
  const TASK_COLUMNS = { title: 'title', recurrence: 'recurrence', waitingOn: 'waiting_on', estimate: 'estimate', sortOrder: 'sort_order', important: 'important', deadline: 'deadline_at', blocker: 'blocker', reschedules: 'reschedules' } as const
  handle('task:save', (id: string, patch: { title?: string; notes?: unknown; due?: string | null; recurrence?: string | null; status?: string; waitingOn?: string | null; subtasks?: unknown; estimate?: number | null; sortOrder?: number; important?: number; deadline?: string | null; blocker?: string | null; reschedules?: number }) => {
    for (const [key, column] of Object.entries(TASK_COLUMNS))
      if (patch[key as keyof typeof patch] !== undefined) db.prepare(`update tasks set ${column} = ? where id = ?`).run(patch[key as keyof typeof patch] as string | number | null, id)
    if (patch.subtasks !== undefined) db.prepare('update tasks set subtasks = ? where id = ?').run(JSON.stringify(patch.subtasks), id)
    if (patch.notes !== undefined) db.prepare('update tasks set notes = ? where id = ?').run(JSON.stringify(patch.notes), id)
    if (patch.due !== undefined) {
      // Pushed later is a reschedule, counted: after three the task asks to be
      // made smaller or dropped. A new time is also a new moment to be told about.
      const was = (db.prepare('select due_at from tasks where id = ?').get(id) as { due_at: string | null }).due_at
      const later = was && patch.due && patch.due > was ? 1 : 0
      db.prepare('update tasks set due_at = ?, notified_at = null, reschedules = reschedules + ? where id = ?').run(patch.due, later, id)
    }
    if (patch.status !== undefined) db.prepare('update tasks set status = ?, completed_at = ? where id = ?').run(patch.status, patch.status === 'done' ? now() : null, id)
    return write(true)
  })
  // Done. A routine moves to its next date instead: from the due date when the
  // calendar matters, from today when only the gap does ("every!"), and never
  // onto a day already gone, so a missed week does not stack up.
  handle('task:done', (id: string) => {
    const task = db.prepare('select due_at, recurrence, repeat_until from tasks where id = ?').get(id) as { due_at: string | null; recurrence: string | null; repeat_until: string | null }
    db.prepare('insert into task_done (task_id, done_at) values (?, ?)').run(id, now())
    if (!task.recurrence) return write(db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(now(), id))
    const fromToday = task.recurrence.includes('!') || !task.due_at
    let next = advance(fromToday ? new Date() : new Date(task.due_at!), task.recurrence)
    while (next.getTime() < Date.now()) next = advance(next, task.recurrence)
    // Past its end, the series is over: this one was the last.
    if (task.repeat_until && next.toISOString() > task.repeat_until)
      return write(db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(now(), id))
    return write(db.prepare('update tasks set due_at = ? where id = ?').run(next.toISOString(), id))
  })

  // --- tags, worked out from the words every time so they cannot go stale
  const tagged = (): { tag: string; id: string; type: string; title: string }[] => {
    const rows = [
      ...(db.prepare("select id, 'capture' as type, title, body from captures where status != 'discarded'").all() as Record<string, string>[]),
      ...(db.prepare('select id, tier as type, title, body from nuggets').all() as Record<string, string>[]),
      ...(db.prepare("select id, 'task' as type, title, notes as body from tasks").all() as Record<string, string>[])
    ]
    // An alias counts as the tag it stands for, without the words changing.
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    return rows.flatMap((row) => [...new Set(tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`).map((tag) => alias.get(tag) ?? tag))].map((tag) => ({ tag, id: row.id, type: row.type, title: row.title })))
  }
  handle('tags', () => {
    const counts = new Map<string, number>()
    for (const { tag } of tagged()) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    const meta = new Map((db.prepare('select tag, color, action from tag_meta').all() as { tag: string; color: string | null; action: number }[]).map((row) => [row.tag, row]))
    return [...counts].map(([tag, count]) => ({ tag, count, color: meta.get(tag)?.color ?? null, action: !!meta.get(tag)?.action })).sort((a, b) => b.count - a.count)
  })
  handle('tag:meta', () => db.prepare('select tag, color, action from tag_meta').all())
  handle('tag:set', (tag: string, patch: { color?: string | null; action?: boolean; aliasOf?: string | null }) => {
    db.prepare('insert or ignore into tag_meta (tag) values (?)').run(tag)
    if (patch.color !== undefined) db.prepare('update tag_meta set color = ? where tag = ?').run(patch.color, tag)
    if (patch.action !== undefined) db.prepare('update tag_meta set action = ? where tag = ?').run(patch.action ? 1 : 0, tag)
    if (patch.aliasOf !== undefined) {
      db.prepare('insert or ignore into tag_meta (tag) values (?)').run(tag)
      db.prepare('update tag_meta set alias_of = ? where tag = ?').run(patch.aliasOf?.replace(/^#/, '').toLowerCase() || null, tag)
    }
    return write(true)
  })
  handle('tag', (tag: string) => tagged().filter((row) => row.tag === tag))
  // Rename everywhere at once; renaming onto a tag that exists is a merge. The
  // words themselves change, since the words are where tags live.
  handle('tag:rename', (from: string, to: string) => {
    const clean = to.trim().replace(/^#/, '').toLowerCase()
    if (!/^[a-z][\w-]*$/.test(clean)) return null
    const pattern = new RegExp(`(^|\\s|")#${from.replace(/[-]/g, '\\-')}(?![\\w-])`, 'gi')
    for (const [table, text] of [['captures', 'body'], ['nuggets', 'body'], ['tasks', 'notes'], ['captures', 'title'], ['nuggets', 'title'], ['tasks', 'title']]) {
      for (const row of db.prepare(`select id, ${text} as v from ${table} where ${text} like ?`).all(`%#${from}%`) as { id: string; v: string }[])
        db.prepare(`update ${table} set ${text} = ? where id = ?`).run(row.v.replace(pattern, `$1#${clean}`), row.id)
    }
    return write(clean)
  })

  // --- pins: parked on the home screen, three at most
  handle('pins', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout) return []
    const privacy = hidePrivate ? 'and private = 0' : ''
    return db
      .prepare(
        `select id, 'capture' as type, kind, ${LABEL} as title, pinned_at as pinnedAt from captures where pinned_at is not null ${privacy}
         union all select id, tier as type, kind, title, pinned_at from nuggets where pinned_at is not null ${privacy}
         order by pinnedAt desc limit 3`
      )
      .all()
  })
  // A reminder is a pin with a date: when it comes round, it pins itself.
  handle('remind', (table: 'captures' | 'nuggets', id: string, at: string | null) =>
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set remind_at = ? where id = ?`).run(at, id))
  )
  setInterval(() => {
    let fired = 0
    for (const table of ['captures', 'nuggets'])
      fired += Number(db.prepare(`update ${table} set pinned_at = ?, remind_at = null where remind_at is not null and remind_at <= ?`).run(now(), now()).changes)
    if (fired) changed()
  }, 60_000)
  // Three pins at most, across both tables: a fourth is refused rather than
  // quietly pushing the oldest off, so a pin always means what you think.
  handle('pin', (table: 'captures' | 'nuggets', id: string, on: boolean) => {
    const others = (db.prepare(`select (select count(*) from captures where pinned_at is not null and id != ?)
      + (select count(*) from nuggets where pinned_at is not null and id != ?) n`).get(id, id) as { n: number }).n
    if (on && others >= 3) return false
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set pinned_at = ? where id = ?`).run(on ? now() : null, id))
    return true
  })

  // --- the same idea again: a vote, not a duplicate
  // Trigrams, not a model: enough to notice "you have written this before"
  // while the new one still lands, because different wording is data too.
  const grams = (text: string): Set<string> => {
    const clean = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, '')} `
    return new Set(Array.from({ length: Math.max(0, clean.length - 2) }, (_, index) => clean.slice(index, index + 3)))
  }
  handle('similar', (text: string) => {
    if (text.trim().length < 12) return null
    const mine = grams(text)
    let best: { id: string; number: number; title: string; score: number } | null = null
    for (const row of db.prepare(`select id, number, ${LABEL} as title from captures where status != 'discarded'`).all() as { id: string; number: number; title: string }[]) {
      const theirs = grams(row.title)
      const shared = [...mine].filter((gram) => theirs.has(gram)).length
      const score = shared / (mine.size + theirs.size - shared || 1)
      if (score > (best?.score ?? 0.55)) best = { ...row, score }
    }
    return best
  })

  // --- sessions: effort against a task, with a recap of what actually happened
  db.exec('create table if not exists sessions (id text primary key, task_id text not null, started_at text not null, ended_at text, recap text)')
  handle('sessions', (taskId: string) =>
    db.prepare('select id, started_at as startedAt, ended_at as endedAt, recap from sessions where task_id = ? order by started_at desc').all(taskId)
  )
  handle('session:start', (taskId: string) => write(db.prepare('insert into sessions (id, task_id, started_at) values (?, ?, ?)').run(randomUUID(), taskId, now())))
  // Ending asks for the recap, and the recap can become a nugget: the loop that
  // turns doing the work into something worth keeping.
  handle('session:end', (id: string, recap: string, keep: boolean) => {
    db.prepare('update sessions set ended_at = ?, recap = ? where id = ?').run(now(), recap, id)
    if (keep && recap.trim())
      db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(
        randomUUID(), recap.split('\n')[0].slice(0, 120), JSON.stringify(recap), now(), now())
    return write(true)
  })

  // --- a time of day means something happens at that time
  // Pull: it is already first in Today. Quiet: the menu bar counts it. Alerts:
  // a notification, once per due time. All-day tasks never alert.
  setInterval(() => {
    if (settings().notify !== 'alerts' || !Notification.isSupported()) return
    const due = db.prepare(
      "select id, title from tasks where status = 'open' and all_day = 0 and due_at <= ? and due_at > ? and notified_at is null"
    ).all(now(), new Date(Date.now() - 3600000).toISOString()) as { id: string; title: string }[]
    for (const task of due) {
      new Notification({ title: task.title, body: 'Due now', silent: false }).show()
      db.prepare('update tasks set notified_at = ? where id = ?').run(now(), task.id)
    }
  }, 30_000)

  // --- the numbers: observations with a comparison, never a score to keep up
  handle('stats', () => {
    const one = <T>(sql: string, ...args: (string | number)[]): T => db.prepare(sql).get(...args) as T
    const all = <T>(sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args) as T[]
    return {
      exits: all<{ status: string; n: number }>('select status, count(*) n from captures group by status'),
      kinds: all<{ kind: string; n: number }>('select kind, count(*) n from captures group by kind order by n desc'),
      week: one<{ n: number }>('select count(*) n from captures where captured_at >= ?', ago(7)).n,
      lastWeek: one<{ n: number }>('select count(*) n from captures where captured_at >= ? and captured_at < ?', ago(14), ago(7)).n,
      nuggets: one<{ n: number }>("select count(*) n from nuggets where tier = 'nugget'").n,
      articles: one<{ n: number }>("select count(*) n from nuggets where tier = 'article'").n,
      recall: one<{ n: number }>("select count(*) n from nuggets where coalesce(prompt, '') != ''").n,
      days: all<{ day: string }>('select distinct substr(opened_at, 1, 10) day from app_opens where opened_at >= ?', ago(84)).map((row) => row.day),
      hints: one<{ shown: number; up: number; down: number }>(
        "select count(*) shown, sum(reaction = 'up') up, sum(reaction = 'down') down from hint_events where shown_at >= ?", ago(30)),
      reviews: one<{ n: number; recalled: number }>('select count(*) n, sum(grade > 1) recalled from review_log where reviewed_at >= ?', ago(30)),
      hours: all<{ hour: number; n: number }>("select cast(strftime('%H', captured_at, 'localtime') as integer) hour, count(*) n from captures group by hour"),
      firstUse: one<{ days: number | null }>(
        `select avg(julianday(first_used_at) - julianday(captured_at)) days from captures where first_used_at >= ?`, ago(90)).days,
      tasksDone: one<{ n: number }>('select count(*) n from task_done where done_at >= ?', ago(7)).n,
      // Wrapped: what the week was, in the work itself.
      sessions: one<{ n: number; minutes: number | null }>(
        "select count(*) n, sum((julianday(ended_at) - julianday(started_at)) * 1440) minutes from sessions where ended_at is not null and started_at >= ?", ago(7)),
      tagsWeek: (db.prepare('select title, body from captures where captured_at >= ?').all(ago(7)) as { title: string; body: string }[])
        .flatMap((row) => tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`))
        .reduce<Record<string, number>>((counts, tag) => ({ ...counts, [tag]: (counts[tag] ?? 0) + 1 }), {}),
      retention: settings().retention,
      estimates: one<{ estimated: number | null; spent: number | null }>(
        `select sum(t.estimate) estimated, sum((select sum((julianday(s.ended_at) - julianday(s.started_at)) * 1440) from sessions s where s.task_id = t.id and s.ended_at is not null)) spent
         from tasks t where t.estimate is not null and t.status = 'done' and t.completed_at >= ?`, ago(30)),
      // Lead measures: the doing, this week, day by day. No target; the trend.
      lead: {
        exits: one<{ n: number }>("select count(*) n from captures where exited_at >= ?", ago(7)).n,
        glosses: one<{ n: number }>("select count(*) n from glosses where author = 'user' and created_at >= ?", ago(7)).n,
        reviewDays: one<{ n: number }>('select count(distinct substr(reviewed_at, 1, 10)) n from review_log where reviewed_at >= ?', ago(7)).n,
        articles: one<{ n: number }>("select count(*) n from nuggets where tier = 'article' and created_at >= ?", ago(7)).n
      },
      // Wrapped, for the day and for the year: what happened, set down plainly.
      day: (() => {
        const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        return one<{ captured: number; exits: number; reviews: number }>(
          `select (select count(*) from captures where captured_at >= ?) captured, (select count(*) from captures where exited_at >= ?) exits,
            (select count(*) from review_log where reviewed_at >= ?) reviews`, since, since, since)
      })(),
      year: (() => {
        const since = new Date(new Date().getFullYear(), 0, 1).toISOString()
        return {
          ...one<{ captured: number; nuggets: number; articles: number }>(
            `select (select count(*) from captures where captured_at >= ?) captured,
              (select count(*) from nuggets where tier = 'nugget' and created_at >= ?) nuggets,
              (select count(*) from nuggets where tier = 'article' and created_at >= ?) articles`, since, since, since),
          month: one<{ month: string | null }>(
            "select strftime('%m', captured_at, 'localtime') month from captures where captured_at >= ? group by month order by count(*) desc limit 1", since)?.month ?? null
        }
      })(),
      // Leeches, named: a card forgotten four times wants rewriting, not hiding.
      leeches: all<{ title: string }>(
        "select title from nuggets where (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) >= 4").map((row) => row.title),
      // A hint "stopped you" if you voted it up, or it stayed on screen four
      // seconds or more: the rare signal and the universal one together.
      stopped: one<{ n: number }>("select count(*) n from hint_events where shown_at >= ? and (reaction = 'up' or dwell_ms >= 4000)", ago(30)).n,
      unprocessed: one<{ now: number; weekAgo: number }>(
        "select sum(status = 'open') now, sum(captured_at < ? and (status = 'open' or exited_at >= ?)) weekAgo from captures", ago(7), ago(7))
    }
  })

  // --- export: everything as plain text and JSON, in a folder you choose
  handle('export', async () => {
    const { filePaths } = await dialog.showOpenDialog({ title: 'Export everything to…', properties: ['openDirectory', 'createDirectory'] })
    if (!filePaths[0]) return null
    const folder = join(filePaths[0], `vigil-${new Date().toISOString().slice(0, 10)}`)
    await mkdir(join(folder, 'markdown'), { recursive: true })
    const tables = ['captures', 'nuggets', 'tasks', 'glosses', 'review_log']
    const data = Object.fromEntries(tables.map((table) => [table, db.prepare(`select * from ${table}`).all()]))
    await writeFile(join(folder, 'vigil.json'), JSON.stringify(data, null, 2))
    for (const row of data.captures as { number: number; body: string }[])
      await writeFile(join(folder, 'markdown', `MF-${row.number}.md`), plain(JSON.parse(row.body ?? 'null')))
    return folder
  })
}

/** What the menu bar says: reviews due, and whether safe mode is on. */
export function badge(): { due: number; tasks: number; safe: boolean } {
  const { n } = database()
    .prepare("select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and (due_at is null or due_at <= ?)")
    .get(now()) as { n: number }
  // Quiet push: a task whose time has come is counted in the menu bar, unless
  // you chose pull, where it only rises in Today.
  const tasks = settings().notify === 'pull' ? 0 : (database()
    .prepare("select count(*) n from tasks where status = 'open' and all_day = 0 and due_at <= ?").get(now()) as { n: number }).n
  return { due: n, tasks, safe: settings().safeMode }
}

/** Flip safe mode from outside a window: the menu bar. */
export function toggleSafeMode(): boolean {
  const on = !settings().safeMode
  database().prepare("insert or replace into settings (key, value) values ('safeMode', ?)").run(JSON.stringify(on))
  changed()
  return on
}

/** The session running now, if any, for the menu bar. */
export function activeSession(): { title: string; startedAt: string } | null {
  return (database()
    .prepare('select t.title, s.started_at as startedAt from sessions s join tasks t on t.id = s.task_id where s.ended_at is null order by s.started_at desc limit 1')
    .get() as { title: string; startedAt: string } | undefined) ?? null
}
