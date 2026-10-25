import { ANCHOR } from './tagline'
import { registerMacCalendar } from './mac-calendar'
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
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { catchFreezes } from './freeze-catch'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative } from 'path'
import { uptime } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
// The mark alone, black on clear at twice the menu bar's 18 points, for its template image.
import trayIcon from '../../resources/tray.png?asset'
import iconBronze from '../../resources/icon-bronze.png?asset'
import iconGold from '../../resources/icon-gold.png?asset'
import { registerUsage, type Via } from './usage'
import { alreadyImported, captureText, changed, rescueDrawing, database, shutDatabase, importAnki, importBookmarks, importHighlights, importMarkdown, importNote, linkImported, recordOpen, registerCaptures, registerImportConversion, setImporting, type Imported } from './captures'
import { isPrivateFile, looksPrivate } from './import'
import { warmChrono } from './lazy/chrono'
import { warmEmoji } from './lazy/emoji'
import { backupBase, backupDir } from './backup'
import { pageFor } from './pages'
import { activeSession, extendRunning, whenNudge, atLogin, badge, beaconDefault, tuckRules, tempusDots, blurOn, boxAutoHide, boxPlacement, gate, motionOn, stickyGlass, stickyStir, openGoals, registerHome, registerHaligtree, showStickies, stickyPrefs, stickyTuck, tuckStickies, toggleSafeMode, whenKeys, whenRecordings, whenIcon, appIcon, recordingPrefs, type Recordings, whenSafeMode, whenGoals, whenStickies, focusBubbleShown, focusToolsOn, whenFocusShows, pillInNotch, sleepChoice } from './haligtree'
import { daysLeft, percent, tempus, wayThrough } from './goal-days'
import { PEEK_OUT_MS, peeksOut, restNow, type Rest } from './goal-tuck'
import { tap, taps } from './haptic'
import { fetchOutside, isOutside } from './outside'
import { registerNotes } from './notes'
import { registerGroups } from './groups'
import { registerPeriods } from './periods'
import { nextMilestones, registerMilestones } from './milestones'
import { registerEvents } from './events'
import { registerReadingQueue } from './reading-queue'
import { registerPractices, whenPracticeOffer } from './practices'
import { registerIssues } from './issues'
import { brief, clock, dayKey, dayMonth, dayName, howLong, num, useTwelveHour } from './dates'
import { macTwelveHour } from './mac-clock'
import { registerScenery, sceneryDir } from './scenery'
import { celebrationFile, registerCelebrations } from './celebrate'
import type { Nudge } from './nudge'
import { firstRun, isWelcoming, noteChord, pretendTaken, registerOnboarding, whenWelcoming, whereTray } from './onboarding'
import { registerUnused } from './unused'
import { registerPeople } from './people'
import { registerSources } from './sources'
import { registerFeed } from './feed'
import { growFrom } from './grow'
import { grab, whenLetGo } from './hand'
import { throwSpot } from './throw-spot'
import { cardInView, cardOf, LIFT_MS, magnet, onFrames, outCubic, outQuart, outQuint, paceBy, rubber, settle as overshoot, tween, type Inset } from './sticky-place'
import { registerDefine } from './define'
import { isVault, registerObsidian, vaultChoices } from './obsidian'
import { bringAppleNotes, notesReader, type NotesFolder } from './apple-notes'
import { fileIntoGroups, filedSaid, registerNoteImports } from './note-imports'
import { lookAhead, registerPictures } from './pictures'
import { registerSessionLog, sleptThrough } from './session-log'
import { registerSiteBlock } from './site-block'
import { cameraAccess, displayOf, noteScreenAtStart, privacySettings, screenAccess, shootArea, shootScreen, tuckedWindow, unseen } from './shots'
import { registerFocusStats } from './focus-stats'
import { registerSimilar } from './similar'
import { registerJournal } from './journal'
import { registerWordLog } from './word-log'
import { frostWindow, registerFrost, retellFrost } from './frost'
import { BOOK, SANDBOX, arrived, windingDown, onHandOff, readShelf, realRoot, registerSandbox, relaunch, restartNow, useDataFolder, writeShelf } from './sandbox'
import { MOVED, shortPath, untoldMove, type Moved } from './old-data'
import { books, here, nameOf, nextImport, registerBooks } from './books'
import { wideThumb } from './video-thumbs'
import { busy } from './busy'
import { decodeHTML } from 'entities'
import { setAppMenu } from './app-menu'
import { clip, cut, quoted } from './clip'
import { APP_NAME } from './name'


/* The standard electron app file structure:
 * One folder, named after your app
 `app.getPath('userData')` - That is the only place you write. It resolves per machine:
        macos - `~/Library/Application Support/haligtree`
        linux - `~/.config/haligtree`
        windows - `%APPDATA%\haligtree`
 `userData` is a label you ask for, not a folder name. The name on disk is your app's name from `package.json`.
 You share it with Chromium
 Chromium writes a bunch of its own housekeeping items/files into that same folder:
        `Cache`, `Cookies`, `Preferences`, `Local State`, `Local Storage`, `Session Storage`, `GPUCache`, `blob_storage` and friends. Your files sit beside them. There is no way around that, because there is one folder.

 rule of thumb:
 - One clearly-named entry per kind of thing.
 - Note: Renaming after you ship strands data.
```
 haligtree/
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
 haligtree/
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
  Keep large binary things out of it. Save the image as a file in `assets/` and store only its name in the database, which is what haligtree already does. Past roughly 100KB a file beats a database row, and it keeps the database small enough to copy and back up.
 Two things that will bite you
  Never write next to the app itself.** On a Mac the app bundle is signed and read-only, and the code sits inside a sealed archive. It works while you develop and fails on a real install.
        Renaming the app orphans everyone's data.
        The folder is named after the app. Change the name and every user gets a fresh empty folder, with their old one stranded.

 Where haligtree stands:
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

// invents custom 'scheme' (address type) like https:// but private to haligtree
// allows app to point to assets without specififying absolute locations on disc
// instead of file:///Users/{username}/Library/Application Support/haligtree/assets/abc.png this allows for
// haligtree://assets/abc.png
// obviously the 'file://' path would only work on my machine
// when the window asks for an address, app will look up where its data folder lives and read the file
// `standard: true` - dicates that address is shaped like a normal web address, e.g haligtree://assets/abc.png splits into a part before the slash and a part after
//                    without it, the string is treated like one lump of text
// `secure: true` - says treat it as trustworthy (like https) , without it browser will refuse and not trust files from this scheme
// needs to run before the app (outside of app.whenReady()) is ready because, the browser engine builds its list of known address types once, as it starts
protocol.registerSchemesAsPrivileged([
  // `stream`, so a stored video or recording can play (and seek) in a note.
  { scheme: 'haligtree', privileges: { standard: true, secure: true, stream: true } },
  // The first name, still answered: older backups and exported notes hold
  // mindflow:// links, and a restored one should still show its pictures.
  { privileges: { standard: true, secure: true, stream: true }, scheme: 'mindflow' }
])

/** The capture box's sizes: the toolbar's expander changes the height, the side panel the width. */
// Wide enough for the box and its side panel, open to start; just the box once ⌘\ hides it.
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
const FIT_MIN = 280
/** What the writing asks for, as the page last measured it. */
let fit = FIT_MIN
/** The side panel and the expander, as the page last asked. */
let panelOpen = true
let expandedNow = false
/** How wide the box should be now: one of its two widths, never one a glide left it at. */
const boxWidth = (): number => (panelOpen ? WITH_PANEL : WIDTH)
/** How tall the box should be now. */
const boxHeight = (): number =>
  expandedNow ? SIZES.expanded.height : panelOpen ? SIZES.compact.height : Math.round(Math.min(SIZES.compact.height, Math.max(FIT_MIN, fit)))

/** Keys as Settings writes them (⌥⌘S) in Electron's words (Alt+Command+S); null for none, or two in a row. */
function accelerator(keys: string | null | undefined): string | null {
  if (!keys || keys.includes(' ')) return null
  const base = keys.replace(/^[⌃⌥⇧⌘]+/, '')
  const mods = keys.slice(0, keys.length - base.length)
  const names: Record<string, string> = { '↵': 'Return', Esc: 'Escape', '⇥': 'Tab', '⌫': 'Backspace', '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right', '+': 'Plus', '−': '-', '?': 'Shift+/', '#': 'Shift+3' }
  const words = [['⌃', 'Control'], ['⌥', 'Alt'], ['⇧', 'Shift'], ['⌘', 'Command']].filter(([glyph]) => mods.includes(glyph)).map(([, word]) => word)
  return [...words, names[base] ?? base].join('+')
}

/** The keys you chose in Settings (default keys: yours, or null for none), for the menus' labels. */
let chosenKeys: Record<string, string | null> = {}
/** A menu item's key as you press it now: your own if you changed it, none if you cleared it. */
const chordFor = (made: string): string | undefined => accelerator(made in chosenKeys ? chosenKeys[made] : made) ?? undefined

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

/**
 * Dialogs open right now. The box closes itself when it loses the focus, and
 * a file or message dialog takes it, so while one is up that waits.
 */
let dialogs = 0
for (const name of ['showOpenDialog', 'showSaveDialog', 'showMessageBox'] as const) {
  const real = dialog[name].bind(dialog) as (...args: unknown[]) => Promise<unknown>
  ;(dialog as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
    dialogs += 1
    // Asked for from the box, which takes the keys without making Haligtree the
    // active app: brought forward first, or the dialog can open behind.
    if (prompt?.isFocused()) app.focus({ steal: true })
    try {
      return await real(...args)
    } finally {
      dialogs -= 1
    }
  }
}

/** The Haligtree window that had the keys when the box was summoned; none when another app had them. */
let cameFrom: BrowserWindow | null = null

/** Put it away, keeping its place. Shared by the key, Escape and the dot. */
function hideWindow(win: BrowserWindow): void {
  // A glide under way lands first, so the window is put away at its new size.
  if (pending?.win === win) (arriving?.(), settle())
  lastBounds = boundsOf(win)
  // A screen it was thrown to keeps where it was left there, moved since or not.
  const on = screen.getDisplayMatching(lastBounds).id
  if (thrownSpots().has(on)) keepSpot(on, lastBounds)
  // Told before it goes, so the page can clear itself while hidden and come
  // back already blank rather than showing the old note for a frame.
  win.webContents.send('window:hiding')
  // Put away, the box hands the focus back to the app you came from, not to a
  // sticky: macOS passes it to the app's next window, so for a moment no
  // sticky can take it (the main window still can, if you came from there).
  // Put away by a key while it had the keys: back to the Haligtree window you
  // came from, if you came from one. From another app, there is nothing to
  // hand back: the box never took the focus from it (see `type: 'panel'`).
  const back = win === prompt && win.isFocused() && cameFrom && !cameFrom.isDestroyed() && cameFrom.isVisible() ? cameFrom : null
  cameFrom = null
  const notes = win === prompt ? [...stickies.values()].filter((one) => one !== back && !one.isDestroyed() && one.isFocusable()) : []
  for (const one of notes) one.setFocusable(false)
  win.hide()
  // Back in the Dock once the box has gone, and before any Haligtree window is
  // given the keys again (see `boxUp`).
  if (win === prompt) boxUp(false)
  back?.focus()
  if (notes.length) setTimeout(() => notes.forEach((one) => one.isDestroyed() || one.setFocusable(true)), 400)
  // The welcome brings its words back where the box was.
  if (win === prompt && home && !home.isDestroyed()) home.webContents.send('onboarding:box-away')
}

/**
 * The box is summoned many times a day, so it appears at once with the caret
 * ready, never fading up: the sound alone says it is alive (Rauno: what is
 * done hundreds of times should barely move). A resize glides instead (reshape),
 * on the display's own frames (the clock in sticky-place.ts); this stops it.
 */
let arriving: (() => void) | undefined
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
  arriving?.()
  settle()
  win.setOpacity(1)
  if (win === prompt) boxUp(true)
  win.show()
  // Stepping out of the Dock (boxUp) can hand the box its window buttons back after 'show' has fired.
  if (win === prompt && process.platform === 'darwin') setImmediate(() => !win.isDestroyed() && win.setWindowButtonVisibility(false))
}

/**
 * Haligtree steps out of the Dock while the box is up, and back in when it goes.
 *
 * AeroSpace leaves a window alone only when its app is a menu bar app and the
 * window has no buttons. Of an ordinary app (Haligtree, since it has a Dock icon)
 * it files every window under a workspace, the box included, and when the box
 * comes back it puts the whole screen back as it was when the box last went:
 * the box took you to the workspace you last closed it on, which was usually
 * where the main window is. Put away, it also handed the keys to a Haligtree
 * window, which brought Haligtree forward. As a menu bar app for the moment it is
 * up, the box is never filed, so it opens where you are and leaves you there.
 * Set before the box shows, so AeroSpace never sees it otherwise.
 */
function boxUp(up: boolean): void {
  if (process.platform !== 'darwin') return
  app.setActivationPolicy(up ? 'accessory' : 'regular')
  // Back in the Dock, macOS shows the bundle's own icon (Electron's, run from source): Haligtree's is put on again.
  if (!up) setImmediate(wearIcon)
}

/** The Dock wears the icon chosen in Settings; run from source, it would otherwise be Electron's own. Not before the settings are open. */
let iconReady = false
// Each picture read once, at the Dock's largest size (128 points, 256 pixels on a Retina screen):
// handed the 1024px file, every putting-on held up the whole app for about 65ms, and it is put on
// each time the box goes away, so a note opened from the box waited behind it.
const dockIcons = new Map<string, Electron.NativeImage>()
function wearIcon(): void {
  if (!iconReady || !app.dock) return
  const path = appIcon() === 'gold' ? iconGold : iconBronze
  if (!dockIcons.has(path)) dockIcons.set(path, nativeImage.createFromPath(path).resize({ width: 256, quality: 'best' }))
  app.dock.setIcon(dockIcons.get(path)!)
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
  arriving?.()
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
  return new Promise((resolve) => {
    landed = resolve
    // Paced on the display's frames, shared with every other window glide.
    arriving = tween(GLIDE, (t) => {
      if (win.isDestroyed()) {
        arriving = undefined
        pending = null
        landed = null
        resolve()
        return false
      }
      // Ease-out quart: quick off the mark, as anything a key asks for should be.
      const k = outQuart(t)
      const at = (a: number, b: number): number => Math.round(a + (b - a) * k)
      const next = { x: at(from.x, bounds.x), y: at(from.y, bounds.y), width: at(from.width, bounds.width), height: at(from.height, bounds.height) }
      const now = win.getBounds()
      if (!sameBox(now, next)) win.setBounds(next, false)
      return true
    }, () => ((arriving = undefined), settle()))
  })
}

/** The box's page has drawn itself (its first size report): until then ⌘. waits, or it shows an empty frosted panel. */
let promptPainted = false
let promptWaiting: (() => void) | null = null

/**
 * Show it, or put it away if it is already in front.
 *
 * Only when it is *in front*: pressing the key while another app has the
 * focus should bring this one forward, not hide the window you were about to
 * type into. A window can be visible and still be behind everything.
 */
function toggleWindow(): void {
  // Not made yet (it is made just after the main window) or still loading (a
  // first run after a build parses all the code afresh): shown the moment it
  // has drawn itself, never as an empty frosted panel.
  if (!prompt) createWindow()
  const win = prompt
  if (!win) return
  if (!promptPainted) {
    promptWaiting = () => toggleWindow()
    // A page that never reports (it crashed) still comes up, rather than ⌘. doing nothing.
    setTimeout(() => !promptPainted && promptWaiting && ((promptPainted = true), (promptWaiting = null), toggleWindow()), 4000)
    return
  }

  if (win.isVisible() && win.isFocused()) {
    hideWindow(win)
    return
  }

  // Which Haligtree window had the keys, if any, before the box takes them.
  const before = BrowserWindow.getFocusedWindow()
  if (before !== win) cameFrom = before
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
  // The keys, without bringing Haligtree forward: the box is a panel, so the app
  // you are in stays the active one and the main window stays where it is,
  // behind it. No `app.focus` here, which would raise every Haligtree window.
  win.focus()
}

/**
 * Load the app's page into a window. The query says which view it is, since
 * that is the one thing a fresh renderer can read about itself before any of
 * ours has run. Each kind of window has a page of its own (`pageFor`), so it
 * loads only its own code.
 */
function load(win: BrowserWindow, query = ''): void {
  // The sandbox says so in every window's address, the one thing a page knows before it runs.
  if (SANDBOX) query = `${query || '?'}${query ? '&' : ''}sandbox=1`
  // Just restarted into (or out of) the sandbox: the main window finishes the moment the last run began.
  if (process.argv.includes('--show-home') && query.includes('view=home')) query += '&arrived=1'
  const page = pageFor(query)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')}/${page}${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer', page), { search: query })
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
  {
    window: BrowserWindow
    note: Electron.WebContents
    scene: unknown
    picture?: string
    /** Whether the note took the last change: false once it went, and nothing is lost for that. */
    kept: boolean | Promise<boolean>
  }
>()

/** Open a drawing in its own window, or bring the one already open forward. */
function openDrawing(id: string, scene: unknown, note: Electron.WebContents, name = '', picture?: string): void {
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
    // The app's own bar, as the main window has, not a grey system strip saying "Drawing".
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 11 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })

  const entry = { window, note, scene, picture, kept: true as boolean | Promise<boolean> }
  drawings.set(id, entry)
  window.on('ready-to-show', () => window.show())

  // The note has stepped back to being a picture while this is open, so it has
  // to be told when it can be drawn in again.
  const tell = (open: boolean): void => {
    if (!note.isDestroyed()) note.send('drawing:open', id, open)
  }
  tell(true)
  window.on('closed', () => {
    tell(false)
    // A moment for the last stroke, sent as the window closes, to arrive. If
    // the note was gone for it (closed, binned, or the block deleted), the
    // drawing is kept as a note of its own and the main window says so.
    setTimeout(() => {
      if (drawings.get(id) === entry) drawings.delete(id)
      void Promise.resolve(entry.kept).then((kept) => {
        if (kept) return
        rescueDrawing(entry.scene)
        const said = { text: 'Its note was gone, so the drawing is kept in the Inbox as “Drawing, rescued”', ok: true }
        void home?.webContents.executeJavaScript(`dispatchEvent(new CustomEvent('haligtree:said', { detail: ${JSON.stringify(said)} }))`).catch(() => undefined)
      })
    }, 600)
  })

  guard(window)
  // The note's name, for the window's own bar to say where the drawing lives.
  load(window, `?drawing=${encodeURIComponent(id)}${name ? `&in=${encodeURIComponent(cut(name, 80))}` : ''}`)
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
    win.setTitle(page.getURL().includes('note=') ? 'Note' : APP_NAME)
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
    // While the welcome runs, the keys that would open a panel, a search or
    // another page wait, in the box and the main window alike: a first-timer
    // pressing one by mistake is told so in a line, never taken somewhere else.
    // ⌘[ and ⌘] in the main window are the welcome's own Back and Next: they go on to its page, which holds them from the app.
    const step = page === home?.webContents && input.meta && !input.shift && !input.control && !input.alt && (input.key === '[' || input.key === ']')
    if (input.type === 'keyDown' && isWelcoming() && !step && heldInWelcome(input, page === prompt?.webContents)) {
      event.preventDefault()
      page.send('onboarding:held')
      return
    }
    if (input.type !== 'keyDown' || !input.meta || input.control || input.alt) return
    // Cmd+, opens Settings, as in every Mac app: from any window, typing or not.
    if (input.key === ',') {
      event.preventDefault()
      return sendHome('view', 'settings')
    }
    // Cmd+O opens the main window from the box, a sticky or a note's own window.
    // From the box it carries what you are writing with it (Arc's "Open in
    // Arc"): the page saves it and asks for the glide (`box:promote`).
    if (input.key === 'o' && !input.shift && home?.webContents !== page) {
      event.preventDefault()
      if (page === prompt?.webContents && prompt.isVisible()) return page.send('box:promote-asked')
      return openHome()
    }
    if (input.key.toLowerCase() !== 'q') return
    event.preventDefault()
    quit()
  })
}

/**
 * The keys held back while the welcome runs: the side panel and its tabs, search,
 * a new note, back and forward, the source, Settings, focus and the window's size.
 * Typing, copying, pasting, undo, ⌘↵ and Esc are left alone, and in the box ⌘1
 * to ⌘9 still choose a kind.
 */
function heldInWelcome(input: Electron.Input, box: boolean): boolean {
  const key = input.key.toLowerCase()
  if (input.meta && !input.control && !input.alt) {
    if (input.shift) return ['y', 'r', 'd', 'f', 'c', 'k'].includes(key)
    if (/^[1-9]$/.test(key)) return !box
    return ['\\', 'k', 'p', 'n', '[', ']', 'e', 'f', ',', 'l', 'j', 'g', 't', 'w', 'm', 'h'].includes(key) || (!box && key === 'b')
  }
  // ⌃L picks the kind of what you are writing in the box: yours to use in the welcome too.
  if (input.control && !input.meta) return /^[0-9]$/.test(key) || ['j', 'k', 'f'].includes(key) || (!box && key === 'l')
  // ⌥C turns Create more on, which would keep the box open after the welcome's one.
  return input.alt && !input.meta && !input.control && input.code === 'KeyC'
}

/** The capture prompt. Every other window is something else. */
let prompt: BrowserWindow | null = null
/** Words for the box to write in, sent before its page was listening. */
let seed: string | null = null
/** The box's promote glide under way (`box:promote`). */
let promoting: (() => void) | undefined

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
function sendHome(type: string, id: string, heading?: string, via?: Via): void {
  openHome()
  // A heading link's heading goes along, so the note opens there.
  const sent: [string, string, string?] = heading ? [String(type), String(id), String(heading)] : [String(type), String(id)]
  // How it was found again, for the usage counts (usage.ts): told just before, so the page it opens is counted with it.
  if (homeAsked && home) (via && home.webContents.send('usage:via', via), home.webContents.send('home:open', ...sent))
  else (sentTo = sent, (sentVia = via ?? null))
}

/**
 * ⌃⌥⌘S from anywhere: quick capture comes up on ⌘K's “Start focus”, its
 * lengths to pick from (25, 45, 60 minutes, or one typed). Asked before the
 * box has drawn itself, it waits for it as ⌘. does.
 */
