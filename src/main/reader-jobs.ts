import type { DatabaseSync } from 'node:sqlite'
import { bookFinder } from './book-find'
import { bookOffers, type OffersNeeds } from './book-offers'
import type { Pictures } from './picture-lines'
import { bookFeed, type FeedAsk, type Takes } from './book-feed'
import { bookHome, type HomeAsk } from './book-home'
import { bookRepeats } from './book-repeats'
import { bookMentions } from './book-mentions'
import { bookTags } from './book-tags'
import { bookMap } from './book-map'
import { wordCounter } from './word-count'
import { linesOf } from './kept-words'
import { firstPictures } from './first-pictures'
import { pdfIn } from './pdf-in'

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
  const home = bookHome(db)
  const repeats = bookRepeats(db)
  const mentions = bookMentions(db, needs.named)
  const tags = bookTags(db)
  const map = bookMap(db)
  const gained = wordCounter()
  const firstOfEach = firstPictures(db)
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
      /** The words a save gained (word-count.ts): the words as they were, and as they are. */
      'words:gained': (_gone: Gone, was: string, now: string) => gained(was, now)
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
