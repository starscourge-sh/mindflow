import { ipcMain } from 'electron'
import { database } from './captures'

/**
 * Stats read from what the book really keeps, never guessed (the user, 19 Nov: "i dont want fake metrics"). Each
 * says what it reads, so its card can say what counts:
 * - tasks: a task's day (`due_at`), when it was done (`completed_at`), when it was made (`created_at`), how often its
 *   day was changed (`reschedules`, one each change) and how many days it was carried past its day (`rollovers`).
 */
const median = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function registerStatsMore(): void {
  const db = database()
  // Tasks done in the last 30 days: on their day or before it, or after; how long done ones waited from being made;
  // and the open ones moved most.
  ipcMain.handle('haligtree:stats:tasks', () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const done = db.prepare(`select created_at as made, completed_at as at, due_at as due from tasks
      where status = 'done' and completed_at is not null and completed_at >= ? and recurrence is null`).all(since) as { made: string; at: string; due: string | null }[]
    const dated = done.filter((one) => one.due)
    const day = (iso: string): string => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    const onTime = dated.filter((one) => day(one.at) <= day(one.due!)).length
    const waited = median(done.map((one) => (Date.parse(one.at) - Date.parse(one.made)) / 86_400_000).filter((n) => n >= 0))
    const moved = db.prepare(`select id, title, reschedules, rollovers from tasks where status = 'open' and (reschedules + rollovers) >= 2
      order by (reschedules + rollovers) desc, created_at limit 6`).all() as { id: string; title: string; reschedules: number; rollovers: number }[]
    return { done: done.length, dated: dated.length, onTime, late: dated.length - onTime, waitedDays: waited, moved }
  })

  // Captures still in the Inbox (open, not archived), the ones there over a week, and how long the ones dealt with in
  // the last 30 days waited there: from `captured_at` to `exited_at`, when each left it.
  ipcMain.handle('haligtree:stats:captures', () => {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const month = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const waiting = (db.prepare("select count(*) n from captures where status = 'open' and archived_at is null").get() as { n: number }).n
    const old = (db.prepare("select count(*) n from captures where status = 'open' and archived_at is null and captured_at < ?").get(week) as { n: number }).n
    const sorted = db.prepare("select captured_at as at, exited_at as out from captures where exited_at is not null and exited_at >= ? and status != 'open'").all(month) as { at: string; out: string }[]
    return { waiting, old, sorted: sorted.length, waitedDays: median(sorted.map((one) => (Date.parse(one.out) - Date.parse(one.at)) / 86_400_000).filter((n) => n >= 0)) }
  })

  // Review: the cards forgotten most (`lapses` in each card's memory state: one each time it was forgotten after being
  // learnt), and how long cards are held (`stability`: the days until the chance of remembering one falls to 9 in 10).
  ipcMain.handle('haligtree:stats:remembering', () => {
    const cards = db.prepare(`select id, coalesce(nullif(prompt, ''), title) as name, json_extract(state, '$.lapses') as lapses, json_extract(state, '$.stability') as stability
      from nuggets where state is not null and json_valid(state) and json_extract(state, '$.reps') >= 1 and binned_at is null and archived_at is null`).all() as { id: string; name: string; lapses: number; stability: number }[]
    const missed = cards.filter((one) => one.lapses >= 2).sort((a, b) => b.lapses - a.lapses).slice(0, 6)
    return { cards: cards.length, heldDays: median(cards.map((one) => Number(one.stability)).filter((n) => Number.isFinite(n))), missed: missed.map(({ id, name, lapses }) => ({ id, name, lapses })) }
  })

  // Writing: pages started and never changed again after their first day (`created_at` and `updated_at` on one day),
  // two weeks old or more, not in the Bin.
  ipcMain.handle('haligtree:stats:untouched', () => {
    const before = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const pages = db.prepare(`select id, coalesce(nullif(trim(title), ''), label('', body)) as title, created_at as at from nuggets
      where tier = 'article' and binned_at is null and archived_at is null and created_at < ? and date(updated_at, 'localtime') = date(created_at, 'localtime')
      order by created_at desc`).all(before) as { id: string; title: string; at: string }[]
    const all = (db.prepare("select count(*) n from nuggets where tier = 'article' and binned_at is null and archived_at is null and created_at < ?").get(before) as { n: number }).n
    return { all, untouched: pages.length, pages: pages.slice(0, 6) }
  })

  // Goals: each open goal's steps (its logs, `glosses`) in each of the last four weeks, and its day.
  ipcMain.handle('haligtree:stats:goals', () => {
    const goals = db.prepare("select id, title, goal_at as day from nuggets where tier = 'goal' and closed_at is null and binned_at is null and archived_at is null order by goal_at is null, goal_at").all() as { id: string; title: string; day: string | null }[]
    const steps = db.prepare('select created_at as at from glosses where item_id = ? and created_at >= ?')
    const from = Date.now() - 28 * 86_400_000
    return goals.map((goal) => {
      const weeks = [0, 0, 0, 0]
      for (const one of steps.all(goal.id, new Date(from).toISOString()) as { at: string }[]) weeks[Math.min(3, Math.floor((Date.parse(one.at) - from) / (7 * 86_400_000)))] += 1
      return { ...goal, weeks }
    })
  })
}
