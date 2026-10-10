import { app, net } from 'electron'
import { createHash } from 'crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { celebrationPrefs } from './vigil'

/**
 * A GIF from Giphy for a celebration, found with your own key and your own
 * search words. Asked from here, never from the page. The list found is kept
 * for a day; each GIF is downloaded once, small, into the app's own folder,
 * and played from there. Offline, with no key, or slow, it gives nothing and
 * the celebration plays what it would have anyway.
 */

/** One result, as much of it as a card needs. */
type Gif = { id: string; title: string; mp4: string; still: string; width: number; height: number }
type Kept = { words: string; at: number; gifs: Gif[]; recent: string[] }
export type GiphyMedia = { url: string; video: boolean; name: string; giphy: true; id: string; still?: string; width: number; height: number }

const DAY = 24 * 60 * 60000
const SEARCH = 'https://api.giphy.com/v1/gifs/search'
const dir = (): string => join(app.getPath('userData'), 'giphy-cache')
const listFile = (): string => join(dir(), 'results.json')

/** The key in your settings; a test run on a data folder of its own may give one in its environment instead. */
const keyOf = (saved: string): string => saved.trim() || (process.env.MINDFLOW_USER_DATA ? process.env.MINDFLOW_GIPHY_KEY ?? '' : '')

export const giphyPrefs = (): { on: boolean; key: string; words: string; stars: string[] } => {
  const prefs = celebrationPrefs()
  return { on: prefs.on && prefs.giphy, key: keyOf(prefs.giphyKey), words: prefs.giphyWords.trim() || 'ed edd n eddy celebrate', stars: prefs.giphyStars }
}

// The names the windows may ask for, each a file in the cache.
const served = new Map<string, string>()
const nameFor = (path: string, ext: string): string => `${createHash('sha1').update(path).digest('hex').slice(0, 32)}${ext}`
export const giphyFile = (name: string): string | null => served.get(name) ?? null
const serve = (path: string, ext: string): string => {
  const name = nameFor(path, ext)
  served.set(name, path)
  return `mindflow://celebrate/${name}`
}

let kept: Kept | null = null
async function load(): Promise<Kept | null> {
  if (kept) return kept
  kept = await readFile(listFile(), 'utf8').then((text) => JSON.parse(text) as Kept, () => null)
  return kept
}
async function save(): Promise<void> {
  if (!kept) return
  await mkdir(dir(), { recursive: true })
  await writeFile(listFile(), JSON.stringify(kept)).catch(() => undefined)
}

/** Giphy's answer, read down to what is kept. A clip that is not there is passed over. */
type Found = { id?: string; title?: string; images?: Record<string, { mp4?: string; url?: string; width?: string; height?: string }> }
const read = (data: Found[]): Gif[] =>
  data.flatMap((one) => {
    const moving = one.images?.fixed_height
    const still = one.images?.fixed_height_still
    if (!one.id || !/^[A-Za-z0-9]+$/.test(one.id) || !moving?.mp4) return []
    return [{ id: one.id, title: one.title ?? '', mp4: moving.mp4, still: still?.url ?? '', width: Number(moving.width) || 356, height: Number(moving.height) || 200 }]
  })

let asking: Promise<Gif[]> | null = null
/** The results for your words: the day's kept list, or a fresh one. Offline, yesterday's will do. */
async function results(): Promise<Gif[]> {
  const { key, words } = giphyPrefs()
  const old = await load()
  if (old && old.words === words && Date.now() - old.at < DAY && old.gifs.length) return old.gifs
  if (!key) return old?.words === words ? old.gifs : []
  asking ??= (async () => {
    try {
      // Words that find nothing ("ed edd n eddy celebrate" does not) are
      // asked again a word shorter, twice at most.
      let gifs: Gif[] = []
      for (let q = words.split(/\s+/), tries = 0; !gifs.length && q.length && tries < 3; q = q.slice(0, -1), tries++) {
        const url = `${SEARCH}?${new URLSearchParams({ api_key: key, q: q.join(' '), limit: '25', rating: 'pg', lang: 'en' })}`
        const answer = await net.fetch(url, { signal: AbortSignal.timeout(6000) })
        if (!answer.ok) throw new Error(`${answer.status}`)
        gifs = read(((await answer.json()) as { data?: Found[] }).data ?? [])
      }
      if (!gifs.length) throw new Error('none')
      kept = { words, at: Date.now(), gifs, recent: old?.recent ?? [] }
      await save()
      void tidy()
      return gifs
    } catch {
      return old?.words === words ? old.gifs : []
    } finally {
      asking = null
    }
  })()
  return asking
}

const clipPath = (gif: Gif): string => join(dir(), `${gif.id}.mp4`)
const stillPath = (gif: Gif): string => join(dir(), `${gif.id}.gif`)
const there = (path: string): Promise<boolean> => stat(path).then((facts) => facts.size > 0, () => false)

