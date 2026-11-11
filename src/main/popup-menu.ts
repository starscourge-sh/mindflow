import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'

/**
 * A sticky's menus, drawn by Haligtree rather than the Mac. The Mac's own menus
 * are see-through glass, so a sticky's words showed through its menu, words
 * over words. This is one small window, made once and kept: no frame, no Dock
 * or window-list place, over everything, taking the keys only while a menu is
 * open. It covers the screen the pointer is on (its work area) while a menu is
 * open, so the menu sits at the pointer and a line that opens more beside it
 * (All stickies) has room to, flipping at the screen's edges as the main
 * window's menus do; a click anywhere off the menu only closes it, as a Mac
 * menu's does. The page draws the app's own menu (windows/menu.tsx).
 */

/** One line of a menu, as main writes it: a line, a rule, a heading, a row of colours, or a line that opens more. */
export type PopupLine =
  | { separator: true }
  | { heading: string }
  | { swatches: { color: string; label: string; on: boolean; run?: () => void }[] }
  | { label: string; keys?: string; danger?: boolean; run?: () => void; submenu?: PopupLine[] }

/** The same lines, without what they run: what goes to the page. */
const wire = (lines: PopupLine[]): unknown[] =>
  lines.map((line) => ('swatches' in line ? { swatches: line.swatches.map(({ color, label, on }) => ({ color, label, on })) } : 'label' in line ? { label: line.label, keys: line.keys, danger: line.danger, submenu: line.submenu && wire(line.submenu) } : line))

/** The line at a place in the menu (a row, then a row inside it or a colour in a row of colours). */
export function lineAt(lines: PopupLine[], path: number[]): (() => void) | undefined {
  let list = lines
  for (let step = 0; step < path.length; step++) {
    const line = list[path[step]]
    if (!line) return undefined
    if ('swatches' in line) return line.swatches[path[step + 1]]?.run
    if (!('label' in line)) return undefined
    if (step === path.length - 1) return line.run
    if (!line.submenu) return undefined
    list = line.submenu
  }
  return undefined
}

let win: BrowserWindow | null = null
let ready: Promise<void> = Promise.resolve()
let open: { id: number; owner: BrowserWindow; done: (path: number[] | null) => void } | null = null
let count = 0
/** Told as each menu is put away, with the window it belonged to. */
const shut = new Set<(owner: BrowserWindow) => void>()
/** Whether a menu belonging to this window is open now: the pointer on it counts as on the window. */
export const menuOpenFor = (owner: BrowserWindow): boolean => open?.owner === owner
/** Hear each menu put away, with the window it belonged to. */
export const onMenuShut = (listen: (owner: BrowserWindow) => void): void => void shut.add(listen)
/** For the probes: the last menu shown, where, and how it ended. */
const qa = (globalThis as { qaPopupMenu?: Record<string, unknown> })

function made(load: (win: BrowserWindow, query: string) => void): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    // A panel, as a menu is: over a full-screen app too, and it can take the keys without bringing Haligtree forward.
    type: 'panel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    // Takes the keys only while a menu is open.
    focusable: false,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  // Clicked away from (another app, the desktop): the menu goes, choosing nothing.
  win.on('blur', () => finish(null, false))
  win.on('closed', () => {
    win = null
    finish(null, false)
  })
  const page = win
  ready = new Promise((resolve) => page.webContents.once('did-finish-load', () => resolve()))
  load(win, '?view=menu')
  qa.qaPopupMenu = { ...qa.qaPopupMenu, winId: win.id }
  return win
}

/** The menu put away, the line chosen (or none) told to whoever opened it, and the keys handed back to the sticky. */
function finish(path: number[] | null, back: boolean): void {
  if (!open) return
  const { owner, done } = open
  open = null
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu:hide')
    win.hide()
    win.setFocusable(false)
  }
  qa.qaPopupMenu = { ...qa.qaPopupMenu, open: false, picked: path, focusBack: back && !owner.isDestroyed() }
  if (back && !owner.isDestroyed()) owner.focus()
  done(path)
  if (!owner.isDestroyed()) for (const listen of shut) listen(owner)
}

/**
 * Open a menu at a point on the screen, over the window it belongs to.
 * Resolves to the place of the line chosen, or null when it was put away.
 */
export async function popupMenu(owner: BrowserWindow, at: { x: number; y: number }, lines: PopupLine[], load: (win: BrowserWindow, query: string) => void): Promise<number[] | null> {
  finish(null, false)
  const menu = made(load)
  await ready
  if (menu.isDestroyed() || owner.isDestroyed()) return null
  const id = ++count
  const area = screen.getDisplayNearestPoint(at).workArea
  return new Promise((resolve) => {
    open = { id, owner, done: resolve }
    menu.setBounds(area)
    menu.setFocusable(true)
    menu.show()
    menu.focus()
    const point = { x: Math.round(at.x - area.x), y: Math.round(at.y - area.y) }
    qa.qaPopupMenu = { ...qa.qaPopupMenu, open: true, id, at, area, point, picked: undefined, focusBack: undefined }
    menu.webContents.send('menu:show', { id, x: point.x, y: point.y, lines: wire(lines) })
  })
}

/** The page's answer: a line chosen (its place) or the menu put away (Esc, a click off it). */
export function registerPopupMenu(): void {
  ipcMain.on('menu:done', (event, id: unknown, path: unknown) => {
    if (!open || open.id !== id || !win || event.sender !== win.webContents) return
    finish(Array.isArray(path) && path.every((n) => typeof n === 'number') ? (path as number[]) : null, true)
  })
}
