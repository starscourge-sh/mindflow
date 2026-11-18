import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { changed, database, emptyNote } from './captures'
import { centredOn, glide, onScreen, stillNow } from './glide'

/**
 * A note in a small window of its own, apart from quick capture, as Raycast Notes is apart from Raycast's launcher:
 * quick capture's own page (index.html, App.tsx) in a window that holds one note, saved as it is written, so quick
 * capture stays free for everything else. It floats over other apps, grows with what is written up to the screen's
 * height less a margin and then scrolls; resized by hand it stops growing until "Auto-size" gives it back. Kept open
 * and clicked past close by, it steps aside as quick capture does. Several may be open, one note each; they come back
 * where they were, with their size and switches, after a restart. Closed holding nothing, the note goes with it.
 * Quick capture's main code (index.ts) asks `isSmall` where a window may be one of these; the rest is here.
 */

type Kept = { link: string; bounds: Electron.Rectangle; auto: boolean; aside: boolean; top: boolean; /** Its note taken by a note's own window: its stand-in shows. */ down?: boolean }
type Windows = {
  load: (win: BrowserWindow, query: string) => void
  guard: (win: BrowserWindow) => void
  /** Clicks through the clear room under the card to the app behind (index.ts, lib/clear-room.ts), as a sticky's. */
  passThrough: (win: BrowserWindow, on: boolean) => void
  /** Quick capture's step aside (index.ts), for any window kept open: `may` says whether it is on. */
  stepAside: (win: BrowserWindow, may: () => boolean) => void
  /** Moved by a window manager, not by hand (AeroSpace hiding it on another workspace): brought to the one in view, as a sticky is (index.ts parkedBy). */
  parked: (win: BrowserWindow) => void
}

/** Raycast Notes' size, a little wider: quick capture's own gutters (4.75rem a side) leave a column of words this wide less 152px. */
const WIDTH = 520
/** The least it is ever made, as the user marked it (16 Nov, shot 20-a: about 500 by 280): narrower, its words stacked a letter a line. */
const LEAST = 500
const SHORT = 280
/** Grown no nearer the screen's foot than this. */
const MARGIN = 40
/** How far it rises into place as it arrives, as a note's own window does (notes.ts). */
const RISE = 14

const smalls = new Map<BrowserWindow, Kept>()
let quitting = false

/** One of these, not quick capture or any other window. */
export const isSmall = (win: BrowserWindow | null | undefined): boolean => !!win && smalls.has(win)
/** The small window that has the note now: not one whose note a note's own window took (`down`), nor `but`. */
const holding = (link: string, but: BrowserWindow | null = null): BrowserWindow | undefined =>
  [...smalls].find(([win, one]) => one.link === link && !one.down && win !== but && !win.isDestroyed())?.[0]
/** A note opened in a window of its own is put down everywhere else, as a note's own window has it (notes.ts). */
const takeAway = (win: BrowserWindow, link: string): void => {
  const id = link.slice(link.indexOf(':') + 1)
  for (const other of BrowserWindow.getAllWindows()) if (other !== win && !other.isDestroyed()) other.webContents.send('notes:opened-apart', id)
}
/**
 * One note, one window: a note's own window taking a note a small window has puts it down there (the small window
 * hears notes:opened-apart and shows its stand-in, lib/apart.tsx), and that window closing gives it back.
 */
export function putDownSmall(link: string): void {
  for (const one of smalls.values()) if (one.link === link) one.down = true
}
export function liftSmall(link: string): void {
  for (const one of smalls.values()) if (one.link === link) one.down = false
}
/** "Show its window", from the place the note left in the main window: true when a small window holds it. */
export function showSmall(link: string, but: BrowserWindow | null = null): boolean {
  const win = holding(link, but)
  if (!win) return false
  win.showInactive()
  win.focus()
  return true
}
/** "Bring it back": the small window holding it closes, its last words saved as its page goes, and the note is there again. */
export function closeSmall(link: string, but: BrowserWindow | null = null): boolean {
  const win = holding(link, but)
  if (!win) return false
  win.close()
  return true
}

