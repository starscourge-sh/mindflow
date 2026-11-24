import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { cardWords } from './card-words'
import { cut } from './clip'
import { dayKey, dayjs } from './dates'
import { LEARN_TAG } from './name'
import { noteTags } from './book-tags'

/**
 * Home, as a read of the book and nothing else (no Electron in it): what was
 * opened and edited last, what is due, this week's notes, the tags used most
 * and a note from this day in an earlier year, each with a few of its words.
 * It reads every note, so it is asked of the reading thread (reader.ts) and
 * never holds main; what only main knows comes with the ask (quiet hours,
 * and Review's own list of what is due).
 */

/** One thing on a Home shelf: a capture, nugget, article or question. */
export type Shelved = { type: string; id: string; title: string; kind: string; private: number; at: string; who?: string | null; where?: string | null; year?: string | null }
/** A Check back whose day has come: `at` is that day, `ask` what it asks you then, `answer` what you said last time. */
export type Returning = Shelved & { ask: string; answer: string }
/** What main knows and Home needs: quiet hours and Safe mode (`gate`), and the cards Review would ask now, in its order. */
export type HomeAsk = { blackout: boolean; hidePrivate: boolean; due: string[] }

const ago = (days: number): string => dayjs().subtract(days, 'day').toISOString()

