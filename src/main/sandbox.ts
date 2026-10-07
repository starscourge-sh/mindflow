import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { copyFile, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'

import { changed, database } from './captures'
import { dayKey } from './dates'

/**
 * The sandbox: a practice copy of Vigil, full of examples, kept apart from
 * your notes by its folder alone. It is a second data folder,
 * `<your data>/sandbox/`, opened by starting the app again with `--sandbox`.
 * Everything the app writes (the database, pictures, stickies, the windows'
 * own storage, drafts) lives under the data folder, so moving that one folder
 * before the app is ready moves all of it, and nothing in the running app has
 * to be swapped or cleared. Your notes are never opened by the sandbox.
 *
 * Information only ever goes one way at a time, through a file: your look in
 * (`sandbox/carry.json`, written by your own app before it restarts), and
 * what you caught while practising out (`sandbox-carry-out.json`, written by
 * the sandbox as it leaves, read by your own app when it starts).
 */

/** This run is the sandbox. Only ever set by the restart: a normal launch is always your own notes. */
export const SANDBOX = process.argv.includes('--sandbox')

/** Your own data folder: a test run's, or the one the app has always used. */
export const realRoot = (): string => process.env.MINDFLOW_USER_DATA ?? join(app.getPath('appData'), 'mindflow')
/** The sandbox's folder, inside yours, which never reads it. */
export const sandboxRoot = (): string => join(realRoot(), 'sandbox')
/** Where this run keeps everything. */
export const dataRoot = (): string => (SANDBOX ? sandboxRoot() : realRoot())
/** A test run or the sandbox: no iCloud, no login item, no copies anywhere else. */
export const apart = (): boolean => SANDBOX || !!process.env.MINDFLOW_USER_DATA

const CARRY = 'carry.json'
const OUT = 'sandbox-carry-out.json'

/**
 * Point the app at its data folder, before it is ready. A reset clears the
 * sandbox's folder here, while nothing has it open, keeping only the look
 * that was carried in. Gives back whether this run holds the one-copy lock
 * (always, for a test run), taken on your own folder so a normal launch while
 * the sandbox runs comes to the sandbox rather than starting a second Vigil.
 */
export function useDataFolder(): boolean {
  if (SANDBOX && process.argv.includes('--sandbox-reset')) {
    let carried: string | null = null
    try {
      carried = readFileSync(join(sandboxRoot(), CARRY), 'utf8')
    } catch {
      // Nothing was carried in.
    }
    rmSync(sandboxRoot(), { recursive: true, force: true })
    if (carried) {
      mkdirSync(sandboxRoot(), { recursive: true })
      writeFileSync(join(sandboxRoot(), CARRY), carried)
    }
  }
  app.setPath('userData', realRoot())
  const locked = !!process.env.MINDFLOW_USER_DATA || app.requestSingleInstanceLock()
  app.setPath('userData', dataRoot())
  return locked
}

/**
 * Start again, into the sandbox or back to your notes. Every window may
 * close first, the same way quitting lets them, so stickies keep their
 * places; the new run opens the main window straight away.
 */
export function relaunch(into: 'sandbox' | 'real', reset = false): void {
  const base = process.argv.slice(1).filter((arg) => !arg.startsWith('--sandbox') && arg !== '--show-home')
  const args = [...base, '--show-home', ...(into === 'sandbox' ? ['--sandbox', ...(reset ? ['--sandbox-reset'] : [])] : [])]
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.closable = true
  app.relaunch({ args })
  app.quit()
}

const read = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}
const setting = (key: string): unknown => {
  const row = database().prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
  try {
    return row ? JSON.parse(row.value) : undefined
  } catch {
    return undefined
  }
}
const isIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d\d-\d\d/.test(value)

/** What a sandbox capture carries home: its words as they are, and what kind it was. */
type Carried = { body: unknown; kind: string; capturedAt: string; title: string; attribution: string | null; private: number }

/** One move of a date into the past, from the fixed list the seed may ask for. */
type Age =
  | { glossAt: string; id: string }
  | { done: string; at: string }
  | { reviewedAt: string; itemId: string; nth: number }
  | { dueAt: string; nuggetId: string }
  | { createdAt: string; nuggetId: string }
  | { exitedAt: string; captureId: string }