const file = (): string => join(app.getPath('userData'), 'small-windows.json')
/** What is open, as it is now: read back at the next start. */
const save = (): void => {
  for (const [win, kept] of smalls) if (!win.isDestroyed()) kept.bounds = win.getBounds()
  try {
    writeFileSync(file(), JSON.stringify([...smalls.values()]))
  } catch (error) {
    console.error('small-windows.json', error)
  }
}

/** A capture holding nothing: no words, no picture, no block but empty lines. */
function emptyCapture(id: string): boolean {
  try {
    const row = database().prepare('select body from captures where id = ?').get(id) as { body: string | null } | undefined
    if (!row) return false
    const body = JSON.parse(row.body ?? 'null') as { content?: { type?: string; content?: { text?: string }[] }[] } | null
    return (body?.content ?? []).every((block) => block.type === 'paragraph' && (block.content ?? []).every((one) => !one.text?.trim()))
  } catch (error) {
    // Kept rather than lost: a note that cannot be read is never taken for an empty one.
    console.error('small window: could not read its note', error)
    return false
  }
}
/** The empty note a small window was given, gone with it: nothing left behind. */
function dropIfEmpty(link: string): void {
  const id = link.startsWith('capture:') ? link.slice('capture:'.length) : ''
  if (!id || !emptyCapture(id)) return
  database().prepare('delete from captures where id = ?').run(id)
  changed()
}

/**
 * The window grown or shrunk to what its page needs (the page's fit, as quick capture asks for its own, index.ts
 * window:fit), at once, never a glide per line: down from where its top is, and once its foot meets the screen's, up,
 * to the screen's height less a margin above and below; past that the words scroll. Not while resized by hand.
 * False for any other window.
 */
export function fitSmall(win: BrowserWindow, height: number): boolean {
  const kept = smalls.get(win)
  if (!kept) return false
  if (!kept.auto || win.isDestroyed()) return true
  const now = win.getBounds()
  const { workArea } = screen.getDisplayMatching(now)
  const top = workArea.y + MARGIN
  const foot = workArea.y + workArea.height - MARGIN
  const card = Math.round(Math.max(SHORT, Math.min(height, foot - top)))
  // The Mac's shadow follows the card's new shape, not the one it had when the window last changed size.
  if (process.platform === 'darwin') win.invalidateShadow()
  // As tall as its card: the window is opaque now, so room kept under the card for it to grow into (quick capture's way,
  // index.ts keptRoom) showed as empty paper under the thought bar (16 Nov, shot 03-a).
  const past = now.y + now.height > foot || now.height > foot - top
  if (now.height === card && !past) return true
  const next = Math.min(foot - top, card)
  const y = Math.max(top, Math.min(now.y, foot - next))
  if (next !== now.height || y !== now.y) win.setBounds({ ...now, y, height: next }, false)
  return true
}

/**
 * The page's colour as the windows tell it (lib/theme.ts tellSurface), the one theme every window wears. A small window
 * is opaque, its page filling it, so its own colour behind the page is that: dark under a light page, the edge a resize
 * uncovers flashed dark for a frame (18 Nov 2026). A new one wears it from its first frame.
 */
let pageColour = '#1c1c1c'

