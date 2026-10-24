import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { LABEL, changed, database } from './captures'
import { dayKey } from './dates'
import { gate, plain } from './haligtree'
import { tagged } from './kinds'
import { practicesToTasks } from './properties'
import { DECLINES_TO_MOVE, HONEST_DAYS, bestHour, honestOf, logLine, minutesOf, minutesRun, nextProblem, offerDue, partOfDay, stageOf, type Stage } from './practice-rules'

/**
 * Practices: things that repeat with no end (reading, design patterns, a
 * LeetCode problem, Spanish). Unlike a task, a practice has no backlog and is
 * never overdue. At its time it is offered once, gently, for 5 minutes; it
 * never starts by itself. A practice session is a focus session (task_id '',
 * kind 'focus') with `practice_id` set, so it is logged and counted as any
 * session is. Every channel starts `haligtree:`.
 */

export type LoadKind = 'tag' | 'source' | 'queue' | 'problems'
export type Practice = {
  id: string
  name: string
  /** Days of the week it is offered, 0 for Sunday. */
  days: number[]
  /** "HH:MM", the offer's time. */
  at: string
  targetMin: number
  /** What it opens with: a tag, a source ("medium:Clean Code"), the reading queue, or a note of problems. */
  loadKind: LoadKind | null
  load: string | null
}
export type PracticeRow = Practice & {
  runs: number
  /** "Planned 30 a day, averaging 22 over the last 2 weeks": from the first session on. */
  honest: { planned: number; average: number; days: number } | null
  /** Declined again and again at one time: a time that seems to suit you, to move it to. */
  suggest: { from: string; to: string; part: string } | null
  ranToday: boolean
}
export type Offer = { id: string; name: string; at: string; later: boolean; suggest: PracticeRow['suggest'] }
export type Loaded = {
  tag: string | null
  gems: { id: string; title: string }[]
  cards: { id: string; title: string; prompt: string }[]
  draft: { id: string; title: string } | null
  source: { field: string; name: string; spot: string | null; recent: { type: string; id: string; label: string; location: string | null }[] } | null
  queue: { type: string; id: string; title: string } | null
  problem: { text: string; index: number; total: number; noteType: string; noteId: string; noteTitle: string } | null
  lastNote: string | null
}
export type Ended = { minutes: number; stage: Stage; target: number; name: string; line: string }

const now = (): string => new Date().toISOString()
const cut = (text: string, n: number): string => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
type Row = { id: string; name: string; days: string; at: string; target_min: number; load_kind: string | null; load: string | null; created_at: string; skipped_on: string | null; later_at: string | null; problem_at: number; last_note: string | null; kept_time_at: string | null }
const asPractice = (row: Row): Practice => {
  let days: number[] = []
  try {
    days = (JSON.parse(row.days) as number[]).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  } catch {
    days = [0, 1, 2, 3, 4, 5, 6]
  }
  return { id: row.id, name: row.name, days, at: row.at, targetMin: row.target_min, loadKind: (row.load_kind as LoadKind) || null, load: row.load || null }
}

let told: ((offer: Offer) => void) | null = null
/** Said once a new offer is up, so the main process can bring the bubble (or the nudge card) up for it. */
export const whenPracticeOffer = (tell: (offer: Offer) => void): void => void (told = tell)

/** The practices in the Bin, for the Bin's list (haligtree.ts). */
export const practicesInBin = (): { type: string; id: string; title: string; kind: string; at: string }[] =>
  database().prepare("select 'practice' as type, id, name as title, 'practice' as kind, binned_at as at from practices where binned_at is not null").all() as never
export const practiceToBin = (id: string): boolean => database().prepare('update practices set binned_at = ? where id = ? and binned_at is null').run(now(), id).changes > 0
export const practiceFromBin = (id: string): boolean => database().prepare('update practices set binned_at = null where id = ? and binned_at is not null').run(id).changes > 0
/** Let go for good: only one in the Bin. Its sessions stay, as any session's do. */
export const forgetPractices = (id?: string): number =>
  Number((id ? database().prepare('delete from practices where id = ? and binned_at is not null').run(id) : database().prepare('delete from practices where binned_at is not null').run()).changes)

