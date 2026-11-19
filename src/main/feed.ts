import { ClipboardItem, dialog, ipcMain, net, shell } from 'electron'
import { pasteboard } from './pasteboard'
import { writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

import { LABEL, changed, database } from './captures'
import { cut } from './clip'
import { cardForQuiz, cardWords, dueCards, feedTakesPages, feedTakesPictures, gate, plain } from './haligtree'
import { LEARN_TAG } from './name'
import { READING_PACE } from './word-count'
import { dayKey, dayjs } from './dates'
import { LESS, bookFeed, fadedSteps, likedSteps, tableOf, type Row, type Takes } from './book-feed'
import { ask } from './reader'
import { named } from './stalls'

/**
 * The Feed: about twenty of your own things a day, picked once and kept for
 * the day, so a reload shows the same posts and tomorrow brings a new set.
 * Gems, quotes, questions you hold with their newest clue, and old Journal
 * days, the ones longest since you last saw them first. Never private, never
 * a #bit, nothing at all in Safe mode.
 */
export type FeedPost = {
  type: 'capture' | 'nugget' | 'article' | 'question' | 'day' | 'poll' | 'quiz' | 'pair'
  id: string
  kind: string
  title: string
  text: string
  who: string | null
  made: string
  /** When you last saw it: opened, shown as a hint, or in an earlier day's Feed. Null for never. */
  seen: string | null
  gloss: { body: string; at: string } | null
  clue: string | null
  /** What you said of it today, if anything: one a post a day, changeable. */
  react: Reaction | null
  /** Your own history with it: how many thoughts, since when, and how many times it came up before. */
  replies: number
  firstReply: string | null
  seenTimes: number
  /** How many times "Less of this" (or a hint's thumbs down) has faded it, net of any thumbs up: 0 for as before. */
  faded: number
  /** Times liked, the heart: each one brings it back sooner. */
  liked: number
  /** Its tags, a few, each a way to its tag page. */
  tags: string[]
  /** The notes its words link to ("Connected to: …" on an imported quote): each label shown as a link. `to` is "article:id". */
  links?: { to: string; label: string }[]
  /** A quote's page or PDF, as its link back says: its name, the page (a PDF's), and the link that opens it there. */
  from?: { name: string; page: number | null; href: string }
  /** "Changed my mind": the note you said it again in, and when. Shown as one quiet line that opens it. */
  changedTo?: { id: string; at: string } | null
  /** A gem you restacked: the note it quotes. */
  restack: { type: FeedPost['type']; id: string; title: string; text: string; who: string | null; kind: string } | null
  /** A decision made weeks ago, asked about again: what you said today, and every answer you have given it. */
  poll?: { open: { type: 'capture' | 'nugget'; id: string }; answer: PollAnswer | null; answers: Record<PollAnswer, number> }
  /** A Review card due, asked here: its question, its answer, each grade's next date, and today's grade once given. */
  quiz?: { prompt: string; answer: string; intervals: Record<number, string>; graded: { grade: number; due: string } | null }
  /** "Two subjects, one thread": two notes with no tag in common, and what they share (feed-pair.ts). */
  pair?: { notes: { type: FeedPost['type']; id: string; kind: string; title: string; text: string; who: string | null; tags: string[] }[]; why: { kind: 'word'; word: string } | { kind: 'source'; source: string } | { kind: 'hour' } }
  /** Brought in by an importer: shown "From the archives". */
  archive?: boolean
  /** Kept this many months ago and never linked: shown "From the archives", one a Feed at most. */
  unlinked?: number
}
export type PollAnswer = 'yes' | 'mixed' | 'no'
/** How long after it was decided a decision is first asked about, and how long before it is asked again. */
const POLL_AFTER = 21
const POLL_AGAIN = 28
/** Quiz cards a day at most. */
const QUIZZES = 2
export type Reaction = 'like' | 'changed' | 'use' | 'less'
/** A Page as Reading lists it: where it is from, its title and first line, how long it takes, when you last opened it. */
export type ReadingPage = {
  id: string
  title: string
  dek: string
  words: number
  minutes: number
  made: string
  opened: string | null
  saved: boolean
  /** Its "publication": the group it sits in, or else its first tag. */
  from: { kind: 'group'; name: string; icon: string | null; color: string | null } | { kind: 'tag'; name: string } | null
}
export type Reading = { day: string; today: string | null; pages: ReadingPage[]; safe: boolean }
/** Words a minute: the app's one pace for a "min read" (word-count.ts). */
const PACE = READING_PACE
/** Today's read is a read, never a "1 min read": a page of three minutes at least. */
const ESSAY = PACE * 2.5
export type Feed = { day: string; posts: FeedPost[]; safe: boolean }
/** The Feed's side column: who and what has gone quiet, and the tags you wrote most this week. Never anything about other people. */
/** A post in Liked: the day you last liked it, and how many times in all. */
export type LikedPost = FeedPost & { likedOn: string; likes: number }
/** Liked's strip and side: likes per week over the last year (Monday first), what you keep liking, and a year ago today. */
export type LikedSide = { total: number; notes: number; weeks: { start: string; n: number }[]; tags: { tag: string; n: number }[]; sources: { name: string; n: number }[]; yearAgo: LikedPost[]; yearAgoExact: boolean }
export type FeedSide = { quiet: { kind: 'source' | 'tag'; name: string; last: string }[]; week: { tag: string; n: number }[] }

/** A Page's dek: about this long, cut at a word. */
const DEK = 180
/** A link's label clipped short: "Rosetta Stone, found in 1799: one decre…". */
const CLIPPED = /(?:…|\.\.\.)\s*$/
/** A date said first, as a clue or a dated line starts: "7 May 2026 · ", "Tue 4 March: ", "2026-05-07 - ". */
const LEAD_DATE = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:\d{1,2}\s+[a-z]{3,9}\.?(?:\s+\d{4})?|[a-z]{3,9}\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2})\s*(?:[·:,–-]\s*)/i
/** What a dek never reads: pictures, embeds and other blocks that are not prose. */
const NOT_PROSE = new Set(['noteEmbed', 'image', 'imagePlaceholder', 'attachment', 'bookmark', 'excalidraw', 'graph', 'tableOfContents', 'codeBlock', 'horizontalRule', 'table', 'columns'])
/** Marks a line a clipped link was in, so it is never the dek. */
const POISON = '\u0000'
/**
 * A Page's lines as prose, for its dek: a link reads as its words, but one
 * whose label was clipped spoils its line, and date chips, mentions, embeds
 * and pictures are left out, so the dek never has "..." in its middle.
 */
