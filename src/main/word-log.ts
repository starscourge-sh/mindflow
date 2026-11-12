import { ipcMain } from 'electron'

import { database, onShut, quietly } from './captures'
import { ask } from './reader'
import { wordCounter, wordsIn } from './word-count'

export { wordsIn }

/**
 * Words written, counted as you write: each time a note, a gem, an article
 * or a day's, week's or month's page is saved, the words it gained since the
 * save before are added to that day, for that note. Words taken out never
 * count against you, and a note brought in whole (an import, the sandbox)
 * counts nothing: only what is written here. Read back by Stats as today,
 * this week, each note's share and a year of writing days. No goals.
 *
 * Time spent writing comes with the words: the gap since the same note's last
 * save that gained words, when that gap is short enough to be one sitting
 * (a minute and a half), so a note left open over lunch counts nothing for
 * lunch. Read back on a note's own details as "about 40 min writing it".
 */

/** A gap between two saves longer than this is a pause, not writing. */
const SITTING_MS = 90_000
// The last save that gained words, by note, while the app runs.
const lastWrote = new Map<string, number>()
/** The seconds of writing this save adds to a note: the gap since its last save, if that was one sitting. */
export function writingSeconds(key: string, now = Date.now()): number {
  const last = lastWrote.get(key)
  lastWrote.set(key, now)
  return last !== undefined && now - last <= SITTING_MS ? Math.round((now - last) / 1000) : 0
}

// Where each kind of page keeps its words, and what its rows are called by.
const TABLES = [
  { table: 'captures', key: 'id', kind: 'capture' },
  { table: 'nuggets', key: 'id', kind: 'nugget' },
  { table: 'day_pages', key: 'day', kind: 'day' },
  { table: 'periods', key: 'period', kind: 'period' }
] as const

/** A save whose words are being counted: what it was and is, and when it was made. */
type Save = { kind: string; key: string; was: string; now: string; at: number; day: string; counted: Promise<void> }
const waiting = new Set<Save>()

export function registerWordLog(): void {
  const db = database()
  db.exec('create table if not exists word_days (day text not null, id text not null, kind text not null, words integer not null default 0, primary key (day, id))')
  if (!(db.prepare('select 1 from pragma_table_info(?) where name = ?').get('word_days', 'seconds'))) db.exec('alter table word_days add column seconds integer not null default 0')
  // The words a save gained are counted on the reading thread (word-count.ts): counting them here, inside the
  // write, read every word of a long note on main's one thread (45 ms for a 4 MB note, twice on its first save).
  // The trigger only hands over the words as they were and as they are; the day and the time are the save's own,
  // and the gain is written when the count comes back, in the order the saves were made. That write is in no list
  // and no search, so it leaves the book's stamp where it was (captures.ts `quietly`).
  const add = db.prepare('insert into word_days (day, id, kind, words, seconds) values (?, ?, ?, ?, ?) on conflict (day, id) do update set words = words + excluded.words, seconds = seconds + excluded.seconds')
  const settle = (save: Save, gained: number): void => {
    if (!waiting.delete(save) || gained <= 0) return
    quietly(() => add.run(save.day, save.key, save.kind, gained, writingSeconds(save.key, save.at)))
  }
  const here = wordCounter()
  // The local calendar day, as `date('now', 'localtime')` says it.
  const dayOf = (at: number): string => { const day = new Date(at); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` }
  db.function('word_log', (kind, key, was, now) => {
    const at = Date.now()
    const save: Save = { kind: String(kind), key: String(key), was: String(was ?? ''), now: String(now ?? ''), at, day: dayOf(at), counted: null as never }
    waiting.add(save)
    save.counted = ask('words:gained', [save.was, save.now]).then((gained) => settle(save, gained), () => settle(save, here(save.was, save.now)))
    return 0
  })
  // The app is closing, or the book: what is still being counted is counted here, so no save's words go uncounted.
  onShut(() => { for (const save of [...waiting]) settle(save, here(save.was, save.now)) })
  /** Every save made so far has its words written: waited for before the counts are read. */
  const counted = (): Promise<unknown> => Promise.all([...waiting].map((save) => save.counted))
  for (const { table, key, kind } of TABLES) {
    const there = db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table)
    if (!there) continue
    // Only a change of words, only words gained, on the local calendar day.
    db.exec(`create temp trigger if not exists word_log_${table} after update of body on main.${table}
      when coalesce(new.body, '') != coalesce(old.body, '')
      begin
        select word_log('${kind}', new.${key}, old.body, new.body);
      end`)
  }

  // One note's writing: the words it gained here, the time spent writing them, and on how many days.
  ipcMain.handle('haligtree:words:note', async (_event, id: unknown) => (await counted(),
    db.prepare('select coalesce(sum(words), 0) as words, coalesce(sum(seconds), 0) as seconds, count(*) as days from word_days where id = ? and words > 0').get(String(id)) as { words: number; seconds: number; days: number }))

  // Today, this week from Monday, the last seven days before it, a year of days, and today's notes with their words.
  ipcMain.handle('haligtree:words:stats', async () => {
    await counted()
    const today = (db.prepare("select date('now', 'localtime') as d").get() as { d: string }).d
    const monday = (db.prepare("select date('now', 'localtime', '-' || ((cast(strftime('%w', 'now', 'localtime') as integer) + 6) % 7) || ' days') as d").get() as { d: string }).d
    const sum = (from: string, to: string): number => (db.prepare('select coalesce(sum(words), 0) as n from word_days where day >= ? and day <= ?').get(from, to) as { n: number }).n
    const days = db.prepare("select day, sum(words) as words from word_days where day > date('now', 'localtime', '-371 days') group by day order by day").all() as { day: string; words: number }[]
    const notes = (db.prepare('select id, kind, words from word_days where day = ? order by words desc limit 12').all(today) as { id: string; kind: string; words: number }[]).map((row) => {
      const title = row.kind === 'capture' ? (db.prepare("select coalesce(nullif(title, ''), label(title, body, null)) as t, private as p from captures where id = ?").get(row.id) as { t: string; p: number } | undefined)
        : row.kind === 'nugget' ? (db.prepare("select coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as t, private as p, tier from nuggets where id = ?").get(row.id) as { t: string; p: number; tier: string } | undefined)
        : { t: row.id, p: 0 }
      const tier = (title as { tier?: string } | undefined)?.tier
      return { ...row, type: row.kind === 'nugget' ? tier ?? 'nugget' : row.kind, title: title?.t ?? '', private: !!title?.p }
    })
    const week = sum(monday, today)
    const lastMonday = (db.prepare("select date(?, '-7 days') as d").get(monday) as { d: string }).d
    const lastSame = (db.prepare("select date(?, '-7 days') as d").get(today) as { d: string }).d
    return {
      today: sum(today, today),
      week,
      // The same days of last week, to set this week against.
      lastWeek: sum(lastMonday, lastSame),
      total: (db.prepare('select coalesce(sum(words), 0) as n from word_days').get() as { n: number }).n,
      daysWritten: (db.prepare('select count(distinct day) as n from word_days where words > 0').get() as { n: number }).n,
      days,
      notes
    }
  })
}
