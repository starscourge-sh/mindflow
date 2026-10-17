import { app, ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { userInfo } from 'os'
import { join } from 'path'
import { database } from './captures'
import { hushWhile, startedMoment } from './celebrate'

/**
 * The welcome, the page hints and Getting started, as the main process sees
 * them: who is new, what they have done so far (read from the data, so nothing
 * has to remember to tick), and whether the one key that matters was taken by
 * another app. Everything is kept as rows in the settings table, so a reset
 * of the data is a reset of this too.
 */

const SANDBOX = process.argv.includes('--sandbox')

type Marks = Record<string, string>
type Progress = { marks: Marks; hidden: boolean; doneAt: string | null }
/**
 * What the welcome asked before anything else: what Vigil is for, what you
 * used before, your first space (a #tag, with an exam date for a course) and
 * a goal. Each is optional; what was answered shapes the sidebar, Getting
 * started and the importer offered.
 */
export type Setup = { use: 'study' | 'work' | 'writing' | 'life' | null; from: string[]; space: string | null; exam: string | null; goal: string | null; goalBy: string | null
  /** What Vigil made from them (welcome-you.tsx, applySetup), so each is made once and can be taken back. */
  made?: { sidebarWas?: string[] | null; sidebarFor?: Setup['use']; examTag?: string | null; goalId?: string | null; goalTitle?: string | null; goalBy?: string | null; /** The first capture, from “What's on your mind?” */ firstId?: string | null }
  /** The things made that were undone, left alone from then on. */
  undone?: ('sidebar' | 'exam' | 'goal')[]
}
const NO_SETUP: Setup = { use: null, from: [], space: null, exam: null, goal: null, goalBy: null }

const read = <T>(key: string, fallback: T): T => {
  try {
    const row = database().prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown): void =>
  void database().prepare('insert or replace into settings (key, value) values (?, ?)').run(key, JSON.stringify(value))
const any = (sql: string): boolean => {
  try {
    return !!database().prepare(sql).get()
  } catch {
    return false
  }
}

/** Anything of yours at all: a capture, something kept, a task. */
const hasData = (): boolean =>
  any('select 1 from captures limit 1') || any('select 1 from nuggets limit 1') || any('select 1 from tasks limit 1')

/** A brand-new Vigil: never welcomed and nothing in it. Never the sandbox, which has its own way in. */
export const firstRun = (): boolean => !SANDBOX && !read<string | null>('welcomed', null) && (!hasData() || read<boolean>('welcomeBegun', false))

// --- the one key --------------------------------------------------------------

/** The keys that could not be taken (another app holds them), by the keys they were made with. */
const taken = new Map<string, string>()
/** Told by `anywhere()` as each key is taken, or is not. */
export function noteChord(made: string, now: string | null, ok: boolean): void {
  if (ok || !now) taken.delete(made)
  else taken.set(made, now)
}
/** For a test: pretend another app holds these keys (as Settings writes them). */
export const pretendTaken = (now: string | null): boolean => !!now && (process.env.MINDFLOW_QA_TAKEN ?? '').split(',').includes(now)

let trayBounds: () => Electron.Rectangle | null = () => null
export const whereTray = (find: () => Electron.Rectangle | null): void => void (trayBounds = find)

/** The first word of your Mac's own name for you, read once. Nothing when it cannot be read. */
let firstName: string | undefined
function nameOf(): string {
  if (firstName !== undefined) return firstName
  try {
    const full = process.platform === 'darwin' ? execFileSync('id', ['-F'], { timeout: 800 }).toString().trim() : userInfo().username
    firstName = /^[\p{L}][\p{L}'-]{0,23}$/u.test(full.split(/\s+/)[0] ?? '') ? full.split(/\s+/)[0] : ''
  } catch {
    firstName = ''
  }
  return firstName
}

/** What a sticky on the desktop is, from the file the stickies are kept in. */
function stuckNotes(): boolean {
  try {
    const list = JSON.parse(readFileSync(join(app.getPath('userData'), 'stickies.json'), 'utf8')) as { type?: string }[]
    return Array.isArray(list) && list.some((one) => one.type && one.type !== 'goal')
  } catch {
    return false
  }
}

/** Getting started, each step worked out from what is really there. `tag` is the renderer's, which owns tags. */
function steps(marks: Marks): Record<string, boolean> {
  return {
    catch: any("select 1 from captures where coalesce(source, '') = '' limit 1"),
    keep: any("select 1 from nuggets where tier = 'nugget' limit 1"),
    review: any('select 1 from review_log limit 1'),
    task: any('select 1 from tasks limit 1'),
    // A focus session on a task, not a kettle timer from the box.
    focus: any("select 1 from sessions where task_id != '' and abandoned_at is null limit 1"),
    hold: any("select 1 from nuggets where tier in ('question', 'goal') limit 1"),
    stick: stuckNotes(),
    search: !!marks.search,
    // From the welcome's questions and the checklist's longer list.
    card: any("select 1 from nuggets where tier = 'nugget' and coalesce(prompt, '') != '' limit 1"),
    space: !!read<Setup>('setup', NO_SETUP).space || !!marks.space,
    import: any('select 1 from captures where imported_at is not null limit 1') || any("select 1 from nuggets where source != '' limit 1"),
    goal: any("select 1 from nuggets where tier = 'goal' limit 1"),
    tour: !!marks.tour
  }
}

function state(): unknown {
  const welcomed = read<string | null>('welcomed', null)
  const progress = read<Progress>('onboarding', { marks: {}, hidden: false, doneAt: null })
  const keys = read<Record<string, string | null>>('keys', {})
  const box = '⌘.' in keys ? keys['⌘.'] : '⌘.'
  const tray = trayBounds()
  return {
    sandbox: SANDBOX,
    firstRun: firstRun(),
    welcomed,
    // Here before the welcome existed: told about it once, quietly.
    news: !SANDBOX && !welcomed && hasData() && !read<boolean>('welcomeBegun', false) && !read<boolean>('newsSeen', false),
    steps: steps(progress.marks ?? {}),
    marks: progress.marks ?? {},
    hidden: !!progress.hidden,
    doneAt: progress.doneAt ?? null,
    hintsSeen: read<string[]>('hintsSeen', []),
    pageHints: read<boolean>('pageHints', true),
    box,
    // The box's key, if another app has it.
    boxTaken: taken.has('⌘.'),
    name: read<boolean>('safeMode', false) ? '' : nameOf(),
    setup: { ...NO_SETUP, ...read<Partial<Setup>>('setup', {}) },
    tray: tray && { x: tray.x + tray.width / 2, y: tray.y + tray.height }
  }
}

const PATCHABLE = new Set(['welcomed', 'newsSeen', 'hintsSeen', 'pageHints', 'welcoming', 'setup'])

/** Whether the welcome is open now, for the box to say something warmer while it is. */
let welcoming = false
export const isWelcoming = (): boolean => welcoming
/** Told each time the welcome opens or closes. */
const welcomeWatchers = new Set<(on: boolean) => void>()
export const whenWelcoming = (watch: (on: boolean) => void): void => void welcomeWatchers.add(watch)
// While the welcome runs, a milestone is kept as had but not shown over it.
hushWhile(isWelcoming)

export function registerOnboarding(): void {
  ipcMain.handle('vigil:onboarding:state', () => state())
  ipcMain.handle('vigil:onboarding:set', (_event, patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!PATCHABLE.has(key)) continue
      if (key === 'welcoming') {
        const was = welcoming
        welcoming = !!value
        if (was !== welcoming) welcomeWatchers.forEach((watch) => watch(welcoming))
        // Begun and not finished (quit after one catch): it opens again next time, as a first run.
        if (welcoming && !read<string | null>('welcomed', null)) write('welcomeBegun', true)
      }
      else write(key, value)
    }
    if ('hidden' in (patch ?? {})) write('onboarding', { ...read<Progress>('onboarding', { marks: {}, hidden: false, doneAt: null }), hidden: !!patch.hidden })
    return state()
  })
  ipcMain.handle('vigil:onboarding:mark', (_event, step: unknown) => {
    if (typeof step !== 'string') return state()
    const now = read<Progress>('onboarding', { marks: {}, hidden: false, doneAt: null })
    if (!now.marks?.[step]) write('onboarding', { ...now, marks: { ...now.marks, [step]: new Date().toISOString() } })
    return state()
  })
  // Every step done: the day is written down once, and the celebration given
  // if one may play now (it waits, never lost, if another just played).
  ipcMain.handle('vigil:onboarding:finish', (_event, name?: unknown) => {
    const now = read<Progress>('onboarding', { marks: {}, hidden: false, doneAt: null })
    if (!now.doneAt) write('onboarding', { ...now, doneAt: new Date().toISOString() })
    return startedMoment(typeof name === 'string' ? name : '')
  })
  ipcMain.handle('vigil:onboarding:welcoming', () => welcoming)
}