const proseLines = (raw: string): string[] => {
  type Node = { type?: string; text?: string; attrs?: { label?: string }; content?: Node[] }
  let doc: Node | string | null = null
  try { doc = JSON.parse(raw) } catch { /* Markdown */ }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) {
    const text = typeof doc === 'string' ? doc : raw
    return cardWords(text.replace(/\[\[@[^|\]]+\|([^\]]*)\]\]/g, (all, label: string) => (CLIPPED.test(label) ? POISON : all))).split('\n')
  }
  const inline = (nodes: Node[] = []): string => nodes.map((node) =>
    node.type === 'text' ? (node.text ?? '') : node.type === 'noteLink' ? (CLIPPED.test(node.attrs?.label ?? '') ? POISON : (node.attrs?.label ?? '')) : node.type === 'hardBreak' ? ' ' : '').join('')
  const block = (node: Node): string[] =>
    NOT_PROSE.has(node.type ?? '') ? [] : node.type === 'paragraph' || node.type === 'heading' ? [inline(node.content)] : (node.content ?? []).flatMap(block)
  return doc.content.flatMap(block)
}
/** Cut at a word, with one ellipsis, and only when it runs long. */
const cutAt = (text: string, size: number): string => (text.length > size ? `${text.slice(0, size).replace(/\s+\S*$/, '').replace(/[\s,;:·–-]+$/, '')}…` : text)
/** A like's step, the same size as a fade's the other way, and how far likes can take it. */
const MORE = 1.5
const MOST = 4
/** A page's words a line a block: a paragraph with a link in it stays one line, as it reads. */
const blockLines = (raw: string): string[] => {
  let doc: { type?: string; content?: { type?: string }[] } | null = null
  try { doc = JSON.parse(raw) } catch { /* Markdown */ }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return cardWords(raw).split('\n')
  return doc.content.flatMap((block) => (block.type === 'paragraph' || block.type === 'heading' ? [plain(block).replace(/\n/g, '')] : plain(block).split('\n')))
}
/** Longest since you opened it first: never opened before all, then the oldest open, then the oldest written. */
const forgotten = <T extends { opened: string | null; made: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => (a.opened ?? '').localeCompare(b.opened ?? '') || a.made.localeCompare(b.made))
/** The id a note link names it by: a capture by its own id, a day as `day:`, the rest as `nugget:id`. */
const linkId = (type: string, id: string): string => (type === 'capture' ? id : type === 'day' ? `day:${id}` : `nugget:${id}`)

