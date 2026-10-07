import { dialog, ipcMain, type WebContents } from 'electron'
import { createHash } from 'crypto'
import { readdir, realpath, stat } from 'fs/promises'
import { basename, extname, isAbsolute, join } from 'path'
import { database } from './captures'
import { dayKey, dayjs, startOfDay } from './dates'
import { celebrationPrefs, gate, openGoals } from './vigil'
import { daysBetween, daysLeft, wayThrough } from './goal-days'
import { isSprite } from './sprite'

/**
 * Celebrations: a small card for the rare milestones (a 100th capture, an
 * inbox emptied, a week of capturing in a row), never for everyday saves.
 * What plays comes from a folder you choose, read in place and never changed.
 * GIFs are served as they are, so they keep moving; nothing is copied.
 * A sprite (a figure on a see-through background) walks on by itself
 * instead of being cropped into the card.
 */

/** The kinds of milestone, each of which can have files of its own to play. */
export const MOMENTS = ['kept', 'streak', 'inbox', 'tasks', 'year', 'answered', 'goalHalf', 'goal30', 'goal7', 'goalDay', 'goalMade', 'stickyDone', 'started'] as const
export type MomentKind = (typeof MOMENTS)[number]
/** A milestone, as the window shows it. `rank` decides between two at once. */
export type Moment = { id: string; kind: MomentKind; rank: number; headline: string; line?: string; mark: string; tint: string
  /** Steps passed along with it, marked shown with it so none comes after. */
  also?: string[] }
export type Media = { url: string; video: boolean; name: string; sprite?: boolean
  /** For a pick, the path it was saved as, so Settings can tell which one it is. */
  path?: string }

const KINDS: Record<string, 'image' | 'video'> = {
  '.gif': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.svg': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video'
}
/** Bigger than this is skipped: a card is no place for a film. */
const LARGEST = 25 * 1024 * 1024
// Whether each file is a sprite, kept while its size and date stay the same.
const sprites = new Map<string, { key: string; sprite: boolean }>()
async function spriteAt(path: string, facts: { size: number; mtimeMs: number }): Promise<boolean> {
  const key = `${facts.size}:${facts.mtimeMs}`
  const known = sprites.get(path)
  if (known?.key === key) return known.sprite
  const sprite = await isSprite(path)
  sprites.set(path, { key, sprite })
  return sprite
}

/** One celebration in this long, whatever else happens. */
const APART = 10 * 60000

// What the windows may load, by the name they ask for: only files found in
// the saved folder, and the files picked for a moment, ever get a name. A
// pick is a path in the settings, so it is only played once it has been
// followed to a real picture or clip of a size a card can hold.
let served = new Map<string, string>()
let picked = new Map<string, string>()
let listed: { folder: string; at: number; items: Media[]; names: Map<string, string> } | null = null

/** The usable files in a folder, looked at again after a minute. Only the saved folder's can be loaded. */
async function media(folder: string): Promise<Media[]> {
  if (!folder || !isAbsolute(folder)) return []
  const saved = folder === celebrationPrefs().folder
  if (listed?.folder === folder && Date.now() - listed.at < 60000) {
    if (saved) served = listed.names
    return listed.items
  }
  const items: Media[] = []
  const names = new Map<string, string>()
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const ext = extname(entry.name).toLowerCase()
    if (!entry.isFile() || entry.name.startsWith('.') || !KINDS[ext]) continue
    const path = join(folder, entry.name)
    const facts = await stat(path).catch(() => null)
    if (!facts?.size || facts.size > LARGEST) continue
    const name = nameFor(path)
    names.set(name, path)
    items.push({ url: `mindflow://celebrate/${name}`, video: KINDS[ext] === 'video', name: entry.name, sprite: await spriteAt(path, facts) })
  }
  // Another folder (Settings counting one) is only counted, so a card
  // showing now keeps its file.
  if (saved) served = names
  listed = { folder, at: Date.now(), items, names }
  return items
}

/** The name a file is asked for by: a hash of where it is, and its kind of file. */
const nameFor = (path: string): string => `${createHash('sha1').update(path).digest('hex').slice(0, 32)}${extname(path).toLowerCase()}`

/** The files picked for each moment, those still there and still playable. */
async function picks(): Promise<Partial<Record<MomentKind, Media[]>>> {
  const chosen = celebrationPrefs().picks
  const out: Partial<Record<MomentKind, Media[]>> = {}
  const names = new Map<string, string>()
  for (const kind of MOMENTS) {
    const list: Media[] = []
    for (const asked of chosen[kind] ?? []) {
      if (typeof asked !== 'string' || !isAbsolute(asked)) continue
      // Followed to where it really is, so a link named .gif is judged by what it points at.
      const path = await realpath(asked).catch(() => '')
      const ext = extname(path).toLowerCase()
      if (!path || !KINDS[ext]) continue
      const facts = await stat(path).catch(() => null)
      if (!facts?.isFile() || !facts.size || facts.size > LARGEST) continue
      const name = nameFor(path)
      names.set(name, path)
      list.push({ url: `mindflow://celebrate/${name}`, video: KINDS[ext] === 'video', name: basename(path), sprite: await spriteAt(path, facts), path: asked })
    }
    if (list.length) out[kind] = list
  }
  picked = names
  return out
}

