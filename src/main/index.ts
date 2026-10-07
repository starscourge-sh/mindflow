import { pathToFileURL } from 'url'
import { app, shell, BrowserWindow, clipboard, ClipboardItem, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, protocol, screen, session, systemPreferences, Tray } from 'electron'
/*
 * app - Control your application's event lifecycle.
 *     - app.on('window-all-closed', () => { app.quit() })
 *     - emits events like:
 *        - 'window-all-closed': Emitted when all windows have been closed.
 *        - 'did-become-active': Emitted when all windows have been closed.
 *        - Emitted when the application becomes active. This differs from the activate event in that did-become-active is emitted every time the app becomes active, not only when Dock icon is clicked or application is re-launched. It is also emitted when a user switches to the app via the macOS App Switcher.
 *
 * BrowserWindow: Create and control browser windows.
 *        - const { BrowserWindow } = require('electron')
 *        -   const win = new BrowserWindow({ width: 800, height: 600 })
 *        - Load a remote URL
 *        -   win.loadURL('https://github.com')
 *        - Or load a local HTML file
 *        -   win.loadFile('index.html')
 *
 * shell - The shell module provides functions related to desktop integration.
 *       - An example of opening a URL in the user's default browser:
 *       - shell.showItemInFolder(fullPath): Show the given file in a file manager. If possible, select the file.
 *       - shell.openPath(path): Open the given file in the desktop's default manner.
 *       - shell.trashItem(path): This moves a path to the OS-specific trash location (Trash on macOS, Recycle Bin on Windows, and a desktop-environment-specific location on Linux).
 *
 * net - Issue HTTP/HTTPS requests using Chromium's native networking library
 *     - The net module is a client-side API for issuing HTTP(S) requests.
 *     - It is similar to the HTTP and HTTPS modules of Node.js but uses Chromium's native networking library instead of the Node.js implementation, offering better support for web proxies.
 *     - It also supports checking network status.
*/

import { createHash, randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { alreadyImported, captureText, changed, database, importAnki, importBookmarks, importHighlights, importMarkdown, importNote, linkImported, recordOpen, registerCaptures, registerImportConversion, setImporting, type Imported } from './captures'
import { isPrivateFile, looksPrivate } from './import'
import { backupDir } from './backup'
import { activeSession, atLogin, badge, beaconDefault, tempusDots, blurOn, boxPlacement, gate, motionOn, openGoals, registerHome, registerVigil, showStickies, stickyPrefs, toggleSafeMode, whenKeys, whenSafeMode, whenGoals, whenStickies } from './vigil'
import { daysLeft, percent, tempus, wayThrough } from './goal-days'
import { fetchOutside, isOutside } from './outside'
import { registerNotes } from './notes'
import { registerPeriods } from './periods'
import { registerIssues } from './issues'
import { dayKey, dayMonth, num } from './dates'
import { registerScenery, sceneryDir } from './scenery'
import { celebrationFile, registerCelebrations } from './celebrate'
import { firstRun, noteChord, pretendTaken, registerOnboarding, whereTray } from './onboarding'
import { registerUnused } from './unused'
import { registerObsidian } from './obsidian'
import { frostWindow, registerFrost, retellFrost } from './frost'
import { SANDBOX, onHandOff, registerSandbox, relaunch, restartNow, useDataFolder } from './sandbox'


/* The standard electron app file structure:
 * One folder, named after your app
 `app.getPath('userData')` - That is the only place you write. It resolves per machine:
        macos - `~/Library/Application Support/mindflow`
        linux - `~/.config/mindflow`
        windows - `%APPDATA%\mindflow`
 `userData` is a label you ask for, not a folder name. The name on disk is your app's name from `package.json`.
 You share it with Chromium
 Chromium writes a bunch of its own housekeeping items/files into that same folder:
        `Cache`, `Cookies`, `Preferences`, `Local State`, `Local Storage`, `Session Storage`, `GPUCache`, `blob_storage` and friends. Your files sit beside them. There is no way around that, because there is one folder.

 rule of thumb:
 - One clearly-named entry per kind of thing.
 - Note: Renaming after you ship strands data.
```
 mindflow/
 ├── assets/          ← one entry, holds hundreds of images, audios etc
 ├── {any other custom folder e.g notes/, tasks/ }/           ← one entry, holds every note
 ├── app.db           ← one file, obviously yours
 └── Cache/  Cookies  Preferences  …Chromium's
 ```
 At some point folders stop being the right shape.
        One file per record works because a note stands alone.
        Once you have tasks that belong to projects, that carry labels, that reference each other, you start wanting questions like "every task due this week across all projects".
        Answering that by opening every file and checking it works until it does not.
 That is when a database takes over:
 ---
 mindflow/
 ├── app.db      ← tasks, projects, labels, notes, all of it
 ├── assets/     ← images stay as files
 └── Cache/  Cookies  …
        notes/ does not get renamed then.
        It disappears, and notes become rows alongside everything else.
        assets/ stays, because images are the one thing that does not belong in a database.
 ---
 A single file at the top is fine. Two hundred is not. A lone `app.db` needs no folder wrapped round it.
 The only hard part is never reusing a name Chromium already took, from the list above.
  Which label for which job:
        userData: database, settings, user files
        cache: thumbnails, downloaded previews
        temp: scratch files you delete yourself
 The system can clear `cache` without asking. Nothing you would miss goes there.
 ---
 Big files and databases
  A database is one file at the top of `userData`.
  Keep large binary things out of it. Save the image as a file in `assets/` and store only its name in the database, which is what mindflow already does. Past roughly 100KB a file beats a database row, and it keeps the database small enough to copy and back up.
 Two things that will bite you
  Never write next to the app itself.** On a Mac the app bundle is signed and read-only, and the code sits inside a sealed archive. It works while you develop and fails on a real install.
        Renaming the app orphans everyone's data.
        The folder is named after the app. Change the name and every user gets a fresh empty folder, with their old one stranded.

 Where mindflow stands:
       You have `assets/` and `notes/`, and nothing else. No database, no settings file.
       If you add either, they go at the top of the same folder as `app.db` and `config.json`, and nothing else moves.

 The escape hatch, for later
 ```app.setPath('sessionData', somewhereElse)```
        Those two dozen files in your folder are not yours.
        They belong to the browser engine inside Electron.
        Your app is a browser window, so it quietly builds up the things browsers build up: cookies, caches, local storage, preferences.
        Electron calls that whole pile the session data, and it has to live somewhere.
        By default, that somewhere is the same folder as your own files.
        That is the only reason Cookies and Cache sit next to notes/ and assets/.
        It is a default, not a law.
**/
// Where dropped and pasted images live.
const assetsDir = (): string => join(app.getPath('userData'), 'assets')

/**
 * Images are addressed by the hash of their bytes, not by name.
 *
 * A pasted image has no filename at all, and the same screenshot dropped into
 * three notes should not be stored three times. The hash solves both, and makes
 * the write idempotent: the same bytes always produce the same file.
 */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  // Not a registered type, but common: plenty of servers send it.
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/apng': 'png',
  'image/vnd.microsoft.icon': 'ico',
  'image/x-icon': 'ico'
}

// invents custom 'scheme' (address type) like https:// but private to mindflow
// allows app to point to assets without specififying absolute locations on disc
// instead of file:///Users/{username}/Library/Application Support/mindflow/assets/abc.png this allows for
// mindflow://assets/abc.png
// obviously the 'file://' path would only work on my machine
// when the window asks for an address, app will look up where its data folder lives and read the file
// `standard: true` - dicates that address is shaped like a normal web address, e.g mindflow://assets/abc.png splits into a part before the slash and a part after
//                    without it, the string is treated like one lump of text
// `secure: true` - says treat it as trustworthy (like https) , without it browser will refuse and not trust files from this scheme
// needs to run before the app (outside of app.whenReady()) is ready because, the browser engine builds its list of known address types once, as it starts
protocol.registerSchemesAsPrivileged([
  // `stream`, so a stored video or recording can play (and seek) in a note.
  { scheme: 'mindflow', privileges: { standard: true, secure: true, stream: true } }
])

/** The capture box's sizes: the toolbar's expander changes the height, the side panel the width. */
// Just the box until the side panel is asked for, then wide enough for both.
const WIDTH = 640
const WITH_PANEL = 1080
const SIZES = {
  compact: { width: WIDTH, height: 600 },
  expanded: { width: WIDTH, height: 816 }
}
/**
 * The box opens short, as Linear's "New issue" does: room for two lines, the
 * fields and the footer. It grows down with what is written, up to the
 * compact size, and the note scrolls from there. The page measures what it
 * needs and says so (window:fit); the panel and the expander go to their full
 * height whatever is written.
 */
const FIT_MIN = 240
/** What the writing asks for, as the page last measured it. */
let fit = FIT_MIN
/** The side panel and the expander, as the page last asked. */
let panelOpen = false
let expandedNow = false
/** How tall the box should be now. */
const boxHeight = (): number =>
  expandedNow ? SIZES.expanded.height : panelOpen ? SIZES.compact.height : Math.round(Math.min(SIZES.compact.height, Math.max(FIT_MIN, fit)))

/** What summons the window. */
const SUMMON = 'Command+.'

/** Keys as Settings writes them (⌥⌘S) in Electron's words (Alt+Command+S); null for none, or two in a row. */
function accelerator(keys: string | null | undefined): string | null {
  if (!keys || keys.includes(' ')) return null
  const base = keys.replace(/^[⌃⌥⇧⌘]+/, '')
  const mods = keys.slice(0, keys.length - base.length)
  const names: Record<string, string> = { '↵': 'Return', Esc: 'Escape', '⇥': 'Tab', '⌫': 'Backspace', '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right', '+': 'Plus', '−': '-', '?': 'Shift+/', '#': 'Shift+3' }
  const words = [['⌃', 'Control'], ['⌥', 'Alt'], ['⇧', 'Shift'], ['⌘', 'Command']].filter(([glyph]) => mods.includes(glyph)).map(([, word]) => word)
  return [...words, names[base] ?? base].join('+')
}

/**
 * Where the window was when it was last put away.
 *
 * macOS usually hands a hidden window back where it was, but not always: shown
 * again it lands on whatever Space is in front, and a tiling manager or a
 * second display can have moved it in the meantime. Remembering it here means
 * the window comes back where you left it however it was hidden - the key, the
 * red dot or Escape.
 */
let lastBounds: Electron.Rectangle | null = null

/** Put it away, keeping its place. Shared by the key, Escape and the dot. */
function hideWindow(win: BrowserWindow): void {
  // A glide under way lands first, so the window is put away at its new size.
  if (pending?.win === win) (clearInterval(arriving), settle())
  lastBounds = boundsOf(win)
  // Told before it goes, so the page can clear itself while hidden and come
  // back already blank rather than showing the old note for a frame.
  win.webContents.send('window:hiding')
  win.hide()
  // The welcome brings its words back where the box was.
  if (win === prompt && home && !home.isDestroyed()) home.webContents.send('onboarding:box-away')
}

/**
 * Show it, or put it away if it is already in front.
 *
 * Only when it is *in front*: pressing the key while another app has the
 * focus should bring this one forward, not hide the window you were about to
 * type into. A window can be visible and still be behind everything.
 */
/**
 * The box is summoned many times a day, so it appears at once with the caret
 * ready, never fading up: the sound alone says it is alive (Rauno: what is
 * done hundreds of times should barely move). A resize glides instead (reshape).
 */
let arriving: ReturnType<typeof setInterval> | undefined
/**
 * The size a glide is on its way to, before it lands: what the next
 * resize must start from, or two quick presses read the old size and undo
 * each other.
 */
let pending: { win: BrowserWindow; bounds: Electron.Rectangle } | null = null
/** Where the window is, or is about to be. */
const boundsOf = (win: BrowserWindow): Electron.Rectangle => (pending?.win === win ? pending.bounds : win.getBounds())
/** A glide cut short (the window hidden, or shown again) still lands its size. */
function settle(): void {
  if (pending && !pending.win.isDestroyed()) pending.win.setBounds(pending.bounds, false)
  pending = null
  const done = landed
  landed = null
  done?.()
}
/** Told when the glide under way lands, or is cut short. */
let landed: (() => void) | null = null
function arrive(win: BrowserWindow): void {
  clearInterval(arriving)
  settle()
  win.setOpacity(1)
  win.show()
}

/** Motion off in Settings, or Reduce motion on in the Mac's Accessibility settings. */
const stillness = (): boolean => !motionOn() || systemPreferences.getAnimationSettings().prefersReducedMotion
/** How long a glide takes: quick, since a key asks for it, but long enough for the eye to follow. */
const GLIDE = 240

/**
 * A new size or place as one continuous glide, the way a Mac window zooms.
 *
 * The frame moves a little every display frame, easing out (most of the way
 * at once, settling gently), and stays fully drawn throughout: no fade, no
 * blink. The page is laid out so nothing in it reflows as the frame moves
 * (the writing keeps its width; the panel is uncovered rather than squeezed),
 * so the glide is the frame alone.
 *
 * Not macOS's own `setBounds(bounds, true)`: that one holds up the whole app
 * until it ends (measured: 356ms for the panel's 440px, with no page drawn
 * in between), and its length is fixed by the distance.
 *
 * Started again mid-way, it starts from where the frame is now, never from
 * where it was going, so pressing twice turns it round without a jump. At
 * once with Motion off, Reduce motion on, or the window not on screen.
 * Resolves once the window has its new bounds.
 */