export function registerPractices(): void {
  const db = database()
  db.exec(`create table if not exists practices (
    id text primary key, name text not null, days text not null default '[0,1,2,3,4,5,6]', at text not null default '21:00',
    target_min integer not null default 30, load_kind text, load text, created_at text not null, binned_at text,
    skipped_on text, later_at text, problem_at integer not null default 0, last_note text, kept_time_at text
  );
  create table if not exists practice_declines (practice_id text not null, at text not null, slot text not null);
  create index if not exists practice_declines_by on practice_declines (practice_id, at)`)
  // A practice is a repeating task with "Practise it" on: this row holds the
  // switch's settings (material, minutes, the offer's answers) for its task.
  try {
    db.exec('alter table practices add column task_id text')
  } catch {
    // Already there.
  }
  // The switch turned off: kept, with its log, until it is turned on again.
  try {
    db.exec('alter table practices add column off integer not null default 0')
  } catch {
    // Already there.
  }
  practicesToTasks(db)
  if (!(db.prepare('pragma table_info(sessions)').all() as { name: string }[]).some((one) => one.name === 'practice_id')) {
    db.exec('alter table sessions add column practice_id text')
    // The log line, once written: a session ended anywhere (⌘K, sleep, away) gets its line too.
    db.exec('alter table sessions add column practice_logged integer')
  }
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))
  // Practices change only practice views: never every list of notes.
  const tell = (): void => changed({ kind: 'item', id: 'practices' })
  const write = <T>(result: T): T => (tell(), result)

  // Its name, days and time are its task's: change the task's repeat or time and the offer follows.
  // A task in the Bin, done, put off to a later day, or no longer repeating is not offered.
  const FROM = `select p.*, t.title as task_title, t.due_at as task_due, t.all_day as task_all_day, t.recurrence as task_rule from practices p join tasks t on t.id = p.task_id
    where p.binned_at is null and p.off = 0 and t.status not in ('dropped', 'done') and t.recurrence is not null and coalesce(t.snoozed_until, '') < date('now', 'localtime')`
  const fromTask = (row: Row & { task_title?: string; task_due?: string | null; task_all_day?: number; task_rule?: string | null }): Row => {
    const due = row.task_due ? new Date(row.task_due) : null
    // A routine with no time of day ("every day") is offered at the practice's own time (9pm), never at midnight.
    const at = due && !Number.isNaN(due.getTime()) && !row.task_all_day ? `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}` : row.at
    return { ...row, name: row.task_title || row.name, at, days: JSON.stringify(ruleDays(row.task_rule ?? null, due)) }
  }
  const rows = (): Row[] => (db.prepare(`${FROM} order by p.at, p.created_at`).all() as Row[]).map(fromTask).sort((a, b) => a.at.localeCompare(b.at))
  const one = (id: string): Row | undefined => {
    const row = db.prepare(`${FROM} and p.id = ?`).get(String(id)) as Row | undefined
    return row && fromTask(row)
  }
  const ranToday = (id: string): boolean => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return !!db.prepare('select 1 from sessions where practice_id = ? and started_at >= ? and abandoned_at is null').get(id, start.toISOString())
  }

  /** The hours you are usually about: opening the app, writing in it, sessions, the last six weeks. */
  const activeHours = (): number[] => {
    const since = new Date(Date.now() - 42 * 86_400_000).toISOString()
    const hours = (sql: string): number[] => (db.prepare(sql).all(since) as { at: string }[]).map((row) => new Date(row.at).getHours())
    return [
      ...hours('select opened_at as at from app_opens where opened_at >= ?'),
      ...hours('select captured_at as at from captures where captured_at >= ?'),
      ...hours('select started_at as at from sessions where started_at >= ?')
    ]
  }
  const suggestFor = (row: Row): PracticeRow['suggest'] => {
    const last = db.prepare('select max(started_at) at from sessions where practice_id = ?').get(row.id) as { at: string | null }
    const after = [row.created_at, last.at ?? '', row.kept_time_at ?? ''].sort().at(-1)!
    const declines = (db.prepare('select count(*) n from practice_declines where practice_id = ? and slot = ? and at > ?').get(row.id, row.at, after) as { n: number }).n
    if (declines < DECLINES_TO_MOVE) return null
    const hour = bestHour(activeHours(), Math.floor(minutesOf(row.at) / 60))
    return hour === null ? null : { from: row.at, to: `${String(hour).padStart(2, '0')}:00`, part: partOfDay(hour) }
  }
  const honestFor = (row: Row): PracticeRow['honest'] => {
    const since = new Date(Date.now() - (HONEST_DAYS + 1) * 86_400_000).toISOString()
    const ended = db.prepare('select started_at, ended_at, paused_ms from sessions where practice_id = ? and ended_at is not null and abandoned_at is null and started_at >= ?').all(row.id, since) as { started_at: string; ended_at: string; paused_ms: number }[]
    return honestOf(ended.map((one) => ({ startedAt: one.started_at, minutes: minutesRun(one.started_at, one.ended_at, one.paused_ms) })), { days: asPractice(row).days, targetMin: row.target_min, createdAt: row.created_at })
  }
  const listed = (): PracticeRow[] => rows().map((row) => ({
    ...asPractice(row),
    runs: (db.prepare('select count(*) n from sessions where practice_id = ? and ended_at is not null and abandoned_at is null').get(row.id) as { n: number }).n,
    honest: honestFor(row),
    suggest: suggestFor(row),
    ranToday: ranToday(row.id)
  }))
  handle('practices:list', () => listed())

  handle('practices:save', (raw: Partial<Practice> & { id?: string }) => {
    const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim()
    if (!name) return null
    const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [0, 1, 2, 3, 4, 5, 6]
    const at = /^\d{2}:\d{2}$/.test(String(raw.at ?? '')) ? String(raw.at) : '21:00'
    const target = Math.min(240, Math.max(5, Math.round(Number(raw.targetMin) || 30)))
    const kind = (['tag', 'source', 'queue', 'problems'] as const).find((one) => one === raw.loadKind) ?? null
    const load = kind && kind !== 'queue' ? String(raw.load ?? '').trim().replace(kind === 'tag' ? /^#/ : /^$/, '') || null : null
    if (raw.id && one(raw.id)) {
      db.prepare('update practices set name = ?, days = ?, at = ?, target_min = ?, load_kind = ?, load = ? where id = ?').run(cut(name, 120), JSON.stringify(days), at, target, kind, load, raw.id)
      return write(raw.id)
    }
    const id = randomUUID()
    db.prepare('insert into practices (id, name, days, at, target_min, load_kind, load, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(id, cut(name, 120), JSON.stringify(days), at, target, kind, load, now())
    // Made as a repeating task with "Practise it" on, as every practice is now.
    practicesToTasks(db)
    return write(id)
  })
  // --- "Practise it" on a repeating task: its practice's settings, or none.
  type Switch = { on: boolean; id: string | null; targetMin: number; loadKind: LoadKind | null; load: string | null; runs: number; lastNote: string | null; honest: PracticeRow['honest'] }
  const switchOf = (task: string): Switch => {
    const row = db.prepare('select * from practices where task_id = ? and binned_at is null order by created_at limit 1').get(String(task)) as (Row & { off: number }) | undefined
    if (!row) return { on: false, id: null, targetMin: 30, loadKind: null, load: null, runs: 0, lastNote: null, honest: null }
    const runs = (db.prepare('select count(*) n from sessions where practice_id = ? and ended_at is not null and abandoned_at is null').get(row.id) as { n: number }).n
    const live = !row.off ? one(row.id) : undefined
    return { on: !row.off, id: row.id, targetMin: row.target_min, loadKind: (row.load_kind as LoadKind) || null, load: row.load || null, runs, lastNote: row.last_note, honest: live ? honestFor(live) : null }
  }
  handle('practices:of-task', (task: string) => switchOf(task))
  // On, off, or its material and minutes changed. Turned off, it keeps everything for when it is on again.
  handle('practices:set', (task: string, patch: { on?: boolean; targetMin?: number; loadKind?: LoadKind | null; load?: string | null }) => {
    const owner = db.prepare('select title, recurrence from tasks where id = ?').get(String(task)) as { title: string; recurrence: string | null } | undefined
    if (!owner) return write(switchOf(task))
    let id = switchOf(task).id
    if (!id) {
      id = randomUUID()
      db.prepare('insert into practices (id, name, created_at, task_id, off) values (?, ?, ?, ?, 1)').run(id, cut(owner.title, 120), now(), String(task))
    }
    if (patch.on !== undefined) db.prepare('update practices set off = ? where id = ?').run(patch.on ? 0 : 1, id)
    if (patch.targetMin !== undefined) db.prepare('update practices set target_min = ? where id = ?').run(Math.min(240, Math.max(5, Math.round(Number(patch.targetMin) || 30))), id)
    if (patch.loadKind !== undefined) {
      const kind = (['tag', 'source', 'queue', 'problems'] as const).find((one) => one === patch.loadKind) ?? null
      const load = kind && kind !== 'queue' ? String(patch.load ?? '').trim().replace(kind === 'tag' ? /^#/ : /^$/, '') || null : null
      db.prepare('update practices set load_kind = ?, load = ? where id = ?').run(kind, load, id)
    }
    lastOffer = null
    return write(switchOf(task))
  })
  handle('practices:bin', (id: string) => write(practiceToBin(String(id))))
  handle('practices:unbin', (id: string) => write(practiceFromBin(String(id))))

  // --- the offer: one at a time, never in quiet hours (nor safe mode) or while a session or timer runs.
  const offerNow = (): Offer | null => {
    const { blackout, hidePrivate } = gate()
    if (blackout || hidePrivate) return null
    if (db.prepare('select 1 from sessions where ended_at is null').get()) return null
    const today = dayKey()
    for (const row of rows()) {
      const p = asPractice(row)
      const later = row.later_at ? Date.parse(row.later_at) : null
      if (offerDue(p, new Date(), { ranToday: ranToday(row.id), skippedToday: row.skipped_on === today, laterAt: later })) return { id: row.id, name: row.name, at: row.at, later: later !== null, suggest: suggestFor(row) }
    }
    return null
  }
  handle('practices:offer', () => offerNow())
  // "Not tonight": gone until its next day, nothing owed. "In 30 min": asked once more then.
  handle('practices:answer', (id: string, answer: 'skip' | 'later') => {
    const row = one(id)
    if (!row) return write(false)
    if (answer === 'later') db.prepare('update practices set later_at = ? where id = ?').run(new Date(Date.now() + 30 * 60_000).toISOString(), id)
    else {
      db.prepare('update practices set skipped_on = ?, later_at = null where id = ?').run(dayKey(), id)
      db.prepare('insert into practice_declines (practice_id, at, slot) values (?, ?, ?)').run(id, now(), row.at)
    }
    lastOffer = null
    return write(true)
  })
  // Undo of either answer: offered again as before, the decline not counted.
  handle('practices:unanswer', (id: string) => {
    db.prepare('update practices set skipped_on = null, later_at = null where id = ?').run(id)
    db.prepare('delete from practice_declines where rowid = (select max(rowid) from practice_declines where practice_id = ? and at >= ?)').run(id, new Date(Date.now() - 10 * 60_000).toISOString())
    lastOffer = null
    // Up again at once, not at the next half minute.
    setTimeout(tick, 50)
    return write(true)
  })
  // Moved to the time that suits you, or kept where it is: either way the count of skips starts again.
  handle('practices:move', (id: string, at: string | null) => {
    if (at && /^\d{2}:\d{2}$/.test(at)) {
      db.prepare('update practices set at = ?, kept_time_at = ? where id = ?').run(at, now(), id)
      // Its time is its task's: the task moves too, or the offer would stay where it was.
      const task = db.prepare('select t.id, t.due_at, t.all_day from practices p join tasks t on t.id = p.task_id where p.id = ?').get(id) as { id: string; due_at: string | null; all_day: number } | undefined
      const due = task?.due_at ? new Date(task.due_at) : null
      if (task && due && !Number.isNaN(due.getTime()) && !task.all_day) {
        due.setHours(minutesOf(at) / 60 | 0, minutesOf(at) % 60, 0, 0)
        db.prepare('update tasks set due_at = ? where id = ?').run(due.toISOString(), task.id)
        changed()
      }
    } else db.prepare('update practices set kept_time_at = ? where id = ?').run(now(), id)
    return write(true)
  })

  // --- running one: a focus session with the practice on it, open-ended (it never stops you).
  handle('practices:start', (id: string) => {
    const row = one(id)
    if (!row) return null
    const at = now()
    // Starting it ends a session running, kept; a timer from the box carries on underneath.
    db.prepare("update sessions set ended_at = ? where ended_at is null and (task_id != '' or kind = 'focus')").run(at)
    const session = randomUUID()
    db.prepare("insert into sessions (id, task_id, started_at, goal, planned_ms, kind, practice_id) values (?, '', ?, ?, null, 'focus', ?)").run(session, at, row.name, row.id)
    db.prepare('update practices set later_at = null where id = ?').run(id)
    lastOffer = null
    changed()
    return session
  })
  // Nobody at the Mac for a few minutes: paused from when they left, so those minutes never count.
  handle('practices:idle', (session: string, since: string) => {
    const at = Date.parse(since)
    if (!Number.isFinite(at)) return false
    // Never from before it started: away since before then is away since the start.
    const row = db.prepare('select started_at from sessions where id = ?').get(session) as { started_at: string } | undefined
    const from = Math.max(Date.parse(row?.started_at ?? '') || at, Math.min(at, Date.now()))
    const done = db.prepare('update sessions set paused_at = ? where id = ? and ended_at is null and paused_at is null and practice_id is not null').run(new Date(from).toISOString(), session).changes > 0
    if (done) changed()
    return done
  })

  /** The log line, written once, and the problem list moved on; what it came to. */
  const logEnded = (session: string): Ended | null => {
    const row = db.prepare('select s.id, s.started_at, s.ended_at, s.paused_ms, s.abandoned_at, s.practice_logged, coalesce(t.title, p.name) as name, p.target_min, p.load_kind, p.id as pid from sessions s join practices p on p.id = s.practice_id left join tasks t on t.id = p.task_id where s.id = ?').get(session) as
      { id: string; started_at: string; ended_at: string | null; paused_ms: number; abandoned_at: string | null; practice_logged: number | null; name: string; target_min: number; load_kind: string | null; pid: string } | undefined
    if (!row?.ended_at) return null
    const minutes = minutesRun(row.started_at, row.ended_at, row.paused_ms)
    const line = logLine(row.name, minutes)
    const said = { minutes: Math.max(1, Math.round(minutes)), stage: stageOf(minutes, row.target_min), target: row.target_min, name: row.name, line }
    if (row.practice_logged || row.abandoned_at) return said
    db.prepare('insert into session_log (id, session_id, at, text, asset, asset_name) values (?, ?, ?, ?, null, null)').run(randomUUID(), row.id, row.ended_at, line)
    db.prepare('update sessions set practice_logged = 1 where id = ?').run(row.id)
    if (row.load_kind === 'problems' && said.stage !== 'partial') db.prepare('update practices set problem_at = problem_at + 1 where id = ?').run(row.pid)
    return said
  }
  // Stopped from the pill: ended (pauses up to now left out) and logged in one step.
  handle('practices:end', (session: string) => {
    const at = now()
    db.prepare('update sessions set ended_at = ?, paused_ms = paused_ms + coalesce(round((julianday(?) - julianday(paused_at)) * 86400000), 0), paused_at = null where id = ? and ended_at is null').run(at, at, session)
    const ended = logEnded(session)
    changed()
    return ended
  })
  // "What stuck?": answered, it is a gem (on the practice's tag, so the next session brings it), the session's recap and last time's note.
  handle('practices:stuck', (session: string, text: string) => {
    const words = String(text ?? '').trim()
    if (!words) return null
    const row = db.prepare('select p.id, p.load_kind, p.load from sessions s join practices p on p.id = s.practice_id where s.id = ?').get(session) as { id: string; load_kind: string | null; load: string | null } | undefined
    if (!row) return null
    const id = randomUUID()
    const body = row.load_kind === 'tag' && row.load && !tagged(words, row.load) ? `${words} #${row.load}` : words
    db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(id, cut(words.split('\n')[0], 120), JSON.stringify(body), now(), now())
    db.prepare('update sessions set recap = ? where id = ?').run(words, session)
    db.prepare('update practices set last_note = ? where id = ?').run(words, row.id)
    changed()
    return id
  })
  handle('practices:unstuck', (gem: string, session: string) => {
    db.prepare('delete from nuggets where id = ?').run(gem)
    db.prepare("update sessions set recap = null where id = ?").run(session)
    changed()
    return true
  })

  // --- what a session opens with: your material, so there is nothing to decide.
  handle('practices:load', (id: string): Loaded | null => {
    const row = one(id)
    if (!row) return null
    const out: Loaded = { tag: null, gems: [], cards: [], draft: null, source: null, queue: null, problem: null, lastNote: row.last_note }
    if (!out.lastNote) out.lastNote = (db.prepare("select recap from sessions where practice_id = ? and coalesce(recap, '') != '' order by started_at desc limit 1").get(id) as { recap: string } | undefined)?.recap ?? null
    if (row.load_kind === 'tag' && row.load) {
      const tag = row.load.toLowerCase()
      out.tag = tag
      const on = (r: { title: string | null; body: string | null; prompt?: string | null }): boolean => tagged(`${r.title ?? ''} ${r.prompt ?? ''} ${r.body ?? ''}`, tag) || tagged(plain(safe(r.body)), tag)
      const nuggets = db.prepare("select id, tier, title, body, prompt, due_at, updated_at, created_at from nuggets where binned_at is null and archived_at is null and private = 0 and body like ? escape '\\' order by coalesce(updated_at, created_at) desc").all(`%#${tag.replace(/[\\%_]/g, '\\$&')}%`) as
        { id: string; tier: string; title: string | null; body: string | null; prompt: string | null; due_at: string | null }[]
      const mine = nuggets.filter(on)
      out.gems = mine.filter((one) => one.tier === 'nugget' && !one.prompt).slice(0, 5).map((one) => ({ id: one.id, title: one.title || cut(plain(safe(one.body)), 80) }))
      out.cards = mine.filter((one) => !!one.prompt && (!one.due_at || Date.parse(one.due_at) <= Date.now())).slice(0, 5).map((one) => ({ id: one.id, title: one.title || '', prompt: one.prompt! }))
      const draft = mine.find((one) => one.tier === 'article')
      out.draft = draft ? { id: draft.id, title: draft.title || cut(plain(safe(draft.body)), 80) || 'Untitled' } : null
    }
    if (row.load_kind === 'source' && row.load) {
      const field = row.load.startsWith('attribution:') ? 'attribution' : 'medium'
      const name = row.load.replace(/^(attribution|medium):/, '')
      const items = [
        ...db.prepare(`select 'capture' as type, id, ${LABEL} as label, fields, captured_at as at from captures where status != 'discarded' and lower(trim(${field})) = lower(?)`).all(name),
        ...db.prepare(`select tier as type, id, coalesce(nullif(title, ''), label('', body)) as label, fields, created_at as at from nuggets where binned_at is null and lower(trim(${field})) = lower(?)`).all(name)
      ] as { type: string; id: string; label: string; fields: string | null; at: string }[]
      const spotOf = (fields: string | null): string | null => {
        try {
          const kept = JSON.parse(fields ?? '{}') as { location?: unknown }
          return typeof kept.location === 'string' && kept.location.trim() ? kept.location.trim() : null
        } catch {
          return null
        }
      }
      const recent = items.sort((a, b) => b.at.localeCompare(a.at)).map((one) => ({ type: one.type, id: one.id, label: one.label, location: spotOf(one.fields) }))
      out.source = { field, name, spot: recent.find((one) => one.location)?.location ?? null, recent: recent.slice(0, 4) }
    }
    if (row.load_kind === 'queue') {
      const next = db.prepare('select item_type as type, item_id as id from reading_queue where done_at is null order by position limit 1').get() as { type: string; id: string } | undefined
      if (next) {
        const title = next.type === 'capture'
          ? (db.prepare(`select ${LABEL} as t from captures where id = ?`).get(next.id) as { t: string } | undefined)?.t
          : (db.prepare("select coalesce(nullif(title, ''), label('', body)) as t from nuggets where id = ?").get(next.id) as { t: string } | undefined)?.t
        out.queue = { ...next, title: title || 'Untitled' }
      }
    }
    if (row.load_kind === 'problems' && row.load) {
      const capture = db.prepare(`select 'capture' as type, body, ${LABEL} as title from captures where id = ?`).get(row.load) as { type: string; body: string | null; title: string } | undefined
      const note = capture ?? (db.prepare("select tier as type, body, coalesce(nullif(title, ''), label('', body)) as title from nuggets where id = ?").get(row.load) as { type: string; body: string | null; title: string } | undefined)
      const next = note ? nextProblem(safe(note.body), row.problem_at) : null
      if (note && next) out.problem = { ...next, noteType: note.type, noteId: row.load, noteTitle: note.title }
    }
    return out
  })
  // An excerpt kept from the session's source: where in it, so next time opens at that spot.
  handle('practices:spot', (capture: string, page: string) => {
    const spot = String(page ?? '').trim()
    if (!spot) return false
    const row = db.prepare('select fields from captures where id = ?').get(capture) as { fields: string | null } | undefined
    if (!row) return false
    let kept: Record<string, unknown> = {}
    try { kept = JSON.parse(row.fields ?? '{}') as Record<string, unknown> } catch { /* Unreadable: written fresh. */ }
    db.prepare('update captures set fields = ? where id = ?').run(JSON.stringify({ ...kept, location: spot }), capture)
    changed()
    return true
  })

  // --- every half minute: an offer up (said once), and any practice ended elsewhere given its log line.
  let lastOffer: string | null = null
  const tick = (): Offer | null => {
    for (const row of db.prepare('select id from sessions where practice_id is not null and ended_at is not null and practice_logged is null and abandoned_at is null').all() as { id: string }[]) logEnded(row.id)
    const offer = offerNow()
    const key = offer ? `${offer.id}:${dayKey()}:${offer.later}` : null
    if (key !== lastOffer) {
      lastOffer = key
      tell()
      if (offer) told?.(offer)
    }
    return offer
  }
  setInterval(tick, 30_000)
  setTimeout(tick, 4000)
  // For the QA runs: looked at now rather than within half a minute.
  handle('practices:check', () => tick())
}

/**
 * The days a repeating task comes on, for its practice's offer: named days,
 * every day or every weekday; any other repeat (every 2 weeks, monthly) on
 * the weekday it is next due.
 */
export function ruleDays(rule: string | null, due: Date | null): number[] {
  const said = (rule ?? '').toLowerCase()
  if (/\bweekday/.test(said)) return [1, 2, 3, 4, 5]
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const named = [...new Set([...said.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)/g)].map((match) => names.indexOf(match[1])))]
  if (named.length) return named.sort()
  if (/^every\s+(1\s+)?day/.test(said)) return [0, 1, 2, 3, 4, 5, 6]
  return due && !Number.isNaN(due.getTime()) ? [due.getDay()] : [0, 1, 2, 3, 4, 5, 6]
}

function safe(body: string | null): unknown {
  try {
    return JSON.parse(body ?? 'null')
  } catch {
    return body
  }
}
