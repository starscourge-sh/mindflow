import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { LABEL, changed, database } from './captures'
import { dayKey } from './dates'
import { gate, plain } from './vigil'
import { tagged } from './kinds'
import { DECLINES_TO_MOVE, HONEST_AFTER_DAYS, bestHour, logLine, minutesOf, minutesRun, nextProblem, offerDue, partOfDay, stageOf, type Stage } from './practice-rules'

/**
 * Practices: things that repeat with no end (reading, design patterns, a
 * LeetCode problem, Spanish). Unlike a task, a practice has no backlog and is
 * never overdue. At its time it is offered once, gently, for 5 minutes; it
 * never starts by itself. A practice session is a focus session (task_id '',
 * kind 'focus') with `practice_id` set, so it is logged and counted as any
 * session is. Every channel starts `vigil:`.
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
  /** "planned 30, averaging 22": only after a few weeks of it. */
  honest: { planned: number; average: number } | null
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

/** The practices in the Bin, for the Bin's list (vigil.ts). */
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
  if (!(db.prepare('pragma table_info(sessions)').all() as { name: string }[]).some((one) => one.name === 'practice_id')) {
    db.exec('alter table sessions add column practice_id text')
    // The log line, once written: a session ended anywhere (⌘K, sleep, away) gets its line too.
    db.exec('alter table sessions add column practice_logged integer')
  }
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))
  // Practices change only practice views: never every list of notes.
  const tell = (): void => changed({ kind: 'item', id: 'practices' })
  const write = <T>(result: T): T => (tell(), result)

  const rows = (): Row[] => db.prepare('select * from practices where binned_at is null order by at, created_at').all() as Row[]
  const one = (id: string): Row | undefined => db.prepare('select * from practices where id = ? and binned_at is null').get(String(id)) as Row | undefined
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
    const ended = db.prepare('select started_at, ended_at, paused_ms from sessions where practice_id = ? and ended_at is not null and abandoned_at is null order by started_at').all(row.id) as { started_at: string; ended_at: string; paused_ms: number }[]
    if (ended.length < 3 || Date.now() - Date.parse(ended[0].started_at) < HONEST_AFTER_DAYS * 86_400_000) return null
    const month = ended.filter((one) => Date.now() - Date.parse(one.started_at) <= 28 * 86_400_000)
    const counted = month.length ? month : ended
    const average = counted.reduce((sum, one) => sum + minutesRun(one.started_at, one.ended_at, one.paused_ms), 0) / counted.length
    return { planned: row.target_min, average: Math.round(average) }
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
    return write(id)
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
    if (at && /^\d{2}:\d{2}$/.test(at)) db.prepare('update practices set at = ?, kept_time_at = ? where id = ?').run(at, now(), id)
    else db.prepare('update practices set kept_time_at = ? where id = ?').run(now(), id)
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
    const row = db.prepare('select s.id, s.started_at, s.ended_at, s.paused_ms, s.abandoned_at, s.practice_logged, p.name, p.target_min, p.load_kind, p.id as pid from sessions s join practices p on p.id = s.practice_id where s.id = ?').get(session) as
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

function safe(body: string | null): unknown {
  try {
    return JSON.parse(body ?? 'null')
  } catch {
    return body
  }
}