function reshape(win: BrowserWindow, bounds: Electron.Rectangle, snap = false): Promise<void> {
  clearInterval(arriving)
  // Turned round mid-way: the old target is dropped, not landed.
  const before = landed
  landed = null
  pending = null
  before?.()
  if (snap || stillness() || !win.isVisible()) {
    win.setBounds(bounds, false)
    return Promise.resolve()
  }
  const from = win.getBounds()
  pending = { win, bounds }
  const start = Date.now()
  return new Promise((resolve) => {
    landed = resolve
    const step = (): void => {
      if (win.isDestroyed()) return void (clearInterval(arriving), (pending = null), (landed = null), resolve())
      const t = Math.min(1, (Date.now() - start) / GLIDE)
      // Ease-out quart: quick off the mark, as anything a key asks for should be.
      const k = 1 - (1 - t) ** 4
      const at = (a: number, b: number): number => Math.round(a + (b - a) * k)
      const next = { x: at(from.x, bounds.x), y: at(from.y, bounds.y), width: at(from.width, bounds.width), height: at(from.height, bounds.height) }
      const now = win.getBounds()
      if (!sameBox(now, next)) win.setBounds(next, false)
      if (t < 1) return
      clearInterval(arriving)
      settle()
    }
    arriving = setInterval(step, 1000 / 120)
    step()
  })
}

function toggleWindow(): void {
  const win = prompt
  if (!win) {
    createWindow()
    // Summoned before it existed: shown as soon as it has painted.
    prompt?.once('ready-to-show', () => prompt && (arrive(prompt), prompt.webContents.send('window:shown')))
    return
  }

  if (win.isVisible() && win.isFocused()) {
    hideWindow(win)
    return
  }

  // Before showing it, or you watch it arrive in one place and move to another.
  // Checked against the screen as it is now: a display can have been unplugged
  // while the window was away.
  // Where Settings says, the screen you are on by default.
  const { place, top } = summonedAt(win)
  // Its top is where it was put, unless the screen's bottom pushed it up.
  anchor = { y: top, became: place.y }
  const now = boundsOf(win)
  if (!sameBox(place, now)) {
    // Where the panel opened from moves with it, so closing the panel
    // still lands where it should.
    const dx = place.x - now.x
    if (panelFrom) panelFrom = { x: panelFrom.x + dx, became: panelFrom.became + dx }
    win.setBounds(place)
  }
  arrive(win)
  recordOpen('prompt')
  beaconMoment('open')
  win.webContents.send('window:shown')
  // The welcome listens for the box, so its keycaps press down even when the
  // key went to another app.
  if (home && !home.isDestroyed()) home.webContents.send('onboarding:box')
  // An accessory app is not in the running-app rotation, so asking for the
  // window alone sometimes leaves the keyboard with whatever had it. `steal`
  // is what brings this app forward at all.
  app.focus({ steal: true })
  win.focus()
}

/**
 * Load the app's page into a window. The query says which view it is, since
 * that is the one thing a fresh renderer can read about itself before any of
 * ours has run.
 */
function load(win: BrowserWindow, query = ''): void {
  // The sandbox says so in every window's address, the one thing a page knows before it runs.
  if (SANDBOX) query = `${query || '?'}${query ? '&' : ''}sandbox=1`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }
}

/**
 * A drawing open in a window of its own.
 *
 * The note that opened it is remembered alongside, because the point is that
 * what you draw over there lands back in the block over here. The scene is
 * held too: the window asks for it once it has loaded, rather than being
 * handed it before it can listen.
 */
const drawings = new Map<
  string,
  { window: BrowserWindow; note: Electron.WebContents; scene: unknown }
>()

/** Open a drawing in its own window, or bring the one already open forward. */
function openDrawing(id: string, scene: unknown, note: Electron.WebContents): void {
  const open = drawings.get(id)
  if (open && !open.window.isDestroyed()) {
    open.scene = scene
    open.window.focus()
    return
  }

  const window = new BrowserWindow({
    width: 900,
    height: 650,
    show: false,
    title: 'Drawing',
    backgroundColor: '#1c1c1c',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })

  drawings.set(id, { window, note, scene })
  window.on('ready-to-show', () => window.show())

  // The note has stepped back to being a picture while this is open, so it has
  // to be told when it can be drawn in again.
  const tell = (open: boolean): void => {
    if (!note.isDestroyed()) note.send('drawing:open', id, open)
  }
  tell(true)
  window.on('closed', () => {
    drawings.delete(id)
    tell(false)
  })

  guard(window)
  load(window, `?drawing=${encodeURIComponent(id)}`)
}

/**
 * What every window with an editor in it needs: links leave for the browser,
 * nothing navigates the page away, and Cmd+Q quits.
 */
