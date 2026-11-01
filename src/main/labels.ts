import { spawn } from 'node:child_process'
import { basename, join } from 'node:path'
import { ipcMain } from 'electron'
import helper from '../../resources/labels?asset&asarUnpack'
import { assetsDir } from './pictures'

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

export function registerLabels(): void {
  ipcMain.handle('haligtree:labels', (_event, src: unknown) => findLabels(String(src ?? '')))
}
