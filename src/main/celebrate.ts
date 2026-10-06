import { ipcMain, type WebContents } from 'electron'
import { createHash } from 'crypto'
import { readdir, stat } from 'fs/promises'
import { extname, isAbsolute, join } from 'path'
import { database } from './captures'
import { dayKey, dayjs, startOfDay } from './dates'
import { celebrationPrefs, gate } from './vigil'

/**
 * Celebrations: a small card for the rare milestones (a 100th capture, an
 * inbox emptied, a week of capturing in a row), never for everyday saves.
 * What plays comes from a folder you choose, read in place and never changed.
 * GIFs are served as they are, so they keep moving; nothing is copied.
 */

/** A milestone, as the window shows it. `rank` decides between two at once. */
export type Moment = { id: string; rank: number; headline: string; line?: string; mark: string; tint: string }
export type Media = { url: string; video: boolean; name: string }

const KINDS: Record<string, 'image' | 'video'> = {
  '.gif': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video'
}
/** Bigger than this is skipped: a card is no place for a film. */
const LARGEST = 25 * 1024 * 1024
/** One celebration in this long, whatever else happens. */
const APART = 10 * 60000

// What the windows may load, by the name they ask for: only files found in
// the chosen folder ever get a name, so nothing else on the disk can be read.
let served = new Map<string, string>()
let listed: { folder: string; at: number; items: Media[] } | null = null

/** The usable files in the folder, looked at again after a minute. */
async function media(folder: string): Promise<Media[]> {
  if (!folder || !isAbsolute(folder)) return []
  if (listed?.folder === folder && Date.now() - listed.at < 60000) return listed.items
  const items: Media[] = []
  const names = new Map<string, string>()
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const ext = extname(entry.name).toLowerCase()
    if (!entry.isFile() || entry.name.startsWith('.') || !KINDS[ext]) continue
    const path = join(folder, entry.name)
    const facts = await stat(path).catch(() => null)
    if (!facts?.size || facts.size > LARGEST) continue
    const name = `${createHash('sha1').update(path).digest('hex').slice(0, 32)}${ext}`
    names.set(name, path)
    items.push({ url: `mindflow://celebrate/${name}`, video: KINDS[ext] === 'video', name: entry.name })
  }
  served = names
  listed = { folder, at: Date.now(), items }
  return items
}

/** Where a name the protocol was asked for lives, if it came from the folder. */
export const celebrationFile = (name: string): string | null => served.get(name) ?? null

// The windows that can show one: the box and the main window. A milestone
// reached anywhere else (a note in its own window, a sticky) waits for one of
// these, rather than being spent where nothing can show it.
const hosts = new Set<number>()

// --- the milestones -------------------------------------------------------

const TINT = { blue: 'var(--tt-color-text-blue)', orange: 'var(--tt-color-text-orange)', green: 'var(--tt-color-text-green)', purple: 'var(--tt-color-text-purple)', yellow: 'var(--tt-color-text-yellow)' }
const count = (sql: string, ...args: (string | number)[]): number => (database().prepare(sql).get(...args) as { n: number }).n
const fired = (id: string): boolean => !!database().prepare('select 1 from celebrations where id = ?').get(id)
const today = (): string => new Date(startOfDay()).toISOString()
/** Typed into Vigil, not brought in by an import. */
const TYPED = "coalesce(source, '') = ''"

/** The 1st, 10th, 100th, 500th and 1,000th capture, as it is kept. */
function kept(): Moment | null {
  const n = count(`select count(*) as n from captures where ${TYPED}`)
  const rank = ({ 1: 10, 10: 20, 100: 60, 500: 80, 1000: 100 } as Record<number, number>)[n]
  if (!rank || fired(`kept:${n}`)) return null
  return n === 1
    ? { id: 'kept:1', rank, headline: 'Your first capture', line: 'Out of your head, and kept.', mark: '1', tint: TINT.blue }
    : { id: `kept:${n}`, rank, headline: `${n.toLocaleString('en')} captures kept`, line: 'Each one out of your head.', mark: n.toLocaleString('en'), tint: TINT.blue }
}

/** Capturing 7, 30 or 100 days in a row, counted back from today. */
function streak(): Moment | null {
  const days = (database().prepare(`select distinct date(captured_at, 'localtime') as day from captures where ${TYPED} order by day desc limit 101`).all() as { day: string }[]).map((row) => row.day)
  let n = 0
  while (days[n] === dayjs().subtract(n, 'day').format('YYYY-MM-DD')) n++
  const rank = ({ 7: 30, 30: 65, 100: 90 } as Record<number, number>)[n]
  if (!rank || fired(`streak:${n}`)) return null
  const line = { 7: 'Something kept every day for a week.', 30: 'Something kept every day for a month.', 100: 'A hundred days without missing one.' }[n as 7 | 30 | 100]
  return { id: `streak:${n}`, rank, headline: `${n} days in a row`, line, mark: `${n}`, tint: TINT.orange }
}

/** The inbox emptied, on a day it held five or more: once a day. */
function emptied(): Moment | null {
  const id = `inbox:${dayKey()}`
  if (fired(id) || count("select count(*) as n from captures where status = 'open' and archived_at is null")) return null
  const cleared = count('select count(*) as n from captures where exited_at >= ?', today())
  if (cleared < 5) return null
  return { id, rank: 40, headline: 'Inbox empty', line: `${cleared} captures dealt with today.`, mark: '0', tint: TINT.green }
}