function guard(win: BrowserWindow): void {
  const page = win.webContents
  // In safe mode no window is named after a note: a shared screen shows titles.
  page.on('page-title-updated', (event) => {
    if (!gate().blackout) return
    event.preventDefault()
    win.setTitle(page.getURL().includes('note=') ? 'Note' : 'Vigil')
  })
  // A file dropped outside the editable would otherwise navigate the window to
  // it, and nothing here is saved.
  page.on('will-navigate', (event, url) => {
    if (url !== page.getURL()) event.preventDefault()
  })

  // Editor content reaches this through window.open, so file: and whatever else
  // the OS would happily launch is dropped. The list mirrors the editor's own
  // isAllowedUri, minus the schemes nothing can open.
  const OPENABLE = ['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'callto:', 'ftp:', 'ftps:']
  page.setWindowOpenHandler(({ url }) => {
    if (OPENABLE.includes(URL.parse(url)?.protocol ?? '')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // An accessory app has no menu bar of its own, so the one chord everybody
  // expects to end a program is not bound to anything. Taken from the window
  // rather than globally: Cmd+Q belongs to whichever app is in front.
  page.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.meta || input.control || input.alt) return
    // Cmd+, opens Settings, as in every Mac app: from any window, typing or not.
    if (input.key === ',') {
      event.preventDefault()
      return sendHome('view', 'settings')
    }
    // Cmd+O opens the main window from the box, a sticky or a note's own window.
    if (input.key === 'o' && !input.shift && home?.webContents !== page) {
      event.preventDefault()
      return openHome()
    }
    if (input.key.toLowerCase() !== 'q') return
    event.preventDefault()
    quit()
  })
}

/** The capture prompt. Every other window is something else. */
let prompt: BrowserWindow | null = null

/**
 * The main window: every note, and one open beside the list.
 *
 * An ordinary window, buttons and all, so a tiling window manager files it
 * like any other. The prompt stays out of its reach because it has no close
 * button; this one has one, and is meant to be tiled.
 */
let home: BrowserWindow | null = null

/**
 * Open the main window on one thing. A page already listening is told now;
 * one still starting picks it up when it asks (`home:sent`), and only once.
 */
function sendHome(type: string, id: string, heading?: string): void {
  openHome()
  // A heading link's heading goes along, so the note opens there.
  const sent: [string, string, string?] = heading ? [String(type), String(id), String(heading)] : [String(type), String(id)]
  if (homeAsked && home) home.webContents.send('home:open', ...sent)
  else sentTo = sent
}

/**
 * The focus timer: a small pill that floats over everything, the way Raycast
 * Focus shows one, until the session ends. Dragged anywhere; remembered.
 */
let focusPill: BrowserWindow | null = null
/** Whether a session wants the pill up: safe mode hides it without forgetting. */
let focusWanted = false
function showFocus(on: boolean): void {
  focusWanted = on
  if (!on) return void focusPill?.hide()
  if (focusPill && !focusPill.isDestroyed()) return void (gate().blackout || focusPill.showInactive())
  const { workArea } = screen.getPrimaryDisplay()
  focusPill = new BrowserWindow({
    width: 340,
    height: 64,
    x: Math.round(workArea.x + workArea.width / 2 - 170),
    y: workArea.y + 12,
    frame: false,
    transparent: true,
    // Nothing of the window's own around the pill: no backing colour, and no
    // rounded window shape for macOS to draw a second box with.
    backgroundColor: '#00000000',
    roundedCorners: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  focusPill.setAlwaysOnTop(true, 'floating')
  focusPill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  focusPill.once('ready-to-show', () => gate().blackout || focusPill?.showInactive())
  guard(focusPill)
  load(focusPill, '?view=focus')
  // Made now, hidden, so the glow at the end has nothing to load.
  makeGlow()
}

/**
 * The glow at the end of a session or a timer, Raycast's way: light around the
 * whole edge of the screen for a moment, over everything and never in the
 * way. One window, see-through and click-through, kept hidden between glows.
 */
let glow: BrowserWindow | null = null
/** A glow asked for before the page could listen: it asks for this once it can. */
let glowWaiting: string | null = null
let glowHide: ReturnType<typeof setTimeout> | undefined
function makeGlow(): BrowserWindow {
  if (glow && !glow.isDestroyed()) return glow
  glow = new BrowserWindow({
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
  })
  glow.setIgnoreMouseEvents(true)
  // Above the menu bar and full-screen apps too: the edge is the whole screen's.
  glow.setAlwaysOnTop(true, 'screen-saver')
  glow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  load(glow, '?view=glow')
  return glow
}
function showGlow(tone: string): void {
  const win = makeGlow()
  // The screen you are on: where the pointer is.
  win.setBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds)
  win.showInactive()
  if (win.webContents.isLoading()) glowWaiting = tone
  else win.webContents.send('glow', tone)
  clearTimeout(glowHide)
  glowHide = setTimeout(() => glow?.hide(), 2200)
}

/**
 * A note stuck on the desktop: a small window of its own, over everything,
 * dragged anywhere and closed with its own button. Remembered, place and all,
 * so the desktop looks the same after a restart.
 */
const stickies = new Map<string, BrowserWindow>()
const stickyFile = (): string => join(app.getPath('userData'), 'stickies.json')
// Hidden: put away on its own ("Hide this one") until the stickies are next shown.
type Stuck = { type: string; id: string; bounds?: Electron.Rectangle; hidden?: boolean }
let stuck: Stuck[] = []
const keepStuck = (): void => void writeFile(stickyFile(), JSON.stringify(stuck)).catch(() => undefined)
const stuckAs = (key: string): Stuck | undefined => stuck.find((one) => `${one.type}:${one.id}` === key)
/** Whether a sticky is on the desktop now: not in safe mode, the stickies shown, and not put away on its own. */
const stickyUp = (key: string): boolean => !gate().blackout && stickyPrefs().shown && !stuckAs(key)?.hidden && (tucked.get(key) ?? 0) <= Date.now()
/** Kept out of screen shares and recordings when either setting says so. */
const shield = (win: BrowserWindow): void => win.setContentProtection(!recordable || stickyPrefs().unshared)
/** Every sticky as the settings say now: shown or away, shared or not. */
function applyStickies(): void {
  for (const [key, win] of stickies) {
    if (win.isDestroyed()) continue
    shield(win)
    if (stickyUp(key)) win.showInactive()
    else win.hide()
  }
  // Frosted or plain paper, as the setting says now.
  retellFrost()
}
function stick(type: string, id: string, on: boolean, bounds?: Electron.Rectangle): void {
  const key = `${type}:${id}`
  const open = stickies.get(key)
  // A goal's page says whether its beacon is up, so it hears when that changes.
  if (type === 'goal') setTimeout(() => changed({ kind: 'item', id }), 0)
  if (!on) {
    stuck = stuck.filter((one) => `${one.type}:${one.id}` !== key)
    keepStuck()
    if (open && !open.isDestroyed()) open.destroy()
    return void stickies.delete(key)
  }
  if (open && !open.isDestroyed()) {
    // Stuck again while put away: it comes back, and with the rest put away, they all do.
    const one = stuckAs(key)
    if (one?.hidden) (one.hidden = false), keepStuck()
    if (!stickyPrefs().shown) return void showStickies(true)
    return void (gate().blackout || open.showInactive())
  }
  const { workArea } = screen.getPrimaryDisplay()
  // A new one lands top right, each fanned a little down and to the side of the last.
  // The window is the note plus room for its lean and shadow.
  // A saved place is brought back onto a screen that exists now: a display
  // unplugged, or a note dragged past an edge, never leaves it out of reach.
  // A goal's beacon is taller than a note: the days left, the road and the four bars.
  const place = bounds ? onScreen({ ...bounds, ...stickySize(bounds.width, bounds.height, bounds) }) : freeSpot(workArea, 300, type === 'goal' ? 360 : 220)
  const win = new BrowserWindow({
    ...place,
    minWidth: 220,
    minHeight: 130,
    maxWidth: 480,
    maxHeight: 520,
    // Named for AeroSpace's floating rule, and with no close button, like the
    // box: a window of an accessory app without one is never tiled at all.
    // Its own X takes it down; quitting makes it closable first.
    title: 'Vigil',
    closable: false,
    // Not resizable either: a resizable window keeps its zoom button in the
    // style mask, and while any window button is left AeroSpace counts it as
    // a real window, files it under one workspace and hides it on the others.
    resizable: false,
    frame: false,
    transparent: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  shield(win)
  // The desktop picture, blurred, behind its paper (frost.ts).
  frostWindow(win, () => stickyUp(key))
  win.once('ready-to-show', () => stickyUp(key) && win.showInactive())
  // Where you leave it is where it comes back.
  const remember = (): void => {
    const one = stuck.find((each) => `${each.type}:${each.id}` === key)
    if (one && !win.isDestroyed()) one.bounds = win.getBounds()
    keepStuck()
  }
  // Let go with most of it past an edge, it slides back until it is all in view.
  win.on('moved', () => {
    if (win.isDestroyed()) return
    const now = win.getBounds()
    const safe = onScreen(now)
    if (safe.x !== now.x || safe.y !== now.y) win.setBounds(safe)
    remember()
  })
  win.on('resized', remember)
  // Closed any way but quitting is taken down, so it stays down after a restart.
  win.on('closed', () => {
    stickies.delete(key)
    if (quitting) return
    stuck = stuck.filter((one) => `${one.type}:${one.id}` !== key)
    keepStuck()
    if (type === 'goal') changed({ kind: 'item', id })
  })
  stickies.set(key, win)
  if (!stuck.some((one) => `${one.type}:${one.id}` === key)) stuck.push({ type, id, bounds: place })
  keepStuck()
  guard(win)
  // Its place in line, so neighbours lean opposite ways.
  const nth = stuck.findIndex((one) => `${one.type}:${one.id}` === key)
  load(win, `?view=sticky&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&nth=${nth}`)
}
/** The stickies left on the desktop last time, back where they were. */
async function restoreStickies(): Promise<void> {
  try {
    const saved = JSON.parse(await readFile(stickyFile(), 'utf8')) as Stuck[]
    stuck = saved
    // One that covers more than half of an earlier one is fanned out from it, and kept there.
    const covers = (a: Electron.Rectangle, b: Electron.Rectangle): boolean =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) >
      (a.width * a.height) / 2
    saved.forEach((one, i) => {
      const { bounds } = one
      if (bounds && saved.slice(0, i).some((before) => before.bounds && covers(bounds, before.bounds)))
        one.bounds = onScreen({ ...bounds, x: bounds.x + 24, y: bounds.y + 64 })
    })
    for (const one of saved) stick(one.type, one.id, true, one.bounds)
  } catch {
    // None yet.
  }
}

/**
 * Safe mode puts away every window that floats a note over your screen: the
 * stickies, the focus pill, notes in windows of their own. They come back as
 * they were when it ends. Their titles go plain too, in case anything lists them.
 */
function safeWindows(on: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    const url = win.webContents.getURL()
    if (win !== focusPill && !/[?&](view=sticky|note=)/.test(url)) continue
    if (on) {
      win.hide()
      if (url.includes('note=')) win.setTitle('Note')
    } else if ((win !== focusPill || focusWanted) && (!url.includes('view=sticky') || [...stickies].some(([key, one]) => one === win && stickyUp(key)))) {
      win.setTitle(win.webContents.getTitle())
      win.showInactive()
    }
  }
}

/**
 * Seen by screen recorders and shares, or kept out of them (the default):
 * every window alike, from the moment it is made, not only the box.
 */
let recordable = false
app.on('browser-window-created', (_event, win) => win.setContentProtection(!recordable))

let homePainted = false
/** What the main window was sent to while it was not yet listening. */
let sentTo: [string, string, string?] | null = null
/** The main window's page has asked for what it was sent: it is listening. */
let homeAsked = false

/**
 * The sandbox from the menu bar: the main window carries your look in and
 * restarts, the same as its own way in, so there is one way it happens.
 */
function openSandbox(): void {
  const win = makeHome()
  const go = (): void => void win.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('vigil:sandbox-enter'))").catch(() => undefined)
  if (homePainted) go()
  else win.once('ready-to-show', go)
}

function openHome(): void {
  if (!home?.isVisible()) recordOpen('home')
  beaconMoment('open')
  // One window at a time: going to the main app puts the prompt away.
  if (prompt?.isVisible()) hideWindow(prompt)
  // An accessory app is not in the running-app rotation, so the window alone
  // does not bring it forward. The same as the prompt does.
  app.focus({ steal: true })
  // Made ahead of time and kept when closed (see `makeHome`), so this is a
  // show, never a load: no wait, no blank frame.
  const win = makeHome()
  // Painted already (it was made in the background), or the first paint is
  // still to come: either way it shows the moment there is something to see.
  // Your workspace is read before the window shows, since showing it may
  // take you to its own. A hidden window may not be listed yet: then it is
  // moved once it shows, and your workspace is brought back.
  const reveal = (): void =>
    void (async () => {
      const here = AEROSPACE ? await aerospace('list-workspaces', '--focused') : ''
      const seen = await bringHere(win, here)
      win.show()
      if (!seen) setTimeout(() => void bringHere(win, here).then((now) => void (now && aerospace('workspace', here))), 60)
    })()
  if (homePainted) reveal()
  else win.once('ready-to-show', reveal)
}

// AeroSpace, a tiling window manager, keeps a window on the workspace it was
// first seen on. The main window is made once and kept, so opening it would
// take you back to that workspace instead of coming to the one you are on.
// Where AeroSpace is installed, it is asked to move the window here first.
const AEROSPACE = ['/opt/homebrew/bin/aerospace', '/usr/local/bin/aerospace'].find((path) => existsSync(path))
const aerospace = (...args: string[]): Promise<string> =>
  new Promise((done) => execFile(AEROSPACE!, args, { timeout: 1500 }, (error, out) => done(error ? '' : out.trim())))

/** Move the main window to workspace `here`; false when AeroSpace does not list it yet. */
async function bringHere(win: BrowserWindow, here: string): Promise<boolean> {
  if (!AEROSPACE || !here || win.isDestroyed()) return true
  const rows = await aerospace('list-windows', '--all', '--format', '%{window-id}|%{app-pid}|%{workspace}|%{window-title}')
  const mine = rows.split('\n').map((row) => row.split('|')).find(([, pid, , title]) => Number(pid) === process.pid && title === win.getTitle())
  if (!mine) return false
  if (mine[2] !== here) await aerospace('move-node-to-workspace', '--window-id', mine[0], here)
  return true
}

/**
 * The main window, made hidden: soon after start, so the first open is as
 * quick as every other, and again only if it is ever really gone. Closing it
 * hides it; only quitting closes it for good.
 */
/** The compact main window: about Raycast's settings window, never more than most of the screen. */
const compact = (): { width: number; height: number } => {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  return { width: Math.min(1000, Math.round(workArea.width * 0.8)), height: Math.min(700, Math.round(workArea.height * 0.8)) }
}

function makeHome(): BrowserWindow {
  if (home) return home

  // Compact by default, a window that sits beside your work rather than
  // taking it over; filling the screen is a button away (`home:fill`).
  home = new BrowserWindow({
    ...compact(),
    show: false,
    title: 'Vigil',
    backgroundColor: '#1c1c1c',
    autoHideMenuBar: true,
    // The app draws its own toolbar, with the traffic lights set into it the
    // way Claude's and Linear's are, rather than a grey strip saying "Electron".
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  // Small enough to sit in a corner, not so small its pages fold up.
  home.setMinimumSize(560, 400)
  home.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    home?.hide()
  })
  home.on('closed', () => {
    home = null
    homePainted = false
    homeAsked = false
  })
  home.once('ready-to-show', () => (homePainted = true))
  // The fill icon follows the window, however it was filled or brought back.
  home.on('maximize', () => home?.webContents.send('home:filled', true))
  home.on('unmaximize', () => home?.webContents.send('home:filled', false))
  // Raycast's settings way: put away filled or stretched, it comes back the
  // small window it was made as, centred on the screen you are on. Filling is
  // for this visit only.
  home.on('hide', () => {
    if (!home || home.isDestroyed()) return
    // Hidden, a page still reads as visible here: told, so its looping
    // effects (beams, orbs) stop until it is back.
    home.webContents.send('window:hiding')
    if (home.isMaximized()) home.unmaximize()
    if (home.isFullScreen()) home.setFullScreen(false)
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { width, height } = compact()
    home.setBounds({ width, height, x: Math.round(workArea.x + (workArea.width - width) / 2), y: Math.round(workArea.y + (workArea.height - height) / 2) })
  })
  guard(home)
  load(home, '?view=home')
  return home
}

/**
 * Top right, clear of the middle of the screen.
 *
 * A capture window arrives over whatever you were reading, and the middle is
 * where that is. Measured against the work area rather than the display, so it
 * sits under the menu bar and beside the dock rather than behind them.
 */
/** Same place, same size. */
function sameBox(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * Where the box's top edge wants to be, and where it was last put.
 *
 * The box grows and shrinks downward from its top, so the writing never moves
 * on screen. Only near the bottom of the screen is it pushed up, just enough;
 * shrinking again, it goes back down to its top. The second half is how "has
 * it been moved since" is answered: a box no longer where it was put was
 * dragged, and its top is wherever it is now.
 */
let anchor: { y: number; became: number } | null = null

/** The box at a new size, its top where it wants to be, kept on the screen. */
function anchored(win: BrowserWindow, x: number, width: number, height: number): Electron.Rectangle {
  const bounds = boundsOf(win)
  if (!anchor || anchor.became !== bounds.y) anchor = { y: bounds.y, became: bounds.y }
  const next = onScreen({ x, y: anchor.y, width, height })
  anchor.became = next.y
  return next
}

/** The box to the height its content (or the panel, or the expander) asks for, in one glide. */
function refit(win: BrowserWindow, snap = false): Promise<void> {
  const bounds = boundsOf(win)
  const next = anchored(win, bounds.x, bounds.width, boxHeight())
  // Already there, or on its way: a glide under way is never restarted.
  if (sameBox(next, bounds) && !(snap && pending)) return Promise.resolve()
  return reshape(win, next, snap)
}
/** Where the box's left edge was before the side panel opened, and where opening put it: the same test, sideways. */
let panelFrom: { x: number; became: number } | null = null

/**
 * Nudge a rectangle back onto the screen it is mostly on.
 *
 * There is no built-in for this. macOS keeps a window on screen when a person
 * drags it, but `setBounds` is not a drag and is taken literally - so growing
 * a window parked near an edge pushes half of it off. Pinned to the top left
 * of the work area if it is somehow bigger than the screen, which is the half
 * worth keeping.
 */
/**
 * A sticky's size kept to a note's: never smaller than reads, never bigger
 * than about a postcard (480 by 520), and never more than half the screen it
 * is on, so one can't swallow the desk.
 */
function stickySize(width: number, height: number, at: Electron.Rectangle): { width: number; height: number } {
  const { workArea } = screen.getDisplayMatching(at)
  return {
    width: Math.round(Math.min(480, workArea.width * 0.5, Math.max(220, width))),
    height: Math.round(Math.min(520, workArea.height * 0.6, Math.max(130, height)))
  }
}

/**
 * A goal's beacon: a sticky of type 'goal', kept as its goal says. Always:
 * up on every Space. Now and then: tucked away, out at a few moments (the
 * first wake or unlock of the day, the first time Vigil is opened that day,
 * and every three hours or so of being at the Mac), then tucked again a
 * minute later unless the pointer is on it. Off: none. In a goal's last
 * week, or past its day, now and then stays up as always does. Quiet hours,
 * safe mode and the stickies put away all keep it down, as for any sticky.
 */
/** When each beacon may show again; Infinity is "at its next moment". */
const tucked = new Map<string, number>()
const beaconModes = new Map<string, 'always' | 'sometimes'>()
const beaconHeld = new Set<string>()
const tuckTimers = new Map<string, ReturnType<typeof setTimeout>>()
const momentsDone = new Map<string, string>()
let lastAppear = Date.now()
/** A goal's beacon as it should be now. */
const beaconMode = (goal: { goalAt: string; beacon: 'always' | 'sometimes' | 'off' | null }): 'always' | 'sometimes' | 'off' => {
  const mode = goal.beacon ?? beaconDefault()
  return mode === 'sometimes' && daysLeft(goal.goalAt) <= 7 ? 'always' : mode
}
/** Every goal's beacon made, taken down or tucked as its goal says now. */
function beacons(): void {
  const want = new Map(openGoals().map((goal) => [goal.id, beaconMode(goal)]))
  for (const key of [...stickies.keys()]) {
    if (!key.startsWith('goal:')) continue
    const mode = want.get(key.slice(5))
    if (!mode || mode === 'off') (beaconModes.delete(key), tucked.delete(key), stick('goal', key.slice(5), false))
  }
  for (const [id, mode] of want) {
    if (mode === 'off') continue
    const key = `goal:${id}`
    // Turned to now and then (or new), it waits for its moment; turned to always, it comes out.
    if (beaconModes.get(key) !== mode) {
      if (mode === 'sometimes') tucked.set(key, Infinity)
      else tucked.delete(key)
      beaconModes.set(key, mode)
    }
    if (!stickies.has(key)) stick('goal', id, true)
  }
  applyStickies()
}
/** Tucked a minute from now, unless the pointer is on it then. */
function tuckLater(key: string): void {
  clearTimeout(tuckTimers.get(key))
  tuckTimers.set(key, setTimeout(() => {
    if (beaconHeld.has(key) || beaconModes.get(key) !== 'sometimes') return
    tucked.set(key, Infinity)
    applyStickies()
  }, 60_000))
}
/** A moment for the now-and-then beacons to come out: each kind once a day, the three-hourly one as it comes. */
function beaconMoment(kind: 'wake' | 'open' | 'active'): void {
  const { blackout, hidePrivate } = gate()
  if (blackout || hidePrivate || !stickyPrefs().shown) return
  if (kind !== 'active') {
    if (momentsDone.get(kind) === dayKey()) return
    momentsDone.set(kind, dayKey())
  }
  const keys = [...beaconModes].filter(([, mode]) => mode === 'sometimes').map(([key]) => key)
  if (!keys.length) return
  lastAppear = Date.now()
  for (const key of keys) {
    tucked.delete(key)
    tuckLater(key)
  }
  applyStickies()
}

/**
 * Where a new sticky goes when it has no place of its own: down the right of
 * the screen, under the ones already there with a small gap, then the next
 * column to the left when a column is full. Never on top of another.
 */
function freeSpot(area: Electron.Rectangle, width: number, height: number): Electron.Rectangle {
  const gap = 16
  const taken = [...stickies.values()].filter((win) => !win.isDestroyed()).map((win) => win.getBounds())
  const clear = (spot: Electron.Rectangle): boolean =>
    taken.every((one) => spot.x + spot.width + gap <= one.x || one.x + one.width + gap <= spot.x || spot.y + spot.height + gap <= one.y || one.y + one.height + gap <= spot.y)
  for (let x = area.x + area.width - width - gap; x >= area.x; x -= width + gap) {
    for (let y = area.y + gap; y + height <= area.y + area.height; y += 8) {
      const spot = { x, y, width, height }
      if (clear(spot)) return spot
    }
  }
  return { x: area.x + area.width - width - gap, y: area.y + gap, width, height }
}

/** Every sticky to the screen the pointer is on, fanned from its top right: the way back for one lost off an edge. */
function gatherStickies(): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  let n = 0
  for (const [key, win] of stickies) {
    // Only those meant to be up: never one put away, nor any in safe mode.
    if (win.isDestroyed() || !stickyUp(key)) continue
    const { width, height } = win.getBounds()
    const bounds = onScreen({ width, height, x: workArea.x + workArea.width - width - (n % 2) * 24, y: workArea.y + n * 64 })
    win.setBounds(bounds)
    const one = stuckAs(key)
    if (one) one.bounds = bounds
    if (!win.isVisible()) win.showInactive()
    n += 1
  }
  keepStuck()
}

function onScreen(bounds: Electron.Rectangle): Electron.Rectangle {
  const { workArea } = screen.getDisplayMatching(bounds)
  return {
    ...bounds,
    x: Math.round(
      Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - bounds.width))
    ),
    y: Math.round(
      Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - bounds.height))
    )
  }
}

