import { createHash, randomBytes } from 'crypto'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'

/** One card as Anki is given it: the front and back as HTML, its tags, and the pictures it shows by file. */
export type OutCard = { front: string; back: string; tags: string[]; pictures: { name: string; file: string }[] }

/** Anki's collection tables, schema 11: what every Anki since 2.1 reads from an .apkg. */
const SCHEMA = `
create table col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
create table notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
create table cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
create table revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
create table graves (usn integer not null, oid integer not null, type integer not null);`

/** Words as HTML a card can show: the marks escaped, lines kept. */
export const asHtml = (words: string): string =>
  words.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

/** Anki's checksum of a note's first field: the first 8 hex digits of its SHA-1, as a number. */
const checksum = (field: string): number => parseInt(createHash('sha1').update(field.replace(/<[^>]+>/g, '')).digest('hex').slice(0, 8), 16)

/**
 * One deck as an Anki package (.apkg): every card a Basic note in a deck of
 * that name, its two fields named as the deck names its sides, its pictures
 * packed beside it. Cards go as new: whoever opens it learns them fresh.
 */
export async function deckPackage(name: string, sides: [string, string], cards: OutCard[]): Promise<Uint8Array> {
  const folder = await mkdtemp(join(tmpdir(), 'haligtree-apkg-'))
  try {
    const file = join(folder, 'collection.anki2')
    const db = new DatabaseSync(file)
    db.exec(SCHEMA)
    const now = Date.now()
    const secs = Math.floor(now / 1000)
    const mid = now
    const did = now + 1
    const [front, back] = sides
    const model = {
      id: mid, name: `Haligtree: ${front} and ${back}`, type: 0, mod: secs, usn: -1, sortf: 0, did, tags: [], vers: [],
      flds: [front, back].map((field, ord) => ({ name: field, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
      tmpls: [{ name: 'Card 1', ord: 0, qfmt: `{{${front}}}`, afmt: `{{FrontSide}}<hr id=answer>{{${back}}}`, did: null, bqfmt: '', bafmt: '' }],
      css: '.card { font-family: Georgia, serif; font-size: 22px; text-align: center; color: black; background-color: white; }\nimg { max-width: 100%; }',
      latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
      latexPost: '\\end{document}', req: [[0, 'any', [0]]]
    }
    const deck = (id: number, called: string): object => ({ id, name: called, desc: '', mod: secs, usn: -1, collapsed: false, browserCollapsed: false, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0], dyn: 0, conf: 1, extendNew: 0, extendRev: 0 })
    const dconf = { 1: { id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
      new: { delays: [1, 10], ints: [1, 4, 0], initialFactor: 2500, order: 1, perDay: 20, bury: false },
      rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500, bury: false, hardFactor: 1.2 },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 1 } } }
    db.prepare('insert into col values (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)').run(
      secs, now, now, JSON.stringify({ nextPos: cards.length + 1, curModel: String(mid), curDeck: did, activeDecks: [did] }),
      JSON.stringify({ [mid]: model }), JSON.stringify({ 1: deck(1, 'Default'), [did]: deck(did, name) }), JSON.stringify(dconf), '{}')
    const note = db.prepare('insert into notes values (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, \'\')')
    const card = db.prepare('insert into cards values (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, \'\')')
    db.exec('begin')
    cards.forEach((one, at) => {
      const id = now + 10 + at * 2
      const tags = one.tags.length ? ` ${one.tags.join(' ')} ` : ''
      note.run(id, randomBytes(8).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || `h${at}`, mid, secs, tags, `${one.front}\x1f${one.back}`, one.front.replace(/<[^>]+>/g, ''), checksum(one.front))
      card.run(id + 1, id, did, secs, at + 1)
    })
    db.exec('commit')
    db.close()
    // The pictures as Anki packs them: files named 0, 1, 2, and a "media" list saying which is which.
    const pictures = [...new Map(cards.flatMap((one) => one.pictures).map((one) => [one.name, one.file])).entries()]
    const files: Record<string, Uint8Array> = { 'collection.anki2': new Uint8Array(await readFile(file)) }
    const media: Record<string, string> = {}
    for (const [at, [named, path]] of pictures.entries()) {
      files[String(at)] = new Uint8Array(await readFile(path))
      media[String(at)] = named
    }
    files.media = new TextEncoder().encode(JSON.stringify(media))
    return zipSync(files)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
