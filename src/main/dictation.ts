import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { app, ipcMain, type WebContents } from 'electron'
import helper from '../../resources/listen?asset&asarUnpack'

/**
 * Talk to type: while a key is held, the microphone into words at the caret,
 * on this Mac (native/listen.swift, offline only). The helper's JSON lines go
 * to the window that asked, as they come (`dictate:line`): ready, partial
 * words, the final words, or an error that says why in plain words. One
 * listening at a time; a new start ends the old one.
 */
let listening: { child: ChildProcess; to: WebContents } | null = null

const status = (args: string[]): Promise<string> =>
  new Promise((resolve) =>
    execFile(helper, args, { timeout: 5 * 60_000 }, (_failed, stdout) => {
      try {
        resolve(String(JSON.parse(String(stdout).trim().split('\n')[0]).status))
      } catch {
        resolve('denied')
      }
    }))

/** Speech recognition allowed: asked once (macOS remembers), never during a probe. */
async function allowed(): Promise<string> {
  const now = await status(['--status'])
  if (now !== 'not-determined' || process.env.HALIGTREE_QA_AWAY) return now
  return status(['--ask'])
}

const DENIED = { code: 'denied', message: 'Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition' }

async function start(to: WebContents, locale?: string): Promise<{ ok: true } | { error: { code: string; message: string } }> {
  if (process.platform !== 'darwin') return { error: { code: 'unavailable', message: 'Talk to type works only on a Mac for now' } }
  stop('cancel')
  if ((await allowed()) !== 'granted') return { error: DENIED }
  const child = spawn(helper, [locale || app.getLocale()], { stdio: ['pipe', 'pipe', 'ignore'] })
  listening = { child, to }
  let rest = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = (rest + chunk.toString()).split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) {
      try {
        if (line.trim() && !to.isDestroyed()) to.send('dictate:line', JSON.parse(line))
      } catch {
        // A line that is not the helper's own: left out.
      }
    }
  })
  // However it ends, the window hears that it has: it never waits on a helper that is gone.
  child.on('exit', () => {
    if (listening?.child === child) listening = null
    if (!to.isDestroyed()) to.send('dictate:line', { ended: true })
  })
  child.on('error', () => !to.isDestroyed() && to.send('dictate:line', { error: { code: 'failed', message: 'Talk to type could not start. Try again' } }))
  return { ok: true }
}

/** "stop": the words said so far are settled and sent. "cancel": nothing more is sent. */
function stop(how: 'stop' | 'cancel'): void {
  const now = listening
  if (!now) return
  if (how === 'cancel') listening = null
  now.child.stdin?.end(`${how}\n`)
}

/** Words being said into a note now: the Feed's insights wait while they are. */
export const dictating = (): boolean => !!listening

export function registerDictation(): void {
  ipcMain.handle('haligtree:dictate:start', (event, locale: unknown) => start(event.sender, typeof locale === 'string' ? locale : undefined))
  ipcMain.handle('haligtree:dictate:stop', () => stop('stop'))
  ipcMain.handle('haligtree:dictate:cancel', () => stop('cancel'))
  app.on('before-quit', () => stop('cancel'))
}
