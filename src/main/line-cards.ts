import { randomUUID } from 'crypto'
import { database } from './captures'
import { lineCardsIn, matchLineCards } from './study'

/**
 * Cards written inside a note: every "question :: answer" line in a capture,
 * a gem, an article or a day's page is a review card of its own (a nugget
 * whose tier is 'card'), pointing back at its note by `line_of`
 * (`capture:…`, `nugget:…` or `day:2026-10-10`). Called on every save of
 * the note, it keeps the cards in step with the lines: an edited line keeps
 * its card and its schedule, a new line makes one, a line taken out takes
 * its card out of Review (put away if it was ever reviewed, so its history
 * stays; gone if not). Gives back whether anything changed.
 */
export function syncLineCards(source: string, body: unknown, privacy = 0): boolean {
  if (body === undefined) return false
  const db = database()
  const had = db.prepare("select id, prompt, body, archived_at as archivedAt, state, private from nuggets where tier = 'card' and line_of = ? order by created_at, rowid").all(source) as
    { id: string; prompt: string | null; body: string; archivedAt: string | null; state: string | null; private: number }[]
  const lines = lineCardsIn(typeof body === 'string' ? (body.trim().startsWith('{') ? safe(body) : body) : body)
  if (!lines.length && !had.some((card) => !card.archivedAt)) return false
  const { keep, add, drop } = matchLineCards(had, lines)
  const at = new Date().toISOString()
  let moved = false
  for (const { card, line } of keep) {
    const answer = JSON.stringify(line.answer)
    if (card.prompt === line.question && card.body === answer && !card.archivedAt && card.private === privacy) continue
    db.prepare('update nuggets set prompt = ?, body = ?, archived_at = null, private = ?, updated_at = ? where id = ?').run(line.question, answer, privacy, at, card.id)
    moved = true
  }
  for (const line of add) {
    db.prepare("insert into nuggets (id, tier, kind, title, body, prompt, line_of, private, created_at, updated_at) values (?, 'card', 'note', '', ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), JSON.stringify(line.answer), line.question, source, privacy, at, at)
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

const safe = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