/** One file downloaded into the cache, once: written beside and moved in, so a half-done one is never played. */
async function download(url: string, path: string): Promise<boolean> {
  if (await there(path)) return true
  if (!/^https:\/\/media\d*\.giphy\.com\//.test(url)) return false
  try {
    const answer = await net.fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!answer.ok) return false
    const bytes = Buffer.from(await answer.arrayBuffer())
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return false
    await mkdir(dir(), { recursive: true })
    await writeFile(`${path}.part`, bytes)
    await rename(`${path}.part`, path)
    return true
  } catch {
    return false
  }
}

/** Files of GIFs no longer in the list, nor starred, are let go. */
async function tidy(): Promise<void> {
  const keep = new Set([...(kept?.gifs ?? []).map((gif) => gif.id), ...giphyPrefs().stars])
  for (const name of await readdir(dir()).catch(() => [] as string[])) {
    const id = name.split('.')[0]
    if (name !== 'results.json' && !keep.has(id)) await unlink(join(dir(), name)).catch(() => undefined)
  }
}

const media = async (gif: Gif): Promise<GiphyMedia> => {
  const still = (await there(stillPath(gif))) ? serve(stillPath(gif), '.gif') : undefined
  return { url: serve(clipPath(gif), '.mp4'), video: true, name: gif.title || 'A GIF from Giphy', giphy: true, id: gif.id, still, width: gif.width, height: gif.height }
}

/** Pick one: a starred one three times in four when there are some, never one of the last few shown while there are others. */
function choose(gifs: Gif[], ready: Set<string>, stars: string[], recent: string[]): Gif | null {
  const avoid = new Set(recent.slice(0, Math.min(10, gifs.length - 1)))
  const fresh = gifs.filter((gif) => !avoid.has(gif.id))
  const pool = fresh.length ? fresh : gifs
  const starred = pool.filter((gif) => stars.includes(gif.id))
  const from = starred.length && Math.random() < 0.75 ? starred : pool
  // One already downloaded plays at once; the next one is fetched meanwhile.
  const now = from.filter((gif) => ready.has(gif.id))
  const list = now.length ? now : from
  return list[Math.floor(Math.random() * list.length)] ?? null
}

/**
 * A GIF for a celebration now, or null (off, no key, offline, nothing found).
 * One already downloaded is chosen first; another is fetched behind it for
 * next time, so after the first a card never waits on the network.
 */
export async function giphyNow(): Promise<GiphyMedia | null> {
  const { on, key, stars } = giphyPrefs()
  if (!on || !key) return null
  const gifs = await results()
  if (!gifs.length) return null
  const ready = new Set<string>()
  for (const gif of gifs) if (await there(clipPath(gif))) ready.add(gif.id)
  const gif = choose(gifs, ready, stars, kept?.recent ?? [])
  if (!gif) return null
  if (!ready.has(gif.id) && !(await download(gif.mp4, clipPath(gif)))) return null
  await download(gif.still, stillPath(gif))
  if (kept) {
    kept.recent = [gif.id, ...kept.recent.filter((id) => id !== gif.id)].slice(0, 12)
    void save()
  }
  // The next one, behind it.
  const next = gifs.find((one) => !ready.has(one.id) && one.id !== gif.id)
  if (next) void download(next.mp4, clipPath(next)).then(() => download(next.still, stillPath(next)))
  return media(gif)
}

/** The day's results for Settings to star from, each with its still picture. Why there are none, if there are none. */
export async function giphyList(): Promise<{ gifs: { id: string; title: string; still: string }[]; why?: 'off' | 'key' | 'offline' }> {
  const { key } = giphyPrefs()
  if (!key) return { gifs: [], why: 'key' }
  const gifs = await results()
  if (!gifs.length) return { gifs: [], why: 'offline' }
  await Promise.all(gifs.map((gif) => download(gif.still, stillPath(gif))))
  const out: { id: string; title: string; still: string }[] = []
  for (const gif of gifs) if (await there(stillPath(gif))) out.push({ id: gif.id, title: gif.title, still: serve(stillPath(gif), '.gif') })
  return { gifs: out, why: out.length ? undefined : 'offline' }
}

/** One of the results to see now, from Settings. */
export async function giphyOne(id: unknown): Promise<GiphyMedia | null> {
  const gif = (await results()).find((one) => one.id === id)
  if (!gif || !(await download(gif.mp4, clipPath(gif)))) return null
  return media(gif)
}

/** Soon after starting, the first one fetched, so the first card does not wait on it. */
export function warmGiphy(): void {
  setTimeout(() => {
    const { on, key } = giphyPrefs()
    if (!on || !key) return
    void results().then(async (gifs) => {
      const gif = gifs[Math.floor(Math.random() * gifs.length)]
      if (gif) await download(gif.mp4, clipPath(gif)).then(() => download(gif.still, stillPath(gif)))
    })
  }, 20000).unref?.()
}
