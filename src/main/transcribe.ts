import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { app, ipcMain } from 'electron'
import helper from '../../resources/transcribe?asset&asarUnpack'
import { assetsDir } from './pictures'

/**
 * Voice notes into words, on this Mac: Apple's own speech recognition, offline
 * wherever the Mac can, run by a small helper (native/transcribe.swift) that
 * says each sentence with its start and end. Nothing leaves the Mac, and it
 * costs nothing, so it is fine in a sold app.
 */
export type Segment = { text: string; start: number; end: number }
export type Transcript = { segments: Segment[]; text: string; onDevice: boolean } | { error: { code: string; message: string } } | { stopped: true }

const STORED = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/

/** The helper at work on each recording now, by its stored address: what "Stop" ends. */
const working = new Map<string, ChildProcess>()
/** Recordings stopped by the person: their run says so rather than failing. */
const stopping = new Set<string>()

/** Run the helper and read its JSON lines, each handed to `each` as it comes (a segment, as it is heard). */
function run(args: string[], each?: (line: Record<string, unknown>) => void, key?: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const lines: Record<string, unknown>[] = []
    const child = spawn(helper, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    if (key) working.set(key, child)
    let rest = ''
    const read = (text: string): void => {
      try {
        if (!text.trim()) return
        const line = JSON.parse(text)
        lines.push(line)
        each?.(line)
      } catch {
        // A line that is not the helper's own: left out.
      }
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      const parts = (rest + chunk).split('\n')
      rest = parts.pop() ?? ''
      parts.forEach(read)
    })
    // Never left waiting on a helper that does not finish: ten minutes is longer than any recording takes.
    const late = setTimeout(() => child.kill(), 10 * 60_000)
    const end = (): void => {
      clearTimeout(late)
      if (key && working.get(key) === child) working.delete(key)
      read(rest)
      resolve(lines)
    }
    child.on('close', end)
    child.on('error', end)
  })
}

/** Speech recognition allowed: asked once (macOS remembers), never during a probe, which no one is there to answer. */
async function allowed(): Promise<string> {
  const [now] = await run(['--status'])
  const status = String(now?.status ?? 'not-determined')
  if (status !== 'not-determined' || process.env.HALIGTREE_QA_AWAY) return status
  const [asked] = await run(['--ask'])
  return String(asked?.status ?? 'denied')
}

/**
 * The words in one stored recording. `wav` is a copy the renderer made (lib/transcribe.ts): the app's own voice
 * notes are Opus in an MP4 with no length written, which AVFoundation opens as days long and never finishes.
 * `heard` is told how far into the recording the words have reached, as each part is made out.
 */
export async function transcribe(src: string, wav?: Uint8Array, locale?: string, heard?: (seconds: number) => void): Promise<Transcript> {
  if (process.platform !== 'darwin') return { error: { code: 'unavailable', message: "Voice notes can be turned into words only on a Mac for now" } }
  const stored = STORED.exec(src)
  if (!stored) return { error: { code: 'missing', message: 'The recording could not be found' } }
  stopping.delete(src)
  const status = await allowed()
  if (stopping.delete(src)) return { stopped: true }
  if (status !== 'granted')
    return { error: { code: 'denied', message: 'Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition' } }
  let folder: string | null = null
  try {
    let file = join(assetsDir(), basename(stored[1]))
    if (wav) {
      folder = await mkdtemp(join(tmpdir(), 'haligtree-words-'))
      file = join(folder, 'recording.wav')
      await writeFile(file, wav)
    }
    const lines = await run([file, locale || app.getLocale()], (line) => {
      const end = (line.segment as Segment | undefined)?.end
      if (typeof end === 'number') heard?.(end)
    }, src)
    if (stopping.delete(src)) return { stopped: true }
    const error = lines.find((one) => one.error)?.error as { code: string; message: string } | undefined
    // Apple's own words for a Mac with Siri and Dictation off say what, not what to do.
    if (error && /siri and dictation are disabled/i.test(error.message))
      return { error: { code: 'denied', message: 'Speech recognition needs Dictation on: turn it on in System Settings, under Keyboard, then Dictation' } }
    if (error) return { error }
    const done = lines.find((one) => one.done)?.done as { text: string; onDevice: boolean } | undefined
    if (!done) return { error: { code: 'failed', message: 'The words could not be made out. Try again' } }
    return { segments: lines.filter((one) => one.segment).map((one) => one.segment as Segment), text: done.text, onDevice: done.onDevice }
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true })
  }
}

/** "Stop" on a recording being made out: the helper ends at once, and nothing is written. */
export function stopTranscribing(src: string): void {
  stopping.add(src)
  working.get(src)?.kill()
}

export function registerTranscribe(): void {
  ipcMain.handle('haligtree:transcribe', (event, src: unknown, wav: unknown, locale: unknown) => {
    const where = String(src ?? '')
    return transcribe(where, wav instanceof Uint8Array ? wav : undefined, typeof locale === 'string' ? locale : undefined,
      (seconds) => !event.sender.isDestroyed() && event.sender.send('transcribe:heard', where, seconds))
  })
  ipcMain.handle('haligtree:transcribe-stop', (_event, src: unknown) => stopTranscribing(String(src ?? '')))
}