function askFocus(): void {
  // The focus timer turned off: the key does nothing.
  if (!focusToolsOn()) return
  const ask = (): void => void (prompt && !prompt.isDestroyed() && prompt.webContents.send('focus:ask'))
  if (prompt && promptPainted && prompt.isVisible() && prompt.isFocused()) return ask()
  toggleWindow()
  if (promptPainted) return ask()
  const was = promptWaiting
  promptWaiting = () => (was?.(), ask())
}

/**
 * The focus timer: a small pill that floats over everything, the way Raycast
 * Focus shows one, until the session ends. Dragged anywhere; remembered.
 */
let focusPill: BrowserWindow | null = null
/** The pill's window at rest; it grows down while the pill opens into the island, and back after. */
const PILL_REST = 64
/** Whether a session wants the pill up: safe mode hides it without forgetting. */
let focusWanted = false
/** The pill on screen: a session wants it, Settings has the bubble showing, and safe mode is off. */
// Never over the welcome: it fills the window, and a real session's bubble hanging over the film reads as part of it (and was cut off at its edge).
const pillUp = (): boolean => focusWanted && focusBubbleShown() && !gate().blackout && !isWelcoming()
// The welcome opening puts the bubble away; closing it brings the bubble back if a session still runs.
whenWelcoming((on) => {
  if (!focusPill || focusPill.isDestroyed()) return
  if (on) focusPill.hide()
  else if (pillUp()) (placeFocus(), focusPill.showInactive())
})
/**
 * The notch, where the screen has one: a Mac's own display whose menu bar is
 * taller than the 24 points a plain one has (37 or so beside the notch).
 * HALIGTREE_QA_NOTCH stands one in, for testing on a Mac without.
 */
function notchOf(display: Electron.Display): { height: number } | null {
  const bar = display.workArea.y - display.bounds.y
  if (process.env.HALIGTREE_QA_NOTCH) return { height: Math.max(bar, 32) }
  return process.platform === 'darwin' && display.internal && bar >= 30 ? { height: bar } : null
}
/** The screen with the notch, if the pill is to sit under one: the Mac's own display. */
const notchScreen = (): { display: Electron.Display; height: number } | null => {
  if (!pillInNotch()) return null
  for (const display of screen.getAllDisplays()) {
    const notch = notchOf(display)
    if (notch) return { display, ...notch }
  }
  return null
}
/**
 * Put the pill where it sits: hugging the notch, over the menu bar, or back
 * under the menu bar at the top middle of the screen you are on.
 */
function placeFocus(): { notch: number } {
  if (!focusPill || focusPill.isDestroyed()) return { notch: 0 }
  const placed = placeFocusOn(focusPill)
  // Test runs park windows out of sight: where the pill was put is kept for them to read.
  if (process.env.HALIGTREE_QA_NOTCH) (globalThis as { pillPlaced?: unknown }).pillPlaced = { ...placed, at: focusPillAt }
  return { notch: placed.notch }
}
let focusPillAt: Electron.Rectangle | null = null
function placeFocusOn(focusPill: BrowserWindow): { notch: number } {
  const tucked = notchScreen()
  const { height } = focusPill.getBounds()
  if (tucked) {
    const { bounds } = tucked.display
    focusPill.setAlwaysOnTop(true, 'screen-saver')
    focusPillAt = { x: Math.round(bounds.x + bounds.width / 2 - 170), y: bounds.y, width: 340, height }
    focusPill.setBounds(focusPillAt)
    focusTucked = true
    return { notch: tucked.height }
  }
  focusPill.setAlwaysOnTop(true, 'floating')
  // Coming out of the notch: back to the top middle, under the menu bar.
  if (focusTucked) {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    focusPillAt = { x: Math.round(workArea.x + workArea.width / 2 - 170), y: workArea.y + 6, width: 340, height }
    focusPill.setBounds(focusPillAt)
  }
  focusTucked = false
  return { notch: 0 }
}
let focusTucked = false
function showFocus(on: boolean): void {
  focusWanted = on
  // A session begun or over: the goal cards tuck or come back as their rules say, once it is saved.
  setTimeout(applyRules, 300)
  // With the time in the note only, the pill is still made and kept hidden:
  // it is what rings and glows when the time is up.
  if (!on || !focusBubbleShown()) focusPill?.hide()
  // Put away, its window goes back to the pill's own size for next time.
  if (!on && focusPill && !focusPill.isDestroyed()) focusPill.setBounds({ ...focusPill.getBounds(), height: PILL_REST })
  if (!on) return
  if (focusPill && !focusPill.isDestroyed()) return void (placeFocus(), pillUp() && focusPill.showInactive())
  // Top centre of the screen you are on, hung just under the menu bar the way
  // the island hangs under the notch: the work area starts below both, so
  // the notch is never covered.
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  focusPill = new BrowserWindow({
    width: 340,
    height: PILL_REST,
    x: Math.round(workArea.x + workArea.width / 2 - 170),
    y: workArea.y + 6,
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
    // Under the notch it sits over the menu bar, where a window is otherwise kept from.
    enableLargerThanScreen: true,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  focusPill.setAlwaysOnTop(true, 'floating')
  focusTucked = false
  placeFocus()
  focusPill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  focusPill.once('ready-to-show', () => pillUp() && focusPill?.showInactive())
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
let glowWaiting: { tone: string; rounded: boolean } | null = null
let glowHide: ReturnType<typeof setTimeout> | undefined
function makeGlow(): BrowserWindow {
  if (glow && !glow.isDestroyed()) return glow
  glow = new BrowserWindow({
    // A panel, like the box: over a full-screen app too.
    type: 'panel',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    // Never a full-screen window of its own: one the size of the screen that
    // the Mac may make full screen is given a Space of its own, and the glow
    // took you to a black desktop and back. It joins the Space you are on.
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    show: false,
    // Left to idle while hidden: its glow has faded to nothing before it is put away.
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  glow.setIgnoreMouseEvents(true)
  // Above the menu bar and full-screen apps too: the edge is the whole screen's.
  glow.setAlwaysOnTop(true, 'screen-saver')
  glow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  load(glow, '?view=glow')
  return glow
}
function showGlow(tone: string, at?: { x: number; y: number }): void {
  const win = makeGlow()
  // The screen you are on: where the pointer is (for a spark burst, the screen it starts on).
  const display = at ? screen.getDisplayNearestPoint(at) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  win.setBounds(display.bounds)
  win.showInactive()
  // A Mac's own screen has rounded corners (and a notch): the light follows them rather than being cut off there.
  const rounded = display.internal || !!process.env.HALIGTREE_QA_NOTCH
  if (win.webContents.isLoading()) glowWaiting = at ? null : { tone, rounded }
  else win.webContents.send('glow', tone, at && { x: at.x - display.bounds.x, y: at.y - display.bounds.y }, rounded)
  clearTimeout(glowHide)
  glowHide = setTimeout(() => glow?.hide(), 2200)
}

/**
 * The nudge card: Haligtree's own small card at the top right of the screen you
 * are on, over everything, for a task due now, the daily review, or a session
 * that ended while you were away. Its answers are its own buttons (Done, In
 * 10 min, Review now...), not the Mac's notification buttons. Hidden between
 * nudges; the cards it holds wait in the page until answered or let go. A
 * website blocked is said in a card window of its own, just under the pill,
 * so it never carries the corner's cards off with it, nor they it.
 */
type NudgeSpot = 'corner' | 'pill'
const nudgeWins = new Map<NudgeSpot, { win: BrowserWindow; waiting: Nudge[] }>()
const NUDGE_WIDTH = 360
/** The screen locked: no card can be seen, so the Mac's own notification goes instead. */
let screenLocked = false
function showNudge(nudge: Nudge): boolean {
  if (screenLocked) return false
  const spot: NudgeSpot = nudge.kind === 'blocked' ? 'pill' : 'corner'
  let held = nudgeWins.get(spot)
  if (!held || held.win.isDestroyed()) {
    const win = new BrowserWindow({
      type: 'panel', width: NUDGE_WIDTH, height: 150, frame: false, transparent: true, backgroundColor: '#00000000', roundedCorners: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false,
      // Left to idle while hidden: it hides only once its last card has slid away.
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
    })
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    load(win, spot === 'pill' ? '?view=nudge&at=pill' : '?view=nudge')
    held = { win, waiting: [] }
    nudgeWins.set(spot, held)
  }
  const { win } = held
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  // A site blocked is said just under the pill, where the eye already goes for the session (top middle with no pill up).
  const pill = spot === 'pill' && focusPill && !focusPill.isDestroyed() && focusPill.isVisible() ? focusPill.getBounds() : null
  const at = spot === 'corner' ? { x: workArea.x + workArea.width - NUDGE_WIDTH - 10, y: workArea.y + 8 }
    : pill ? { x: Math.round(pill.x + pill.width / 2 - NUDGE_WIDTH / 2), y: pill.y + PILL_REST - 6 } : { x: Math.round(workArea.x + workArea.width / 2 - NUDGE_WIDTH / 2), y: workArea.y + 8 }
  win.setBounds({ ...at, width: NUDGE_WIDTH, height: win.getBounds().height })
  if (win.webContents.isLoading()) held.waiting.push(nudge)
  else win.webContents.send('nudge', nudge)
  win.showInactive()
  return true
}
/** The card window a page belongs to, if it is one. */
const nudgeHeld = (sender: Electron.WebContents): { win: BrowserWindow; waiting: Nudge[] } | undefined =>
  [...nudgeWins.values()].find((one) => !one.win.isDestroyed() && one.win.webContents === sender)

/**
 * A note stuck on the desktop: a small window of its own, over everything,
 * dragged anywhere and closed with its own button. Remembered, place and all,
 * so the desktop looks the same after a restart.
 */
const stickies = new Map<string, BrowserWindow>()
// Switching book or into the sandbox: the stickies of the book being left go at once, while its main
// window stays up until the new run's is on screen; the new run's are dealt in after it (afterHome).
onHandOff(() => { for (const win of stickies.values()) if (!win.isDestroyed()) win.hide() })
/**
 * Where Haligtree itself last put a sticky (a wiggle, a lift). A window found there
 * was moved by Haligtree, not by you: not kept as its place, nor nudged on screen.
 */
const placed = new WeakMap<BrowserWindow, { x: number; y: number }>()
const ours = (win: BrowserWindow): boolean => {
  const at = placed.get(win)
  const now = win.getBounds()
  return !!at && at.x === now.x && at.y === now.y
}
const stickyFile = (): string => join(app.getPath('userData'), 'stickies.json')
// Hidden: put away on its own ("Hide this one") until the stickies are next shown.
// Tint: its paper's colour from its right-click menu (STICKY_TINTS); plain when none.
type Stuck = { type: string; id: string; bounds?: Electron.Rectangle; hidden?: boolean; tint?: string }
let stuck: Stuck[] = []
const keepStuck = (): void => void writeFile(stickyFile(), JSON.stringify(stuck)).catch(() => undefined)
const stuckAs = (key: string): Stuck | undefined => stuck.find((one) => `${one.type}:${one.id}` === key)
/** The paper colours a sticky can have, in the order Tidy keeps them: plain first. */
const STICKY_TINTS = [['plain', 'Plain'], ['butter', 'Butter'], ['rose', 'Rose'], ['sage', 'Sage'], ['sky', 'Sky']] as const
/** Each paper colour as a dot beside its name in the menu, so the names are never guessed at (the paper follows the theme; these are its light-theme look). */
const TINT_DOTS: Record<string, [number, number, number]> = { plain: [240, 233, 219], butter: [255, 214, 102], rose: [229, 143, 180], sage: [143, 191, 143], sky: [143, 182, 224] }
const tintDot = (tint: string): Electron.NativeImage => {
  const size = 28
  const [r, g, b] = TINT_DOTS[tint] ?? TINT_DOTS.plain
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)
      // A soft-edged disc with a faint darker rim, so the pale ones still read on a light menu.
      const fill = Math.max(0, Math.min(1, size / 2 - 1 - d))
      const rim = d > size / 2 - 3 ? 0.78 : 1
      const at = (y * size + x) * 4
      pixels[at] = Math.round(b * rim)
      pixels[at + 1] = Math.round(g * rim)
      pixels[at + 2] = Math.round(r * rim)
      pixels[at + 3] = Math.round(255 * fill)
    }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 })
}
/** The sticky a window's address says it is ("today:today"), whether or not it is listed. */
function keyInAddress(win: BrowserWindow): string | null {
  const url = win.webContents.getURL()
  if (!/[?&]view=sticky/.test(url)) return null
  const query = new URLSearchParams(url.slice(url.indexOf('?')))
  return `${query.get('type')}:${query.get('id')}`
}
/** The sticky a window is, by its key ("capture:…", "today:today"). */
const keyOfSticky = (win: BrowserWindow | null): string | undefined => (win ? [...stickies].find(([, one]) => one === win)?.[0] : undefined)
/** How far in from its window the card is drawn: glass fills it; paper keeps room round it for its lean and shadow (sticky-note.tsx, goal-beacon.tsx). */
const insetOf = (key: string): Inset => builtGlass.get(key) ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: 20, top: 20, right: 20, bottom: 20 }

/** Stickies waiting to come in: each 40ms after the last one really did, so a busy moment never lands two at once. */
const arrivals: (() => void)[] = []
let arrivalTimer: ReturnType<typeof setTimeout> | null = null
const nextArrival = (): void => {
  arrivalTimer = null
  const go = arrivals.shift()
  if (!go) return
  go()
  arrivalTimer = setTimeout(nextArrival, 40)
}
/**
 * A sticky coming onto the desktop fades in over 180ms, dropping the last 8
 * points and settling, as a card laid down does; paper lands with its lean
 * overshooting by a degree (drawn in the page, told by `sticky:arrive`).
 * Several at once (Show sticky notes, a restart) come one after another,
 * 40ms apart, as Tidy deals them. At once with Motion off.
 */
/** Made again as glass or paper: it only fades in where the old one fades out, with no drop. */
const quietly = new Set<string>()
/** Each sticky's page, waited for until it says its words are in. */
const readyWaits = new Map<number, () => void>()
/** A dragged row came over a new place in a list: one light tap (renderer's slotTicker throttles it). */
ipcMain.on('haptic:tap', (_event, kind: unknown) => tap(kind === 'level' ? 'level' : 'align'))
ipcMain.on('sticky:ready', (event) => {
  const go = readyWaits.get(event.sender.id)
  readyWaits.delete(event.sender.id)
  go?.()
})
/**
 * Once the main window is on screen, if it is on its way; at once if it is not opening.
 * On screen, not only painted: a switch into the sandbox or a book paints the
 * new main window well before it shows (the run before keeps its own up until
 * then), and the cards came in over the old one. Never later than 5 seconds.
 */
function afterHome(go: () => void): void {
  const home = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && /[?&]view=home/.test(one.webContents.getURL()))
  if (!home || home.isVisible()) return go()
  let done = false
  const once = (): void => void (!done && ((done = true), setTimeout(go, 250)))
  home.once('show', once)
  setTimeout(once, 5000)
}
/** When each sticky came on screen, beside the main window's own times, for a probe (qa/stickies-after-home.mjs). */
const stickyTimes: number[] = []
;(globalThis as { haligtreeStickyTimes?: number[] }).haligtreeStickyTimes = stickyTimes
function arriveSticky(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isVisible()) return
  stickyTimes.push(Math.round(performance.now()))
  const quiet = quietly.delete(keyOfSticky(win) ?? '')
  if (stillness()) return win.showInactive()
  const drop = quiet ? 0 : 8
  const go = (): void => {
    // Put away while it waited its turn (Show sticky notes unticked as they came): it stays away.
    const key = keyOfSticky(win)
    if (win.isDestroyed() || win.isVisible() || (key && !stickyUp(key))) return
    const rest = win.getBounds()
    win.setOpacity(0)
    placed.set(win, { x: rest.x, y: rest.y - drop })
    win.setPosition(rest.x, rest.y - drop)
    win.showInactive()
    if (!quiet) win.webContents.send('sticky:arrive')
    moving.add(win)
    tween(180, (t) => {
      if (win.isDestroyed()) return false
      win.setOpacity(outCubic(Math.min(1, t * 1.4)))
      // Taken by your hand on the way: it stays where you have it.
      if (!ours(win)) return true
      const y = Math.round(rest.y - drop + drop * overshoot(t))
      placed.set(win, { x: rest.x, y })
      win.setPosition(rest.x, y)
      return true
    }, () => (moving.delete(win), !win.isDestroyed() && win.setOpacity(1)))
  }
  arrivals.push(go)
  if (!arrivalTimer) nextArrival()
}

/**
 * Taken down: the card peels off, lifting 10 points and fading over 200ms
 * (paper turns 3° as it goes, drawn in the page), then the window is gone.
 * At once with Motion off.
 */
/** Stickies on their way out (peeling, or fading as glass and paper swap): the one window left for a key besides its own. */
const leaving = new WeakSet<BrowserWindow>()
function peelSticky(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  leaving.add(win)
  if (stillness() || !win.isVisible()) return win.destroy()
  win.webContents.send('sticky:peel')
  const from = win.getBounds()
  placed.set(win, { x: from.x, y: from.y })
  moving.add(win)
  tween(160, (t) => {
    if (win.isDestroyed()) return false
    win.setOpacity(1 - outCubic(t))
    const y = Math.round(from.y - 10 * outCubic(t))
    placed.set(win, { x: from.x, y })
    win.setPosition(from.x, y)
    return true
  }, () => !win.isDestroyed() && win.destroy())
}

/** Gone without a peel: faded out over 180ms where it stands (the old window when glass and paper swap). */
function fadeOutSticky(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  leaving.add(win)
  if (stillness() || !win.isVisible()) return win.destroy()
  tween(180, (t) => (win.isDestroyed() ? false : void win.setOpacity(1 - t)), () => !win.isDestroyed() && win.destroy())
}

/** The last sticky taken down from its own X or ⌘W, for "Put it back" while it is fresh. */
let takenDown: (Stuck & { title: string; until: number }) | null = null
const TAKEN_FOR = 30_000
const canPutBack = (): boolean => !!takenDown && takenDown.until > Date.now() && !stickies.has(`${takenDown.type}:${takenDown.id}`)
/** A sticky taken down by its own hand: peeled off, said where it is seen, and kept a while for "Put it back". */
function takeDownSticky(win: BrowserWindow | null, title: string): void {
  const key = keyOfSticky(win)
  if (!win || !key) return
  const [type, ...rest] = key.split(':')
  const id = rest.join(':')
  takenDown = { type, id, bounds: win.getBounds(), tint: stuckAs(key)?.tint, title, until: Date.now() + TAKEN_FOR }
  stick(type, id, false)
  const seen = (one: BrowserWindow | null | undefined): one is BrowserWindow => !!one && !one.isDestroyed() && one.isVisible()
  const voice = [home, prompt].find(seen)
  voice?.webContents.send('sticky:taken', title)
  updateTray()
  setTimeout(updateTray, TAKEN_FOR + 50)
}
/** Back where it was, with its colour, coming in as any sticky does. */
function putStickyBack(): void {
  if (!canPutBack() || !takenDown) return
  const { type, id, bounds, tint } = takenDown
  takenDown = null
  stuck.push({ type, id, bounds, tint })
  stick(type, id, true, bounds)
  updateTray()
}
/** Whether a sticky is on the desktop now: not in safe mode, the stickies shown, and not put away on its own. */
const stickyUp = (key: string): boolean => !gate().blackout && stickyPrefs().shown && !stuckAs(key)?.hidden && (tucked.get(key) ?? 0) <= Date.now() && ruled.get(key) !== 'tuck'
/** How many stickies are out on the screen: Tidy stickies is offered only when there is one to tidy. */
const stickiesOut = (): number => [...stickies].filter(([key, win]) => !win.isDestroyed() && stickyUp(key) && win.isVisible()).length
let toldOut = -1
let toldSeen = false
/** Whether any sticky is on the screen this moment, whatever the setting says: what "Show sticky notes" ticks. */
const stickiesSeen = (): boolean => [...stickies.values()].some((win) => !win.isDestroyed() && win.isVisible())
/** "Show sticky notes" ticked: one is on the screen, or they are meant to be and nothing (safe mode) keeps them in. */
const stickiesTicked = (): boolean => stickiesSeen() || (stickyPrefs().shown && !gate().blackout)
/** The menus' way to tuck every sticky to the edge, or bring them back out, and to flatten the tabs to pills. */
const tuckItems = (): Electron.MenuItemConstructorOptions[] => {
  const tuck = stickyTuck()
  if (tuck === 'off') return stickiesOut() > 0 ? [{ label: 'Tuck sticky notes away', accelerator: chordFor('⌃⌥⌘H'), click: () => tuckStickies('tabs') }] : []
  return [
    { label: 'Bring sticky notes back', accelerator: chordFor('⌃⌥⌘H'), click: () => tuckStickies('off') },
    tuck === 'tabs' ? { label: 'Tuck them flat', click: () => tuckStickies('flat') } : { label: 'Show their names', click: () => tuckStickies('tabs') }
  ]
}
/** Each window told when that count changes, and the menu bar rebuilt to match. */
function tellStickiesOut(): void {
  setTimeout(() => {
    const now = stickiesOut()
    const seen = stickiesSeen()
    if (now === toldOut && seen === toldSeen) return
    toldOut = now
    toldSeen = seen
    updateTray()
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('stickies:out', now)
  }, 0)
}
/** The stickies and the Look over one: kept by their own rule, never the main window's. */
const shielded = new WeakSet<BrowserWindow>()
/** A sticky, a goal card or the Look over one, shown in screen recordings as their switch says. */
const shield = (win: BrowserWindow): void => (shielded.add(win), protect(win))
/** Every sticky as the settings say now: shown or away. */
function applyStickies(): void {
  for (const [key, win] of stickies) {
    if (win.isDestroyed()) continue
    // Coming out, each fades in and settles, one after another.
    // A goal's card in its place by the clock, a slim tab or the whole card, before it comes in: it arrives as what it is.
    // Tucked away, every one is a tab (or a flat pill) at the screen's edge.
    shapeCard(key, win)
    if (stickyUp(key)) arriveSticky(win)
    else win.hide()
  }
  // Frosted or plain paper, as the setting says now.
  retellFrost()
  tellStickiesOut()
}
/** Which stickies were made as real glass, so a change of the setting remakes the rest. */
const builtGlass = new Map<string, boolean>()

