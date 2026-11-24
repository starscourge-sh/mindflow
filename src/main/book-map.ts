import type { DatabaseSync } from 'node:sqlite'
import { LABEL } from './book-words'
import { fileLink } from './find-files'
import { mentionsIn } from './links-in'
import { noteTags } from './book-tags'

/**
 * The Map, as a read of the book and nothing else (no Electron in it): every
 * note not private, the links between them either way, and each one's tags
 * and pictures. It reads every note, so it is asked of the reading thread
 * (reader.ts) and never holds main. Each ask carries the book's stamp
 * (captures.ts `bookStamp`): while it has not moved, the Map is not read again.
 */

type Node = { type: string; id: string; title: string; private: number }
/** A stored picture's address. */
const PICTURE = /haligtree:\/\/assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif|bmp|heic|svg)/

export function bookMap(db: DatabaseSync) {
  // What a note's words work out to, kept per note and worked out again when they change.
  type Kept<T> = Map<string, { body: string; value: T }>
  const remember = <T>(kept: Kept<T>, key: string, body: string, make: () => T): T => {
    const was = kept.get(key)
    if (was?.body === body) return was.value
    const value = make()
    kept.set(key, { body, value })
    return value
  }
  const tagged: Kept<string[]> = new Map()
  const map = () => {
    const rows = [
      // A note saved as a gem is on the map once, as the gem.
      ...db.prepare(`select 'capture' as type, id, ${LABEL} as title, kind, body, fields, captured_at as at from captures where status != 'discarded' and private = 0
        and not (status = 'promoted' and exists (select 1 from nuggets n where n.capture_id = captures.id and n.private = 0 and n.tier not in ('card', 'deck')))`).all(),
      ...db.prepare("select tier as type, id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, kind, body, fields, coalesce((select captured_at from captures c where c.id = nuggets.capture_id), created_at) as at from nuggets where private = 0 and tier not in ('card', 'deck')").all()
    ] as (Node & { kind: string; body: string | null; fields?: string | null; at: string })[]
    const known = new Set(rows.map((row) => row.id))
    // A PDF or a kept article linked from a note is on the map too, as a dot of its own, once.
    const files = new Map<string, ReturnType<typeof fileLink>>()
    const fileOf = (link: string, at: string): ReturnType<typeof fileLink> => {
      if (!files.has(link)) {
        const file = fileLink(db, link)
        files.set(link, file)
        if (file) (rows.push({ type: file.type, id: file.id, title: file.title, kind: file.type, body: null, at, private: 0 }), known.add(file.id))
      }
      return files.get(link)
    }
    // Each pair once, weighed by how often either one links to the other, and which way (1: the first to the
    // second, 2: back, 3: both), for the Map's arrows.
    const pairs = new Map<string, [string, string, number, number]>()
    for (const row of [...rows])
      for (const [link, times] of mentionsIn(row.body)) {
        // A link names its note as `id` or `tier:id`; a file as `pdf:` or `web:` and its address.
        const to = /^(pdf|web):/.test(link) ? (fileOf(link, row.at)?.id ?? '') : link.includes(':') ? link.split(':')[1] : link
        if (to === row.id || !known.has(to)) continue
        const [a, b] = row.id < to ? [row.id, to] : [to, row.id]
        const way = row.id === a ? 1 : 2
        const pair = pairs.get(`${a} ${b}`)
        if (pair) ((pair[2] += times), (pair[3] |= way))
        else pairs.set(`${a} ${b}`, [a, b, times, way])
      }
    const links = new Map<string, number>()
    for (const [a, b] of pairs.values()) (links.set(a, (links.get(a) ?? 0) + 1), links.set(b, (links.get(b) ?? 0) + 1))
    const linked = rows.filter((row) => links.has(row.id))
    // A note's main tag, for its colour on the map: one given a colour on the
    // Tags page first, then the one most linked notes share.
    const colours = new Map((db.prepare('select tag, color from tag_meta').all() as { tag: string; color: string | null }[]).map((row) => [row.tag, row.color]))
    // Every note's tags, the ones with no links too (the Map can show them); counted over the linked ones, so the
    // colours stay the same whether or not those are shown.
    const tagsOf = new Map(rows.map((row) => [row.id, remember(tagged, row.id, `${row.title}\n${row.body}\n${row.fields ?? ''}`, () =>
      noteTags(row.title, row.body, row.fields))]))
    const used = new Map<string, number>()
    for (const row of linked) for (const tag of tagsOf.get(row.id)!) used.set(tag, (used.get(tag) ?? 0) + 1)
    const main = (tags: string[]): string | undefined => [...tags].sort((a, b) => Number(!!colours.get(b)) - Number(!!colours.get(a)) || used.get(b)! - used.get(a)!)[0]
    // Each main tag its own colour: one chosen on the Tags page kept, the rest
    // given the hues still free, the commonest first, so two tags rarely match.
    const mains = new Map(rows.map((row) => [row.id, main(tagsOf.get(row.id)!)]))
    const counted = new Map<string, number>()
    for (const row of linked) if (mains.get(row.id)) counted.set(mains.get(row.id)!, (counted.get(mains.get(row.id)!) ?? 0) + 1)
    // Tags found only on notes with no links come after, so they never take a hue from a linked one.
    for (const tag of mains.values()) if (tag && !counted.has(tag)) counted.set(tag, 0)
    const hue = new Map([...counted.keys()].filter((tag) => colours.get(tag)).map((tag) => [tag, colours.get(tag)!]))
    const HUES = ['purple', 'green', 'blue', 'orange', 'pink', 'red', 'yellow']
    const free = HUES.filter((one) => ![...hue.values()].includes(one))
    let next = 0
    for (const [tag] of [...counted].sort((a, b) => b[1] - a[1]))
      if (!hue.has(tag)) hue.set(tag, free.length ? free[next++ % free.length] : HUES[next++ % HUES.length])
    const PICTURES = new RegExp(PICTURE.source, 'g')
    const dotOf = ({ type, id, title, kind, body, at }: (typeof rows)[number]) => {
      const tag = mains.get(id), tags = tagsOf.get(id)!
      // Every picture in it, for "Pictures as dots"; the first one for its own dot.
      const pictures = body?.includes('haligtree://assets/') ? [...new Set(body.match(PICTURES))] : []
      return { type, id, title, kind, links: links.get(id) ?? 0, at, ...(tag ? { tag, tint: hue.get(tag)! } : {}), ...(tags.length ? { tags } : {}), ...(pictures.length ? { picture: pictures[0], pictures } : {}) }
    }
    return {
      nodes: linked.map(dotOf),
      edges: [...pairs.values()],
      alone: rows.length - links.size,
      // The ones left off: listed in the map's corner, and shown as dots when "Hide notes with no links" is off.
      lonely: rows.filter((row) => !links.has(row.id)).map(dotOf)
    }
  }
  let drawn: { stamp: number; map: ReturnType<typeof map> } | null = null
  return (stamp: number): ReturnType<typeof map> => {
    if (drawn?.stamp !== stamp) drawn = { stamp, map: map() }
    return drawn.map
  }
}
