import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { LABEL, changed, database } from './captures'
import { cut } from './clip'
import { cardForQuiz, cardWords, dueCards, gate, plain } from './haligtree'
import { tagsIn } from './tag-words'
import { LEARN_TAG } from './name'
import { dayKey, dayjs } from './dates'

/**
 * The Feed: about twenty of your own things a day, picked once and kept for
 * the day, so a reload shows the same posts and tomorrow brings a new set.
 * Gems, quotes, questions you hold with their newest clue, and old Journal
 * days, the ones longest since you last saw them first. Never private, never
 * a #bit, nothing at all in Safe mode.
 */
export type FeedPost = {
  type: 'capture' | 'nugget' | 'article' | 'question' | 'day' | 'poll' | 'quiz'
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
  /** Its tags, a few, each a way to its tag page. */
  tags: string[]
  /** A gem you restacked: the note it quotes. */
  restack: { type: FeedPost['type']; id: string; title: string; text: string; who: string | null; kind: string } | null
  /** A decision made weeks ago, asked about again: what you said today, and every answer you have given it. */
  poll?: { open: { type: 'capture' | 'nugget'; id: string }; answer: PollAnswer | null; answers: Record<PollAnswer, number> }
  /** A Review card due, asked here: its question, its answer, each grade's next date, and today's grade once given. */
  quiz?: { prompt: string; answer: string; intervals: Record<number, string>; graded: { grade: number; due: string } | null }
}
export type PollAnswer = 'yes' | 'mixed' | 'no'
/** How long after it was decided a decision is first asked about, and how long before it is asked again. */
const POLL_AFTER = 21
const POLL_AGAIN = 28
/** Quiz cards a day at most. */
const QUIZZES = 2
export type Reaction = 'true' | 'changed' | 'use' | 'less'
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
/** Words a minute, read at an easy pace. */
const PACE = 230
/** Today's read is an essay: a page this long at least. */
const ESSAY = 150
export type Feed = { day: string; posts: FeedPost[]; safe: boolean }
/** The Feed's side column: who and what has gone quiet, and the tags you wrote most this week. Never anything about other people. */
export type FeedSide = { quiet: { kind: 'source' | 'tag'; name: string; last: string }[]; week: { tag: string; n: number }[] }