/**
 * The top middle of a screen, the way Spotlight sits: across from the eye,
 * a quarter of the spare height down. Where the box first appears.
 */
function topMiddle(area: Electron.Rectangle, width: number, height: number): Electron.Rectangle {
  return { width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + Math.max(0, area.height - height) / 4) }
}

/** The work area of the screen the pointer is on. */
const pointerArea = (): Electron.Rectangle => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea

/**
 * Where the box turns up when summoned, as Settings says: where you left it
 * (the default), or always the top middle or the middle of the screen; on the
 * screen the pointer is on (the default) or the one it was last on. Left on
 * another screen, it keeps its place relative to the screen it moves to.
 * Never off the screen.
 */
function summonedAt(win: BrowserWindow): { place: Electron.Rectangle; top: number } {
  // Its size now, which the content may have changed while it was away; its
  // top where it was left, not where the screen's bottom last pushed it.
  const { width, height } = boundsOf(win)
  const kept = lastBounds ?? boundsOf(win)
  const left = { ...kept, y: anchor && anchor.became === kept.y ? anchor.y : kept.y, width, height }
  const { place, screen: which } = boxPlacement()
  const was = screen.getDisplayMatching(left).workArea
  const area = which === 'pointer' ? pointerArea() : was
  // Placed by its full size, so its top is the same however tall it opens.
  const full = SIZES.compact.height
  const put = (at: Electron.Rectangle): { place: Electron.Rectangle; top: number } => ({ place: onScreen({ ...at, width, height }), top: at.y })
  if (place === 'top') return put(topMiddle(area, width, full))
  if (place === 'centre') return put({ width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - full) / 2) })
  if (sameBox(area, was)) return put(left)
  const along = (at: number, from: number, span: number, size: number, to: number, room: number): number =>
    Math.round(to + ((at - from) / Math.max(1, span - size)) * Math.max(0, room - size))
  return put({ width, height, x: along(left.x, was.x, was.width, width, area.x, area.width), y: along(left.y, was.y, was.height, full, area.y, area.height) })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = (prompt = new BrowserWindow({
    // First seen at the top middle of the screen you are on.
    // Short until the page says how much it needs: see FIT_MIN.
    ...topMiddle(pointerArea(), SIZES.compact.width, SIZES.compact.height),
    height: FIT_MIN,

    resizable: false,
    // No window buttons at all which, with the accessory policy below, is what
    // keeps a tiling window manager's hands off this window. AeroSpace's own
    // rule, from its source: a window belonging to an accessory app and having
    // no close button is "not even a real window", so it is never managed and
    // never filed under a workspace. Summon it from anywhere and it turns up
    // where you are.
    //
    // All three, not just `closable`: macOS drops the button row only when the
    // style mask has none of them left, and until then the close button is
    // merely disabled - which the accessibility tree still counts as a button.
    // The policy alone is not enough either, for the same reason.
    //
    // Nothing is lost by it. The traffic lights were already hidden, the
    // window has its own dot to put it away, and `quit` makes them closable
    // again on the way out.
    closable: false,
    minimizable: false,
    fullscreenable: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: 'rgba(0,0,0,0)',

    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Keep painting while hidden: a page that clears itself on the way out
      // must have that frame ready, or the stale one shows on the way back in.
      backgroundThrottling: false
    }
  }))
  // Kept out of screen shares and recordings, so a call never shows what you
  // are jotting. Honoured by older capture; recorders on Apple's newer
  // ScreenCaptureKit may still see it.
  mainWindow.setContentProtection(!recordable)

  // the ready-to-show event on the BrowserWindow class will be emitted when the renderer process has rendered the page for the first time if the window has not been shown yet.
  // Showing the window after this event will have no visual flash:
  // Like Raycast: the app starts in the background, ready, and the box shows
  // only when summoned (the shortcut or the menu bar). A test run, which
  // drives the window directly, still gets it on screen.
  mainWindow.on('ready-to-show', () => {
    if (!process.env.MINDFLOW_USER_DATA) return
    mainWindow.show()
    recordOpen('prompt')
    mainWindow.webContents.send('window:shown')
  })


  // macOS-only: kill the traffic lights that titleBarStyle:'hidden' leaves behind
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);

    // Over a full-screen app too.
    //
    // Native full screen puts an app on a Space of its own, and an ordinary
    // window - even one that is always on top - belongs to the Space it was
    // opened on, so summoning it there did nothing you could see. These two
    // say the window has no Space of its own and sits above the level a
    // full-screen app occupies.
    //
    // `pop-up-menu`, not `screen-saver`: at the screen-saver level macOS never
    // delivers a drop to the window, so a block picked up by its grip went
    // nowhere and no ghost of it followed the pointer. Every level below that
    // drags fine; this is the highest of them.
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
  }

  // Whether the pointer is over the window, for the controls that only show
  // then. The page cannot tell for itself: macOS handles the drag strip, so
  // the page never hears the pointer there and takes it for gone. Asked of the
  // screen instead, a few times a second, and only while the window is shown.
  let pointerIn = false
  const pointer = setInterval(() => {
    if (!mainWindow.isVisible()) return
    const { x, y } = screen.getCursorScreenPoint()
    const b = mainWindow.getBounds()
    const inside = x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height
    if (inside === pointerIn) return
    pointerIn = inside
    mainWindow.webContents.send('window:pointer', inside)
  }, 80)
  mainWindow.on('closed', () => clearInterval(pointer))

  guard(mainWindow)
  load(mainWindow)
}

// Every web request carries a short line saying what browser is asking. This edits that line to stop announcing Electron.
// What the line looks like. Electron's default, on your machine:
// Mozilla/5.0 (Macintosh; …) Chrome/152.0.7977.78 mindflow/1.0.0 Electron/44.3.0 Safari/537.36
//                                                 └─ cut ─┘        └──── cut ────┘
// The two marked pieces come off. What is left is what I measured in the running app:
// Mozilla/5.0 (Macintosh; …) Chrome/152.0.7977.78 Safari/537.36
// Indistinguishable from ordinary Chrome.
// Why bother. Plenty of sites read that line and decide what to send back. A name they do not recognise often gets a stripped page, or a block. Since the link preview fetch sends this exact string, a bookmark card is the thing that quietly comes back empty.
// The two replaces.
// .replace(/ Electron\/[\d.]+/, '')
// Finds a space, then Electron/, then a run of digits and dots, and deletes it. [\d.]+ is the version number, whatever it happens to be, so this keeps working after an upgrade.
//
// .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '')
// Same shape, but the name has to be built while the app is running, because it comes from package.json and this file cannot know it in advance. That is the only reason one is written as a plain pattern and the other is assembled. The \\/ is an escaped slash, awkward only because it lives inside a string first. The 'i' makes it case-insensitive, so Mindflow and mindflow both go.
//
// Two details worth knowing. Each replace hits only the first match, which is fine since each token appears once. And this must run before the app is ready, like the scheme registration, or requests have already started going out with the old line.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/[\d.]+/, '')
  .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '')

// An accessory app: no Dock icon, no app switcher entry, no Mission Control
// tile. Half of what makes the window invisible to a tiling window manager -
// see `closable` on the window - and a fair description of what this is, which
// is a box summoned by a key rather than an app you go to. The main window
// lives with it: it is reached from the menu bar icon or the prompt, not the
// Dock or Cmd+Tab.
if (process.platform === 'darwin') app.setActivationPolicy('accessory')

// Somewhere else to keep everything, for the QA runs: they drive this same app,
// and must never open the database your real captures are in.
// The app is called Vigil, but its notes stay where they have always been,
// in the folder named for what it was first called: renaming must never look
// like losing everything.
app.setName('Vigil')
// The sandbox (a restart with --sandbox) keeps everything in a folder of its
// own inside this one, so it is apart by path alone: see sandbox.ts.
const locked = useDataFolder()
// Test runs only: every window sits past the screen's right edge, unseen,
// unclickable and never focused, so a run never lands on top of anyone's work.
if (process.env.MINDFLOW_USER_DATA && process.env.MINDFLOW_QA_AWAY) {
  const away = (win: BrowserWindow): void => {
    const { bounds } = screen.getPrimaryDisplay()
    const [width, height] = win.getSize()
    setBounds.call(win, { x: bounds.x + bounds.width - 6, y: bounds.y + 40, width, height })
    // Where the screen will not let it go past the edge, unseen and unclickable all the same.
    win.setOpacity(0)
    win.setIgnoreMouseEvents(true)
  }
  const proto = BrowserWindow.prototype
  const setBounds = proto.setBounds
  proto.show = function (this: BrowserWindow) { away(this); this.showInactive() }
  proto.focus = function () {}
  proto.setBounds = function (this: BrowserWindow, next: Partial<Electron.Rectangle>) { setBounds.call(this, next); away(this) }
  proto.setPosition = function (this: BrowserWindow) { away(this) }
  proto.center = function (this: BrowserWindow) { away(this) }
  app.focus = () => {}
  app.on('browser-window-created', (_, win) => away(win))
}

// From a terminal, without the window: `open -n -a mindflow --args --capture "buy milk"`,
// or the binary itself with the same flags. One copy of the app runs; a second
// launch hands its words to the first and leaves.
const fromCli = (argv: string[]): string | null => {
  const at = argv.indexOf('--capture')
  return at < 0 ? null : argv.slice(at + 1).join(' ').trim() || null
}
// A QA run is its own app on its own data, and may start while the last one closes.
if (!locked) app.quit()
app.on('second-instance', (_event, argv) => {
  const text = fromCli(argv)
  if (text) captureText(text)
  else toggleWindow()
})

/**
 * A whole Obsidian vault, each note one capture (or an article, from a
 * `permanent` folder). Its settings, its trash and files that hold
 * credentials themselves are left out, and the dialog says which. What a
 * note's frontmatter says comes with it: every property, its tags as #tags,
 * its date, its aliases as other names to link by. Its pictures and files come
 * too, into the app's own store, and its [[links]] become links to what those
 * pages became here. A note imported before, by the same path, is left as it is.
 */
async function importVault(given?: string): Promise<void> {
  const root = given ?? (await dialog.showOpenDialog({ title: SANDBOX ? 'Import into the sandbox: an Obsidian vault or a Notion export (unzipped)' : 'Import an Obsidian vault or a Notion export (unzipped)', properties: ['openDirectory'] })).filePaths[0]
  if (!root) return
  // Its notes wait to become documents until their links are in; then every
  // window hears of it, and one of them turns them into documents.
  setImporting(true)
  try {
    await bringVault(root, given !== undefined)
  } finally {
    setImporting(false)
    changed()
    // The box turns them into documents, hidden or not: not only once it is next opened.
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('imports:ready')
  }
}

