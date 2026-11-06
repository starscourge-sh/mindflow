import { execFile, spawn } from 'node:child_process'
import { basename, join } from 'node:path'
import { ipcMain } from 'electron'
import helper from '../../resources/labels?asset&asarUnpack'
import { assetsDir } from './pictures'
import { database } from './captures'

/**
 * The labels on a picture (a diagram's names for its parts), found on this Mac
 * by a small helper (native/labels.swift) using Apple's Vision text
 * recognition: on device, no AI service, no internet. Each label comes with
 * its box as a share of the picture, from the top left, for "Make cards from
 * a picture" to cover.
 */
export type Label = { text: string; x: number; y: number; w: number; h: number }
export type Labels = { labels: Label[] } | { error: { code: string; message: string } }

const STORED = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/

export function findLabels(src: string): Promise<Labels> {
  if (process.platform !== 'darwin') return Promise.resolve({ error: { code: 'unavailable', message: 'Labels are found for you only on a Mac for now: cover them by hand' } })
  const stored = STORED.exec(src)
  if (!stored) return Promise.resolve({ error: { code: 'missing', message: 'The picture could not be found' } })
  return new Promise((resolve) => {
    const child = spawn(helper, [join(assetsDir(), basename(stored[1]))], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (out += chunk))
    // A picture takes a second or two; a minute means something is wrong.
    const late = setTimeout(() => child.kill(), 60_000)
    const end = (): void => {
      clearTimeout(late)
      const lines = out.split('\n').flatMap((line) => {
        try {
          return line.trim() ? [JSON.parse(line) as Record<string, unknown>] : []
        } catch {
          return []
        }
      })
      const error = lines.find((one) => one.error)?.error as { code: string; message: string } | undefined
      if (error) return resolve({ error })
      if (!lines.some((one) => one.done)) return resolve({ error: { code: 'failed', message: 'The labels could not be found. Cover them by hand' } })
      resolve({ labels: lines.filter((one) => one.label).map((one) => one.label as Label) })
    }
    child.on('close', end)
    child.on('error', end)
  })
}

/**
 * Where a picture cut to a shape should centre: its largest face, else what
 * the eye goes to first (native/labels.swift --focus), kept per picture.
 */
const focused = new Map<string, { x: number; y: number } | null>()
function pictureFocus(src: string): Promise<{ x: number; y: number } | null> {
  const stored = STORED.exec(src)
  if (!stored || process.platform !== 'darwin') return Promise.resolve(null)
  if (focused.has(stored[1])) return Promise.resolve(focused.get(stored[1])!)
  const db = database()
  db.exec('create table if not exists picture_focus (name text primary key, x real, y real)')
  const kept = db.prepare('select x, y from picture_focus where name = ?').get(stored[1]) as { x: number | null; y: number | null } | undefined
  if (kept) return Promise.resolve(kept.x === null || kept.y === null ? null : { x: kept.x, y: kept.y })
  return new Promise((resolve) => {
    execFile(helper, ['--focus', join(assetsDir(), basename(stored[1]))], { timeout: 30_000 }, (error, out) => {
      let at: { x: number; y: number } | null = null
      try {
        if (!error) at = (JSON.parse(String(out).trim()) as { focus: { x: number; y: number } }).focus
      } catch {
        // Not read: the cut stays in the middle.
      }
      focused.set(stored[1], at)
      db.prepare('insert or replace into picture_focus (name, x, y) values (?, ?, ?)').run(stored[1], at?.x ?? null, at?.y ?? null)
      resolve(at)
    })
  })
}

export function registerLabels(): void {
  ipcMain.handle('haligtree:picture:focus', (_event, src: unknown) => pictureFocus(String(src ?? '')))
  ipcMain.handle('haligtree:labels', (_event, src: unknown) => findLabels(String(src ?? '')))
}
