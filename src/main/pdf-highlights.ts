import { ipcMain } from 'electron'
import { finishBy, type Day } from './pace'
import { randomUUID } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { statSync } from 'fs'
import { join } from 'path'
import { assetsDir } from './pictures'
import { fetchOutside, unreached } from './outside'
import type { DatabaseSync } from 'node:sqlite'
import { LABEL, bookStamp, database } from './captures'
import { ask } from './reader'
import { PDF_TITLES as TITLES, fileLink } from './find-files'
import { HUES } from './books'

export { fileLink }

type Inline = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Inline[] }

/**
 * Where a note's words meet a book (`name`, the file the store keeps it as):
 * the pages its links go to, in order, and the line the first one sits in, cut
 * to about 160 characters around it, as Mentions shows a backlink. A note
 * that only holds the book has no pages and no line.
 */
export function citedIn(body: string | null, name: string): { pages: number[]; line: string } {
  const pages = new Set<number>()
  let line = ''
  const pageOf = (href: string): number | null => (href.includes(name) ? Number(/#page=(\d+)/.exec(href)?.[1] ?? 0) : null)
  const block = (node: Inline): void => {
    let text = '', at = -1, length = 0
    for (const one of node.content ?? []) {
      const href = String(one.marks?.find((mark) => mark.type === 'link')?.attrs?.href ?? '')
      const words = one.type === 'noteLink' ? String(one.attrs?.label ?? '') : one.type === 'hardBreak' ? ' ' : one.text ?? ''
      const page = href ? pageOf(href) : one.type === 'noteLink' && String(one.attrs?.id ?? '').includes(name) ? 0 : null
      if (page !== null) {
        if (page) pages.add(page)
        if (at < 0) (at = text.length), (length = words.length)
      }
      text += words
    }
    if (at >= 0 && !line) {
      const start = Math.max(0, at - 70), end = Math.min(text.length, at + length + 90)
      line = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
    }
  }
  const walk = (node: Inline): void => {
    if (node.content?.some((one) => one.type === 'text' || one.type === 'noteLink')) block(node)
    else node.content?.forEach(walk)
  }
  try {
    const doc = JSON.parse(body ?? 'null') as Inline | string | null
    if (typeof doc === 'string' && doc.includes(name)) for (const hit of doc.matchAll(/#page=(\d+)/g)) pages.add(Number(hit[1]))
    if (doc && typeof doc === 'object') walk(doc)
  } catch {
    // Words that are not a document link to no page.
  }
  return { pages: [...pages].sort((a, b) => a - b), line }
}

/**
 * Words kept from a PDF: where they are (the page, and where on the page's
 * text they start and end, which no zoom changes) and the words themselves,
 * so a mark can still be found if the offsets ever drift. Each one names the
 * gem it made.
 */
export function registerPdfHighlights(): void {
  const db = database()
  // One store for every reader: a PDF's marks by page, an article's (src is
  // its link, page 0) by where they sit in its words. The words just before
  // and after each mark find it again if the page's text ever shifts.
  db.exec("create table if not exists pdf_highlights (id text primary key, src text not null, page integer not null, quote text not null, start integer not null, end integer not null, gem_id text, created_at text not null, prefix text not null default '', suffix text not null default '')")
  const columns = (db.prepare('pragma table_info(pdf_highlights)').all() as { name: string }[]).map((one) => one.name)
  for (const name of ['prefix', 'suffix']) if (!columns.includes(name)) db.exec(`alter table pdf_highlights add column ${name} text not null default ''`)
  // A mark's colour (none is the book's own) and a note written on it.
  for (const name of ['color', 'note']) if (!columns.includes(name)) db.exec(`alter table pdf_highlights add column ${name} text`)
  // How often it comes back in the Feed, as a note's surfacing_weight: a heart raises it, "Less of this" lowers it.
  if (!columns.includes('surfacing_weight')) db.exec('alter table pdf_highlights add column surfacing_weight real not null default 1')
  ipcMain.handle('haligtree:pdf:highlights', (_event, src: unknown) =>
    db.prepare('select id, page, quote, start, end, prefix, suffix, gem_id as gemId, color, note from pdf_highlights where src = ? order by page, start').all(String(src)))
  ipcMain.handle('haligtree:pdf:highlight', (_event, src: unknown, mark: unknown) => {
    const { id: given, page, quote, start, end, gemId, prefix, suffix, color } = (mark ?? {}) as { id?: string; page?: number; quote?: string; start?: number; end?: number; gemId?: string; prefix?: string; suffix?: string; color?: string | null }
    if (!src || !quote || !Number.isInteger(page) || !Number.isInteger(start) || !Number.isInteger(end)) return null
    const id = typeof given === 'string' && given ? given : randomUUID()
    db.prepare('insert into pdf_highlights (id, src, page, quote, start, end, gem_id, created_at, prefix, suffix, color) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, String(src), page!, quote, start!, end!, gemId ?? null, new Date().toISOString(), String(prefix ?? ''), String(suffix ?? ''), typeof color === 'string' && color ? color : null)
    return id
  })
  // A mark changed after it was made: its colour, the gem it became, its note.
  ipcMain.handle('haligtree:pdf:mark', (_event, id: unknown, change: unknown) => {
    const given = (change ?? {}) as { color?: string | null; gemId?: string | null; note?: string | null; quote?: string; start?: number; end?: number }
    const sets = Object.entries({ color: given.color, gem_id: given.gemId, note: given.note }).filter(([, value]) => value !== undefined)
    // Its words moved (extended, or cut to part of them): the words and where they sit on the page, together.
    const moved = typeof given.quote === 'string' && given.quote.trim() && Number.isInteger(given.start) && Number.isInteger(given.end) && given.end! > given.start!
    if (!sets.length && !moved) return false
    const values: (string | number | null)[] = sets.map(([, value]) => (typeof value === 'string' && value ? value : null))
    const names = sets.map(([name]) => `${name} = ?`)
    if (moved) (names.push('quote = ?', 'start = ?', 'end = ?'), values.push(given.quote!.trim(), given.start!, given.end!))
    // Its words put right where a line end had run two together ("thenature"): the gem it made reads them right too.
    const was = moved ? (db.prepare('select quote, gem_id as gem from pdf_highlights where id = ?').get(String(id)) as { quote: string; gem: string | null } | undefined) : undefined
    const quote = given.quote?.trim() ?? ''
    if (was?.gem && was.quote !== quote && was.quote.replace(/\s+/g, '') === quote.replace(/\s+/g, '')) unjoinGem(db, was.gem, was.quote, quote)
    return db.prepare(`update pdf_highlights set ${names.join(', ')} where id = ?`).run(...values, String(id)).changes > 0
  })
  ipcMain.handle('haligtree:pdf:unhighlight', (_event, id: unknown) => db.prepare('delete from pdf_highlights where id = ?').run(String(id)).changes > 0)
  // Where each PDF was last read: its page, how many it has, and when, so it opens where you left it.
  db.exec('create table if not exists pdf_reading (src text primary key, page integer not null, pages integer not null, read_at text not null)')
  db.exec('create table if not exists pdf_days (src text not null, day text not null, furthest integer not null, primary key (src, day))')
  const localDay = (): string => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
  ipcMain.handle('haligtree:pdf:place', (_event, src: unknown) =>
    db.prepare('select page, pages, read_at as readAt from pdf_reading where src = ?').get(String(src)) ?? null)
  ipcMain.handle('haligtree:pdf:read', (_event, src: unknown, page: unknown, pages: unknown) => {
    if (typeof src !== 'string' || !Number.isInteger(page) || !Number.isInteger(pages) || (page as number) < 1) return false
    db.prepare('insert or replace into pdf_reading (src, page, pages, read_at) values (?, ?, ?, ?)').run(src, Math.min(page as number, pages as number), pages as number, new Date().toISOString())
    // The furthest page each day, for your pace (pace.ts).
    db.prepare('insert into pdf_days (src, day, furthest) values (?, ?, ?) on conflict (src, day) do update set furthest = max(furthest, excluded.furthest)').run(src, localDay(), Math.min(page as number, pages as number))
    return true
  })
  // The ribbon laid in a book by hand: where you mean to come back to, which wins over the page kept as you read.
  // A PDF's by its page; an article's (src its link, page 0) by its paragraph, counted from the top, and that
  // paragraph's first words, to find it again if the article is read anew. `slot` leaves room for a second ribbon.
  // `across`: where along its page's top edge it lies, slid by hand, as a share of the page's width (null: the default,
  // near the right edge), so it holds at any zoom and in one column or two.
  db.exec('create table if not exists ribbons (src text not null, slot integer not null default 0, page integer not null default 0, block integer, words text, laid_at text not null, primary key (src, slot))')
  // `hue`: the ribbon's colour, one of a book's colours (books.ts HUES), null for its own deep red.
  const has = new Set((db.prepare('pragma table_info(ribbons)').all() as { name: string }[]).map((one) => one.name))
  if (!has.has('across')) db.exec('alter table ribbons add column across real')
  if (!has.has('hue')) db.exec('alter table ribbons add column hue text')
  ipcMain.handle('haligtree:ribbon:get', (_event, src: unknown) =>
    db.prepare('select page, block, words, across, hue, laid_at as laidAt from ribbons where src = ? and slot = 0').get(String(src ?? '')) ?? null)
  ipcMain.handle('haligtree:ribbon:lay', (_event, src: unknown, place: unknown) => {
    if (typeof src !== 'string' || !src) return false
    const given = place as { page?: number; block?: number | null; words?: string | null; across?: number | null; hue?: string | null } | null
    if (!given) return db.prepare('delete from ribbons where src = ? and slot = 0').run(src).changes > 0
    const page = Number.isInteger(given.page) ? (given.page as number) : 0
    const block = Number.isInteger(given.block) ? (given.block as number) : null
    if (page < 1 && block === null) return false
    const across = typeof given.across === 'number' && Number.isFinite(given.across) ? Math.max(0, Math.min(1, given.across)) : null
    const hue = (HUES as readonly unknown[]).includes(given.hue) ? (given.hue as string) : null
    db.prepare('insert or replace into ribbons (src, slot, page, block, words, across, hue, laid_at) values (?, 0, ?, ?, ?, ?, ?, ?)')
      .run(src, page, block, typeof given.words === 'string' ? given.words.slice(0, 80) : null, across, hue, new Date().toISOString())
    return true
  })
  // What a book's Details and the library's inspector list: every note, gem and card that holds it or
  // links into it, each with the pages it links to and the line it does it in, in page order through the book.
  ipcMain.handle('haligtree:pdf:cited', (_event, src: unknown) => {
    const name = /assets\/([a-f0-9]{64}\.pdf)$/i.exec(String(src))?.[1] ?? (/^https?:/.test(String(src)) ? encodeURIComponent(String(src)) : null)
    if (!name) return []
    const like = `%${name}%`
    const rows = db.prepare(`select 'capture' as type, id, ${LABEL} as title, captured_at as at, body from captures where status != 'discarded' and body like ?
      union all select tier as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, created_at as at, body from nuggets where binned_at is null and superseded_by is null and body like ?
      order by at desc`).all(like, like) as { type: string; id: string; title: string; at: string; body: string | null }[]
    return rows.map(({ body, ...row }) => ({ ...row, ...citedIn(body, name) }))
      .sort((a, b) => (a.pages[0] ?? 0) - (b.pages[0] ?? 0))
  })
  // A PDF's cover: its first page drawn once by the reader's own renderer and
  // kept beside the file in the book's store (named so no clean-up of unused
  // files ever counts it), so every card shows it at once after that.
  db.exec('create table if not exists pdf_covers (src text primary key, file text not null)')
  // What the cover's drawing read out of the file: its author and how many pages it has.
  const coverColumns = (db.prepare('pragma table_info(pdf_covers)').all() as { name: string }[]).map((one) => one.name)
  if (!coverColumns.includes('author')) db.exec("alter table pdf_covers add column author text not null default ''")
  if (!coverColumns.includes('pages')) db.exec('alter table pdf_covers add column pages integer')
  ipcMain.handle('haligtree:pdf:cover', async (_event, src: unknown) => {
    const row = db.prepare('select c.file, t.title from pdf_covers c left join pdf_titles t on t.src = c.src where c.src = ?').get(String(src)) as { file: string; title: string | null } | undefined
    const image = row ? await readFile(join(assetsDir(), row.file)).catch(() => null) : null
    return image ? { image: `data:image/jpeg;base64,${image.toString('base64')}`, title: row?.title ?? null } : null
  })
  ipcMain.handle('haligtree:pdf:cover:set', async (_event, src: unknown, image: unknown, about: unknown) => {
    const { author, pages } = (about ?? {}) as { author?: string; pages?: number }
    const name = /assets\/([a-f0-9]{64})\.pdf$/i.exec(String(src))?.[1]
    const data = /^data:image\/jpeg;base64,(.+)$/.exec(String(image))?.[1]
    if (!name || !data) return false
    const file = `${name}.cover.jpg`
    await writeFile(join(assetsDir(), file), Buffer.from(data, 'base64'))
    db.prepare('insert or replace into pdf_covers (src, file, author, pages) values (?, ?, ?, ?)').run(String(src), file, String(author ?? ''), Number.isInteger(pages) ? pages! : null)
    return true
  })
  // The library: every PDF kept, once each, with what its card and inspector say: title, author,
  // pages, where you are, when you last read it, how many highlights and how many notes hold it.
  // Every PDF is found by reading each note that holds a file: on the reading thread, never main (300 ms of a big book).
  ipcMain.handle('haligtree:pdf:library', async () => {
    const pdfs = await ask('pdfs', [bookStamp()])
    const reading = new Map((db.prepare('select src, page, pages, read_at as readAt from pdf_reading').all() as { src: string; page: number; pages: number; readAt: string }[]).map((one) => [one.src, one]))
    const marks = new Map((db.prepare('select src, count(*) as n, count(gem_id) as gems from pdf_highlights group by src').all() as { src: string; n: number; gems: number }[]).map((one) => [one.src, one]))
    // How big the file is, read from the store: none when the file has gone.
    const bytes = (src: string): number | null => {
      const file = /assets\/([^/]+\.pdf)$/i.exec(src)?.[1]
      try { return file ? statSync(join(assetsDir(), file)).size : null } catch { return null }
    }
    const days = new Map<string, Day[]>()
    for (const one of db.prepare('select src, day, furthest from pdf_days').all() as (Day & { src: string })[]) days.set(one.src, [...(days.get(one.src) ?? []), one])
    const ribbons = new Map((db.prepare('select src, page from ribbons where slot = 0 and page > 0').all() as { src: string; page: number }[]).map((one) => [one.src, one.page]))
    const covers = new Map((db.prepare('select src, author, pages from pdf_covers').all() as { src: string; author: string; pages: number | null }[]).map((one) => [one.src, one]))
    return pdfs.map((one) => {
      const src = one.id.slice(0, one.id.indexOf('|'))
      const read = reading.get(src)
      const cover = covers.get(src)
      return { src, name: one.id.slice(one.id.indexOf('|') + 1), title: one.label, author: cover?.author ?? '', pages: read?.pages ?? cover?.pages ?? null, page: read?.page ?? null, ribbon: ribbons.get(src) ?? null, readAt: read?.readAt ?? null, addedAt: one.capturedAt, highlights: marks.get(src)?.n ?? 0, gems: marks.get(src)?.gems ?? 0, bytes: bytes(src), finishBy: read ? finishBy(days.get(src) ?? [], read.page, read.pages, localDay()) : null }
    })
  })
  // Words looked up on Wikipedia: its free summary of the article they name (CC BY-SA, said with its link), asked from here so no page talks to the internet itself.
  // Each answer is kept here by the words asked, so a word looked up again opens at once and offline;
  // one more than 30 days old is shown as kept and asked again behind it.
  db.exec('create table if not exists wiki_answers (term text primary key, answer text not null, at text not null)')
  const askWiki = async (term: string): Promise<unknown> => {
    const answer = await wikiOnline(term)
    if (answer && !('offline' in answer)) db.prepare('insert or replace into wiki_answers (term, answer, at) values (?, ?, ?)').run(term.toLowerCase(), JSON.stringify(answer), new Date().toISOString())
    return answer
  }
  ipcMain.handle('haligtree:wiki', async (_event, raw: unknown) => {
    const term = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
    if (!term || term.length > 120) return null
    const row = db.prepare('select answer, at from wiki_answers where term = ?').get(term.toLowerCase()) as { answer: string; at: string } | undefined
    // An answer kept before redirects were said (no `from`) is asked again once, so "Napoleon Bonaparte" finds its line.
    // One kept before Wikimedia's newer picture address was read (no `pictures`) is asked again once, for its picture.
    const kept = JSON.parse(row?.answer ?? 'null') ?? {}
    if (!row || !('from' in kept) || (!('missing' in kept) && !('pictures' in kept))) return askWiki(term)
    if (Date.now() - Date.parse(row.at) > 30 * 86_400_000) void askWiki(term)
    return JSON.parse(row.answer)
  })
  // The title read out of a PDF as it opens, kept so search finds it by that.
  db.exec(TITLES)
  // A note looked up in a PDF once named its source "The Law Book, p. 93", a Sources page for every
  // page: the book is its source and the page its place. Only where the name is a kept PDF's title.
  const kept = new Set((db.prepare('select title from pdf_titles').all() as { title: string }[]).map((one) => one.title.trim()))
  for (const note of db.prepare("select id, medium, fields from captures where medium like '%, p. %'").all() as { id: string; medium: string; fields: string | null }[]) {
    const [, book, page] = /^(.*), p\. (\d+)$/.exec(note.medium.trim()) ?? []
    if (!book || !kept.has(book.trim())) continue
    let fields: Record<string, unknown> = {}
    try { fields = JSON.parse(note.fields ?? '{}') ?? {} } catch { /* kept as it was, the page added */ }
    db.prepare('update captures set medium = ?, fields = ? where id = ?').run(book.trim(), JSON.stringify({ ...fields, location: fields.location ?? page }), note.id)
  }
  ipcMain.handle('haligtree:pdf:title', (_event, src: unknown, title: unknown) => {
    if (typeof src !== 'string' || typeof title !== 'string' || !title.trim()) return false
    if ((db.prepare('select title from pdf_titles where src = ?').get(src) as { title: string } | undefined)?.title === title.trim()) return false
    db.prepare('insert or replace into pdf_titles (src, title) values (?, ?)').run(src, title.trim())
    return true
  })
}

/**
 * A gem made from a highlight kept before line ends were read as spaces: its
 * title and words had "thenature" where the page says "the nature". Put
 * right wherever the old words stand, and only those words.
 */
export function unjoinGem(db: DatabaseSync, gem: string, was: string, now: string): boolean {
  const row = db.prepare('select title, body from nuggets where id = ?').get(gem) as { title: string | null; body: string | null } | undefined
  if (!row || !was || was === now) return false
  // The body is a document as JSON or Markdown: the words are replaced as they are written in it, JSON-escaped in a document.
  const swap = (text: string | null): string | null => {
    if (!text) return text
    const json = JSON.stringify(was).slice(1, -1)
    return text.split(json).join(JSON.stringify(now).slice(1, -1))
  }
  // A title cut short ("thenature of justice and...") holds the start of the words: each joined pair in it is mended.
  const pairs = now.split(' ').map((word, at, all) => [word + (all[at + 1] ?? ''), `${word} ${all[at + 1] ?? ''}`]).filter(([joined]) => joined && was.includes(joined))
  const mend = (title: string | null): string | null => {
    if (!title) return title
    let out = title.split(was).join(now)
    for (const [joined, apart] of pairs) if (!now.includes(joined)) out = out.replace(new RegExp(`(^|[^\\p{L}])${joined.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^\\p{L}]|$)`, 'gu'), `$1${apart.trim()}`)
    return out
  }
  const title = mend(row.title)
  const body = swap(row.body)
  if (title === row.title && body === row.body) return false
  db.prepare('update nuggets set title = ?, body = ? where id = ?').run(title, body, gem)
  return true
}

/** Wikipedia's summary of the article the words name, asked now: found, missing, or offline. */
async function wikiOnline(term: string): Promise<{ missing: true } | { offline: true } | { failed: true } | { title: string; description: string; extract: string; picture: string | null; pictures: number; url: string; from: string | null }> {
  const base = (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_WIKI) || 'https://en.wikipedia.org/api/rest_v1/page/summary/'
  try {
    const url = `${base}${encodeURIComponent(term.replace(/ /g, '_'))}?redirect=true`
    const response = base.startsWith('http://127.0.0.1') ? await fetch(url, { signal: AbortSignal.timeout(5000) }) : await fetchOutside(url, { signal: AbortSignal.timeout(5000), headers: { 'Api-User-Agent': 'Haligtree (a commonplace book)' } })
    if (response.status === 404) return { missing: true }
    if (!response.ok) return unreached()
    const page = (await response.json()) as { type?: string; title?: string; description?: string; extract?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } }
    if (!page.extract || page.type === 'disambiguation') return { missing: true }
    // The article's lead picture, only when it lives on Wikimedia Commons (freely licensed); an English-only file can be fair use.
    const picture = page.thumbnail?.source && /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(page.thumbnail.source) ? page.thumbnail.source.replace(/\?.*$/, '') : null
    // Wikipedia sent us on from the words asked ("Napoleon Bonaparte" to "Napoleon"): `from` keeps the words, so the page is known
    // as theirs. The address answered is the last one followed, here and in fetchOutside.
    const landed = response.url && new URL(response.url).pathname !== new URL(url).pathname
    return { title: page.title ?? term, description: page.description ?? '', extract: page.extract, picture, pictures: 2, url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}`, from: landed ? term : null }
  } catch {
    return unreached()
  }
}
