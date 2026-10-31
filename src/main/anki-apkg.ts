import { randomUUID, createHash } from 'crypto'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { zstdDecompressSync } from 'zlib'
import { unzipSync } from 'fflate'
import { createEmptyCard, type Card, type Grade } from 'ts-fsrs'
import { changed, database } from './captures'
import { scheduler } from './haligtree'
import { assetsDir, lookAhead } from './pictures'
import { cut } from './clip'

/** What one .apkg brought in, for the import's notice. */
export type ApkgCounts = {
  cards: number; decks: number; pictures: number; sounds: number; skipped: number; already: number; paused: number
  /** Cards a newer version of the deck changed in place, keeping their progress. */
  updated: number
  /** The decks the cards came from, by their own names ("Great Works of Art: Artists, Titles"). */
  names: string[]
  /** One card as Review will ask it. */
  sample: { question: string; answer: string } | null
}

/** What there is to ask about once the deck is read: how many of its cards come with past reviews. */
export type ApkgAsk = { reviewed: number; cards: number; names: string[] }

/** How the person wants the deck brought in. */
export type ApkgChoice = { keepReviews: boolean }

type Steps = {
  /** Asked once the deck is read, before anything is kept. */
  choose?: (ask: ApkgAsk) => Promise<ApkgChoice>
  /** How far it has got: pictures first, then cards. */
  progress?: (done: number, total: number, what: 'pictures' | 'cards') => void
}

const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

/** Fields that say where something came from (links, copyright, credits): kept off the question, shown under the answer. */
const SOURCE_FIELD = /link|source|copyright|licen[cs]e|credit|attribution|\burl\b/i

/** Anki 2.1.50 and later pack the collection and media with zstd; Electron's Node reads it. */
const unpacked = (bytes: Uint8Array): Uint8Array => (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd ? new Uint8Array(zstdDecompressSync(bytes)) : bytes)

/**
 * The newer media list, a protobuf: entries (field 1), each with its name in
 * field 1. Only the names are needed, in order: file "0" is the first.
 */
function mediaNames(bytes: Uint8Array): string[] {
  const names: string[] = []
  let at = 0
  const varint = (): number => {
    let value = 0
    let shift = 0
    for (;;) {
      const byte = bytes[at++]
      value += (byte & 0x7f) * 2 ** shift
      if (byte < 0x80) return value
      shift += 7
    }
  }
  while (at < bytes.length) {
    const key = varint()
    const length = (key & 7) === 2 ? varint() : 0
    if ((key & 7) !== 2) continue
    const entry = bytes.subarray(at, at + length)
    at += length
    if (key >> 3 !== 1) continue
    // The entry's own first field is its name.
    let inner = 0
    const tag = entry[inner++]
    if (tag !== 0x0a) continue
    let size = 0
    let shift = 0
    for (;;) {
      const byte = entry[inner++]
      size += (byte & 0x7f) * 2 ** shift
      if (byte < 0x80) break
      shift += 7
    }
    names.push(Buffer.from(entry.subarray(inner, inner + size)).toString('utf8'))
  }
  return names
}

/** Words for a tag here: lower case, "::" levels joined by "-", spaces as "-". */
const tagWord = (name: string): string =>
  name.toLowerCase().split('::').map((part) => part.trim().replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

/** An Anki field's links as the app's own: [words](address), or the bare address when the words are the address. */
const linked = (html: string): string =>
  html.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_all, href: string, words: string) => {
    const address = href.replace(/&amp;/g, '&')
    const text = words.replace(/<[^>]+>/g, '').trim()
    return !text || text === href || text === address ? address : `[${text}](${address})`
  })

