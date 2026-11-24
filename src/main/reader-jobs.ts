import type { DatabaseSync } from 'node:sqlite'
import { bookFinder } from './book-find'
import { bookOffers, type OffersNeeds } from './book-offers'
import type { Pictures } from './picture-lines'
import { bookFeed, type FeedAsk, type Takes } from './book-feed'
import { bookInsights, type InsightAsk } from './book-insights'
import { bookHome, type HomeAsk } from './book-home'
import { bookRepeats } from './book-repeats'
import { bookMentions } from './book-mentions'
import { bookTags, noteTags } from './book-tags'
import { bookMap } from './book-map'
import { wordCounter } from './word-count'
import { linesOf } from './kept-words'
import { firstPictures } from './first-pictures'
import { pdfIn } from './pdf-in'
import { LIST } from './book-words'
import { pdfsToFind } from './find-files'
import { plain } from './card-words'
import { mdWords } from './md-words'
import { cut } from './clip'

/**
 * Everything the reading thread can be asked (reader.ts), by name: search,
 * what a note is offered, and the pages that read every note (Home, the
 * Feed), each a read of the book and nothing else. One
 * place, so the thread and main (which answers only if the thread has
 * stopped) run the very same code. No Electron in it.
 *
 * Each takes `gone` first: whether its asker has left since it was asked.
 */
