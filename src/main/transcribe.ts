import { execFile } from 'node:child_process'
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
export type Transcript = { segments: Segment[]; text: string; onDevice: boolean } | { error: { code: string; message: string } }

const STORED = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/

/** Run the helper and read its JSON lines. */
function run(args: string[]): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    execFile(helper, args, { timeout: 10 * 60_000, maxBuffer: 32 * 1024 * 1024 }, (_failed, stdout) => {
      const lines: Record<string, unknown>[] = []
      for (const line of String(stdout ?? '').split('\n')) {
        try {
          if (line.trim()) lines.push(JSON.parse(line))
        } catch {
          // A line that is not the helper's own: left out.
        }
      }
      resolve(lines)
    })
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

/** The words in one stored recording. `wav` is a copy the renderer made of one AVFoundation cannot read (a .weba). */
export async function transcribe(src: string, wav?: Uint8Array, locale?: string): Promise<Transcript> {
  if (process.platform !== 'darwin') return { error: { code: 'unavailable', message: "Voice notes can be turned into words only on a Mac for now" } }
  const stored = STORED.exec(src)
  if (!stored) return { error: { code: 'missing', message: 'The recording could not be found' } }
  const status = await allowed()
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
    const lines = await run([file, locale || app.getLocale()])
    const error = lines.find((one) => one.error)?.error as { code: string; message: string } | undefined
    if (error) return { error }
    const done = lines.find((one) => one.done)?.done as { text: string; onDevice: boolean } | undefined
    if (!done) return { error: { code: 'failed', message: 'The words could not be made out. Try again' } }
    return { segments: lines.filter((one) => one.segment).map((one) => one.segment as Segment), text: done.text, onDevice: done.onDevice }
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true })
  }
}

export function registerTranscribe(): void {
  ipcMain.handle('haligtree:transcribe', (_event, src: unknown, wav: unknown, locale: unknown) =>
    transcribe(String(src ?? ''), wav instanceof Uint8Array ? wav : undefined, typeof locale === 'string' ? locale : undefined))
}