/** A field's HTML as the app's own words: the deck's styling dropped, pictures and sounds as links to the book's copies. */
function wordsOf(html: string, media: Map<string, string>): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<hr[^>]*>/gi, '\n')
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_all, src: string) => (media.has(src) ? `\n![](${media.get(src)})\n` : ''))
    .replace(/\[sound:([^\]]+)\]/g, (_all, name: string) => (media.has(name) ? `[${name}](${media.get(name)})` : ''))
    .replace(/<br\s*\/?>|<\/div>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type Model = { name: string; cloze: boolean; fields: string[]; templates: { qfmt: string; afmt: string }[] }

/** Note types and decks, from the old JSON in `col` or the newer tables. */
function shapesOf(source: DatabaseSync): { models: Map<string, Model>; decks: Map<string, string> } {
  const col = source.prepare('select models, decks from col').get() as { models: string; decks: string } | undefined
  const models = new Map<string, Model>()
  const decks = new Map<string, string>()
  type Stored = { name: string; type?: number; flds?: { name: string; ord: number }[]; tmpls?: { ord: number; qfmt?: string; afmt?: string }[] }
  const json = (text: string | undefined): Record<string, Stored> => {
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      return {}
    }
  }
  for (const [id, model] of Object.entries(json(col?.models)))
    models.set(id, {
      name: model.name,
      cloze: model.type === 1,
      fields: [...(model.flds ?? [])].sort((a, b) => a.ord - b.ord).map((field) => field.name),
      templates: [...(model.tmpls ?? [])].sort((a, b) => a.ord - b.ord).map((one) => ({ qfmt: one.qfmt ?? '', afmt: one.afmt ?? '' }))
    })
  for (const [id, deck] of Object.entries(json(col?.decks))) decks.set(id, deck.name)
  const tables = new Set((source.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name))
  if (!models.size && tables.has('notetypes'))
    for (const row of source.prepare('select id, name from notetypes').all() as { id: number; name: string }[]) models.set(String(row.id), { name: row.name, cloze: /cloze/i.test(row.name), fields: [], templates: [] })
  if (!decks.size && tables.has('decks'))
    for (const row of source.prepare('select id, name from decks').all() as { id: number; name: string }[]) decks.set(String(row.id), row.name.replace(/\x1f/g, '::'))
  return { models, decks }
}

/** One cloze card's question: its own blank as "_____", with its hint when it has one ("_____ (tener)"), every other blank shown. */
const clozeAsked = (text: string, number: number): string =>
  text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_all, n: string, words: string, hint?: string) => (Number(n) === number ? (hint?.trim() ? `_____ (${hint.trim()})` : '_____') : words))
const clozeShown = (text: string): string => text.replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1')

/**
 * One side of a card from its note type's template, as Anki draws it: the
 * template's own words ("Artist?") kept, {{#Field}} parts only when the field
 * has something ({{^Field}} only when it has not), this card's cloze blank,
 * typing boxes and {{FrontSide}} left out, and the fields in `hide` blank.
 */
