import { app, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * In a development run only: when a window's page stops answering for three
 * seconds, pause its script through the debugger and write where it is stuck
 * (every function on the stack, with file and line) to a file in the logs
 * folder, then let it run on. A freeze that cannot be made to happen on demand
 * then says what it was.
 */
export function catchFreezes(win: BrowserWindow, name: string): void {
  if (app.isPackaged || process.env.HALIGTREE_QA_AWAY) return
  const wc = win.webContents
  // The debugger has to be listening before a freeze: once the page is stuck it can still be paused, but
  // not switched on. So it is attached and enabled on every load (a reload drops it).
  const listen = (): void => {
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      void wc.debugger.sendCommand('Debugger.enable').catch(() => undefined)
    } catch {
      // DevTools or another debugger has the page: no catching this run.
    }
  }
  wc.on('did-finish-load', listen)
  let caught = false
  let asking = false
  const tick = setInterval(async () => {
    if (win.isDestroyed()) return clearInterval(tick)
    if (asking || caught) return
    asking = true
    const answered = await Promise.race([wc.executeJavaScript('1').then(() => true, () => true), new Promise<boolean>((done) => setTimeout(() => done(false), 3000))])
    asking = false
    if (answered || win.isDestroyed()) return
    caught = true
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `freeze-${name.replace(/\W+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`)
    try {
      if (!wc.debugger.isAttached()) throw new Error('the debugger was not listening (DevTools open?)')
      const paused = new Promise<string>((done) => {
        const heard = (_event: Electron.Event, method: string, params: Record<string, unknown>): void => {
          if (method !== 'Debugger.paused') return
          wc.debugger.off('message', heard)
          const frames = (params.callFrames as { functionName: string; url: string; location: { lineNumber: number; columnNumber: number } }[])
            .map((frame) => `${frame.functionName || '(anonymous)'}  ${frame.url.replace(/^.*?\/src\//, 'src/')}:${frame.location.lineNumber + 1}:${frame.location.columnNumber + 1}`)
          done(frames.join('\n'))
        }
        wc.debugger.on('message', heard)
      })
      void wc.debugger.sendCommand('Debugger.pause').catch(() => undefined)
      const stack = await Promise.race([paused, new Promise<string>((done) => setTimeout(() => done('(no pause within 5 s)'), 5000))])
      writeFileSync(file, `${name} stopped answering at ${new Date().toString()}\n\n${stack}\n`)
      console.error(`[freeze] ${name} stopped answering; where it was stuck is in ${file}`)
      void wc.debugger.sendCommand('Debugger.resume').catch(() => undefined)
    } catch (error) {
      writeFileSync(file, `${name} stopped answering at ${new Date().toString()}, and its stack could not be read: ${String(error)}\n`)
      console.error('[freeze] could not read the stack:', error)
    }
    // Once more after a minute, in case it was a long stall that ended.
    setTimeout(() => (caught = false), 60_000)
  }, 2000)
}
