import { ipcMain } from 'electron'

import { database } from './captures'
import { dayKey } from './dates'

/**
 * How you use the main window, counted on this Mac only and never sent
 * anywhere: which pages you open, and how you found what you opened (⌘K, the
 * sidebar, a link, a search, Home, Back or Forward, a notification, quick
 * capture). One row per day for each page and each way, holding a count, so
 * the table stays small however long it is used: never a list of every click.
 * Rows older than about a year and a half are let go. Stats reads the last 30
 * days ("Pages you open most", "How you find things").
 */

/** The ways in. "window": a sticky, a note's own window, the menu bar or the Dock. "other": a button on a page. */
export const WAYS = ['palette', 'sidebar', 'keys', 'link', 'search', 'home', 'back', 'notification', 'capture', 'window', 'other'] as const
export type Via = (typeof WAYS)[number]

export type Usage = { days: number; since: string | null; pages: { what: string; n: number }[]; ways: { what: string; n: number }[] }

export function registerUsage(): void {
  const db = database()
  db.exec('create table if not exists usage_counts (day text not null, kind text not null, what text not null, n integer not null default 0, primary key (day, kind, what))')
  db.prepare('delete from usage_counts where day < ?').run(dayKey(new Date(Date.now() - 550 * 86_400_000)))
  const add = db.prepare('insert into usage_counts (day, kind, what, n) values (?, ?, ?, 1) on conflict (day, kind, what) do update set n = n + 1')

  // One page opened (`page` null when only the way is counted: the same page, another note on it), and how.
  ipcMain.handle('vigil:usage:count', (_event, page: unknown, way: unknown) => {
    const day = dayKey(new Date())
    const how: Via = WAYS.includes(way as Via) ? (way as Via) : 'other'
    if (typeof page === 'string' && page && page.length < 80) add.run(day, 'page', page)
    add.run(day, 'way', how)
  })
  // The last `days` days, summed: each page and each way with its count, most first.
  ipcMain.handle('vigil:usage', (_event, days: unknown = 30): Usage => {
    const span = Math.max(1, Math.min(400, Number(days) || 30))
    const from = dayKey(new Date(Date.now() - (span - 1) * 86_400_000))
    const sum = (kind: string): { what: string; n: number }[] =>
      db.prepare('select what, sum(n) as n from usage_counts where kind = ? and day >= ? group by what order by n desc, what').all(kind, from) as { what: string; n: number }[]
    const first = db.prepare('select min(day) as day from usage_counts').get() as { day: string | null }
    return { days: span, since: first.day, pages: sum('page'), ways: sum('way') }
  })
}