function drawn(template: string, values: Map<string, string>, number: number, side: 'question' | 'answer', hide: Set<string>): string {
  const has = (name: string): boolean => !!(values.get(name.split(':').pop()!.trim()) ?? '').replace(/<[^>]+>|&nbsp;|\s/g, '') || /<img/i.test(values.get(name.split(':').pop()!.trim()) ?? '')
  let out = template
  // Sections can sit inside each other: undone from the inside out.
  for (let depth = 0; depth < 8 && /\{\{[#^]/.test(out); depth++)
    out = out.replace(/\{\{([#^])\s*([^}]+?)\s*\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\s*\2\s*\}\}/g, (_all, kind: string, name: string, inner: string) => ((kind === '#') === has(name) ? inner : ''))
  return out.replace(/\{\{([^}]+)\}\}/g, (_all, tag: string) => {
    const filters = tag.split(':').map((part) => part.trim())
    const name = filters.pop() ?? ''
    if (name === 'FrontSide' || filters.includes('type') || hide.has(name)) return ''
    const value = values.get(name) ?? ''
    if (filters.includes('cloze')) return side === 'question' ? clozeAsked(value, number) : clozeShown(value)
    return value
  })
}

/** The fields a template names, {{Field}} or {{filter:Field}}. */
const named = (template: string): Set<string> => new Set([...template.matchAll(/\{\{(?![#^/])([^}]+)\}\}/g)].map((match) => match[1].split(':').pop()!.trim()))

/** A deck's name as a person says it: "Great Works of Art::Artists" is "Great Works of Art: Artists". */
const deckNames = (full: string[]): string[] => {
  const tops = new Map<string, string[]>()
  for (const name of full) {
    const [top, ...rest] = name.split('::').map((part) => part.trim())
    const parts = tops.get(top) ?? []
    if (rest.length) parts.push(rest.join(': '))
    tops.set(top, parts)
  }
  return [...tops].map(([top, parts]) => (parts.length ? `${top}: ${[...new Set(parts)].join(', ')}` : top))
}

/**
 * An Anki deck package (.apkg or a whole collection, .colpkg): every card a
 * gem to review, drawn from its note type's own templates, its pictures and
 * sounds kept in the book, its deck and tags as #tags. Each card counts as
 * added today; the year it was made in Anki is a line under the answer.
 * Someone else's past reviews come in only when the person says so. A newer
 * version of a deck changes its cards in place (matched by Anki's note id and
 * the card's place in it) and keeps their progress here.
 */
export async function importApkg(path: string, steps: Steps = {}): Promise<ApkgCounts> {
  const files = unzipSync(new Uint8Array(await readFile(path)))
  const collection = files['collection.anki21b'] ?? files['collection.anki21'] ?? files['collection.anki2']
  if (!collection) throw new Error('it holds no Anki collection')
  const folder = await mkdtemp(join(tmpdir(), 'haligtree-apkg-'))
  const counts: ApkgCounts = { cards: 0, decks: 0, pictures: 0, sounds: 0, skipped: 0, already: 0, paused: 0, updated: 0, names: [], sample: null }
  try {
    const file = join(folder, 'collection.sqlite')
    await writeFile(file, unpacked(collection))
    const source = new DatabaseSync(file, { readOnly: true })
    try {
      const { models, decks } = shapesOf(source)
      const cards = source.prepare('select c.id, c.ord, c.did, c.queue, n.id as nid, n.guid, n.mid, n.flds, n.tags from cards c join notes n on n.id = c.nid order by c.id').all() as
        { id: number; ord: number; did: number; queue: number; nid: number; guid: string | null; mid: number; flds: string; tags: string }[]
      const reviewed = (source.prepare('select count(distinct cid) n from revlog where ease between 1 and 4').get() as { n: number }).n
      const used = [...new Set(cards.map((card) => decks.get(String(card.did)) ?? ''))].filter((name) => name && name !== 'Default')
      counts.names = deckNames(used.length ? used : [...new Set(cards.map((card) => decks.get(String(card.did)) ?? ''))].filter(Boolean))
      // Asked before anything is kept: a shared deck's reviews are a stranger's.
      const choice = reviewed && steps.choose ? await steps.choose({ reviewed, cards: cards.length, names: counts.names }) : { keepReviews: false }

      // Media: a list from number to name, JSON in older packages.
      const list = files.media ? unpacked(files.media) : new Uint8Array()
      let names: string[] = []
      try {
        const map = JSON.parse(Buffer.from(list).toString('utf8')) as Record<string, string>
        for (const [number, name] of Object.entries(map)) names[Number(number)] = name
      } catch {
        names = mediaNames(list)
      }
      const media = new Map<string, string>()
      await mkdir(assetsDir(), { recursive: true })
      for (const [number, name] of names.entries()) {
        steps.progress?.(number + 1, names.length, 'pictures')
        const raw = files[String(number)]
        if (!raw || !name) continue
        const bytes = unpacked(raw)
        const ending = (name.split('.').pop() ?? 'bin').toLowerCase().replace('jpeg', 'jpg')
        const stored = `${createHash('sha256').update(bytes).digest('hex')}.${/^[a-z0-9]{1,12}$/.test(ending) ? ending : 'bin'}`
        // Written beside and renamed in, as every kept file is: never half written.
        const temporary = join(assetsDir(), `${stored}.${randomUUID()}.tmp`)
        await stat(join(assetsDir(), stored)).catch(() => writeFile(temporary, bytes).then(() => rename(temporary, join(assetsDir(), stored))))
        media.set(name, `haligtree://assets/${stored}`)
        if (PICTURE.test(name)) (counts.pictures += 1, lookAhead(stored))
        else counts.sounds += 1
      }

      const db = database()
      const seen = db.prepare('select 1 from nuggets where source = ?')
      const before = db.prepare('select id, body, prompt from nuggets where source = ?')
      const add = db.prepare("insert into nuggets (id, kind, title, body, prompt, source, state, due_at, suspended, created_at, updated_at) values (?, 'note', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      const update = db.prepare('update nuggets set title = ?, body = ?, prompt = ?, updated_at = ? where id = ?')
      const log = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, ?)')
      const reviewsOf = source.prepare('select id, ease, time, type from revlog where cid = ? order by id')
      const usedDecks = new Set<number>()
      const now = new Date().toISOString()
      db.exec('begin')
      try {
        for (const [at, card] of cards.entries()) {
          steps.progress?.(at + 1, cards.length, 'cards')
          const model = models.get(String(card.mid)) ?? { name: '', cloze: false, fields: [], templates: [] }
          const raw = card.flds.split('\x1f')
          // Anki's own picture-hiding notes wait for image occlusion here.
          if (/image occlusion/i.test(model.name) || raw.some((field) => field.includes('image-occlusion:'))) {
            counts.skipped += 1
            continue
          }
          // The same card of the same note, from an earlier version of this deck: changed in place below.
          const key = card.guid ? `anki:${card.guid}:${card.ord}` : `anki:${card.id}`
          const earlier = before.get(key) as { id: string; body: string; prompt: string } | undefined
          if (!earlier && seen.get(`anki:${card.id}`)) {
            counts.already += 1
            continue
          }
          const values = new Map(model.fields.map((name, index) => [name, raw[index] ?? '']))
          // Links, copyright and credits: never the question, always under the answer, each with its field's name.
          const credits = model.fields.filter((name) => SOURCE_FIELD.test(name) && wordsOf(values.get(name) ?? '', media))
          const sources = credits.map((name) => `${name}: ${wordsOf(linked(values.get(name) ?? ''), media).replace(/\n+/g, ' ')}`)
          const cloze = model.cloze || /\{\{c\d+::/.test(raw[0] ?? '')
          const template = model.templates[cloze ? 0 : card.ord]
          let front = ''
          let back = ''
          if (template && model.fields.length) {
            const hidden = new Set(credits)
            front = wordsOf(drawn(template.qfmt, values, card.ord + 1, 'question', hidden), media)
            // The answer without the question again: what the question showed is not repeated (a cloze answer is its whole sentence).
            const asked = cloze ? new Set<string>() : named(template.qfmt)
            back = wordsOf(drawn(template.afmt, values, card.ord + 1, 'answer', new Set([...hidden, ...asked])), media)
          }
          // A note type with no templates to read: its first field asks, the rest answer.
          if (!front.trim() || !back.trim()) {
            const fields = raw.map((field, index) => (SOURCE_FIELD.test(model.fields[index] ?? '') ? '' : wordsOf(field, media)))
            ;[front, back] = [fields[0] ?? '', fields.slice(1).filter(Boolean).join('\n\n')]
            if (cloze) [front, back] = [clozeAsked(front, card.ord + 1), [clozeShown(front), fields.slice(1).filter(Boolean).join('\n\n')].filter(Boolean).join('\n\n')]
            // The second card of a "Basic (and reversed)" note asks the back first.
            else if (card.ord === 1 && back) [front, back] = [back, front]
          }
          if (!front.trim() || !back.trim()) {
            counts.skipped += 1
            continue
          }
          // Review shows a question's pictures, but plays sounds only on the answer's side: a question's sound goes there, after the answer's words.
          const sounds = [...front.matchAll(/(?<!!)\[[^\]]*\]\(haligtree:\/\/assets\/[^)]+\)/g)].map((match) => match[0])
          if (sounds.length) [front, back] = [front.replace(/(?<!!)\[[^\]]*\]\(haligtree:\/\/assets\/[^)]+\)/g, '').trim() || 'Listen', `${back}\n\n${sounds.join('\n')}`]
          const deck = decks.get(String(card.did)) ?? ''
          const tags = [...new Set([deck && tagWord(deck), ...card.tags.trim().split(/\s+/).filter(Boolean).map(tagWord)].filter(Boolean))]
          usedDecks.add(card.did)
          // When it was made in Anki is a fact about the deck, not the day it came into this book.
          const made = `Made in Anki, ${new Date(Math.min(card.nid, Date.now())).getFullYear()}`
          const body = [back, [...sources, made].join('\n'), tags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n')
          const title = cut(front.replace(/!\[\]\([^)]*\)/g, '').split('\n').find((line) => line.trim()) ?? 'Card', 160)
          if (!counts.sample) counts.sample = { question: front, answer: back }
          if (earlier) {
            // The same again: nothing to do. A newer version: its words change, its place in the schedule stays.
            if (earlier.body === JSON.stringify(body) && earlier.prompt === front) counts.already += 1
            else (update.run(title, JSON.stringify(body), front, now, earlier.id), (counts.updated += 1))
            continue
          }
          // Its past reviews, replayed only when the person keeps them: the schedule it had, carried over.
          const reviews = choice.keepReviews ? (reviewsOf.all(card.id) as { id: number; ease: number; time: number; type: number }[]).filter((one) => one.ease >= 1 && one.ease <= 4 && one.type !== 4) : []
          let state: Card | null = null
          const id = randomUUID()
          for (const [index, review] of reviews.entries()) {
            const when = new Date(Math.min(review.id, Date.now()))
            state = scheduler().next(state ?? createEmptyCard(when), when, review.ease as Grade).card
            log.run(id, review.ease, when.toISOString(), review.time || null, index ? 0 : 1)
          }
          add.run(id, title, JSON.stringify(body), front, key, state ? JSON.stringify(state) : null, state ? state.due.toISOString() : null, card.queue === -1 ? 1 : 0, now, now)
          // Suspended in Anki (queue -1): paused here, out of Review until brought back.
          if (card.queue === -1) counts.paused += 1
          counts.cards += 1
        }
        db.exec('commit')
      } catch (error) {
        db.exec('rollback')
        throw error
      }
      counts.decks = usedDecks.size
    } finally {
      source.close()
    }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
  if (counts.cards || counts.updated) changed()
  return counts
}
