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
export type ApkgCounts = { cards: number; decks: number; pictures: number; sounds: number; skipped: number; already: number }

const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

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

/** A field's HTML as the app's own words: pictures and sounds as links to the book's copies. */
function wordsOf(html: string, media: Map<string, string>): string {
  return html
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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type Model = { name: string; cloze: boolean }

/** Note types and decks, from the old JSON in `col` or the newer tables. */
function shapesOf(source: DatabaseSync): { models: Map<string, Model>; decks: Map<string, string> } {
  const col = source.prepare('select models, decks from col').get() as { models: string; decks: string } | undefined
  const models = new Map<string, Model>()
  const decks = new Map<string, string>()
  const json = (text: string | undefined): Record<string, { name: string; type?: number }> => {
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      return {}
    }
  }
  for (const [id, model] of Object.entries(json(col?.models))) models.set(id, { name: model.name, cloze: model.type === 1 })
  for (const [id, deck] of Object.entries(json(col?.decks))) decks.set(id, deck.name)
  const tables = new Set((source.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name))
  if (!models.size && tables.has('notetypes'))
    for (const row of source.prepare('select id, name from notetypes').all() as { id: number; name: string }[]) models.set(String(row.id), { name: row.name, cloze: /cloze/i.test(row.name) })
  if (!decks.size && tables.has('decks'))
    for (const row of source.prepare('select id, name from decks').all() as { id: number; name: string }[]) decks.set(String(row.id), row.name.replace(/\x1f/g, '::'))
  return { models, decks }
}

/** One cloze card's question: its own blank as "_____", every other blank shown. */
const clozeAsked = (text: string, number: number): string =>
  text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_all, n: string, words: string) => (Number(n) === number ? '_____' : words))
const clozeShown = (text: string): string => text.replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1')

/**
 * An Anki deck package (.apkg): every card a gem to review, its pictures and
 * sounds kept in the book, its deck and tags as #tags, and its past reviews
 * replayed so it keeps its place in the schedule. A card that came in before
 * (by its Anki id) is not brought in twice.
 */
export async function importApkg(path: string): Promise<ApkgCounts> {
  const files = unzipSync(new Uint8Array(await readFile(path)))
  const collection = files['collection.anki21b'] ?? files['collection.anki21'] ?? files['collection.anki2']
  if (!collection) throw new Error('it holds no Anki collection')
  const folder = await mkdtemp(join(tmpdir(), 'haligtree-apkg-'))
  const counts: ApkgCounts = { cards: 0, decks: 0, pictures: 0, sounds: 0, skipped: 0, already: 0 }
  try {
    const file = join(folder, 'collection.sqlite')
    await writeFile(file, unpacked(collection))
    const source = new DatabaseSync(file, { readOnly: true })
    try {
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

      const { models, decks } = shapesOf(source)
      const db = database()
      const seen = db.prepare('select 1 from nuggets where source = ?')
      const add = db.prepare("insert into nuggets (id, kind, title, body, prompt, source, state, due_at, created_at, updated_at) values (?, 'note', ?, ?, ?, ?, ?, ?, ?, ?)")
      const log = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, ?)')
      const reviewsOf = source.prepare('select id, ease, time, type from revlog where cid = ? order by id')
      const cards = source.prepare('select c.id, c.ord, c.did, n.id as nid, n.mid, n.flds, n.tags from cards c join notes n on n.id = c.nid order by c.id').all() as
        { id: number; ord: number; did: number; nid: number; mid: number; flds: string; tags: string }[]
      const usedDecks = new Set<number>()
      db.exec('begin')
      try {
        for (const card of cards) {
          const model = models.get(String(card.mid)) ?? { name: '', cloze: false }
          const fields = card.flds.split('\x1f').map((field) => wordsOf(field, media))
          // Anki's own picture-hiding notes wait for image occlusion here.
          if (/image occlusion/i.test(model.name) || fields.some((field) => field.includes('image-occlusion:'))) {
            counts.skipped += 1
            continue
          }
          if (seen.get(`anki:${card.id}`)) {
            counts.already += 1
            continue
          }
          const cloze = model.cloze || /\{\{c\d+::/.test(fields[0] ?? '')
          let [front, back] = [fields[0] ?? '', fields.slice(1).filter(Boolean).join('\n\n')]
          if (cloze) [front, back] = [clozeAsked(front, card.ord + 1), [clozeShown(front), fields.slice(1).filter(Boolean).join('\n\n')].filter(Boolean).join('\n\n')]
          // The second card of a "Basic (and reversed)" note asks the back first.
          else if (card.ord === 1 && back) [front, back] = [back, front]
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
          // Its past reviews, replayed: the schedule it had, carried over.
          const reviews = (reviewsOf.all(card.id) as { id: number; ease: number; time: number; type: number }[]).filter((one) => one.ease >= 1 && one.ease <= 4 && one.type !== 4)
          let state: Card | null = null
          const id = randomUUID()
          for (const [at, review] of reviews.entries()) {
            const when = new Date(Math.min(review.id, Date.now()))
            state = scheduler().next(state ?? createEmptyCard(when), when, review.ease as Grade).card
            log.run(id, review.ease, when.toISOString(), review.time || null, at ? 0 : 1)
          }
          const made = new Date(Math.min(card.nid, Date.now())).toISOString()
          const body = [back, tags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n')
          add.run(id, cut(front.replace(/!\[\]\([^)]*\)/g, '').split('\n').find((line) => line.trim()) ?? 'Card', 160), JSON.stringify(body), front, `anki:${card.id}`,
            state ? JSON.stringify(state) : null, state ? state.due.toISOString() : null, made, new Date().toISOString())
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
  if (counts.cards) changed()
  return counts
}
