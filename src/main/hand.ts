import { execFile } from 'child_process'
import { performance } from 'node:perf_hooks'
import { screen, type BrowserWindow } from 'electron'

/**
 * When a window dragged by hand has been let go.
 *
 * On a Mac, Electron sends 'moved' at every step of a drag (it is the same
 * event as 'move' there) and nothing when the drag ends. Settling a sticky
 * on 'moved' therefore snapped it, set it down and saved it on every step,
 * while the Mac was still moving it under your hand: it jumped and shook.
 *
 * So the drop waits until the window has stopped, then asks the Mac whether
 * the button is up (osascript, as frost.ts asks for the desktop picture: no
 * permission needed). A window held against the menu bar stops while the
 * pointer goes on, so only the button says it was let go. When the Mac
 * cannot say, the pointer gone from the spot it held the window by, or a
 * while without moving, is taken as let go. Elsewhere 'moved' comes once, at
 * the end, and only that lets go: no watch starts as the drag does.
 */
const watching = new WeakMap<BrowserWindow, () => void>()
const grips = new WeakMap<BrowserWindow, { x: number; y: number }>()

/** Where the pointer holds the window, from its top left: said as the drag starts ('will-move'). */
export function grab(win: BrowserWindow): void {
  const p = screen.getCursorScreenPoint()
  const b = win.getBounds()
  grips.set(win, { x: p.x - b.x, y: p.y - b.y })
}

/** Whether the Mac's main mouse button is down now; null when it could not say. */
const buttonDown = (): Promise<boolean | null> => new Promise((resolve) => {
  execFile('osascript', ['-l', 'JavaScript', '-e', "ObjC.import('AppKit'); $.NSEvent.pressedMouseButtons"], { timeout: 1000 }, (error, out) =>
    resolve(error ? null : (Number(String(out).trim()) & 1) === 1))
})

/** `done` once the hand has let `win` go; asked again mid-drag it keeps the one watch. */
export function whenLetGo(win: BrowserWindow, done: () => void): void {
  if (process.platform !== 'darwin') return done()
  if (watching.has(win)) return
  if (!grips.has(win)) grab(win)
  let last = win.getBounds()
  let since = performance.now()
  let asked = 0
  let asking = false
  const stop = (): void => {
    clearInterval(watch)
    watching.delete(win)
    grips.delete(win)
  }
  const finish = (): void => (stop(), done())
  const watch = setInterval(() => {
    if (win.isDestroyed()) return stop()
    const b = win.getBounds()
    const now = performance.now()
    if (b.x !== last.x || b.y !== last.y) return void ((last = b), (since = now))
    if (now - since < 60 || asking || now - asked < 200) return
    asking = true
    asked = now
    void buttonDown().then((down) => {
      asking = false
      if (!watching.has(win) || win.isDestroyed()) return
      const at = win.getBounds()
      if (at.x !== last.x || at.y !== last.y) return
      if (down === false) return finish()
      if (down) return
      // Could not ask: the pointer off its grip, or a while without moving, is taken as let go.
      const grip = grips.get(win) ?? { x: 0, y: 0 }
      const p = screen.getCursorScreenPoint()
      const off = Math.abs(p.x - at.x - grip.x) > 2 || Math.abs(p.y - at.y - grip.y) > 2
      if (off || performance.now() - since > 400) finish()
    })
  }, 30)
  watching.set(win, stop)
}
