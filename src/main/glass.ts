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
type Watch = (listen: (kind: 'began' | 'ended', windowNumber: number) => void) => void
let watcher: Watch | null = null
let stayBehind: ((handle: Buffer) => boolean) | null = null
/** What the Mac's own spellchecker says of a word where it stands in its text (native/glass.mm `spell`). */
export type Spelt = { flagged: boolean; guesses: string[]; language: string }
type Spell = (text?: string, start?: number, length?: number) => Spelt | undefined
type Learn = (word: string, how: 'learn' | 'unlearn' | 'ignore' | 'unignore') => boolean
let speller: Spell | null = null
let learner: Learn | null = null
function load(): typeof glassy {
  if (glassy !== undefined || process.platform !== 'darwin') return glassy ?? null
  try {
    const module = { exports: {} as { glass?: typeof glassy; watchScroll?: Watch; nonActivating?: typeof stayBehind; spell?: Spell; learn?: Learn } }
    process.dlopen(module, glassFile)
    speller = module.exports.spell ?? null
    learner = module.exports.learn ?? null
    glassy = module.exports.glass ?? null
    watcher = module.exports.watchScroll ?? null
    stayBehind = module.exports.nonActivating ?? null
  } catch {
    glassy = null
  }
  return glassy
}

/** The trackpad's fingers touching and lifting, from the Mac's scroll events (native/glass.mm), for swipe back. Every listener hears every window's. */
const scrollListeners: Parameters<Watch>[0][] = []
export function watchScroll(listen: Parameters<Watch>[0]): void {
  load()
  if (!watcher) return
  if (!scrollListeners.length) watcher((kind, number) => scrollListeners.forEach((one) => one(kind, number)))
  scrollListeners.push(listen)
}

/**
 * A panel (quick capture, a sticky, a card) that takes the keys and clicks while the app you were in stays the front
 * app, as Raycast's does. Electron's `type: 'panel'` only claims it (native/glass.mm says why); this tells the Mac.
 * Whether it took, for the probes.
 */
export function nonActivating(win: BrowserWindow): boolean {
  load()
  return !!stayBehind && !win.isDestroyed() && stayBehind(win.getNativeWindowHandle())
}

/** The Mac's spellchecker asked about the word at `start` in `text` (spell-check.ts); with nothing, woken. Null where there is no checker to ask. */
export function spell(text?: string, start?: number, length?: number): Spelt | null {
  load()
  return (text === undefined ? speller?.() : speller?.(text, start, length)) ?? null
}
/** A word into the Mac's dictionary or out of it again; or, writing nothing, let by until the app quits and no longer let by. */
export function learn(word: string, how: 'learn' | 'unlearn' | 'ignore' | 'unignore'): boolean {
  load()
  return !!learner?.(word, how)
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