/** Where a name the protocol was asked for lives, if it came from the folder or a pick. */
export const celebrationFile = (name: string): string | null => served.get(name) ?? picked.get(name) ?? null

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

// Each milestone is the highest one reached, not an exact count, so one held
// back (by the ten minutes, by a window that cannot show it, by a bigger one
// at the same time) still shows on a later save.
const KEPT: Record<number, number> = { 1: 10, 10: 20, 100: 60, 500: 80, 1000: 100 }
const STREAK: Record<number, number> = { 7: 30, 30: 65, 100: 90 }
/** The highest of these that `n` has reached, or 0. */
const reached = (steps: Record<number, number>, n: number): number => Math.max(0, ...Object.keys(steps).map(Number).filter((step) => step <= n))
const keptCount = (): number => count(`select count(*) as n from captures where ${TYPED}`)
const answeredCount = (): number => count("select count(*) as n from nuggets where tier = 'question' and closed_how = 'answered'")
/** The first answer, then each tenth reached. */
const answeredStep = (n: number): number => (n < 10 ? Math.min(n, 1) : n - (n % 10))

/** The 1st, 10th, 100th, 500th and 1,000th capture, as it is kept. */
function kept(): Moment | null {
  const n = reached(KEPT, keptCount())
  const rank = KEPT[n]
  if (!rank || fired(`kept:${n}`)) return null
  return n === 1
    ? { id: 'kept:1', kind: 'kept', rank, headline: 'Your first capture', line: 'Out of your head, and kept.', mark: '1', tint: TINT.blue }
    : { id: `kept:${n}`, kind: 'kept', rank, headline: `${n.toLocaleString('en')} captures kept`, line: 'Each one out of your head.', mark: n.toLocaleString('en'), tint: TINT.blue }
}

/** The days in a row with a capture, counted back from today, and the day the run began. */
function run(): { n: number; from: string } {
  const days = (database().prepare(`select distinct date(captured_at, 'localtime') as day from captures where ${TYPED} order by day desc`).all() as { day: string }[]).map((row) => row.day)
  let n = 0
  while (days[n] === dayjs().subtract(n, 'day').format('YYYY-MM-DD')) n++
  return { n, from: dayjs().subtract(Math.max(n - 1, 0), 'day').format('YYYY-MM-DD') }
}

/** Capturing 7, 30 or 100 days in a row: once a run, so a new run after a break counts again. */
function streak(): Moment | null {
  const { n: days, from } = run()
  const n = reached(STREAK, days)
  const rank = STREAK[n]
  const id = `streak:${from}:${n}`
  if (!rank || fired(id)) return null
  const line = { 7: 'Something kept every day for a week.', 30: 'Something kept every day for a month.', 100: 'A hundred days without missing one.' }[n as 7 | 30 | 100]
  return { id, kind: 'streak', rank, headline: `${n} days in a row`, line, mark: `${n}`, tint: TINT.orange }
}

/** The inbox emptied, on a day it held five or more: once a day. */
function emptied(): Moment | null {
  const id = `inbox:${dayKey()}`
  if (fired(id) || count("select count(*) as n from captures where status = 'open' and archived_at is null")) return null
  // Dealt with, or put away in the archive, today.
  const cleared = count('select count(*) as n from captures where exited_at >= ? or archived_at >= ?', today(), today())
  if (cleared < 5) return null
  return { id, kind: 'inbox', rank: 40, headline: 'Inbox empty', line: `${cleared} captures dealt with today.`, mark: '0', tint: TINT.green }
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
  return { id, kind: 'tasks', rank: 35, headline: "Today's tasks, all done", line: `${done} done today.`, mark: `${done}`, tint: TINT.green }
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
  return { id: `year:${itemId}`, kind: 'year', rank: 55, headline, line: row.private || gate().hidePrivate ? undefined : row.title, mark: `${years}y`, tint: TINT.purple }
}

/** A question answered: the first, then every tenth. */
function answered(id: unknown): Moment | null {
  const n = answeredStep(answeredCount())
  if (!n || fired(`answered:${n}`)) return null
  const row = typeof id === 'string' ? (database().prepare('select title, private from nuggets where id = ?').get(id) as { title: string; private: number } | undefined) : undefined
  return {
    id: `answered:${n}`, kind: 'answered', rank: n === 1 ? 45 : 50,
    headline: n === 1 ? 'Your first question answered' : `${n} questions answered`,
    line: row && !row.private && !gate().hidePrivate ? row.title : undefined, mark: `${n}`, tint: TINT.yellow
  }
}

