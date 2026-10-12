import { ipcMain } from 'electron'

import { database } from './captures'
import { focusStats, streaks, taskFocus, type BreakRow, type FocusRow } from './focus-numbers'

/**
 * The numbers behind how sessions went: one task's (its panel) and all of
 * them (Stats). Read from the sessions table as it is. Breaks were never
 * kept (a "Break" timer goes when it ends), so from now on each one leaves a
 * row behind as it goes: two triggers on the sessions table, nothing changed
 * in how a session or a timer is written.
 */

const ROW = `s.id, s.task_id as taskId, coalesce(s.goal, t.title, '') as title, s.started_at as startedAt, s.ended_at as endedAt,
  coalesce(s.paused_ms, 0) as pausedMs, s.planned_ms as plannedMs, s.abandoned_at as abandonedAt`

export function registerFocusStats(): void {
  const db = database()
  db.exec('create table if not exists focus_breaks (at text not null, ms integer not null)')
  // How long a break ran: to now, less its pauses, never past its own length (a "Time's up" left on screen is not more break).
  const ran = (until: string): string => `max(0, min(coalesce(old.planned_ms, 1e15),
    cast(round((julianday(${until}) - julianday(old.started_at)) * 86400000) as integer) - coalesce(old.paused_ms, 0)
    - case when old.paused_at is not null then cast(round((julianday(${until}) - julianday(old.paused_at)) * 86400000) as integer) else 0 end))`
  const isBreak = `old.task_id = '' and (lower(trim(coalesce(old.goal, ''))) in ('break', 'long break')
    or (case when json_valid(old.rounds) then json_extract(old.rounds, '$.phase') end) in ('break', 'long'))`
  db.exec(`create trigger if not exists focus_break_gone after delete on sessions when ${isBreak}
    begin insert into focus_breaks (at, ms) values (old.started_at, ${ran("'now'")}); end`)
  // A pomodoro set moving on from a break to its next round: one row, restarted.
  db.exec(`create trigger if not exists focus_break_next after update of rounds on sessions
    when ${isBreak} and new.started_at != old.started_at
    begin insert into focus_breaks (at, ms) values (old.started_at, ${ran('new.started_at')}); end`)

  const rows = (where: string, ...args: string[]): FocusRow[] =>
    db.prepare(`select ${ROW} from sessions s left join tasks t on t.id = s.task_id
      where s.task_id != '' and s.ended_at is not null ${where} order by s.started_at`).all(...args) as FocusRow[]

  ipcMain.handle('vigil:focus:task', (_event, taskId: string) => taskFocus(rows('and s.task_id = ?', String(taskId))))
  // The other things done again and again, for Stats: routines (their count this week and the best run going) and the reading queue.
  ipcMain.handle('vigil:habits:stats', () => {
    const local = (iso: string): string => { const at = new Date(iso); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
    const since = (days: number): string => new Date(Date.now() - days * 86400000).toISOString()
    const routines = db.prepare("select id, title from tasks where coalesce(recurrence, '') != '' and status = 'open'").all() as { id: string; title: string }[]
    const done = db.prepare("select d.task_id as id, d.done_at as at from task_done d join tasks t on t.id = d.task_id where coalesce(t.recurrence, '') != ''").all() as { id: string; at: string }[]
    let best: { title: string; run: number } | null = null
    for (const one of routines) {
      const run = streaks(new Set(done.filter((row) => row.id === one.id).map((row) => local(row.at))), local(new Date().toISOString())).now
      if (run > 1 && run > (best?.run ?? 0)) best = { title: one.title, run }
    }
    const week = since(7)
    const has = (db.prepare("select 1 from sqlite_master where type = 'table' and name = 'reading_queue'").get())
    const read = (from: string): number => has ? (db.prepare('select count(*) n from reading_queue where done_at >= ?').get(from) as { n: number }).n : 0
    return {
      routines: routines.length,
      doneWeek: done.filter((row) => row.at >= week).length,
      best,
      read30: read(since(30)),
      readAll: read('0')
    }
  })
  ipcMain.handle('vigil:focus:stats', () => focusStats(rows('and t.id is not null'), db.prepare('select at, ms from focus_breaks').all() as BreakRow[]))
}