export function registerSmallWindows({ load, guard, stepAside, passThrough, parked }: Windows): { open: (link: string | null, from?: Electron.Rectangle | null) => void; restore: () => void } {
  app.on('before-quit', () => {
    quitting = true
    save()
  })
  ipcMain.on('window:surface', (event, _solid: unknown, page: unknown) => {
    if (typeof page !== 'string' || !/^#[0-9a-f]{6}$/i.test(page)) return
    pageColour = page
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed() && smalls.has(win)) win.setBackgroundColor(page)
  })

  /** A small window on `link` ('capture:id', or null for a new note), grown from `from` (a row, the box) when given. */
  const open = (asked: string | null, from?: Electron.Rectangle | null, kept?: Kept): void => {
    // A new one holds a new empty note from its first moment, named in its address like any other.
    const link = asked ?? `capture:${emptyNote()}`
    const same = holding(link)
    if (same) return void (same.showInactive(), same.focus())
    const point = screen.getCursorScreenPoint()
    const seed = from ?? { x: point.x - 60, y: point.y - 40, width: 120, height: 80 }
    const size = kept ? onScreen(kept.bounds) : onScreen(centredOn(seed, WIDTH, SHORT))
    const win = new BrowserWindow({
      ...size,
      minWidth: LEAST,
      minHeight: SHORT,
      show: false,
      frame: false,
      // The Mac's own rounded corners and shadow, round a page that fills the window: no clear room round a card.
      roundedCorners: true,
      hasShadow: true,
      fullscreenable: false,
      // Opaque, as a note's own window is (notes.ts). A see-through window is not one the Mac can resize: dragged by its
      // corner it went blank but for its buttons, and the foot of the card showed the desktop through it (16 Nov). It
      // is as tall as its card, so there is no clear room under the card to see through. In the page's own colour.
      backgroundColor: pageColour,
      title: 'Note',
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
    })
    // Its place said again once made, as a sticky's is: a QA run's parked window keeps it as its own (HALIGTREE_QA_VIRTUAL),
    // and the place such a window is first given is the middle of the screen, not the one asked for.
    if (process.env.HALIGTREE_QA_VIRTUAL) win.setBounds(size)
    const state: Kept = kept ?? { link, bounds: size, auto: true, aside: true, top: true }
    smalls.set(win, state)
    // The clear room under its card lets clicks through until the pointer is on something drawn.
    passThrough(win, true)
    // Over every app, as quick capture floats ("Keep on top" in its menu), on whichever desktop you are on.
    win.setAlwaysOnTop(state.top, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    // Resized by hand: it stops growing with the words, and the page offers "Auto-size" to give it back.
    win.on('will-resize', () => {
      if (!state.auto) return
      state.auto = false
      win.webContents.send('small:said', 'auto', false)
      save()
    })
    // Moved without a hand on it (no will-move first): a window manager hid it on another workspace. It follows you to
    // the one in view, as quick capture and the stickies do (16 Nov: "it does not follow me through the workspaces").
    let byHand = false
    win.on('will-move', () => void (byHand = true))
    win.on('moved', () => {
      if (!byHand && process.platform === 'darwin') parked(win)
      byHand = false
      save()
    })
    win.on('resized', save)
    // Kept open and clicked past close by: to the free corner furthest from the pointer, as quick capture does.
    win.on('blur', () => stepAside(win, () => state.aside))
    // Closed holding nothing, nothing is left behind: the empty note it was given goes too. Read once the page has
    // gone, after it handed over its last words (pagehide).
    win.on('closed', () => {
      smalls.delete(win)
      // Back in its place wherever it had left, as when a note's own window closes.
      for (const other of BrowserWindow.getAllWindows()) if (!other.isDestroyed()) other.webContents.send('notes:apart', 'closed', state.link)
      dropIfEmpty(state.link)
      // Kept for the next start while quitting; closed by you, it is gone from the list.
      if (!quitting) save()
    })
    // Shown where it came from (centred on the row, the card or the box it left), rising a little into place as it
    // fades in: position and opacity only, as a note's own window arrives (notes.ts), never resized on the way.
    // Its height read as it is now, never the one it was made at: its page may have asked for more already (fitSmall),
    // and putting the first size back left a dev build's window 200 px tall until the first row grew it.
    // It takes the keys as it comes: one never focused never lost them either, so a click past it did not send it
    // aside until it had been clicked into once (16 Nov).
    win.once('ready-to-show', () => {
      if (kept || stillNow()) return void (win.show(), win.focus())
      const at = win.getBounds()
      win.setOpacity(0)
      win.setPosition(at.x, at.y + RISE)
      win.show()
      win.focus()
      void glide(win, { x: at.x, y: at.y }, { ms: 240, opacity: 1 })
    })
    // ⌘W closes it, as the red light does: the note stays where it lives.
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.meta && !input.shift && !input.alt && !input.control && input.key.toLowerCase() === 'w') {
        event.preventDefault()
        win.close()
      }
    })
    guard(win)
    takeAway(win, state.link)
    load(win, `?small=${encodeURIComponent(state.link)}`)
    if (!quitting) save()
  }

  // From quick capture, a row's menu, ⌘K, the menus: `from` is the row or the box on the screen, when there is one.
  ipcMain.handle('haligtree:small:open', (event, link: unknown, from?: { x: number; y: number; width: number; height: number } | null) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    const page = sender && !sender.isDestroyed() ? sender.getContentBounds() : null
    const seed = page && from && from.width > 0 && from.height > 0 ? { x: Math.round(page.x + from.x), y: Math.round(page.y + from.y), width: Math.round(from.width), height: Math.round(from.height) } : null
    open(typeof link === 'string' && link ? link : null, seed)
  })
  /** A new empty note for a small window's "+" and ⌘N, put in it there. */
  ipcMain.handle('haligtree:small:new', () => emptyNote())
  /** The note a small window holds now (another opened in it by "+" or browse). */
  ipcMain.handle('haligtree:small:holds', (event, link: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const kept = win && smalls.get(win)
    if (!kept || typeof link !== 'string') return
    const was = kept.link
    kept.link = link
    if (was !== link) takeAway(win, link)
    // The one it held before is back in its place wherever it had left.
    if (was && was !== link) for (const other of BrowserWindow.getAllWindows()) if (other !== win && !other.isDestroyed()) other.webContents.send('notes:apart', 'closed', was)
    // The note it held before, left empty, goes as it would on closing.
    if (was !== link) dropIfEmpty(was)
    save()
  })
  /** Resized by its card's foot (the page's grip, the window's own foot being clear room): growing stops there. */
  ipcMain.handle('haligtree:small:height', (event, height: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const kept = win && smalls.get(win)
    if (!win || !kept || typeof height !== 'number' || !Number.isFinite(height)) return
    if (kept.auto) {
      kept.auto = false
      win.webContents.send('small:said', 'auto', false)
    }
    const now = win.getBounds()
    const { workArea } = screen.getDisplayMatching(now)
    win.setBounds({ ...now, height: Math.round(Math.max(SHORT, Math.min(height, workArea.y + workArea.height - now.y))) }, false)
  })
  /** Its switches, for its menu. */
  ipcMain.handle('haligtree:small:state', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const kept = win && smalls.get(win)
    return kept ? { auto: kept.auto, aside: kept.aside, top: kept.top } : null
  })
  ipcMain.handle('haligtree:small:set', (event, patch: { auto?: unknown; aside?: unknown; top?: unknown }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const kept = win && smalls.get(win)
    if (!kept) return null
    if (typeof patch?.aside === 'boolean') kept.aside = patch.aside
    if (typeof patch?.auto === 'boolean') kept.auto = patch.auto
    if (typeof patch?.top === 'boolean') win.setAlwaysOnTop((kept.top = patch.top), 'floating')
    save()
    return { auto: kept.auto, aside: kept.aside, top: kept.top }
  })

  /** The small windows open when the app last quit, where they were. */
  const restore = (): void => {
    let list: Kept[] = []
    try {
      list = JSON.parse(readFileSync(file(), 'utf8'))
    } catch {
      return
    }
    for (const one of Array.isArray(list) ? list : []) {
      // One never told its note (closed before its page made it) has nothing to come back to.
      if (!one || typeof one.link !== 'string' || !one.link || !one.bounds) continue
      const id = one.link.startsWith('capture:') ? one.link.slice('capture:'.length) : ''
      if (id && !database().prepare("select 1 from captures where id = ? and status != 'discarded'").get(id)) continue
      open(one.link, null, { link: one.link, bounds: one.bounds, auto: one.auto !== false, aside: one.aside !== false, top: one.top !== false })
    }
  }
  return { open: (link, from) => open(link, from), restore }
}
