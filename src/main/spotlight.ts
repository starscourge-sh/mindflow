import { app } from 'electron'
import spotlightFile from '../../resources/spotlight.node?asset&asarUnpack'
import { database } from './captures'
import { spotlightOn } from './haligtree'
import { SANDBOX } from './sandbox'

/**
 * Your notes in Spotlight (native/spotlight.mm, Core Spotlight; every Mac): each
 * note's name and words in the Mac's own index, so ⌘Space finds them, and
 * choosing one opens it here (index.ts, continue-activity). Never a private or
 * #bit note, nothing in the Bin, no study cards. Kept in step every few minutes
 * from what changed; Settings' switch off takes every note out. Only the
 * installed app indexes (a development build would file notes under Electron),
 * and a probe only when it asks (HALIGTREE_QA_SPOTLIGHT), taking every item out after.
 */
type Native = {
  put: (items: { id: string; title: string; text: string; kind: string; date: string }[], done: (error: string | null) => void) => void
  remove: (ids: string[], done: (error: string | null) => void) => void
  clear: (done: (error: string | null) => void) => void
  find: (words: string, done: (ids: string[] | string | null) => void) => void
}
let native: Native | null | undefined
function load(): Native | null {
  if (native !== undefined) return native
  native = null
  // Never the sandbox's example notes: they are not yours.
  if (process.platform !== 'darwin' || !((app.isPackaged && !SANDBOX) || process.env.HALIGTREE_QA_SPOTLIGHT)) return null
  try {
    const module = { exports: {} as Native }
    process.dlopen(module, spotlightFile)
    native = module.exports
  } catch {
    // No Spotlight: the app is unchanged.
  }
  return native
}

const NOTES = `select 'capture' as type, id, label(title, body, named) as title, kind, words(id, body) as text, coalesce(edited_at, captured_at) as at from captures where status != 'discarded' and private = 0
  union all
  select tier, id, coalesce(nullif(title, ''), label('', body)), kind, words(id, body), coalesce(updated_at, created_at) from nuggets where tier not in ('card', 'deck') and private = 0 and binned_at is null`

/** What Spotlight holds, by its id, with the date it was given: only what changed is sent again. */
const sent = new Map<string, string>()
let syncing = false
// The first time each run, Spotlight is emptied of notes first: another book, opened last time, may have left its own.
let fresh = false

const call = <T>(run: (done: (value: T) => void) => void): Promise<T> => new Promise((done) => run(done))

export async function syncSpotlight(): Promise<number> {
  const mac = load()
  if (!mac || syncing) return 0
  syncing = true
  try {
    if (!spotlightOn()) {
      if (sent.size || !fresh) await call((done) => mac.clear(done))
      sent.clear()
      fresh = true
      return 0
    }
    if (!fresh) (await call((done) => mac.clear(done)), (fresh = true))
    const rows = database().prepare(NOTES).all() as { type: string; id: string; title: string; kind: string; text: string; at: string }[]
    const now = new Map(rows.map((row) => [`${row.type}:${row.id}`, row]))
    const gone = [...sent.keys()].filter((id) => !now.has(id))
    if (gone.length) await call((done) => mac.remove(gone, done))
    for (const id of gone) sent.delete(id)
    const changed = [...now].filter(([id, row]) => sent.get(id) !== row.at)
    // A few hundred at a time, so a book of 10,000 notes never holds the Mac up.
    for (let at = 0; at < changed.length; at += 200) {
      const batch = changed.slice(at, at + 200)
      const error = await call<string | null>((done) => mac.put(batch.map(([id, row]) => ({ id, title: row.title || 'Untitled', text: String(row.text ?? '').replace(/\u001e/g, '').slice(0, 4000), kind: row.kind, date: new Date(row.at).toISOString() })), done))
      if (error) break
      for (const [id, row] of batch) sent.set(id, row.at)
    }
    return changed.length
  } finally {
    syncing = false
  }
}

/** For a probe: the notes Spotlight finds by these words, by id. */
export const findInSpotlight = (words: string): Promise<string[]> => {
  const mac = load()
  return mac ? call<string[] | string | null>((done) => mac.find(words, done)).then((ids) => (Array.isArray(ids) ? ids : [])) : Promise.resolve([])
}

/** Spotlight's own word for an item chosen from it. */
export const SPOTLIGHT_ITEM = 'com.apple.corespotlightitem'

export function registerSpotlight(): void {
  if (!load()) return
  // A minute after start, then every five: never in the way of opening the app.
  const first = setTimeout(() => void syncSpotlight(), process.env.HALIGTREE_QA_SPOTLIGHT ? 2000 : 60_000)
  const every = setInterval(() => void syncSpotlight(), 5 * 60_000)
  first.unref()
  every.unref()
  app.on('haligtree:spotlight' as 'ready', () => void syncSpotlight())
  if (process.env.HALIGTREE_QA_SPOTLIGHT) {
    Object.assign(globalThis, { spotlight: { sync: syncSpotlight, find: findInSpotlight, clear: () => call((done) => native!.clear(done)) } })
  }
}