export function registerSandbox(): void {
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:sandbox:${channel}`, (_event, ...args) => run(...(args as never[])))

  handle('state', () => ({
    on: SANDBOX,
    seeded: SANDBOX && !!setting('sandboxSeededOn'),
    seededOn: SANDBOX ? ((setting('sandboxSeededOn') as string | undefined) ?? null) : null
  }))

  // In the sandbox: the look carried in from your own app, to wear on its first start.
  handle('carry', () => (SANDBOX ? read<Record<string, unknown> | null>(join(sandboxRoot(), CARRY), null) : null))

  // From your own app: your look written down for the sandbox, then the restart.
  // The sandbox's folder is only written here, never read by your app.
  handle('enter', async (carry: unknown) => {
    if (SANDBOX) return false
    await mkdir(sandboxRoot(), { recursive: true })
    if (carry && typeof carry === 'object') await writeFile(join(sandboxRoot(), CARRY), JSON.stringify(carry))
    setTimeout(() => relaunch('sandbox'), 60)
    return true
  })

  // From the sandbox: anything caught for real while practising is written
  // down for your app to offer, then back to your notes.
  handle('leave', async () => {
    if (!SANDBOX) return false
    const since = setting('sandboxSeededAt')
    const rows = isIso(since)
      ? (database().prepare("select body, kind, captured_at as capturedAt, title, attribution, private from captures where captured_at > ? and status != 'discarded' and coalesce(source, '') = '' order by captured_at").all(since) as Carried[])
      : []
    const mine = rows.map((row) => ({ ...row, body: JSON.parse(String(row.body ?? 'null')) }))
    if (mine.length) {
      // Added to any not yet brought home from an earlier visit.
      const earlier = read<Carried[]>(join(realRoot(), OUT), [])
      const known = new Set(earlier.map((one) => `${one.capturedAt}|${JSON.stringify(one.body)}`))
      const all = [...earlier, ...mine.filter((one) => !known.has(`${one.capturedAt}|${JSON.stringify(one.body)}`))]
      await writeFile(join(realRoot(), OUT), JSON.stringify(all))
    }
    setTimeout(() => relaunch('real'), 60)
    return mine.length
  })

  handle('reset', () => {
    if (!SANDBOX) return false
    setTimeout(() => relaunch('sandbox', true), 60)
    return true
  })

  // The seed is finished: the sandbox is set out, and anything caught from now on is yours.
  handle('seeded', () => {
    if (!SANDBOX) return false
    const put = database().prepare('insert or replace into settings (key, value) values (?, ?)')
    put.run('sandboxSeededOn', JSON.stringify(dayKey()))
    put.run('sandboxSeededAt', JSON.stringify(new Date().toISOString()))
    changed()
    return true
  })

  // The one write the app has nowhere else: a few dates moved into the past,
  // so the examples look lived in. Only in the sandbox, only these moves.
  handle('age', (moves: unknown) => {
    if (!SANDBOX || !Array.isArray(moves)) return 0
    const db = database()
    let done = 0
    for (const move of moves as Age[]) {
      if ('glossAt' in move && isIso(move.glossAt)) done += Number(db.prepare('update glosses set created_at = ? where id = ?').run(move.glossAt, String(move.id)).changes)
      else if ('done' in move && isIso(move.at)) done += Number(db.prepare('insert into task_done (task_id, done_at) select id, ? from tasks where id = ?').run(move.at, String(move.done)).changes)
      else if ('reviewedAt' in move && isIso(move.reviewedAt)) {
        const row = db.prepare('select rowid from review_log where item_id = ? order by reviewed_at, rowid limit 1 offset ?').get(String(move.itemId), Math.max(0, Number(move.nth) || 0)) as { rowid: number } | undefined
        if (row) done += Number(db.prepare('update review_log set reviewed_at = ? where rowid = ?').run(move.reviewedAt, row.rowid).changes)
      } else if ('dueAt' in move && isIso(move.dueAt)) done += Number(db.prepare('update nuggets set due_at = ? where id = ?').run(move.dueAt, String(move.nuggetId)).changes)
      else if ('createdAt' in move && isIso(move.createdAt)) done += Number(db.prepare('update nuggets set created_at = ?, updated_at = ? where id = ?').run(move.createdAt, move.createdAt, String(move.nuggetId)).changes)
      else if ('exitedAt' in move && isIso(move.exitedAt)) done += Number(db.prepare('update captures set exited_at = ? where id = ?').run(move.exitedAt, String(move.captureId)).changes)
    }
    changed()
    return done
  })

  // The bundled landscapes, written into the sandbox's own folder for
  // Scenery to read like any folder of yours. Only plain names, only webp.
  handle('scenery', async (files: unknown) => {
    if (!SANDBOX || !Array.isArray(files)) return ''
    const folder = join(sandboxRoot(), 'Sandbox scenery')
    await mkdir(folder, { recursive: true })
    for (const file of files as { name: unknown; bytes: unknown }[]) {
      if (typeof file?.name !== 'string' || !/^[a-z-]+\.webp$/.test(file.name) || !(file.bytes instanceof Uint8Array)) continue
      await writeFile(join(folder, file.name), file.bytes)
    }
    return folder
  })

  // In your own app: what was caught in the sandbox, waiting to be brought home.
  handle('carried', () => {
    if (SANDBOX) return []
    return read<Carried[]>(join(realRoot(), OUT), []).map((one) => ({ title: one.title, kind: one.kind, capturedAt: one.capturedAt }))
  })
  // Brought in as captures of your own, kept as they were written and when;
  // their pictures copied over from the sandbox's store. Or left: either way
  // the file goes.
  handle('carried:take', async (bring: unknown) => {
    if (SANDBOX) return 0
    const file = join(realRoot(), OUT)
    const all = read<Carried[]>(file, [])
    let made = 0
    if (bring === true) {
      const db = database()
      for (const one of all) {
        const body = JSON.stringify(one.body ?? null)
        for (const [, name] of body.matchAll(/mindflow:\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)/g)) {
          const from = join(sandboxRoot(), 'assets', name)
          const to = join(realRoot(), 'assets', name)
          if (existsSync(from) && !existsSync(to)) await mkdir(join(realRoot(), 'assets'), { recursive: true }).then(() => copyFile(from, to)).catch(() => undefined)
        }
        db.prepare(`insert into captures (id, number, title, kind, body, captured_at, source, private, attribution)
          values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, ?, ?, '', ?, ?)`)
          .run(randomUUID(), one.title ?? '', String(one.kind || 'note'), body, isIso(one.capturedAt) ? one.capturedAt : new Date().toISOString(), one.private ? 1 : 0, one.attribution ?? null)
        made++
      }
      if (made) changed()
    }
    await rm(file, { force: true })
    return made
  })
}