function stick(type: string, id: string, on: boolean, bounds?: Electron.Rectangle): void {
  const key = `${type}:${id}`
  const open = stickies.get(key)
  // A goal's page says whether its card is up, so it hears when that changes.
  if (type === 'goal') setTimeout(() => changed({ kind: 'item', id }), 0)
  if (!on) {
    stuck = stuck.filter((one) => `${one.type}:${one.id}` !== key)
    keepStuck()
    // It peels off rather than vanishing; already gone from the list, so stuck again mid-peel makes a new one.
    stickies.delete(key)
    if (open && !open.isDestroyed()) peelSticky(open)
    return
  }
  if (open && !open.isDestroyed()) {
    // Stuck again while put away: it comes back, and with the rest put away, they all do.
    const one = stuckAs(key)
    if (one?.hidden) (one.hidden = false), keepStuck()
    if (!stickyPrefs().shown) return void showStickies(true)
    return void (gate().blackout || arriveSticky(open))
  }
  // One window per sticky, ever: a copy left behind (not its own, not on its way out) goes now.
  for (const other of BrowserWindow.getAllWindows())
    if (!other.isDestroyed() && !leaving.has(other) && keyInAddress(other) === key) other.destroy()
  const { workArea } = screen.getPrimaryDisplay()
  // A new one lands top right, each fanned a little down and to the side of the last.
  // The window is the note plus room for its lean and shadow.
  // A saved place is brought back onto a screen that exists now: a display
  // unplugged, or a note dragged past an edge, never leaves it out of reach.
  // A goal's card is taller than a note: the days left and the road. The
  // goals together (type 'goals') a little wider: their lanes and the legend.
  // Real glass: the Mac blurs whatever is behind, kept on while the window is
  // not the active one (it never is). It fills the window, so the note sits
  // straight in it, with the Mac's own rounded corners.
  const glass = stickyGlass() && !nativeTheme.prefersReducedTransparency
  // Today's list is a little taller than a note: a few tasks under its title.
  const size = type === 'goal' ? (glass ? GOAL_GLASS : GOAL_SIZE) : type === 'goals' ? (glass ? GOALS_GLASS : GOALS_SIZE) : type === 'today' ? { width: 280, height: 300 } : { width: 300, height: 220 }
  builtGlass.set(key, glass)
  // A goal's card and the goals together keep their own size.
  const fixed = type === 'goal' || type === 'goals'
  // A saved place keeps the card itself on a screen: paper's clear room round it may hang past the edge.
  const place = bounds
    ? cardInView({ ...bounds, ...stickySize(fixed ? size.width : bounds.width, fixed ? size.height : bounds.height, bounds) }, insetOf(key), screen.getDisplayMatching(bounds).workArea)
    : freeSpot(workArea, size.width, size.height)
  const win = new BrowserWindow({
    ...place,
    ...(glass ? { vibrancy: 'popover' as const, visualEffectState: 'active' as const, roundedCorners: true, backgroundColor: '#00000000' } : {}),
    // 6 points either side of its limits, for the corner grip's give (see sticky:resize).
    minWidth: 214,
    minHeight: 124,
    maxWidth: 486,
    maxHeight: 526,
    // Named for AeroSpace's floating rule, and with no close button and on
    // every Space, like the box: such a window is never tiled at all. Its own
    // X takes it down; quitting makes it closable first.
    title: APP_NAME,
    // A panel, like the box: over a full-screen app too, and written in
    // without bringing Haligtree, and its main window, to the front.
    type: 'panel',
    closable: false,
    // Not resizable either: a resizable window keeps its zoom button in the
    // style mask, and while any window button is left AeroSpace counts it as
    // a real window, files it under one workspace and hides it on the others.
    resizable: false,
    frame: false,
    transparent: !glass,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: glass,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  // Its place said again once made: the same, but a QA run's parked window keeps it as its own (HALIGTREE_QA_VIRTUAL).
  if (process.env.HALIGTREE_QA_VIRTUAL) win.setBounds(place)
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  shield(win)
  // The desktop picture, blurred, behind its paper (frost.ts).
  frostWindow(win, () => stickyUp(key), fixed && !glass)
  // Shown once its page has drawn what it holds (sticky:ready, a blank card was seen first) and the main window, if it
  // is opening, has painted: the desk comes in first, the cards are dealt onto it. Never later than 3 seconds.
  let painted = false
  let filled = false
  const arrive = (): void => void (painted && filled && stickyUp(key) && afterHome(() => (shapeCard(key, win), arriveSticky(win))))
  win.once('ready-to-show', () => ((painted = true), arrive()))
  readyWaits.set(win.webContents.id, () => ((filled = true), arrive()))
  setTimeout(() => ((filled = true), (painted = true), arrive()), 3000)
  // Where you leave it is where it comes back.
  const remember = (): void => {
    // Peeking, the window is a tab at the edge: the card's own place is kept as it was.
    if (peeking.has(key) || openedAt.has(key)) return
    const one = stuck.find((each) => `${each.type}:${each.id}` === key)
    if (one && !win.isDestroyed()) one.bounds = win.getBounds()
    keepStuck()
  }
  // Picked up by your hand: the page lifts the card (a deeper shadow; paper
  // straightens). Any move of Haligtree's own (a lift on hover, a glide) stops
  // there, so nothing pulls against your hand.
  win.on('will-move', () => {
    if (win.isDestroyed()) return
    unlift.get(win)?.()
    grab(win)
    // Watched from the start on a Mac: picked up and put down without moving,
    // it is set down too. Elsewhere 'moved' comes once, at the end (hand.ts).
    if (process.platform === 'darwin') (inLine = false), whenLetGo(win, letGo, lining)
    if (held.has(win)) return
    held.add(win)
    win.webContents.send('sticky:held', true)
  })
  // Moved by your hand: nothing happens until you let go (hand.ts), so it follows the pointer exactly.
  win.on('moved', () => {
    if (win.isDestroyed() || ours(win)) return
    if (held.has(win)) whenLetGo(win, letGo)
    // On a Mac a drag by hand always says 'will-move' first: a move without
    // one is a window manager's (AeroSpace hiding it on another workspace,
    // in the screen's corner). Left where it put it, never pulled back on
    // screen, which fought it, glitching in and out from the corner; and if
    // it was hidden, brought to the workspace you are on.
    else if (process.platform === 'darwin') parkedBy(win)
    else letGo()
  })
  // Carried into line with the screen's edge or another sticky, the trackpad
  // taps once (haptic.ts), as the Mac's own guides do; out of line and back, once again.
  let inLine = false
  const others = (): ReturnType<typeof cardOf>[] => [...stickies].filter(([other, one]) => one !== win && !one.isDestroyed() && one.isVisible() && stickyUp(other)).map(([other, one]) => cardOf(one.getBounds(), insetOf(other)))
  const lining = (now: Electron.Rectangle): void => {
    const card = cardOf(now, insetOf(key))
    const pulled = magnet(card, others(), screen.getDisplayMatching(now).workArea)
    const near = pulled.x !== card.x || pulled.y !== card.y
    if (near && !inLine) tap('align')
    inLine = near
  }
  // Let go: the card settles with a soft tap. Past an edge, it glides back
  // until the card is all in view; near the screen's edge or another sticky,
  // it glides into line with it (sticky-place.ts).
  const letGo = (): void => {
    if (win.isDestroyed()) return
    if (held.delete(win)) win.webContents.send('sticky:held', false)
    if (ours(win)) return
    // Put down by hand, a card opened out of its tab rests where it was put.
    openedAt.delete(key)
    const now = win.getBounds()
    const inset = insetOf(key)
    const area = screen.getDisplayMatching(now).workArea
    const inView = cardInView(now, inset, area)
    const pulled = magnet(cardOf(inView, inset), others(), area)
    const { x, y } = cardInView({ ...now, x: pulled.x - inset.left, y: pulled.y - inset.top }, inset, area)
    if (x !== now.x || y !== now.y) moveStickies([[key, win, { x, y }]], false)
    else remember()
  }
  win.on('resized', remember)
  // Its right-click menu: the writing's own Cut, Copy and Paste where you can
  // write, then the whole desk tidied, and taken back while it is fresh.
  win.webContents.on('context-menu', (_event, params) => {
    if (win.isDestroyed()) return
    const writing: Electron.MenuItemConstructorOptions[] = params.isEditable
      ? [{ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy }, { role: 'paste', enabled: params.editFlags.canPaste }, { type: 'separator' }]
      : params.selectionText ? [{ role: 'copy' }, { type: 'separator' }] : []
    // Its paper's colour, kept with it; a goal's card and the goals together keep their own.
    const now = stuckAs(key)?.tint ?? 'plain'
    const colours: Electron.MenuItemConstructorOptions[] = fixed ? [] : [
      { label: 'Paper colour', enabled: false },
      ...STICKY_TINTS.map(([tint, label]): Electron.MenuItemConstructorOptions => ({ label, icon: tintDot(tint), type: 'radio', checked: now === tint, click: () => tintSticky(key, tint) })),
      { type: 'separator' }
    ]
    Menu.buildFromTemplate([
      ...writing,
      ...colours,
      { label: 'Tidy stickies down the right edge', accelerator: chordFor('⌃⌥⌘T'), click: () => void tidyStickies(win.webContents) },
      ...(canUntidy() ? [{ label: 'Put stickies back where they were', click: untidyStickies }] : []),
      ...tuckItems()
    ]).popup({ window: win })
  })
  // Closed any way but quitting is taken down, so it stays down after a restart.
  // One peeling off after it was taken down is already gone from the lists.
  win.on('closed', () => {
    if (stickies.get(key) !== win) return
    stickies.delete(key)
    if (quitting) return
    stuck = stuck.filter((one) => `${one.type}:${one.id}` !== key)
    keepStuck()
    if (type === 'goal') changed({ kind: 'item', id })
  })
  stickies.set(key, win)
  for (const event of ['show', 'hide', 'closed'] as const) win.on(event as 'show', tellStickiesOut)
  tellStickiesOut()
  if (!stuck.some((one) => `${one.type}:${one.id}` === key)) stuck.push({ type, id, bounds: place })
  keepStuck()
  guard(win)
  // Its place in line, so neighbours lean opposite ways.
  const nth = stuck.findIndex((one) => `${one.type}:${one.id}` === key)
  const tint = stuckAs(key)?.tint
  load(win, `?view=sticky&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&nth=${nth}${glass ? '&glass=1' : ''}${tint && tint !== 'plain' ? `&tint=${tint}` : ''}`)
}
/** A sticky's paper in another colour: kept, and the card told so it can change before your eyes. */
function tintSticky(key: string, tint: string): void {
  const one = stuckAs(key)
  if (!one) return
  if (tint === 'plain') delete one.tint
  else one.tint = tint
  keepStuck()
  const win = stickies.get(key)
  if (win && !win.isDestroyed()) win.webContents.send('sticky:tint', tint)
}
/** The stickies left on the desktop last time, back where they were. */
async function restoreStickies(): Promise<void> {
  try {
    const read = JSON.parse(await readFile(stickyFile(), 'utf8')) as Stuck[]
    // The goal stack, from before each goal had a card of its own: its place is the first card's.
    stackWas = read.find((one) => one.type === 'goal' && one.id === 'stack')?.bounds
    const saved = read.filter((one) => !(one.type === 'goal' && one.id === 'stack'))
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
    } else if ((win !== focusPill || (focusWanted && focusBubbleShown() && !isWelcoming())) && (!url.includes('view=sticky') || [...stickies].some(([key, one]) => one === win && stickyUp(key)))) {
      win.setTitle(win.webContents.getTitle())
      win.showInactive()
    }
  }
}

/**
 * Seen by screen recorders and shares (the default), or kept out of them,
 * each kind of window by its own switch in Settings: the main window (and
 * every other window of Haligtree's: a note on its own, a drawing), quick
 * capture, the stickies and goal cards, and the session bubble with its glow.
 */
const groupOf = (win: BrowserWindow): keyof Recordings =>
  win === prompt ? 'box' : shielded.has(win) ? 'stickies' : win === focusPill || win === glow ? 'bubble' : 'main'
/** Kept out of shares and recordings, or not, as its kind's switch says. */
const protect = (win: BrowserWindow): void => win.setContentProtection(!recordingPrefs()[groupOf(win)])
// Kept out from the moment it is made, then set to its kind's switch once it
// is known which kind it is (before anything is shown): never seen by a camera in between.
app.on('browser-window-created', (_event, win) => {
  win.setContentProtection(true)
  setImmediate(() => !win.isDestroyed() && protect(win))
})

let homePainted = false
/**
 * The main window's page has drawn itself (its first render, then a frame):
 * not just Chromium's first paint, which comes before any of the app's code
 * has run and is a blank window. It is shown only once drawn, so arriving in
 * the sandbox (or anywhere) is never a blank screen for a moment.
 */
let homeDrawn = false
const drawnWaits: (() => void)[] = []
/** `then` once the main window's page has drawn itself; three seconds at most, whatever happens. */
function whenHomeDrawn(then: () => void): void {
  if (homeDrawn) return then()
  let done = false
  const go = (): void => void (done || ((done = true), then()))
  drawnWaits.push(go)
  setTimeout(go, 3000)
}
/** When the main window was made, drawn and shown, from the start of this run (ms): what the sandbox's opening probe reads. */
const homeTimes: { made?: number; painted?: number; drawn?: number; shown?: number } = {}
;(globalThis as { haligtreeHomeTimes?: typeof homeTimes }).haligtreeHomeTimes = homeTimes
/** How many trackpad taps were asked for (haptic.ts): what the stickies' probe reads. */
;(globalThis as { haligtreeTaps?: () => number }).haligtreeTaps = () => taps
/** What the main window was sent to while it was not yet listening. */
let sentTo: [string, string, string?] | null = null
let sentVia: Via | null = null
/** The main window's page has asked for what it was sent: it is listening. */
let homeAsked = false

/**
 * The sandbox from the menu bar, in or out: the main window comes up and goes
 * the same way as its own buttons do (the blade and its sound, your look
 * carried), so there is one way it happens.
 */
const openSandbox = (): void => inHome('haligtree:sandbox-enter')
const leaveSandbox = (): void => inHome('haligtree:sandbox-leave')

/** Something the main window does, asked for from the menu bar: a book switched to, a new one named. */
function inHome(event: string, detail: unknown = null): void {
  openHome()
  const win = makeHome()
  const go = (): void => void win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent(${JSON.stringify(event)}, { detail: ${JSON.stringify(detail)} }))`).catch(() => undefined)
  // Once the page has drawn itself, not just painted: its listeners are on by then, so nothing said
  // at the start (a restore, an import's end) is lost while the window is still coming up.
  whenHomeDrawn(go)
}

function openHome(): void {
  if (!home?.isVisible()) recordOpen('home')
  beaconMoment('open')
  // One window at a time: going to the main app puts the prompt away.
  if (prompt?.isVisible()) hideWindow(prompt)
  // Asked for from the menu bar or the box while another app is in front,
  // showing the window alone does not always bring Haligtree forward: `steal` does.
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
      // A brand-new Haligtree arrives as Arc and Dia do: the window comes up almost clear, the desktop
      // still showing through, and grows solid over a few seconds as the welcome's mist lifts.
      const misty = firstRun() && !homeTimes.shown
      if (misty) win.setOpacity(0)
      win.show()
      if (misty) {
        const from = performance.now()
        const LIFT = stillness() ? 400 : 3200
        const step = setInterval(() => {
          if (win.isDestroyed()) return clearInterval(step)
          const k = Math.min(1, (performance.now() - from) / LIFT)
          // Slow at first, as if you are not sure it opened, then settling in.
          win.setOpacity(k * k * (3 - 2 * k))
          if (k >= 1) clearInterval(step)
        }, 16)
      }
      // Started by a run that is waiting to go: it can now, with this window up in its place.
      arrived()
      if (!seen) setTimeout(() => void bringHere(win, here).then((now) => void (now && aerospace('workspace', here))), 60)
    })()
  whenHomeDrawn(reveal)
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
 * A sticky moved by a window manager. AeroSpace hides a window on another
 * workspace by moving it almost off its screen; a sticky is meant for every
 * workspace, so once it is parked like that each sticky it hid is moved to
 * the workspace in view, which AeroSpace then shows where it was. Without
 * AeroSpace, nothing is done.
 */
function parkedBy(win: BrowserWindow): void {
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).bounds
  const seenW = Math.max(0, Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x))
  const seenH = Math.max(0, Math.min(b.y + b.height, area.y + area.height) - Math.max(b.y, area.y))
  if (seenW * seenH > b.width * b.height * 0.1) return
  followWorkspace()
}
let following: ReturnType<typeof setTimeout> | null = null
function followWorkspace(): void {
  // A test run's windows are parked past the screen's edge on purpose: never sent anywhere, unless the run asks (HALIGTREE_QA_FOLLOW).
  if (!AEROSPACE || following || (process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_FOLLOW)) return
  following = setTimeout(async () => {
    following = null
    const here = await aerospace('list-workspaces', '--focused')
    if (!here) return
    // Each sticky by AeroSpace's own name for its window: the Mac's window number.
    const ours = new Set([...stickies].filter(([key, one]) => !one.isDestroyed() && stickyUp(key)).map(([, one]) => one.getMediaSourceId().split(':')[1]))
    const rows = await aerospace('list-windows', '--all', '--format', '%{window-id}|%{app-pid}|%{workspace}')
    for (const [id, pid, workspace] of rows.split('\n').map((row) => row.split('|')))
      if (Number(pid) === process.pid && ours.has(id) && workspace !== here) await aerospace('move-node-to-workspace', '--window-id', id, here)
  }, 150)
}

/**
 * Where the main window opens: where you last left it, or, the first time,
 * filling the usable part of the screen the pointer is on (under the menu
 * bar, beside the Dock), the way Spotify opens: large, but not full screen.
 * A saved place on a screen that is gone is not used.
 */
const homeFile = (): string => join(app.getPath('userData'), 'main-window.json')
function homePlace(): Electron.Rectangle {
  try {
    const saved = JSON.parse(readFileSync(homeFile(), 'utf8')) as Electron.Rectangle
    const area = screen.getDisplayMatching(saved).workArea
    const seen = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x) >= 120 && Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y) >= 80
    if ([saved.x, saved.y, saved.width, saved.height].every(Number.isFinite) && seen) return saved
  } catch {
    // Never opened yet: it fills the screen.
  }
  return { ...screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea }
}
/** Its size and place kept a moment after it stops changing; never full screen's, nor a glide's on the way. */
let homeKeep: ReturnType<typeof setTimeout> | null = null
function keepHomePlace(win: BrowserWindow): void {
  if (homeKeep) clearTimeout(homeKeep)
  homeKeep = setTimeout(() => {
    homeKeep = null
    if (win.isDestroyed() || win.isFullScreen() || !win.isVisible() || pending?.win === win) return
    void writeFile(homeFile(), JSON.stringify(win.getBounds())).catch(() => undefined)
  }, 400)
}

/**
 * Whether a window covers its screen's work area, read from where it is (or
 * is gliding to), never from `isMaximized`: a Mac's maximize is a zoom that a
 * tiling manager or a second screen can stop short while it still says yes.
 */
function fillsScreen(win: BrowserWindow): boolean {
  const bounds = boundsOf(win)
  return win.isFullScreen() || sameBox(bounds, screen.getDisplayMatching(bounds).workArea)
}
const tellFilled = (win: BrowserWindow): void => void (!win.isDestroyed() && win.webContents.send('home:filled', fillsScreen(win)))

/**
 * The red dot or ⌘W: the main window is put away, not closed, and comes
 * back the size and place it was put away at (see homePlace).
 *
 * Done here, never on the window's 'hide': on a Mac Electron also says
 * 'hide' whenever the window is merely covered, and going full screen moves
 * it to a Space of its own, as does switching Spaces or a tiling manager
 * parking it. Read as a put-away, that took the window straight back out of
 * full screen, so the green button and ⌃⇧F never held. Covered, the page
 * learns it from the browser's own visibility.
 */
function putHomeAway(): void {
  if (!home || home.isDestroyed()) return
  // Out of full screen first, then away: hidden while full screen, it would
  // leave its own Space behind, empty and black.
  if (home.isFullScreen()) return void (home.once('leave-full-screen', putHomeAway), home.setFullScreen(false))
  // Hidden, a page still reads as visible here: told, so its looping
  // effects (beams, orbs) stop until it is back.
  home.webContents.send('window:hiding')
  home.hide()
}


/**
 * The main window, made hidden: soon after start, so the first open is as
 * quick as every other, and again only if it is ever really gone. Closing it
 * (the red dot, ⌘W) hides it, as Todoist's does: Haligtree keeps running in the
 * Dock and the menu bar, and only quitting closes it for good.
 */
function makeHome(): BrowserWindow {
  if (home) return home

  // Large to start, filling the screen's usable part, then where you leave it.
  const place = homePlace()
  home = new BrowserWindow({
    ...place,
    show: false,
    title: APP_NAME,
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
  // Its place said again once made: a window made before it is shown can be
  // put in the middle of the screen instead of where it was asked to be.
  home.setBounds(place)
  home.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    // Mid-welcome, ⌘W or the red dot would leave it half done, so it stays
    // until it is finished or skipped.
    if (isWelcoming()) return void home?.webContents.send('onboarding:held')
    putHomeAway()
  })
  home.on('closed', () => {
    home = null
    homePainted = false
    homeDrawn = false
    homeAsked = false
  })
  homeTimes.made ??= Math.round(performance.now())
  home.once('ready-to-show', () => ((homePainted = true), (homeTimes.painted ??= Math.round(performance.now()))))
  home.once('show', () => void (homeTimes.shown ??= Math.round(performance.now())))
  // The fill icon follows the window, however it was filled or brought back:
  // the green button, a drag, a tiling manager. Not while it glides.
  for (const change of ['maximize', 'unmaximize', 'resized', 'moved', 'enter-full-screen', 'leave-full-screen'] as const)
    home.on(change as 'resized', () => void (home && pending?.win !== home && (tellFilled(home), keepHomePlace(home))))
  guard(home)
  load(home, '?view=home')
  // A freeze in a development run says where it was stuck (src/main/freeze-catch.ts).
  catchFreezes(home, 'main window')
  return home
}

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
  // Not while the promote glide has it on its way to the main window: that size is the glide's, not the box's.
  if (promoting && win === prompt) return Promise.resolve()
  // Nor while it is tucked away for an area pick: fitted once it is back (shots:screen).
  if (tuckedWindow === win) return Promise.resolve()
  const next = anchored(win, bounds.x, win === prompt && !win.isFullScreen() ? boxWidth() : bounds.width, boxHeight())
  // Already there, or on its way: a glide under way is never restarted.
  if (sameBox(next, bounds) && !(snap && pending)) return Promise.resolve()
  return reshape(win, next, snap)
}
/** Where the box's left edge was before the side panel opened, and where opening put it: the same test, sideways. */
let panelFrom: { x: number; became: number } | null = null

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
 * A goal's beacon, kept as its goal says. Always: up on every Space. Now and
 * then: tucked away, out at a few moments (the first wake or unlock of the
 * day, the first time Haligtree is opened that day, and every three hours or so
 * of being at the Mac), then tucked again a minute later unless the pointer
 * is on it. Off: none. In a goal's last week, or past its day, now and then
 * stays up as always does. Quiet hours, safe mode and the stickies put away
 * all keep it down, as for any sticky.
 *
 * Each goal's beacon is a card of its own (a sticky of type 'goal'), with
 * only that goal on it. All of them together, each in its own colour with a
 * legend, is one more sticky, 'goals:all', put up by hand like a note.
 */
const GOAL_SIZE = { width: 308, height: 368 }
/** As glass: the card fills it. */
const GOAL_GLASS = { width: 268, height: 328 }
const GOALS_SIZE = { width: 340, height: 400 }
const GOALS_GLASS = { width: 300, height: 360 }
/** Where the old goal stack sat, for the first goal card made after it. */
let stackWas: Electron.Rectangle | undefined
/** When each beacon may show again; Infinity is "at its next moment". */
const tucked = new Map<string, number>()
const beaconModes = new Map<string, 'always' | 'sometimes'>()
/** The goal cards the pointer is on: they never tuck away. */
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
  // Open goals come nearest day first, so one past its day is first of all.
  const goals = openGoals()
  const want = new Map(goals.map((goal) => [goal.id, beaconMode(goal)]))
  for (const key of [...beaconModes.keys()]) {
    const mode = want.get(key.slice(5))
    if (!mode || mode === 'off') (beaconModes.delete(key), tucked.delete(key))
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
  }
  // A window for each goal with a beacon, nearest day first so they fan down in that order; none for the rest.
  for (const key of [...stickies.keys()]) if (key.startsWith('goal:') && !beaconModes.has(key)) stick('goal', key.slice(5), false)
  for (const goal of goals) {
    if (!beaconModes.has(`goal:${goal.id}`) || stickies.has(`goal:${goal.id}`)) continue
    const at = stackWas
    stackWas = undefined
    stick('goal', goal.id, true, at)
  }
  applyRules()
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
 * Tuck away by the clock (goal-tuck.ts, Settings' "Tuck away"): each goal
 * card that would always be up is shown, peeking or tucked as the hour and a
 * focus session say. Peeking, its window is a slim tab at the nearer edge of
 * the screen, level with where the card rests; pointed at, it opens into the
 * card at its own place, and folds back to the tab once the pointer has left
 * it for half a second. A card out of sight two days peeks out by itself
 * once that day, for ten minutes, with a small wiggle: seen again, never nagged.
 */
const ruled = new Map<string, Rest>()
/** The cards peeking now, each with the place its whole card rests at. */
const peeking = new Map<string, Electron.Rectangle>()
/** Peeked out by itself, till then. */
const peekingOut = new Map<string, number>()
/** A peeking card's tab: its ring and days left, a little taller than wide. */
const TAB = { width: 46, height: 116 }
/** Every sticky tucked: a tab with its name written down it, or only a small coloured pill. */
const TUCK = { tabs: { width: 30, height: 124 }, flat: { width: 10, height: 44 } }
/** Stacked close, as file tabs are. */
const TUCK_GAP = 3
/** The side and kind of tab each peeking card was made as, so a change of either remakes it. */
const tabShape = new Map<string, string>()
/** What each tab was last told it is, asked for again by a sticky's page as it loads (a reload, or told before it listened). */
const peekSaid = new Map<string, { side: 'left' | 'right'; nudge: boolean; flat: boolean; tucked: boolean }>()
ipcMain.handle('beacon:peek:now', (event) => {
  const key = keyOfSticky(BrowserWindow.fromWebContents(event.sender))
  return key && peeking.has(key) ? (peekSaid.get(key) ?? null) : null
})
/** When each card was last seen whole, and the day it last peeked out by itself: kept across restarts. */
type Seen = { last: Record<string, number>; nudged: Record<string, string> }
const seenFile = (): string => join(app.getPath('userData'), 'goal-seen.json')
let seen: Seen | null = null
let seenKept = 0
const seenNow = (): Seen => {
  if (seen) return seen
  try {
    const read = JSON.parse(readFileSync(seenFile(), 'utf8')) as Seen
    seen = { last: read.last ?? {}, nudged: read.nudged ?? {} }
  } catch {
    seen = { last: {}, nudged: {} }
  }
  return seen
}
/** The record, for the tuck-away probe to age. */
;(globalThis as { haligtreeGoalSeen?: () => Seen }).haligtreeGoalSeen = () => seenNow()
const keepSeen = (): void => void ((seenKept = Date.now()), writeFile(seenFile(), JSON.stringify(seenNow())).catch(() => undefined))
/** Each card's place now, and every card moved to it. */
function applyRules(): void {
  const rules = tuckRules()
  const clockNow = new Date().toTimeString().slice(0, 5)
  const base = restNow(rules, clockNow, rules.on && !!activeSession())
  const now = Date.now()
  const today = dayKey()
  const record = seenNow()
  let moved = false
  let told = false
  for (const [key, mode] of beaconModes) {
    let rest: Rest = mode === 'always' ? base : 'show'
    record.last[key] ??= now
    if (peeksOut(rest, rules, record.last[key], record.nudged[key], now, today)) {
      record.nudged[key] = today
      peekingOut.set(key, now + PEEK_OUT_MS)
      nudging.add(key)
      told = true
    }
    if (rest === 'tuck' && (peekingOut.get(key) ?? 0) > now) rest = 'peek'
    if ((ruled.get(key) ?? 'show') !== rest) (moved = true), rest === 'show' ? ruled.delete(key) : ruled.set(key, rest)
  }
  for (const key of [...ruled.keys()]) if (!beaconModes.has(key)) (ruled.delete(key), (moved = true))
  // Seen whole now: the days out of sight start again.
  for (const [key, win] of stickies)
    if (key.startsWith('goal:') && !win.isDestroyed() && win.isVisible() && stickyUp(key) && !peeking.has(key)) record.last[key] = now
  if (told || now - seenKept > 10 * 60_000) keepSeen()
  if (moved) applyStickies()
}
/** Cards peeking out by themselves this moment: told so, they wiggle as they come. */
const nudging = new Set<string>()
/** A card opened out of its tab, away from its own place: where that place is. */
const openedAt = new Map<string, Electron.Rectangle>()
/** Watches the pointer over a card opened from its tab; gone from it for half a second, it folds back. */
const peekWatch = new Map<string, ReturnType<typeof setInterval>>()
const inside = (p: Electron.Point, b: Electron.Rectangle): boolean => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
/** A goal's window as a tab or as its card, as its place by the clock says and the pointer allows. */
function shapeCard(key: string, win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const tuck = stickyTuck()
  const want = stickyUp(key) && (tuck !== 'off' || ruled.get(key) === 'peek') && !beaconHeld.has(key)
  if (!want && !peeking.has(key)) return
  if (want) {
    // Opened out of its tab, its own place is still the one it rests at.
    const rest = peeking.get(key) ?? openedAt.get(key) ?? win.getBounds()
    openedAt.delete(key)
    const area = screen.getDisplayMatching(rest).workArea
    const left = rest.x + rest.width / 2 < area.x + area.width / 2
    // All tucked: a named tab each (or a small flat pill), stacked down their edge in the order they rest, never on top of each other.
    const size = tuck === 'off' ? TAB : TUCK[tuck]
    const side = [...stickies].filter(([one, other]) => !other.isDestroyed() && stickyUp(one))
      .map(([one, other]) => [one, one === key ? rest : peeking.get(one) ?? openedAt.get(one) ?? other.getBounds()] as const)
      .filter(([, at]) => (at.x + at.width / 2 < area.x + area.width / 2) === left && screen.getDisplayMatching(at).id === screen.getDisplayMatching(rest).id)
      .sort(([a, one], [b, two]) => one.y - two.y || a.localeCompare(b))
    const nth = side.findIndex(([one]) => one === key)
    const y = tuck === 'off'
      ? Math.max(area.y, Math.min(rest.y + insetOf(key).top, area.y + area.height - size.height))
      : Math.max(area.y, Math.min(area.y + Math.round(area.height * 0.18) + nth * (size.height + TUCK_GAP), area.y + area.height - size.height))
    const tab = { x: left ? area.x : area.x + area.width - size.width, y, ...size }
    const now = win.getBounds()
    const shape = `${left}:${tuck}`
    if (peeking.has(key) && tabShape.get(key) === shape && now.x === tab.x && now.y === tab.y && now.width === tab.width) return
    const fresh = !peeking.has(key) || tabShape.get(key) !== shape
    peeking.set(key, rest)
    tabShape.set(key, shape)
    if (fresh) {
      const peek = { side: left ? 'left' : 'right', nudge: nudging.delete(key), flat: tuck === 'flat', tucked: tuck !== 'off' } as const
      peekSaid.set(key, peek)
      win.webContents.send('beacon:peek', peek)
    }
    win.setMinimumSize(1, 1)
    placed.set(win, { x: tab.x, y: tab.y })
    win.setBounds(tab)
    return
  }
  tabShape.delete(key)
  const rest = peeking.get(key)!
  peeking.delete(key)
  // Pointed at, it opens out of its tab, under the pointer, so it stays open
  // while you read it; come out by the clock, it goes back to its own place.
  const tab = win.getBounds()
  const area = screen.getDisplayMatching(tab).workArea
  const top = Math.max(area.y, Math.min(tab.y - insetOf(key).top, area.y + area.height - rest.height))
  const to = beaconHeld.has(key) ? { ...rest, x: tab.x <= area.x ? area.x : area.x + area.width - rest.width, y: top } : rest
  if (to !== rest) openedAt.set(key, rest)
  peekSaid.delete(key)
  win.webContents.send('beacon:peek', null)
  placed.set(win, { x: to.x, y: to.y })
  win.setMinimumSize(214, 124)
  win.setBounds(to)
  // Opened by the pointer: back to the tab once it has gone from the card.
  clearInterval(peekWatch.get(key))
  if (!beaconHeld.has(key)) return
  let away = 0
  peekWatch.set(key, setInterval(() => {
    if (win.isDestroyed() || peeking.has(key) || !beaconHeld.has(key)) return void (clearInterval(peekWatch.get(key)), peekWatch.delete(key))
    away = inside(screen.getCursorScreenPoint(), win.getBounds()) ? 0 : away + 1
    if (away < 2) return
    clearInterval(peekWatch.get(key))
    peekWatch.delete(key)
    beaconHeld.delete(key)
    shapeCard(key, win)
  }, 250))
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

/**
 * Every sticky to the screen the pointer is on, fanned from its top right: the
 * way back for one lost off an edge. Those out glide there one after another,
 * as Tidy's do; one put away by Show sticky notes is placed, then comes in.
 */
function gatherStickies(): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  let n = 0
  const moves: [string, BrowserWindow, { x: number; y: number }][] = []
  for (const [key, win] of stickies) {
    // Only those meant to be up: never one put away, nor any in safe mode.
    if (win.isDestroyed() || !stickyUp(key) || peeking.has(key)) continue
    const { width, height } = win.getBounds()
    const bounds = onScreen({ width, height, x: workArea.x + workArea.width - width - (n % 2) * 24, y: workArea.y + n * 64 })
    n += 1
    if (win.isVisible()) {
      moves.push([key, win, { x: bounds.x, y: bounds.y }])
      continue
    }
    placed.set(win, { x: bounds.x, y: bounds.y })
    win.setPosition(bounds.x, bounds.y)
    const one = stuckAs(key)
    if (one) one.bounds = win.getBounds()
    arriveSticky(win)
  }
  keepStuck()
  moveStickies(moves)
}

/** Stickies Haligtree is moving now, and those your hand has picked up: a move of either is never taken for the other. */
const moving = new WeakSet<BrowserWindow>()
const held = new WeakSet<BrowserWindow>()
/** A sticky's lift on hover, called off when your hand picks it up. */
const unlift = new WeakMap<BrowserWindow, () => void>()

/**
 * Move a sticky's window along a path, a step every display frame on the one
 * clock all glides share (sticky-place.ts), so several move together without
 * stutter; it stops if your hand takes it on the way.
 */
function glide(win: BrowserWindow, ms: number, at: (t: number) => { x: number; y: number }, done?: () => void): void {
  moving.add(win)
  tween(ms, (t) => {
    if (win.isDestroyed() || held.has(win) || (placed.has(win) && !ours(win))) return (moving.delete(win), false)
    const to = at(t)
    const now = win.getBounds()
    placed.set(win, to)
    if (now.x !== to.x || now.y !== to.y) win.setPosition(to.x, to.y)
    return true
  }, () => {
    moving.delete(win)
    done?.()
  })
}

/**
 * Each sticky to a place, gliding one after another (40ms apart, the later
 * ones laid on top as cards dealt down a table are), or at once with Motion
 * off; kept as its place once there. `deal` false: one sticky put in line
 * where it lies, not brought to the top.
 */
function moveStickies(moves: [string, BrowserWindow, { x: number; y: number }][], deal = true): void {
  const still = stillness()
  moves.forEach(([key, win, to], nth) => {
    const land = (): void => {
      if (win.isDestroyed()) return
      const one = stuckAs(key)
      if (one) (one.bounds = win.getBounds()), keepStuck()
    }
    const go = (): void => {
      if (win.isDestroyed()) return
      const from = win.getBounds()
      // Marked as Haligtree's own move first, so the glide is never taken for a drag.
      placed.set(win, { x: from.x, y: from.y })
      if (deal) win.moveTop()
      if (still) return (placed.set(win, to), win.setPosition(to.x, to.y), land())
      // Ease-out quart, as the box's own glide (reshape): most of the way at once, then settling.
      glide(win, 320, (t) => ({ x: Math.round(from.x + (to.x - from.x) * outQuart(t)), y: Math.round(from.y + (to.y - from.y) * outQuart(t)) }), land)
    }
    if (still || nth === 0) go()
    else setTimeout(go, nth * 40)
  })
}

/** Where each sticky was before the last tidy, for "Put them back", while it is fresh. */
let untidy: { moves: [string, BrowserWindow, { x: number; y: number }][]; until: number } | null = null
const UNTIDY_FOR = 10_000
const canUntidy = (): boolean => !!untidy && untidy.until > Date.now()

/**
 * Every sticky out now, tidied on its own screen: a neat column down the
 * right edge, 24 points in, centred on the screen's height but never in its
 * top quarter, where other apps keep their buttons at the top right. Too many
 * for one column, they overlap as a fan, each peeking out below the last, and
 * every second one a little to the left so the edges read apart.
 * Each screen keeps its own: one plugged in for slides keeps the ones put there.
 * Said with "Put them back" by the window you asked from, or another one in sight.
 */
function tidyStickies(asker?: Electron.WebContents): number {
  const MARGIN = 24
  const GAP = 12
  const up = [...stickies].filter(([key, win]) => !win.isDestroyed() && stickyUp(key) && win.isVisible() && !peeking.has(key))
  const screens = new Map<number, { area: Electron.Rectangle; wins: [string, BrowserWindow][] }>()
  for (const [key, win] of up) {
    const display = screen.getDisplayMatching(win.getBounds())
    const one = screens.get(display.id) ?? { area: display.workArea, wins: [] }
    one.wins.push([key, win])
    screens.set(display.id, one)
  }
  const moves: [string, BrowserWindow, { x: number; y: number }][] = []
  const back: [string, BrowserWindow, { x: number; y: number }][] = []
  for (const { area, wins } of screens.values()) {
    // Each colour together (plain first), and top to bottom as they were within it, so the order you had them in is kept.
    const shade = (key: string): number => STICKY_TINTS.findIndex(([tint]) => tint === (stuckAs(key)?.tint ?? 'plain'))
    wins.sort(([one, a], [two, b]) => shade(one) - shade(two) || a.getBounds().y - b.getBounds().y || a.getBounds().x - b.getBounds().x)
    const sizes = wins.map(([, win]) => win.getBounds())
    const top = area.y + Math.round(area.height * 0.25)
    const bottom = area.y + area.height - MARGIN
    const room = bottom - top
    const whole = sizes.reduce((sum, one) => sum + one.height, 0) + GAP * (sizes.length - 1)
    // One column if it fits; otherwise each steps down just enough for the last to end at the bottom.
    const fan = whole > room
    const last = sizes[sizes.length - 1].height
    const step = fan ? Math.max(8, Math.floor((room - last) / Math.max(1, sizes.length - 1))) : 0
    const tall = fan ? step * (sizes.length - 1) + last : whole
    let y = Math.max(top, Math.min(bottom - tall, Math.round(area.y + (area.height - tall) / 2)))
    wins.forEach(([key, win], nth) => {
      const { x, y: was, width, height } = sizes[nth]
      const right = area.x + area.width - MARGIN - width - (fan && nth % 2 ? 16 : 0)
      back.push([key, win, { x, y: was }])
      moves.push([key, win, { x: right, y }])
      y += fan ? step : height + GAP
    })
  }
  if (!moves.length) return 0
  untidy = { moves: back, until: Date.now() + UNTIDY_FOR }
  moveStickies(moves)
  // The menu bar offers the way back while it is fresh, then drops it.
  updateTray()
  setTimeout(updateTray, UNTIDY_FOR + 50)
  // Said where it will be seen: the window that asked if it is out, else the
  // main window or the box. Never inside a sticky: a notice on a card reads as
  // part of the note, and the move says itself, with "Put stickies back" in the menu bar.
  const seen = (win: BrowserWindow | null | undefined): boolean => !!win && !win.isDestroyed() && win.isVisible() && !keyOfSticky(win)
  const from = asker ? BrowserWindow.fromWebContents(asker) : null
  ;[from, home, prompt].find(seen)?.webContents.send('stickies:tidied', moves.length)
  return moves.length
}

/** "Put them back": each sticky to where it was before the last tidy. */
function untidyStickies(): void {
  if (!untidy) return
  const { moves } = untidy
  untidy = null
  moveStickies(moves.filter(([key, win]) => !win.isDestroyed() && stickies.get(key) === win))
  updateTray()
}

/**
 * Nudge a rectangle back onto the screen it is mostly on.
 *
 * There is no built-in for this. macOS keeps a window on screen when a person
 * drags it, but `setBounds` is not a drag and is taken literally - so growing
 * a window parked near an edge pushes half of it off. Pinned to the top left
 * of the work area if it is somehow bigger than the screen, which is the half
 * worth keeping.
 */
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
/**
 * Where the box was thrown to on each screen (⌘ and a two-finger flick, or
 * ⌃⌥ and an arrow), by the screen's id, kept across restarts in a small file
 * beside the data: summoned on that screen again, it comes back there.
 */
let spots: Map<number, { x: number; y: number }> | null = null
const spotsFile = (): string => join(app.getPath('userData'), 'box-spots.json')
function thrownSpots(): Map<number, { x: number; y: number }> {
  if (spots) return spots
  try {
    spots = new Map(Object.entries(JSON.parse(readFileSync(spotsFile(), 'utf8')) as Record<string, { x: number; y: number }>).map(([id, at]) => [Number(id), at]))
  } catch {
    spots = new Map()
  }
  return spots
}
function keepSpot(display: number, at: { x: number; y: number }): void {
  thrownSpots().set(display, { x: at.x, y: at.y })
  try {
    writeFileSync(spotsFile(), JSON.stringify(Object.fromEntries(thrownSpots())))
  } catch {
    // Kept for this run only.
  }
}

/**
 * Which way the wheel reads on this Mac. With natural scrolling (macOS's own
 * default, so on when the setting was never touched) a page's wheel deltas
 * run against the fingers; with it off they run with them. Chromium's pages
 * are not told which (no webkitDirectionInvertedFromDevice), so it is read
 * from the system's setting, fresh each time, as it can change at any moment.
 */
const naturalScrolling = (): boolean => !['0', 'false', 'NO'].includes(String(systemPreferences.getUserDefault('com.apple.swipescrolldirection', 'string') ?? ''))
/** Wheel deltas turned the way the fingers went. */
const fingersWay = (dx: number, dy: number): [number, number] => (process.platform === 'darwin' && naturalScrolling() ? [-dx, -dy] : [dx, dy])

/**
 * Thrown: the box glides along the way given until it is flush with the
 * screen's edge, and rests there. One curve from start to end on the
 * display's own frames, easing out: off at about the fingers' speed (`speed`,
 * px a ms, from a flick), slowing to a stop, never past and back. From the
 * wheel, the way is turned the fingers' way first. At once with Motion off or
 * Reduce motion.
 */
let throwing: (() => void) | null = null
function throwBox(win: BrowserWindow, dx: number, dy: number, speed = 0): void {
  if (win.isDestroyed() || (!dx && !dy)) return
  if (speed > 0) [dx, dy] = fingersWay(dx, dy)
  if (pending?.win === win) (arriving?.(), settle())
  throwing?.()
  const from = win.getBounds()
  const display = screen.getDisplayMatching(from)
  const to = throwSpot(from, display.workArea, dx, dy)
  const land = (): void => {
    throwing = null
    lastBounds = { ...from, x: to.x, y: to.y }
    anchor = { y: to.y, became: to.y }
    keepSpot(display.id, to)
    if (!app.isPackaged) console.log(`[haligtree] box thrown to ${to.x},${to.y} on screen ${display.id}`)
  }
  const far = Math.hypot(to.x - from.x, to.y - from.y)
  if (stillness() || far < 1) return (win.setPosition(to.x, to.y), land())
  // An ease-out sine leaves at pi/2 times the average speed: matched to the fingers' when flicked.
  const ms = Math.round(speed > 0 ? Math.max(120, Math.min(560, ((Math.PI / 2) * far) / speed)) : Math.min(520, 300 + far * 0.12))
  // A frame in already: the first step comes at once, a frame's worth, so the fingers' last move flows straight on.
  const lead = 1000 / 60 / ms
  throwing = tween(ms, (t) => {
    if (win.isDestroyed()) return false
    const k = Math.sin((Math.min(1, t + lead) * Math.PI) / 2)
    win.setPosition(Math.round(from.x + (to.x - from.x) * k), Math.round(from.y + (to.y - from.y) * k))
    return true
  }, () => (!win.isDestroyed() && win.setPosition(to.x, to.y), land()))
}

function summonedAt(win: BrowserWindow): { place: Electron.Rectangle; top: number } {
  // Its size now, which the content may have changed while it was away; its
  // top where it was left, not where the screen's bottom last pushed it.
  const { height } = boundsOf(win)
  const width = boxWidth()
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
  // Thrown to a place on this screen before: back there.
  const spot = thrownSpots().get(screen.getDisplayMatching(area).id)
  if (spot) return put({ width, height, x: spot.x, y: spot.y })
  const along = (at: number, from: number, span: number, size: number, to: number, room: number): number =>
    Math.round(to + ((at - from) / Math.max(1, span - size)) * Math.max(0, room - size))
  return put({ width, height, x: along(left.x, was.x, was.width, width, area.x, area.width), y: along(left.y, was.y, was.height, full, area.y, area.height) })
}

function createWindow(): void {
  // Create the browser window.
  promptPainted = false
  const mainWindow = (prompt = new BrowserWindow({
    // First seen at the top middle of the screen you are on.
    // Short until the page says how much it needs: see FIT_MIN.
    ...topMiddle(pointerArea(), SIZES.compact.width, SIZES.compact.height),
    height: FIT_MIN,

    resizable: false,
    // A panel, the kind of window Spotlight and Raycast use: it takes the keys
    // without making Haligtree the active app. Summoned over Safari, Safari stays
    // in front and the main window stays behind it; put away, the keys are
    // simply Safari's again. An ordinary window would have to bring Haligtree
    // forward, and with it every Haligtree window, the main one included.
    type: 'panel',
    // No window buttons at all which, with being on every Space (below), is
    // what keeps a tiling window manager's hands off this window. Haligtree has a
    // Dock icon, so AeroSpace's rule for menu bar apps (a window with no
    // close button is "not even a real window") no longer covers it; measured
    // with AeroSpace 0.20, a window with no buttons that is on every Space is
    // never listed, tiled or filed under a workspace, focused or not. Summon
    // it from anywhere and it turns up where you are.
    //
    // All three, not just `closable`: macOS drops the button row only when the
    // style mask has none of them left, and until then the close button is
    // merely disabled - which the accessibility tree still counts as a button.
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
  // Kept out of screen shares and recordings unless its switch says otherwise,
  // so a call never shows what you are jotting. Honoured by older capture;
  // recorders on Apple's newer ScreenCaptureKit may still see it.
  protect(mainWindow)

  // the ready-to-show event on the BrowserWindow class will be emitted when the renderer process has rendered the page for the first time if the window has not been shown yet.
  // Showing the window after this event will have no visual flash:
  // Like Raycast: the app starts in the background, ready, and the box shows
  // only when summoned (the shortcut or the menu bar). A test run, which
  // drives the window directly, still gets it on screen.
  // Clicked away from, the box puts itself away, as Raycast's does. Not for
  // a window of its own (a picture it opened) or a dialog it asked for, and
  // not in a test run, whose box sits parked while another window is driven.
  mainWindow.on('blur', () => {
    if (!boxAutoHide() || dialogs > 0 || (process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_AUTOHIDE)) return
    setTimeout(() => {
      if (mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isFocused() || dialogs > 0) return
      if (BrowserWindow.getFocusedWindow()?.getParentWindow() === mainWindow) return
      if (mainWindow.webContents.isDevToolsFocused()) return
      hideWindow(mainWindow)
    }, 120)
  })
  mainWindow.on('ready-to-show', () => {
    if (!process.env.HALIGTREE_USER_DATA) return
    arrive(mainWindow)
    recordOpen('prompt')
    mainWindow.webContents.send('window:shown')
  })


  // macOS-only: kill the traffic lights that titleBarStyle:'hidden' leaves behind
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
    // macOS brings them back when the window is shown as a child of another, or
    // its level, size or space changes (opened from "New" in the main window):
    // put away again each time, so the box never shows lights that do nothing.
    const lightsOff = (): void => void (!mainWindow.isDestroyed() && mainWindow.setWindowButtonVisibility(false))
    for (const when of ['show', 'focus', 'resize', 'move', 'restore', 'enter-full-screen', 'leave-full-screen'] as const) mainWindow.on(when as 'show', lightsOff)

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
    //
    // `skipTransformProcessType` here and on every window put on all Spaces:
    // without it Electron turns Haligtree into a menu bar app to do this, and the
    // Dock icon vanishes. Being a panel is what lets the box over a
    // full-screen app instead (the stickies and the glow are panels too). The
    // session pill is not: as a panel its screenshot button broke, so it no
    // longer shows over another app's full-screen Space.
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
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
  // Gone while up (not put away): back in the Dock all the same.
  mainWindow.on('closed', () => (clearInterval(pointer), quitting || boxUp(false)))

  guard(mainWindow)
  load(mainWindow)
}

// Every web request carries a short line saying what browser is asking. This edits that line to stop announcing Electron.
// What the line looks like. Electron's default, on your machine:
// Mozilla/5.0 (Macintosh; …) Chrome/152.0.7977.78 haligtree/1.0.0 Electron/44.3.0 Safari/537.36
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
// Same shape, but the name has to be built while the app is running, because it comes from package.json and this file cannot know it in advance. That is the only reason one is written as a plain pattern and the other is assembled. The \\/ is an escaped slash, awkward only because it lives inside a string first. The 'i' makes it case-insensitive, so Haligtree and haligtree both go.
//
// Two details worth knowing. Each replace hits only the first match, which is fine since each token appears once. And this must run before the app is ready, like the scheme registration, or requests have already started going out with the old line.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/[\d.]+/, '')
  .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '')

// An ordinary app, the way Todoist is one: a Dock icon, a place in ⌘Tab, the
// main window opened when you open Haligtree and put away (not closed) by the red
// dot, until ⌘Q. Quick capture stays apart from all that: ⌘. and the menu bar
// icon summon it whether the main window is open or not, and it is a panel
// that never brings the main window forward or gets tiled (see the box's
// window). Started at login, Haligtree waits in the Dock and the menu bar with
// no window open.
if (process.platform === 'darwin') app.setActivationPolicy('regular')

// Started by the Mac at login rather than by you, so no window opens. Read as
// the launch finishes, while macOS can still say how it was launched. Where
// it does not say (its newer login items may not), a start in the first three
// minutes after the Mac booted, with Open at login on, counts too: opened by
// you that early, Haligtree would already be running, and your click reopens it.
// `--at-login` says so outright, for the tests.
let startedAtLogin = process.argv.includes('--at-login')
app.once('ready', () => {
  if (process.platform !== 'darwin' || startedAtLogin) return
  const login = app.getLoginItemSettings()
  startedAtLogin = login.wasOpenedAtLogin || (app.isPackaged && login.openAtLogin && uptime() < 180)
})

// Somewhere else to keep everything, for the QA runs: they drive this same app,
// and must never open the database your real captures are in.
// The app is called Haligtree (it was Vigil, and mindflow before that), and
// so is its data folder (realRoot in sandbox.ts). The old folder,
// ~/Library/Application Support/mindflow, is left as it was, as a backup;
// the first launch after the rename copies it in (old-data.ts, from sandbox.ts).
app.setName(APP_NAME)
// The sandbox (a restart with --sandbox) keeps everything in a folder of its
// own inside this one, so it is apart by path alone: see sandbox.ts.
const locked = useDataFolder()
// Every window says when it goes into the Mac's full screen or comes out (and
// after a reload while in it): full screen has no traffic lights, so the page
// closes up the room its toolbar keeps for them (see the preload).
app.on('browser-window-created', (_, win) => {
  const tell = (on: boolean): void => void (!win.isDestroyed() && win.webContents.send('window:fullscreen', on))
  win.on('enter-full-screen', () => tell(true))
  win.on('leave-full-screen', () => tell(false))
  win.webContents.on('did-finish-load', () => void (win.isFullScreen() && tell(true)))
})
// Test runs only: every window sits past the screen's right edge, unseen,
// unclickable and never focused, so a run never lands on top of anyone's work.
if (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_AWAY) {
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
  // Faded in or out, a window stays unseen: what was asked for is kept for the checks to read.
  const setOpacity = proto.setOpacity
  proto.setOpacity = function (this: BrowserWindow, value: number) { (this as { qaOpacity?: number }).qaOpacity = value; setOpacity.call(this, 0) }
  // HALIGTREE_QA_VIRTUAL: each window keeps the place it was given as its own,
  // while really parked, so glides and placing can be checked off screen.
  if (process.env.HALIGTREE_QA_VIRTUAL) {
    const virtual = new WeakMap<BrowserWindow, Electron.Rectangle>()
    const getBounds = proto.getBounds
    proto.getBounds = function (this: BrowserWindow) { return { ...(virtual.get(this) ?? getBounds.call(this)) } }
    proto.setBounds = function (this: BrowserWindow, next: Partial<Electron.Rectangle>) { virtual.set(this, { ...this.getBounds(), ...next }); setBounds.call(this, next); away(this) }
    // Parked already: only the place it keeps as its own moves.
    proto.setPosition = function (this: BrowserWindow, x: number, y: number) { virtual.set(this, { ...this.getBounds(), x, y }) }
    app.on('browser-window-created', (_, win) => virtual.set(win, getBounds.call(win)))
  }
  app.focus = () => {}
  app.on('browser-window-created', (_, win) => away(win))
  // Parked in the same spot, two runs side by side cover each other's windows,
  // and macOS then stops a covered window's frames: its page waits forever for
  // the next one. Every window keeps drawing, covered or not.
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.on('web-contents-created', (_, contents) => contents.setBackgroundThrottling(false))
  // Silent too: a run's chimes never reach the speakers (the sounds still
  // play inside the page, so checks on them hold). HALIGTREE_QA_SOUND=1 to hear them.
  if (!process.env.HALIGTREE_QA_SOUND) app.on('web-contents-created', (_, contents) => contents.setAudioMuted(true))
  // And never a dialog on the screen of whoever is at the Mac: an error in a
  // run goes to the run's output, where the checks read it.
  process.on('uncaughtException', (error) => console.error('Uncaught exception in a test run:', error))
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection in a test run:', error))
  // Nor a browser tab, a Finder window or a Settings pane: what a run would
  // open is kept in globalThis.opened, where the checks read it.
  const opened: string[] = ((globalThis as { opened?: string[] }).opened = [])
  shell.openExternal = async (url) => void opened.push(url)
  shell.openPath = async (path) => (opened.push(path), '')
  shell.showItemInFolder = (path) => void opened.push(path)
}
// Test runs only: a folder picked without the dialog, and the report said without a box, for Import into….
if (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_PICK) {
  const picked = process.env.HALIGTREE_QA_PICK
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
  dialog.showMessageBox = (async (...args: unknown[]) => (console.log('[qa] message', JSON.stringify(args.at(-1))), { response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox
}

// From a terminal, without the window: `open -n -a haligtree --args --capture "buy milk"`,
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
async function importVault(given?: string, picked?: string | null): Promise<void> {
  // Obsidian's own vaults first, in a picker in the main window; the folder
  // dialog is for anything else (picked is null when it asks for it).
  if (given === undefined && picked === undefined) {
    const found = await vaultChoices()
    // Outside the sandbox it can also go into a test book of its own (vault-picker.tsx), deleted from Settings when done.
    if (found.length) return inHome('haligtree:vault-pick', { into: SANDBOX ? 'the sandbox' : BOOK ? nameOf(here()) : null, here: SANDBOX ? 'the sandbox' : nameOf(here()), apart: !SANDBOX, vaults: found })
  }
  const root = given ?? picked ?? (await dialog.showOpenDialog({ title: SANDBOX ? 'Import into the sandbox: an Obsidian vault or a Notion export (unzipped)' : BOOK ? `Import into ${nameOf(here())}: an Obsidian vault or a Notion export (unzipped)` : 'Import an Obsidian vault or a Notion export (unzipped)', properties: ['openDirectory'] })).filePaths[0]
  if (!root) return
  // An Obsidian vault: which of its folders, first, each then a group in Pages (see importFolders).
  if (given === undefined && (await stat(join(root, '.obsidian')).then((one) => one.isDirectory(), () => false)))
    return inHome('haligtree:import-folders', { from: 'Obsidian', root, name: basename(root), folders: await vaultFolders(root) })
  // Its notes wait to become documents until their links are in; then every
  // window hears of it, and one of them turns them into documents.
  setImporting(true)
  try {
    await busy(() => bringVault(root, given !== undefined))
  } finally {
    setImporting(false)
    changed()
    // The box turns them into documents, hidden or not: not only once it is next opened.
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('imports:ready')
  }
}

/**
 * How far an import has got, for the main window's chip: "312 of 1,240".
 * Said at most every 120ms, and always at the first and last (each loop counts
 * the one it is on, so the last is "241 of 241"); null when over.
 */
let importToldAt = 0
function importProgress(at: { done: number; total: number; what: 'notes' | 'pictures' | 'files'; /** It can be stopped from the chip. */ stop?: boolean } | null): void {
  const now = Date.now()
  if (at && at.done > 0 && at.done < at.total && now - importToldAt < 120) return
  importToldAt = now
  if (home && !home.isDestroyed()) home.webContents.send('import:progress', at)
}

/**
 * A vault's folders at its top, each with how many notes it holds (however
 * deep), for choosing which to bring in. Notes at the top of the vault are
 * the folder with no name, said as the vault's own.
 */
async function vaultFolders(root: string): Promise<NotesFolder[]> {
  const counts = new Map<string, number>()
  const walk = async (folder: string, top: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) await walk(join(folder, entry.name), top || entry.name)
      else if (entry.name.endsWith('.md')) counts.set(top, (counts.get(top) ?? 0) + 1)
    }
  }
  await walk(root, '')
  return [...counts].map(([id, count]) => ({ id, name: id || basename(root), count })).sort((a, b) => (a.id ? 1 : 0) - (b.id ? 1 : 0) || a.name.localeCompare(b.name))
}

/** The import under way, if it can be stopped from its chip: Apple Notes, or a vault's chosen folders. */
let stopping: AbortController | null = null

/**
 * The chosen folders of Apple Notes or an Obsidian vault, into Pages: a
 * group for each, every note in it not yet sorted. Stopped from the chip, what
 * came in so far stays and is filed the same way.
 */
async function importFolders(from: 'Apple Notes' | 'Obsidian', folders: NotesFolder[], root?: string): Promise<void> {
  if (stopping || !folders.length) return
  const signal = (stopping = new AbortController()).signal
  setImporting(true)
  try {
    await busy(async () => {
      if (from === 'Obsidian' && root) return bringVault(root, false, { folders: folders.map((one) => one.id), signal })
      const got = await bringAppleNotes(notesReader(), folders, signal, (done, total) => importProgress({ done, total, what: 'notes', stop: true }))
      importProgress(null)
      const names = new Map(folders.map((one) => [one.id, one.name]))
      const groups = fileIntoGroups('Apple Notes', [...got.byFolder].map(([id, ids]) => ({ name: names.get(id) ?? 'Notes', ids })))
      if (got.denied && !got.made.length) return inHome('haligtree:import-folders', { from: 'Apple Notes', refused: 'denied' })
      inHome('haligtree:import-done', {
        from: 'Apple Notes',
        made: got.made.length,
        writing: got.made.length,
        pictures: got.pictures,
        notes: [
          filedSaid('Apple Notes', groups, got.made.length),
          got.stopped ? 'Stopped before the end: bring the same folders in again to carry on. Notes already here are skipped.' : '',
          got.already ? `${num(got.already)} ${got.already === 1 ? 'was' : 'were'} already here, from an earlier import, and ${got.already === 1 ? 'was' : 'were'} left as ${got.already === 1 ? 'it was' : 'they were'}.` : '',
          got.locked ? `${num(got.locked)} locked ${got.locked === 1 ? 'note was' : 'notes were'} left in Notes: unlock ${got.locked === 1 ? 'it' : 'them'} there to bring ${got.locked === 1 ? 'it' : 'them'} in.` : '',
          got.missing ? `${num(got.missing)} ${got.missing === 1 ? 'picture or file' : 'pictures and files'} could not be read out of Notes and ${got.missing === 1 ? 'was' : 'were'} left out.` : '',
          got.empty ? `${num(got.empty)} empty ${got.empty === 1 ? 'note was' : 'notes were'} skipped.` : ''
        ].filter(Boolean)
      })
    })
  } finally {
    stopping = null
    setImporting(false)
    importProgress(null)
    changed()
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('imports:ready')
  }
}

async function bringVault(root: string, quiet: boolean, pick?: { folders: string[]; signal: AbortSignal }): Promise<void> {
  const notes: string[] = []
  // Only the chosen folders' notes, when some were chosen; every file still, for their pictures.
  const chosen = (path: string): boolean => !pick || pick.folders.includes(relative(root, path).includes('/') ? relative(root, path).split('/')[0] : '')
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
      else if (entry.name.endsWith('.md')) chosen(path) && notes.push(path)
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
    // Written beside and renamed in, as a pasted picture is: a file there only
    // half written (Haligtree quit mid-import) would count as kept and never be
    // written again.
    const temporary = join(assetsDir(), `${name}.${randomUUID()}.tmp`)
    await stat(join(assetsDir(), name)).catch(() => writeFile(temporary, bytes).then(() => rename(temporary, join(assetsDir(), name))))
    if (IMAGE[ending]) (pictures += 1, lookAhead(name))
    else attached += 1
    return { url: `haligtree://assets/${name}`, size: bytes.byteLength, image: !!IMAGE[ending] }
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
  // Pictures a note shows that are nowhere in the folder: said at the end, by note.
  const missingHere: string[] = []
  const missing: { link: string; title: string; names: string[] }[] = []
  for (const [at, path] of notes.entries()) {
    if (pick?.signal.aborted) break
    if (!quiet) importProgress({ done: at + 1, total: notes.length, what: 'notes', stop: !!pick })
    missingHere.length = 0
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
        if (!stored) return (missingHere.push(name), name)
        return shown(stored, name, /^\d+(x\d+)?$/.test(width?.trim() ?? '') ? width.trim().split('x')[0] : undefined, inTable)
      })
      // ![][address]: a video by its address, the way some plugins embed one.
      next = next.replace(/!\[\]\[\]/g, '').replace(/!\[\]\[(https?:[^\]\s]+)\]/g, (_, href: string) => (/youtu\.?be/.test(href) ? `![](${href})` : `[${href}](${href})`))
      // ![](path) and [file](path) beside the note, written with %20 for spaces.
      next = await swap(next, /(!?)\[([^\]]*)\]\((?!https?:|haligtree:|#)([^)\s]+)\)/g, async (match) => {
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
        if (!stored) return (match[1] && missingHere.push(local.split('/').pop()!), null)
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
          if (!stored) return (missingHere.push(src.split('/').pop()!), '')
          src = stored.url
        }
        return `![${width ? `${inTable ? '\\|' : '|'}${width}` : ''}](${src})`
      })
      lines.push(next)
    }
    text = lines.join('\n')
    if (tags.length) text = `${text.trimEnd()}\n\n${tags.map((tag) => `#${tag.replace(/\s+/g, '-')}`).join(' ')}\n`
    const hidden = looksPrivate(relative(root, path))
    const one = importNote(relative(root, path), text, (await stat(path)).mtime, hidden, !!pick)
    if (one === 'already here') already += 1
    else if (one === 'empty') empty += 1
    else {
      made.push(one)
      if (missingHere.length) missing.push({ link: one.link, title: one.title, names: [...new Set(missingHere)] })
      if (one.private) marked += 1
      byName.set(one.title.toLowerCase(), one.link)
      for (const alias of listed(front, 'aliases')) byName.set(alias.toLowerCase(), one.link)
    }
  }
  // The last count is always said, however fast the notes came in.
  if (!quiet && !pick?.signal.aborted) importProgress({ done: notes.length, total: notes.length, what: 'notes', stop: !!pick })
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
  // Chosen folders bring their notes, never loose pictures as notes of their own.
  if (!showsPictures && !pick) {
    let seen = 0
    for (const path of everyFile) {
      if (!quiet) importProgress({ done: ++seen, total: everyFile.size, what: 'pictures' })
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
    if (!quiet) importProgress({ done: everyFile.size, total: everyFile.size, what: 'pictures' })
  }
  const linked = linkImported(made, byName, known)
  const inbox = made.filter((one) => !one.link.startsWith('article:')).length
  // Chosen folders: each a group in Pages, named for the folder (the top of the vault for the vault's own name).
  const filed = pick
    ? fileIntoGroups('Obsidian', pick.folders.map((folder) => ({
        name: folder || basename(root),
        ids: made.filter((one) => (one.path.includes('/') ? one.path.split('/')[0] : '') === folder).map((one) => one.link.replace(/^article:/, ''))
      })))
    : []
  const report = [
    `${num(made.length)} new ${made.length === 1 ? 'note' : 'notes'} from ${basename(root)}, with ${num(pictures)} pictures, ${num(attached)} files and ${num(linked)} links.`,
    // Where they went, said plainly: the Inbox, with time to sort it.
    inbox ? `${num(inbox)} ${inbox === 1 ? 'note is' : 'notes are'} in your Inbox to sort through; ${inbox === 1 ? 'it' : 'they'} won't come back to you as old notes to tidy for 30 days.` : '',
    already ? `${num(already)} ${already === 1 ? 'was' : 'were'} already here, from an earlier import, and ${already === 1 ? 'was' : 'were'} left as ${already === 1 ? 'it was' : 'they were'}.` : '',
    empty ? `${num(empty)} empty ${empty === 1 ? 'file was' : 'files were'} skipped.` : '',
    unshown ? `${num(unshown)} ${unshown === 1 ? 'picture was' : 'pictures were'} skipped: HEIC and TIFF cannot be shown here yet. Export them as JPEG to bring them in.` : '',
    marked ? `${num(marked)} ${marked === 1 ? 'note came' : 'notes came'} in marked private: ${marked === 1 ? 'its name sounds' : 'their names sound'} like passwords or logins.` : '',
    kept.length ? `Left out because ${kept.length === 1 ? 'it looks' : 'they look'} like passwords or keys: ${kept.join(', ')}.` : '',
    unread.length ? `Left out because ${unread.length === 1 ? 'it could not be read as text' : 'they could not be read as text'}: ${unread.join(', ')}.` : '',
    pick?.signal.aborted ? 'Stopped before the end: bring the same folders in again to carry on. Notes already here are skipped.' : ''
  ].filter(Boolean)
  // Filed into Pages: said in place of the Inbox's line.
  if (pick) report.splice(1, 0, filedSaid('Obsidian', filed, made.length - inbox))
  if (!quiet) importProgress(null)
  if (quiet) return console.log(`imported ${made.length} new, ${already} already here, ${empty} empty, ${kept.length} left out, ${unshown} pictures of other types skipped, ${marked} marked private, ${pictures} pictures, ${attached} files, ${linked} links${kept.length ? ` [${kept.join(', ')}]` : ''}`)
  // Said in the main window, on a card of its own, while the notes become documents behind it.
  inHome('haligtree:import-done', {
    from: basename(root),
    made: made.length,
    inbox,
    writing: pick ? made.length : 0,
    pictures,
    files: attached,
    links: linked,
    missing,
    // The card says the count and the Inbox itself: the rest of the report is what is left to say.
    notes: pick ? report.slice(1).filter(Boolean) : report.slice(inbox ? 2 : 1)
  })
}

