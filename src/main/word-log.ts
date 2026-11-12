import { ipcMain } from 'electron'

import { database } from './captures'

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

type Part = { type?: string; text?: string; content?: Part[] }
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

/** How many words a stored body holds: a document's text, or Markdown as it is. */
export function wordsIn(body: unknown): number {
  const raw = String(body ?? '')
  if (!raw) return 0
  let text = raw
  try {
    const doc = JSON.parse(raw) as unknown
    const walk = (node: Part): string => [node.text ?? '', ...(node.content ?? []).map(walk)].join(' ')
    text = typeof doc === 'string' ? doc : doc && typeof doc === 'object' ? walk(doc as Part) : ''
  } catch {
    // Markdown, as it is.
  }
  return text.match(WORD)?.length ?? 0
}

// Where each kind of page keeps its words, and what its rows are called by.
const TABLES = [
  { table: 'captures', key: 'id', kind: 'capture' },
  { table: 'nuggets', key: 'id', kind: 'nugget' },
  { table: 'day_pages', key: 'day', kind: 'day' },
  { table: 'periods', key: 'period', kind: 'period' }
] as const

export function registerWordLog(): void {
  const db = database()
  db.exec('create table if not exists word_days (day text not null, id text not null, kind text not null, words integer not null default 0, primary key (day, id))')
  if (!(db.prepare('select 1 from pragma_table_info(?) where name = ?').get('word_days', 'seconds'))) db.exec('alter table word_days add column seconds integer not null default 0')
  // A save asks for the words gained twice (were there any, then how many), and each ask counted the words as they
  // were and as they are: four counts of a long note's every word, inside the write, on main's thread (about 130 ms
  // for a 4 MB note). The last few wordings keep their count, by their text: the words as they were are the ones the
  // save before counted as they are, so a save counts once.
  const counted = new Map<string, number>()
  const count = (body: unknown): number => {
    const raw = String(body ?? '')
    const kept = counted.get(raw)
    if (kept !== undefined) return kept
    const words = wordsIn(raw)
    // Only a wording long enough to be worth it, and three at most: each is held whole.
    if (raw.length > 20_000) {
      if (counted.size >= 3) counted.delete(counted.keys().next().value!)
      counted.set(raw, words)
    }
    return words
  }
  db.function('words_gained', (was, now) => {
    // As they were first: it is the one already counted, and must not be let go of to make room for the new one.
    const before = count(was)
    return Math.max(0, count(now) - before)
  })
  db.function('writing_seconds', (key) => writingSeconds(String(key)))
  for (const { table, key, kind } of TABLES) {
    const there = db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table)
    if (!there) continue
    // Only a change of words, only words gained, on the local calendar day.
    db.exec(`create temp trigger if not exists word_log_${table} after update of body on main.${table}
      when coalesce(new.body, '') != coalesce(old.body, '') and words_gained(old.body, new.body) > 0
      begin
        insert into main.word_days (day, id, kind, words, seconds) values (date('now', 'localtime'), new.${key}, '${kind}', words_gained(old.body, new.body), writing_seconds(new.${key}))
          on conflict (day, id) do update set words = words + excluded.words, seconds = seconds + excluded.seconds;
      end`)
  }

  // One note's writing: the words it gained here, the time spent writing them, and on how many days.
  ipcMain.handle('haligtree:words:note', (_event, id: unknown) =>
    db.prepare('select coalesce(sum(words), 0) as words, coalesce(sum(seconds), 0) as seconds, count(*) as days from word_days where id = ? and words > 0').get(String(id)) as { words: number; seconds: number; days: number })

  // Today, this week from Monday, the last seven days before it, a year of days, and today's notes with their words.
  ipcMain.handle('haligtree:words:stats', () => {
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