/** A goal's steps on the road: halfway, 30 days left, a week left, the day itself. */
const STEPS = ['half', '30', '7', 'day'] as const
type Step = (typeof STEPS)[number]
/** The steps a goal has reached by now. Each only counts on a road long enough for it to mean something. */
function stepsReached(goal: { goalAt: string; goalFrom: string }): Step[] {
  const left = daysLeft(goal.goalAt)
  const total = daysBetween(goal.goalFrom, goal.goalAt)
  return STEPS.filter((step) =>
    step === 'half' ? total >= 14 && wayThrough(goal.goalFrom, goal.goalAt) >= 0.5 && left > 0
      : step === 'day' ? left === 0
        : left <= Number(step) && left > 0 && total > Number(step))
}
const STEP_MOMENT: Record<Step, { kind: MomentKind; rank: number; headline: string; tint: string }> = {
  half: { kind: 'goalHalf', rank: 42, headline: 'Halfway there', tint: TINT.orange },
  30: { kind: 'goal30', rank: 44, headline: '30 days to go', tint: TINT.orange },
  7: { kind: 'goal7', rank: 52, headline: 'One week to go', tint: TINT.orange },
  day: { kind: 'goalDay', rank: 70, headline: 'The day is here', tint: TINT.purple }
}
/** A goal's name on a card, unless it is private or the screen may be shared. */
const named = (goal: { title: string; private: number }): string | undefined => (goal.private || gate().hidePrivate ? undefined : goal.title)

/** The biggest step any open goal has reached and not yet shown, with its others passed along with it. */
function goalSteps(): Moment | null {
  const found: Moment[] = []
  for (const goal of openGoals()) {
    const fresh = stepsReached(goal).filter((step) => !fired(`goal:${goal.id}:${step}`))
    if (!fresh.length) continue
    const best = fresh.map((step) => ({ step, ...STEP_MOMENT[step] })).sort((a, b) => b.rank - a.rank)[0]
    const left = daysLeft(goal.goalAt)
    found.push({
      id: `goal:${goal.id}:${best.step}`, kind: best.kind, rank: best.rank, headline: best.headline, tint: best.tint,
      line: named(goal), mark: best.step === 'half' ? '½' : best.step === 'day' ? dayjs().format('D') : `${left}`,
      also: fresh.filter((step) => step !== best.step).map((step) => `goal:${goal.id}:${step}`)
    })
  }
  return found.sort((a, b) => b.rank - a.rank)[0] ?? null
}

/** A goal made: once a goal, and not when an undo puts it back. */
function madeIt(id: unknown): Moment | null {
  if (typeof id !== 'string' || fired(`goal:${id}:made`)) return null
  const row = database().prepare("select title, private from nuggets where id = ? and tier = 'goal' and closed_how = 'made it'").get(id) as { title: string; private: number } | undefined
  if (!row) return null
  return { id: `goal:${id}:made`, kind: 'goalMade', rank: 80, headline: 'You made it', line: named(row), mark: '✓', tint: TINT.green }
}

/**
 * A goal just set, or its dates moved: the steps it has already passed are
 * marked shown, dated long ago, so a goal set halfway along does not open
 * with a card. Steps still ahead are left to come.
 */
export function goalPassed(id: string): void {
  try {
    const goal = database().prepare("select goal_at as goalAt, goal_from as goalFrom from nuggets where id = ? and tier = 'goal'").get(id) as { goalAt: string; goalFrom: string } | undefined
    if (!goal) return
    const mark = database().prepare("insert or ignore into celebrations (id, at) values (?, '1970-01-01T00:00:00.000Z')")
    for (const step of stepsReached(goal)) mark.run(`goal:${id}:${step}`)
  } catch {
    // A milestone is never worth a failed save.
  }
}