/** Left by a restore for the next start to say "Restored from Tuesday 14:00", then taken away. */
const RESTORED = 'restored.json'
async function tellRestored(): Promise<void> {
  const file = join(app.getPath('userData'), RESTORED)
  const kept = await readFile(file, 'utf8').catch(() => null)
  if (!kept) return
  await rm(file, { force: true })
  try {
    const { made } = JSON.parse(kept) as { made: string }
    const at = new Date(made)
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400000)
    const day = days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? at.toLocaleDateString('en-GB', { weekday: 'long' }) : dayName(at)
    inHome('haligtree:restored', `${day}, ${clock(at)}`)
  } catch {
    // Not readable: nothing to say.
  }
}

/** Brought in from the old folder at this launch or the last: said once, with the old folder's place (old-data.ts). */
function tellMovedIn(): void {
  if (SANDBOX) return
  const moved = untoldMove(realRoot())
  if (moved) inHome('haligtree:moved-in', shortPath(moved.from))
}

/**
 * Put a day's copy back. What you have now is copied first, beside the
 * backups, so a restore can itself be undone; then the app starts again on
 * the copy you chose.
 */
/** "Go back to this copy?", asked in Haligtree's own sheet in the main window (restore-ask.tsx): true for Restore. */
function askRestore(name: string): Promise<boolean> {
  const token = `${Date.now()}-${Math.random()}`
  return new Promise((resolve) => {
    const answer = (_event: unknown, said: string, ok: boolean): void => {
      if (said !== token) return
      ipcMain.off('backup:restore-answer', answer)
      resolve(!!ok)
    }
    ipcMain.on('backup:restore-answer', answer)
    inHome('haligtree:restore-ask', { name, token })
  })
}

