import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'

import { changed, database } from './captures'

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
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))

  handle('session-log', (sessionId: string) =>
    db.prepare(`select ${ENTRY} from session_log l where l.session_id = ? order by l.at`).all(String(sessionId)))
  handle('session-log:add', (sessionId: string, text: string, asset?: string | null, assetName?: string | null) => {
    const words = String(text ?? '').trim()
    const file = typeof asset === 'string' && /^mindflow:\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset) ? asset : null
    if (!words && !file) return null
    if (!db.prepare('select 1 from sessions where id = ?').get(String(sessionId))) return null
    const entry = { id: randomUUID(), sessionId: String(sessionId), at: new Date().toISOString(), text: words, asset: file, assetName: file && assetName ? String(assetName).slice(0, 200) : null }
    db.prepare('insert into session_log (id, session_id, at, text, asset, asset_name) values (?, ?, ?, ?, ?, ?)').run(entry.id, entry.sessionId, entry.at, entry.text, entry.asset, entry.assetName)
    changed()
    return entry
  })
  handle('session-log:remove', (id: string) => {
    db.prepare('delete from session_log where id = ?').run(String(id))
    changed()
    return true
  })
  // Every session of a task, ended or not, with what was logged in it.
  handle('session-log:task', (taskId: string) =>
    db.prepare(`select ${ENTRY} from session_log l join sessions s on s.id = l.session_id where s.task_id = ? order by l.at`).all(String(taskId)))
  // The sessions that ended on a day (the local calendar's), each with its task and its log.
  handle('session-log:day', (day: string) => {
    const sessions = db.prepare(`select s.id, s.task_id as taskId, coalesce(s.goal, t.title) as title, s.started_at as startedAt, s.ended_at as endedAt,
        s.paused_ms as pausedMs, s.recap, s.abandoned_at as abandonedAt from sessions s join tasks t on t.id = s.task_id
        where s.ended_at is not null and date(s.ended_at, 'localtime') = ? order by s.started_at`).all(String(day)) as { id: string }[]
    const entries = sessions.length
      ? (db.prepare(`select ${ENTRY} from session_log l where l.session_id in (${sessions.map(() => '?').join(',')}) order by l.at`).all(...sessions.map((one) => one.id)) as LogEntry[])
      : []
    return sessions.map((one) => ({ ...one, entries: entries.filter((entry) => entry.sessionId === one.id) }))
  })
}