async function bringVault(root: string, quiet: boolean): Promise<void> {
  const notes: string[] = []
  // Attachments by file name: Obsidian embeds them by name alone, wherever
  // they are; and by their path from the vault's top, for the ones that say it.
  const files = new Map<string, string>()
  const everyFile = new Set<string>()
  const kept: string[] = []
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const path = join(folder, entry.name)
      // Key files themselves stay behind; a note or folder only named like
      // one comes in, marked private (see `looksPrivate`).
      if (entry.isFile() && !entry.name.endsWith('.md') && isPrivateFile(entry.name, false)) {
        kept.push(relative(root, path))
        continue
      }
      if (entry.isDirectory()) await walk(path)
      else if (!entry.isFile()) continue
      else if (entry.name.endsWith('.md')) notes.push(path)
      else {
        files.set(entry.name.toLowerCase(), path)
        everyFile.add(path)
      }
    }
  }
  await walk(root)
  const fileFor = (note: string, target: string): string | undefined => {
    const name = target.trim()
    if (name.includes('/')) {
      const found = [join(dirname(note), name), join(root, name)].find((one) => everyFile.has(one))
      if (found) return found
    }
    return files.get(name.split('/').pop()!.toLowerCase())
  }

  const IMAGE: Record<string, string> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp', svg: 'svg', avif: 'avif', bmp: 'bmp' }
  let pictures = 0
  let attached = 0
  // Stored by the hash of its bytes, as a pasted picture or a dropped file
  // is, so one embedded in ten notes is kept once.
  const keep = async (path: string): Promise<{ url: string; size: number; image: boolean } | null> => {
    const ending = path.split('.').pop()?.toLowerCase() ?? ''
    const extension = IMAGE[ending] ?? (/^[a-z0-9]{1,12}$/.test(ending) ? ending : 'bin')
    const bytes = await readFile(path).catch(() => null)
    if (!bytes) return null
    const name = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
    await mkdir(assetsDir(), { recursive: true })
    await stat(join(assetsDir(), name)).catch(() => writeFile(join(assetsDir(), name), bytes))
    if (IMAGE[ending]) pictures += 1
    else attached += 1
    return { url: `mindflow://assets/${name}`, size: bytes.byteLength, image: !!IMAGE[ending] }
  }
  // What a match becomes, worked out one at a time because storing a file waits.
  const swap = async (text: string, pattern: RegExp, to: (match: RegExpMatchArray) => Promise<string | null>): Promise<string> => {
    let out = ''
    let from = 0
    for (const match of text.matchAll(pattern)) {
      const next = await to(match)
      if (next === null) continue
      out += text.slice(from, match.index) + next
      from = match.index! + match[0].length
    }
    return out + text.slice(from)
  }
  /**
   * A stored file as Markdown: a picture, its width kept the way Obsidian
   * writes it (`![|300](...)`), or a link the editor turns into a file card.
   * In a table row the bar is escaped, or it would end the cell.
   */
  const shown = (stored: { url: string; size: number; image: boolean }, name: string, width: string | undefined, inTable: boolean): string =>
    stored.image
      ? `![${width ? `${inTable ? '\\|' : '|'}${width}` : ''}](${stored.url})`
      : `[${name.replace(/[[\]]/g, '')}](${stored.url} "${stored.size}")`
  const listed = (front: string, key: string): string[] => {
    const inline = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(front)?.[1]?.trim()
    if (inline) return inline.replace(/^\[|\]$/g, '').split(/[,\s]+/).map((one) => one.replace(/^["'#]|["']$/g, '')).filter(Boolean)
    const block = new RegExp(`^${key}:\\s*\\n((?:\\s*-\\s*.+\\n?)+)`, 'm').exec(front)?.[1] ?? ''
    return [...block.matchAll(/-\s*(.+)/g)].map((match) => match[1].trim().replace(/^["'#]|["']$/g, '')).filter(Boolean)
  }

  const made: Imported[] = []
  const byName = new Map<string, string>()
  const known: Imported[] = []
  let already = 0
  let empty = 0
  let marked = 0
  const unread: string[] = []
  for (const path of notes) {
    // Known by its path, so its pictures are not read again; new notes may still link to it.
    const before = alreadyImported(relative(root, path))
    if (before) {
      already += 1
      known.push(before)
      if (!byName.has(before.title.toLowerCase())) byName.set(before.title.toLowerCase(), before.link)
      continue
    }
    const read = await readFile(path, 'utf8').catch(() => null)
    // One that cannot be opened, or a picture or a program renamed .md, is not a note.
    if (read === null || read.includes('\u0000')) {
      unread.push(relative(root, path))
      continue
    }
    let text = read.replace(/\r\n/g, '\n')
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
    const tags = listed(front, 'tags')
    // Notion's asides are callouts; the little picture it starts them with is its icon, not content.
    text = text.replace(/<aside>\s*(?:<img [^>]*>\s*)?([\s\S]*?)\s*<\/aside>/g, (_, inside: string) =>
      `> [!note]\n${inside.trim().split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')}`)
    // %%comments%% are hidden in Obsidian, so they are left behind; code is
    // stepped over, where %% is just a printf's percent sign.
    text = text.split(/(^ {0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?\n {0,3}(?:`{3,}|~{3,})[ \t]*$|`[^`\n]+`)/m)
      .map((part, at) => (at % 2 ? part : part.replace(/%%[\s\S]*?%%[ \t]*/g, ''))).join('')
    // Line by line, to know when a picture sits in a table row.
    const lines: string[] = []
    for (const line of text.split('\n')) {
      // A table row, in a callout or not.
      const inTable = /^\s*(>\s*)*\|/.test(line)
      // ![[name.png|300]], by name anywhere in the vault or by path. Up to the
      // first ]] not followed by another, so a name holding a ] is whole; a
      // bar written \| in a table still splits off the width.
      let next = await swap(line, /!\[\[(.+?)\]\](?!\])/g, async (match) => {
        const [target, width] = match[1].split(/\\?\|/)
        // A note, or a part of one, is a link to it: that comes later.
        if (/#/.test(target) || /\.md$/i.test(target.trim()) || !/\.[a-z0-9]{1,12}$/i.test(target.trim())) return null
        const found = fileFor(path, target)
        const stored = found && (await keep(found))
        const name = target.trim().split('/').pop()!
        // Not in the vault: its name in words, rather than the syntax that pointed at it.
        if (!stored) return name
        return shown(stored, name, /^\d+(x\d+)?$/.test(width?.trim() ?? '') ? width.trim().split('x')[0] : undefined, inTable)
      })
      // ![][address]: a video by its address, the way some plugins embed one.
      next = next.replace(/!\[\]\[\]/g, '').replace(/!\[\]\[(https?:[^\]\s]+)\]/g, (_, href: string) => (/youtu\.?be/.test(href) ? `![](${href})` : `[${href}](${href})`))
      // ![](path) and [file](path) beside the note, written with %20 for spaces.
      next = await swap(next, /(!?)\[([^\]]*)\]\((?!https?:|mindflow:|#)([^)\s]+)\)/g, async (match) => {
        let local = match[3]
        try {
          local = decodeURIComponent(local)
        } catch {
          // Not encoded after all.
        }
        // A note is a link to it, which comes later; an address with no file at the end is left alone.
        if (/\.md$/i.test(local) || !/\.[a-z0-9]{1,12}$/i.test(local)) return null
        const found = fileFor(path, local)
        const stored = found && (await keep(found))
        if (!stored) return null
        return stored.image ? `![${match[2]}](${stored.url})` : shown(stored, match[2] || local.split('/').pop()!, undefined, inTable)
      })
      // <img src="..." width="40px">, as Notion writes them: a picture with its width.
      next = await swap(next, /<img\s[^>]*?src="([^"]+)"[^>]*?>/gi, async (match) => {
        const width = /width="(\d+)/i.exec(match[0])?.[1]
        let src = match[1]
        if (!/^https?:/.test(src)) {
          try {
            src = decodeURIComponent(src)
          } catch {
            // Not encoded after all.
          }
          const found = fileFor(path, src)
          const stored = found && (await keep(found))
          if (!stored) return ''
          src = stored.url
        }
        return `![${width ? `${inTable ? '\\|' : '|'}${width}` : ''}](${src})`
      })
      lines.push(next)
    }
    text = lines.join('\n')
    if (tags.length) text = `${text.trimEnd()}\n\n${tags.map((tag) => `#${tag.replace(/\s+/g, '-')}`).join(' ')}\n`
    const hidden = looksPrivate(relative(root, path))
    const one = importNote(relative(root, path), text, (await stat(path)).mtime, hidden)
    if (one === 'already here') already += 1
    else if (one === 'empty') empty += 1
    else {
      made.push(one)
      if (one.private) marked += 1
      byName.set(one.title.toLowerCase(), one.link)
      for (const alias of listed(front, 'aliases')) byName.set(alias.toLowerCase(), one.link)
    }
  }
  // A folder of pictures whose notes show none (none at all, or a stray
  // README): each picture is a note of its own, named after its file. In a
  // vault whose notes show pictures, the loose ones stay attachments.
  let showsPictures = false
  for (const path of notes)
    if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|heif|tiff?)\b/i.test(await readFile(path, 'utf8').catch(() => ''))) {
      showsPictures = true
      break
    }
  // iPhone and scanner pictures the windows cannot show: counted, and said in the report.
  let unshown = 0
  if (!showsPictures) {
    for (const path of everyFile) {
      const ending = path.split('.').pop()?.toLowerCase() ?? ''
      if (/^(heic|heif|tiff?)$/.test(ending)) unshown += 1
      if (!IMAGE[ending]) continue
      const stored = await keep(path)
      if (!stored) continue
      // Known by the picture's own bytes and name, not its place in this folder:
      // IMG_0001.jpg from two folders is two notes, the same one brought twice is one.
      const name = `pictures/${stored.url.split('/').pop()!.split('.')[0]}/${basename(path)}`
      if (alreadyImported(name)) {
        already += 1
        pictures -= 1
        continue
      }
      const one = importNote(name, shown(stored, basename(path), undefined, false), (await stat(path)).mtime, looksPrivate(relative(root, path)))
      if (one === 'already here') already += 1
      else if (one !== 'empty') made.push(one)
    }
  }
  const linked = linkImported(made, byName, known)
  const inbox = made.filter((one) => !one.link.startsWith('article:')).length
  const report = [
    `${num(made.length)} new ${made.length === 1 ? 'note' : 'notes'} from ${basename(root)}, with ${num(pictures)} pictures, ${num(attached)} files and ${num(linked)} links.`,
    // Where they went, said plainly: the Inbox, with time to sort it.
    inbox ? `${num(inbox)} ${inbox === 1 ? 'note is' : 'notes are'} in your Inbox to sort through; ${inbox === 1 ? "it won't" : "they won't"} count as rotting for 30 days.` : '',
    already ? `${num(already)} ${already === 1 ? 'was' : 'were'} already here, from an earlier import, and ${already === 1 ? 'was' : 'were'} left as ${already === 1 ? 'it was' : 'they were'}.` : '',
    empty ? `${num(empty)} empty ${empty === 1 ? 'file was' : 'files were'} skipped.` : '',
    unshown ? `${num(unshown)} ${unshown === 1 ? 'picture was' : 'pictures were'} skipped: HEIC and TIFF cannot be shown here yet. Export them as JPEG to bring them in.` : '',
    marked ? `${num(marked)} ${marked === 1 ? 'note came' : 'notes came'} in marked private: ${marked === 1 ? 'its name sounds' : 'their names sound'} like passwords or logins.` : '',
    kept.length ? `Left out because ${kept.length === 1 ? 'it looks' : 'they look'} like passwords or keys: ${kept.join(', ')}.` : '',
    unread.length ? `Left out because ${unread.length === 1 ? 'it could not be read as text' : 'they could not be read as text'}: ${unread.join(', ')}.` : ''
  ].filter(Boolean)
  if (quiet) return console.log(`imported ${made.length} new, ${already} already here, ${empty} empty, ${kept.length} left out, ${unshown} pictures of other types skipped, ${marked} marked private, ${pictures} pictures, ${attached} files, ${linked} links${kept.length ? ` [${kept.join(', ')}]` : ''}`)
  // Not waited on: the notes become documents while it is being read.
  void dialog.showMessageBox({ message: 'Imported', detail: report.join('\n\n') })
}

/**
 * Put a day's copy back. What you have now is copied first, beside the
 * backups, so a restore can itself be undone; then the app starts again on
 * the copy you chose.
 */
async function restore(): Promise<void> {
  // The sandbox would only restore itself, but a restore reads as a risk to your notes there.
  if (SANDBOX) return
  const { filePaths: [chosen] } = await dialog.showOpenDialog({
    title: 'Restore from a backup',
    defaultPath: join(backupDir(), 'database'),
    properties: ['openFile'],
    filters: [{ name: 'Vigil database', extensions: ['db'] }]
  })
  if (!chosen) return
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: `Go back to ${basename(chosen)}?`,
    detail: 'Everything changed since that copy will be replaced. What you have now is saved first, beside the backups, so this can be undone the same way.',
    buttons: ['Restore', 'Cancel'],
    defaultId: 1,
    cancelId: 1
  })
  if (response !== 0) return
  const live = join(app.getPath('userData'), 'mindflow.db')
  database().prepare('vacuum into ?').run(join(backupDir(), 'database', `before-restore-${Date.now()}.db`))
  database().close()
  await copyFile(chosen, live)
  for (const extra of ['-wal', '-shm']) await rm(`${live}${extra}`, { force: true })
  restartNow()
}