const SIZE = 24
/** Times faded, from its weight: each "Less of this" is one step of LESS. */
export const fadedSteps = (weight: number | null | undefined): number => (weight && weight < 0.99 ? Math.max(1, Math.round(Math.log(weight) / Math.log(LESS))) : 0)
/** A Page's dek: about this long, cut at a word. */
const DEK = 180
/** A link's label clipped short: "Rosetta Stone, found in 1799: one decre…". */
const CLIPPED = /(?:…|\.\.\.)\s*$/
/** A date said first, as a clue or a dated line starts: "7 May 2026 · ", "Tue 4 March: ", "2026-05-07 - ". */
const LEAD_DATE = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:\d{1,2}\s+[a-z]{3,9}\.?(?:\s+\d{4})?|[a-z]{3,9}\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2})\s*(?:[·:,–-]\s*)/i
/** What a dek never reads: pictures, embeds and other blocks that are not prose. */
const NOT_PROSE = new Set(['noteEmbed', 'image', 'imagePlaceholder', 'attachment', 'bookmark', 'excalidraw', 'tableOfContents', 'codeBlock', 'horizontalRule', 'table', 'columns'])
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
type Row = { type: FeedPost['type']; id: string; kind: string; title: string; body: string | null; who: string | null; made: string; visited: string | null; weight: number }
/** How much less often "Less of this" makes it come up: the same step as a hint's thumbs down. */
const LESS = 1 / 1.5
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
const tableOf = (type: string): 'nuggets' | 'captures' | null => (type === 'capture' ? 'captures' : type === 'day' ? null : 'nuggets')
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

  // --- polls: a decision made weeks ago, asked about again.
  type Decision = { table: 'captures' | 'nuggets'; id: string; title: string; fields: string; made: string }
  const decisionOf = (table: 'captures' | 'nuggets', id: string): Decision | undefined => decisions(id).find((one) => one.table === table)
  /** Every decision that is Decided, of yours and not private; one id alone, or all of them. */
  const decisions = (only?: string): Decision[] => {
    const one = only ? 'and id = ?' : ''
    const args = only ? [only] : []
    const where = "kind in ('decision', 'checkback') and private = 0 and archived_at is null and json_valid(fields) and json_extract(fields, '$.state') = 'Decided'"
    return [
      ...db.prepare(`select 'captures' as \`table\`, id, ${LABEL} as title, fields, captured_at as made from captures where ${where} and status != 'discarded' ${one}`).all(...args),
      ...db.prepare(`select 'nuggets' as \`table\`, id, coalesce(nullif(title, ''), label('', body)) as title, fields, created_at as made from nuggets where ${where} and binned_at is null and superseded_by is null ${one}`).all(...args)
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

  /** Everything the Feed may show, as rows: private ones and #bits are never read. */
  const pool = (): Row[] => {
    const nuggets = db.prepare(`select case when tier = 'question' then 'question' else 'nugget' end as type, id, kind, coalesce(nullif(title, ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited, surfacing_weight as weight
      from nuggets where tier in ('nugget', 'question') and private = 0 and suspended = 0 and archived_at is null and superseded_by is null and binned_at is null and (tier != 'question' or closed_at is null)`).all() as Row[]
    // A quote still a capture; one already a gem comes as the gem.
    const quotes = db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight
      from captures where kind = 'quote' and private = 0 and status != 'discarded' and archived_at is null
      and id not in (select capture_id from nuggets where capture_id is not null)`).all() as Row[]
    // A note or a page of yours with a picture in it: the posts you look at, not only read.
    const PICTURED = "(body like '%](%.webp)%' or body like '%](%.png)%' or body like '%](%.jp%g)%' or body like '%\"type\":\"image\"%')"
    const pictured = [
      ...db.prepare(`select 'capture' as type, id, kind, ${LABEL} as title, body, null as who, captured_at as made, surfaced_at as visited, surfacing_weight as weight
        from captures where kind not in ('quote', 'task') and private = 0 and status != 'discarded' and archived_at is null and ${PICTURED}
        and id not in (select capture_id from nuggets where capture_id is not null)`).all(),
      ...db.prepare(`select 'article' as type, id, kind, coalesce(nullif(title, ''), label('', body)) as title, body, null as who, created_at as made, last_visited_at as visited, surfacing_weight as weight
        from nuggets where tier = 'article' and private = 0 and archived_at is null and superseded_by is null and binned_at is null and ${PICTURED}`).all()
    ] as Row[]
    // A Journal day at least a week old with something written on it.
    const days = db.prepare("select 'day' as type, day as id, 'day' as kind, day as title, body, null as who, day as made, null as visited, 1 as weight from day_pages where day < ? and length(coalesce(body, '')) > 40")
      .all(dayKey(dayjs().subtract(7, 'day'))) as Row[]
    return [...nuggets, ...quotes, ...pictured, ...days].filter((row) => !/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`))
  }

  /** When each was last in front of you: an open, a hint, or an earlier day's Feed. */
  const seenOf = (): { seen: Map<string, string>; times: Map<string, number> } => {
    const seen = new Map<string, string>()
    const times = new Map<string, number>()
    const count = (id: string, n = 1): void => void times.set(id, (times.get(id) ?? 0) + n)
    for (const row of db.prepare('select nugget_id as id, count(*) as n from hint_events group by nugget_id').all() as { id: string; n: number }[]) count(row.id, row.n)
    const note = (id: string, at: string | null): void => void (at && at > (seen.get(id) ?? '') && seen.set(id, at))
    for (const row of db.prepare('select id, at from note_opens').all() as { id: string; at: string }[]) note(row.id, row.at)
    for (const row of db.prepare('select nugget_id as id, max(shown_at) as at from hint_events group by nugget_id').all() as { id: string; at: string }[]) note(row.id, row.at)
    for (const row of db.prepare('select day, keys from feed_days where day < ?').all(dayKey()) as { day: string; keys: string }[])
      for (const key of JSON.parse(row.keys) as string[]) {
        note(key.slice(key.indexOf(':') + 1), dayjs(row.day).toISOString())
        count(key.slice(key.indexOf(':') + 1))
      }
    return { seen, times }
  }

  const words = (row: Row): string => {
    let text = cardWords(row.body ?? '').replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '')
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    // The title is said once: lines it already says go, as Home's cards drop them. A quote keeps its words whole.
    const flat = (said: string): string => said.toLowerCase().replace(/#\p{L}[\p{L}\p{N}_/-]*/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const name = flat(row.title)
    if (row.kind !== 'quote' && row.type !== 'day') while (lines.length && name.includes(flat(lines[0]))) lines.shift()
    text = lines.join('\n')
    return text.length > 600 ? `${text.slice(0, 600).replace(/\s+\S*$/, '')}…` : text
  }

  ipcMain.handle('haligtree:feed', (): Feed => {
    const today = dayKey()
    if (gate().blackout) return { day: today, posts: [], safe: true }
    const rows = pool()
    const byKey = new Map(rows.map((row) => [`${row.type}:${row.id}`, row]))
    const { seen, times } = seenOf()
    const lastSeen = (row: Row): string | null => [row.visited, seen.get(row.id)].filter(Boolean).sort().at(-1) ?? null
    let keys = (db.prepare('select keys from feed_days where day = ?').get(today) as { keys: string } | undefined)?.keys
    if (!keys) {
      // Each kind longest unseen first, then taken in turns so no one kind fills the day.
      // The hints' rhythm: time since you last saw it, times how often you want it ("Less of this" fades it).
      const due = (row: Row): number => (Date.now() - new Date(lastSeen(row) ?? row.made).getTime()) * (row.weight ?? 1)
      const order = (list: Row[]): Row[] => list.sort((a, b) => due(b) - due(a))
      // Gems you restacked before today come first, once: "You restacked".
      const stacked = (db.prepare('select id from feed_restacks where made_day < ? and shown_day is null order by made_day').all(today) as { id: string }[])
        .map((one) => byKey.get(`nugget:${one.id}`)).filter((one): one is Row => !!one)
      for (const one of stacked) rows.splice(rows.indexOf(one), 1)
      const lanes = [
        order(rows.filter((row) => row.type === 'nugget' && row.kind !== 'quote')),
        order(rows.filter((row) => row.kind === 'quote')),
        order(rows.filter((row) => row.type === 'question')),
        order(rows.filter((row) => row.type === 'day')),
        order(rows.filter((row) => (row.type === 'capture' || row.type === 'article') && row.kind !== 'quote'))
      ]
      // Gems and quotes are the most of it: two each a turn, a question, a day and a picture one.
      const share = [2, 2, 1, 1, 1]
      // A poll and a quiz card or two are part of the twenty, set among the notes rather than at the top.
      const asks = [...pickPoll(today), ...pickQuiz()]
      const room = Math.max(0, SIZE - asks.length - stacked.length)
      const picked: Row[] = []
      while (picked.length < room && lanes.some((lane) => lane.length))
        lanes.forEach((lane, at) => picked.push(...lane.splice(0, share[at]).slice(0, room - picked.length)))
      const list = [...stacked, ...order(picked)].map((row) => `${row.type}:${row.id}`)
      asks.forEach((key, at) => list.splice(Math.min(list.length, 3 + at * 5), 0, key))
      keys = JSON.stringify(list)
      db.prepare('update feed_restacks set shown_day = ? where shown_day is null and made_day < ?').run(today, today)
      db.prepare('insert or replace into feed_days (day, keys) values (?, ?)').run(today, keys)
    }
    const glossOf = db.prepare('select body, created_at as at from glosses where item_id = ? order by created_at desc limit 1')
    const glossSpan = db.prepare('select count(*) as n, min(created_at) as first from glosses where item_id = ?')
    const reacts = new Map((db.prepare('select key, reaction from feed_reacts where day = ?').all(today) as { key: string; reaction: Reaction }[]).map((one) => [one.key, one.reaction]))
    const restackOf = db.prepare('select of_key from feed_restacks where id = ?')
    const quoted = (row: Row): FeedPost['restack'] => {
      if (row.type !== 'nugget') return null
      const of = (restackOf.get(row.id) as { of_key: string } | undefined)?.of_key
      const old = of ? (byKey.get(of) ?? lookUp(of)) : undefined
      return old ? { type: old.type, id: old.id, title: old.title, text: words(old), who: old.who?.trim() || null, kind: old.kind } : null
    }
    const graded = db.prepare('select grade, due from feed_quiz where day = ? and id = ?')
    // Read now, not from the morning's pool: a "Less of this" a moment ago shows at once.
    const weightOf = (row: Row): number => { const table = tableOf(row.type); return table ? ((db.prepare(`select surfacing_weight as w from ${table} where id = ?`).get(row.id) as { w: number } | undefined)?.w ?? 1) : 1 }
    const pollAnswer = db.prepare('select answer from feed_polls where day = ? and key = ?')
    const blank = { who: null, seen: null, gloss: null, clue: null, react: null, replies: 0, firstReply: null, seenTimes: 0, faded: 0, tags: [], restack: null }
    const asked = (key: string): FeedPost[] => {
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
    const posts = (JSON.parse(keys) as string[]).flatMap((key): FeedPost[] => {
      if (key.startsWith('poll:') || key.startsWith('quiz:')) return asked(key)
      const row = byKey.get(key)
      if (!row) return []
      const gloss = (glossOf.get(row.id) as { body: string; at: string } | undefined) ?? null
      const span = glossSpan.get(row.id) as { n: number; first: string | null }
      return [{
        type: row.type, id: row.id, kind: row.kind, title: row.title, text: words(row), who: row.who?.trim() || null, made: row.made,
        seen: lastSeen(row), gloss: row.type === 'question' ? null : gloss, clue: row.type === 'question' ? (gloss?.body ?? null) : null,
        react: reacts.get(key) ?? null, replies: span.n, firstReply: span.first, seenTimes: times.get(row.id) ?? 0, faded: fadedSteps(weightOf(row)), tags: tagsOfRow(row).filter((tag) => tag !== 'bit' && tag !== LEARN_TAG).slice(0, 3), restack: quoted(row)
      }]
    })
    return { day: today, posts, safe: false }
  })

  // --- the side column: who and what you have not heard from, and this week's tags.
  const tagsOfRow = (row: { title: string; body: string | null }): string[] => {
    let text = row.body ?? ''
    try { text = plain(JSON.parse(text)) } catch { /* Markdown, as it is */ }
    return tagsIn(`${row.title} ${text}`)
  }
  ipcMain.handle('haligtree:feed:side', (): FeedSide => {
    if (gate().blackout) return { quiet: [], week: [] }
    const { seen } = seenOf()
    // What is in today's Feed is heard from today.
    const now = new Date().toISOString()
    const today = new Set(JSON.parse((db.prepare('select keys from feed_days where day = ?').get(dayKey()) as { keys: string } | undefined)?.keys ?? '[]') as string[])
    // Each source and tag by the last time any of its notes was in front of you, or written.
    const last = new Map<string, { kind: 'source' | 'tag'; name: string; last: string; n: number }>()
    const note = (kind: 'source' | 'tag', name: string, at: string): void => {
      const key = `${kind}:${name.toLowerCase()}`
      const one = last.get(key) ?? { kind, name, last: '', n: 0 }
      one.n += 1
      if (at > one.last) one.last = at
      last.set(key, one)
    }
    // Every note of yours that may be shown, not only those the Feed picks from.
    const notes = [
      ...db.prepare("select case when tier = 'question' then 'question' else 'nugget' end as type, id, coalesce(nullif(title, ''), label('', body)) as title, body, attribution as who, created_at as made, last_visited_at as visited from nuggets where private = 0 and archived_at is null and superseded_by is null and binned_at is null and tier in ('nugget', 'question', 'article')").all(),
      ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, body, attribution as who, captured_at as made, surfaced_at as visited from captures where private = 0 and status != 'discarded' and archived_at is null and kind != 'task'`).all()
    ] as Row[]
    for (const row of notes) {
      if (/(^|\s)#bit\b/i.test(`${row.title} ${row.body ?? ''}`)) continue
      const at = today.has(`${row.type}:${row.id}`) || today.has(`article:${row.id}`) ? now : [row.made, row.visited, seen.get(row.id)].filter((one): one is string => !!one).sort().at(-1)!
      if (row.who?.trim()) note('source', row.who.trim(), at)
      for (const tag of tagsOfRow(row)) note('tag', tag, at)
    }
    // Only those with a few notes: one note gone quiet is just a note.
    // And only what has been quiet a month or more: a few days is not a while.
    const month = dayjs().subtract(28, 'day').toISOString()
    const quiet = [...last.values()].filter((one) => one.n >= 2 && one.last < month && one.name !== LEARN_TAG).sort((a, b) => a.last.localeCompare(b.last)).slice(0, 3).map(({ kind, name, last: at }) => ({ kind, name, last: at }))
    const since = dayjs().subtract(7, 'day').toISOString()
    const counts = new Map<string, number>()
    const recent = [
      ...db.prepare("select title, body from nuggets where private = 0 and archived_at is null and superseded_by is null and binned_at is null and tier != 'card' and created_at >= ?").all(since),
      ...db.prepare(`select ${LABEL} as title, body from captures where private = 0 and status != 'discarded' and archived_at is null and captured_at >= ?`).all(since)
    ] as { title: string; body: string | null }[]
    for (const row of recent) for (const tag of tagsOfRow(row)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    const week = [...counts].filter(([tag]) => tag !== 'bit' && tag !== LEARN_TAG).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([tag, n]) => ({ tag, n }))
    return { quiet, week }
  })

  /** One note by its feed key, for a restack whose old note is not in the day's set. A Page restacked from Reading may have no picture, so it is read on its own. */
  const lookUp = (key: string): Row | undefined => pool().find((row) => `${row.type}:${row.id}` === key) ?? (key.startsWith('article:') ? (db.prepare(`select 'article' as type, id, kind, coalesce(nullif(title, ''), label('', body)) as title, body, null as who, created_at as made, last_visited_at as visited, surfacing_weight as weight
    from nuggets where id = ? and tier = 'article' and private = 0 and archived_at is null and binned_at is null`).get(key.slice(8)) as Row | undefined) : undefined)

  // --- Reading: your Pages as a reading list, the one longest unread first.
  ipcMain.handle('haligtree:feed:reading', (): Reading => {
    const today = dayKey()
    if (gate().blackout) return { day: today, today: null, pages: [], safe: true }
    const opens = new Map((db.prepare('select id, at from note_opens').all() as { id: string; at: string }[]).map((row) => [row.id, row.at]))
    const rows = db.prepare(`select n.id, coalesce(nullif(n.title, ''), label('', n.body)) as title, n.body, n.created_at as made, n.last_visited_at as visited, n.pinned_at as pinned,
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
    if (!pick || !pages.some((one) => one.id === pick)) {
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
      // Still true: seen and kept today, so its usual rhythm starts again from now.
      if (table && reaction === 'true') {
        was.visited = (db.prepare(`select ${visitedColumn(table)} as v from ${table} where id = ?`).get(id) as { v: string | null } | undefined)?.v ?? null
        db.prepare(`update ${table} set ${visitedColumn(table)} = ? where id = ?`).run(new Date().toISOString(), id)
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
  ipcMain.handle('haligtree:feed:restack', (_event, key: string, text: string): string | null => {
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
    changed({ kind: 'item', id })
    return id
  })
  ipcMain.handle('haligtree:feed:unrestack', (_event, id: string): boolean => {
    if (!db.prepare('select 1 from feed_restacks where id = ?').get(id)) return false
    db.prepare('delete from glosses where item_id = ?').run(id)
    db.prepare('delete from nuggets where id = ?').run(id)
    db.prepare('delete from feed_restacks where id = ?').run(id)
    changed({ kind: 'item', id })
    return true
  })

}
