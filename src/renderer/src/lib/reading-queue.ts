import { chime } from './sound'
import { call, useLive } from './haligtree'
import { toast, refuse } from '@/components/haligtree/ui'
import type { MenuItem } from '@/components/haligtree/row-menu'
import { num } from '../../../main/dates'
import { clip } from '../../../main/clip'
import type { QueueRow } from '../../../main/reading-queue'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
export type { QueueRow }

/**
 * The reading queue, as the windows see it: what you mean to read next, in
 * order, Spotify's way. Add to queue puts something at the end, Read next at
 * the front. The table is src/main/reading-queue.ts; the page is
 * components/haligtree/queue-view.tsx.
 */

export type Queue = { queue: QueueRow[]; read: QueueRow[] }
type Kept = { id: string; item_type: string; item_id: string; position: number; added_at: string; done_at: string | null }

export const readingQueue = {
  list: () => call<Queue>('queue'),
  add: (ids: string[], next = false) => call<{ added: number; before: Kept[] }>('queue:add', ids, next),
  put: (rows: Kept[]) => call<boolean>('queue:put', rows),
  move: (id: string, target: string, after: boolean) => call<boolean>('queue:move', id, target, after),
  remove: (id: string) => call<Kept | null>('queue:remove', id),
  restore: (row: Kept) => call<boolean>('queue:restore', row),
  done: (id: string, at?: string) => call<boolean>('queue:done', id, at),
  /** Back on the queue: at the front, or `inPlace` where it was (an undo). */
  undone: (id: string, inPlace = false) => call<boolean>('queue:undone', id, inPlace),
  forget: () => call<boolean>('queue:forget')
}

/** The queue and what was read from it, read again whenever anything is written. */
export function useQueue(): Queue {
  return useLive(readingQueue.list, { queue: [], read: [] } as Queue)
}

/** Add to queue (the end) or Read next (the front), said in a toast with an Undo. */
export async function enqueue(ids: string[], next = false): Promise<void> {
  if (!ids.length) return
  const { added, before } = await readingQueue.add(ids, next)
  if (!added) return refuse('Only notes, gems and writing can wait in the queue')
  chime(next ? 'stick' : 'tuck')
  const what = added === 1 ? 'It' : `${added} notes`
  toast(next ? `${what} ${added === 1 ? 'plays' : 'play'} next in your queue` : `${what} ${added === 1 ? 'is' : 'are'} in your queue`, () => void readingQueue.put(before).then(() => chime('undo')))
}

/**
 * Taken out of the queue, one or several, with one notice and one Undo. Only
 * the queue's line goes: the note, gem or writing stays where it is.
 */
export async function dequeue(rows: QueueRow | QueueRow[]): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows]
  const was = (await Promise.all(list.map((row) => readingQueue.remove(row.id)))).filter((one) => !!one)
  chime('away')
  toast(list.length === 1 ? 'Out of the queue: it stays where it was' : `Took ${num(list.length)} out of the queue: they stay where they were`,
    was.length ? () => void Promise.all(was.map((one) => readingQueue.restore(one))).then(() => chime('undo')) : undefined)
}

/** Several marked read at once: into Read, with one notice and one Undo. */
export async function finishAll(rows: QueueRow[]): Promise<void> {
  await Promise.all(rows.map((row) => readingQueue.done(row.id)))
  chime('done')
  toast(`Moved ${num(rows.length)} to Read`, () => void Promise.all(rows.map((row) => readingQueue.undone(row.id, true))).then(() => chime('undo')))
}

/** Read: off the queue and into Read, with an Undo. */
export async function finish(row: QueueRow, quiet = false): Promise<void> {
  await readingQueue.done(row.id)
  if (quiet) return
  chime('done')
  toast(`Read: ${clip(row.title, 40)}`, () => void readingQueue.undone(row.id, true).then(() => chime('undo')))
}

/** The two verbs, for any row's or note's menu: Add to queue and Read next. */
export const queueItems = (id: string): MenuItem[] => [
  { label: 'Add to queue', run: () => void enqueue([id]) },
  { label: 'Read next', run: () => void enqueue([id], true) }
]

/** Read the queue from `start`, in read mode, wherever the main window is. */
export const readQueue = (start = 0): void => void window.dispatchEvent(new CustomEvent('haligtree:queue-read', { detail: { start } }))

/**
 * A link that is only a link: its page in the browser, and once you come
 * back to Haligtree it counts as read (with an Undo). `then` runs on the way back.
 */
export function openLink(row: QueueRow, then?: () => void): void {
  if (!row.url) return
  chime('open')
  window.open(row.url, '_blank')
  let left = false
  const away = (): void => void (left = true)
  const back = (): void => {
    if (!left) return
    window.removeEventListener('blur', away)
    window.removeEventListener('focus', back)
    void finish(row).then(() => then?.())
  }
  window.addEventListener('blur', away)
  window.addEventListener('focus', back)
  // Never left (the browser opened behind): given up after a while, nothing marked.
  setTimeout(() => (window.removeEventListener('blur', away), left || window.removeEventListener('focus', back)), 10 * 60_000)
}

const TIER: Record<string, string> = { nugget: 'Gem', article: 'Page', question: 'Question' }
/** What it is, in a word: its kind for a capture, its tier for a kept thing. */
export const kindOf = (row: QueueRow): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((one) => one.id === row.kind)
export const saidOf = (row: QueueRow): string => (row.bare && row.url ? hostOf(row.url) : row.type === 'capture' ? kindOf(row)?.label ?? 'Note' : TIER[row.type] ?? 'Note')
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'A link'
  }
}