export function bookJobs(db: DatabaseSync, pictures: Pictures, needs: OffersNeeds) {
  const finder = bookFinder(db, pictures)
  const offers = bookOffers(db, needs)
  const feed = bookFeed(db)
  const insights = bookInsights(db)
  const home = bookHome(db)
  const repeats = bookRepeats(db)
  const mentions = bookMentions(db, needs.named)
  const tags = bookTags(db)
  const map = bookMap(db)
  const gained = wordCounter()
  const firstOfEach = firstPictures(db)
  // Every PDF the book keeps, read again only once the book's stamp has moved (it reads every note that holds a file).
  let pdfs: { stamp: number; found: ReturnType<typeof pdfsToFind> } | null = null
  // Each note's first lines on a card (notes:glance), remembered by its words, and the whole answer by the book's stamp.
  const glanced = new Map<string, { body: string; value: string }>()
  const glances = new Map<string, { stamp: number; all: Record<string, string> }>()
  const glance = (body: string): string => {
    let read: unknown
    try { read = JSON.parse(body ?? 'null') } catch { read = body }
    // Markdown (an import) read as words, as the editor's JSON is: no "- [ ]", no link's address.
    return cut((typeof read === 'string' ? mdWords(read, true) : plain(read, true)).replace(/\n{2,}/g, '\n').trim(), 280)
  }
  type Gone = () => boolean
  return {
    jobs: {
      /** ⌘K: every word typed, in a note's name or its words (book-find.ts). */
      find: (_gone: Gone, stamp: number, query: unknown, only?: unknown) => finder.find(stamp, query, only),
      /** `@`: notes by name or handle. */
      search: (_gone: Gone, query: unknown) => finder.search(query),
      /** `@`: gems, pages and questions by name. */
      items: (_gone: Gone, query: unknown) => finder.items(query),
      /** A link written by name: the three above in one ask. */
      named: (_gone: Gone, stamp: number, query: unknown, exact?: unknown) => finder.named(stamp, query, exact),
      /** What a note, as it now reads, is offered (book-offers.ts). */
      'offers:note': (gone: Gone, need: number, key: string, text: string, linked: string[]) => offers.forNote(need, key, text, linked, gone),
      /** The notes on what a question or an event is about. */
      'offers:about': (_gone: Gone, need: number, text: string, leave?: string) => offers.about(need, text, leave),
      /** The offers' index made ahead of the first ask. */
      'offers:warm': (_gone: Gone, need: number) => offers.warm(need),
      /** Home's shelves (book-home.ts). */
      home: (_gone: Gone, asked: HomeAsk) => home.home(asked),
      /** The Feed: the day's set picked, and each post as it now reads (book-feed.ts). */
      feed: (_gone: Gone, asked: FeedAsk) => feed.feed(asked),
      /** How near the Feed is to full. */
      'feed:goal': (_gone: Gone, takes: Takes) => feed.goal(takes),
      /** The Feed's side column: who and what has gone quiet, and this week's tags. */
      'feed:side': (_gone: Gone, takes: Takes) => feed.side(takes),
      /** The passages for one of the Feed's insights (book-insights.ts). */
      'feed:insight': (_gone: Gone, asked: InsightAsk) => insights.pick(asked),
      /** The same idea, caught again and again (book-repeats.ts). */
      repeats: (_gone: Gone, ids: string[]) => repeats(ids),
      /** A note's mentions, both ways (book-mentions.ts). */
      mentions: (gone: Gone, id: string) => mentions.of(id, gone),
      /** Every tag with its counts; one tag's notes; one tag's notes to read (book-tags.ts). `stamp`: the book's. */
      tags: (_gone: Gone, stamp: number) => tags.tags(stamp),
      tag: (_gone: Gone, stamp: number, name: string) => tags.tag(stamp, name),
      'tag:read': (_gone: Gone, stamp: number, name: string) => tags.read(stamp, name),
      /** One note's own #tags. */
      'note:tags': (_gone: Gone, table: 'captures' | 'nuggets', id: string) => tags.ofNote(table, id),
      /** Every capture as the lists show it (captures.ts `captures:list`), for the book's stamp `_stamp` (so two asks of one stamp are one): its name is worked out of its words, so a big book's list is read here, never on main. */
      list: (_gone: Gone, _stamp: number) => db.prepare(`select ${LIST} from captures order by captured_at desc`).all() as Record<string, unknown>[],
      /** Every PDF kept, once each (find-files.ts), for the PDF library; `stamp`: the book's. */
      pdfs: (_gone: Gone, stamp: number) => (pdfs?.stamp === stamp ? pdfs : (pdfs = { stamp, found: pdfsToFind(db) })).found,
      /** Every note's first lines in a table, for cards (notes.ts `notes:glance`): every note's words are read, so here, never on main. */
      glance: (_gone: Gone, stamp: number, table: 'captures' | 'nuggets') => {
        const kept = glances.get(table)
        if (kept?.stamp === stamp) return kept.all
        const all: Record<string, string> = {}
        for (const row of db.prepare(`select id, body from ${table === 'nuggets' ? 'nuggets' : 'captures'}`).all() as { id: string; body: string }[]) {
          const key = `${table}:${row.id}`
          const was = glanced.get(key)
          all[row.id] = was?.body === row.body ? was.value : (glanced.set(key, { body: row.body, value: glance(row.body) }), glanced.get(key)!.value)
        }
        glances.set(table, { stamp, all })
        return all
      },
      /** Every web address a group's notes hold (or these notes'), once each, in order (groups.ts `groups:links`). */
      links: (_gone: Gone, id: string | string[]) => {
        type Row = { attribution: string | null; body: string | null; fields: string | null }
        const rows = Array.isArray(id)
          ? id.flatMap((one) => db.prepare('select attribution, body, fields from nuggets where id = ?').all(one) as Row[])
          : (db.prepare('select attribution, body, fields from nuggets where group_id = ? order by group_order').all(id) as Row[])
        const seen = new Set<string>()
        for (const row of rows)
          for (const found of `${row.attribution ?? ''} ${row.fields ?? ''} ${row.body ?? ''}`.matchAll(/https?:\/\/[^\s"'<>)\]\\]+/g))
            seen.add(found[0].replace(/[.,;:]+$/, ''))
        return [...seen]
      },
      /** The link cards not looked up yet as they now read (captures.ts keeps which were tried). */
      cards: (_gone: Gone) => db.prepare(`select id, kind, body from captures where (kind = 'link' or body like '%"bookmark"%')
        and not exists (select 1 from card_tries t where t.id = captures.id and t.body = captures.body)`).all() as { id: string; kind: string; body: string }[],
      /** The Map (book-map.ts). */
      map: (_gone: Gone, stamp: number) => map(stamp),
      /** The "question :: answer" lines of a note an editor has just saved, from its words as stored (line-cards.ts `lineCardsSoon`). */
      'note:lines': (_gone: Gone, table: 'captures' | 'nuggets', id: string) =>
        linesOf((db.prepare(`select body from ${table === 'nuggets' ? 'nuggets' : 'captures'} where id = ?`).get(id) as { body: string | null } | undefined)?.body),
      /** Each note's first stored picture, for the pictures in lists (first-pictures.ts). */
      thumbs: (_gone: Gone) => firstOfEach(),
      /** The PDF a note's words link into, read from its words as stored (pdf-in.ts): asked after every change of an open note. */
      'note:pdf': (_gone: Gone, id: string) => pdfIn((db.prepare('select body from captures where id = ?').get(id) as { body: string | null } | undefined)?.body ?? ''),
      /** One note's tags as it is kept now, every one its words carry, null when it is gone: for the notes related by tag, after a save of it (haligtree.ts `fresh`). */
      'related:tags': (_gone: Gone, table: string, id: string) => {
        const row = db.prepare(`select title, body, fields from ${table === 'nuggets' ? 'nuggets' : 'captures'} where id = ?`).get(id) as { title: string | null; body: string | null; fields: string | null } | undefined
        return row ? noteTags(row.title, row.body, row.fields) : null
      },
      /** The words a save gained (word-count.ts): the words as they were, and as they are, each as the bytes it is kept as. */
      'words:gained': (_gone: Gone, was: Uint8Array | string, now: Uint8Array | string) => gained(was, now)
    },
    /** New words were read in a picture: search's list is read again. */
    forget: finder.forget,
    /** How many times search's whole list was read. */
    reads: finder.reads
  }
}

export type Jobs = ReturnType<typeof bookJobs>['jobs']
/** What an ask of one kind carries (all but `gone`), and what it is answered. */
export type Asked<K extends keyof Jobs> = Parameters<Jobs[K]> extends [unknown, ...infer Rest] ? Rest : never
export type Answered<K extends keyof Jobs> = Awaited<ReturnType<Jobs[K]>>

/** What main sends the thread, and the thread main. */
export type ToThread =
  | { id: number; kind: keyof Jobs; args: unknown[] }
  /** The Mac's reading of some words, which the thread asked main for (`need`). */
  | { answer: number; value: Record<string, unknown> }
  /** The asker of this ask has left. */
  | { gone: number }
  /** New words were read in a picture. */
  | { forget: true }
  /** The app is quitting: let go of the book, then say so in `end`. */
  | { end: Int32Array }
  /** A test run only: stop as a fault would. */
  | { crash: true }
export type FromThread =
  | { id: number; value: unknown; reads: number }
  | { id: number; error: string }
  | { need: number; op: string; body: Record<string, unknown> }
  /** Pictures search met that have no words read yet. */
  | { unread: string[] }
