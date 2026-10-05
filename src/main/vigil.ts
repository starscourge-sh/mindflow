import { Notification, app, dialog, ipcMain, net } from 'electron'
import { randomUUID } from 'crypto'
import { cp, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'

import { LABEL, LIST, changed, database, like } from './captures'
import { advance, readTask } from './task-words'

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
  notify: 'quiet' as 'pull' | 'quiet' | 'alerts',
  // Notes: a line ending in = shows its answer; the first line rides in the
  // top bar once scrolled away; the font notes are written in, and its size.
  calc: true,
  topTitle: true,
  noteFont: 'default' as string,
  textSize: 1,
  // Once a week, on this day (0 is Sunday), the box suggests walking the
  // inbox through its exits.
  weeklyReview: true,
  weeklyDay: 4,
  // A tag with an exam date says so in the box when its cards fall behind.
  examNudges: true,
  // Hints can be memories: this day last year, things from one source.
  memories: true,
  // The weather outside, kept with each capture as context. Off unless asked:
  // it asks a weather service where you roughly are.
  weather: false,
  // A note's first picture, small, at the end of its row in every list.
  thumbnails: true
}
export type Settings = typeof DEFAULTS

/**
 * The weather where you are, as a few words: "12°C, light rain". wttr.in
 * places you by your connection, so there is no key, no account and no
 * location permission. Asked at most every half hour; offline, or slow, it is
 * simply left out.
 */
let weather: { said: string; at: number } | null = null
async function weatherNow(): Promise<string | null> {
  if (weather && Date.now() - weather.at < 30 * 60000) return weather.said
  try {
    const answer = await net.fetch('https://wttr.in/?format=j1', { signal: AbortSignal.timeout(5000) })
    const now = ((await answer.json()) as { current_condition?: { temp_C?: string; weatherDesc?: { value?: string }[] }[] }).current_condition?.[0]
    if (!now?.temp_C) return null
    const sky = now.weatherDesc?.[0]?.value?.trim().toLowerCase()
    weather = { said: sky ? `${now.temp_C}°C, ${sky}` : `${now.temp_C}°C`, at: Date.now() }
    return weather.said
  } catch {
    return null
  }
}

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
const preview = (state: string | null, cap: (due: Date) => Date = (due) => due): Record<number, string> => {
  const record = scheduler().repeat(cardOf(state), new Date())
  return Object.fromEntries([1, 2, 3, 4].map((grade) => [grade, cap(record[grade as Grade].card.due).toISOString()]))
}

// --- tasks ----------------------------------------------------------------

/** What making a task gave back: the task, and whether it was already there. */
export type Made = { id: string; number: number; existed: boolean }

/**
 * A task from a line of text. The same task twice is one task: an open one
 * with the same name is returned instead, and what this one came from is
 * linked to it, so nothing is lost and nothing is doubled.
 */