/** The channels that can reach a milestone, and which ones each can reach. */
const WATCH: Record<string, (args: unknown[], result: unknown) => (Moment | null)[]> = {
  // A goal's steps come with time, so they show on the next save that can show one.
  'captures:create': () => [kept(), streak(), goalSteps()],
  'captures:save': (args, result) => {
    const status = (args[1] as { status?: string } | undefined)?.status
    const took = status && status !== 'open' && (result as { was?: string; refused?: boolean })?.was === 'open' && !(result as { refused?: boolean }).refused
    return took ? [emptied()] : []
  },
  // Every other way a capture leaves the inbox.
  promote: () => [emptied()],
  'nugget:from': () => [emptied()],
  clue: () => [emptied(), goalSteps()],
  'notes:archive': (args) => (args[2] && args[0] !== 'nuggets' ? [emptied()] : []),
  'capture:merge': () => [emptied()],
  toTask: () => [emptied()],
  'tasks:from': () => [emptied()],
  'question:new': () => [emptied()],
  'task:done': () => [finished(), goalSteps()],
  'goal:close': (args) => (args[1] === 'made it' ? [madeIt(args[0])] : []),
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
    for (const id of best.also ?? []) database().prepare('insert or ignore into celebrations (id, at) values (?, ?)').run(id, at)
    // A note from long ago is also the day's one.
    if (best.id.startsWith('year:')) database().prepare('insert or ignore into celebrations (id, at) values (?, ?)').run(`year:${dayKey()}`, at)
    sender.send('celebrate', { ...best, also: undefined })
  } catch {
    // A milestone is never worth a failed save.
  }
}

/** A sticky's list done shows at most once a minute per note, however often its last box is ticked. */
const STICKY_APART = 60000
const stickyAt = new Map<string, number>()

/**
 * Every to-do on a sticky ticked: its own small celebration, in the sticky.
 * Not a milestone: it is never written down, never waits ten minutes, and
 * never holds a milestone back. Not in safe mode or quiet hours.
 */
function stickyDone(id: unknown): Moment | null {
  if (typeof id !== 'string') return null
  const { on } = celebrationPrefs()
  const { blackout, hidePrivate } = gate()
  if (!on || blackout || hidePrivate) return null
  const last = stickyAt.get(id)
  if (last && Date.now() - last < STICKY_APART) return null
  stickyAt.set(id, Date.now())
  return { id: `sticky:${id}`, kind: 'stickyDone', rank: 0, headline: 'All done', mark: '✓', tint: TINT.green }
}

/**
 * Getting started, every step done: once ever, on the same terms as the
 * milestones (celebrations on, not in quiet hours, never over another card).
 * One held back is not marked, so the shelf asks again a little later.
 */
export function startedMoment(name = ''): Moment | null | false {
  try {
    // Already given: false, so nothing asks again.
    if (fired('started')) return false
    const { on } = celebrationPrefs()
    if (!on || gate().blackout) return null
    const last = (database().prepare('select max(at) as at from celebrations').get() as { at: string | null }).at
    // Never on top of another card; but a minute apart, not ten: the checklist
    // is often finished within ten minutes of the first capture's own card.
    if (last && Date.now() - new Date(last).getTime() < 60000) return null
    database().prepare('insert or ignore into celebrations (id, at) values (?, ?)').run('started', new Date().toISOString())
    return { id: 'started', kind: 'started', rank: 90, headline: name ? `You are all set, ${name}.` : 'You are all set.', line: 'Press ⌘. whenever something crosses your mind.', mark: '✓', tint: TINT.orange }
  } catch {
    return null
  }
}

/**
 * Once, the milestones already passed are marked as shown, dated long ago so
 * they hold nothing back: someone with 150 captures gets no card for the 1st,
 * 10th or 100th the day this arrives. A table from before this is marked too.
 */
function seed(): void {
  if (fired('seeded:v2')) return
  const mark = database().prepare("insert or ignore into celebrations (id, at) values (?, '1970-01-01T00:00:00.000Z')")
  const kept = keptCount()
  const answers = answeredCount()
  const { n: days, from } = run()
  for (const step of Object.keys(KEPT).map(Number)) if (step <= kept) mark.run(`kept:${step}`)
  for (let step = answeredStep(answers); step > 0; step = step === 10 ? 1 : step - 10) mark.run(`answered:${step}`)
  for (const step of Object.keys(STREAK).map(Number)) if (step <= days) mark.run(`streak:${from}:${step}`)
  mark.run('seeded:v2')
}

export function registerCelebrations(): void {
  database().exec('create table if not exists celebrations (id text primary key, at text not null)')
  seed()
  ipcMain.on('celebrate:host', (event, on: unknown) => void (on ? hosts.add(event.sender.id) : hosts.delete(event.sender.id)))
  // The files in a folder: the one asked about (Settings' count, never then
  // loadable unless it is the saved one), or the saved one.
  ipcMain.handle('vigil:celebrations', (_event, folder?: unknown) =>
    media(typeof folder === 'string' ? folder : celebrationPrefs().folder))
  // The files picked for each moment, from the settings, each followed and checked by picks().
  ipcMain.handle('vigil:celebrations:picks', () => picks())
  ipcMain.handle('vigil:celebrations:sticky', (_event, id: unknown) => stickyDone(id))
  ipcMain.handle('vigil:celebrations:choose', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Choose what plays',
      buttonLabel: 'Use these',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'GIFs, pictures, sprites and clips', extensions: Object.keys(KINDS).map((ext) => ext.slice(1)) }]
    })
    return filePaths
  })
}