export function bookHome(db: DatabaseSync) {
  // Every note in view, as a shelf shows it: newest change first.
  const NOTES = `select id, 'capture' as type, ${LABEL} as title, kind, private, coalesce(edited_at, captured_at) as at, captured_at as made, body, attribution as who, medium as "where", case when json_valid(fields) then nullif(cast(json_extract(fields, '$.year') as text), '') end as year, fields from captures where status != 'discarded' and archived_at is null
    union all select id, tier, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)), kind, private, coalesce(updated_at, created_at), created_at, body, attribution, medium, case when json_valid(fields) then nullif(cast(json_extract(fields, '$.year') as text), '') end, fields from nuggets where archived_at is null and superseded_by is null and tier not in ('card', 'deck')`
  // Who said it, only for a quote: its card signs it, with where it is from and its year, as the capture page does.
  const strip = ({ type, id, title, kind, private: hidden, at, who, where, year }: Shelved): Shelved => ({ type, id, title, kind, private: hidden, at, ...(kind === 'quote' && who ? { who, where, year } : {}) })


  // A Check back on its day, not answered since: one of the kind, or a page
  // (a question page among them) tagged #checkback and given its day and its
  // question. Each comes back with its question, to be answered in place. Oldest due first; a date said in words
  // before dates were dates never counts.
  const returning = (): Returning[] => {
    const end = dayjs().endOf('day').toISOString()
    const rows = db.prepare(`select id, 'capture' as type, ${LABEL} as title, kind, private, fields from captures where status != 'discarded' and archived_at is null and kind = 'checkback' and fields is not null
      union all select id, tier, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)), kind, private, fields from nuggets where archived_at is null and superseded_by is null and (kind = 'checkback' or (json_valid(fields) and json_extract(fields, '$.back') is not null and json_extract(fields, '$.ask') is not null)) and fields is not null`).all() as (Shelved & { fields: string })[]
    return rows.flatMap(({ fields, ...row }) => {
      let f: Record<string, string> = {}
      try { f = JSON.parse(fields) } catch { return [] }
      const at = f.back
      if (!at || !/^\d{4}-\d\d-\d\dT/.test(at) || at > end || (f.answeredAt && dayKey(f.answeredAt) >= dayKey(at))) return []
      return [{ ...row, at, ask: f.ask ?? '', answer: f.answer ?? '' }]
    }).sort((a, b) => a.at.localeCompare(b.at))
  }

  const home = ({ blackout, hidePrivate, due: dueIds }: HomeAsk) => {
    const every = db.prepare(NOTES).all() as (Shelved & { made: string; body: string | null; fields: string | null })[]
    // A note saved as a gem shows once, as the gem: out of every list here, and opened, it stands for its gem.
    const ids = new Set(every.map((row) => row.id))
    const gemOf = new Map((db.prepare("select capture_id, id from nuggets where capture_id is not null and tier not in ('card', 'deck')").all() as { capture_id: string; id: string }[])
      .filter((one) => ids.has(one.id)).map((one) => [one.capture_id, one.id]))
    // A note kept as a gem is the gem's: with its gem put away (archived, Start fresh), the note is out of sight too, as in the Feed.
    const kept = new Set((db.prepare("select capture_id as id from nuggets where capture_id is not null and binned_at is null and tier not in ('card', 'deck')").all() as { id: string }[]).map((one) => one.id))
    const all = every.filter((row) => row.type !== 'capture' || (!gemOf.has(row.id) && !kept.has(row.id)))
    const byId = new Map(all.map((row) => [row.id, row]))
    for (const [note, gem] of gemOf) if (byId.has(gem)) byId.set(note, byId.get(gem)!)
    // Asked for, so private ones show (blurred); offered, so they wait out quiet hours.
    const offered = (row: Shelved): boolean => !(hidePrivate && row.private)
    const opened = (db.prepare('select id, at from note_opens order by at desc limit 24').all() as { id: string; at: string }[])
      .flatMap((open) => { const row = byId.get(open.id); return row && row.type !== 'question' && row.type !== 'goal' ? [{ ...strip(row), at: open.at }] : [] })
      .filter((row, at, list) => list.findIndex((one) => one.id === row.id) === at)
    const edited = [...all].filter((row) => row.type !== 'question' && row.type !== 'goal').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 16).map(strip)

    // A note caught on this day in an earlier year: the first of them, so it holds all day.
    const today = dayKey()
    const memory = blackout ? null : all
      .filter((row) => row.type === 'capture' && offered(row) && !row.private && dayKey(row.made).slice(5) === today.slice(5) && dayKey(row.made).slice(0, 4) < today.slice(0, 4))
      .sort((a, b) => a.made.localeCompare(b.made))[0]
    const years = memory ? dayjs().year() - dayjs(memory.made).year() : 0

    // Due for review now, and kept things longest unseen: the hints' pool, read without picking.
    // Due is Review's own list, its daily limit and paused tags kept, so Home never offers a card Review would not.
    const due = dueIds
      .flatMap((id) => { const row = byId.get(id); return row && offered(row) ? [strip(row)] : [] })
    // Unseen means old too: made over three weeks ago and not opened for as long, so nothing new reads "not seen in a while".
    const unseen = blackout ? [] : (db.prepare("select id from nuggets where tier not in ('question', 'goal', 'card', 'deck') and suspended = 0 and archived_at is null and superseded_by is null and private = 0 and created_at < ? and coalesce(last_visited_at, '') < ? and id not in (select id from note_opens where at >= ?) order by coalesce(last_visited_at, '') limit 8").all(ago(21), ago(21), ago(21)) as { id: string }[])
      .flatMap(({ id }) => { const row = byId.get(id); return row && !due.some((one) => one.id === id) ? [strip(row)] : [] })
    const article = all.filter((row) => row.type === 'article' && offered(row)).sort((a, b) => b.made.localeCompare(a.made))[0]

    // Questions still held, each with its newest clue.
    const questions = (db.prepare(`select n.id, (select body from glosses where item_id = n.id order by created_at desc limit 1) as clue,
        (select created_at from glosses where item_id = n.id order by created_at desc limit 1) as clueAt
      from nuggets n where tier = 'question' and closed_at is null and archived_at is null order by coalesce(clueAt, n.created_at) desc limit 12`).all() as { id: string; clue: string | null; clueAt: string | null }[])
      .flatMap((one) => { const row = byId.get(one.id); return row ? [{ ...strip(row), clue: one.clue, at: one.clueAt ?? row.at }] : [] })

    // The two tags used most in the last two months, each with what carries it.
    const lately = all.filter((row) => row.made >= ago(60) || row.at >= ago(60))
    const tagged = new Map<string, Shelved[]>()
    for (const row of lately) {
      for (const tag of noteTags(row.title, row.body, row.fields)) tagged.set(tag, [...(tagged.get(tag) ?? []), strip(row)])
    }
    const metaRows = db.prepare('select tag, color, home_hidden from tag_meta').all() as { tag: string; color: string | null; home_hidden: number }[]
    const colours = new Map(metaRows.map((row) => [row.tag, row.color]))
    // Never the app's own help deck or a #bit, and never a tag the person took off Home.
    const offHome = new Set(['bit', LEARN_TAG, ...metaRows.filter((row) => row.home_hidden).map((row) => row.tag)])
    const tags = [...tagged].filter(([tag, rows]) => !offHome.has(tag) && rows.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 2)
      .map(([tag, rows]) => ({ tag, color: colours.get(tag) ?? null, cards: rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12) }))

    const monday = dayjs().startOf('week').toISOString()
    const week = all.filter((row) => row.made >= monday && row.type !== 'question' && row.type !== 'goal' && !(row.body ?? '').includes(`#${LEARN_TAG}`)).sort((a, b) => b.made.localeCompare(a.made)).slice(0, 16).map(strip)

    // A few words after the first line, for the cards that have no picture: only for what is shown.
    const excerpts = new Map<string, string>()
    const excerpt = <T extends Shelved>(card: T): T & { excerpt: string } => {
      if (!excerpts.has(card.id)) {
        const raw = byId.get(card.id)?.body ?? ''
        // Tags out first (the learn deck's tag): the line-marker trim below would leave one as a bare word.
        const text = cardWords(raw).replace(/(?<=^|\s)#\p{L}[\p{L}\p{N}_/-]*/gmu, '')
        const lines = text.split('\n').map((line) => line.replace(/^[#>*\-\s]+/, '').trim()).filter(Boolean)
        // Never the title again: drop the lines the title already says (a
        // name can be made from the first line or two), then any of its words.
        const flat = (words: string): string => words.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        const name = flat(card.title)
        while (lines.length && name.includes(flat(lines[0]))) lines.shift()
        let rest = lines.join(' ')
        if (name && flat(rest).startsWith(name)) rest = rest.slice(card.title.length).trim()
        excerpts.set(card.id, cut(rest.replace(/^[:;,.\s]+/, ''), 220))
      }
      return { ...card, excerpt: card.private ? '' : excerpts.get(card.id)! }
    }
    const each = <T extends Shelved>(list: T[]): (T & { excerpt: string })[] => list.map(excerpt)
    return {
      opened: each(opened), edited: each(edited), due: each(due), unseen: each(unseen), questions, week: each(week),
      returning: returning().filter(offered),
      tags: tags.map((one) => ({ ...one, cards: each(one.cards) })),
      memory: memory ? excerpt({ ...strip(memory), memory: years === 1 ? 'A year ago today' : `${years} years ago today` }) : null,
      article: article ? excerpt(strip(article)) : null
    }
  }

  return { returning, home }
}
