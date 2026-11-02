import { app, BrowserWindow, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import glassFile from '../../resources/glass.node?asset&asarUnpack'

/**
 * Real glass, Raycast's way (native/glass.mm): the Mac's own blur of the desktop under the shapes a page draws, its
 * card and round controls, and nowhere else in the window. A page tells main its shapes as they move and change
 * (`glass:shapes`); none takes the glass away (Reduce Transparency, a solid look, the card put away).
 */
let glassy: ((handle: Buffer, dark: boolean, shapes: number[][]) => void) | null | undefined
function load(): typeof glassy {
  if (glassy !== undefined || process.platform !== 'darwin') return glassy ?? null
  try {
    const module = { exports: {} as { glass?: typeof glassy } }
    process.dlopen(module, glassFile)
    glassy = module.exports.glass ?? null
  } catch {
    glassy = null
  }
  return glassy
}

/** What each window last asked for, for a probe (qa/glass.mjs). */
export const glassShapes = new Map<number, { dark: boolean; shapes: number[][] }>()

export function registerGlass(): void {
  ipcMain.on('glass:shapes', (event, dark: unknown, shapes: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || !Array.isArray(shapes)) return
    // The page measures in its own pixels; the window's are those times the page's zoom (the app size, ⌘+).
    const zoom = event.sender.getZoomFactor() || 1
    const scaled = shapes
      .filter((one): one is number[] => Array.isArray(one) && one.length === 5 && one.every((n) => Number.isFinite(n)))
      .map((one) => one.map((n) => Math.round(n * zoom * 100) / 100))
    glassShapes.set(win.id, { dark: dark === true, shapes: scaled })
    const native = load()
    native?.(win.getNativeWindowHandle(), dark === true, scaled)
    // What the glass is doing, in the data folder (glass.json): whether the Mac's blur is on, and under what, in each window.
    try {
      const said = Object.fromEntries([...glassShapes].map(([id, one]) => [BrowserWindow.fromId(id)?.webContents.getURL().replace(/^.*\?/, '?').slice(0, 80) ?? String(id), { blur: !!native && one.shapes.length > 0, ...one }]))
      writeFileSync(join(app.getPath('userData'), 'glass.json'), JSON.stringify({ nativeLoaded: !!native, at: new Date().toISOString(), windows: said }, null, 1))
    } catch {
      // A read-only data folder: the glass goes on all the same.
    }
  })
}