export function registerFeed(): void {
  const db = database()
  db.exec(`create table if not exists feed_days (day text primary key, keys text not null);
    create table if not exists feed_reacts (day text not null, key text not null, reaction text not null, was text, primary key (day, key));
    create table if not exists feed_restacks (id text primary key, of_key text not null, made_day text not null, shown_day text);
    create table if not exists feed_reads (day text primary key, id text not null);
    create table if not exists feed_polls (day text not null, key text not null, answer text not null, gloss text, primary key (day, key));
    create table if not exists feed_quiz (day text not null, id text not null, grade integer not null, due text not null, primary key (day, id))`)
  // Which of the Feed's switches (Pages too, notes with pictures) a day's set was picked under: flipped, the day is picked again.
  try { db.exec('alter table feed_days add column mode text') } catch { /* there already */ }
  // A note you changed your mind on: the new one, said again in your words, and when. One a note, the latest kept.
  db.exec('create table if not exists feed_changed (id text primary key, new_id text not null, at text not null)')
  const changedOf = db.prepare('select new_id as id, at from feed_changed where id = ? and new_id in (select id from nuggets where binned_at is null)')
  ipcMain.handle('haligtree:feed:changed', (_event, id: string): { id: string; at: string } | null => (changedOf.get(String(id)) as { id: string; at: string } | undefined) ?? null)
  const modeNow = (): string => `${feedTakesPages() ? 'pages' : ''}|${feedTakesPictures() ? 'pictures' : ''}`

  // --- polls: a decision made weeks ago, asked about again.
  type Decision = { table: 'captures' | 'nuggets'; id: string; title: string; fields: string; made: string }
  const decisionOf = (table: 'captures' | 'nuggets', id: string): Decision | undefined => decisions(id).find((one) => one.table === table)
  /** Every decision that is Decided, of yours and not private; one id alone, or all of them. */
  const decisions = (only?: string): Decision[] => {
    const one = only ? 'and id = ?' : ''
    const args = only ? [only] : []
    const where = "kind in ('decision', 'checkback') and private = 0 and archived_at is null and json_valid(fields) and json_extract(fields, '$.state') = 'Decided'"
    return [
      ...db.prepare(`select 'captures' as \`table\`, id, ${LABEL} as title, fields, captured_at as made from captures where ${where} and status != 'discarded' and id not in (select capture_id from nuggets where capture_id is not null) ${one}`).all(...args),
      ...db.prepare(`select 'nuggets' as \`table\`, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, fields, created_at as made from nuggets where ${where} and binned_at is null and superseded_by is null ${one}`).all(...args)
    ] as Decision[]
  }
  const fieldsOf = (one: Decision): Record<string, unknown> => { try { return JSON.parse(one.fields) as Record<string, unknown> } catch { return {} } }
  /** What was chosen, in its own words: the call, or else the note's title. */
  const chosen = (one: Decision): string => String(fieldsOf(one).call ?? fieldsOf(one)['The call'] ?? '').trim() || one.title.replace(/^decided:\s*/i, '').trim()
  const decidedOn = (one: Decision): string => String(fieldsOf(one).decidedAt ?? '') || one.made
  /** Today's poll, if one is owed: the decision longest unasked, decided three weeks ago or more, not asked in the last four. */
  const pickPoll = (today: string): string[] => {
    const asked = new Map((db.prepare('select key, max(day) as day from feed_polls group by key').all() as { key: string; day: string }[]).map((one) => [one.key, one.day]))
    const old = dayjs().subtract(POLL_AFTER, 'day').toISOString()
    const again = dayKey(dayjs().subtract(POLL_AGAIN, 'day'))
    const due = decisions().map((one) => ({ key: `poll:${one.table}:${one.id}`, decided: decidedOn(one) }))
      .filter((one) => one.decided <= old && (asked.get(one.key) ?? '') < again && asked.get(one.key) !== today)
      .sort((a, b) => (asked.get(a.key) ?? '').localeCompare(asked.get(b.key) ?? '') || a.decided.localeCompare(b.decided))
    return due.slice(0, 1).map((one) => one.key)
  }
  const POLL_WORD: Record<PollAnswer, string> = { yes: 'yes', mixed: 'mixed', no: 'no' }
  const answersOf = (key: string): Record<PollAnswer, number> => {
    const all: Record<PollAnswer, number> = { yes: 0, mixed: 0, no: 0 }
    for (const one of db.prepare('select answer, count(*) as n from feed_polls where key = ? group by answer').all(key) as { answer: PollAnswer; n: number }[]) if (one.answer in all) all[one.answer] = one.n
    return all
  }
  // Choosing writes a dated thought on the decision, "Looking back: yes"; choosing again today rewrites it, choosing none takes it away.
  ipcMain.handle('haligtree:feed:poll', (_event, key: string, answer: PollAnswer | null): Record<PollAnswer, number> | null => {
    const [, rest] = split(key)
    const [table, id] = split(rest) as ['captures' | 'nuggets', string]
    if (table !== 'captures' && table !== 'nuggets') return null
    if (answer && !(answer in POLL_WORD)) return null
    const day = dayKey()
    const was = db.prepare('select gloss from feed_polls where day = ? and key = ?').get(day, key) as { gloss: string | null } | undefined
    if (!answer) {
      if (was?.gloss) db.prepare('delete from glosses where id = ?').run(was.gloss)
      db.prepare('delete from feed_polls where day = ? and key = ?').run(day, key)
    } else {
      const body = `Looking back: ${POLL_WORD[answer]}`
      let gloss = was?.gloss ?? null
      if (gloss && db.prepare('update glosses set body = ? where id = ?').run(body, gloss).changes) { /* rewritten */ } else {
        gloss = randomUUID()
        db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)').run(gloss, id, body, new Date().toISOString())
      }
      db.prepare('insert or replace into feed_polls (day, key, answer, gloss) values (?, ?, ?, ?)').run(day, key, answer, gloss)
    }
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return answersOf(key)
  })

  // --- quizzes: a Review card due, asked in the Feed and graded by Review's own grading.
  const pickQuiz = (): string[] => {
    const due = dueCards().map((one) => one.id)
    // None due now: the ones coming up soonest, within two days.
    const near = due.length ? [] : (db.prepare(`select id from nuggets where coalesce(prompt, '') != '' and suspended = 0 and private = 0 and archived_at is null and binned_at is null and state is not null and due_at <= ? order by due_at limit ?`)
      .all(dayjs().add(2, 'day').toISOString(), QUIZZES) as { id: string }[]).map((one) => one.id)
    return [...due, ...near].filter((id) => cardForQuiz(id)).slice(0, QUIZZES).map((id) => `quiz:${id}`)
  }
  // Graded from the Feed: the renderer grades with Review's own call, then says so here, so a reload shows the grade.
  ipcMain.handle('haligtree:feed:quiz', (_event, id: string, grade: number, due: string): boolean =>
    db.prepare('insert or replace into feed_quiz (day, id, grade, due) values (?, ?, ?, ?)').run(dayKey(), String(id), Number(grade), String(due)).changes > 0)
  // Its grade taken back (⌘Z or "Undo"): today's grade forgotten here too, so a reload asks it again.
  ipcMain.handle('haligtree:feed:unquiz', (_event, id: string): boolean => db.prepare('delete from feed_quiz where day = ? and id = ?').run(dayKey(), String(id)).changes > 0)

  // What the Feed may show and how it reads it: book-feed.ts, the same code the reading thread runs.
  const book = bookFeed(db)
  const takes = (): Takes => ({ pages: feedTakesPages(), pictures: feedTakesPictures() })
  const filingTags = (): Set<string> => book.filingTags(takes())
  const lookUp = (key: string): Row | undefined => book.lookUp(takes(), key)
  const { words, tagsOfRow, linksOf } = book

  // --- a post as a picture: saved where you choose, or copied for X with its words in X's compose page.
  const pngOf = (data: string): Buffer => Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64')
  ipcMain.handle('haligtree:feed:save-image', async (_event, name: string, data: string): Promise<boolean> => {
    const safe = String(name).replace(/[/\\:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Post'
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: `${safe}.png`, filters: [{ name: 'PNG picture', extensions: ['png'] }] })
    if (canceled || !filePath) return false
    await writeFile(filePath, pngOf(data))
    return true
  })
  ipcMain.handle('haligtree:feed:share-x', async (_event, text: string, data: string): Promise<boolean> => {
    await pasteboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(pngOf(data))], { type: 'image/png' }) })])
    void shell.openExternal(`https://x.com/intent/post?text=${encodeURIComponent(String(text))}`)
    return true
  })
  // A picture of the app's own (haligtree://) as a data address, so a card drawn in a window can carry it.
  ipcMain.handle('haligtree:feed:picture', async (_event, url: string): Promise<string | null> => {
    try {
      const answer = await net.fetch(String(url))
      if (!answer.ok) return null
      const type = answer.headers.get('content-type') || 'image/png'
      return `data:${type};base64,${Buffer.from(await answer.arrayBuffer()).toString('base64')}`
    } catch {
      return null
    }
  })

  // The Feed is read on the reading thread (book-feed.ts): it reads every gem, quote and page, and to find a pair
  // every note of the book. Main does the rest, which is small: the day's poll and quiz (Review's and a decision's
  // own), the day's set kept, restacks marked shown. One look at a time, so a second look, asked while the first
  // is being read, finds the set the first one kept.
  const graded = db.prepare('select grade, due from feed_quiz where day = ? and id = ?')
  const pollAnswer = db.prepare('select answer from feed_polls where day = ? and key = ?')
  const blank = { who: null, seen: null, gloss: null, clue: null, react: null, replies: 0, firstReply: null, seenTimes: 0, faded: 0, liked: 0, tags: [], restack: null }
  const asked = (today: string, key: string): FeedPost[] => {
    const [type, rest] = split(key)
    if (type === 'poll') {
      const [table, id] = split(rest) as ['captures' | 'nuggets', string]
      const one = decisionOf(table, id)
      if (!one) return []
      return [{ ...blank, type: 'poll', id: rest, kind: 'decision', title: chosen(one), text: '', made: decidedOn(one),
        poll: { open: { type: table === 'captures' ? 'capture' : 'nugget', id }, answer: ((pollAnswer.get(today, key) as { answer: PollAnswer } | undefined)?.answer) ?? null, answers: answersOf(key) } }]
    }
    // A card suspended, private or binned since the morning is not asked.
    const card = cardForQuiz(rest) as { id: string; prompt: string | null; body: unknown; title: string; createdAt?: string; intervals: Record<number, string> } | null
    if (!card) return []
    const answer = typeof card.body === 'string' ? cardWords(card.body) : plain(card.body)
    return [{ ...blank, type: 'quiz', id: rest, kind: 'card', title: card.title, text: '', made: String(card.createdAt ?? ''),
      quiz: { prompt: card.prompt ?? '', answer: cutAt(answer.replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '').replace(/[ \t]+$/gm, '').trim(), 600), intervals: card.intervals, graded: (graded.get(today, rest) as { grade: number; due: string } | undefined) ?? null } }]
  }
  let looks: Promise<unknown> = Promise.resolve()
  const look = async (): Promise<Feed> => {
    const today = dayKey()
    if (gate().blackout) return { day: today, posts: [], safe: true }
    const mode = modeNow()
    const was = db.prepare('select keys, mode from feed_days where day = ?').get(today) as { keys: string; mode: string | null } | undefined
    const kept = was && (was.mode ?? mode) === mode ? was.keys : undefined
    const asks = kept ? [] : named("haligtree:feed, the day's poll and quiz", () => [...pickPoll(today), ...pickQuiz()])
    const read = await ask('feed', [{ today, takes: takes(), kept, asks }])
    return named("haligtree:feed, the day's set kept", () => {
      if (read.picked) {
        db.prepare('update feed_restacks set shown_day = ? where shown_day is null and made_day < ?').run(today, today)
        // Kept for the day only from the Feed's goal (feed-view.tsx, FEED_NOTES): below it each look picks afresh, so the day it is met starts full.
        if (read.pooled >= 20) db.prepare('insert or replace into feed_days (day, keys, mode) values (?, ?, ?)').run(today, read.keys, mode)
      }
      const posts = read.posts.flatMap((post) => ('asked' in post ? asked(today, post.asked) : [post]))
      // Now and then, one note kept three months or more and never linked, set among the rest: opening it is the way to link it.
      if (read.lone) posts.splice(Math.min(posts.length, 6), 0, read.lone)
      return { day: today, posts, safe: false }
    })
  }
  // Asked while one look is still waiting its turn, it is answered by that one: Home's card asks on every visit, and
  // each ask queued a whole look of its own (1.5 s of the reading thread on a big book), so thirty visits left 45 s of
  // looks running one after another, and a search typed meanwhile waited behind each one.
  let waiting: Promise<Feed> | null = null
  ipcMain.handle('haligtree:feed', (): Promise<Feed> => {
    if (waiting) return waiting
    const begin = (): Promise<Feed> => ((waiting = null), look())
    const next = looks.then(begin, begin)
    waiting = next
    looks = next.catch(() => undefined)
    return next
  })

  // --- the side column: who and what you have not heard from, and this week's tags.
  // How near the Feed is to full: the notes it can show (not private, not a #bit, not a learn card), and of them the quotes and pictures.
  ipcMain.handle('haligtree:feed:goal', (): Promise<{ notes: number; quotes: number }> => ask('feed:goal', [takes()]))
  // Who and what has gone quiet, and this week's tags: they read every note of yours, so on the reading thread
  // (book-feed.ts `side`), never on this one, which answers every window (it held them all 263 ms on a real book).
  ipcMain.handle('haligtree:feed:side', (): FeedSide | Promise<FeedSide> => (gate().blackout ? { quiet: [], week: [] } : ask('feed:side', [takes()])))

  // --- Reading: your Pages as a reading list, the one longest unread first.
  ipcMain.handle('haligtree:feed:reading', (): Reading => {
    const today = dayKey()
    if (gate().blackout) return { day: today, today: null, pages: [], safe: true }
    const opens = new Map((db.prepare('select id, at from note_opens').all() as { id: string; at: string }[]).map((row) => [row.id, row.at]))
    const rows = db.prepare(`select n.id, coalesce(nullif(nullif(trim(n.title), 'Untitled'), ''), label('', n.body)) as title, n.body, n.created_at as made, n.last_visited_at as visited, n.pinned_at as pinned,
        g.name as groupName, g.icon as groupIcon, g.color as groupColor
      from nuggets n left join note_groups g on g.id = n.group_id
      where n.tier = 'article' and n.private = 0 and n.archived_at is null and n.superseded_by is null and n.binned_at is null`).all() as
      { id: string; title: string; body: string | null; made: string; visited: string | null; pinned: string | null; groupName: string | null; groupIcon: string | null; groupColor: string | null }[]
    const pages = rows.flatMap((row): ReadingPage[] => {
      if (/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`)) return []
      const flat = (said: string): string => said.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const lines = blockLines(row.body ?? '').map((line) => line.replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gu, '').trim()).filter(Boolean)
      // The title is said once; the first line after it is the dek.
      while (lines.length && flat(row.title).includes(flat(lines[0]))) lines.shift()
      const count = lines.join(' ').split(/\s+/).filter((word) => /\p{L}/u.test(word)).length
      if (!count) return []
      // The dek: the first full sentence's line, not a heading or a line that leads into a list,
      // read as prose: no clipped link, no date at its start, no "..." before its end.
      const prose = proseLines(row.body ?? '').map((line) => line.replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gu, '').replace(/\s+/g, ' ').trim().replace(LEAD_DATE, ''))
        .filter((line) => line && !line.includes(POISON) && !/(?:…|\.\.\.)(?=.*\S)/.test(line.replace(/(?:…|\.\.\.)\s*$/, '')))
      while (prose.length && flat(row.title).includes(flat(prose[0]))) prose.shift()
      const first = prose.find((line) => line.split(/\s+/).length >= 8 && !/[:…]$/.test(line)) ?? prose[0] ?? ''
      const dek = cutAt(first, DEK)
      const tag = tagsOfRow(row).find((one) => one !== 'bit' && one !== LEARN_TAG)
      const opened = [opens.get(row.id), row.visited].filter((one): one is string => !!one).sort().at(-1) ?? null
      return [{
        id: row.id, title: row.title, dek, words: count, minutes: Math.max(1, Math.round(count / PACE)), made: row.made, opened, saved: !!row.pinned,
        from: row.groupName ? { kind: 'group', name: row.groupName, icon: row.groupIcon, color: row.groupColor } : tag ? { kind: 'tag', name: tag } : null
      }]
    })
    // Today's read: the most forgotten essay, picked once and kept all day.
    let pick = (db.prepare('select id from feed_reads where day = ?').get(today) as { id: string } | undefined)?.id ?? null
    if (!pick || !pages.some((one) => one.id === pick && one.words >= ESSAY)) {
      pick = forgotten(pages.filter((one) => one.words >= ESSAY))[0]?.id ?? null
      if (pick) db.prepare('insert or replace into feed_reads (day, id) values (?, ?)').run(today, pick)
    }
    return { day: today, today: pick, pages: forgotten(pages), safe: false }
  })

  // --- reactions: what you mean by it, each changing when it next comes up.
  // One a post a day; choosing another first takes the last one's effect back.
  type Was = { weight?: number; visited?: string | null; day?: string; link?: string }
  const visitedColumn = (table: 'nuggets' | 'captures'): string => (table === 'nuggets' ? 'last_visited_at' : 'surfaced_at')
  const split = (key: string): [string, string] => [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  const undoReact = (day: string, key: string): void => {
    const row = db.prepare('select was from feed_reacts where day = ? and key = ?').get(day, key) as { was: string | null } | undefined
    if (!row) return
    const was = JSON.parse(row.was ?? '{}') as Was
    const [type, id] = split(key)
    const table = tableOf(type)
    if (table && was.weight !== undefined) db.prepare(`update ${table} set surfacing_weight = ? where id = ?`).run(was.weight, id)
    if (table && was.visited !== undefined) db.prepare(`update ${table} set ${visitedColumn(table)} = ? where id = ?`).run(was.visited, id)
    if (was.day && was.link) takeOutOfDay(was.day, was.link)
    db.prepare('delete from feed_reacts where day = ? and key = ?').run(day, key)
  }
  ipcMain.handle('haligtree:feed:react', (_event, key: string, reaction: Reaction | null): Reaction | null => {
    const day = dayKey()
    const [type, id] = split(key)
    const table = tableOf(type)
    undoReact(day, key)
    if (reaction) {
      const was: Was = {}
      // Less of this: the hints' own thumbs down, so it comes up less often everywhere.
      if (table && reaction === 'less') {
        was.weight = (db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(id) as { w: number } | undefined)?.w ?? 1
        db.prepare(`update ${table} set surfacing_weight = surfacing_weight * ? where id = ?`).run(LESS, id)
      }
      // A like, the heart: more of this, the opposite of "Less of this". It comes back sooner, up to four times as often.
      if (table && reaction === 'like') {
        was.weight = (db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(id) as { w: number } | undefined)?.w ?? 1
        db.prepare(`update ${table} set surfacing_weight = min(?, surfacing_weight * ?) where id = ?`).run(MOST, MORE, id)
      }
      if (reaction === 'use') {
        const title = (lookUp(key)?.title ?? 'Untitled').replace(/\s+/g, ' ').trim()
        was.day = day
        was.link = linkId(type, id)
        putInDay(day, was.link, cut(title || 'Untitled', 80))
      }
      db.prepare('insert into feed_reacts (day, key, reaction, was) values (?, ?, ?, ?)').run(day, key, reaction, JSON.stringify(was))
    }
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return reaction
  })


  // --- Liked: every post you hearted, newest like first, a page at a time; the weeks over the last year; what you keep liking.
  /** A liked note by its key, read on its own: the Feed's pool leaves out what has rested or been shown, Liked shows all but the private and binned. */
  const likedRow = (key: string): Row | undefined => {
    const [type, id] = split(key)
    if (type === 'day') return db.prepare("select 'day' as type, day as id, 'day' as kind, day as title, body, null as who, day as made, null as visited, 1 as weight from day_pages where day = ?").get(id) as Row | undefined
    if (type === 'capture') return db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight, (imported_at is not null) as archive from captures where id = ? and private = 0 and status != 'discarded'`).get(id) as Row | undefined
    if (type === 'nugget' || type === 'question' || type === 'article') return db.prepare(`select ? as type, id, kind, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited, surfacing_weight as weight from nuggets where id = ? and private = 0 and binned_at is null and superseded_by is null`).get(type, id) as Row | undefined
    return undefined
  }
  const likedPost = (row: Row, likes: number): FeedPost => {
    const gloss = (db.prepare('select body, created_at as at from glosses where item_id = ? order by created_at desc limit 1').get(row.id) as { body: string; at: string } | undefined) ?? null
    const span = db.prepare('select count(*) as n, min(created_at) as first from glosses where item_id = ?').get(row.id) as { n: number; first: string | null }
    return {
      type: row.type, id: row.id, kind: row.kind, title: row.title, text: words(row), who: row.who?.trim() || null, made: row.made, seen: null,
      gloss: row.type === 'question' ? null : gloss, clue: row.type === 'question' ? (gloss?.body ?? null) : null, react: 'like', replies: span.n, firstReply: span.first,
      seenTimes: 0, faded: 0, liked: Math.max(likes, row.type === 'day' ? 0 : likedSteps(row.weight)), tags: tagsOfRow(row).filter((tag) => tag !== 'bit' && tag !== LEARN_TAG).slice(0, 3), restack: null, links: linksOf(row.body ?? '')
    }
  }
  /** Each liked note once, at its newest like; `n` its likes in all. */
  const LIKED = "select key, max(day) as day, count(*) as n from feed_reacts where reaction = 'like' group by key order by max(day) desc, max(rowid) desc"
  ipcMain.handle('haligtree:feed:liked', (_event, offset: number, limit: number): { posts: LikedPost[]; more: boolean } => {
    if (gate().blackout) return { posts: [], more: false }
    const rows = db.prepare(`${LIKED} limit ? offset ?`).all(limit + 1, offset) as { key: string; day: string; n: number }[]
    const posts = rows.slice(0, limit).flatMap((one): LikedPost[] => {
      const row = likedRow(one.key)
      if (!row || (row.type !== 'day' && /(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`))) return []
      return [{ ...likedPost(row, one.n), likedOn: one.day, likes: one.n }]
    })
    return { posts, more: rows.length > limit }
  })
  /** Where in the list a week starts: how many notes were last liked after it. */
  ipcMain.handle('haligtree:feed:liked-at', (_event, end: string): number =>
    (db.prepare(`select count(*) as n from (${LIKED}) where day >= ?`).get(end) as { n: number }).n)
  ipcMain.handle('haligtree:feed:liked-side', (): LikedSide => {
    const none: LikedSide = { total: 0, notes: 0, weeks: [], tags: [], sources: [], yearAgo: [], yearAgoExact: false }
    if (gate().blackout) return none
    const all = db.prepare("select key, day from feed_reacts where reaction = 'like'").all() as { key: string; day: string }[]
    if (!all.length) return none
    // Fifty-two weeks, Monday first, the newest last.
    const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day').startOf('day')
    const weeks = Array.from({ length: 52 }, (_, at) => ({ start: dayKey(monday.subtract(51 - at, 'week')), n: 0 }))
    for (const one of all) {
      const day = dayjs(one.day).startOf('day')
      const at = 51 - Math.round(monday.diff(day.subtract((day.day() + 6) % 7, 'day'), 'day') / 7)
      if (at >= 0 && at < 52) weeks[at].n += 1
    }
    // What you keep liking: tags and sources across every liked note, each note counted once.
    const keys = [...new Set(all.map((one) => one.key))]
    const tags = new Map<string, number>()
    const filing = filingTags()
    const sources = new Map<string, { name: string; n: number }>()
    for (const key of keys) {
      const row = likedRow(key)
      if (!row || row.type === 'day') continue
      for (const tag of tagsOfRow(row)) if (tag !== 'bit' && tag !== LEARN_TAG && !filing.has(tag.toLowerCase())) tags.set(tag, (tags.get(tag) ?? 0) + 1)
      const who = row.who?.trim()
      if (who) sources.set(who.toLowerCase(), { name: sources.get(who.toLowerCase())?.name ?? who, n: (sources.get(who.toLowerCase())?.n ?? 0) + 1 })
    }
    // A year ago today, or else that week: what you liked then, back in front of you.
    const then = dayjs().subtract(1, 'year')
    const near = (db.prepare("select key, day from feed_reacts where reaction = 'like' and day between ? and ? order by abs(julianday(day) - julianday(?)), rowid desc").all(dayKey(then.subtract(3, 'day')), dayKey(then.add(3, 'day')), dayKey(then)) as { key: string; day: string }[])
    const yearAgo = near.flatMap((one): LikedPost[] => { const row = likedRow(one.key); return row ? [{ ...likedPost(row, 1), likedOn: one.day, likes: 1 }] : [] }).slice(0, 2)
    return {
      total: all.length, notes: keys.length, weeks,
      tags: [...tags].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([tag, n]) => ({ tag, n })),
      sources: [...sources.values()].filter((one) => one.n >= 2).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 3),
      yearAgo, yearAgoExact: yearAgo.some((one) => one.likedOn === dayKey(then))
    }
  })
  // Unliked in Liked: every like of it goes and its pull back comes off; Undo puts each like and the pull back as they were.
  ipcMain.handle('haligtree:feed:unlike', (_event, key: string): { rows: { day: string; was: string | null }[]; weight: number | null } => {
    const [type, id] = split(key)
    const table = tableOf(type)
    const weight = table ? ((db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(id) as { w: number } | undefined)?.w ?? null) : null
    const rows = db.prepare("select day, was from feed_reacts where key = ? and reaction = 'like' order by day desc").all(key) as { day: string; was: string | null }[]
    for (const one of rows) undoReact(one.day, key)
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return { rows, weight }
  })
  ipcMain.handle('haligtree:feed:relike', (_event, key: string, kept: { rows: { day: string; was: string | null }[]; weight: number | null }): boolean => {
    const [type, id] = split(key)
    const table = tableOf(type)
    for (const one of kept.rows) db.prepare("insert or replace into feed_reacts (day, key, reaction, was) values (?, ?, 'like', ?)").run(one.day, key, one.was)
    if (table && kept.weight !== null) db.prepare(`update ${table} set surfacing_weight = ? where id = ?`).run(kept.weight, id)
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return true
  })
  // A probe's way to lay down likes over years in a sandbox; never there outside a test run.
  if (process.env.HALIGTREE_QA_AWAY) (globalThis as { qaFeedSql?: unknown }).qaFeedSql = (sql: string, ...args: (string | number | null)[]) => (/^\s*select/i.test(sql) ? db.prepare(sql).all(...args) : db.prepare(sql).run(...args))

  // How far it has faded, for a note's own details; and "Show as before", which takes every fade back.
  ipcMain.handle('haligtree:feed:faded', (_event, type: string, id: string): number => {
    const table = tableOf(type)
    return table ? fadedSteps((db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(id) as { w: number } | undefined)?.w) : 0
  })
  ipcMain.handle('haligtree:feed:unfade', (_event, type: string, id: string): number | null => {
    const table = tableOf(type)
    if (!table) return null
    const was = (db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(id) as { w: number } | undefined)?.w ?? 1
    db.prepare(`update ${table} set surfacing_weight = 1 where id = ? and surfacing_weight < 1`).run(id)
    // Today's "Less of this" goes with it, so the post no longer says it.
    for (const key of [`${type}:${id}`, ...(type === 'nugget' ? [`question:${id}`, `article:${id}`] : [])]) db.prepare("delete from feed_reacts where day = ? and key = ? and reaction = 'less'").run(dayKey(), key)
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return was
  })
  // Undo of "Show as before": the weight it had.
  ipcMain.handle('haligtree:feed:refade', (_event, type: string, id: string, weight: number): boolean => {
    const table = tableOf(type)
    if (!table || !(Number(weight) > 0)) return false
    db.prepare(`update ${table} set surfacing_weight = ? where id = ?`).run(Number(weight), id)
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return true
  })

  // Use this: a line on today's Journal page linking to it, where you write today.
  type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string }
  const dayDoc = (day: string): Node => {
    const page = db.prepare('select body from day_pages where day = ?').get(day) as { body: string | null } | undefined
    let doc = JSON.parse(page?.body ?? 'null') as Node | string | null
    if (typeof doc === 'string') doc = { type: 'doc', content: doc.split('\n\n').map((one): Node => (one ? { type: 'paragraph', content: [{ type: 'text', text: one }] } : { type: 'paragraph' })) }
    return doc?.content ? doc : { type: 'doc', content: [] }
  }
  const saveDay = (day: string, doc: Node): void =>
    void db.prepare(`insert into day_pages (day, body, reviewed, updated_at) values (?, ?, 0, ?)
      on conflict (day) do update set body = excluded.body, updated_at = excluded.updated_at`).run(day, JSON.stringify(doc), new Date().toISOString())
  const putInDay = (day: string, link: string, label: string): void => {
    const doc = dayDoc(day)
    const content = doc.content!
    // An empty last line is written over rather than left above it.
    while (content.length && content.at(-1)!.type === 'paragraph' && !content.at(-1)!.content?.length) content.pop()
    content.push({ type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: link, label } }] })
    saveDay(day, doc)
  }
  const takeOutOfDay = (day: string, link: string): void => {
    const doc = dayDoc(day)
    const at = doc.content!.findLastIndex((node) => node.type === 'paragraph' && node.content?.length === 1 && node.content[0].type === 'noteLink' && node.content[0].attrs?.id === link)
    if (at < 0) return
    doc.content!.splice(at, 1)
    saveDay(day, doc)
  }

  // --- restack: a new gem in your words, linking to the old note, at the top of tomorrow's Feed.
  ipcMain.handle('haligtree:feed:restack', (_event, key: string, text: string, mind = false): string | null => {
    const said = String(text ?? '').trim()
    const old = lookUp(key)
    if (!said || !old) return null
    const id = randomUUID()
    const at = new Date().toISOString()
    const doc: Node = { type: 'doc', content: [
      ...said.split('\n').filter((line) => line.trim()).map((line): Node => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
      { type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: linkId(old.type, old.id), label: cut(old.title.replace(/\s+/g, ' ').trim() || 'Untitled', 80) } }] }
    ] }
    db.prepare("insert into nuggets (id, kind, title, body, created_at, updated_at) values (?, 'note', ?, ?, ?, ?)").run(id, cut(said.split('\n')[0], 160), JSON.stringify(doc), at, at)
    db.prepare('insert into feed_restacks (id, of_key, made_day) values (?, ?, ?)').run(id, key, dayKey())
    // "Changed my mind": the old note is marked, so wherever it shows it points to what you think now.
    if (mind) {
      db.prepare('insert or replace into feed_changed (id, new_id, at) values (?, ?, ?)').run(old.id, id, at)
      changed({ kind: old.type === 'capture' ? 'capture' : 'item', id: old.id })
    }
    changed({ kind: 'item', id })
    return id
  })
  ipcMain.handle('haligtree:feed:unrestack', (_event, id: string): boolean => {
    if (!db.prepare('select 1 from feed_restacks where id = ?').get(id)) return false
    db.prepare('delete from glosses where item_id = ?').run(id)
    db.prepare('delete from nuggets where id = ?').run(id)
    db.prepare('delete from feed_restacks where id = ?').run(id)
    db.prepare('delete from feed_changed where new_id = ?').run(id)
    changed({ kind: 'item', id })
    return true
  })

}