function addTask(text: string, origin: string | null = null, today = false): Made {
  const db = database()
  const task = readTask(text)
  const title = task.title || text
  // The same name with no date or repeat of its own is the same task; one
  // that brings a date or a repeat is meant as a new one.
  const twin = task.due || task.recurrence || task.deadline || task.plan ? undefined
    : (db.prepare("select id, number from tasks where status = 'open' and lower(trim(title)) = lower(trim(?))").get(title) as { id: string; number: number } | undefined)
  if (twin) {
    if (origin) db.prepare('insert or ignore into task_links (task_id, item_id) values (?, ?)').run(twin.id, origin)
    return { ...twin, existed: true }
  }
  const id = randomUUID()
  // Typed into Today with no date, it is for today, as in Todoist: all day,
  // not dropped into a backlog the list you typed it in does not show.
  if (today && !task.due && !task.plan) Object.assign(task, { due: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(), allDay: true })
  const { number } = db
    .prepare(
      `insert into tasks (id, number, title, due_at, all_day, recurrence, repeat_until, origin_capture_id, created_at, deadline_at, priority, important, plan_for)
       values (?, (select coalesce(max(number), 0) + 1 from tasks), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning number`
    )
    .get(id, title, task.due, task.allDay ? 1 : 0, task.recurrence, task.until, origin, now(), task.deadline, task.priority, [1, 2].includes(task.priority) ? 1 : 0, task.plan) as { number: number }
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
  column('captures', 'weather text')
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
  // Linear's four priorities, 1 Urgent to 4 Low, 0 for none. Important was
  // the one flag before them: it is High, and stays in step with them, so
  // nothing that reads it loses anything. Safe to run every start.
  column('tasks', 'priority integer not null default 0')
  db.exec('update tasks set priority = 2 where important = 1 and priority = 0')
  // A when with no day: "someday", a month ("2026-10") or a year ("2026").
  column('tasks', 'plan_for text')
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
  // An exam or deadline on a tag: review paces everything carrying it to be ready by then.
  column('tag_meta', 'exam_at text')
  // Why the answer is so, one line under it in review.
  column('nuggets', 'why text')
  // Which day each gentle nudge was last given, so none comes twice in a day.
  db.exec('create table if not exists nudges (key text primary key, day text not null)')

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
  // The weather too, when that is on: filled in when it comes back, so the
  // capture itself never waits on it.
  handle('capture:session', (id: string) => {
    db.prepare("update captures set session_id = (select id from sessions where ended_at is null and task_id != '' order by started_at desc limit 1) where id = ?").run(id)
    if (settings().weather)
      void weatherNow().then((said) => said && write(db.prepare('update captures set weather = ? where id = ? and weather is null').run(said, id)))
  })

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
    // A kind's own fields (a book's rating, a word's language) travel with it.
    db.prepare('update nuggets set fields = (select fields from captures where id = ?) where id = ?').run(id, nugget)
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
  // Made a task by mistake: the task goes, if it was new, and the capture is open again.
  handle('toTask:undo', (captureId: string, taskId: string, existed: boolean) => {
    if (!existed) db.prepare('delete from tasks where id = ? and origin_capture_id = ?').run(taskId, captureId)
    db.prepare("update captures set status = 'open' where id = ?").run(captureId)
    return write(true)
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
        `select ${LIST}, body from captures where status = 'open' and archived_at is null and captured_at < ? ${hidePrivate ? 'and 0' : ''}
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
      ? (db.prepare(`select id, capture_id as captureId, kind, tier, title, body from nuggets where mode = 'pushed' and suspended = 0 and archived_at is null and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0
          order by coalesce(last_visited_at, '') limit 1`).get(ago(3)) as Record<string, string> | undefined)
      : undefined
    // Half the time, or always while there are few nuggets, an old capture
    // still open: the link you meant to read, the thing you meant to look up.
    // Never one a rot card showed in the last three days.
    const few = (db.prepare('select count(*) n from nuggets where suspended = 0').get() as { n: number }).n < 20
    // Fair by kind: a kind is drawn first, each with the same chance, and
    // then one of its captures, so three hundred bits do not crowd out the
    // dozen links and words. Within a kind, older and voted-up come first.
    const candidates = `from captures where status = 'open' and archived_at is null and coalesce(surfaced_at, '') < ?
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
        `select id, capture_id as captureId, kind, tier, title, body from nuggets where suspended = 0 and archived_at is null and mode != 'pushed' and coalesce(capture_id, '') not in (select id from captures where surfaced_at >= ?) and private = 0
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
    (select count(*) from review_log where item_id = nuggets.id and grade = 1 and first = 0) as lapses, attribution, context, mode, superseded_by as supersededBy, archived_at as archivedAt, revisions, why`
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
  handle('item:save', (id: string, patch: { body?: unknown; title?: string; prompt?: string | null; kind?: string; suspended?: boolean; attribution?: string | null; context?: string | null; mode?: string; why?: string | null }) => {
    const allowed = ['body', 'title', 'prompt', 'kind', 'suspended', 'attribution', 'context', 'mode', 'why']
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
    const behind = (db.prepare(`select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and state is not null and due_at <= ?`)
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
    const exam = examOf()
    // Everything tested, so a card with an exam ahead can be called in for the
    // last look even when its own schedule would wait past the date.
    const tested = (db
      .prepare(`select ${ITEM}, body, state, (select body from glosses where item_id = nuggets.id and author = 'user' order by created_at desc limit 1) as gloss
        from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null`)
      .all() as Record<string, unknown>[])
      .map((row) => ({ row, exam: exam(row) }))
    const swept = ({ row, exam }: { row: Record<string, unknown>; exam: Exam | null }): boolean => {
      if (!exam || Date.now() < exam.sweep) return false
      const last = cardOf(row.state as string).last_review
      return !last || last.getTime() < exam.sweep
    }
    const nearest = (a: { exam: Exam | null }, b: { exam: Exam | null }): number => (a.exam?.day ?? Infinity) - (b.exam?.day ?? Infinity)
    const due = tested
      .filter((one) => one.row.state && (String(one.row.dueAt) <= now() || swept(one)))
      .map((one) => ({ ...one, recall: risk.get_retrievability(cardOf(one.row.state as string), new Date(), false) }))
      // Nearest exam first, then most at risk.
      .sort((a, b) => nearest(a, b) || a.recall - b.recall)
    // Cards with an exam ahead are not held back by the daily limit: the date is.
    const room = Math.max(0, reviewsPerDay - (done.old ?? 0))
    const examDue = due.filter((one) => one.exam)
    const otherDue = due.filter((one) => !one.exam).slice(0, Math.max(0, room - examDue.length))
    // New cards with an exam are paced: an even share a day of what is unseen,
    // so all of it has been met before the last few days' sweep.
    const unseen = tested.filter((one) => !one.row.state && (!one.row.dueAt || String(one.row.dueAt) <= now())).sort((a, b) => nearest(a, b) || String(a.row.createdAt).localeCompare(String(b.row.createdAt)))
    const metToday = new Set((db.prepare('select item_id from review_log where first = 1 and reviewed_at >= ?').all(today) as { item_id: string }[]).map((row) => row.item_id))
    const examFresh = examDates().flatMap(({ tag }) => {
      const mine = unseen.filter((one) => one.exam?.tag === tag)
      if (!mine.length) return []
      const one = mine[0].exam!
      const met = tested.filter((other) => other.exam?.tag === tag && metToday.has(other.row.id as string)).length
      const days = Math.max(1, Math.ceil((one.sweep - Date.now()) / DAY_MS))
      return mine.slice(0, Math.max(0, Math.ceil((mine.length + met) / days) - met))
    })
    const fresh = unseen.filter((one) => !one.exam).slice(0, Math.max(0, newPerDay - (done.fresh ?? 0)))
    return [...examDue, ...examFresh, ...otherDue, ...fresh].map(({ row, exam }) => ({
      ...body(row), state: undefined, exam: exam?.tag ?? null, intervals: preview(row.state as string | null, (when) => capped(when, exam))
    }))
  })
  // Bury: not today. The timing is wrong, the item is fine, and the schedule is
  // left as it was; it is simply back tomorrow.
  handle('review:bury', (id: string) => {
    const tomorrow = new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
    return write(db.prepare('update nuggets set due_at = ? where id = ?').run(tomorrow, id))
  })
  handle('review:counts', () => {
    const due = db.prepare(`select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and (due_at is null or due_at <= ?)`).get(now()) as { n: number }
    return due.n
  })
  // Only a graded review moves a schedule: not opening, not searching.
  handle('review:grade', (id: string, grade: Grade, ms: number) => {
    const row = db.prepare(`select ${ITEM}, body, state from nuggets where id = ?`).get(id) as Record<string, unknown> & { state: string | null }
    const { card } = scheduler().next(cardOf(row.state), new Date(), grade)
    // The card keeps its own schedule; only the day it is asked for is
    // brought inside an exam's date.
    const due = capped(card.due, examOf()(row))
    db.prepare('update nuggets set state = ?, due_at = ?, edited_since_review = 0 where id = ?').run(JSON.stringify(card), due.toISOString(), id)
    db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, ?)').run(id, grade, now(), ms, row.state ? 0 : 1)
    return write(due.toISOString())
  })
  // A card's own past: each review, its grade, and when it is next due.
  handle('review:history', (id: string) => ({
    reviews: db.prepare('select reviewed_at as at, grade from review_log where item_id = ? order by reviewed_at').all(id) as { at: string; grade: number }[],
    dueAt: (db.prepare('select due_at from nuggets where id = ?').get(id) as { due_at: string | null } | undefined)?.due_at ?? null
  }))
  // Where a card came from, to reread after missing it: the capture it was
  // kept from, or the first nugget an article was made of.
  handle('review:source', (id: string) => {
    const capture = db.prepare(`select 'capture' as type, c.id, label(c.title, c.body) as title, c.body from captures c join nuggets n on n.capture_id = c.id where n.id = ?`).get(id) as Record<string, unknown> | undefined
    if (capture) return body(capture)
    const origin = (JSON.parse((db.prepare('select origins from nuggets where id = ?').get(id) as { origins: string | null } | undefined)?.origins ?? '[]') as string[])[0]
    const nugget = origin && (db.prepare('select tier as type, id, title, body from nuggets where id = ?').get(origin) as Record<string, unknown> | undefined)
    return nugget ? body(nugget) : null
  })

  // --- exams: a date on a tag. Intervals are capped so nothing falls past
  // it, new cards are paced to all be met in time, and the last few days are
  // a sweep that brings every card round once more.
  const DAY_MS = 86400000
  const SWEEP_DAYS = 3
  type Exam = { tag: string; day: number; sweep: number }
  /** Tags with a date not yet over, nearest first. The day counts from its midnight. */
  const examDates = (): Exam[] =>
    (db.prepare('select tag, exam_at from tag_meta where exam_at is not null').all() as { tag: string; exam_at: string }[])
      .map((row) => {
        const day = new Date(row.exam_at).setHours(0, 0, 0, 0)
        return { tag: row.tag, day, sweep: day - SWEEP_DAYS * DAY_MS }
      })
      .filter((one) => one.day + DAY_MS > Date.now())
      .sort((a, b) => a.day - b.day)
  /** A reader of which exam, if any, a nugget is for: the nearest among its tags. */
  const examOf = (): ((row: Record<string, unknown>) => Exam | null) => {
    const exams = examDates()
    if (!exams.length) return () => null
    const alias = new Map((db.prepare('select tag, alias_of from tag_meta where alias_of is not null').all() as { tag: string; alias_of: string }[]).map((row) => [row.tag, row.alias_of]))
    return (row) => {
      const words = typeof row.body === 'string' ? JSON.parse(row.body ?? 'null') : row.body
      const tags = new Set(tagsIn(`${row.title ?? ''} ${plain(words)}`).map((tag) => alias.get(tag) ?? tag))
      return exams.find((one) => tags.has(one.tag)) ?? null
    }
  }
  /** A due date brought inside the exam: before the sweep, to its start; during it, to the day. */
  const capped = (due: Date, exam: Exam | null): Date => {
    if (!exam) return due
    const limit = Date.now() < exam.sweep ? exam.sweep : exam.day
    return limit > Date.now() && due.getTime() > limit ? new Date(limit) : due
  }
  // How ready each exam is: solid (likely still known on the day), learning,
  // struggling (missed last time, or often), and not yet seen.
  const readiness = (): { tag: string; at: string; days: number; total: number; solid: number; learning: number; struggling: number; unseen: number; behind: number; perDay: number }[] => {
    const exams = examDates()
    if (!exams.length) return []
    const exam = examOf()
    const { retention } = settings()
    const rows = (db.prepare(`select ${ITEM}, body, state, (select grade from review_log where item_id = nuggets.id order by reviewed_at desc limit 1) as last
      from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null`).all() as Record<string, unknown>[])
      .map((row) => ({ row, exam: exam(row) }))
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    const risk = scheduler()
    return exams.map(({ tag, day, sweep }) => {
      const mine = rows.filter((one) => one.exam?.tag === tag).map(({ row }) => row)
      const unseen = mine.filter((row) => !row.state).length
      const struggling = mine.filter((row) => row.state && (row.last === 1 || Number(row.lapses) >= 3)).length
      const solid = mine.filter((row) => row.state && row.last !== 1 && Number(row.lapses) < 3 &&
        risk.get_retrievability(cardOf(row.state as string), new Date(Math.max(day, Date.now())), false) >= retention).length
      // Behind: reviews left from before today, and in the sweep, anything still unseen.
      const late = mine.filter((row) => row.state && row.dueAt && new Date(String(row.dueAt)).getTime() < startOfToday).length
      const behind = late + (Date.now() >= sweep ? unseen : 0)
      const days = Math.max(0, Math.ceil((day - startOfToday) / DAY_MS))
      return { tag, at: new Date(day).toISOString(), days, total: mine.length, solid, learning: mine.length - unseen - struggling - solid, struggling, unseen, behind, perDay: Math.ceil((behind + unseen) / Math.max(1, days)) }
    })
  }
  handle('exams', readiness)

  // --- gentle nudges, at most one of each a day, never in quiet hours or safe mode
  const nudgedToday = (key: string): boolean => {
    const day = new Date().toLocaleDateString('en-CA')
    if ((db.prepare('select day from nudges where key = ?').get(key) as { day: string } | undefined)?.day === day) return true
    db.prepare('insert or replace into nudges (key, day) values (?, ?)').run(key, day)
    return false
  }
  handle('nudge', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate) return null
    const { examNudges, weeklyReview, weeklyDay } = settings()
    if (examNudges)
      for (const exam of readiness())
        if (exam.behind > 0 && !nudgedToday(`exam:${exam.tag}`))
          return { kind: 'exam', view: 'review', label: `Exam · #${exam.tag}`,
            text: `#${exam.tag} is ${exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${exam.days} days`}, and ${exam.behind} ${exam.behind === 1 ? 'card is' : 'cards are'} behind. About ${exam.perDay} a day catches you up.` }
    if (weeklyReview && new Date().getDay() === weeklyDay) {
      const open = (db.prepare("select count(*) n from captures where status = 'open'").get() as { n: number }).n
      if (open && !nudgedToday('weekly'))
        return { kind: 'weekly', view: 'inbox', label: 'Weekly review',
          text: `A good day to walk the inbox: ${open} ${open === 1 ? 'capture is' : 'captures are'} waiting for an exit. Keep, deal with or let go of each.` }
    }
    return null
  })

  // --- memories, the way Photos brings them: a day in an earlier year, or
  // things that share a source. Each says which it is.
  handle('memory', () => {
    const { blackout, hidePrivate } = gate()
    if (blackout || !settings().memories) return null
    const year = new Date().getFullYear()
    const today = new Date().toLocaleDateString('en-CA')
    const lastYear = `${year - 1}${today.slice(4)}`
    // Never a private one, and in quiet hours nothing you have not dealt with.
    const from = `select id, id as captureId, kind, ${LABEL} as title, body, captured_at as at, attribution from captures
      where status != 'discarded' and private = 0 ${hidePrivate ? "and status != 'open'" : ''} and id not in (select nugget_id from hint_events where shown_at >= ?)`
    const pick = <T>(rows: T[]): T | undefined => rows[Math.floor(Math.random() * rows.length)]
    const age = (at: string): number => year - Number(new Date(at).getFullYear())
    const kinds: (() => (Record<string, unknown> & { body?: unknown; memory: string }) | undefined)[] = [
      () => {
        const row = pick(db.prepare(`${from} and strftime('%m-%d', captured_at, 'localtime') = ? and strftime('%Y', captured_at, 'localtime') < ?`).all(ago(30), today.slice(5), String(year)) as Record<string, string>[])
        return row && { ...row, memory: age(row.at) === 1 ? 'A year ago today' : `${age(row.at)} years ago today` }
      },
      () => {
        const row = pick(db.prepare(`${from} and date(captured_at, 'localtime') between date(?, '-3 days') and date(?, '+3 days') and date(captured_at, 'localtime') != ?`).all(ago(30), lastYear, lastYear, lastYear) as Record<string, string>[])
        return row && { ...row, memory: 'This time last year' }
      },
      () => {
        const row = pick(db.prepare(`${from} and strftime('%W', captured_at, 'localtime') = strftime('%W', 'now', 'localtime') and cast(strftime('%Y', captured_at, 'localtime') as integer) <= ?`).all(ago(30), year - 2) as Record<string, string>[])
        return row && { ...row, memory: `This week in ${new Date(row.at).getFullYear()}` }
      },
      () => {
        const source = pick(db.prepare("select attribution from captures where status != 'discarded' and private = 0 and coalesce(attribution, '') != '' group by attribution having count(*) >= 2").all() as { attribution: string }[])
        const rows = source ? (db.prepare(`${from} and attribution = ?`).all(ago(30), source.attribution) as Record<string, string>[]) : []
        const row = pick(rows)
        return row && { ...row, memory: `From ${row.attribution}${rows.length > 1 ? `, one of ${rows.length}` : ''}` }
      }
    ]
    // Each kind in a random order, the first that has one.
    for (const kind of kinds.sort(() => Math.random() - 0.5)) {
      const found = kind()
      if (!found) continue
      const { lastInsertRowid } = db.prepare('insert into hint_events (nugget_id, shown_at) values (?, ?)').run(String(found.id), now())
      return { ...body(found), event: Number(lastInsertRowid) }
    }
    return null
  })

  // Whether any capture is still old enough to rot: none, and the rot area says so.
  handle('rot:left', () => (db.prepare("select count(*) n from captures where status = 'open' and captured_at < ?").get(ago(1)) as { n: number }).n)

  // --- the recap, Wrapped's way: a month or a year in what you did here
  handle('recap', (period: 'month' | 'year') => {
    const start = new Date()
    if (period === 'year') start.setMonth(0, 1)
    // Early in a month there is little to say yet: the month before, whole.
    else if (start.getDate() < 7) start.setMonth(start.getMonth() - 1, 1)
    else start.setDate(1)
    start.setHours(0, 0, 0, 0)
    const end = period === 'month' && start.getMonth() !== new Date().getMonth() ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date()
    const [since, until] = [start.toISOString(), end.toISOString()]
    const rows = db.prepare(`select ${LABEL} as title, body, status, attribution, captured_at as at from captures where captured_at >= ? and captured_at < ?`).all(since, until) as { title: string; body: string; status: string; attribution: string | null; at: string }[]
    const top = (values: string[], limit = 5): { name: string; n: number }[] =>
      [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>())]
        .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, n]) => ({ name, n }))
    const local = (at: string): Date => new Date(at)
    const busiestDay = top(rows.map((row) => local(row.at).toLocaleDateString('en-CA')), 1)[0] ?? null
    const busiestMonth = period === 'year' ? top(rows.map((row) => String(local(row.at).getMonth())), 1)[0] ?? null : null
    const reviewed = db.prepare(`select n.title, count(*) n from review_log r join nuggets n on n.id = r.item_id where r.reviewed_at >= ? and r.reviewed_at < ?
      group by r.item_id order by n desc limit 1`).get(since, until) as { title: string; n: number } | undefined
    return {
      label: period === 'year' ? String(start.getFullYear()) : start.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
      captures: rows.length,
      words: rows.reduce((sum, row) => sum + plain(JSON.parse(row.body ?? 'null')).split(/\s+/).filter(Boolean).length, 0),
      busiestDay,
      busiestMonth: busiestMonth && { name: new Date(2000, Number(busiestMonth.name)).toLocaleString('en', { month: 'long' }), n: busiestMonth.n },
      tags: top(rows.flatMap((row) => tagsIn(`${row.title} ${plain(JSON.parse(row.body ?? 'null'))}`))),
      sources: top(rows.map((row) => row.attribution ?? '').filter(Boolean)),
      kept: rows.filter((row) => row.status === 'promoted').length,
      resolved: rows.filter((row) => row.status === 'resolved').length,
      discarded: rows.filter((row) => row.status === 'discarded').length,
      reviews: (db.prepare('select count(*) n from review_log where reviewed_at >= ? and reviewed_at < ?').get(since, until) as { n: number }).n,
      mostReviewed: reviewed ?? null
    }
  })

  // --- tasks
  const TASK = `id, number, title, status, due_at as dueAt, all_day as allDay, recurrence, origin_capture_id as captureId,
    created_at as createdAt, completed_at as completedAt, waiting_on as waitingOn, estimate, sort_order as sortOrder, repeat_until as repeatUntil,
    important, deadline_at as deadline, blocker, reschedules, notify, priority, plan_for as planFor`
  // Where an open task came from, for grouping by note: the capture it was
  // made from, or else the first thing linked to it.
  const FROM = `coalesce(origin_capture_id, (select item_id from task_links where task_id = tasks.id limit 1))`
  handle('tasks', () => db.prepare(`select ${TASK}, subtasks, ${FROM} as fromId,
    coalesce((select case when private then 'Private note' else ${LABEL} end from captures where id = ${FROM}), (select title from nuggets where id = ${FROM})) as fromTitle
    from tasks order by status, case priority when 0 then 5 else priority end, coalesce(sort_order, 1e12), due_at is null, due_at, created_at`).all()
    .map((row) => ({ ...(row as object), subtasks: JSON.parse(((row as { subtasks: string | null }).subtasks) ?? '[]') })))
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
  const TASK_COLUMNS = { title: 'title', recurrence: 'recurrence', waitingOn: 'waiting_on', estimate: 'estimate', sortOrder: 'sort_order', important: 'important', deadline: 'deadline_at', blocker: 'blocker', reschedules: 'reschedules', notify: 'notify', priority: 'priority', plan: 'plan_for' } as const
  handle('task:save', (id: string, patch: { title?: string; notes?: unknown; due?: string | null; recurrence?: string | null; status?: string; waitingOn?: string | null; subtasks?: unknown; estimate?: number | null; sortOrder?: number; important?: number; deadline?: string | null; blocker?: string | null; reschedules?: number; notify?: string | null; priority?: number; plan?: string | null }) => {
    for (const [key, column] of Object.entries(TASK_COLUMNS))
      if (patch[key as keyof typeof patch] !== undefined) db.prepare(`update tasks set ${column} = ? where id = ?`).run(patch[key as keyof typeof patch] as string | number | null, id)
    // Important and priority are one thing said two ways: Urgent and High are
    // important, and marking important is High unless it is Urgent already.
    if (patch.priority !== undefined) db.prepare('update tasks set important = ? where id = ?').run([1, 2].includes(patch.priority) ? 1 : 0, id)
    else if (patch.important !== undefined)
      db.prepare('update tasks set priority = case when ? then (case when priority in (1, 2) then priority else 2 end) else (case when priority in (1, 2) then 0 else priority end) end where id = ?').run(patch.important ? 1 : 0, id)
    // A day and a vaguer when do not sit together: the newer one wins.
    if (patch.plan) db.prepare('update tasks set due_at = null where id = ?').run(id)
    if (patch.due) db.prepare('update tasks set plan_for = null where id = ?').run(id)
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
  // It gives back what it was, so a routine ticked by mistake can be put back.
  const finish = (id: string, session: string | null = null): { dueAt: string | null; doneAt: string; notifiedAt: string | null } => {
    const task = db.prepare('select due_at, recurrence, repeat_until, notified_at from tasks where id = ?').get(id) as { due_at: string | null; recurrence: string | null; repeat_until: string | null; notified_at: string | null }
    const doneAt = now()
    const was = { dueAt: task.due_at, doneAt, notifiedAt: task.notified_at }
    db.prepare('insert into task_done (task_id, done_at, session_id) values (?, ?, ?)').run(id, doneAt, session)
    const close = (): typeof was => write((db.prepare("update tasks set status = 'done', completed_at = ? where id = ?").run(doneAt, id), was))
    if (!task.recurrence) return close()
    const fromToday = task.recurrence.includes('!') || !task.due_at
    // Counted from today, but at the time of day it had: "every! 3 days" at
    // 9 stays at 9, rather than taking the minute it was ticked.
    const base = new Date()
    if (fromToday && task.due_at) {
      const at = new Date(task.due_at)
      base.setHours(at.getHours(), at.getMinutes(), 0, 0)
    }
    let next = advance(fromToday ? base : new Date(task.due_at!), task.recurrence)
    while (next.getTime() < Date.now()) next = advance(next, task.recurrence)
    // Past its end, the series is over: this one was the last.
    if (task.repeat_until && next.toISOString() > task.repeat_until) return close()
    db.prepare('update tasks set due_at = ? where id = ?').run(next.toISOString(), id)
    return write(was)
  }
  handle('task:done', (id: string) => finish(id))
  // Done by mistake: open again, on the date it had, and that time it was
  // done no longer counted. The same for a one-off and a routine.
  handle('task:undone', (id: string, was: { dueAt: string | null; doneAt: string; notifiedAt: string | null }) => {
    db.prepare('delete from task_done where task_id = ? and done_at = ?').run(id, was.doneAt)
    db.prepare("update tasks set status = 'open', completed_at = null, due_at = ?, notified_at = ? where id = ?").run(was.dueAt, was.notifiedAt, id)
    return write(true)
  })
  // A task made by mistake, from wherever it was made: a new one goes with
  // its links; one it joined loses only the links this added. What was
  // resolved to make it is open again.
  handle('task:unmake', (id: string, existed: boolean, links: string[], reopen: string[]) => {
    if (existed) for (const item of links) db.prepare('delete from task_links where task_id = ? and item_id = ?').run(id, item)
    else for (const table of ['tasks where id', 'task_links where task_id', 'task_done where task_id']) db.prepare(`delete from ${table} = ?`).run(id)
    for (const capture of reopen) db.prepare("update captures set status = 'open' where id = ?").run(capture)
    return write(true)
  })
  // How many reviews fall on each of the days ahead, today with what is
  // late, so a week of tasks can be planned around the reviewing.
  handle('review:load', (days: number) => {
    const start = new Date().setHours(0, 0, 0, 0)
    const load = Array<number>(days).fill(0)
    const rows = db.prepare(`select due_at from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and superseded_by is null and (due_at is null or due_at < ?)`)
      .all(new Date(start + days * 86400000).toISOString()) as { due_at: string | null }[]
    for (const { due_at } of rows) load[Math.max(0, Math.floor((new Date(due_at ?? 0).setHours(0, 0, 0, 0) - start) / 86400000))] += 1
    return load
  })

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
    const meta = new Map((db.prepare('select tag, color, action, exam_at from tag_meta').all() as { tag: string; color: string | null; action: number; exam_at: string | null }[]).map((row) => [row.tag, row]))
    return [...counts].map(([tag, count]) => ({ tag, count, color: meta.get(tag)?.color ?? null, action: !!meta.get(tag)?.action, examAt: meta.get(tag)?.exam_at ?? null })).sort((a, b) => b.count - a.count)
  })
  handle('tag:meta', () => db.prepare('select tag, color, action from tag_meta').all())
  handle('tag:set', (tag: string, patch: { color?: string | null; action?: boolean; aliasOf?: string | null; examAt?: string | null }) => {
    db.prepare('insert or ignore into tag_meta (tag) values (?)').run(tag)
    if (patch.examAt !== undefined) db.prepare('update tag_meta set exam_at = ? where tag = ?').run(patch.examAt, tag)
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
    // A timer running is put away, not ended: it would count as a session.
    db.prepare("delete from sessions where task_id = '' and ended_at is null").run()
    db.prepare('update sessions set ended_at = ? where ended_at is null').run(now())
    const id = randomUUID()
    db.prepare('insert into sessions (id, task_id, started_at, goal, planned_ms) values (?, ?, ?, ?, ?)').run(id, taskId, now(), goal?.trim() || null, plannedMs ?? null)
    return write(id)
  })
  /** The session running now, with its task's name, for the floating timer. */
  handle('focus:now', () =>
    db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, 'Timer') as goal, s.started_at as startedAt, s.planned_ms as plannedMs,
      s.paused_ms as pausedMs, s.paused_at as pausedAt from sessions s left join tasks t on t.id = s.task_id
      where s.ended_at is null and (t.id is not null or s.task_id = '') order by s.started_at desc limit 1`).get() ?? null)
  // A timer from the box ("5m tea"): a session with no task behind it, so the
  // floating timer shows it as it shows any other. Ending it deletes it: a
  // kettle is not effort worth a record.
  // One timer at a time; a focus session running carries on underneath it.
  handle('timer:start', (goal: string, ms: number) => {
    db.prepare("delete from sessions where task_id = '' and ended_at is null").run()
    const id = randomUUID()
    db.prepare("insert into sessions (id, task_id, started_at, goal, planned_ms) values (?, '', ?, ?, ?)").run(id, now(), goal.trim() || null, ms)
    return write(id)
  })
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
    .prepare("select count(*) n from nuggets where coalesce(prompt, '') != '' and suspended = 0 and archived_at is null and (due_at is null or due_at <= ?)")
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
