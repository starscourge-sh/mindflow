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
  if (app.isPackaged || (process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_FREEZE_CATCH)) return
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
  win.on('closed', () => clearInterval(tick))
  let caught = false
  let asking = false
  const tick = setInterval(async () => {
    if (win.isDestroyed() || wc.isDestroyed()) return clearInterval(tick)
    if (asking || caught) return
    asking = true
    const answered = await Promise.race([wc.executeJavaScript('1').then(() => true, () => true), new Promise<boolean>((done) => setTimeout(() => done(false), 3000))])
    asking = false
    if (answered || win.isDestroyed() || wc.isDestroyed()) return
    caught = true
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `freeze-${name.replace(/\W+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`)
    try {
      if (!wc.debugger.isAttached()) throw new Error('the debugger was not listening (DevTools open?)')
      type Frame = { callFrameId: string; functionName: string; url: string; location: { scriptId: string; lineNumber: number; columnNumber: number } }
      type Stack = { description?: string; callFrames: { functionName: string; url: string; lineNumber: number; columnNumber: number }[]; parent?: Stack }
      // Five pauses a moment apart: a loop runs through more than one place, and one pause sees only one.
      const once = (): Promise<{ callFrames: Frame[]; asyncStackTrace?: Stack } | null> => new Promise((done) => {
        const heard = (_event: Electron.Event, method: string, params: Record<string, unknown>): void => {
          if (method !== 'Debugger.paused') return
          wc.debugger.off('message', heard)
          done(params as { callFrames: Frame[]; asyncStackTrace?: Stack })
        }
        wc.debugger.on('message', heard)
        void wc.debugger.sendCommand('Debugger.pause').catch(() => undefined)
        setTimeout(() => (!wc.isDestroyed() && wc.debugger.off('message', heard), done(null)), 4000)
      })
      const where = (url: string): string => url.replace(/^.*?\/src\//, 'src/').replace(/\?.*$/, '') || '(no file)'
      const parts: string[] = []
      for (let round = 1; round <= 5; round++) {
        const hit = await once()
        if (wc.isDestroyed()) break
        if (!hit) { parts.push(`pause ${round}: no pause`); break }
        const lines = hit.callFrames.map((frame) => `  ${frame.functionName || '(anonymous)'}  ${where(frame.url)}:${frame.location.lineNumber + 1}:${frame.location.columnNumber + 1}`)
        for (let up = hit.asyncStackTrace; up; up = up.parent)
          lines.push(`  -- ${up.description ?? 'async'} --`, ...up.callFrames.map((one) => `  ${one.functionName || '(anonymous)'}  ${where(one.url)}:${one.lineNumber + 1}:${one.columnNumber + 1}`))
        // The code where it stood, so a script with no file still says what it is.
        const top = hit.callFrames[0]
        if (top) {
          const source = await wc.debugger.sendCommand('Debugger.getScriptSource', { scriptId: top.location.scriptId }).then((one: { scriptSource: string }) => one.scriptSource, () => '')
          const all = source.split('\n')
          const at = top.location.lineNumber
          lines.push('  code there:', ...all.slice(Math.max(0, at - 6), at + 4).map((line, i) => `    ${Math.max(0, at - 6) + i + 1}${Math.max(0, at - 6) + i === at ? ' >' : '  '} ${line.slice(0, 200)}`))
          if (round === 1) lines.push(`  script: ${top.location.scriptId}, ${all.length} lines, starts: ${all[0]?.slice(0, 160)}`)
        }
        // Stopped inside a page watcher: what changed, so the loop says what keeps changing.
        if (top) {
          const said = (node: string): string => `(${node} ? (${node}.nodeName + (${node}.className && typeof ${node}.className === 'string' ? '.' + ${node}.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (${node}.dataset && Object.keys(${node}.dataset).length ? '[' + Object.keys(${node}.dataset).slice(0, 3).join(',') + ']' : '')) : '-')`
          const expression = `(() => { const list = typeof mutations !== 'undefined' ? mutations : typeof records !== 'undefined' ? records : (this && this.queue) || null; if (!list) return 'no mutation list here'; return list.length + ' changes: ' + Array.from(list).slice(0, 12).map((m) => m.type + ' on ' + ${said('m.target')} + ' in ' + ${said('(m.target.parentElement || null)')} + (m.attributeName ? ' attr ' + m.attributeName : '') + (m.addedNodes && m.addedNodes.length ? ' +' + Array.from(m.addedNodes).slice(0, 3).map((n) => ${said('n')}).join(',') : '') + (m.removedNodes && m.removedNodes.length ? ' -' + Array.from(m.removedNodes).slice(0, 3).map((n) => ${said('n')}).join(',') : '')).join(' | ') })()`
          const seen = await wc.debugger.sendCommand('Debugger.evaluateOnCallFrame', { callFrameId: top.callFrameId, expression, returnByValue: true }).then((one: { result: { value?: unknown; description?: string } }) => String(one.result.value ?? one.result.description), (error: unknown) => `(could not read: ${String(error)})`)
          lines.push(`  changes: ${seen.slice(0, 2500)}`)
        }
        parts.push(`pause ${round}:\n${lines.join('\n')}`)
        if (wc.isDestroyed()) break
        await wc.debugger.sendCommand('Debugger.resume').catch(() => undefined)
        await new Promise((done) => setTimeout(done, 150))
      }
      const stack = parts.join('\n\n')
      writeFileSync(file, `${name} stopped answering at ${new Date().toString()}\n\n${stack}\n`)
      console.error(`[freeze] ${name} stopped answering; where it was stuck is in ${file}`)
    } catch (error) {
      writeFileSync(file, `${name} stopped answering at ${new Date().toString()}, and its stack could not be read: ${String(error)}\n`)
      console.error('[freeze] could not read the stack:', error)
    }
    // Once more after a minute, in case it was a long stall that ended.
    setTimeout(() => (caught = false), 60_000)
  }, 2000)
}
