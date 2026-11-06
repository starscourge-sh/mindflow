import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import helper from '../../resources/labels?asset&asarUnpack'
import { assetsDir } from './pictures'

/**
 * A scanned book made searchable: "Read the text on these pages" has the Mac
 * read every page with Vision (native/labels.swift --pdf, on device, no
 * internet) and write a copy with the words laid invisibly over each page.
 * The copy is kept beside the book in its store ("<hash>.read.pdf") and served
 * in its place wherever the book is opened (index.ts), so find, picking words,
 * highlights, cards and "Read aloud" work on it as on any PDF; the book's own
 * file and every link to it stay as they were. Taking the read copy away
 * ("Forget the read text") brings the scan back as it came.
 */

const STORED = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64})\.pdf$/

/** The read copy of a stored book, by its asset name ("<hash>.pdf"); null for anything else. */
export const readCopy = (name: string): string | null => (/^[a-f0-9]{64}\.pdf$/.test(name) ? join(assetsDir(), name.replace(/\.pdf$/, '.read.pdf')) : null)

type Reading = { page: number; of: number; child: ChildProcess }
const reading = new Map<string, Reading>()

export type ReadState = { reading: { page: number; of: number } } | { read: true } | { read: false }

function state(src: string): ReadState {
  const now = reading.get(src)
  if (now) return { reading: { page: now.page, of: now.of } }
  const hash = STORED.exec(src)?.[1]
  return { read: !!hash && existsSync(join(assetsDir(), `${hash}.read.pdf`)) }
}

const tell = (src: string, said: Record<string, unknown>): void => {
  for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('pdf:reading', { src, ...said })
}

function read(src: string): { started: true } | { error: string } {
  if (process.platform !== 'darwin') return { error: 'Reading a scanned book needs a Mac' }
  const hash = STORED.exec(src)?.[1]
  if (!hash) return { error: 'Only a book kept in Haligtree can be read' }
  if (reading.has(src)) return { started: true }
  const book = join(assetsDir(), `${hash}.pdf`)
  if (!existsSync(book)) return { error: 'The book could not be found' }
  const child = spawn(helper, ['--pdf', book, join(assetsDir(), `${hash}.read.pdf`)], { stdio: ['ignore', 'pipe', 'ignore'] })
  const now: Reading = { page: 0, of: 0, child }
  reading.set(src, now)
  let rest = ''
  let done: { lines: number; pages: number } | null = null
  let error: string | null = null
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    rest += chunk
    let at: number
    while ((at = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, at)
      rest = rest.slice(at + 1)
      try {
        const said = JSON.parse(line) as { page?: number; of?: number; done?: { lines: number; pages: number }; error?: { message: string } }
        if (said.page) {
          now.page = said.page
          now.of = said.of ?? now.of
          tell(src, { page: now.page, of: now.of })
        }
        if (said.done) done = said.done
        if (said.error) error = said.error.message
      } catch {
        // Not a line of the helper's: let go.
      }
    }
  })
  const end = (): void => {
    if (reading.get(src) !== now) return
    reading.delete(src)
    // Stopped or failed: the half-written copy goes, and the book stays a scan.
    if (!done) void rm(join(assetsDir(), `${hash}.read.pdf.part`), { force: true })
    if (done) tell(src, { done: true, lines: done.lines, pages: done.pages })
    else tell(src, { error: error ?? (child.killed ? 'Stopped' : 'The pages could not be read') })
  }
  child.on('close', end)
  child.on('error', end)
  return { started: true }
}

export function registerPdfText(): void {
  ipcMain.handle('haligtree:pdf:read-state', (_event, src: unknown) => state(String(src ?? '')))
  ipcMain.handle('haligtree:pdf:read-text', (_event, src: unknown) => read(String(src ?? '')))
  ipcMain.handle('haligtree:pdf:read-stop', (_event, src: unknown) => {
    const now = reading.get(String(src ?? ''))
    now?.child.kill()
    return !!now
  })
  ipcMain.handle('haligtree:pdf:read-forget', async (_event, src: unknown) => {
    const hash = STORED.exec(String(src ?? ''))?.[1]
    if (!hash || reading.has(String(src))) return false
    await rm(join(assetsDir(), `${hash}.read.pdf`), { force: true })
    return true
  })
}
