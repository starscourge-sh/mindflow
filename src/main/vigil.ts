import { Notification, app, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { cp, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import * as chrono from 'chrono-node'
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'

import { LABEL, LIST, changed, database, like } from './captures'

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
  if (typeof value === 'string') return value.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
  const walk = (node: { type?: string; text?: string; attrs?: { label?: string }; content?: unknown[] }): string =>
    node.type === 'noteLink' ? (node.attrs?.label ?? '') :
    node.text ?? (node.content ?? []).map((child) => walk(child as typeof node)).join('\n')
  return value ? walk(value as { content?: unknown[] }) : ''
}

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Doc[] }
/**
 * A document as Markdown, the way any editor would read it back: headings,
 * lists, quotes, code, links and emphasis kept. Markdown already is.
 */
export function markdown(value: unknown, nameOf: (id: string) => string | undefined = () => undefined): string {
  // A link names the file it leads to, with its own words after a bar when
  // they differ, so it opens in Obsidian or any other Markdown tool.
  const link = (id: string, label: string): string => {
    const name = nameOf(id.replace(/^[a-z]+:/, ''))
    return name ? (name === label ? `[[${name}]]` : `[[${name}|${label}]]`) : `[[${label}]]`
  }
  if (typeof value === 'string') return value.replace(/\[\[@([^|\]]+)\|([^\]]+)\]\]/g, (_, id: string, label: string) => link(id, label))
  if (!value) return ''
  const inline = (nodes: Doc[] = []): string =>
    nodes.map((node) => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type === 'noteLink') return link(String(node.attrs?.id ?? ''), String(node.attrs?.label ?? ''))
      if (node.type === 'image') return `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})`
      let text = node.text ?? inline(node.content)
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') text = `**${text}**`
        else if (mark.type === 'italic') text = `*${text}*`
        else if (mark.type === 'strike') text = `~~${text}~~`
        else if (mark.type === 'code') text = `\`${text}\``
        else if (mark.type === 'link') text = `[${text}](${mark.attrs?.href ?? ''})`
      }
      return text
    }).join('')
  const block = (node: Doc, indent = ''): string => {
    const kids = node.content ?? []
    switch (node.type) {
      case 'heading': return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(kids)}`
      case 'paragraph': return indent + inline(kids)
      case 'blockquote': return kids.map((child) => block(child)).join('\n\n').split('\n').map((line) => `> ${line}`).join('\n')
      case 'codeBlock': return `\`\`\`${node.attrs?.language ?? ''}\n${inline(kids)}\n\`\`\``
      case 'horizontalRule': return '---'
      case 'image': return inline([node])
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return kids.map((item, n) => {
          const mark = node.type === 'orderedList' ? `${n + 1}.` : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}]` : '-'
          const [first, ...rest] = item.content ?? []
          return [`${indent}${mark} ${first ? inline(first.content) : ''}`, ...rest.map((child) => block(child, indent + '  '))].join('\n')
        }).join('\n')
      default: return kids.length ? kids.map((child) => block(child, indent)).join('\n\n') : inline([node])
    }
  }
  return block(value as Doc).trim() + '\n'
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

/** The Motion setting, for the window's own arrival. */
export const motionOn = (): boolean => settings().motion

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
// An untriaged capture counts as private, the plan's fail-safe: you have not
// looked at it since you wrote it, so in quiet hours it is not volunteered.
// Taking an exit is what clears it, so the default resolves itself.

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

// Named days, alone or listed: "every mon, wed", "every tuesday and friday".
const DAY = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*'
const RECURRENCE = new RegExp(`\\bevery(!)?\\s+(day|weekday|week|month|year|\\d+\\s+(?:days?|weeks?|months?)|${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i')
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** The days of the week a "every mon, wed" rule falls on, or none. */
const namedDays = (unit: string): number[] =>
  /^(?:mon|tue|wed|thu|fri|sat|sun)/i.test(unit) ? [...unit.toLowerCase().matchAll(/(mon|tue|wed|thu|fri|sat|sun)/g)].map((m) => DAYS.indexOf(m[1])) : []

/** The next date in a series, from `from`. `every 3 days`, `every weekday`, `every mon, wed`. */
function advance(from: Date, rule: string): Date {
  const next = new Date(from)
  const [, , unit] = RECURRENCE.exec(rule) ?? []
  const count = Number(/\d+/.exec(unit ?? '')?.[0] ?? 1)
  const named = namedDays(unit ?? '')
  if (named.length) do next.setDate(next.getDate() + 1); while (!named.includes(next.getDay()))
  else if (/day/.test(unit) && !/weekday/.test(unit)) next.setDate(next.getDate() + count)
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
  // The ways people say a repeat or a time without the word "every":
  // "weekdays", "daily", "eod" become what this already understands.
  let title = text.trim()
    .replace(/(?<!every\s)\b(?:on\s+)?weekdays\b/i, 'every weekday')
    .replace(/(?<!every\s)\bdaily\b/i, 'every day')
    .replace(/(?<!every\s)\bweekly\b/i, 'every week')
    .replace(/(?<!every\s)\bmonthly\b/i, 'every month')
    .replace(/(?<!every\s)\b(?:yearly|annually)\b/i, 'every year')
    .replace(/\b(?:eod|end of (?:the )?day)\b/i, 'today 5pm')
    .replace(/\b(?:eow|end of (?:the )?week)\b/i, 'friday 5pm')
  // "until December": a series can end. Read first, so its date is not the due date.
  const ending = /\buntil\s+(.+)$/i.exec(title)
  const until = ending ? chrono.parseDate(ending[1], new Date(), { forwardDate: true }) : null
  if (ending && until) title = title.slice(0, ending.index).trim()
  const repeat = RECURRENCE.exec(title)
  if (repeat) title = title.replace(repeat[0], '').trim()
  // "on the 1st": the next time the month reaches that day. Only with "on",
  // so "read the 2nd chapter" stays a title.
  const ordinal = /\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(title)
  let onDay: Date | null = null
  if (ordinal) {
    const day = Number(ordinal[1])
    const now = new Date()
    // Built whole, month and day together, so the 31st never spills over.
    onDay = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > day ? 1 : 0), day)
    title = title.replace(ordinal[0], ' ')
  }
  const [found] = chrono.parse(title, new Date(), { forwardDate: true })
  if (found) title = title.slice(0, found.index) + title.slice(found.index + found.text.length)
  // A word left hanging where a date was taken out: "email Sam by". Only
  // then, so "sign up for" keeps its "for".
  title = title.replace(/\s+/g, ' ').trim()
  if (found || ordinal) title = title.replace(/\s+(?:by|on|at|due|before|for|from)$/i, '').trim()
  // "on the 1st at 3pm": the day from the ordinal, the time from chrono.
  if (onDay && found?.start.isCertain('hour')) onDay.setHours(found.start.get('hour') ?? 9, found.start.get('minute') ?? 0)
  let due = onDay ?? found?.start.date() ?? null
  // A series of named days starts on the first of them, today included.
  const named = namedDays(repeat?.[2] ?? '')
  if (!due && named.length) {
    due = new Date()
    while (!named.includes(due.getDay())) due.setDate(due.getDate() + 1)
  }
  if (!due && repeat) due = new Date()
  const allDay = !!due && !found?.start.isCertain('hour')
  if (due && allDay) due.setHours(9, 0, 0, 0)
  return { title, due: due?.toISOString() ?? null, allDay, recurrence: repeat?.[0] ?? null, until: until?.toISOString() ?? null }
}

/** What making a task gave back: the task, and whether it was already there. */
export type Made = { id: string; number: number; existed: boolean }

/**
 * A task from a line of text. The same task twice is one task: an open one
 * with the same name is returned instead, and what this one came from is
 * linked to it, so nothing is lost and nothing is doubled.
 */
function addTask(text: string, origin: string | null = null, today = false): Made {
  const db = database()
  const task = taskFrom(text)
  const title = task.title || text
  // The same name with no date or repeat of its own is the same task; one
  // that brings a date or a repeat is meant as a new one.
  const twin = task.due || task.recurrence ? undefined
    : (db.prepare("select id, number from tasks where status = 'open' and lower(trim(title)) = lower(trim(?))").get(title) as { id: string; number: number } | undefined)
  if (twin) {
    if (origin) db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(twin.id, origin)
    return { ...twin, existed: true }
  }
  const id = randomUUID()
  // Typed into Today with no date, it is for today, as in Todoist: all day,
  // not dropped into a backlog the list you typed it in does not show.
  if (today && !task.due) Object.assign(task, { due: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(), allDay: true })
  const { number } = db
    .prepare(
      `insert into tasks (id, number, title, due_at, all_day, recurrence, repeat_until, origin_capture_id, created_at)
       values (?, (select coalesce(max(number), 0) + 1 from tasks), ?, ?, ?, ?, ?, ?, ?) returning number`
    )
    .get(id, title, task.due, task.allDay ? 1 : 0, task.recurrence, task.until, origin, now()) as { number: number }
  return { id, number, existed: false }
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
  column('captures', 'attribution text')
  column('captures', 'medium text')
  column('captures', 'exited_at text')
  column('captures', 'session_id text')
  column('captures', 'first_used_at text')
  column('captures', 'surfaced_at text')
  column('captures', 'device text')
  column('captures', 'original_body text')
  column('captures', 'elapsed_ms integer')
  column('captures', 'surfacing_weight real not null default 1')
  column('captures', 'origin_id text')
  // Kept by the database, so no exit can forget them: when a capture left the
  // inbox, and when it was first used (opened, exited or given a who or where),
  // which time to first use is measured by. Not in its first minute: that is
  // still the capturing.
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
  db.exec(`create trigger if not exists capture_exit after update of status on captures when new.status is not old.status begin
      update captures set exited_at = case when new.status = 'open' then null else ${stamp} end where id = new.id; end;
    drop trigger if exists capture_original;
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
  column('tasks', 'notify text')
  column('task_done', 'session_id text')
  column('nuggets', 'superseded_by text')
  column('nuggets', 'revisions integer not null default 0')
  column('nuggets', 'edited_since_review integer not null default 0')
  // What lineage looks up on every change: where each nugget and task came from.
  db.exec('create index if not exists nuggets_by_capture on nuggets(capture_id); create index if not exists tasks_by_capture on tasks(origin_capture_id); create index if not exists captures_by_origin on captures(origin_id)')
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
  const CAPTURE_FIELDS = { attribution: 'attribution', medium: 'medium', capturedAt: 'captured_at', origin: 'origin_id' } as const
  // Many at once, from a selection: a tag added to each, or one date for all,
  // for filling in when a batch of old things was really written.
  handle('captures:bulk', (ids: string[], change: { tag?: string; capturedAt?: string }) => {
    // One write for the lot: a hundred rows are one change, not a hundred.
    db.exec('begin')
    for (const id of ids) {
      if (change.capturedAt) db.prepare('update captures set captured_at = ? where id = ?').run(change.capturedAt, id)
      if (!change.tag) continue
      const tag = `#${change.tag.replace(/^#/, '')}`
      const row = db.prepare('select body from captures where id = ?').get(id) as { body: string }
      const body = JSON.parse(row.body ?? 'null')
      // On the first line, where a row reads its tags: added at the end it
      // was there but never showed.
      // The first block holding words, heading or paragraph: that line is
      // the capture's name, and where a row reads its tags.
      const at = (body?.content ?? []).findIndex((block: { type?: string; content?: unknown[] }) => ['paragraph', 'heading'].includes(block.type ?? '') && block.content?.length)
      const next = body && typeof body === 'object'
        ? at >= 0
          ? { ...body, content: body.content.map((block: { content?: unknown[] }, index: number) => (index === at ? { ...block, content: [...(block.content ?? []), { type: 'text', text: ` ${tag}` }] } : block)) }
          : { ...body, content: [{ type: 'paragraph', content: [{ type: 'text', text: tag }] }, ...(body.content ?? [])] }
        : String(body ?? '').replace(/^([^\n]*)/, (line) => `${line} ${tag}`.trim())
      db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(next), id)
    }
    db.exec('commit')
    return write(ids.length)
  })
  // One task from several captures: each is linked from it, so the task can
  // say why it exists, and each has taken its exit.
  handle('tasks:from', (ids: string[], text: string) => {
    const task = addTask(String(text), ids[0] ?? null)
    for (const id of ids) {
      db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task.id, id)
      db.prepare("update captures set status = 'resolved' where id = ?").run(id)
    }
    return write(task)
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
  const promote = (id: string, words?: string): string | null => {
    const capture = db.prepare(`select kind, body, private, attribution, ${LABEL} as title from captures where id = ? and status != 'promoted'`).get(id) as Record<string, string> | undefined
    if (!capture) return null
    // A quote's whole claim is "someone said this", so it does not become a
    // nugget until it says who.
    // Said in the words already: "…" - Alan Kay, or Alan Kay: "…".
    capture.attribution ||= /["”']\s*[-—–]\s*([^"“”]{2,60})$/.exec(capture.title)?.[1]?.trim() ?? /^([^:"“]{2,40}):/.exec(capture.title)?.[1]?.trim() ?? ''
    if (capture.kind === 'quote' && !capture.attribution) return 'needs-source'
    // Nor until it says something in your own words: someone else's sentence
    // kept with nothing of yours beside it is a quote you collected, not one
    // you understood. Those words become its first gloss.
    if (capture.kind === 'quote' && !words?.trim()) return 'needs-words'
    const nugget = randomUUID()
    db.prepare(
      `insert into nuggets (id, capture_id, kind, title, body, prompt, private, attribution, mode, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nugget, id, capture.kind, capture.title, capture.body, capture.kind === 'word' ? `What does "${capture.title}" mean?` : null,
      capture.private, capture.attribution || null, 'encounter', now(), now())
    if (capture.attribution) db.prepare('update captures set attribution = coalesce(attribution, ?) where id = ?').run(capture.attribution, id)
    if (words?.trim()) db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)').run(randomUUID(), nugget, words.trim(), now())
    // The capture is kept as it was, only marked: the nugget is a copy, edited
    // on its own, and each points at the other.
    db.prepare("update captures set status = 'promoted' where id = ?").run(id)
    return write(nugget)
  }
  handle('promote', promote)
  // Promotion taken back: the nugget it made goes (with its glosses), and the
  // capture is open again, as if it had never been kept.
  handle('promote:undo', (captureId: string, nuggetId: string) => {
    db.prepare('delete from glosses where item_id = ?').run(nuggetId)
    db.prepare('delete from nuggets where id = ? and capture_id = ?').run(nuggetId, captureId)
    db.prepare("update captures set status = 'open' where id = ?").run(captureId)
    return write(true)
  })
  // Where something came from, what it became, and what links to it: the
  // lineage both ways, and the backlinks an @ link leaves.
  handle('lineage', (id: string) => {
    const links = (table: string, title: string): { type: string; id: string; title: string }[] =>
      db.prepare(`select ${table === 'captures' ? "'capture'" : 'tier'} as type, id, ${title} as title, private from ${table} where body like ? or body like ? or body like ?`).all(`%"id":"${id}"%`, `%"id":"%:${id}"%`, `%[[@%${id}|%`) as never
    return {
      from: [
        ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title from captures where id in (select capture_id from nuggets where id = ? union select origin_capture_id from tasks where id = ?
          union select origin_id from captures where id = ?)`).all(id, id, id) as never[]),
        ...(db.prepare('select tier as type, id, title from nuggets where id = (select origin_id from captures where id = ?)').all(id) as never[]),
        ...(JSON.parse((db.prepare('select origins from nuggets where id = ?').get(id) as { origins: string | null } | undefined)?.origins ?? '[]') as string[])
          .map((origin) => db.prepare('select tier as type, id, title from nuggets where id = ?').get(origin) as never)
          .filter(Boolean)
      ],
      became: [
        ...(db.prepare("select tier as type, id, title from nuggets where capture_id = ? or origins like ?").all(id, `%"${id}"%`) as never[]),
        ...(db.prepare("select 'task' as type, id, title from tasks where origin_capture_id = ?").all(id) as never[]),
        ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title from captures where origin_id = ?`).all(id) as never[])
      ],
      linked: [...links('captures', LABEL), ...links('nuggets', 'title')].filter((row) => row.id !== id)
    }
  })
  // Backlinks the way Obsidian lists them under a note: every note that links
  // here, with the sentence it does it in; and every note that names this
  // one without linking it yet, which one press turns into a link.
  type Mention = { type: string; id: string; title: string; snippet: string; private: number }
  const everything = (): { type: string; id: string; title: string; body: string; private: number }[] => [
    ...(db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, private from captures where status != 'discarded'`).all() as never[]),
    ...(db.prepare("select tier as type, id, title, body, private from nuggets where superseded_by is null").all() as never[])
  ]
  const around = (text: string, at: number, length: number): string => {
    const start = Math.max(0, text.lastIndexOf('\n', at) + 1, at - 80)
    const end = Math.min(text.length, at + length + 80)
    const line = text.slice(start, end).split('\n')[0]
    return `${start > 0 && text[start - 1] !== '\n' ? '…' : ''}${line}${end < text.length && !text.slice(at, end).includes('\n') ? '…' : ''}`
  }
  // The words as read: inline pieces run together, links as their names,
  // blocks on their own lines.
  const words = (value: unknown): string => {
    // An imported page's [[@link|name]] reads as its name.
    if (typeof value === 'string') return value.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
    const walk = (node: Doc): string =>
      node.type === 'noteLink' ? String(node.attrs?.label ?? '') :
      node.text ?? (node.content ?? []).map(walk).join(node.content?.every((child) => child.type === 'text' || child.type === 'noteLink' || child.type === 'hardBreak') ? '' : '\n')
    return value ? walk(value as Doc) : ''
  }
  const titleOf = (id: string): { title: string; key: string; link: string } | null => {
    const capture = db.prepare(`select ${LABEL} as title, number from captures where id = ?`).get(id) as { title: string; number: number } | undefined
    if (capture) return { title: capture.title, key: `MF-${capture.number}`, link: id }
    const nugget = db.prepare('select title, tier from nuggets where id = ?').get(id) as { title: string; tier: string } | undefined
    return nugget ? { title: nugget.title, key: '', link: `${nugget.tier}:${id}` } : null
  }
  handle('mentions', (id: string) => {
    const me = titleOf(id)
    const name = me?.title.trim() ?? ''
    // A name worth looking for: not empty, not "Untitled", not one tiny word.
    const findable = name.length >= 4 && !/^untitled$/i.test(name)
    const pattern = findable ? new RegExp(`(?<![\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i') : null
    const linked: Mention[] = []
    const unlinked: Mention[] = []
    for (const row of everything()) {
      if (row.id === id || !row.body) continue
      // A link as the editor keeps it, or as an imported page still holds it.
      const links = new RegExp(`"id":"(?:[a-z]+:)?${id}"|\\[\\[@(?:[a-z]+:)?${id}\\|`).test(row.body)
      const text = words(JSON.parse(row.body))
      if (links) {
        const label = /"label":"([^"]*)"/.exec(row.body.slice(Math.max(0, row.body.search(new RegExp(`"id":"(?:[a-z]+:)?${id}"`)))))?.[1] ??
          new RegExp(`\\[\\[@(?:[a-z]+:)?${id}\\|([^\\]]+)\\]\\]`).exec(row.body)?.[1] ?? name
        const at = text.indexOf(label)
        linked.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: at >= 0 ? around(text, at, label.length) : text.slice(0, 160) })
        continue
      }
      const hit = pattern?.exec(text)
      if (hit) unlinked.push({ type: row.type, id: row.id, title: row.title, private: row.private, snippet: around(text, hit.index, hit[0].length) })
    }
    return { linked, unlinked: unlinked.slice(0, 20) }
  })
  // Turn the first plain mention of a note in another into a real link.
  handle('mention:link', (sourceType: string, sourceId: string, targetId: string) => {
    const me = titleOf(targetId)
    if (!me) return false
    const table = sourceType === 'capture' ? 'captures' : 'nuggets'
    const row = db.prepare(`select body from ${table} where id = ?`).get(sourceId) as { body: string } | undefined
    if (!row?.body) return false
    const stored = JSON.parse(row.body) as Doc | string | null
    // A body kept as plain text becomes a document, a paragraph a line.
    const doc: Doc = typeof stored === 'string'
      ? { type: 'doc', content: stored.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }
      : stored ?? { type: 'doc', content: [] }
    const lower = me.title.toLowerCase()
    const whole = new RegExp(`(?<![\\w])${me.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i')
    let done = false
    const walk = (node: Doc): void => {
      if (done || !node.content) return
      const next: Doc[] = []
      for (const child of node.content) {
        // The name as a whole word, as the mention was found: never inside "paragraph".
        const at = !done && child.type === 'text' && !child.marks?.some((mark) => mark.type === 'code') ? (child.text ?? '').search(whole) : -1
        if (at < 0) {
          next.push(child)
          walk(child)
          continue
        }
        const text = child.text ?? ''
        if (at > 0) next.push({ ...child, text: text.slice(0, at) })
        // A nugget or article is linked as `tier:id`, the way @ links them.
        next.push({ type: 'noteLink', attrs: { id: me.link, label: me.title, key: me.key } })
        if (at + lower.length < text.length) next.push({ ...child, text: text.slice(at + lower.length) })
        done = true
      }
      node.content = next
    }
    walk(doc)
    if (!done) return false
    // Captures keep no edit time; nuggets do.
    if (table === 'captures') db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(doc), sourceId)
    else db.prepare('update nuggets set body = ?, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), sourceId)
    return write(true)
  })

  // What @ offers besides captures: nuggets and articles by name.
  handle('items:find', (query: unknown) =>
    db.prepare("select id, tier, coalesce(nullif(title, ''), label('', body)) as name, coalesce(nullif(title, ''), label('', body)) as title from nuggets where name like ? escape '\\' and superseded_by is null order by updated_at desc limit 6").all(`%${like(String(query))}%`))
  // A page of your own from nothing: notes on linear algebra, say. An article
  // with no nuggets behind it, there to be written in.
  handle('article:new', () => {
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'article', 'note', 'Untitled', 'null', ?, ?)").run(id, now(), now())
    return write(id)
  })
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
        `select ${LIST}, body from captures where status = 'open' and captured_at < ? ${hidePrivate ? 'and 0' : ''}
         and id not in (select nugget_id from hint_events where shown_at >= ? union select capture_id from nuggets where capture_id is not null and id in (select nugget_id from hint_events where shown_at >= ?))
         order by (julianday('now') - julianday(captured_at) + 1) * (abs(random()) % 1000) desc limit ${Math.max(0, Math.min(10, settings().rotCount))}`
      )
      // Only what has sat a day: anything newer is in the list right below,
      // and a card for it would only say the same thing twice.
      .all(ago(1), ago(3), ago(3))
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
      ? (db.prepare(`select id, capture_id as captureId, kind, tier, title, body from nuggets where mode = 'pushed' and suspended = 0 and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0
          order by coalesce(last_visited_at, '') limit 1`).get(ago(3)) as Record<string, string> | undefined)
      : undefined
    // Half the time, or always while there are few nuggets, an old capture
    // still open: the link you meant to read, the thing you meant to look up.
    // Never one a rot card showed in the last three days.
    const few = (db.prepare('select count(*) n from nuggets where suspended = 0').get() as { n: number }).n < 20
    // Fair by kind: a kind is drawn first, each with the same chance, and
    // then one of its captures, so three hundred bits do not crowd out the
    // dozen links and words. Within a kind, older and voted-up come first.
    const candidates = `from captures where status = 'open' and coalesce(surfaced_at, '') < ?
      and captured_at < ? and private = 0 ${hidePrivate ? 'and 0' : ''}
      and id not in (select nugget_id from hint_events where shown_at >= ?)
      and ${LABEL} not like 'http%'`
    // A bare address says nothing at a glance: a link comes up as a hint once
    // it has a name, its page's or yours.
    const kinds = (db.prepare(`select distinct kind ${candidates}`).all(ago(3), ago(7), ago(3)) as { kind: string }[]).map((row) => row.kind)
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    const old = !pushed && kind && (few || Math.random() < 0.5)
      ? (db.prepare(`select id, id as captureId, kind, title, body ${candidates} and kind = ?
          order by (julianday('now') - julianday(captured_at)) * surfacing_weight * (abs(random()) % 1000) desc limit 1`).get(ago(3), ago(7), ago(3), kind) as Record<string, string> | undefined)
      : undefined
    const hint = pushed ?? old ?? db
      .prepare(
        `select id, capture_id as captureId, kind, tier, title, body from nuggets where suspended = 0 and mode != 'pushed' and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0
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
  // A nugget with no name of its own is named from its words, or for what it holds.
  const ITEM = `id, tier, kind, coalesce(nullif(title, ''), label('', body)) as title, prompt, private, pinned_at as pinnedAt, due_at as dueAt, suspended,
    state is not null as reviewed, created_at as createdAt, capture_id as captureId, remind_at as remindAt,
    (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) as lapses, attribution, context, mode, superseded_by as supersededBy, revisions`
  handle('items', (tier: string) =>
    db.prepare(`select ${ITEM} from nuggets where tier = ? order by created_at desc`).all(tier)
  )
  handle('item', (id: string) => {
    // Its own title, not the name lists give it: an untitled article's title
    // box stays empty rather than showing its first line as if it were set.
    const row = db.prepare(`select ${ITEM}, title as own, body, origins from nuggets where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const glosses = db.prepare('select id, body, author, created_at as createdAt from glosses where item_id = ? order by created_at').all(id)
    return { ...body(row), title: row.own, origins: JSON.parse((row.origins as string) ?? '[]'), glosses }
  })
  handle('item:save', (id: string, patch: { body?: unknown; title?: string; prompt?: string | null; kind?: string; suspended?: boolean; attribution?: string | null; context?: string | null; mode?: string }) => {
    const allowed = ['body', 'title', 'prompt', 'kind', 'suspended', 'attribution', 'context', 'mode']
    const sets = Object.entries(patch).filter(([key, value]) => value !== undefined && allowed.includes(key))
    // A meaningful change to something you are tested on brings it back sooner,
    // a 30% cut to what is left of its interval, never a reset: fixing a
    // sentence should not cost months. Once per review, not once per save, or
    // typing would shrink it to nothing. "Meaningful" is more than a few
    // letters: what differs once the shared start and end are taken off.
    const before = db.prepare('select body, prompt, state, due_at, edited_since_review, updated_at from nuggets where id = ?').get(id) as
      { body: string; prompt: string | null; state: string | null; due_at: string | null; edited_since_review: number; updated_at: string | null } | undefined
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
    // Rewritten, counted: the one sign an item got better. Once per sitting,
    // not once per autosave: only when the last change is ten minutes old.
    if (before && patch.body !== undefined && changed(plain(JSON.parse(before.body ?? 'null')), plain(patch.body)) &&
      Date.now() - new Date(before.updated_at ?? 0).getTime() > 600000)
      db.prepare('update nuggets set revisions = revisions + 1 where id = ?').run(id)
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
    // Each body, then your glosses on it: the words already in your own voice
    // are where an article starts.
    const glossed = (id: string): string[] =>
      (db.prepare("select body from glosses where item_id = ? and author = 'user' order by created_at").all(id) as { body: string }[]).map((row) => row.body)
    const text = parts.map((part, at) => [plain(JSON.parse(part.body)), ...glossed(ids[at])].join('\n\n')).join('\n\n')
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
  // The new-item cap, tuned by its own instrument: when reviews more than a
  // day overdue outnumber a day's limit, the queue is not being finished, and
  // half as many new ones come in until it is. Said in Settings, never silent.
  const newCap = (): { cap: number; tuned: boolean; behind: number } => {
    const { newPerDay, reviewsPerDay } = settings()
    const behind = (db.prepare(`select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and state is not null and due_at <= ?`)
      .get(new Date(Date.now() - 86400000).toISOString()) as { n: number }).n
    const tuned = behind > reviewsPerDay
    return { cap: tuned ? Math.floor(newPerDay / 2) : newPerDay, tuned, behind }
  }
  handle('review:tuning', newCap)
  handle('review:queue', () => {
    const { reviewsPerDay } = settings()
    const newPerDay = newCap().cap
    const today = new Date().toISOString().slice(0, 10)
    const done = db.prepare('select sum(first) as fresh, count(*) - sum(first) as old from review_log where reviewed_at >= ?').get(today) as { fresh: number | null; old: number | null }
    // Most at risk: the lowest chance of recall now, by the card's own memory.
    const risk = scheduler()
    const due = (db
      .prepare(`select ${ITEM}, body, state from nuggets where coalesce(prompt, '') != '' and suspended = 0 and state is not null and due_at <= ?`)
      .all(now()) as Record<string, unknown>[])
      .map((row) => ({ row, recall: risk.get_retrievability(cardOf(row.state as string), new Date(), false) }))
      .sort((a, b) => a.recall - b.recall)
      .slice(0, Math.max(0, reviewsPerDay - (done.old ?? 0)))
      .map(({ row }) => row)
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
    important, deadline_at as deadline, blocker, reschedules, notify`
  handle('tasks', () => db.prepare(`select ${TASK} from tasks order by status, important desc, coalesce(sort_order, 1e12), due_at is null, due_at, created_at`).all())
  handle('task', (id: string) => {
    const row = db.prepare(`select ${TASK}, notes, subtasks from tasks where id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const done = db.prepare('select done_at as at, s.recap from task_done d left join sessions s on s.id = d.session_id where d.task_id = ? order by done_at desc').all(id)
    // What the task is about, linked from nuggets and articles: shown as a
    // checklist on it, and the material comes up first when you open it.
    const linked = db.prepare(`select n.id, n.tier, n.kind, n.title from task_links l join nuggets n on n.id = l.item_id where l.task_id = ?
      union all select c.id, 'capture', c.kind, label(c.title, c.body) from task_links l join captures c on c.id = l.item_id where l.task_id = ?`).all(id, id)
    return { ...row, notes: JSON.parse((row.notes as string) ?? 'null'), subtasks: JSON.parse((row.subtasks as string) ?? '[]'), done, linked }
  })
  handle('task:add', (text: string, origin?: string, today = false) => write(addTask(String(text), origin ?? null, today)))
  // Study this: a task made from a nugget or an article, linked to it, so the
  // reading has a when and the material is waiting when the task opens.
  handle('study', (itemId: string, text: string) => {
    const task = addTask(text)
    db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(task.id, itemId)
    return write(task)
  })
  const TASK_COLUMNS = { title: 'title', recurrence: 'recurrence', waitingOn: 'waiting_on', estimate: 'estimate', sortOrder: 'sort_order', important: 'important', deadline: 'deadline_at', blocker: 'blocker', reschedules: 'reschedules', notify: 'notify' } as const
  handle('task:save', (id: string, patch: { title?: string; notes?: unknown; due?: string | null; recurrence?: string | null; status?: string; waitingOn?: string | null; subtasks?: unknown; estimate?: number | null; sortOrder?: number; important?: number; deadline?: string | null; blocker?: string | null; reschedules?: number; notify?: string | null }) => {
    for (const [key, column] of Object.entries(TASK_COLUMNS))
      if (patch[key as keyof typeof patch] !== undefined) db.prepare(`update tasks set ${column} = ? where id = ?`).run(patch[key as keyof typeof patch] as string | number | null, id)
    // Waiting on someone needs a day to chase them, or it becomes a second
    // rot pool: three days out, if it has no date of its own.
    if (patch.waitingOn) db.prepare('update tasks set due_at = ? where id = ? and due_at is null').run(new Date(Date.now() + 3 * 86400000).toISOString(), id)
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
  // A session can close it, and the row says which: its recap is the
  // completion note. A routine closes many times, so it is a row, not a field.
  const finish = (id: string, session: string | null = null): unknown => {
    const task = db.prepare('select due_at, recurrence, repeat_until from tasks where id = ?').get(id) as { due_at: string | null; recurrence: string | null; repeat_until: string | null }
    db.prepare('insert into task_done (task_id, done_at, session_id) values (?, ?, ?)').run(id, now(), session)
    if (!task.recurrence) return write(db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(now(), id))
    const fromToday = task.recurrence.includes('!') || !task.due_at
    // Counted from today, but at the time of day it had: "every! 3 days" at
    // 9 stays at 9, rather than taking the minute it was ticked.
    const base = new Date()
    if (fromToday && task.due_at) {
      const was = new Date(task.due_at)
      base.setHours(was.getHours(), was.getMinutes(), 0, 0)
    }
    let next = advance(fromToday ? base : new Date(task.due_at!), task.recurrence)
    while (next.getTime() < Date.now()) next = advance(next, task.recurrence)
    // Past its end, the series is over: this one was the last.
    if (task.repeat_until && next.toISOString() > task.repeat_until)
      return write(db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(now(), id))
    return write(db.prepare('update tasks set due_at = ? where id = ?').run(next.toISOString(), id))
  }
  handle('task:done', (id: string) => finish(id))

  // --- tags, worked out from the words every time so they cannot go stale
  const tagged = (): { tag: string; id: string; type: string; title: string }[] => {
    const rows = [
      ...(db.prepare(`select id, 'capture' as type, ${LABEL} as title, body from captures where status != 'discarded'`).all() as Record<string, string>[]),
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
        `select id, 'capture' as type, kind, ${LABEL} as title, pinned_at as pinnedAt, private from captures where pinned_at is not null ${hidePrivate ? "and private = 0 and status != 'open'" : ''}
         union all select id, tier as type, kind, title, pinned_at, private from nuggets where pinned_at is not null ${privacy}
         order by pinnedAt desc limit 3`
      )
      .all()
  })
  // A reminder is a pin with a date: when it comes round, it pins itself.
  handle('remind', (table: 'captures' | 'nuggets', id: string, at: string | null) =>
    write(db.prepare(`update ${table === 'nuggets' ? 'nuggets' : 'captures'} set remind_at = ? where id = ?`).run(at, id))
  )
  // Within the three pins: a reminder that comes round while three are pinned
  // waits for a free place, rather than pushing one off or being lost.
  const pins = (): number =>
    (db.prepare('select (select count(*) from captures where pinned_at is not null) + (select count(*) from nuggets where pinned_at is not null) n').get() as { n: number }).n
  setInterval(() => {
    let fired = 0
    for (const table of ['captures', 'nuggets'])
      for (let due; pins() < 3 && (due = db.prepare(`select id from ${table} where remind_at <= ? order by remind_at limit 1`).get(now()) as { id: string } | undefined); fired++)
        db.prepare(`update ${table} set pinned_at = ?, remind_at = null where id = ?`).run(now(), due.id)
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
  // A focus session: a goal, an optional length, and pauses that do not count.
  column('sessions', 'goal text')
  column('sessions', 'planned_ms integer')
  column('sessions', 'paused_ms integer not null default 0')
  column('sessions', 'paused_at text')
  // One at a time: starting another ends the one running, recap and all kept.
  handle('session:start', (taskId: string, goal?: string, plannedMs?: number | null) => {
    db.prepare('update sessions set ended_at = ? where ended_at is null').run(now())
    const id = randomUUID()
    db.prepare('insert into sessions (id, task_id, started_at, goal, planned_ms) values (?, ?, ?, ?, ?)').run(id, taskId, now(), goal?.trim() || null, plannedMs ?? null)
    return write(id)
  })
  /** The session running now, with its task's name, for the floating timer. */
  handle('focus:now', () =>
    db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title) as goal, s.started_at as startedAt, s.planned_ms as plannedMs,
      s.paused_ms as pausedMs, s.paused_at as pausedAt from sessions s join tasks t on t.id = s.task_id where s.ended_at is null order by s.started_at desc limit 1`).get() ?? null)
  handle('session:pause', (id: string) => write(db.prepare('update sessions set paused_at = ? where id = ? and paused_at is null').run(now(), id)))
  handle('session:resume', (id: string) => {
    const at = db.prepare('select paused_at from sessions where id = ?').get(id) as { paused_at: string | null } | undefined
    if (!at?.paused_at) return
    db.prepare('update sessions set paused_ms = paused_ms + ?, paused_at = null where id = ?').run(Date.now() - new Date(at.paused_at).getTime(), id)
    return write(true)
  })
  // Called off: no record that it happened.
  handle('session:cancel', (id: string) => write(db.prepare('delete from sessions where id = ?').run(id)))
  // Ending asks for the recap, and the recap can become a nugget: the loop that
  // turns doing the work into something worth keeping.
  handle('session:end', (id: string, recap: string, keep: boolean, close = false) => {
    db.prepare('update sessions set ended_at = ?, recap = ? where id = ?').run(now(), recap, id)
    if (close) finish((db.prepare('select task_id from sessions where id = ?').get(id) as { task_id: string }).task_id, id)
    if (keep && recap.trim())
      db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(
        randomUUID(), recap.split('\n')[0].slice(0, 120), JSON.stringify(recap), now(), now())
    return write(true)
  })

  // --- a time of day means something happens at that time
  // Pull: it is already first in Today. Quiet: the menu bar counts it. Alerts:
  // a notification, once per due time. All-day tasks never alert.
  setInterval(() => {
    if (!Notification.isSupported()) return
    // A task's own level wins over the setting: most never set one.
    const due = db.prepare(
      "select id, title from tasks where status = 'open' and all_day = 0 and due_at <= ? and due_at > ? and notified_at is null and coalesce(notify, ?) = 'alerts'"
    ).all(now(), new Date(Date.now() - 3600000).toISOString(), settings().notify) as { id: string; title: string }[]
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
        "select coalesce(sum(status = 'open'), 0) now, coalesce(sum(captured_at < ? and (status = 'open' or exited_at >= ?)), 0) weekAgo from captures", ago(7), ago(7))
    }
  })

  // --- export: everything as plain text and JSON, in a folder you choose
  handle('export', async () => {
    const { filePaths } = await dialog.showOpenDialog({ title: 'Export everything to…', properties: ['openDirectory', 'createDirectory'] })
    if (!filePaths[0]) return null
    const folder = join(filePaths[0], `vigil-${new Date().toISOString().slice(0, 10)}`)
    await mkdir(join(folder, 'markdown'), { recursive: true })
    // Every table, so nothing stays behind in the app: sessions, settings and all.
    const tables = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as { name: string }[]).map((row) => row.name)
    const data = Object.fromEntries(tables.map((table) => [table, db.prepare(`select * from ${table}`).all()]))
    await writeFile(join(folder, 'vigil.json'), JSON.stringify(data, null, 2))
    // Real Markdown with what is known about each one up top, named so a
    // folder listing reads like the notes do.
    const front = (fields: Record<string, unknown>): string =>
      `---\n${Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n`
    const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    // Pictures point at the assets copied beside the notes, not the app's own store.
    const local = (text: string): string => text.replace(/mindflow:\/\/assets\//g, '../assets/')
    const taken = new Set<string>()
    // Two notes with the same name each keep their own file.
    const unique = (name: string): string => {
      let one = name
      for (let n = 2; taken.has(one); n++) one = `${name} ${n}`
      taken.add(one)
      return one
    }
    // Every file named first, so a link can point at the file it leads to.
    const captureRows = data.captures as Record<string, string & number>[]
    const nuggetRows = data.nuggets as Record<string, string>[]
    const names = new Map<string, string>()
    for (const row of captureRows) {
      const name = slug(plain(JSON.parse(row.body ?? 'null')).split('\n').find((line) => line.trim()) ?? '')
      names.set(row.id, unique(`MF-${row.number}${name ? ` ${name}` : ''}`))
    }
    for (const row of nuggetRows) names.set(row.id, unique(`${row.tier}-${slug(row.title) || row.id.slice(0, 8)}`))
    const nameOf = (id: string): string | undefined => names.get(id)
    for (const row of captureRows) {
      const body = JSON.parse(row.body ?? 'null')
      await writeFile(join(folder, 'markdown', `${names.get(row.id)}.md`),
        front({ id: `MF-${row.number}`, kind: row.kind, status: row.status, captured: row.captured_at, who: row.attribution, where: row.medium, tags: tagsIn(plain(body)) }) + local(markdown(body, nameOf)))
    }
    for (const row of nuggetRows) {
      const body = JSON.parse(row.body ?? 'null')
      const text = local(markdown(body, nameOf))
      // A heading of its own already names it; otherwise the title does.
      const heading = /^#\s/.test(text) ? '' : `# ${row.title}\n\n`
      await writeFile(join(folder, 'markdown', `${names.get(row.id)}.md`),
        front({ kind: row.tier, created: row.created_at, who: row.attribution, question: row.prompt, tags: tagsIn(plain(body)) }) + heading + text)
    }
    // The pictures and files the notes point at.
    await cp(join(app.getPath('userData'), 'assets'), join(folder, 'assets'), { recursive: true }).catch(() => undefined)
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
