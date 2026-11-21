import { BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { randomUUID } from 'crypto'
import { changed, database } from './captures'
import { gate } from './haligtree'
import { dayKey, dayjs } from './dates'
import { ask } from './reader'
import { caps, shaped } from './understand'
import { meets } from './needs'
import { meetingNow } from './meeting'
import { dictating } from './dictation'
import { cut } from './clip'
import { LEVELS, REST_DAYS, levelOf, newFacts, type CardLevel, type Passage } from './insight-pick'
import { shownSince } from './book-feed'
import { checkConnect, checkReframe, sharedWord } from './insight-checks'

/**
 * Insights in the Feed, drawn from the person's own book: Connect (two notes not linked, the words both say, and one
 * sentence on why they belong together) and Reframe (a view a note holds, quoted from it, and the other side of it),
 * written on this Mac by Apple Intelligence (guided generation, understand.ts `shaped`) from the passages alone. Each
 * names what it is about, and is checked in code before it is kept (insight-checks.ts): a quote not in its note, or a
 * line that shares no word that means something with it, and the card is dropped. Decisions are never in them. Without it none come: the Feed's
 * own posts are what comes back (book-feed.ts), picked from the same pool by the same rule (insight-pick.ts), and a
 * note in today's posts or in an insight of the last 14 days is never picked again for another.
 *
 * Made while Haligtree is open (Apple slows a model asked from the background): when the Feed is opened, or the app
 * has been in front and left alone for a minute, up to three, one request at a time, up to the day's nine. Never
 * while the person types, dictates or records. Kept in the book (feed_insights), so a day's cards stay put.
 */
export type InsightSource = { type: Passage['type']; id: string; title: string; href?: string }
/** `quote` is what it is about, word for word from the notes: the view a Reframe turns around, the words both notes of a Connect say. `words` is the other side, or why they belong. */
export type Insight = { id: string; level: CardLevel; quote: string; words: string; sources: InsightSource[]; made: string; state: 'kept' | null; gemId: string | null }
export type Insights = { day: string; cards: Insight[]; done: boolean; ai: boolean }

/** The day's batch. */
const DAY_BATCH = 9
/** Made at one go. */
const AT_ONCE = 3
/** Tries a day at most, failures counted, so a day always ends. */
const TRIES = 16
/** Seconds left alone before the app makes some on its own; seconds since the last key that still count as typing. */
const QUIET = 60
const TYPED = 5
/** How much a dismiss lowers its level's share, and how low it goes. */
const LOWER = 0.85
const FLOOR = 0.3

/**
 * The stand-ins' answers under HALIGTREE_QA_CAPS=ai (a probe on a Mac without the model): a Connect names a word both
 * notes really say (none, and it is dropped); a Reframe quotes the note's own first words, and every second one says the
 * vague line a person once saw ("What if the silence broke..."), which shares no word with its note and is dropped.
 */
let qaReframes = 0
const QA_THREAD = (passages: Passage[]): string => sharedWord(`${passages[0]?.title} ${passages[0]?.text}`, `${passages[1]?.title} ${passages[1]?.text}`) ?? ''
const QA_REFRAME = (one: Passage): { view: string; other: string } => {
  const view = one.text.split(/\s+/).filter(Boolean).slice(0, 6).join(' ')
  const key = [...view.toLowerCase().matchAll(/\p{L}{5,}/gu)].map((word) => word[0]).sort((a, b) => b.length - a.length)[0] ?? 'this'
  return qaReframes++ % 2
    ? { view, other: 'What if the silence broke not with a word but with a sound that made the hidden thing visible' }
    : { view, other: `Seen from the other side, the ${key} is what you would let go of first` }
}

let typedAt = 0
/** A key pressed in a Haligtree window (index.ts): no request is made while the person types. */
export const noteTyped = (): void => void (typedAt = Date.now())

export function registerInsights(aiOn: () => boolean): void {
  const db = database()
  db.exec(`create table if not exists feed_insights (id text primary key, day text not null, turn integer not null, level text not null, words text not null, sources text not null, made_at text not null, state text, gem_id text);
    create index if not exists feed_insights_by_day on feed_insights(day);
    create table if not exists feed_insight_mix (level text primary key, weight real not null)`)
  // What a card is about, quoted from its notes (since 21 Nov); a card made before has none and is not shown.
  try { db.exec('alter table feed_insights add column quote text') } catch { /* Already there. */ }
  type Row = { id: string; day: string; turn: number; level: CardLevel; quote: string | null; words: string; sources: string; made_at: string; state: string | null; gem_id: string | null }
  // Only Connect and Reframe: a Resurface card from before the Feed's posts took its place is not shown.
  const rowsOf = (day: string): Row[] => (db.prepare('select * from feed_insights where day = ? order by turn').all(day) as Row[]).filter((row) => LEVELS.includes(row.level))
  const weightOf = (level: CardLevel): number => (db.prepare('select weight from feed_insight_mix where level = ?').get(level) as { weight: number } | undefined)?.weight ?? 1
  const ai = async (): Promise<boolean> => meets(await caps(), 'ai') && aiOn()
  const shownOf = (rows: Row[], withAi: boolean): Row[] => (withAi ? rows.filter((row) => row.state !== 'failed' && row.state !== 'dismissed' && !!row.quote) : [])
  const doneOf = (rows: Row[], withAi: boolean): boolean => !withAi || rows.filter((row) => row.state !== 'failed').length >= DAY_BATCH || rows.length >= TRIES
  // Typing: a key since the making began (the ⌘K search that opened the Feed is not), within the last few seconds.
  const busy = (since: number): boolean => meetingNow() || dictating() || (typedAt > since && Date.now() - typedAt < TYPED * 1000)

  const read = async (): Promise<Insights> => {
    const day = dayKey()
    const withAi = await ai()
    if (gate().blackout) return { day, cards: [], done: true, ai: withAi }
    const rows = rowsOf(day)
    return {
      day, ai: withAi, done: doneOf(rows, withAi),
      cards: shownOf(rows, withAi).map((row) => ({ id: row.id, level: row.level, quote: row.quote ?? '', words: row.words, sources: JSON.parse(row.sources) as InsightSource[], made: row.made_at, state: row.state === 'kept' ? 'kept' : null, gemId: row.gem_id }))
    }
  }

  /** The book's own punctuation: a dash the model sets between two thoughts becomes a colon (no em dashes in the app). */
  const tidy = (said: string): string => said.replace(/\s+/g, ' ').replace(/\s*[—–]\s*/, ': ').replace(/\s*[—–]\s*/g, ', ').trim().replace(/^["“](.*)["”]$/, '$1').replace(/^\p{Ll}/u, (letter) => letter.toUpperCase())
  /**
   * Connect and Reframe, asked of Apple Intelligence: what it is about, quoted, and the line on it. Null when it said
   * nothing that passes the checks in code (insight-checks.ts), and the card is dropped.
   */
  const write = async (level: CardLevel, passages: Passage[]): Promise<{ quote: string; words: string } | null> => {
    const given = passages.map((one, at) => `Note ${at + 1}, “${cut(one.title.replace(/\s+/g, ' '), 80)}”:\n${one.text}`).join('\n\n')
    const rules = 'Use only what the notes say. Never add a fact, a name, a date, a number or a quotation from anywhere else. Speak to the person as “you”, plainly, in the language of the notes. No lists, no quotation marks around the whole.'
    let kept: { quote: string; words: string } | null = null
    if (level === 'connect') {
      if (passages.length < 2) return null
      const answer = await shaped<{ belong: string; thread: string; why: string }>(
        `You read two notes from one person's own notebook, written at different times about different things, and find the one real thread between them: a shared idea, a tension, a pattern or a question they both circle. ${rules}`,
        given,
        { type: 'object', properties: [
          { name: 'belong', type: 'string', choices: ['yes', 'no'], description: 'yes when the two notes truly share an idea; no when any link would be forced' },
          { name: 'thread', type: 'string', description: 'A word or short phrase, one to four words, that appears word for word in both notes and names what they share' },
          { name: 'why', type: 'string', description: 'One plain sentence, under 30 words, saying what the two notes share, naming something from each' }
        ] },
        () => ({ belong: 'yes', thread: QA_THREAD(passages), why: `Both notes, in a stand-in's words, come back to ${QA_THREAD(passages)} from two sides` }))
      if ('error' in answer || answer.belong !== 'yes') return null
      const checked = checkConnect(answer.thread, tidy(answer.why), [`${passages[0].title} ${passages[0].text}`, `${passages[1].title} ${passages[1].text}`])
      kept = checked && { quote: checked.thread, words: checked.why }
    } else {
      // The view is the first note's (the others are only what it links to, for context).
      const note = `${passages[0].title}\n${passages[0].text}`
      const answer = await shaped<{ view: string; other: string }>(
        `You take one view a person holds in their own notebook and show them the other side of it. First quote the view, word for word from Note 1, as it is written there. Then say the other side: the same matter seen from the opposite position, plainly and concretely, about the same things the note names. Never summarise it, never praise it, never ask a question that only repeats it. ${rules}`,
        given,
        { type: 'object', properties: [
          { name: 'view', type: 'string', description: 'The view the note holds: a phrase of 4 to 20 words copied word for word from Note 1' },
          { name: 'other', type: 'string', description: 'The other side of that view, about the same things, in at most 20 words' }
        ] },
        () => QA_REFRAME(passages[0]))
      if ('error' in answer) return null
      const checked = checkReframe(answer.view, tidy(answer.other), note)
      kept = checked && { quote: checked.view, words: checked.other }
    }
    if (!kept) return null
    // Too short to be what was asked for, or saying something the notes never did: not shown.
    if (kept.words.length < 12 || newFacts(kept.words, passages).length) return null
    return kept
  }

  let making: Promise<void> | null = null
  /** Up to three more of today's, one request at a time. */
  const make = (): Promise<void> => (making ??= (async () => {
    const began = Date.now()
    try {
      // Three shown at one go: one dropped by its checks is not one of them (each try is a row, so a day still ends at TRIES).
      for (let made = 0; made < AT_ONCE;) {
        if (gate().blackout || busy(began)) return
        const day = dayKey()
        const withAi = await ai()
        const rows = rowsOf(day)
        if (doneOf(rows, withAi)) return
        // Turns count every row of the day, an old Resurface one too, so a turn is never asked twice.
        const turn = (db.prepare('select count(*) as n from feed_insights where day = ?').get(day) as { n: number }).n
        const level = levelOf(day, turn, Object.fromEntries(LEVELS.map((one) => [one, weightOf(one)])) as Record<CardLevel, number>) ?? 'connect'
        // Resting: what the Feed showed or an insight used in the last 14 days, and today's posts.
        const rested = [...shownSince(db, dayKey(dayjs(day).subtract(REST_DAYS - 1, 'day')))]
        const picked = await ask('feed:insight', [{ day, turn, level, rested }])
        const id = randomUUID()
        const keep = (said: { quote: string; words: string } | null, sources: Passage[]): void =>
          void db.prepare('insert into feed_insights (id, day, turn, level, quote, words, sources, made_at, state) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, day, turn, level, said?.quote ?? null, said?.words ?? '', JSON.stringify(sources.map((one) => ({ type: one.type, id: one.id, title: cut(one.title.replace(/\s+/g, ' ').trim() || 'Untitled', 80), ...(one.href ? { href: one.href } : {}) }))), new Date().toISOString(), said ? null : 'failed')
        if (!picked) {
          // Nothing left to pick, or a Connect without a second note: a try spent, so the day still ends.
          keep(null, [])
          continue
        }
        // The person may have started typing while the passages were picked.
        if (busy(began)) return
        const said = await write(level, picked.passages)
        keep(said, picked.passages)
        if (said) made++
        changed({ kind: 'item', id: `insight:${id}` })
      }
    } finally {
      making = null
    }
  })())

  ipcMain.handle('haligtree:feed:insights', () => read())
  // The Feed opened: a few made now, if today's are not all made.
  ipcMain.handle('haligtree:feed:insights:make', () => void make())
  // Keep: the insight becomes a gem, its notes linked under it, as a restack keeps a note's link (feed.ts).
  ipcMain.handle('haligtree:feed:insight:keep', (_event, id: string): string | null => {
    const row = db.prepare('select * from feed_insights where id = ?').get(String(id)) as Row | undefined
    if (!row || row.gem_id) return row?.gem_id ?? null
    const sources = JSON.parse(row.sources) as InsightSource[]
    type Node = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs: Record<string, unknown> }[]; content?: Node[] }
    const linkOf = (one: InsightSource): Node => one.type === 'highlight'
      ? { type: 'text', text: one.title, marks: [{ type: 'link', attrs: { href: one.href } }] }
      : { type: 'noteLink', attrs: { id: one.type === 'capture' ? one.id : one.type === 'day' ? `day:${one.id}` : `nugget:${one.id}`, label: one.title } }
    const from: Node[] = sources.flatMap((one, at) => [...(at ? [{ type: 'text', text: ', ' }] : [{ type: 'text', text: 'From ' }]), linkOf(one)])
    // Both lines, as the card said them: what it is about, quoted, then the other side (or why the two belong).
    const [lead, rest] = row.level === 'reframe' ? ['Your note says: ', 'The other side: '] : ['Both notes say: ', '']
    const line = (text: string): Node => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const doc: Node = { type: 'doc', content: [...(row.quote ? [line(`${lead}“${row.quote}”`)] : []), line(`${rest}${row.words}`), { type: 'paragraph', content: from }] }
    const gem = randomUUID()
    const at = new Date().toISOString()
    db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(gem, cut(row.level === 'reframe' && row.quote ? `The other side of “${row.quote}”` : row.words, 160), JSON.stringify(doc), at, at)
    db.prepare("update feed_insights set state = 'kept', gem_id = ? where id = ?").run(gem, row.id)
    changed({ kind: 'item', id: gem })
    return gem
  })
  ipcMain.handle('haligtree:feed:insight:unkeep', (_event, id: string): boolean => {
    const row = db.prepare('select gem_id from feed_insights where id = ?').get(String(id)) as { gem_id: string | null } | undefined
    if (!row?.gem_id) return false
    db.prepare('delete from nuggets where id = ?').run(row.gem_id)
    db.prepare('update feed_insights set state = null, gem_id = null where id = ?').run(String(id))
    changed({ kind: 'item', id: row.gem_id })
    return true
  })
  // Dismiss: the card goes, and its level comes a little less often for this person. Its weight before is handed
  // back, for Undo.
  ipcMain.handle('haligtree:feed:insight:dismiss', (_event, id: string): number | null => {
    const row = db.prepare('select level from feed_insights where id = ?').get(String(id)) as { level: CardLevel } | undefined
    if (!row) return null
    const was = weightOf(row.level)
    db.prepare('insert or replace into feed_insight_mix (level, weight) values (?, ?)').run(row.level, Math.max(FLOOR, was * LOWER))
    db.prepare("update feed_insights set state = 'dismissed' where id = ?").run(String(id))
    changed({ kind: 'item', id: `insight:${id}` })
    return was
  })
  ipcMain.handle('haligtree:feed:insight:undismiss', (_event, id: string, weight: number): boolean => {
    const row = db.prepare('select level from feed_insights where id = ?').get(String(id)) as { level: CardLevel } | undefined
    if (!row) return false
    db.prepare('insert or replace into feed_insight_mix (level, weight) values (?, ?)').run(row.level, Number(weight) || 1)
    db.prepare('update feed_insights set state = null where id = ?').run(String(id))
    changed({ kind: 'item', id: `insight:${id}` })
    return true
  })
  // Each level's share as it stands, for a check (and nothing else reads it).
  ipcMain.handle('haligtree:feed:insight:mix', () => Object.fromEntries(LEVELS.map((level) => [level, weightOf(level)])))

  // Left alone a minute with Haligtree in front: a few made, so the Feed has them when it is next opened.
  setInterval(() => {
    if (BrowserWindow.getFocusedWindow() && powerMonitor.getSystemIdleTime() >= QUIET && Date.now() - typedAt >= QUIET * 1000) void make()
  }, 15_000)
}