async function restore(): Promise<void> {
  // The sandbox would only restore itself, but a restore reads as a risk to your notes there.
  if (SANDBOX) return
  const { filePaths: [chosen] } = await dialog.showOpenDialog({
    title: 'Restore from a backup',
    defaultPath: join(backupDir(), 'database'),
    properties: ['openFile'],
    filters: [{ name: `${APP_NAME} database`, extensions: ['db'] }]
  })
  if (!chosen) return
  if (!(await askRestore(basename(chosen)))) return
  const live = join(app.getPath('userData'), 'haligtree.db')
  database().prepare('vacuum into ?').run(join(backupDir(), 'database', `before-restore-${Date.now()}.db`))
  // Said once the app is back: which copy it is now on.
  const made = (await stat(chosen).catch(() => null))?.mtime ?? new Date()
  await writeFile(join(app.getPath('userData'), RESTORED), JSON.stringify({ made: made.toISOString(), name: basename(chosen) })).catch(() => undefined)
  windingDown()
  database().close()
  await copyFile(chosen, live)
  for (const extra of ['-wal', '-shm']) await rm(`${live}${extra}`, { force: true })
  restartNow()
}

/**
 * Jottings from Markdown files - an inbox note, a file of jokes - as captures.
 * A file with "joke" or "bit" in its name gives notes tagged #bit (private); anything else, notes.
 * An HTML file is a bookmarks export, from Raindrop or a browser: links. A
 * CSV or JSON file, or Kindle's clippings, is highlights; any other text file
 * is Anki's plain-text export, cards to be tested on.
 */