/**
 * Jottings from Markdown files - an inbox note, a file of jokes - as captures.
 * A file with "joke" or "bit" in its name gives bits; anything else, notes.
 * An HTML file is a bookmarks export, from Raindrop or a browser: links. A
 * CSV or JSON file, or Kindle's clippings, is highlights; any other text file
 * is Anki's plain-text export, cards to be tested on.
 */
async function importFiles(): Promise<void> {
  const { filePaths } = await dialog.showOpenDialog({
    title: SANDBOX ? 'Import into the sandbox' : 'Import',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown, bookmarks, highlights (Readwise, Kindle) or Anki cards', extensions: ['md', 'html', 'htm', 'csv', 'json', 'txt'] }]
  })
  const lines = []
  for (const path of filePaths) {
    const name = basename(path)
    // One file that cannot be read is said so, and the rest still come in.
    try {
      const text = await readFile(path, 'utf8')
      // A picture or a program renamed .md is not words to keep.
      if (text.includes('\u0000')) {
        lines.push(`${name}: skipped, it is not a text file`)
        continue
      }
      const added = /\.html?$/i.test(name)
        ? importBookmarks(name, text)
        : /\.(csv|json)$/i.test(name) || (/\.txt$/i.test(name) && text.includes('=========='))
          ? importHighlights(name, text)
          : /\.txt$/i.test(name)
            ? importAnki(text)
            : importMarkdown(name, text, /joke|bit/i.test(name) ? 'bit' : 'note')
      lines.push(`${name}: ${num(added)} new`)
    } catch (error) {
      lines.push(`${name}: could not be read (${/\.json$/i.test(name) ? 'it is not a list of highlights in JSON' : error instanceof Error ? error.message : String(error)})`)
    }
  }
  if (lines.length) await dialog.showMessageBox({ message: 'Imported', detail: lines.join('\n') })
}

/**
 * End the program.
 *
 * `app.quit()` on its own does nothing here: it works by closing every window,
 * and these windows are `closable: false` - which is half of what keeps a
 * tiling window manager off them. So they are made closable first, and only
 * then asked to go.
 */
let quitting = false
// However the app is told to quit (the menu bar, ⌘Q in any window, the
// system at log out, Ctrl+C in a terminal), every window may close first:
// stickies and the box have no close button, and a window that can't close
// keeps the app, and itself, on screen.
app.on('before-quit', () => {
  quitting = true
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.closable = true
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => quit())

function quit(): void {
  for (const win of BrowserWindow.getAllWindows()) win.closable = true
  app.quit()
}

/**
 * The menu bar icon.
 *
 * An accessory app has no Dock icon and no app switcher entry, so this is the
 * one place that says it is running, the way to stop it, and the way to the
 * main window. Held in a variable because a Tray that nothing
 * refers to is collected, and the icon vanishes a few seconds after launch.
 */
let tray: Tray | null = null

function createTray(): void {
  const image = nativeImage.createFromPath(icon).resize({ width: 18, height: 18 })
  // A template image is drawn in the menu bar's own colour, so it follows the
  // system between light and dark instead of being a small photograph.
  image.setTemplateImage(true)

  tray = new Tray(image)
  onHandOff(() => tray?.destroy())
  whereTray(() => (tray && !tray.isDestroyed() ? tray.getBounds() : null))
  updateTray()
  // Kept current without a window open: the count changes as the day goes on.
  setInterval(() => (updateTray(), beacons()), 30_000)
}

let tempusDrawn: { key: string; images: Electron.NativeImage[] } | null = null

/** Draw the four Tempus rows in the main window's page, then put them in the menu. */
async function drawTempus(key: string, rows: { label: string; share: number }[], dots: boolean, widest: string[]): Promise<void> {
  const page = home && !home.isDestroyed() && homePainted ? home.webContents : null
  if (!page) return
  const urls = (await page.executeJavaScript(`(${tempusRows.toString()})(${JSON.stringify([rows, dots, widest])})`).catch(() => null)) as string[] | null
  if (!urls?.length) return
  tempusDrawn = { key, images: urls.map((url) => {
    const image = nativeImage.createFromDataURL(url)
    image.setTemplateImage(true)
    return image
  }) }
  updateTray()
}

/**
 * Run in a page: each row as a PNG as wide as the menu's widest words, in the
 * menu's own font, black on clear so macOS can colour it as a template.
 */
function tempusRows([rows, dots, widest]: [{ label: string; share: number }[], boolean, string[]]): string[] {
  const scale = 2
  const font = '14px -apple-system, system-ui'
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const width = Math.ceil(Math.max(240, ...widest.map((words) => measure.measureText(words).width)))
  const height = 22
  return rows.map(({ label, share }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const pen = canvas.getContext('2d')!
    pen.scale(scale, scale)
    pen.font = font
    pen.textBaseline = 'middle'
    pen.fillStyle = '#000'
    pen.fillText(label, 0, height / 2)
    const said = `${Math.round(share * 100)}%`
    pen.textAlign = 'right'
    pen.fillText(said, width, height / 2)
    // The track runs from after the longest unit name to before the percent.
    const from = measure.measureText('Month').width + 14
    const to = width - measure.measureText('100%').width - 14
    if (dots) {
      const count = Math.max(8, Math.floor((to - from) / 11))
      const lit = Math.round(share * count)
      const step = (to - from) / count
      for (let n = 0; n < count; n++) {
        const x = from + step * n + step / 2
        pen.beginPath()
        pen.arc(x, height / 2, 3.6, 0, Math.PI * 2)
        if (n < lit) {
          pen.globalAlpha = 1
          pen.fill()
        } else {
          pen.globalAlpha = 0.55
          pen.lineWidth = 1.2
          pen.stroke()
        }
      }
    } else {
      const bar = (end: number, alpha: number): void => {
        pen.globalAlpha = alpha
        pen.beginPath()
        pen.roundRect(from, height / 2 - 3, Math.max(6, end - from), 6, 3)
        pen.fill()
      }
      bar(to, 0.28)
      if (share > 0) bar(from + (to - from) * share, 1)
    }
    pen.globalAlpha = 1
    return canvas.toDataURL('image/png')
  })
}

/**
 * A bar for the menu, 80 by 6 points, drawn as a template image so macOS
 * colours it to suit a light or dark menu: the part gone solid, the rest faint.
 */
function tempusBar(share: number): Electron.NativeImage {
  const scale = 2
  const [width, height] = [80 * scale, 6 * scale]
  const radius = height / 2
  const filled = Math.round(Math.min(1, Math.max(0, share)) * width)
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Rounded ends: how far a pixel's centre is inside the capsule, as cover.
      const cx = Math.min(Math.max(x + 0.5, radius), width - radius)
      const inside = radius - Math.hypot(x + 0.5 - cx, y + 0.5 - radius)
      const cover = Math.min(1, Math.max(0, inside + 0.5))
      const alpha = Math.round(cover * (x < filled ? 255 : 70))
      pixels.writeUInt32LE(alpha << 24 >>> 0, (y * width + x) * 4)
    }
  }
  const image = nativeImage.createFromBitmap(pixels, { width, height, scaleFactor: scale })
  image.setTemplateImage(true)
  return image
}

/**
 * The menu bar: how many reviews are due beside the icon, and "Safe" while
 * safe mode is on, so a quiet app is never mistaken for a broken one. The menu
 * carries the toggle, for when no window is open to reach it from.
 */
function updateTray(): void {
  if (!tray) return
  const { due, tasks, safe } = badge()
  // A running session shows its minutes, so the menu bar says what you are on.
  const session = activeSession()
  const minutes = session ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000) : 0
  // The nearest open goal leads, short so the menu bar stays narrow: "14 Dec · 68d".
  // Its day, never its name: the menu bar is on every shared screen.
  const goals = openGoals()
  const next = goals.find((goal) => daysLeft(goal.goalAt) >= 0)
  const nextSaid = next ? `${dayMonth(`${next.goalAt}T12:00`)} · ${daysLeft(next.goalAt) ? `${daysLeft(next.goalAt)}d` : 'today'}` : ''
  // Words beside each number, so the menu bar says what it counts: a bare "2 · 1" meant nothing.
  tray.setTitle([SANDBOX ? 'Sandbox' : '', nextSaid, session ? `● ${minutes}m` : '', tasks ? `${tasks} due` : '', due ? `${due} to review` : '', safe ? 'Safe' : ''].filter(Boolean).join(' · '), { fontType: 'monospacedDigit' })
  tray.setToolTip(`${SANDBOX ? 'Vigil sandbox' : 'Vigil'}${tasks ? ` · ${tasks} task${tasks === 1 ? '' : 's'} due now` : ''}${due ? ` · ${due} to review` : ''}${safe ? ' · safe mode on' : ''}`)
  // Tempus: how far through the day, week, month and year, each a drawn bar
  // of one width, so the four line up whatever their words.
  const time = tempus()
  const hidden = safe || gate().hidePrivate
  const goalItems: Electron.MenuItemConstructorOptions[] = goals.slice(0, 6).map((goal) => {
    const left = daysLeft(goal.goalAt)
    const name = goal.private && hidden ? 'A private goal' : goal.title.length > 40 ? `${goal.title.slice(0, 40)}…` : goal.title
    const when = left < 0 ? 'did you make it?' : left === 0 ? 'today' : `${num(left)} ${left === 1 ? 'day' : 'days'} left`
    return { label: `${name}  ·  ${when}  ·  ${percent(wayThrough(goal.goalFrom, goal.goalAt))} of the way`, click: () => sendHome('goal', goal.id) }
  })
  // Each row as one picture the menu's width: the unit at the left, the bar or
  // dots across, the percent at the right edge. Drawn by a page, since the
  // main process cannot set text; until it is, the plain bar stands in.
  const rows = (['day', 'week', 'month', 'year'] as const).map((unit) => ({ label: `${unit[0].toUpperCase()}${unit.slice(1)}`, share: Math.round(time[unit] * 100) / 100 }))
  const widest = [...goalItems.map((item) => item.label ?? ''), 'Import an Obsidian vault or Notion export…']
  const tempusKey = JSON.stringify([rows, tempusDots(), widest])
  if (tempusDrawn?.key !== tempusKey) void drawTempus(tempusKey, rows, tempusDots(), widest)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(goalItems.length ? [{ label: 'Goals', enabled: false }, ...goalItems, { type: 'separator' } as const] : []),
      ...(['day', 'week', 'month', 'year'] as const).map((unit, at) => {
        const drawn = tempusDrawn?.key === tempusKey ? tempusDrawn.images[at] : null
        return drawn ? { label: '', icon: drawn, enabled: false } : { label: `${percent(time[unit])} of the ${unit}`, icon: tempusBar(time[unit]), enabled: false }
      }),
      { type: 'separator' },
      // In the sandbox the way out comes first; from your notes, the way in.
      ...(SANDBOX ? [{ label: 'Back to my notes', click: () => relaunch('real') }, { label: 'Reset the sandbox', click: () => relaunch('sandbox', true) }, { type: 'separator' } as const] : []),
      { label: 'Show Vigil', accelerator: SUMMON, click: () => toggleWindow() },
      { label: 'Open the main window', click: openHome },
      { label: 'Import…', click: () => void importFiles() },
      { label: 'Import an Obsidian vault or Notion export…', click: () => void importVault() },
      ...(SANDBOX ? [] : [{ label: 'Restore from a backup…', click: () => void restore() }, { label: 'Open the sandbox', click: openSandbox }]),
      { type: 'separator' },
      { label: 'Safe mode', type: 'checkbox', checked: safe, click: () => (toggleSafeMode(), updateTray()) },
      { label: 'Show sticky notes', type: 'checkbox', checked: stickyPrefs().shown, click: () => showStickies() },
      { label: 'Bring sticky notes here', enabled: !safe && stickies.size > 0, click: () => gatherStickies() },
      { type: 'separator' },
      { label: 'Quit Vigil', accelerator: 'Command+Q', click: quit }
    ])
  )
}