/** Every task due today done, on a day with three or more done: once a day. */
function finished(): Moment | null {
  const id = `tasks:${dayKey()}`
  const end = new Date(startOfDay(1)).toISOString()
  if (fired(id) || count("select count(*) as n from tasks where status = 'open' and due_at is not null and due_at < ?", end)) return null
  const done = count('select count(distinct task_id) as n from task_done where done_at >= ?', today())
  // Only a day that had something due counts, not a quiet one with odd jobs done.
  const due = count('select count(*) as n from tasks where due_at >= ? and due_at < ?', today(), end) +
    count("select count(*) as n from tasks t join task_done d on d.task_id = t.id where d.done_at >= ? and t.recurrence is not null", today())
  if (done < 3 || !due) return null
  return { id, rank: 35, headline: "Today's tasks, all done", line: `${done} done today.`, mark: `${done}`, tint: TINT.green }
}

/** A note back in review that was kept a year or more ago: once a note, once a day. */
function longAgo(itemId: unknown): Moment | null {
  if (typeof itemId !== 'string') return null
  const row = database().prepare('select title, created_at as createdAt, private from nuggets where id = ?').get(itemId) as { title: string; createdAt: string; private: number } | undefined
  if (!row) return null
  const years = dayjs().diff(dayjs(row.createdAt), 'year')
  const day = `year:${dayKey()}`
  if (years < 1 || fired(`year:${itemId}`) || fired(day)) return null
  const onTheDay = dayjs(row.createdAt).format('MM-DD') === dayjs().format('MM-DD')
  const headline = onTheDay ? `${years === 1 ? 'A year' : `${years} years`} ago today you kept this` : `Kept ${years === 1 ? 'a year' : `${years} years`} ago`
  // A private note is never named on a card that might be on a shared screen.
  return { id: `year:${itemId}`, rank: 55, headline, line: row.private || gate().hidePrivate ? undefined : row.title, mark: `${years}y`, tint: TINT.purple }
}

/** A question answered: the first, then every tenth. */
function answered(id: unknown): Moment | null {
  const n = count("select count(*) as n from nuggets where tier = 'question' and closed_how = 'answered'")
  if (!(n === 1 || n % 10 === 0) || fired(`answered:${n}`)) return null
  const row = typeof id === 'string' ? (database().prepare('select title, private from nuggets where id = ?').get(id) as { title: string; private: number } | undefined) : undefined
  return {
    id: `answered:${n}`, rank: n === 1 ? 45 : 50,
    headline: n === 1 ? 'Your first question answered' : `${n} questions answered`,
    line: row && !row.private && !gate().hidePrivate ? row.title : undefined, mark: `${n}`, tint: TINT.yellow
  }
}

/** The channels that can reach a milestone, and which ones each can reach. */
const WATCH: Record<string, (args: unknown[], result: unknown) => (Moment | null)[]> = {
  'captures:create': () => [kept(), streak()],
  'captures:save': (args, result) => {
    const status = (args[1] as { status?: string } | undefined)?.status
    const took = status && status !== 'open' && (result as { was?: string; refused?: boolean })?.was === 'open' && !(result as { refused?: boolean }).refused
    return took ? [emptied()] : []
  },
  // Every other way a capture leaves the inbox.
  promote: () => [emptied()],
  'capture:merge': () => [emptied()],
  toTask: () => [emptied()],
  'tasks:from': () => [emptied()],
  'question:new': () => [emptied()],
  'task:done': () => [finished()],
  'session:end': () => [finished()],
  'question:close': (args) => (args[1] === 'answered' && !args[2] ? [answered(args[0])] : []),
  'review:grade': (args) => [longAgo(args[0])]
}
export const watches = (channel: string): boolean => channel in WATCH

/**
 * After a watched channel's write: the biggest milestone it reached, if any,
 * to the window it came from. At most one in ten minutes; one held back by
 * that is not counted as shown.
 */
export function celebrateAfter(channel: string, sender: WebContents, args: unknown[], result: unknown): void {
  try {
    if (!WATCH[channel] || sender.isDestroyed() || !hosts.has(sender.id)) return
    const { on } = celebrationPrefs()
    if (!on || gate().blackout) return
    const last = (database().prepare('select max(at) as at from celebrations').get() as { at: string | null }).at
    if (last && Date.now() - new Date(last).getTime() < APART) return
    const best = WATCH[channel](args, result).filter((one): one is Moment => !!one).sort((a, b) => b.rank - a.rank)[0]
    if (!best) return
    const at = new Date().toISOString()
    database().prepare('insert or ignore into celebrations (id, at) values (?, ?)').run(best.id, at)
    // A note from long ago is also the day's one.
    if (best.id.startsWith('year:')) database().prepare('insert or ignore into celebrations (id, at) values (?, ?)').run(`year:${dayKey()}`, at)
    sender.send('celebrate', best)
  } catch {
    // A milestone is never worth a failed save.
  }
}

export function registerCelebrations(): void {
  database().exec('create table if not exists celebrations (id text primary key, at text not null)')
  ipcMain.on('celebrate:host', (event, on: unknown) => void (on ? hosts.add(event.sender.id) : hosts.delete(event.sender.id)))
  // The files in a folder: the one asked about (Settings' count), or the chosen one.
  ipcMain.handle('vigil:celebrations', (_event, folder?: unknown) =>
    media(typeof folder === 'string' ? folder : celebrationPrefs().folder))
}