async function importFiles(): Promise<void> {
  const { filePaths } = await dialog.showOpenDialog({
    title: SANDBOX ? 'Import into the sandbox' : BOOK ? `Import into ${nameOf(here())}` : 'Import',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown, bookmarks, highlights (Readwise, Kindle) or Anki cards', extensions: ['md', 'html', 'htm', 'csv', 'json', 'txt'] }]
  })
  const lines: string[] = []
  // The beam turns in every window while the files are read in.
  let total = 0
  let inbox = 0
  let gems = 0
  await busy(async () => {
    for (const [at, path] of filePaths.entries()) {
      importProgress({ done: at + 1, total: filePaths.length, what: 'files' })
      const name = basename(path)
      // One file that cannot be read is said so, and the rest still come in.
      try {
        const text = await readFile(path, 'utf8')
        // A picture or a program renamed .md is not words to keep.
        if (text.includes('\u0000')) {
          lines.push(`${name}: skipped, it is not a text file`)
          continue
        }
        // Anki cards become gems; everything else comes in as captures, in the Inbox.
        const anki = /\.txt$/i.test(name) && !text.includes('==========')
        const added = /\.html?$/i.test(name)
          ? importBookmarks(name, text)
          : /\.(csv|json)$/i.test(name) || (/\.txt$/i.test(name) && text.includes('=========='))
            ? importHighlights(name, text)
            : anki
              ? importAnki(text)
              : importMarkdown(name, text, /joke|bit/i.test(name))
        total += added
        if (anki) gems += added
        else inbox += added
        lines.push(`${name}: ${num(added)} new`)
      } catch (error) {
        lines.push(`${name}: could not be read (${/\.json$/i.test(name) ? 'it is not a list of highlights in JSON' : error instanceof Error ? error.message : String(error)})`)
      }
    }
    importProgress({ done: filePaths.length, total: filePaths.length, what: 'files' })
  })
  importProgress(null)
  // Where they went, said first, and the card's button opens it.
  // Some of them: "1 is", "4 are".
  const some = (n: number): string => (n === total ? (total === 1 ? 'It is' : 'They are') : `${num(n)} ${n === 1 ? 'is' : 'are'}`)
  const went = [inbox ? `${some(inbox)} in your Inbox.` : '', gems ? `${some(gems)} in Gems, as cards to review.` : ''].filter(Boolean)
  if (lines.length) inHome('haligtree:import-done', { from: filePaths.length === 1 ? basename(filePaths[0]) : `${num(filePaths.length)} files`, made: total, inbox, gems, notes: [...went, ...lines] })
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
 * Quick capture's way in by mouse, beside the Dock icon: there whether or not
 * the main window is open, with the way to the main window and the way to
 * stop Haligtree. Held in a variable because a Tray that nothing
 * refers to is collected, and the icon vanishes a few seconds after launch.
 */
let tray: Tray | null = null

function createTray(): void {
  const image = nativeImage.createFromBuffer(readFileSync(trayIcon), { scaleFactor: 2 })
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
    // Drawn at twice the size for a sharp Retina menu: said so, or the Mac shows it twice as big.
    const image = nativeImage.createFromBuffer(Buffer.from(url.split(',')[1], 'base64'), { scaleFactor: 2 })
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
  const font = '13px -apple-system, system-ui'
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  // Across the menu's full width, the percent at its right edge with the menu's
  // own shortcuts; as tall as a line of menu text, so the menu's padding makes
  // it a row like the others rather than a taller, blown-up one.
  const width = Math.ceil(Math.max(260, ...widest.map((words) => measure.measureText(words).width)))
  const height = 16
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
    // “83% gone”: the words say it is time used up, never a goal's progress.
    const said = `${Math.round(share * 100)}% gone`
    pen.textAlign = 'right'
    pen.fillText(said, width, height / 2)
    // The track runs from after the longest row name to before the widest percent.
    const from = Math.max(...rows.map((row) => measure.measureText(row.label).width)) + 14
    const to = width - measure.measureText('100% gone').width - 14
    if (dots) {
      const count = Math.max(8, Math.floor((to - from) / 11))
      const lit = Math.round(share * count)
      const step = (to - from) / count
      for (let n = 0; n < count; n++) {
        const x = from + step * n + step / 2
        pen.beginPath()
        pen.arc(x, height / 2, 3, 0, Math.PI * 2)
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
        pen.roundRect(from, height / 2 - 2.5, Math.max(5, end - from), 5, 2.5)
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
/**
 * The Dock icon's menu (right-click, or a long press): the few things you
 * reach for without the main window, each the same as its menu bar twin.
 */
function updateDock(): void {
  if (!app.dock || !app.isReady()) return
  app.dock.setMenu(
    Menu.buildFromTemplate([
      { label: 'Quick capture', click: () => void (prompt?.isFocused() || toggleWindow()) },
      // A fresh box, as ⌘N in it makes one: whatever was in it can be brought back.
      { label: 'New note', click: newNote },
      { label: 'Today', click: () => sendHome('view', 'today', undefined, 'window') },
      { label: 'Show sticky notes', type: 'checkbox', checked: stickiesTicked(), click: (item) => void showStickies(item.checked) }
    ])
  )
}

/** Quick capture on a fresh box: shown, then told ⌘N, the key that starts one over there. */
function newNote(): void {
  if (!prompt?.isVisible()) toggleWindow()
  void prompt?.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }))`).catch(() => undefined)
}

function updateTray(): void {
  // The Dock's menu says the same as the menu bar's: rebuilt with it.
  updateDock()
  if (!tray || tray.isDestroyed()) return
  const { due, tasks, safe } = badge()
  // A running session shows how long it has run ("● 11 h 20 min"), so the menu bar says what you are on. Counts past 9,999 go short ("12k").
  const session = activeSession()
  const minutes = session ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000) : 0
  const goals = openGoals()
  // The menu bar shows one short thing at most, the most pressing: tasks due now.
  // "Sandbox" leads only in the sandbox, so it is never taken for your own notes.
  // Everything else (goals, the session, reviews, the book) is in the menu.
  const title = [SANDBOX ? 'Sandbox' : '', tasks ? `${brief(tasks)} due` : ''].filter(Boolean).join(' · ')
  tray.setTitle(title, { fontType: 'monospacedDigit' })
  tray.setToolTip(`${SANDBOX ? `${APP_NAME} sandbox` : `${APP_NAME} · ${nameOf(here())}`}${tasks ? ` · ${tasks} task${tasks === 1 ? '' : 's'} due now` : ''}${due ? ` · ${due} to review` : ''}${safe ? ' · safe mode on' : ''}`)
  // Tempus: how far through the day, week, month and year, each a drawn bar
  // of one width, so the four line up whatever their words.
  const time = tempus()
  const hidden = safe || gate().hidePrivate
  const marked = nextMilestones()
  // The nearest three: the rest are a click away in the app.
  const goalItems: Electron.MenuItemConstructorOptions[] = goals.slice(0, 3).map((goal) => {
    const left = daysLeft(goal.goalAt)
    const name = goal.private && hidden ? 'A private goal' : clip(goal.title, 34)
    const when = left < 0 ? 'did you make it?' : left === 0 ? 'today' : `${num(left)} ${left === 1 ? 'day' : 'days'} left`
    // The goal on its own line and where it stands under it, smaller: a menu
    // taller and narrower, rather than one long line setting its width.
    return { label: name, sublabel: `${when}  ·  ${percent(wayThrough(goal.goalFrom, goal.goalAt))} of the way`, click: () => sendHome('goal', goal.id, undefined, 'window') }
  })
  // Each row as one picture the menu's width: the unit at the left, the bar or
  // dots across, the percent at the right edge. Drawn by a page, since the
  // main process cannot set text; until it is, the plain bar stands in.
  // Said as time passing, under a heading of their own, so they are never read as the goal's bars above.
  const rows = (['day', 'week', 'month', 'year'] as const).map((unit) => ({ label: unit === 'day' ? 'Today' : `This ${unit}`, share: Math.round(time[unit] * 100) / 100 }))
  const widest = [...goalItems.flatMap((item) => [item.label ?? '', item.sublabel ?? '']), 'Import from Obsidian or Notion…']
  const tempusKey = JSON.stringify([rows, tempusDots(), widest])
  if (tempusDrawn?.key !== tempusKey) void drawTempus(tempusKey, rows, tempusDots(), widest)
  // What the menu bar used to say beside its counts, each on its own line here.
  const now: Electron.MenuItemConstructorOptions[] = [
    ...(tasks ? [{ label: `${num(tasks)} ${tasks === 1 ? 'task' : 'tasks'} due now`, click: () => sendHome('view', 'today', undefined, 'window') }] : []),
    ...(due ? [{ label: `${num(due)} to review`, click: () => sendHome('view', 'review', undefined, 'window') }] : []),
    ...(session ? [{ label: `Session running, ${howLong(minutes)}`, click: openHome }] : [])
  ]
  const template: Electron.MenuItemConstructorOptions[] = [
      ...(now.length ? [...now, { type: 'separator' } as const] : []),
      ...(goalItems.length ? [{ label: 'Goals', enabled: false }, ...goalItems, { type: 'separator' } as const] : []),
      // The next two marked days, each with its count of days: off in Settings, none.
      ...marked.slice(0, 2).flatMap((one, at) => [
        ...(at === 0 ? [{ label: 'Marked days', enabled: false }] : []),
        { label: `${one.icon ? `${one.icon}  ` : ''}${hidden ? 'A marked day' : clip(one.title, 34)}`, sublabel: `${dayMonth(`${one.day}T12:00`)}  ·  ${daysLeft(one.day) === 0 ? 'today' : `${num(daysLeft(one.day))} ${daysLeft(one.day) === 1 ? 'day' : 'days'} to go`}`, click: () => (daysLeft(one.day) > 0 ? sendHome('view', 'yearpage', undefined, 'window') : sendHome('day', one.day, undefined, 'window')) }
      ]),
      { type: 'separator' },
      // In the sandbox the way out comes first; from your notes, the way in.
      // A reset cannot be undone, so it is asked in the main window, where Start over is held.
      ...(SANDBOX ? [{ label: 'Back to my notes', click: leaveSandbox }, { label: 'Reset the sandbox…', click: () => (openHome(), makeHome().webContents.send('sandbox:ask-reset')) }, { type: 'separator' } as const] : []),
      { label: `Open ${APP_NAME}`, accelerator: chordFor('⌘.'), click: () => toggleWindow() },
      { label: 'Close the day…', click: () => inHome('haligtree:close-day') },
      // How far through the day, week, month and year: a look away, not in the way.
      {
        label: 'Time gone',
        submenu: (['day', 'week', 'month', 'year'] as const).map((unit, at) => {
          const drawn = tempusDrawn?.key === tempusKey ? tempusDrawn.images[at] : null
          // The words drawn in the picture, kept as its tooltip so a probe (and a reader) can find them.
          const words = `${rows[at].label}  ${Math.round(rows[at].share * 100)}% gone`
          return drawn ? { label: '', icon: drawn, enabled: false, toolTip: words } : { label: `${rows[at].label}: ${percent(time[unit])} gone`, icon: tempusBar(time[unit]), enabled: false, toolTip: words }
        })
      },
      // The book open now, ticked, and the way to each of the others.
      {
        label: SANDBOX ? 'Book: Sandbox' : `Book: ${nameOf(here())}`,
        submenu: [
          ...books().map((book) => ({ label: book.name, type: 'radio' as const, checked: book.current, click: () => void (book.current || inHome('haligtree:book-switch', book.id)) })),
          { label: 'Sandbox', type: 'radio' as const, checked: SANDBOX, click: () => void (SANDBOX || openSandbox()) },
          { type: 'separator' as const },
          { label: 'New book…', enabled: !SANDBOX, click: () => inHome('haligtree:book-new') },
          ...(SANDBOX ? [] : [{ label: 'Restore from a backup…', click: () => void restore() }])
        ]
      },
      {
        label: 'Import',
        submenu: [
          { label: 'From Obsidian or Notion…', click: () => void importVault() },
          { label: 'From Apple Notes…', click: () => inHome('haligtree:import-folders', { from: 'Apple Notes' }) },
          { label: 'Files…', click: () => void importFiles() },
          ...(SANDBOX ? [] : [{ type: 'separator' as const }, { label: 'Into another book…', click: () => inHome('haligtree:book-import') }])
        ]
      },
      { type: 'separator' },
      { label: 'Safe mode', type: 'checkbox', checked: safe, accelerator: chordFor('⌥⌘S'), click: () => (toggleSafeMode(), updateTray()) },
      // Everything about the stickies, together under one name.
      {
        label: 'Sticky notes',
        submenu: [
          // Ticked as they are on the screen; chosen, they come out or go away as the tick now says.
          { label: 'Show sticky notes', type: 'checkbox', checked: stickiesTicked(), accelerator: chordFor('⌃⌥⌘N'), click: (item) => void showStickies(item.checked) },
          { label: 'Bring them here', enabled: !safe && stickies.size > 0, click: () => gatherStickies() },
          ...(safe ? [] : tuckItems()),
          // Only with a sticky out to tidy; the key does nothing then either.
          ...(!safe && stickiesOut() > 0 ? [{ label: 'Tidy them', accelerator: chordFor('⌃⌥⌘T'), click: () => void tidyStickies() }] : []),
          ...(canUntidy() ? [{ label: 'Put them back', click: untidyStickies }] : []),
          ...(canPutBack() && takenDown ? [{ label: takenDown.title ? `Put back ${quoted(takenDown.title, 28)}` : 'Put back the sticky', click: putStickyBack }] : [])
        ]
      },
      { type: 'separator' },
      { label: `Quit ${APP_NAME}`, accelerator: 'Command+Q', click: quit }
  ]
  // A test run keeps the menu's words where a probe can read them.
  if (process.env.HALIGTREE_QA_AWAY) (globalThis as { trayTitle?: string }).trayTitle = title
  if (process.env.HALIGTREE_QA_AWAY) (globalThis as { trayMenu?: unknown }).trayMenu = template.flatMap((item) => [item, ...((Array.isArray(item.submenu) ? item.submenu : []) as Electron.MenuItemConstructorOptions[])]).map((item) => ({ type: item.type ?? 'normal', label: item.label ?? '', sublabel: item.sublabel ?? '', toolTip: item.toolTip ?? '', enabled: item.enabled !== false, checked: item.checked === true, drawn: !!item.icon && !item.label }))
  const menu = Menu.buildFromTemplate(template)
  // And the menu itself, so a probe can choose an item as a click would.
  if (process.env.HALIGTREE_QA_AWAY) (globalThis as { trayBuilt?: unknown }).trayBuilt = menu
  tray.setContextMenu(menu)
}

// Asked once, by the main process as it starts and by each window's preload as it loads.
let twelve: boolean | null = null
const twelveHour = (): boolean => (twelve ??= macTwelveHour())
ipcMain.on('clock:twelve', (event) => void (event.returnValue = twelveHour()))
// The welcome's first sound plays as it arrives, before anything has been clicked (renderer's lib/sound.ts, ambience).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.whenReady().then(() => {
  // Every time Haligtree writes, here and in each window, on the Mac's own clock (12 or 24 hours).
  useTwelveHour(twelveHour())
  // The Leaves marks draw on a Noun Project icon used under CC BY 3.0, which asks for this credit.
  app.setAboutPanelOptions({ credits: `${ANCHOR}\n\n` + 'The Leaves mark is after “Abstract Flower” by Kalaakarini, from Noun Project (CC BY 3.0)' })
  // Edit > Select All asks the page first: a list picks every row (app-menu.ts).
  setAppMenu()
  // YouTube will not play an embed that comes from no page at all (its
  // "Error 153"), and Haligtree's pages are files. Say where it is shown from.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/embed/*'] }, (details, done) =>
    done({ requestHeaders: { ...details.requestHeaders, Referer: 'https://haligtree.app/' } }))
  // Haligtree never listens, and the built app has no microphone sentence for the
  // Mac to show (electron-builder.yml), so a page asking for sound is told no
  // here rather than reaching macOS. The camera (a selfie) still goes through.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, allow, details) =>
    allow(!(permission === 'media' && 'mediaTypes' in details && details.mediaTypes?.includes('audio'))))
  registerCaptures()
  registerImportConversion()
  registerUsage()
  registerHaligtree()
  whenIcon(wearIcon)
  registerSessionLog()
  // The Mac slept while this book's session was kept running from another book: the sleep rule applies now, as it would have then.
  const slept = readShelf().keptSlept ?? []
  if (slept.some((one) => one.book === here())) {
    for (const one of slept) if (one.book === here()) sleptThrough(one.at, sleepChoice())
    writeShelf({ ...readShelf(), keptSlept: slept.filter((one) => one.book !== here()) })
  }
  registerFocusStats()
  // Websites blocked while a focus round runs: said under the pill.
  registerSiteBlock({ notify: (notice) => void showNudge(notice) })
  registerSimilar()
  registerJournal()
  registerSandbox()
  atLogin()
  registerHome()
  registerNotes({ load, guard, home: (type, id) => sendHome(type, id, undefined, 'window'), homeWindow: () => (home && !home.isDestroyed() ? home : null) })
  registerGroups()
  registerNoteImports()
  registerPeriods()
  // Words written, counted as you save, for Stats: once every page's table is there.
  registerWordLog()
  registerMilestones()
  registerEvents((type, id) => sendHome(type, id, undefined, 'notification'))
  registerReadingQueue()
  // A practice's offer comes up in the bubble: it never starts by itself.
  registerPractices()
  // With the time kept in the note only (no bubble), Haligtree's nudge card offers it instead.
  whenPracticeOffer((offer) => (focusBubbleShown() ? showFocus(true) : void showNudge({ kind: 'practice', id: offer.id, offer })))
  registerIssues()
  registerScenery()
  registerCelebrations()
  registerOnboarding()
  registerUnused()
  registerObsidian()
  registerPictures()
  registerPeople()
  registerSources()
  registerFeed()
  registerDefine()
  registerMacCalendar()
  // Last, once every table is there: what other books sent this one is taken in.
  registerBooks(backupBase, () => updateTray())
  void tellRestored()
  tellMovedIn()
  const first = fromCli(process.argv)
  if (first) captureText(first)

  // Serve the asset store. The pathname is the only thing trusted: anything
  // with a separator in it is refused, so a crafted src cannot walk the disk.
  // Both names: see registerSchemesAsPrivileged above.
  for (const scheme of ['haligtree', 'mindflow']) protocol.handle(scheme, async (request) => {
    // A standard scheme parses `haligtree://assets/x.png` as host `assets` and
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
  ipcMain.on('drawing:open', (event, id: unknown, scene: unknown, name: unknown, picture: unknown) => {
    if (typeof id === 'string') openDrawing(id, scene, event.sender, typeof name === 'string' ? name : '', typeof picture === 'string' && picture.length < 4_000_000 ? picture : undefined)
  })
  /** The note's picture of the drawing, for its window to show while the canvas loads. */
  ipcMain.handle('drawing:picture', (_event, id: unknown) => (typeof id === 'string' ? (drawings.get(id)?.picture ?? null) : null))

  /** What the drawing window asks for once it is ready to be told. */
  ipcMain.handle('drawing:scene', (_event, id: unknown) =>
    typeof id === 'string' ? (drawings.get(id)?.scene ?? null) : null
  )

  /** And what it sends back, which the note writes down. */
  ipcMain.on('drawing:change', (_event, id: unknown, scene: unknown) => {
    if (typeof id !== 'string') return
    const open = drawings.get(id)
    if (!open) return
    open.scene = scene
    if (open.note.isDestroyed()) return void (open.kept = false)
    open.note.send('drawing:changed', id, scene)
    // Taken only if the block is still on the page to write it down.
    open.kept = open.note
      .executeJavaScript(`!!document.querySelector('[data-drawing="' + CSS.escape(${JSON.stringify(id)}) + '"]')`)
      .then((found) => found === true, () => false)
  })

  // The main window's "new" button: the same prompt the key brings up.
  // With words (⌘K's "in quick capture"): the box comes up, never put away,
  // and they are written in it, waiting if the page is not listening yet.
  ipcMain.on('prompt:show', (_event, text?: unknown) => {
    if (typeof text !== 'string' || !text.trim()) return toggleWindow()
    seed = text
    if (!prompt?.isVisible() || !prompt.isFocused()) toggleWindow()
    if (prompt && !prompt.webContents.isLoading()) (prompt.webContents.send('box:seed', text), (seed = null))
  })
  // ⌘ and a two-finger flick, or ⌃⌥ and an arrow, in the box: thrown that way.
  ipcMain.on('box:throw', (event, dx: unknown, dy: unknown, speed: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win === prompt) throwBox(win, Number(dx) || 0, Number(dy) || 0, Number(speed) || 0)
  })
  // ⌘ and two fingers moving slowly: the box goes with them, kept on the screen.
  ipcMain.on('box:nudge', (event, dx: unknown, dy: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || win.isDestroyed()) return
    throwing?.()
    if (pending?.win === win) (arriving?.(), settle())
    const from = win.getBounds()
    const [x, y] = fingersWay(Number(dx) || 0, Number(dy) || 0)
    const to = onScreen({ ...from, x: from.x + x, y: from.y + y })
    win.setPosition(to.x, to.y)
  })
  // Let go slowly: it stays there, remembered for this screen as a throw is.
  ipcMain.on('box:rest', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || win.isDestroyed()) return
    const at = win.getBounds()
    lastBounds = at
    anchor = { y: at.y, became: at.y }
    keepSpot(screen.getDisplayMatching(at).id, at)
  })
  // An undone send: the box back if it had gone, left as it is if it is up.
  ipcMain.on('prompt:reveal', () => void (!(prompt?.isVisible() && prompt.isFocused()) && toggleWindow()))
  ipcMain.handle('box:seed', () => {
    const was = seed
    seed = null
    return was
  })
  // ⌘O in the box, after it saved what was open: Little Arc's promote. The
  // box moves a quarter of the way toward the main window and fades as it
  // goes, then the main window opens on the same note. At once with Motion
  // off or Reduce motion on.
  ipcMain.on('box:promote', (_event, type: unknown, id: unknown) => {
    const go = (): void => (typeof type === 'string' && typeof id === 'string' ? sendHome(type, id, undefined, 'capture') : openHome())
    const win = prompt
    if (!win || win.isDestroyed() || !win.isVisible()) return go()
    // With Motion off or Reduce motion on: no glide, but the box still goes.
    if (stillness()) return void (go(), win.isVisible() && hideWindow(win))
    if (pending?.win === win) (arriving?.(), settle())
    const from = win.getBounds()
    const to = makeHome().getBounds()
    const start = Date.now()
    const PROMOTE = 200
    promoting?.()
    // On the shared display-frame clock, in step with every other glide.
    promoting = onFrames(() => {
      if (win.isDestroyed()) return ((promoting = undefined), false)
      const t = Math.min(1, (Date.now() - start) / PROMOTE)
      const k = 1 - (1 - t) ** 3
      // A quarter of the way toward the main window's middle, its size kept: a window changing
      // size lays its page out again each frame, which judders (the same as a note's own window).
      const at = (a: number, b: number): number => Math.round(a + (b - a) * k * 0.25)
      win.setBounds({ x: at(from.x, to.x + (to.width - from.width) / 2), y: at(from.y, to.y + (to.height - from.height) / 2), width: from.width, height: from.height }, false)
      win.setOpacity(1 - k)
      if (t < 1) return true
      promoting = undefined
      // Back to its own place, unseen, so it comes up there next time.
      win.setBounds(from, false)
      // Whatever opening the note does, the box is never left see-through on screen.
      try {
        go()
      } catch (error) {
        console.error('box:promote', error)
      } finally {
        if (win.isVisible()) hideWindow(win)
        win.setOpacity(1)
      }
      return false
    })
  })
  // From the welcome: the box put away, as its own Esc would.
  ipcMain.on('prompt:hide', () => void (prompt?.isVisible() && hideWindow(prompt)))
  // The first-run step and Settings import the way the menu bar does.
  // From the vault picker too: one of the vaults it showed, or null for the folder dialog.
  ipcMain.handle('import:run', async (_event, what: unknown, from?: unknown) => {
    if (what === 'apple-notes') return inHome('haligtree:import-folders', { from: 'Apple Notes' })
    if (what !== 'vault') return importFiles()
    if (from === null) return importVault(undefined, null)
    if (typeof from === 'string') return (await isVault(from)) ? importVault(undefined, from) : undefined
    return importVault()
  })
  // Apple Notes and a vault's folders: asked for, chosen in the main window's sheet, brought in, or stopped.
  ipcMain.handle('haligtree:notes-import:folders', () => notesReader().folders())
  ipcMain.handle('haligtree:notes-import:run', (_event, from: unknown, folders: unknown, root: unknown) =>
    void importFolders(from === 'Obsidian' ? 'Obsidian' : 'Apple Notes', Array.isArray(folders) ? (folders as NotesFolder[]) : [], typeof root === 'string' ? root : undefined))
  ipcMain.handle('haligtree:notes-import:stop', () => void stopping?.abort())
  ipcMain.handle('haligtree:notes-import:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'))
  ipcMain.handle('backup:restore', () => restore())
  ipcMain.handle('old-data:show', () => {
    try {
      const { from } = JSON.parse(readFileSync(join(realRoot(), MOVED), 'utf8')) as Moved
      shell.showItemInFolder(from)
    } catch {
      // Nothing was brought in.
    }
  })
  // The app's theme decides the frosting behind every window, not the system's.
  ipcMain.on('appearance', (_event, mode: string) => void (nativeTheme.themeSource = mode === 'light' ? 'light' : 'dark'))
  // The box's backing, as its theme says. A solid theme (Paper, Light,
  // Midnight) paints the page fully, so the frosting under it only ever showed
  // where the page had not painted yet: the strip a growing window uncovers
  // for a frame, grey under a paper page. There the window's own colour is the
  // theme's instead, so a new edge is the page's colour from its first frame.
  // A see-through theme keeps the frosting, which is its look.
  const surfaces = new WeakMap<BrowserWindow, string | null>()
  ipcMain.on('window:surface', (event, color: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || win.isDestroyed()) return
    const next = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : null
    if (surfaces.has(win) && surfaces.get(win) === next) return
    surfaces.set(win, next)
    if (next) {
      win.setVibrancy(null)
      win.setBackgroundColor(next)
    } else {
      win.setBackgroundColor('#00000000')
      win.setVibrancy('under-window')
    }
  })
  // The prompt sends you to one thing in the main window: a task's notes and
  // sessions live there. Kept until the window asks, in case it is still
  // starting; sent at once if it is already up.
  // Asked from another window: quick capture, a sticky or a note's own window; with no window at all, a notification.
  // The main window's own asks say for themselves how they were found.
  ipcMain.on('home:open', (event, type: string, id: string, heading?: string) => {
    const from = (event as { sender?: Electron.WebContents } | undefined)?.sender
    const via: Via | undefined = !from ? 'notification' : from === prompt?.webContents ? 'capture' : from === home?.webContents ? undefined : 'window'
    sendHome(type, id, heading, via)
  })
  // A notice quick capture could not show as it went, said in the main window instead, without bringing it forward.
  ipcMain.on('say:home', (_event, said: unknown) => void (home && !home.isDestroyed() && home.webContents.send('say', said)))
  ipcMain.handle('home:sent', (event) => {
    homeAsked = true
    const was = sentTo
    if (was && sentVia) event.sender.send('usage:via', sentVia)
    sentTo = null
    sentVia = null
    return was
  })

  // Put the window away without closing it, so it comes back as it was.
  ipcMain.on('window:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) hideWindow(win)
  })

  // ⌃⌘C: the box glides to the middle of the screen it is on (at once with
  // Motion off), where it then stays as if dragged there.
  ipcMain.on('window:centre', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || win.isFullScreen()) return
    const bounds = boundsOf(win)
    const area = screen.getDisplayMatching(bounds).workArea
    const y = Math.round(area.y + (area.height - SIZES.compact.height) / 2)
    const next = onScreen({ ...bounds, x: Math.round(area.x + (area.width - bounds.width) / 2), y })
    anchor = { y, became: next.y }
    panelFrom = null
    lastBounds = next
    void reshape(win, next)
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
  // Where the pill sits, asked by the pill as it starts and as the setting
  // changes: put there, and told how tall the notch is (0 for none).
  ipcMain.handle('focus:place', () => placeFocus())
  // The pill's gleam rests while nobody is at the computer.
  ipcMain.handle('idle:seconds', () => powerMonitor.getSystemIdleTime())
  // The Mac asleep in a session: Settings (“When the Mac sleeps”) says whether
  // it runs on, is abandoned, or is finished at the moment it slept; the pill
  // says which once it wakes. A nap under a minute (the lid closed by
  // mistake) changes nothing.
  let sleptAt: number | null = null
  powerMonitor.on('suspend', () => void (sleptAt = Date.now()))
  // Woken, or a screen added, taken away or changed: the pill is put back
  // where it sits (beside the notch, never under it) and told so, so it
  // measures the notch again and lays itself out afresh. After a sleep the
  // screens are set up again, and a pill left where it was worked out before
  // could end up under the notch, its time and tips out of sight.
  const replace = (): void => {
    if (!focusPill || focusPill.isDestroyed()) return
    placeFocus()
    focusPill.webContents.send('focus:placed', 'again')
  }
  let replaced: ReturnType<typeof setTimeout> | undefined
  // The Mac settles its screens over a moment after waking: once now, and once that is done.
  const replaceSoon = (): void => (replace(), clearTimeout(replaced), void (replaced = setTimeout(replace, 1500)))
  screen.on('display-added', replaceSoon)
  screen.on('display-removed', replaceSoon)
  screen.on('display-metrics-changed', replaceSoon)
  powerMonitor.on('unlock-screen', replaceSoon)
  powerMonitor.on('resume', () => {
    replaceSoon()
    const at = sleptAt
    sleptAt = null
    if (at === null || Date.now() - at < 60_000) return
    const ended = sleptThrough(at, sleepChoice())
    // A session kept running in another book: its book applies the same rule when it next opens.
    const shelf = readShelf()
    if (!SANDBOX && shelf.kept && shelf.kept !== here()) writeShelf({ ...shelf, keptSlept: [...(shelf.keptSlept ?? []), { book: shelf.kept, at }] })
    const said = ended.find((one) => !one.timer) ?? ended[0]
    if (said && focusPill && !focusPill.isDestroyed()) focusPill.webContents.send('focus:slept', said)
  })
  // The pill's right-click: a quick switch for its ticking. The menu's close
  // can come before its click, so the close waits a moment before saying none.
  ipcMain.handle('focus:menu', (event, ticking: unknown, abandon: unknown, extend: unknown, endBreak: unknown, early: unknown) =>
    new Promise<'tick' | 'abandon' | 'extend' | 'end' | 'early' | 'notch' | 'free' | null>((resolve) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      Menu.buildFromTemplate([
        // Ten more minutes, for one with a length; ⌃⌥⌘= does the same from anywhere.
        ...(extend ? [{ label: 'Add 10 minutes', accelerator: chordFor('⌃⌥⌘='), registerAccelerator: false, click: () => resolve('extend') }, { type: 'separator' as const }] : []),
        { label: 'Ticking clock sound', type: 'checkbox', checked: Boolean(ticking), click: () => resolve('tick') },
        // A session given up: kept in its log, marked abandoned, counted nowhere. Undo shows on the pill.
        // Stopping before the time is up, the same two choices the pill's Stop offers, in the same words.
        ...(abandon ? [{ type: 'separator' as const }, ...(early ? [{ label: 'End early, count it', click: () => resolve('early') }] : []), { label: "Abandon, don't count it", click: () => resolve('abandon') }] : []),
        // A break ended with no session after it (“Back to work” starts one).
        ...(endBreak ? [{ type: 'separator' as const }, { label: 'End the break', click: () => resolve('end') }] : []),
        // Where it sits, switched from the pill itself: Settings' "Bubble sits", in its words.
        { type: 'separator' as const },
        { label: 'Under the notch', type: 'radio', checked: pillInNotch(), click: () => resolve('notch') },
        { label: 'Where I put it', type: 'radio', checked: !pillInNotch(), click: () => resolve('free') }
      ]).popup({ window: win, callback: () => setTimeout(() => resolve(null), 100) })
    })
  )
  // The pill opening into the island: its window grows down first, from
  // the top it hangs from, and goes back once the pill has closed again.
  // The pill naming a session left running in another book: clicked, back to that book, by the main window's own switch.
  ipcMain.handle('haligtree:books:go', (_event, id: unknown) => inHome('haligtree:book-switch', String(id)))
  // Whether the pointer is over the pill's window now: the open island folds
  // itself once the pointer has gone, even when the page never heard it leave
  // (a menu or a tip open as it went, the Mac asleep in between).
  ipcMain.handle('focus:pointer', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== focusPill || !win.isVisible()) return true
    // Test runs park the pill off screen and point with a pretend pointer: there, on it unless a probe says not.
    if (process.env.HALIGTREE_QA_AWAY) return (globalThis as { pillPointer?: boolean }).pillPointer ?? true
    const at = screen.getCursorScreenPoint()
    const { x, y, width, height } = win.getBounds()
    return at.x >= x && at.x < x + width && at.y >= y && at.y < y + height
  })
  ipcMain.handle('focus:size', (event, height: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== focusPill) return false
    const bounds = win.getBounds()
    const next = Math.round(Math.max(PILL_REST, Math.min(640, Number(height) || PILL_REST)))
    if (next !== bounds.height) win.setBounds({ ...bounds, height: next })
    return true
  })
  // A screenshot for the session's log: the screen the pill is on, without
  // the pill or any other window of Haligtree's. It needs Screen Recording;
  // refused or never granted, the pill says so and offers paste or drop instead.
  ipcMain.handle('focus:shot', async (event) => {
    const shot = await shootScreen(displayOf(BrowserWindow.fromWebContents(event.sender)))
    if ('denied' in shot) return shot
    const url = await storeImage('image/png', new Uint8Array(shot.png))
    return url ? { url } : null
  })
  // The same for quick capture's note: the screen the box is on, and the app
  // in front there, for its caption.
  ipcMain.handle('shots:screen', async (event, area?: unknown) => {
    const box = BrowserWindow.fromWebContents(event.sender)
    // The crosshair takes the keys from the box: that is not a click away, so it stays open (like a dialog).
    if (area === true) dialogs += 1
    // A resize glide under way lands first, or it keeps pulling the box back while it tucks away.
    if (area === true && pending?.win === box) (arriving?.(), settle())
    const shot = await (area === true ? shootArea(box) : unseen(box, () => shootScreen(displayOf(box), box))).finally(() => {
      if (area !== true) return
      dialogs -= 1
      if (box && box === prompt && !box.isDestroyed()) void refit(box)
    })
    if ('denied' in shot || 'cancelled' in shot) return shot
    const url = await storeImage('image/png', new Uint8Array(shot.png))
    return url ? { url, app: shot.app } : null
  })
  /**
   * ⇧⌘. from anywhere: pick an area of the screen at once, then quick capture
   * comes up with the picture in and the caret on the line under it. Esc in
   * the pick is nothing saved and no box. Refused Screen Recording, the box
   * comes up and says so.
   */
  let picking = false
  async function areaIntoBox(): Promise<void> {
    if (picking) return
    picking = true
    if (!prompt) createWindow()
    const box = prompt && prompt.isVisible() ? prompt : null
    dialogs += 1
    try {
      const shot = await shootArea(box)
      if ('cancelled' in shot) return
      const sent = 'denied' in shot ? shot : await storeImage('image/png', new Uint8Array(shot.png)).then((url) => (url ? { url, app: shot.app } : null))
      if (!sent) return
      shotWaiting = sent
      if (!prompt?.isVisible() || !prompt.isFocused()) toggleWindow()
      if (prompt && !prompt.webContents.isLoading()) (prompt.webContents.send('box:picture', sent), (shotWaiting = null))
    } finally {
      dialogs -= 1
      picking = false
    }
  }
  // For the probes, which cannot press a key the whole Mac hears.
  if (process.env.HALIGTREE_QA_AWAY) (globalThis as { areaIntoBox?: () => Promise<void> }).areaIntoBox = areaIntoBox
  let shotWaiting: { url: string; app: string } | { denied: true; asked: boolean } | null = null
  // A picture taken before the box's page could listen: handed over once it asks.
  ipcMain.handle('box:picture', () => {
    const was = shotWaiting
    shotWaiting = null
    return was
  })
  // The camera, for a selfie in a session's log: asked for before its first use.
  ipcMain.handle('shots:camera', () => cameraAccess())
  // The main window's page has drawn itself: it may be shown now (whenHomeDrawn).
  ipcMain.on('home:drawn', (event) => {
    if (!home || event.sender !== home.webContents || homeDrawn) return
    homeDrawn = true
    homeTimes.drawn ??= Math.round(performance.now())
    for (const go of drawnWaits.splice(0)) go()
  })
  ipcMain.handle('aerospace:here', () => !!AEROSPACE)
  // Whether the asking window is on screen: the sandbox's blade waits for it before its sound.
  ipcMain.handle('window:is-shown', (event) => !!BrowserWindow.fromWebContents(event.sender)?.isVisible())
  ipcMain.on('shots:privacy', (_event, what: unknown) => void privacySettings(what === 'camera' ? 'camera' : 'screen'))
  // Whether the screen can be seen now, asked again whenever a notice about it is in view and its window comes to the front.
  noteScreenAtStart()
  ipcMain.handle('shots:access', () => screenAccess())
  // Started again so a permission turned on since is live: the same book, sandbox or not.
  ipcMain.on('app:restart', () => (SANDBOX ? relaunch('sandbox') : restartNow()))
  // The end of a session or timer, said around the edge of the screen.
  ipcMain.on('glow', (_event, tone: unknown) => (tone === 'break' ? breakSparks() : showGlow(tone === 'cancel' ? 'cancel' : 'done')))
  // A break arriving: its sparks burst from the pill's ring on the glow's full-screen layer, so they fly out past the pill.
  const breakSparks = (): void => {
    if (!focusPill || focusPill.isDestroyed() || !focusPill.isVisible()) return
    const tucked = notchScreen()
    // Test runs park the pill off screen: there, where it would have been.
    const { workArea, bounds } = tucked?.display ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const at = process.env.HALIGTREE_QA_AWAY ? { x: bounds.x + Math.round(bounds.width / 2) - 170, y: tucked ? bounds.y : workArea.y + 6 } : focusPill.getBounds()
    // The ring: 8px in from the pill's left (the window is 16px wider), 19px further, centred in the band.
    showGlow('break', { x: at.x + 8 + (tucked ? 23 : 19), y: at.y + (tucked ? Math.round(tucked.height / 2) : 8 + 21) })
  }
  powerMonitor.on('lock-screen', () => void (screenLocked = true))
  powerMonitor.on('unlock-screen', () => void (screenLocked = false))
  // The nudge card: what it was told before it could listen, its height as its cards change, and gone once empty.
  whenNudge(showNudge)
  ipcMain.handle('nudge:waiting', (event) => nudgeHeld(event.sender)?.waiting.splice(0) ?? [])
  ipcMain.on('nudge:size', (event, height: unknown) => {
    const win = nudgeHeld(event.sender)?.win
    if (!win) return
    const next = Math.round(Math.max(0, Math.min(520, Number(height) || 0)))
    if (!next) return void win.hide()
    win.setBounds({ ...win.getBounds(), height: next })
  })
  // A session ended while away, said by the pill when the pill itself is not on screen (the time kept in the note).
  ipcMain.on('nudge:show', (_event, nudge: Nudge) => nudge && typeof nudge === 'object' && showNudge(nudge))
  ipcMain.handle('glow:waiting', () => {
    const was = glowWaiting
    glowWaiting = null
    return was
  })
  // A note stuck to the desktop, or taken down.
  // Every glide paced on the screen's own frames, 60 or 120 a second as it runs.
  paceBy(() => 1000 / Math.max(30, Math.min(240, screen.getPrimaryDisplay().displayFrequency || 60)))
  ipcMain.on('stickies:gather', () => gatherStickies())
  // Taken down from its own X or ⌘W: it peels off, and the window you can see
  // says so with the way back; the menu bar keeps "Put back" a little longer.
  ipcMain.on('sticky:takedown', (event, title: unknown) => takeDownSticky(BrowserWindow.fromWebContents(event.sender), String(title ?? '')))
  ipcMain.on('sticky:putback', () => putStickyBack())
  // A sticky's page asks its paper's colour as it starts (a reload keeps it too).
  ipcMain.handle('sticky:tint', (event) => stuckAs(keyOfSticky(BrowserWindow.fromWebContents(event.sender)) ?? '')?.tint ?? null)
  // A task's right-click menu is taller and wider than a sticky's small window,
  // so the Mac draws it; the place of the line chosen goes back to the page.
  type Line = { label?: string; separator?: boolean; submenu?: Line[] }
  ipcMain.handle('sticky:menu', (event, items: unknown) => new Promise<number[] | null>((resolve) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !Array.isArray(items)) return resolve(null)
    let chosen: number[] | null = null
    const build = (list: Line[], path: number[]): Electron.MenuItemConstructorOptions[] => list.map((one, n): Electron.MenuItemConstructorOptions =>
      one.separator ? { type: 'separator' } : one.submenu ? { label: String(one.label ?? ''), submenu: build(one.submenu, [...path, n]) } : { label: String(one.label ?? ''), click: () => void (chosen = [...path, n]) })
    Menu.buildFromTemplate(build(items as Line[], [])).popup({ window: win, callback: () => setTimeout(() => resolve(chosen), 0) })
  }))
  // "Open it": the note opens in the main window, its page growing out of where
  // the sticky is (grow.ts). With ⌥ held, the sticky comes down as it does.
  ipcMain.on('sticky:open', (event, tier: unknown, id: unknown, title: unknown, alt: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const key = keyOfSticky(win)
    if (!win || !key || typeof tier !== 'string' || typeof id !== 'string') return
    const card = cardOf(win.getBounds(), insetOf(key))
    sendHome(tier, id, undefined, 'window')
    growFrom(home, card, { title: String(title ?? ''), tint: stuckAs(key)?.tint, round: builtGlass.get(key) ? 10 : 8 })
    if (alt) takeDownSticky(win, String(title ?? ''))
  })
  ipcMain.on('stickies:tidy', (event) => void tidyStickies(event.sender))
  ipcMain.handle('stickies:out', () => stickiesOut())
  ipcMain.on('stickies:untidy', () => untidyStickies())
  ipcMain.on('sticky', (_event, type: unknown, id: unknown, on: unknown) => {
    if (typeof type === 'string' && typeof id === 'string') stick(type, id, Boolean(on))
  })
  // Beacons once the stickies are back, then as goals change, and at their moments.
  registerFrost()
  void restoreStickies().then(beacons)
  whenGoals(() => (beacons(), updateTray()))
  // The bubble comes or goes with Settings' "Session timer shows in".
  whenFocusShows(() => (focusWanted ? showFocus(true) : placeFocus(), focusPill?.webContents.send('focus:placed')))
  powerMonitor.on('unlock-screen', () => beaconMoment('wake'))
  powerMonitor.on('resume', () => beaconMoment('wake'))
  // The goal cards' tuck-away rules follow the clock, a focus session and the days out of sight.
  setInterval(applyRules, 30_000)
  // At the Mac (touched in the last two minutes) and three hours since the last: out again.
  setInterval(() => {
    if (powerMonitor.getSystemIdleTime() < 120 && Date.now() - lastAppear >= 3 * 3600_000) beaconMoment('active')
  }, 5 * 60_000)
  // Now and then one sticky stirs, so it is seen again rather than becoming
  // part of the desktop: every 25 to 45 minutes, while you are at the Mac,
  // one at a time in turn. The sticky itself declines if you are writing in it.
  let stirred = 0
  const stirLater = (): void => void setTimeout(() => {
    const up = [...stickies.entries()].filter(([key, win]) => !win.isDestroyed() && win.isVisible() && stickyUp(key)).map(([, win]) => win)
    if (stickyStir() && motionOn() && !gate().blackout && up.length && powerMonitor.getSystemIdleTime() < 120) up[stirred++ % up.length].webContents.send('sticky:stir')
    stirLater()
  }, (25 + Math.random() * 20) * 60_000)
  stirLater()
  // Pointed at, a goal's card stays; let go, one out now and then tucks a
  // minute later. Its X tucks it: till its next moment, or for an always
  // one, till tomorrow. The other goals' cards stay.
  ipcMain.on('beacon:hold', (event, on: unknown) => {
    const key = keyOfSticky(BrowserWindow.fromWebContents(event.sender))
    if (!key || (!key.startsWith('goal:') && stickyTuck() === 'off')) return
    const win = stickies.get(key)
    // Pointed at as a tab, it opens; the pointer watched from then on (shapeCard).
    if (on) return void (beaconHeld.add(key), win && peeking.has(key) && shapeCard(key, win))
    // Left as a card opened from its tab, the watch folds it back.
    if (peekWatch.has(key)) return
    beaconHeld.delete(key)
    if (beaconModes.get(key) === 'sometimes') tuckLater(key)
  })
  ipcMain.on('beacon:tuck', (_event, id: unknown) => {
    const key = `goal:${id}`
    if (!beaconModes.has(key)) return
    tucked.set(key, beaconModes.get(key) === 'sometimes' ? Infinity : new Date().setHours(24, 0, 0, 0))
    beaconHeld.delete(key)
    applyStickies()
  })
  // Shown again, every sticky comes back, those put away on their own too. A quiet
  // sound whichever way it went, from the window in front if it is Haligtree's, else the box: never a sticky being hidden.
  let stickiesShown = stickyPrefs().shown
  whenStickies(() => {
    const { shown } = stickyPrefs()
    if (shown && stuck.some((one) => one.hidden)) stuck.forEach((one) => delete one.hidden), keepStuck()
    const front = BrowserWindow.getFocusedWindow()
    const voice = front && ![...stickies.values()].includes(front) ? front : prompt
    if (shown !== stickiesShown && voice && !voice.isDestroyed()) voice.webContents.send('stickies:shown', shown)
    stickiesShown = shown
    // Glass or not is how a window is made: one made the other way is made again, in place.
    const glass = stickyGlass() && !nativeTheme.prefersReducedTransparency
    for (const [key, win] of [...stickies]) {
      if (win.isDestroyed() || builtGlass.get(key) === glass) continue
      const [type, ...rest] = key.split(':')
      const at = win.getBounds()
      // The card stays where it was, the same size: as paper it has room round it, as glass none.
      const was = insetOf(key)
      builtGlass.set(key, glass)
      const now = insetOf(key)
      Object.assign(at, { x: at.x + was.left - now.left, y: at.y + was.top - now.top, width: at.width - was.left - was.right + now.left + now.right, height: at.height - was.top - was.bottom + now.top + now.bottom })
      // The old one fades out as the new one fades in where it was: one card changing its material, not a blink.
      stickies.delete(key)
      fadeOutSticky(win)
      quietly.add(key)
      stick(type, rest.join(':'), true, at)
    }
    applyStickies()
    updateTray()
  })
  // "Hide this one", from its own hover controls.
  ipcMain.on('sticky:hide', (_event, type: unknown, id: unknown, title: unknown) => {
    const key = `${type}:${id}`
    const one = stuckAs(key)
    if (!one) return
    one.hidden = true
    keepStuck()
    // Said in Haligtree's own nudge card, with “Bring it back”: a hidden sticky is never only gone.
    showNudge({ kind: 'sticky', id: key, title: typeof title === 'string' && title.trim() ? cut(title.trim(), 80) : 'A sticky note' })
    // Put away with a short fade rather than a blink; whole again for when it next comes out.
    const win = stickies.get(key)
    if (!win || win.isDestroyed()) return
    const away = (): void => void (!win.isDestroyed() && (win.hide(), win.setOpacity(1)))
    if (stillness() || !win.isVisible()) return away()
    tween(160, (t) => (win.isDestroyed() ? false : void win.setOpacity(1 - outCubic(t))), away)
  })
  // “Bring it back”, from the nudge card: out again where it was.
  ipcMain.on('sticky:unhide', (_event, key: unknown) => {
    const one = stuckAs(String(key))
    if (!one?.hidden) return
    delete one.hidden
    keepStuck()
    if (!stickyPrefs().shown) return void showStickies(true)
    applyStickies()
  })
  // A sticky's whole window wiggles where it stands, as a Mac's own window shakes
  // at a wrong password: a few quick, shrinking swings side to side, then exactly
  // back. Now and then, when it stirs. A drag mid-move always wins.
  const wiggled = new WeakMap<BrowserWindow, number>()
  ipcMain.on('sticky:wiggle', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || stillness() || lifted.has(win) || held.has(win) || Date.now() - (wiggled.get(win) ?? 0) < 1500) return
    wiggled.set(win, Date.now())
    const { x, y } = win.getBounds()
    placed.set(win, { x, y })
    glide(win, 420, (t) => ({ x: t >= 1 ? x : x + Math.round(5 * Math.sin(t * Math.PI * 6) * (1 - t) ** 1.5), y }))
  })
  // Pointed at, a sticky's window rises a few points, as a card picked off the
  // desk does, and sets down again once the pointer has left it. The pointer is
  // watched from here rather than the page, so the rise itself, slipping the
  // window out from under a pointer near its foot, never counts as leaving.
  const RISE = 6
  const lifted = new WeakMap<BrowserWindow, { x: number; y: number }>()
  ipcMain.on('sticky:lift', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || stillness() || lifted.has(win) || held.has(win)) return
    const rest = win.getBounds()
    lifted.set(win, { x: rest.x, y: rest.y })
    // Picked up: wherever your hand puts it is its place, never set back down where it rose from.
    unlift.set(win, () => (clearInterval(watch), lifted.delete(win), unlift.delete(win)))
    placed.set(win, { x: rest.x, y: rest.y })
    let watch: ReturnType<typeof setInterval>
    // Up first, then watched: a set-down starting mid-rise would fight it.
    // The same length and curve as a paper card's lift in its page (LIFT_MS), so glass and paper feel one material.
    glide(win, LIFT_MS, (t) => ({ x: rest.x, y: rest.y - Math.round(RISE * outQuint(t)) }), () => down())
    const down = (): void => void (watch = setInterval(() => {
      if (win.isDestroyed()) return clearInterval(watch)
      // Dragged while up: wherever you put it is its place now.
      if (!ours(win)) return (clearInterval(watch), lifted.delete(win), void unlift.delete(win))
      const p = screen.getCursorScreenPoint()
      const b = win.getBounds()
      if (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < rest.y + b.height) return
      clearInterval(watch)
      const from = b.y
      glide(win, LIFT_MS, (t) => ({ x: rest.x, y: Math.round(from + (rest.y - from) * outQuint(t)) }), () => (lifted.delete(win), void unlift.delete(win)))
    }, 80))
  })
  // Its corner grip: the window is not resizable (see stick), so the size is set
  // here, once a frame at most (the page sends no more). Pulled past its least or
  // most, it gives up to 6 points, as a rubber band would, and springs back to
  // the limit when let go (`done`).
  ipcMain.on('sticky:resize', (event, width: unknown, height: unknown, done: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const key = keyOfSticky(win)
    if (!win || !key || typeof width !== 'number' || typeof height !== 'number') return
    const at = win.getBounds()
    const exact = stickySize(width, height, at)
    if (!done) {
      const least = stickySize(0, 0, at)
      const most = stickySize(Infinity, Infinity, at)
      const give = stillness() ? exact : { width: Math.round(rubber(width, least.width, most.width)), height: Math.round(rubber(height, least.height, most.height)) }
      if (give.width !== at.width || give.height !== at.height) win.setBounds({ ...at, ...give })
      return
    }
    // Grown past the screen's edge, it glides back until the card is all in view; kept where it ends.
    const keep = (): void => {
      if (win.isDestroyed()) return
      const now = win.getBounds()
      const { x, y } = cardInView(now, insetOf(key), screen.getDisplayMatching(now).workArea)
      if (x !== now.x || y !== now.y) return moveStickies([[key, win, { x, y }]], false)
      const one = stuckAs(key)
      if (one) (one.bounds = now), keepStuck()
    }
    if (stillness() || (exact.width === at.width && exact.height === at.height)) return (win.setBounds({ ...at, ...exact }), keep())
    tween(200, (t) => {
      if (win.isDestroyed()) return false
      const k = overshoot(t)
      // Where it is now, not where it was: a size settling never pulls the window back.
      const { x, y } = win.getBounds()
      win.setBounds({ x, y, width: Math.round(at.width + (exact.width - at.width) * k), height: Math.round(at.height + (exact.height - at.height) * k) })
      return true
    }, keep)
  })
  // A sticky's picture in Haligtree's own Quick Look: a see-through window over the
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
      title: APP_NAME,
      type: 'panel',
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
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
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

  // A switch changed: each window set once, to where it ends up, so one kept from shares never shows in between.
  whenRecordings(() => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) protect(win)
  })
  whenSafeMode((on) => {
    safeWindows(on)
    updateTray()
  })

  // The main window fills the screen's work area, or goes back to where it
  // was. A press mid-glide reads where it is going, so two quick presses
  // turn it round rather than undo each other.
  // Filling is the Mac's own full screen, a Space of its own, as the green
  // button does: setting the window's size by hand fought a tiling manager
  // (AeroSpace put it straight back), so it never looked filled.
  ipcMain.handle('home:fill', (event, fill: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const on = fill === 'toggle' ? !win.isFullScreen() : Boolean(fill)
    if (win.isFullScreen() !== on) win.setFullScreen(on)
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
    if (!promptPainted) {
      promptPainted = true
      const waiting = promptWaiting
      promptWaiting = null
      waiting?.()
    }
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
    // Its size and colours worked out now, so the note it lands in keeps its place.
    lookAhead(`${hash}.${extension}`)

    return `haligtree://assets/${hash}.${extension}`
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

    return `haligtree://assets/${hash}.${suffix}`
  })

  // Write text the renderer produced to a file the user picks: JSON, markdown
  // or HTML. The renderer does the converting; this only puts bytes on disk.
  ipcMain.handle('export-text', async (_event, name: unknown, text: unknown) => {
    if (typeof name !== 'string' || typeof text !== 'string') return false

    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name })
    if (canceled || !filePath) return false

    await busy(() => writeFile(filePath, text, 'utf8'))
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

    // The beam turns in every window while the PDF is laid out and written.
    return busy(async () => {
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
  })

  // Copy a stored file somewhere the user picks. The store names everything by
  // its hash, so the original name has to be handed back in for the dialog.
  ipcMain.handle('save-file-as', async (_event, src: unknown, name: unknown) => {
    const stored = typeof src === 'string' ? src.replace('haligtree://assets/', '') : ''
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
    const name = typeof src === 'string' ? src.replace('haligtree://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return false

    const problem = await shell.openPath(join(assetsDir(), name))
    return problem === ''
  })

  // A stored picture or file dragged out of a note to another app (Finder, a
  // chat, a browser): the system drag starts here, with the real file. The
  // store names files by their hash, so a copy under the name it was dropped
  // with (or "Picture") goes instead, in a folder of Haligtree's own.
  const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'heic', 'svg'])
  ipcMain.on('drag-out', (event, src: unknown, name: unknown) => {
    const stored = typeof src === 'string' ? src.replace('haligtree://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(stored)) return
    const from = join(assetsDir(), stored)
    if (!existsSync(from)) return
    const extension = stored.split('.').pop()!
    const said = (typeof name === 'string' ? name : '').replace(/[/\\:\0]/g, ' ').trim().slice(0, 120)
    const file = said ? (said.toLowerCase().endsWith(`.${extension}`) || (extension === 'jpg' && /\.jpe?g$/i.test(said)) ? said : `${said}.${extension}`) : `${IMAGE_EXT.has(extension) ? 'Picture' : 'File'}.${extension}`
    const dir = join(app.getPath('temp'), 'haligtree-drag', stored.slice(0, 12))
    const to = join(dir, file)
    try {
      mkdirSync(dir, { recursive: true })
      if (!existsSync(to)) copyFileSync(from, to)
    } catch {
      return
    }
    // What follows the pointer: the picture itself, small, or Haligtree's icon for any other file.
    let face = IMAGE_EXT.has(extension) ? nativeImage.createFromPath(to) : nativeImage.createEmpty()
    if (!face.isEmpty()) face = face.resize({ width: Math.min(96, face.getSize().width) })
    if (face.isEmpty()) face = nativeImage.createFromPath(icon).resize({ width: 64 })
    if (face.isEmpty()) face = nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 128), { width: 32, height: 32 })
    event.sender.startDrag({ file: to, icon: face })
  })

  // The stored file, picked out in a Finder window.
  ipcMain.handle('show-file', (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('haligtree://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return false
    shell.showItemInFolder(join(assetsDir(), name))
    return true
  })

  // Put a stored image on the system clipboard, so it can be pasted into any
  // app rather than only back into this one. Done here because the renderer
  // cannot read the store: its own content policy forbids fetching a custom
  // scheme, and the file is not reachable any other way.
  ipcMain.handle('copy-image', async (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('haligtree://assets/', '') : ''
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

  // The clipboard's picture as the system draws it. A paste from Apple Notes
  // hands the page a file that points into Notes' own folder and cannot be
  // read; the picture itself is still on the clipboard, and this reads it.
  // A TIFF (what Notes often offers) goes through the system's reader into a PNG.
  ipcMain.handle('clipboard-image', async () => {
    try {
      for (const item of await clipboard.read()) {
        const mime = item.types.find((type) => type.startsWith('image/'))
        if (!mime) continue
        const bytes = new Uint8Array(await ((await item.getType(mime)) as Blob).arrayBuffer())
        if (!bytes.length) continue
        if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/gif' || mime === 'image/webp') return { mime, bytes }
        const image = nativeImage.createFromBuffer(Buffer.from(bytes))
        if (!image.isEmpty()) return { mime: 'image/png', bytes: new Uint8Array(image.toPNG()) }
      }
    } catch {
      // Nothing readable on the clipboard: the caller falls back to the HTML.
    }
    return null
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
  electronApp.setAppUserModelId('com.starskourge.haligtree')

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
        return { title: decodeHTML(field('title')), description: decodeHTML(field('author_name')), image: field('thumbnail_url') }
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

      // Every entity a page may write, named or numbered: "What&#x27;s new" reads "What's new".
      const decode = (text: string): string => decodeHTML(text).trim()

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
  // A YouTube thumbnail in 16:9, without the black bands its 4:3 ones carry:
  // the sharpest size where the video has one, else the size every video has.
  const keepWide = async (src: string): Promise<string> => {
    const max = wideThumb(src, 'maxresdefault')
    if (!max) return keep(src)
    const kept = await keep(max)
    return /^https?:/.test(kept) ? keep(wideThumb(src)!) : kept
  }
  ipcMain.handle('fetch-link-metadata', async (_event, url: unknown) => {
    const found = await lookUp(url)
    const [image, icon] = await Promise.all([keepWide(found.image), keep(found.icon)])
    return { ...found, image, icon }
  })

  // Opening Haligtree opens the main window, as any app's does. Started at login
  // it is made in the background instead, once the prompt is up, and waits
  // for the Dock icon, the menu bar or ⌘. to be asked for. A brand-new Haligtree
  // opens it for the welcome either way, and arriving in or back from the
  // sandbox opens it too: that is where you were.
  // The window you will see is made first; what can wait (the box, the menu
  // bar icon, the Dock's picture) is made once it has painted, so none of it
  // holds up the first screen. Every handler above is already listening.
  let later = false
  const theRest = (): void => {
    if (later) return
    later = true
    if (!prompt) createWindow()
    createTray()
    iconReady = true
    wearIcon()
    // Dates and emoji (src/main/lazy), read a moment later while nothing waits, so their first use is instant.
    setTimeout(() => (warmChrono(), void warmEmoji()), 1000)
  }
  if (!startedAtLogin || firstRun() || process.argv.includes('--show-home')) {
    openHome()
    // Once it is on screen; should macOS not say so, soon after its first paint.
    makeHome().once('show', () => setImmediate(theRest))
    makeHome().once('ready-to-show', () => setTimeout(theRest, 1000))
    setTimeout(theRest, 4000)
  } else {
    theRest()
    setTimeout(makeHome, 1500)
  }
  // The QA harness imports a test vault without the folder dialog.
  if (process.env.HALIGTREE_QA_VAULT) void importVault(process.env.HALIGTREE_QA_VAULT)
  // Arrived by Import into…: the import asked for, once the main window is up.
  void nextImport().then((next) => next && setTimeout(() => void (next.what === 'vault' ? (next.root ? importVault(undefined, next.root) : importVault()) : importFiles()), 1200))

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
    // The menus say the keys as they are now.
    chosenKeys = keys
    updateTray()
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
    take('⇧⌘.', () => void areaIntoBox())
    take('⌥⌘S', () => (toggleSafeMode(), updateTray()))
    take('⌃⌥⌘N', () => showStickies())
    take('⌃⌥⌘T', () => void tidyStickies())
    // Every sticky tucked into a tab at the edge, or brought back out.
    take('⌃⌥⌘H', () => tuckStickies(stickyTuck() === 'off' ? 'tabs' : 'off'))
    // Ten more minutes on the session or break running, from anywhere; the pill rolls its time up and says so.
    take('⌃⌥⌘=', () => void extendRunning(10 * 60_000))
    // A bare focus session from anywhere, no task first: quick capture opens on “Start focus”'s lengths.
    take('⌃⌥⌘S', askFocus)
  }
  anywhere(whenKeys(anywhere))

  // The Dock icon clicked, or Haligtree opened again while it runs: the main
  // window, back from wherever it was put away. The sticky notes and the
  // box count as windows to macOS, so this does not wait for there to be none.
  app.on('activate', () => openHome())
  updateDock()
})

// A global shortcut outlives the window, so it has to be handed back or it
// stays registered against a process that is gone. The database folds its
// log of saves into the file and closes, so no -wal is left beside it: a
// plain copy of the folder is whole, and the other-book backup sees no change.
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  shutDatabase()
})

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
