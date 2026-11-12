import { randomUUID } from 'crypto'
import { changed, database } from './captures'
import { linesIn } from './kept-words'
import { ask } from './reader'
import { named } from './stalls'
import { matchLineCards } from './study'

type Line = { question: string; answer: string }

/**
 * Cards written inside a note: every "question :: answer" line in a capture,
 * a gem, a page or a day's page is a review card of its own (a nugget
 * whose tier is 'card'), pointing back at its note by `line_of`
 * (`capture:…`, `nugget:…` or `day:2026-10-10`). Called on every save of
 * the note, it keeps the cards in step with the lines: an edited line keeps
 * its card and its schedule, a new line makes one, a line taken out takes
 * its card out of Review (put away if it was ever reviewed, so its history
 * stays; gone if not). Gives back whether anything changed.
 */
export function syncLineCards(source: string, body: unknown, privacy = 0): boolean {
  if (body === undefined) return false
  const { lines, tags } = linesIn(body)
  return keepLineCards(source, lines, tags, privacy)
}

/**
 * The cards of a note put in step with its lines, once those are read out of its words: `tags` are the note's
 * #tags, which go on each of its cards (kept as the card's title, which every tag count, filter and export already
 * reads), so studying #biology asks the cards written in a #biology note. One small write; whether anything changed.
 */
export function keepLineCards(source: string, lines: Line[], tags: string, privacy = 0): boolean {
  const db = database()
  const had = db.prepare("select id, prompt, body, title, archived_at as archivedAt, state, private from nuggets where tier = 'card' and line_of = ? order by created_at, rowid").all(source) as
    { id: string; prompt: string | null; body: string; title: string | null; archivedAt: string | null; state: string | null; private: number }[]
  if (!lines.length && !had.some((card) => !card.archivedAt)) return false
  const { keep, add, drop } = matchLineCards(had, lines)
  const at = new Date().toISOString()
  let moved = false
  for (const { card, line } of keep) {
    const answer = JSON.stringify(line.answer)
    if (card.prompt === line.question && card.body === answer && (card.title ?? '') === tags && !card.archivedAt && card.private === privacy) continue
    db.prepare('update nuggets set prompt = ?, body = ?, title = ?, archived_at = null, private = ?, updated_at = ? where id = ?').run(line.question, answer, tags, privacy, at, card.id)
    moved = true
  }
  for (const line of add) {
    db.prepare("insert into nuggets (id, tier, kind, title, body, prompt, line_of, private, created_at, updated_at) values (?, 'card', 'note', ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), tags, JSON.stringify(line.answer), line.question, source, privacy, at, at)
    moved = true
  }
  for (const card of drop) {
    if (card.archivedAt) continue
    if (card.state) db.prepare('update nuggets set archived_at = ? where id = ?').run(at, card.id)
    else db.prepare('delete from nuggets where id = ?').run(card.id)
    moved = true
  }
  return moved
}

/**
 * The same for a note an editor has just saved, without holding the save: its lines are read out of the stored
 * words on the reading thread (the whole document is walked: 15 ms of main's thread for a 4 MB note), and its
 * cards put in step here when that answers, a few milliseconds later for an ordinary note. A newer save of the same
 * note while one is being read waits its turn and takes the place of any save waiting before it (reader.ts `slot`),
 * so the cards always end as the last words have them. A card of a note is never read for cards of its own.
 */
export function lineCardsSoon(table: 'captures' | 'nuggets', id: string): void {
  void ask('note:lines', [table, id], `lines:${table}:${id}`).then((found) => {
    if (!found) return
    named('save: line cards kept', () => {
      const own = database().prepare(`select ${table === 'nuggets' ? 'tier' : "'' as tier"}, private from ${table} where id = ?`).get(id) as { tier: string; private: number } | undefined
      if (!own || own.tier === 'card') return
      // Cards came or went: said as theirs (by what they point back at, never the note's own id), so no editor
      // of the note reads its words again for it.
      const source = `${table === 'nuggets' ? 'nugget' : 'capture'}:${id}`
      if (keepLineCards(source, found.lines, found.tags, own.private)) changed({ kind: 'item', id: source })
    })
  }, (error) => console.error('The cards written in a note were not read:', error))
}