app.whenReady().then(() => {
  // YouTube will not play an embed that comes from no page at all (its
  // "Error 153"), and Vigil's pages are files. Say where it is shown from.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/embed/*'] }, (details, done) =>
    done({ requestHeaders: { ...details.requestHeaders, Referer: 'https://vigil.app/' } }))
  registerCaptures()
  registerImportConversion()
  registerVigil()
  registerSandbox()
  atLogin()
  registerHome()
  registerNotes({ load, guard })
  registerPeriods()
  registerIssues()
  registerScenery()
  registerCelebrations()
  registerOnboarding()
  registerUnused()
  registerObsidian()
  const first = fromCli(process.argv)
  if (first) captureText(first)
  createTray()

  // Serve the asset store. The pathname is the only thing trusted: anything
  // with a separator in it is refused, so a crafted src cannot walk the disk.
  protocol.handle('mindflow', async (request) => {
    // A standard scheme parses `mindflow://assets/x.png` as host `assets` and
    // path `/x.png`, so the store name is the host, not part of the path.
    const { host, pathname } = new URL(request.url)
    const name = pathname.replace(/^\/+/, '')

    // Scenery's smaller copies, named the same careful way.
    if (host === 'scenery') {
      if (!/^[a-f0-9]{32}(-s)?\.(jpg|png)$/.test(name)) return new Response('not found', { status: 404 })
      try {
        return await net.fetch(pathToFileURL(join(sceneryDir(), name)).toString())
      } catch {
        return new Response('not found', { status: 404 })
      }
    }

    // Celebrations, read straight from the chosen folder so a GIF keeps moving.
    // Only a name handed out for a file found in that folder is served.
    if (host === 'celebrate') {
      const path = /^[a-f0-9]{32}\.(gif|png|jpe?g|webp|svg|mp4|mov|webm)$/.test(name) ? celebrationFile(name) : null
      if (!path) return new Response('not found', { status: 404 })
      try {
        // An SVG is only ever shown in an <img>, which runs none of its
        // scripts; it is said to be one, and opened on its own it may run
        // nothing and load nothing either.
        if (name.endsWith('.svg')) {
          return new Response(await readFile(path), { headers: { 'content-type': 'image/svg+xml', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'x-content-type-options': 'nosniff' } })
        }
        // The range asked for is passed on, so a clip can loop and seek.
        const range = request.headers.get('range')
        return await net.fetch(pathToFileURL(path).toString(), range ? { headers: { range } } : undefined)
      } catch {
        return new Response('not found', { status: 404 })
      }
    }

    // Only a bare hash and extension. Anything with a separator in it, or any
    // attempt to walk out of the store, fails this and is refused.
    if (host !== 'assets' || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) {
      return new Response('not found', { status: 404 })
    }
    try {
      // Awaited inside the try: a missing asset rejects, and letting that
      // escape prints a stack instead of the 404 the line above returns.
      return await net.fetch(pathToFileURL(join(assetsDir(), name)).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  // Save bytes dropped or pasted into the editor, and hand back the URL that
  // reads them again.
  ipcMain.on('drawing:open', (event, id: unknown, scene: unknown) => {
    if (typeof id === 'string') openDrawing(id, scene, event.sender)
  })

  /** What the drawing window asks for once it is ready to be told. */
  ipcMain.handle('drawing:scene', (_event, id: unknown) =>
    typeof id === 'string' ? (drawings.get(id)?.scene ?? null) : null
  )

  /** And what it sends back, which the note writes down. */
  ipcMain.on('drawing:change', (_event, id: unknown, scene: unknown) => {
    if (typeof id !== 'string') return
    const open = drawings.get(id)
    if (!open || open.note.isDestroyed()) return
    open.scene = scene
    open.note.send('drawing:changed', id, scene)
  })

  // The main window's "new" button: the same prompt the key brings up.
  ipcMain.on('prompt:show', () => toggleWindow())
  // The first-run step and Settings import the way the menu bar does.
  ipcMain.handle('import:run', (_event, what: unknown) => (what === 'vault' ? importVault() : importFiles()))
  ipcMain.handle('backup:restore', () => restore())
  // The app's theme decides the frosting behind every window, not the system's.
  ipcMain.on('appearance', (_event, mode: string) => void (nativeTheme.themeSource = mode === 'light' ? 'light' : 'dark'))
  // The prompt sends you to one thing in the main window: a task's notes and
  // sessions live there. Kept until the window asks, in case it is still
  // starting; sent at once if it is already up.
  ipcMain.on('home:open', (_event, type: string, id: string, heading?: string) => sendHome(type, id, heading))
  ipcMain.handle('home:sent', () => {
    homeAsked = true
    const was = sentTo
    sentTo = null
    return was
  })

  // Put the window away without closing it, so it comes back as it was.
  ipcMain.on('window:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) hideWindow(win)
  })

  // The side panel, asked for. Centred (the default in Settings), the window
  // grows about its middle, so the box stays centred where it was; otherwise
  // it grows to the right and the writing stays exactly where the eye is.
  // Either way the screen's edge pushes it back on, and closing puts it back
  // exactly where it was before, unless it was moved in between.
  // Resolves once the glide lands: the page keeps the panel drawn until then,
  // so closing slides it away rather than leaving an empty strip.
  ipcMain.handle('window:panel', async (event, open: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    panelOpen = Boolean(open)
    const bounds = boundsOf(win)
    const width = open ? WITH_PANEL : WIDTH
    // Wide already: only the height may be owed (the box opened short).
    if (width === bounds.width) return (await refit(win), Boolean(open))
    const back = !open && panelFrom && panelFrom.became === bounds.x ? panelFrom.x : undefined
    const x = back ?? (boxPlacement().centred ? Math.round(bounds.x - (width - bounds.width) / 2) : bounds.x)
    // Wider and to its full height (or back to what the writing needs) in
    // the one glide, both at once, so it reads as one move.
    const next = anchored(win, x, width, boxHeight())
    panelFrom = open ? { x: bounds.x, became: next.x } : null
    await reshape(win, next)
    return Boolean(open)
  })

  // Seen by screen recorders and shares, or kept out of them (the default).
  ipcMain.on('focus:show', (_event, on: unknown) => showFocus(Boolean(on)))
  // The end of a session or timer, said around the edge of the screen.
  ipcMain.on('glow', (_event, tone: unknown) => showGlow(tone === 'cancel' ? 'cancel' : 'done'))
  ipcMain.handle('glow:waiting', () => {
    const was = glowWaiting
    glowWaiting = null
    return was
  })
  // A note stuck to the desktop, or taken down.
  ipcMain.on('stickies:gather', () => gatherStickies())
  ipcMain.on('sticky', (_event, type: unknown, id: unknown, on: unknown) => {
    if (typeof type === 'string' && typeof id === 'string') stick(type, id, Boolean(on))
  })
  // Beacons once the stickies are back, then as goals change, and at their moments.
  registerFrost()
  void restoreStickies().then(beacons)
  whenGoals(() => (beacons(), updateTray()))
  powerMonitor.on('unlock-screen', () => beaconMoment('wake'))
  powerMonitor.on('resume', () => beaconMoment('wake'))
  // At the Mac (touched in the last two minutes) and three hours since the last: out again.
  setInterval(() => {
    if (powerMonitor.getSystemIdleTime() < 120 && Date.now() - lastAppear >= 3 * 3600_000) beaconMoment('active')
  }, 5 * 60_000)
  // Pointed at, a beacon stays; let go, it tucks a minute later. Its own X
  // tucks it: till its next moment, or for an always one, till tomorrow.
  ipcMain.on('beacon:hold', (event, on: unknown) => {
    const key = [...stickies].find(([, win]) => win.webContents === event.sender)?.[0]
    if (!key) return
    if (on) beaconHeld.add(key)
    else (beaconHeld.delete(key), beaconModes.get(key) === 'sometimes' && tuckLater(key))
  })
  ipcMain.on('beacon:tuck', (event) => {
    const key = [...stickies].find(([, win]) => win.webContents === event.sender)?.[0]
    if (!key) return
    beaconHeld.delete(key)
    tucked.set(key, beaconModes.get(key) === 'sometimes' ? Infinity : new Date().setHours(24, 0, 0, 0))
    applyStickies()
  })
  // Shown again, every sticky comes back, those put away on their own too. A quiet
  // sound whichever way it went, from the window in front if it is Vigil's, else the box: never a sticky being hidden.
  let stickiesShown = stickyPrefs().shown
  whenStickies(() => {
    const { shown } = stickyPrefs()
    if (shown && stuck.some((one) => one.hidden)) stuck.forEach((one) => delete one.hidden), keepStuck()
    const front = BrowserWindow.getFocusedWindow()
    const voice = front && ![...stickies.values()].includes(front) ? front : prompt
    if (shown !== stickiesShown && voice && !voice.isDestroyed()) voice.webContents.send('stickies:shown', shown)
    stickiesShown = shown
    applyStickies()
    updateTray()
  })
  // "Hide this one", from its own hover controls.
  ipcMain.on('sticky:hide', (_event, type: unknown, id: unknown) => {
    const key = `${type}:${id}`
    const one = stuckAs(key)
    if (!one) return
    one.hidden = true
    keepStuck()
    stickies.get(key)?.hide()
  })
  // Its corner grip: the window is not resizable (see stick), so the size is set here, no smaller than its least.
  ipcMain.on('sticky:resize', (event, width: unknown, height: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const key = [...stickies].find(([, one]) => one === win)?.[0]
    if (!win || !key || typeof width !== 'number' || typeof height !== 'number') return
    win.setBounds({ ...win.getBounds(), ...stickySize(width, height, win.getBounds()) })
    const one = stuckAs(key)
    if (one) (one.bounds = win.getBounds()), keepStuck()
  })
  // A sticky's picture in Vigil's own Quick Look: a see-through window over the
  // sticky's screen, there only while it is looked at. The window asks for what
  // it shows, the note's pictures with each one's place given in its own terms.
  type Rect = { x: number; y: number; width: number; height: number }
  type Shown = { src: string; width: number; height: number; caption: string; rect?: Rect }
  const looks = new Map<number, { pictures: Shown[]; at: number }>()
  const lookDone = new Map<number, () => void>()
  ipcMain.on('look', (event, pictures: unknown, at: unknown) => {
    const sticky = BrowserWindow.fromWebContents(event.sender)
    if (!sticky || !Array.isArray(pictures) || !pictures.length || typeof at !== 'number') return
    const { workArea } = screen.getDisplayMatching(sticky.getBounds())
    const win = new BrowserWindow({
      ...workArea,
      // As a sticky is: named for AeroSpace's floating rule, with no window
      // buttons at all, so it is never tiled or filed under one workspace.
      title: 'Vigil',
      closable: false,
      resizable: false,
      movable: false,
      frame: false,
      transparent: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      // Blurring on, the desktop behind goes soft, as a note's page does behind
      // the viewer in a window; the page's own dim lies over it either way.
      ...(blurOn() ? { vibrancy: 'fullscreen-ui' as const, visualEffectState: 'active' as const } : {}),
      show: false,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
    })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    shield(win)
    guard(win)
    const shown = (pictures as Shown[]).map((one) => ({
      src: String(one.src),
      width: Number(one.width),
      height: Number(one.height),
      caption: String(one.caption ?? ''),
      rect: one.rect && { ...one.rect, x: one.rect.x - workArea.x, y: one.rect.y - workArea.y }
    }))
    const id = win.webContents.id
    looks.set(id, { pictures: shown, at })
    // Put away (Escape, a click, or the window left for another app): the
    // sticky shows its picture again, and has the keys back if it had them.
    // The desktop's blur is the window's, not the page's, so it can't fade
    // with the dim: the whole window fades out over ~70ms instead of the
    // blur vanishing in one frame.
    const done = (): void => {
      if (win.isDestroyed()) return
      const refocus = win.isFocused()
      const finish = (): void => {
        if (win.isDestroyed()) return
        win.destroy()
        if (!sticky.isDestroyed() && refocus) sticky.focus()
      }
      if (!motionOn()) return finish()
      let step = 0
      const fade = setInterval(() => {
        step += 1
        if (win.isDestroyed() || step >= 5) return (clearInterval(fade), finish())
        win.setOpacity(1 - step / 5)
      }, 14)
    }
    lookDone.set(id, done)
    win.on('closed', () => {
      looks.delete(id)
      lookDone.delete(id)
      if (!sticky.isDestroyed()) sticky.webContents.send('look:over')
    })
    win.once('ready-to-show', () => (win.show(), win.focus()))
    load(win, '?view=look')
  })
  ipcMain.handle('look:what', (event) => looks.get(event.sender.id) ?? null)
  ipcMain.on('look:done', (event) => lookDone.get(event.sender.id)?.())

  ipcMain.handle('window:recordable', (_event, on: unknown) => {
    recordable = Boolean(on)
    for (const win of BrowserWindow.getAllWindows()) win.setContentProtection(!recordable)
    applyStickies()
    return recordable
  })
  whenSafeMode((on) => {
    safeWindows(on)
    updateTray()
  })

  // The main window fills the screen, or goes back to where it was: the
  // window's own maximize, which remembers the size and place it came from.
  ipcMain.handle('home:fill', (event, fill: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const on = fill === 'toggle' ? !win.isMaximized() : Boolean(fill)
    if (on) win.maximize()
    else win.unmaximize()
    return on
  })

  ipcMain.handle('window:expand', (event, expanded: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    expandedNow = Boolean(expanded)
    // No `setResizable` dance around this: `setBounds` is honoured on a window
    // that is not resizable, and toggling the flag rebuilds the title bar -
    // which is the traffic lights appearing for a moment in the wrong place
    // halfway through the resize.
    //
    // Down from its top edge, so the first line stays where the eye is, and
    // back up to what the writing needs; near the bottom of the screen it
    // grows up just enough instead. One glide, like the panel.
    void refit(win)
    return expandedNow
  })

  // What the writing needs, measured by the page: the box grows down to it,
  // or comes back up, in the same glide. The panel and the expander keep
  // their full height whatever it says.
  // A pop-up waiting for room asks for it at once (snap): see fit-box.
  ipcMain.on('window:fit', (event, height: unknown, snap: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || typeof height !== 'number' || !Number.isFinite(height)) return
    fit = height
    void refit(win, snap === true)
  })

  ipcMain.handle('save-image', (_event, mime: unknown, bytes: unknown) =>
    typeof mime === 'string' && bytes instanceof Uint8Array ? storeImage(mime, bytes) : '')
  async function storeImage(mime: string, bytes: Uint8Array): Promise<string> {

    const extension = EXTENSIONS[mime]
    if (!extension) return ''
    if (!bytes.byteLength) return ''

    const hash = createHash('sha256').update(bytes).digest('hex')
    const destination = join(assetsDir(), `${hash}.${extension}`)

    await mkdir(assetsDir(), { recursive: true })
    // Same bytes, same file, so writing it again is harmless - but writing it
    // in place truncates the copy the open document is already showing. Write
    // beside it and rename, which is atomic, and whose temporary name cannot
    // pass the guard above while it is half written.
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, destination)

    return `mindflow://assets/${hash}.${extension}`
  }

  // The same store, for files that are not pictures. The extension is taken
  // from the name rather than a mime type, because a dropped file carries no
  // trustworthy one, and anything unrecognised is stored as .bin.
  ipcMain.handle('save-file', async (_event, name: unknown, bytes: unknown) => {
    if (typeof name !== 'string' || !(bytes instanceof Uint8Array)) return ''
    if (!bytes.byteLength) return ''

    const extension = (name.split('.').pop() ?? '').toLowerCase()
    const suffix = /^[a-z0-9]{1,12}$/.test(extension) ? extension : 'bin'
    const hash = createHash('sha256').update(bytes).digest('hex')
    const destination = join(assetsDir(), `${hash}.${suffix}`)

    await mkdir(assetsDir(), { recursive: true })
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, destination)

    return `mindflow://assets/${hash}.${suffix}`
  })

  // Write text the renderer produced to a file the user picks: JSON, markdown
  // or HTML. The renderer does the converting; this only puts bytes on disk.
  ipcMain.handle('export-text', async (_event, name: unknown, text: unknown) => {
    if (typeof name !== 'string' || typeof text !== 'string') return false

    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name })
    if (canceled || !filePath) return false

    await writeFile(filePath, text, 'utf8')
    return true
  })

  // A PDF, laid out by the same engine that drew the document on screen. An
  // offscreen window rather than the real one, so printing cannot disturb what
  // is on the page, and a small sheet because the editor's own styles are not
  // loaded in it.
  ipcMain.handle('export-pdf', async (_event, name: unknown, html: unknown) => {
    if (typeof name !== 'string' || typeof html !== 'string') return false

    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name })
    if (canceled || !filePath) return false

    const sheet = `body{font:14px/1.6 -apple-system,system-ui,sans-serif;margin:0;color:#111}
      img{max-width:100%}pre{background:#f4f4f5;padding:.75em;border-radius:6px;overflow:auto}
      blockquote{margin:0 0 0 1em;padding-left:1em;border-left:3px solid #ddd;color:#555}
      table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.35em .6em}`

    const printer = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    try {
      await printer.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<meta charset="utf-8"><style>${sheet}</style>${html}`
        )}`
      )
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
      })
      await writeFile(filePath, pdf)
      return true
    } finally {
      printer.destroy()
    }
  })

  // Copy a stored file somewhere the user picks. The store names everything by
  // its hash, so the original name has to be handed back in for the dialog.
  ipcMain.handle('save-file-as', async (_event, src: unknown, name: unknown) => {
    const stored = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(stored)) return false

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: typeof name === 'string' && name ? name : stored
    })
    if (canceled || !filePath) return false

    await copyFile(join(assetsDir(), stored), filePath)
    return true
  })

  // Hand a stored file to whatever the system opens it with.
  ipcMain.handle('open-file', async (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return false

    const problem = await shell.openPath(join(assetsDir(), name))
    return problem === ''
  })

  // The stored file, picked out in a Finder window.
  ipcMain.handle('show-file', (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return false
    shell.showItemInFolder(join(assetsDir(), name))
    return true
  })

  // Put a stored image on the system clipboard, so it can be pasted into any
  // app rather than only back into this one. Done here because the renderer
  // cannot read the store: its own content policy forbids fetching a custom
  // scheme, and the file is not reachable any other way.
  ipcMain.handle('copy-image', async (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    const extension = name.split('.').pop()
    const mime = Object.keys(EXTENSIONS).find((type) => EXTENSIONS[type] === extension)
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name) || !mime) return false

    // As a PNG, the picture type every app pastes (WhatsApp, Messages, Slack,
    // Preview); a GIF or WebP written as itself went on the clipboard under a
    // type most apps never ask for, so nothing pasted. A GIF gives its first
    // frame; anything the system can't draw goes as its own type.
    const path = join(assetsDir(), name)
    try {
      let image = nativeImage.createFromPath(path)
      // The system's own reader takes what nativeImage can't (a GIF, a HEIC):
      // the picture at full size, its first frame for a GIF.
      if (image.isEmpty()) image = await nativeImage.createThumbnailFromPath(path, { width: 4096, height: 4096 }).catch(() => image)
      if (!image.isEmpty()) {
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
        return true
      }
      const bytes = await readFile(path)
      await clipboard.write([new ClipboardItem({ [mime]: new Blob([bytes], { type: mime }) })])
      return true
    } catch {
      return false
    }
  })

  // An image dragged or copied from a web page arrives as a link. Fetching it
  // here rather than in the renderer, which its own content policy forbids,
  // is what lets the note keep a copy instead of a remote dependency.
  ipcMain.handle('fetch-image', async (_event, href: unknown) => {
    if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return null

    try {
      const response = await fetchOutside(href, { signal: AbortSignal.timeout(8000) })
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim()
      if (!response.ok || !EXTENSIONS[mime]) return null

      const bytes = new Uint8Array(await response.arrayBuffer())
      return bytes.byteLength ? { mime, bytes } : null
    } catch {
      return null
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    // Without this the toolkit blocks Cmd+- outright, so zooming only works
    // one way. See @electron-toolkit/utils watchWindowShortcuts.
    optimizer.watchWindowShortcuts(window, { zoom: true })
  })

  // Link previews are fetched here: the renderer cannot, being subject to CORS
  // and its own content policy.
  const lookUp = async (url: unknown): Promise<{ href: string; title: string; description: string; image: string; icon: string; site: string }> => {
    const empty = { href: '', title: '', description: '', image: '', icon: '', site: '' }
    if (typeof url !== 'string') return empty

    const target = URL.parse(url)
    if (!target || !['http:', 'https:'].includes(target.protocol)) return empty

    const fallback = {
      ...empty,
      href: target.href,
      title: target.href,
      icon: new URL('/favicon.ico', target.origin).href,
      site: target.hostname
    }

    // YouTube builds its page in the browser, so the HTML that arrives holds
    // an empty title and no og:image: a card made from it comes out blank.
    // Its oEmbed endpoint needs no key and answers with both. The page does
    // not advertise the endpoint, so there is nothing to discover and the
    // address has to be named.
    //
    // oEmbed carries no description. The channel is the next most useful thing
    // to put under a video's title, and it is the one field that is there.
    const fromOembed = async (): Promise<{ title: string; description: string; image: string } | null> => {
      if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(target.hostname)) return null
      try {
        const response = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(target.href)}&format=json`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!response.ok) return null

        const data: unknown = await response.json()
        const field = (name: string): string => {
          const value = (data as Record<string, unknown>)?.[name]
          return typeof value === 'string' ? value : ''
        }
        return { title: field('title'), description: field('author_name'), image: field('thumbnail_url') }
      } catch {
        return null
      }
    }

    try {
      // Never somewhere on this machine or its network, however it redirects.
      const response = await fetchOutside(target, {
        headers: { 'user-agent': app.userAgentFallback },
        signal: AbortSignal.timeout(8000)
      })
      // Only read the body once it is known to be a page of a sane size -
      // otherwise a link to a video or an archive is downloaded in full to
      // find no tags.
      if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) {
        return fallback
      }
      if (Number(response.headers.get('content-length')) > 1_500_000) return fallback

      const html = await response.text()
      // Redirects are followed, so relative URLs belong to wherever we landed.
      const base = new URL(response.url || target.href)

      const decode = (text: string): string =>
        text
          .replace(/&quot;/g, '"')
          .replace(/&#0?39;|&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          // Last, so that an escaped entity such as `&amp;lt;` stays text.
          .replace(/&amp;/g, '&')
          .trim()

      // Match the whole tag, then pull the value with the quote character
      // back-referenced: one pattern covers either attribute order, and a
      // value is free to contain the other kind of quote. Quoted runs are
      // skipped whole, so a `>` inside a value does not end the tag, and the
      // name has to start an attribute - `content` must not match
      // `data-content`.
      // The `[^>"']` is load-bearing: allowing quotes in the last branch makes
      // the alternation ambiguous, and a page can then hang this process for
      // minutes on a few dozen bytes of quotes.
      const TAG_BODY = `(?:"[^"]*"|'[^']*'|[^>"'])*`

      const attr = (tag: string | undefined, name: string): string =>
        decode(
          tag?.match(new RegExp(`[\\s"'/]${name}\\s*=\\s*(["'])([^]*?)\\1`, 'i'))?.[2] ?? ''
        )

      const meta = (property: string): string =>
        attr(
          html.match(
            new RegExp(
              `<meta${TAG_BODY}(?:property|name)=["']${property}["']${TAG_BODY}>`,
              'i'
            )
          )?.[0],
          'content'
        )

      const resolve = (value: string): string =>
        value ? (URL.parse(value, base)?.href ?? '') : ''

      const scraped = {
        href: target.href,
        title:
          meta('og:title') ||
          decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '') ||
          target.href,
        description: meta('og:description'),
        image: resolve(meta('og:image')),
        icon:
          resolve(
            attr(
              html.match(new RegExp(`<link${TAG_BODY}rel=["'][^"']*icon[^"']*["']${TAG_BODY}>`, 'i'))?.[0],
              'href'
            )
          ) ||
          new URL('/favicon.ico', base).href,
        site: meta('og:site_name') || base.hostname
      }

      // Only where the page left a gap, so a site that does answer properly
      // keeps its own words.
      const extra = await fromOembed()
      if (!extra) return scraped
      return {
        ...scraped,
        title: extra.title || scraped.title,
        description: scraped.description || extra.description,
        image: scraped.image || extra.image
      }
    } catch {
      // The page may be unreachable while oEmbed still answers.
      const extra = await fromOembed()
      return extra
        ? { ...fallback, title: extra.title || fallback.title, description: extra.description, image: extra.image }
        : fallback
    }
  }
  // A card's picture and icon are kept with your notes, not fetched each time
  // from the site: offline, or after the site changes, the card still looks
  // as it did. Either one that cannot be fetched stays a link to the site.
  const keep = async (src: string): Promise<string> => {
    if (!/^https?:/.test(src)) return src
    // A picture on this machine or its network is not one to show, either.
    if (!(await isOutside(new URL(src)).catch(() => false))) return ''
    try {
      const response = await fetchOutside(src, { signal: AbortSignal.timeout(8000) })
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim()
      return (response.ok && (await storeImage(mime, new Uint8Array(await response.arrayBuffer())))) || src
    } catch {
      return src
    }
  }
  ipcMain.handle('fetch-link-metadata', async (_event, url: unknown) => {
    const found = await lookUp(url)
    const [image, icon] = await Promise.all([keep(found.image), keep(found.icon)])
    return { ...found, image, icon }
  })

  createWindow()
  // The QA harness imports a test vault without the folder dialog.
  if (process.env.MINDFLOW_QA_VAULT) void importVault(process.env.MINDFLOW_QA_VAULT)
  // The main window, made in the background once the prompt is up. A brand-new
  // Vigil opens it at once instead, in front, for the welcome: an accessory app
  // has no Dock icon, so nothing else would say it had started.
  // Arriving in or back from the sandbox, the main window opens too: that is where you were.
  if (firstRun() || process.argv.includes('--show-home')) openHome()
  else setTimeout(makeHome, 1500)

  /**
   * The key that summons it from anywhere, and puts it away again.
   *
   * A scratch space you have to go and find is not a scratch space: the whole
   * point is that the thought arrives while you are somewhere else. Hidden
   * rather than closed, so the window comes back exactly as you left it.
   *
   * Registering can fail - another app may already hold the chord - and it
   * fails quietly, so it says so rather than leaving you pressing a dead key.
   */
  // Safe mode from anywhere, before a screen share, with no window to open:
  // the menu bar says it took. Both keys can be changed in Settings, so they
  // are taken again whenever the keys change.
  const anywhere = (keys: Record<string, string | null>): void => {
    globalShortcut.unregisterAll()
    const take = (made: string, run: () => void): void => {
      const now = made in keys ? keys[made] : made
      const chord = accelerator(now)
      // Told to the welcome, which offers another key when the one it teaches is taken.
      const ok = !!chord && !pretendTaken(now) && globalShortcut.register(chord, run)
      if (chord && !ok) console.error(`Could not register ${chord}: something else already has it`)
      noteChord(made, now, ok)
    }
    take('⌘.', toggleWindow)
    take('⌥⌘S', () => (toggleSafeMode(), updateTray()))
    take('⌃⌥⌘N', () => showStickies())
  }
  anywhere(whenKeys(anywhere))

  app.on('activate', function() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// A global shortcut outlives the window, so it has to be handed back or it
// stays registered against a process that is gone.
app.on('will-quit', () => globalShortcut.unregisterAll())

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
