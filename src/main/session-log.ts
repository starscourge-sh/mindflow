import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'

import { changed, database } from './captures'
import { cut } from './clip'

/**
 * A session's log: the thoughts, context and pictures added from the pill
 * while a focus session runs, each stamped with its moment. Kept against the
 * session, so once it ends they read as its timeline, in the task's log and
 * on the day's page.
 */

export type LogEntry = { id: string; sessionId: string; at: string; text: string; asset: string | null; assetName: string | null }

const ENTRY = 'l.id, l.session_id as sessionId, l.at, l.text, l.asset, l.asset_name as assetName'

export function registerSessionLog(): void {
  const db = database()
  db.exec(`create table if not exists session_log (
    id text primary key, session_id text not null, at text not null,
    text text not null default '', asset text, asset_name text)`)
  db.exec('create index if not exists session_log_session on session_log (session_id, at)')
  // A session called off leaves no record: nor do its thoughts.
  db.exec('delete from session_log where session_id not in (select id from sessions)')

  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))

  handle('session-log', (sessionId: string) =>
    db.prepare(`select ${ENTRY} from session_log l where l.session_id = ? order by l.at`).all(String(sessionId)))
  handle('session-log:add', (sessionId: string, text: string, asset?: string | null, assetName?: string | null) => {
    const words = String(text ?? '').trim()
    const file = typeof asset === 'string' && /^haligtree:\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset) ? asset : null
    if (!words && !file) return null
    if (!db.prepare('select 1 from sessions where id = ?').get(String(sessionId))) return null
    const entry = { id: randomUUID(), sessionId: String(sessionId), at: new Date().toISOString(), text: words, asset: file, assetName: file && assetName ? cut(String(assetName), 200) : null }
    db.prepare('insert into session_log (id, session_id, at, text, asset, asset_name) values (?, ?, ?, ?, ?, ?)').run(entry.id, entry.sessionId, entry.at, entry.text, entry.asset, entry.assetName)
    changed()
    return entry
  })
  handle('session-log:remove', (id: string) => {
    db.prepare('delete from session_log where id = ?').run(String(id))
    changed()
    return true
  })
  // Every session of a task, ended or not, with what was logged in it; its "Practise it" sessions too.
  handle('session-log:task', (taskId: string) =>
    db.prepare(`select ${ENTRY} from session_log l join sessions s on s.id = l.session_id where s.task_id = ?
      or s.practice_id in (select id from practices where task_id = ?) order by l.at`).all(String(taskId), String(taskId)))
  // The sessions that ended on a day (the local calendar's), each with its task and its log.
  handle('session-log:day', (day: string) => {
    // A bare session (no task) too: its line is where it is named after.
    const sessions = db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, 'Focus') as title, s.started_at as startedAt, s.ended_at as endedAt,
        s.paused_ms as pausedMs, s.recap, s.abandoned_at as abandonedAt, s.kind = 'focus' as bare from sessions s left join tasks t on t.id = s.task_id
        where s.ended_at is not null and (t.id is not null or s.kind = 'focus') and date(s.ended_at, 'localtime') = ? order by s.started_at`).all(String(day)) as { id: string }[]
    const entries = sessions.length
      ? (db.prepare(`select ${ENTRY} from session_log l where l.session_id in (${sessions.map(() => '?').join(',')}) order by l.at`).all(...sessions.map((one) => one.id)) as LogEntry[])
      : []
    return sessions.map((one) => ({ ...one, entries: entries.filter((entry) => entry.sessionId === one.id) }))
  })
  // The focus sessions that touch a stretch of time (a day, a week), running or
  // ended, for the day's timeline and the week: each with its task's name and
  // what it needs to say when it ends. Abandoned ones, breaks and timers are left out.
  handle('sessions:span', (from: string, to: string) =>
    db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title, 'Focus') as title, s.started_at as startedAt, s.ended_at as endedAt,
        s.planned_ms as plannedMs, s.paused_ms as pausedMs, s.paused_at as pausedAt from sessions s left join tasks t on t.id = s.task_id
        where (t.id is not null or s.kind = 'focus') and s.abandoned_at is null and s.started_at < ? and coalesce(s.ended_at, ?) >= ? order by s.started_at`)
      .all(String(to), new Date().toISOString(), String(from)))
}

/**
 * When a session with a length is due to end: its start, plus the time it
 * spent paused, plus its planned length. Null for one with no length.
 */
export const dueAt = (startedAt: string, pausedMs: number, plannedMs: number | null): number | null =>
  plannedMs ? new Date(startedAt).getTime() + pausedMs + plannedMs : null

/** What became of a session when the Mac slept in it, for the pill to say once it wakes. */
export type Slept = { id: string; goal: string; endedAt: string; sleptAt: string; timer: boolean; kind: string | null; how: 'asleep'; choice: 'abandon' | 'finish' }

/**
 * The Mac slept at `sleptAt` with something running: Settings says what that
 * means. "Finish" (the default) ends a session there,
 * counted up to that moment (or at its planned end, if that came first);
 * "Abandon" ends it there, kept in the log, counted toward nothing; "Do
 * nothing" leaves it on real time. A timer
 * or a break simply goes, as it does when stopped. Gives back what ended.
 */
export function sleptThrough(sleptAt: number, choice: 'nothing' | 'abandon' | 'finish'): Slept[] {
  if (choice !== 'abandon' && choice !== 'finish') return []
  const db = database()
  const rows = db.prepare(`select s.id, s.task_id, coalesce(s.goal, t.title, case s.kind when 'focus' then 'Focus' else 'Timer' end) as goal, s.started_at, s.planned_ms, s.paused_ms, s.paused_at, s.kind
      from sessions s left join tasks t on t.id = s.task_id where s.ended_at is null and s.started_at <= ?`).all(new Date(sleptAt).toISOString()) as
    { id: string; task_id: string; goal: string; started_at: string; planned_ms: number | null; paused_ms: number; paused_at: string | null; kind: string | null }[]
  const ended: Slept[] = []
  for (const row of rows) {
    const started = new Date(row.started_at).getTime()
    // Held paused at the time: the pause runs up to the end, so it is not counted.
    const held = row.paused_at ? Math.max(0, sleptAt - new Date(row.paused_at).getTime()) : 0
    const due = row.paused_at ? null : dueAt(row.started_at, row.paused_ms, row.planned_ms)
    const end = Math.max(started, choice === 'finish' && due !== null ? Math.min(due, sleptAt) : sleptAt)
    const at = new Date(end).toISOString()
    const timer = row.task_id === '' && row.kind !== 'focus'
    if (timer) db.prepare('delete from sessions where id = ?').run(row.id)
    else db.prepare('update sessions set ended_at = ?, abandoned_at = ?, paused_ms = paused_ms + ?, paused_at = null where id = ?').run(at, choice === 'abandon' ? at : null, held, row.id)
    ended.push({ id: row.id, goal: row.goal, endedAt: at, sleptAt: new Date(sleptAt).toISOString(), timer, kind: row.kind, how: 'asleep', choice })
  }
  if (ended.length) changed()
  return ended
}
