import { reached, startTimes } from './start-times'
import './main-errors'
import { stopTimers } from './timers'
import './stalls'
import { ANCHOR } from './tagline'
import { registerWrite } from './write'
import { registerReminders } from './reminders'
import { registerAway } from './away'
import { registerMacCalendar } from './mac-calendar'
import { fileURLToPath, pathToFileURL } from 'url'
import { app, shell, BrowserWindow, ClipboardItem, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, protocol, screen, session, systemPreferences, Tray } from 'electron'
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
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { catchFreezes } from './freeze-catch'
import { appendFile, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { writeWhole, writeWholeSync } from './write-whole'
import { basename, dirname, join, relative } from 'path'
import { uptime } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
// The mark alone, black on clear at twice the menu bar's 18 points, for its template image.
import trayIcon from '../../resources/tray.png?asset'
import iconBronze from '../../resources/icon-bronze.png?asset'
import iconGold from '../../resources/icon-gold.png?asset'
import { registerUsage, type Via } from './usage'
import { resolveWaiting, resolveWithin } from './renames'
import { importApkg, HOLD_OVER, type ApkgAsk, type ApkgChoice } from './anki-apkg'
import { alreadyImported, sourceChanged, captureText, changed, rescueDrawing, database, shutDatabase, importAnki, importBookmarks, importHighlights, importMarkdown, importNote, linkImported, recordOpen, registerCaptures, registerImportConversion, whenChanged, dropDuplicateTags, setImporting, type Imported } from './captures'
import { isPrivateFile, looksPrivate } from './import'
import { warmChrono } from './lazy/chrono'
import { warmEmoji } from './lazy/emoji'
import { warmZod } from './lazy/zod'
import { backupBase, backupDir } from './backup'
import { pageFor } from './pages'
import { lineAt, menuOpenFor, onMenuShut, popupMenu, registerPopupMenu, type PopupLine } from './popup-menu'
import { HINT_ROOM, hintRoom, type HintSide } from './hint-room'
import { registerLongNames } from './long-names'
import { nameLongOn, aiStudyOn, activeSession, extendRunning, whenNudge, atLogin, badge, beaconDefault, tuckRules, tempusDots, blurOn, boxAutoHide, boxOneLine, boxPlacement, gate, motionOn, soundsOn, stickyGlass, openGoals, registerHome, registerHaligtree, showStickies, stickyPrefs, wasTucked, toggleSafeMode, whenKeys, whenRecordings, whenIcon, appIcon, recordingPrefs, type Recordings, type OpenGoal, whenSafeMode, whenStepAway, meetingSeen, quietSeen, whenGoals, setGoalBeacon, whenStickies, focusBubbleShown, focusToolsOn, whenFocusShows, pillInNotch, pillYields, sleepChoice, sunPlace } from './haligtree'
import { daysLeft, percent, tempus, wayThrough } from './goal-days'
import { PEEK_OUT_MS, cardComesDown, peeksOut, restNow, type Rest } from './goal-tuck'
import { cursorInBackground, cursorShown, tap, tapKinds, taps } from './haptic'
import { fetchOutside, setOutsideAgent, isOutside } from './outside'
import { registerNotes } from './notes'
import { fitSmall, isSmall, registerSmallWindows } from './small-window'
import { registerGroups } from './groups'
import { registerSections } from './sections'
import { registerFolders } from './folders'
import { registerFolderGems } from './folder-gems'
import { registerPeriods } from './periods'
import { nextMilestones, registerMilestones } from './milestones'
import { peopleNow, registerEvents, whenEvents } from './events'
import { followEvents, forgetAnyway, setSignal, showAnyway, shownAnyway, watchMac, whenMeeting } from './in-meeting'
import { anywayKept, deskAway } from './meeting-away'
import { registerReadingQueue } from './reading-queue'
import { registerReadTime } from './read-time'
import { registerStatsMore } from './stats-more'
import { registerPractices, whenPracticeOffer, type Offer } from './practices'
import { registerIssues } from './issues'
import { brief, clock, dayKey, dayMonth, dayName, howLong, num, useTwelveHour, plural } from './dates'
import { macTwelveHour } from './mac-clock'
import { registerScenery, sceneryDir, startCopies } from './scenery'
import { celebrationFile, registerCelebrations } from './celebrate'
import type { Nudge } from './nudge'
import { firstRun, isWelcoming, keepWindowBeforeWelcome, welcomeName, noteChord, welcomeBoxSpot, windowBeforeWelcome, pretendTaken, registerOnboarding, whenWelcoming, whereTray } from './onboarding'
import { SCENE_COVERED, SCENE_HANDOVER, SCENE_WORDS, plainArrival } from './arrival'
import { registerUnused } from './unused'
import { registerMedia } from './media'
import { registerCollect } from './collect'
import { registerTranscribe } from './transcribe'
import { meetingNow, meetingState, registerMeeting, startMeeting, stopMeeting, type Live } from './meeting'
import { Stopped, begin, end as endJob, registerJobs } from './jobs'
import { registerLabels } from './labels'
import { registerDefaultApp } from './default-app'
import { readCopy, registerPdfText } from './pdf-text'
import { registerStudyAi, registerUnderstand } from './understand'
import { registerServices, whenFilesSent } from './services'
import { registerSpotlight, SPOTLIGHT_ITEM } from './spotlight'
import { registerDictation } from './dictation'
import { glassShapes, nonActivating, registerGlass, watchScroll } from './glass'
import { registerPeople } from './people'
import { registerSources } from './sources'
import { registerCite } from './cite'
import { registerFeed } from './feed'
import { growFrom } from './grow'
import { grab, whenLetGo } from './hand'
import { hideGuides, readyGuides, showGuides } from './guides'
import { CARRIED, LEAVE, SNAP, cameOnto, guideLines, lineUp, type Held, type Line, type Lined, type Reach } from './snap-lines'
import { throwSpot } from './throw-spot'
import { CORNERS, REST_MS, beside, clearPlace, cornerPlace, overlaps, topPlaces, type Corner } from './step-aside'
import { cardInView, cardOf, LIFT_MS, onFrames, outCubic, outQuart, outQuint, paceBy, rubber, settle as overshoot, tween, type Inset } from './sticky-place'
import { registerDefine } from './define'
import { findVaultNotes, isVault, registerObsidian, vaultChoices, vaultRoots } from './obsidian'
import { bringAppleNotes, notesReader, type NotesFolder } from './apple-notes'
import { fileIntoGroups, filedSaid, importFolder, registerNoteImports } from './note-imports'
import { assetsDir, known, lookAhead, registerPictures, smallCopy } from './pictures'
import { registerPictureSight } from './picture-sight'
import { registerContacts } from './contacts'
import { letWebPictures } from './web-pictures'
import { registerSessionLog, sleptThrough } from './session-log'
import { registerSiteBlock } from './site-block'
import { cameraAccess, displayOf, noteScreenAtStart, privacySettings, screenAccess, shootArea, shootScreen, tuckedWindow, unseen } from './shots'
import { registerFocusStats } from './focus-stats'
import { registerSimilar } from './similar'
import { registerOffers } from './offers'
import { allPlaces, sunToday } from './sun'
import { registerJournal } from './journal'
import { registerPdfHighlights } from './pdf-highlights'
import { kindByEnd, pdfsToFind } from './find-files'
import { addMedia, turnedCopy } from './media'
import { addSaid } from './media-words'
import { registerWebArticles } from './web-articles'
import type { Missed } from './article-clean'
import { articleNames } from './article-names'
import { registerFreeSites } from './free-sites'
import { registerWordLog } from './word-log'
import { registerSite } from './site'
import { frostWindow, registerFrost, retellFrost } from './frost'
import { BOOK, SANDBOX, arrived, barsHere, assetElsewhere, carriesWelcome, handedOff, windingDown, onHandOff, readShelf, realRoot, registerSandbox, relaunch, restartNow, useDataFolder, writeShelf } from './sandbox'
import { shortPath, untoldMove } from './old-data'
import { openOutside } from './app-folder'
import { books, copyBook, here, nameOf, nextImport, registerBooks } from './books'
import { wideThumb } from './video-thumbs'
import { busy } from './busy'
import { decodeHTML } from 'entities'
import { setAppMenu } from './app-menu'
import { pasteboard } from './pasteboard'
import { clip, cut, quoted } from './clip'
import { APP_NAME } from './name'
import { registerSpelling, wakeSpelling } from './spell-check'

// Every module above has run: main's code is read (start-times.ts).
reached('code')

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

/**
 * Images are addressed by the hash of their bytes, not by name.
 *
 * A pasted image has no filename at all, and the same screenshot dropped into
 * three notes should not be stored three times. The hash solves both, and makes
 * the write idempotent: the same bytes always produce the same file.
 */
/** The largest picture a link card keeps, in bytes. */
const PICTURE_CAP = 10_000_000

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

// A test run's app goes when the run does: if the probe that launched it is
// killed outright (kill -9, a crashed runner), nothing is left to close it,
// and it sat on as "Sandbox · 1 due" in the menu bar. Its parent gone, it quits.
if (process.env.HALIGTREE_QA_AWAY) {
  const parent = process.ppid
  setInterval(() => process.ppid !== parent && app.exit(0), 2000).unref()
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
  // `stream`, so a stored video or recording can play (and seek) in a note;
  // `supportFetchAPI`, so the PDF reader can fetch a stored PDF's bytes.
  { scheme: 'haligtree', privileges: { standard: true, secure: true, stream: true, corsEnabled: true, supportFetchAPI: true } },
  // The first name, still answered: older backups and exported notes hold
  // mindflow:// links, and a restored one should still show its pictures.
  { privileges: { standard: true, secure: true, stream: true, corsEnabled: true, supportFetchAPI: true }, scheme: 'mindflow' }
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
/** "One line to start": the pill, as short as its one line (PILL in fit-box). */
const PILL = 56
/** What the writing asks for, as the page last measured it. */
let fit = FIT_MIN
/** The side panel and the expander, as the page last asked. */
let panelOpen = false
let expandedNow = false
/**
 * The side panel as the box wears it now: never while the welcome runs, which
 * teaches the small box alone. Your own choice (panelOpen) is kept for after. "One line to start" says the panel is
 * open only when ⌘\ (or its button, or the pinned chip) grows the pill into the box with it.
 */
const panelShown = (): boolean => panelOpen && !isWelcoming()
/** How wide the box should be now: one of its two widths, never one a glide left it at. */
const boxWidth = (): number => (panelShown() ? WITH_PANEL : WIDTH)
/** How tall the box should be now. */
const boxHeight = (): number =>
  expandedNow ? SIZES.expanded.height : panelShown() ? SIZES.compact.height : Math.round(Math.min(SIZES.compact.height, Math.max(boxOneLine() && !isWelcoming() ? PILL : FIT_MIN, fit)))
/** For the probes: what main holds of the box's size, to set beside what the page shows (qa/pill-polish.mjs). */
;(globalThis as { haligtreeGlass?: () => unknown }).haligtreeGlass = () => [...glassShapes.entries()]
;(globalThis as { haligtreeBoxSize?: () => Record<string, unknown> }).haligtreeBoxSize = () => ({ fit, expanded: expandedNow, panelOpen, panelShown: panelShown(), height: boxHeight(), card: prompt && !prompt.isDestroyed() ? prompt.getBounds() : null, focused: BrowserWindow.getFocusedWindow()?.webContents.getURL().replace(/^.*\//, '') ?? null })

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
  // Where the welcome put it is the welcome's, not where you left it.
  if (!(win === prompt && welcomeBoxSpot())) {
    lastBounds = boundsOf(win)
    // A screen it was thrown to keeps where it was left there, moved since or not.
    const on = screen.getDisplayMatching(lastBounds).id
    if (thrownSpots().has(on)) keepSpot(on, lastBounds)
  }
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
  if (win === prompt) seeBoxFiling(win)
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
  // Out of the Dock only when summoned from another app. With a Haligtree window in front (the welcome's Catch, the main
  // window), turning into a menu bar app makes macOS take Haligtree out of the front: the box lost the keys the moment it
  // had them and put itself away (blur, `boxAutoHide`). It opens over Haligtree's own window then, so there is nothing
  // for AeroSpace to file it under that is not already where you are.
  const front = BrowserWindow.getFocusedWindow()
  if (win === prompt && front !== win) boxUp(!front)
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
// The app's theme decides the frosting behind every window, not the system's: see-through, the text sits on it.
// A solid theme hides it, so then the Mac's own look is followed and its dialogs (Save, Open) and menus match the
// Mac, unless glass stickies are on, whose frosting must still match the theme. Worn again when that setting changes.
let worn = { mode: 'dark', solid: false }
const wear = (): void => void (nativeTheme.themeSource = worn.solid && !stickyGlass() ? 'system' : worn.mode === 'light' ? 'light' : 'dark')
/**
 * A sticky chord from anywhere (⌃⌥⌘N, ⌃⌥⌘T, ⌃⌥⌘H) is under way: what it does lands at once, as Motion off
 * does, since a key is pressed many times a day and should never wait on a glide. The menu bar's items still glide.
 */
let byKey = false
const keyed = (run: () => void) => (): void => {
  byKey = true
  try {
    run()
  } finally {
    byKey = false
  }
}
const stillness = (): boolean => byKey || !motionOn() || systemPreferences.getAnimationSettings().prefersReducedMotion
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
  // The room above the card, for a hint: set while the box is still away, and shown only once the page has moved
  // its card down to match, so the card never jumps as it opens (qa/hint-room.mjs).
  const roomed = roomForHint(win, place)
  // Filed by AeroSpace under a workspace (boxFiled), the box is moved to the one in view first: left where it was
  // filed, it took you there.
  const here = boxToWorkspaceHere(win)
  if (roomed || here) return void Promise.all([roomed, here]).then(() => win.isDestroyed() || showPrompt(win))
  showPrompt(win)
}

/** The box shown where it was just put. */
function showPrompt(win: BrowserWindow): void {
  // For the probes: what the box showed as it came on screen (qa/pill-first-open.mjs).
  if (process.env.HALIGTREE_QA_TRACE && !win.isVisible()) win.once('show', () => qaTrace('prompt', win, { painted: promptPainted }))
  arrive(win)
  // Its guides ready before it can be carried (guides.ts).
  readyGuides()
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
  setTimeout(() => seeBoxFiling(win), 400)
}

/**
 * Load the app's page into a window. The query says which view it is, since
 * that is the one thing a fresh renderer can read about itself before any of
 * ours has run. Each kind of window has a page of its own (`pageFor`), so it
 * loads only its own code.
 */
/**
 * A window drawn larger than its card, iOS's way: the card is what you see and
 * move, the clear room round it is where its menus, pills and chips may hang
 * past the card's edge (and clicks pass through it, see passThrough). Once a
 * window is given room, every size and place main reads or sets on it
 * (getBounds, setBounds, getPosition, setPosition, getSize, setSize) is its
 * card's: the window follows with the room round it. Its page's own frame
 * (getContentBounds) stays the window's, as the page measures from there.
 */
type Room = { left: number; top: number; right: number; bottom: number }
const rooms = new WeakMap<BrowserWindow, Room>()
/** The room the box keeps round its card on every side: its controls above it (Spotlight's way), a menu's foot and its shadow. */
// Taller above: the controls sit there, and each one's tip opens above it, clear of the card.
const BOX_ROOM: Room = { left: 48, top: 88, right: 48, bottom: 48 }
const evenRoom = (px: number): Room => ({ left: px, top: px, right: px, bottom: px })
function overhang(win: BrowserWindow, room: Room): void {
  const real = { getBounds: win.getBounds.bind(win), setBounds: win.setBounds.bind(win) }
  rooms.set(win, { ...room })
  const around = (): Room => rooms.get(win) ?? evenRoom(0)
  const card = (): Electron.Rectangle => {
    const at = real.getBounds()
    const r = around()
    return { x: at.x + r.left, y: at.y + r.top, width: at.width - r.left - r.right, height: at.height - r.top - r.bottom }
  }
  const put = (next: Partial<Electron.Rectangle>, animate?: boolean): void => {
    const to = { ...card(), ...next }
    const r = around()
    real.setBounds({ x: to.x - r.left, y: to.y - r.top, width: to.width + r.left + r.right, height: to.height + r.top + r.bottom }, animate)
  }
  win.getBounds = card
  win.setBounds = put
  win.getPosition = () => [card().x, card().y]
  win.setPosition = (x: number, y: number, animate?: boolean) => put({ x, y }, animate)
  win.getSize = () => [card().width, card().height]
  win.setSize = (width: number, height: number, animate?: boolean) => put({ width, height }, animate)
  // A card's limits are the window's less its room (none set stays none).
  // A card's limits are kept as the card's, and the window's set from them with the room as it is now: more room
  // below for a menu still fits under a box held at its tallest (qa/box-menu-fit.mjs).
  const setMin = win.setMinimumSize.bind(win)
  const setMax = win.setMaximumSize.bind(win)
  const grown = (size: number, by: number): number => (size > 0 ? size + by : size)
  const limits = { min: [0, 0], max: [0, 0] }
  const apply = (): void => {
    const r = around()
    setMin(grown(limits.min[0], r.left + r.right), grown(limits.min[1], r.top + r.bottom))
    setMax(grown(limits.max[0], r.left + r.right), grown(limits.max[1], r.top + r.bottom))
  }
  win.setMinimumSize = (width: number, height: number) => ((limits.min = [width, height]), apply())
  win.setMaximumSize = (width: number, height: number) => ((limits.max = [width, height]), apply())
  relimit.set(win, apply)
}
/** Each overhung window's limits set again for its room as it is now. */
const relimit = new WeakMap<BrowserWindow, () => void>()
/**
 * A window's own right-click menu, drawn by main (a sticky's). Chromium asks for it when the page leaves a right-click
 * alone. A right-click on a word is taken by the writing first, to ask whether the word is misspelt (its spelling rows
 * are the page's own menu); spelt right, the page passes the right-click on here (`menu:own`) and the same menu opens.
 */
type OwnMenuAsk = Pick<Electron.ContextMenuParams, 'x' | 'y' | 'isEditable' | 'selectionText'> & { editFlags: Pick<Electron.EditFlags, 'canCut' | 'canCopy' | 'canPaste'> }
const ownMenus = new WeakMap<Electron.WebContents, (params: OwnMenuAsk) => void>()
ipcMain.on('menu:own', (event, x: unknown, y: unknown, picked: unknown) => {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return
  // The page's pixels to the window's (the app size, ⌘+). Asked from words you can write in: Paste is always there,
  // Cut and Copy when words are picked (the Mac picks the word under a right-click), as Chromium itself says it.
  const zoom = event.sender.getZoomFactor() || 1
  ownMenus.get(event.sender)?.({ x: Math.round(x * zoom), y: Math.round(y * zoom), isEditable: true, selectionText: typeof picked === 'string' ? picked : '', editFlags: { canCut: !!picked, canCopy: !!picked, canPaste: true } })
})
/**
 * What the box's page knows as it loads: the room its window keeps round the card, and with it
 * `side`: which side its hint room is on, set as it was made (createWindow);
 * `menu`: the room below the card it keeps for its own menus' feet, whatever a hint below adds to it (fit-box.ts);
 * `pill`: the pill's own width, so the page measures words wrapping only once the card is at it (App.tsx).
 */
const boxRoom = (): (Room & { side: HintSide; menu: number; pill: number }) | null => {
  const room = prompt && !prompt.isDestroyed() ? rooms.get(prompt) : undefined
  return room ? { ...room, side: hintSide ?? null, menu: BOX_ROOM.bottom, pill: WIDTH } : null
}
/**
 * The box's room written where its page reads it as it loads: the environment a window's process starts with, as
 * the book and the clock are (HALIGTREE_BOOK_HERE). The page asked for it with a call that waits on main, once per
 * load: the box stood still for as long as main was busy. Only the box has room (every other window is all card and
 * asks nothing); written before its page loads and again whenever the room or its hint's side changes, so a process
 * started later reads it as it is now. Not on the command line: a renderer process can be shared, and its arguments
 * with it.
 */
const roomInEnv = (): void => {
  const room = boxRoom()
  if (room) process.env.HALIGTREE_BOX_ROOM = JSON.stringify(room)
}
// The old way, for a box whose process was somehow started without it: a call that waits.
ipcMain.on('window:room', (event) => void (event.returnValue = (BrowserWindow.fromWebContents(event.sender) === prompt && boxRoom()) || evenRoom(0)))
/**
 * Room round the box's card for a hint, out of the card (hint-room.ts says where). Changed only while the box is
 * away, the page told first; resolves once it has drawn the card at the new room. Null when it is as it was, the
 * usual case: the box opens where it did.
 */
function roomForHint(win: BrowserWindow, place: Electron.Rectangle): Promise<void> | null {
  const was = rooms.get(win)
  if (!was) return null
  const { workArea } = screen.getDisplayMatching(place)
  const hinted = hintRoom(place, workArea, BOX_ROOM, boxOneLine() && !isWelcoming())
  const { side } = hinted
  hintNeeds = hinted.room
  // Under any card, the box with its panel too, a hint below keeps its room.
  hintFoot = side === 'below' ? Math.min(BOX_ROOM.bottom + HINT_ROOM, hinted.room.bottom) : BOX_ROOM.bottom
  const room = roomForPanel(win, place, hinted.room)
  if (hintSide === side && room.top === was.top && room.left === was.left && room.right === was.right && room.bottom === was.bottom) return null
  hintSide = side
  hintBelow = room.bottom
  setRoom(win, room)
  roomInEnv()
  return new Promise((resolve) => {
    const done = (): void => (clearTimeout(late), ipcMain.removeListener('window:room-drawn', heard), resolve())
    const heard = (event: Electron.IpcMainEvent): void => void (event.sender === win.webContents && done())
    // A page that never answers (it crashed) still shows.
    const late = setTimeout(done, 250)
    ipcMain.on('window:room-drawn', heard)
    win.webContents.send('window:room-hint', { ...room, side })
  })
}
/** Where the last open put a hint's room. */
let hintSide: HintSide | undefined
/** The room under the card as the last open left it: more than BOX_ROOM's when a hint sits there. A menu that hangs
 * into it adds only what it needs beyond that, and closing gives it back to the hint (window:room-below). */
let hintBelow = BOX_ROOM.bottom
/** The room a hint below the card needs under it, whichever card it is (set as the box opens, roomForHint). */
let hintFoot = BOX_ROOM.bottom
/** The room round the card its hint and its round controls need, as the box last opened (roomForHint). */
let hintNeeds: Room = BOX_ROOM
/** The box's left edge at a new width as its panel opens or shuts: about its middle with Settings' "centred", else where it is. */
const panelX = (card: Electron.Rectangle, width: number): number => (boxPlacement().centred ? Math.round(card.x - (width - card.width) / 2) : card.x)
/**
 * The room round a card with the panel shut (the one-line pill, the box alone) also holds the box with its panel where
 * ⌘\ would put it, at the expander's height (⌃⇧F), so the box grows in the window it already has (keptRoom, within):
 * a window seen while it changes size shows its old picture at its new size for a frame or two, the card cut flat and
 * bare frost beside it (the user, 15 Nov).
 */
function roomForPanel(win: BrowserWindow, place: Electron.Rectangle, room: Room): Room {
  if (panelShown() || isWelcoming() || win !== prompt) return room
  const box = onScreen({ x: panelX(place, WITH_PANEL), y: anchor?.became === place.y ? anchor.y : place.y, width: WITH_PANEL, height: SIZES.expanded.height })
  return {
    left: Math.max(room.left, place.x - box.x + BOX_ROOM.left),
    // Above a box the screen's foot pushes up (the expander's, on a laptop), a hint above keeps its room too.
    top: room.top + Math.max(0, place.y - box.y),
    right: Math.max(room.right, box.x + box.width - place.x - place.width + BOX_ROOM.right),
    bottom: Math.max(room.bottom, box.y + box.height - place.y - place.height + hintFoot)
  }
}
/**
 * The box's card put at `next` inside the window as it is: the room round the card takes the rest, so nothing on
 * screen moves (the page draws the change, lib/box-morph.ts). The window grows only where it lacks the card and its
 * room (the box carried near a screen's edge since it opened). Gives back the room and the window's size, which the
 * page lays itself out from.
 */
function within(win: BrowserWindow, to?: Electron.Rectangle): Room & { width: number; height: number } {
  arriving?.()
  settle()
  // Where it is, read once any glide under way has landed.
  const next = to ?? win.getBounds()
  // The window's own frame, not its card's (overhang).
  const frame = BrowserWindow.prototype.getBounds.call(win)
  const left = Math.min(frame.x, next.x - BOX_ROOM.left)
  const top = Math.min(frame.y, next.y - BOX_ROOM.top)
  const right = Math.max(frame.x + frame.width, next.x + next.width + BOX_ROOM.right)
  const bottom = Math.max(frame.y + frame.height, next.y + next.height + hintFoot)
  const room = { left: next.x - left, top: next.y - top, right: right - next.x - next.width, bottom: bottom - next.y - next.height }
  rooms.set(win, room)
  relimit.get(win)?.()
  if (!sameBox(frame, { x: left, y: top, width: right - left, height: bottom - top })) win.setBounds(next)
  roomInEnv()
  // The size the window has now, not the one asked for: the page waits to be laid out at it (lib/box-morph.ts), and a
  // size held back (by the window's least or most size) never came, so it waited for ever.
  const now = BrowserWindow.prototype.getBounds.call(win)
  return { ...room, width: now.width, height: now.height }
}
/**
 * The box's card at a new size inside the frame its window already has (roomForPanel keeps the box with its panel at
 * the expander's height there): the room round the card takes the change and the frame stays exactly as it is, so the
 * page alone draws the card at its new height in one frame (a line written, ⌃⇧F: keys, so at once), never main
 * gliding the frame while the page lays itself out after it. The room is then the one the next open makes, so the box
 * opens at once in the frame it had (a two-line draft after a relaunch grew the frame by 224px and the next open shrank
 * it again, qa/pill-polish.mjs). False where the card and its hint's room do not fit (a box opened with its panel
 * already out, or pushed up by the screen's foot): main glides the frame as before.
 */
function keptRoom(win: BrowserWindow, next: Electron.Rectangle): boolean {
  // A glide under way goes on from where it is.
  if (win !== prompt || !rooms.has(win) || isWelcoming() || win.isFullScreen() || pending?.win === win) return false
  const frame = BrowserWindow.prototype.getBounds.call(win)
  const room = { left: next.x - frame.x, top: next.y - frame.y, right: frame.x + frame.width - next.x - next.width, bottom: frame.y + frame.height - next.y - next.height }
  if (room.left < hintNeeds.left || room.top < hintNeeds.top || room.right < hintNeeds.right || room.bottom < hintFoot) return false
  rooms.set(win, room)
  relimit.get(win)?.()
  roomInEnv()
  hintBelow = room.bottom
  win.webContents.send('window:room-hint', { ...room, side: hintSide ?? null })
  return true
}
/** More (or less) room round a window's card, the card staying exactly where it is. */
function setRoom(win: BrowserWindow, room: Room): void {
  const was = rooms.get(win)
  if (!was || (was.left === room.left && was.top === room.top && was.right === room.right && was.bottom === room.bottom)) return
  const card = win.getBounds()
  rooms.set(win, { ...room })
  relimit.get(win)?.()
  win.setBounds(card)
  roomInEnv()
}

function load(win: BrowserWindow, query = ''): void {
  // The sandbox says so in every window's address, the one thing a page knows before it runs.
  if (SANDBOX) query = `${query || '?'}${query ? '&' : ''}sandbox=1`
  // Just restarted into (or out of) the sandbox: the main window finishes the moment the last run began.
  if (process.argv.includes('--show-home') && query.includes('view=home')) query += `&arrived=1&bars=${barsHere()}`
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
    // An Anki deck dropped anywhere outside a note is imported.
    if (url.startsWith('file:') && /\.(apkg|colpkg)$/i.test(url)) void importFiles([fileURLToPath(url)])
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
      // A small window (small-window.ts) is the box's page: it carries its note to the main window the same way.
      if ((page === prompt?.webContents && prompt.isVisible()) || isSmall(win)) return page.send('box:promote-asked')
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
/** Notes in small windows of their own (small-window.ts), once the book is open. */
let smallWindows: ReturnType<typeof registerSmallWindows> | null = null
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
// A note chosen in Spotlight (spotlight.ts): opened in the main window. Its id is "type:id".
app.on('continue-activity', (event, type, info) => {
  if (type !== SPOTLIGHT_ITEM) return
  const id = String((info as Record<string, unknown>)?.kCSSearchableItemActivityIdentifier ?? '')
  const at = id.indexOf(':')
  if (at < 0) return
  event.preventDefault()
  sendHome(id.slice(0, at), id.slice(at + 1), undefined, 'other')
})

function sendHome(type: string, id: string, heading?: string, via?: Via): void {
  openHome()
  // A heading link's heading goes along, so the note opens there.
  const sent: [string, string, string?] = heading ? [String(type), String(id), String(heading)] : [String(type), String(id)]
  // How it was found again, for the usage counts (usage.ts): told just before, so the page it opens is counted with it.
  if (homeAsked && home) (via && home.webContents.send('usage:via', via), home.webContents.send('home:open', ...sent))
  else (sentTo = sent, (sentVia = via ?? null))
}

/**
 * ⌃⌥⌘S from anywhere: ⌘K comes up on “Start focus”'s lengths to pick (25 min,
 * 45 min, 1 h, or one typed) where quick capture's own ⌘K opens it, in the
 * main window; quick capture, up or away, is put away as for that ⌘K.
 */
function askFocus(): void {
  // The focus timer turned off: the key does nothing.
  if (!focusToolsOn()) return
  sendHome('search', 'focus')
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
  // The box draws its side panel only when the welcome is not running: told as it changes.
  if (prompt && !prompt.isDestroyed()) prompt.webContents.send('box:welcoming', on)
  // The welcome over, finished or skipped: its window, put in the middle of the screen for it, grows to the app's own size.
  if (!on) void growAfterWelcome()
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
/**
 * The bubble steps aside (step-aside.ts): when the pointer comes to rest beside it without being on it, it glides,
 * whole, to the nearest of its three places (the left, middle and right of the top of its screen) that is clear of
 * the pointer, and stays there: it never creeps back.
 * Only where it sits free: under the notch it is in the menu bar, over nothing of yours. A test run's pointer is
 * the Mac's real one, so the rule runs there only when asked for (HALIGTREE_QA_STEPASIDE, as quick capture's does).
 */
const stepsAside = (): boolean => pillYields() && !(process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_STEPASIDE)
/**
 * Taller than this, its window is not at rest: the bubble has opened into the island, or is asking how a session
 * went. At rest the window is as tall as the bubble, the room over it and its shadow's (64 to about 76).
 */
const PILL_OPEN = 110
/** Where it was before it stepped aside: its place, where it is again at the next session or when sent back. */
let pillHome: Point | null = null
/** Put somewhere by hand in this session: it stays there until the session is over, wherever the pointer rests. */
let pillByHand = false
let pillGliding: (() => void) | null = null
/** Where it sat before it rose to open whole above the screen's bottom edge (`focus:size`): it goes back there as it shuts. */
let pillRaisedFrom: number | null = null
const pillGlide = (to: Point): void => {
  if (!focusPill || focusPill.isDestroyed()) return
  pillGliding?.()
  pillGliding = glideTo(focusPill, to, () => void (pillGliding = null))
}
function pillStepsAside(at: Point): void {
  const pill = focusPill
  if (!pill || pill.isDestroyed() || !pill.isVisible() || pillByHand || focusTucked || pillGliding) return
  const box = pill.getBounds()
  // Opened into the island, written in, or the pointer on anything it draws (a button held too): you are using it.
  if (box.height > PILL_OPEN || pill.isFocused() || !through.get(pill) || !beside(at, box)) return
  const to = clearPlace(box, at, topPlaces(box, screen.getDisplayMatching(box).workArea))
  if (!to) return
  pillHome ??= { x: box.x, y: box.y }
  pillGlide(to)
}
/** Back to its place: at once as a new session brings it up, or gliding when sent back from its menu. */
function pillGoesHome(glide: boolean): void {
  const to = pillHome
  pillHome = null
  if (!to || !focusPill || focusPill.isDestroyed() || focusTucked) return
  if (glide) return pillGlide(to)
  pillGliding?.()
  pillGliding = null
  focusPill.setPosition(to.x, to.y)
}
function showFocus(on: boolean): void {
  // A new session (the bubble was down): it starts in its place again, and whatever was put by hand last time is that place.
  if (on && !focusWanted) (pillByHand = false, pillGoesHome(false))
  focusWanted = on
  // A session begun or over: the goal cards tuck or come back as their rules say, once it is saved.
  setTimeout(applyRules, 300)
  // With the time in the note only, the pill is still made and kept hidden:
  // it is what rings and glows when the time is up.
  if (!on || !focusBubbleShown()) focusPill?.hide()
  // Put away, its window goes back to the pill's own size for next time.
  if (!on && focusPill && !focusPill.isDestroyed()) (focusPill.setBounds({ ...focusPill.getBounds(), y: pillRaisedFrom ?? focusPill.getBounds().y, height: PILL_REST }), (pillRaisedFrom = null))
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
  // Its place said again once made, as a sticky's is: a QA run's parked window keeps it as its own (HALIGTREE_QA_VIRTUAL),
  // and the place such a window is first given is the middle of the screen, not the one asked for.
  if (process.env.HALIGTREE_QA_VIRTUAL) focusPill.setBounds({ x: Math.round(workArea.x + workArea.width / 2 - 170), y: workArea.y + 6, width: 340, height: PILL_REST })
  // The window is wider and taller than the pill: the room round it lets clicks through to the app behind.
  passThrough(focusPill, true)
  focusTucked = false
  placeFocus()
  focusPill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  focusPill.once('ready-to-show', () => pillUp() && focusPill?.showInactive())
  guard(focusPill)
  carriedByHand(focusPill)
  // A drag always wins: it stops a step aside part way, and where the bubble is put down is its place for this session.
  const pill = focusPill
  const hand = handDrags.get(pill)!
  let liftedAt: Electron.Rectangle | null = null
  handDrags.set(pill, {
    grab: (at) => {
      pillGliding?.()
      pillGliding = null
      liftedAt ??= pill.isDestroyed() ? null : pill.getBounds()
      hand.grab(at)
    },
    carry: hand.carry,
    letGo: () => {
      hand.letGo()
      const now = pill.isDestroyed() ? null : pill.getBounds()
      if (liftedAt && now && (now.x !== liftedAt.x || now.y !== liftedAt.y)) (pillByHand = true, pillHome = null)
      liftedAt = null
    }
  })
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
/** The window whose answer ⌘Z in the main window would take back (float:undoable). */
let floatUndoFrom: Electron.WebContents | null = null
/**
 * The corner the corner's cards are in. The top right to start, as ever; the next corner round while Haligtree's own
 * window is in front with its top there (its tabs, “New” and the sound button are never under a card), or while the
 * pointer is at rest there. The window keeps its corner as it grows: down from a top corner, up from a bottom one.
 */
let cardCorner: Corner = 'top-right'
let cardGliding: (() => void) | null = null
/**
 * A practice's offer up in the corner now: asked inside the main window instead the moment that comes to the front.
 * The main window is told which, so its “Now” card waits while the corner has it: one surface, never both.
 */
let cornerOffer: Offer | null = null
const cornerHolds = (offer: Offer | null): void => {
  cornerOffer = offer
  if (home && !home.isDestroyed()) home.webContents.send('practice:corner', offer?.id ?? null)
}
/** How tall the top of the main window is, at its own size: the row with “New” and the sound button, and the tabs under it (they end 85 points down). */
const HOME_BAR = 88
const homeInFront = (): boolean => !!home && !home.isDestroyed() && home.isVisible() && !home.isMinimized() && home.isFocused()
const homeBar = (): Electron.Rectangle | null => {
  if (!home || !homeInFront()) return null
  const { x, y, width } = home.getBounds()
  return { x, y, width, height: Math.round(HOME_BAR * home.webContents.getZoomFactor()) }
}
const cardAt = (corner: Corner, height: number, area: Electron.Rectangle): Electron.Rectangle =>
  ({ ...cornerPlace(corner, { width: NUDGE_WIDTH, height }, area), width: NUDGE_WIDTH, height })
/** The corners a card of this height may be in now: every one that is off Haligtree's own bar. */
const freeCorners = (height: number, area: Electron.Rectangle): { corner: Corner; x: number; y: number }[] => {
  const bar = homeBar()
  return CORNERS.map((corner) => ({ corner, ...cardAt(corner, height, area) })).filter((box) => !(bar && overlaps({ ...box, width: NUDGE_WIDTH, height }, bar)))
}
function cardStepsAside(at: Point): void {
  const win = nudgeWins.get('corner')?.win
  // The pointer on a card (anything it draws) is you reaching for it: it stays.
  if (!win || win.isDestroyed() || !win.isVisible() || cardGliding || !through.get(win)) return
  const box = win.getBounds()
  if (!beside(at, box)) return
  const to = clearPlace(box, at, freeCorners(box.height, screen.getDisplayMatching(box).workArea))
  if (!to) return
  cardCorner = to.corner
  cardGliding = glideTo(win, to, () => void (cardGliding = null))
}
/**
 * Haligtree's main window has come to the front. What the corner was offering is asked inside the window instead
 * (one surface, never both), and a card still up (a task due) moves off the window's own bar.
 */
function homeCameForward(): void {
  const win = nudgeWins.get('corner')?.win
  // Really in front: a window is told 'focus' at other moments too (as it loads again), with another app still in front.
  if (!homeInFront() || !win || win.isDestroyed() || !win.isVisible()) return
  if (cornerOffer) {
    win.webContents.send('nudge:drop', cornerOffer.id)
    cornerHolds(null)
    home?.webContents.send('practice:offered')
  }
  const box = win.getBounds()
  const free = freeCorners(box.height, screen.getDisplayMatching(box).workArea)
  if (!free.length || free.some((one) => one.corner === cardCorner)) return
  cardCorner = free[0].corner
  cardGliding?.()
  cardGliding = glideTo(win, free[0], () => void (cardGliding = null))
}
/**
 * A practice offered (practices.ts): Haligtree volunteers it, so it waits through a meeting and quiet hours. With the
 * main window in front it is asked inside the window (Home's “Now” card, or the window's own notice from any other
 * page), never as a card over the window's tabs and buttons. The sandbox's offers are the example person's and never
 * leave its window: nothing of the sandbox is raised over your desktop. Otherwise, the corner card.
 */
function offerPractice(offer: Offer): void {
  if (home && !home.isDestroyed() && home.isVisible() && (SANDBOX || homeInFront())) return void home.webContents.send('practice:offered')
  if (SANDBOX) return
  if (showNudge({ kind: 'practice', id: offer.id, offer })) cornerHolds(offer)
}
/** A practice started, answered or past its time, anywhere: its card in the corner goes, with nothing more said. */
function offerOver(id: string): void {
  if (cornerOffer?.id === id) cornerHolds(null)
  const win = nudgeWins.get('corner')?.win
  if (win && !win.isDestroyed()) win.webContents.send('nudge:drop', id)
}
function showNudge(nudge: Nudge): boolean {
  if (screenLocked) return false
  // The sandbox keeps what it volunteers to its own window: its review reminder is said by that window's notice, never
  // by a card over your desktop (a practice's offer goes the same way, offerPractice). With its window closed, nothing.
  if (SANDBOX && nudge.kind === 'review') {
    if (home && !home.isDestroyed() && home.isVisible()) home.webContents.send('review:offered', nudge.text, nudge.again)
    return true
  }
  const spot: NudgeSpot = nudge.kind === 'blocked' ? 'pill' : 'corner'
  let held = nudgeWins.get(spot)
  if (!held || held.win.isDestroyed()) {
    const win = new BrowserWindow({
      // Named and unclosable like the focus pill, so AeroSpace never files it under one workspace (it is only hidden).
      title: APP_NAME, closable: false,
      type: 'panel', width: NUDGE_WIDTH, height: 150, frame: false, transparent: true, backgroundColor: '#00000000', roundedCorners: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false,
      // Left to idle while hidden: it hides only once its last card has slid away.
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
    })
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    // The room round and between its cards lets clicks through to the app behind.
    passThrough(win, true)
    load(win, spot === 'pill' ? '?view=nudge&at=pill' : '?view=nudge')
    held = { win, waiting: [] }
    nudgeWins.set(spot, held)
  }
  const { win } = held
  // Which kinds of card it holds, until it is empty again: only what Haligtree offered on its own goes with the desk.
  nudgeKinds.set(win, (nudgeKinds.get(win) ?? new Set<string>()).add(nudge.kind))
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  // A site blocked is said just under the pill, where the eye already goes for the session (top middle with no pill up).
  const pill = spot === 'pill' && focusPill && !focusPill.isDestroyed() && focusPill.isVisible() ? focusPill.getBounds() : null
  const under = pill ? { x: Math.round(pill.x + pill.width / 2 - NUDGE_WIDTH / 2), y: pill.y + PILL_REST - 6 } : { x: Math.round(workArea.x + workArea.width / 2 - NUDGE_WIDTH / 2), y: workArea.y + 8 }
  if (spot === 'corner') {
    // Coming up: the first corner that is off Haligtree's own bar and clear of a pointer at rest. Up already: it keeps its corner.
    const tall = win.getBounds().height
    if (!win.isVisible()) {
      const resting = stepsAside() && rested >= REST_MS ? screen.getCursorScreenPoint() : null
      const free = freeCorners(tall, workArea)
      cardCorner = (free.find((one) => !(resting && beside(resting, { ...one, width: NUDGE_WIDTH, height: tall }))) ?? free[0])?.corner ?? 'top-right'
    }
    cardGliding?.()
    cardGliding = null
    win.setBounds(cardAt(cardCorner, tall, workArea))
  } else win.setBounds({ ...under, width: NUDGE_WIDTH, height: win.getBounds().height })
  if (win.webContents.isLoading()) held.waiting.push(nudge)
  else win.webContents.send('nudge', nudge)
  win.showInactive()
  return true
}
/**
 * A meeting being recorded (meeting.ts): its live card in a small window of its own, over every app and every Space,
 * at the bottom middle of the screen you are on, where a call's own controls are not; moved anywhere by its body,
 * tucked to a pill. Seen in a screen share or not as Settings says for Haligtree's windows, like every other one.
 */
let meetingWin: BrowserWindow | null = null
const MEETING_ROOM = 16
let meetingSize = { width: 420, height: 228 }
let meetingShape = ''
function meetingWindow(): BrowserWindow {
  if (meetingWin && !meetingWin.isDestroyed()) return meetingWin
  const win = new BrowserWindow({
    // Named for AeroSpace's floating rule and with no close button, like the focus pill and the stickies: a window
    // with any window button left is filed under one workspace and hidden on the others, so the card stayed behind
    // when you moved to the call's workspace (6 Nov). Its own Stop takes it down (closable again first).
    title: APP_NAME, closable: false,
    type: 'panel', width: meetingSize.width, height: meetingSize.height, frame: false, transparent: true, backgroundColor: '#00000000', roundedCorners: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  passThrough(win, true)
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  win.setBounds({ x: Math.round(workArea.x + (workArea.width - meetingSize.width) / 2), y: workArea.y + workArea.height - meetingSize.height - 24 + MEETING_ROOM, ...meetingSize })
  carriedByHand(win)
  load(win, '?view=meeting')
  win.on('closed', () => (meetingWin = null))
  meetingWin = win
  return win
}
const sendMeeting = (live: Live, level?: { you: number; others: number }): void => {
  const win = meetingWin
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('meeting:live', live, level ?? null)
  // The menu bar's lines follow what the meeting is doing, not its every word.
  const shape = `${live.state}`
  if (shape !== meetingShape) (meetingShape = shape, updateTray())
  // Haligtree's own recorder running is a meeting: the desk steps away for it (in-meeting.ts).
  setSignal('recording', meetingNow())
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
// Switching book or into the sandbox: everything of the book being left that floats on the desktop
// (its stickies and their tabs, the focus pill, nudge cards, a note's own window) goes at once, while
// its main window stays up until the new run's is on screen; the new run's are dealt in after it
// (afterHome). gate() is a blackout from here on, so none of them comes back while this run lingers.
onHandOff(() => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed() && win !== home) win.hide() })
/**
 * Where Haligtree itself last put a sticky (a lift, a glide). A window found there
 * was moved by Haligtree, not by you: not kept as its place, nor nudged on screen.
 */
const placed = new WeakMap<BrowserWindow, { x: number; y: number }>()
/** A point on the screen, in the Mac's points: where the pointer is, as a page says (its event's screenX and screenY). */
type Point = { x: number; y: number }
/**
 * A window carried by Haligtree's own hand: picked up where the pointer pressed, carried to each place the page says
 * the pointer has moved to on the screen, and put down. Screen points, never the page's own: the window moves under
 * the pointer, so a point inside the page would shift with it and feed back into the next move.
 */
type Carry = { grab: (at: Point) => void; carry: (at: Point) => void; letGo: () => void }
/** The windows carried by hand (lib/carry.ts): stickies, the focus pill, the meeting card; quick capture's is in the window:grab handler. */
const handDrags = new WeakMap<BrowserWindow, Carry>()
/** A point a page sent, if it is one. */
const pointFrom = (x: unknown, y: unknown): Point | null =>
  typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : null
/**
 * A plain floating window (the focus pill, the meeting card) carried by Haligtree on a press of its body or its
 * grabber (lib/carry.ts), as stickies are: it follows the pointer from where it was picked up until let go. Moved
 * by the Mac before (a drag region), the pointer over it was never seen, so its grabber could not show.
 */
function carriedByHand(win: BrowserWindow): void {
  let hold: { from: Electron.Rectangle; start: Point } | null = null
  handDrags.set(win, {
    grab: (at) => void (win.isDestroyed() || hold || (hold = { from: win.getBounds(), start: at })),
    carry: (now) => {
      if (!hold || win.isDestroyed()) return
      const x = hold.from.x + now.x - hold.start.x
      const y = hold.from.y + now.y - hold.start.y
      const at = win.getBounds()
      if (at.x !== x || at.y !== y) win.setPosition(x, y)
    },
    letGo: () => void (hold = null)
  })
}
const ours = (win: BrowserWindow): boolean => {
  const at = placed.get(win)
  const now = win.getBounds()
  return !!at && at.x === now.x && at.y === now.y
}
const stickyFile = (): string => join(app.getPath('userData'), 'stickies.json')
// Hidden: put away on its own ("Hide this one") until the stickies are next shown.
// Tint: its paper's colour from its right-click menu (STICKY_TINTS); plain when none.
// Bounds: the card's own frame, not its window's, so a card made again as glass (no room round it) or paper (room round it) stays put.
// Asked: a goal's own card stuck by a page's ask (window.api.stick), not put up by the goal's “Goal on screen”: yours,
// so it stays until you take it down, as any sticky does, whatever the goal's setting says (beacons).
// Pill: folded to its one-line pill in the desk's stack (its “–”, ⌃⌥⌘H, or made as one); none, or false, is open, pinned
// where it stands. Touched: when it was last folded, pinned or stuck, which orders the notes in the stack.
type Stuck = { type: string; id: string; bounds?: Electron.Rectangle; hidden?: boolean; tint?: string; asked?: boolean; pill?: boolean; touched?: number }
let stuck: Stuck[] = []
const keepStuck = (): void => void writeWhole(stickyFile(), JSON.stringify(stuck)).catch(() => undefined)
const stuckAs = (key: string): Stuck | undefined => stuck.find((one) => `${one.type}:${one.id}` === key)
/** The paper colours a sticky can have, in the order Tidy keeps them: plain first. */
const STICKY_TINTS = [['plain', 'Plain'], ['butter', 'Butter'], ['rose', 'Rose'], ['sage', 'Sage'], ['sky', 'Sky']] as const
/** Each paper colour as a swatch in a sticky's menu, so the names are never guessed at (the paper follows the theme; these are its light-theme look). */
const TINT_DOTS: Record<string, [number, number, number]> = { plain: [240, 233, 219], butter: [255, 214, 102], rose: [229, 143, 180], sage: [143, 191, 143], sky: [143, 182, 224] }
/** The sticky a window's address says it is ("today:today"), whether or not it is listed. */
function keyInAddress(win: BrowserWindow): string | null {
  const url = win.webContents.getURL()
  if (!/[?&]view=sticky/.test(url)) return null
  const query = new URLSearchParams(url.slice(url.indexOf('?')))
  return `${query.get('type')}:${query.get('id')}`
}
/** The sticky a window is, by its key ("capture:…", "today:today"). */
const keyOfSticky = (win: BrowserWindow | null): string | undefined => (win ? [...stickies].find(([, one]) => one === win)?.[0] : undefined)
type Box = Electron.Rectangle
/**
 * One drag's guides (snap-lines.ts, guides.ts), the same for every window carried with them: a sticky or a goal's card
 * carried by the hand or by the Mac, and quick capture's box. The places it lines up along (`places`, for the screen
 * the card is on: the box's home, or a sticky's neighbours) and every line it can settle on are taken at its first
 * step and kept until it is let go, so from the first move to the last no line moves, comes, goes or changes (a card
 * gliding in the meantime included); coming onto one, the trackpad taps. Carried onto another screen, they are taken
 * again for that screen.
 */
function dragGuides(places: (card: Box) => Box[], reach: Reach = { snap: SNAP, leave: LEAVE }): { from: (card: Box) => void; to: (card: Box) => Lined; rest: (card: Box, area: Box) => Lined } {
  let fixed: { display: number; area: Box; cards: Box[]; lines: Line[] } | null = null
  let held: Held = {}
  // A screen attached since: its sheet made now.
  readyGuides()
  const on = (card: Box): NonNullable<typeof fixed> => {
    const display = screen.getDisplayMatching(card)
    if (fixed?.display !== display.id) {
      const near = places(card).filter((one) => screen.getDisplayMatching(one).id === display.id)
      fixed = { display: display.id, area: display.workArea, cards: near, lines: guideLines(card, near, display.workArea, reach) }
    }
    return fixed
  }
  return {
    // Picked up already on a line: held there, with no tap.
    from: (card) => {
      const here = on(card)
      held = lineUp(card, here.cards, here.area, {}, reach).held
    },
    // Carried: where it goes (drawn onto a line within reach, if the hand carries it), a tap coming onto a line, and
    // every line drawn, on the same step.
    to: (card) => {
      const here = on(card)
      const lined = lineUp(card, here.cards, here.area, held, reach)
      if (cameOnto(held, lined.held)) tap('level')
      held = lined.held
      showGuides(card, here.lines, lined.lines)
      return lined
    },
    // Let go (moved into view first): where it settles, on the line it was held to.
    rest: (card, area) => lineUp(card, fixed?.cards ?? places(card), area, held, reach)
  }
}
/** How far in from its window the card is drawn: glass fills it; paper keeps room round it for its lean and shadow (sticky-note.tsx, goal-beacon.tsx). */
const insetOf = (key: string): Inset => builtGlass.get(key) ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: 20, top: 20, right: 20, bottom: 20 }
/** The cards on the screen now that a dragged sticky or quick capture lines up with: every sticky up, and the box when it is out; never `but`. */
function stickyCards(but?: BrowserWindow): ReturnType<typeof cardOf>[] {
  // A pill in the stack, or a card opened out of one, is no card to line up with.
  const cards = [...stickies].filter(([key, one]) => one !== but && !one.isDestroyed() && one.isVisible() && stickyUp(key) && !peeking.has(key) && !fromPill.has(key)).map(([key, one]) => cardOf(one.getBounds(), insetOf(key)))
  if (prompt && prompt !== but && !prompt.isDestroyed() && prompt.isVisible()) cards.push(prompt.getBounds())
  return cards
}

/**
 * Windows drawn larger than their card (paper stickies): clicks on the clear
 * room round the card go to the app behind, never an invisible wall. The
 * pointer's moves still reach the page there (forward), which says when it
 * crosses onto anything drawn (lib/clear-room.ts). Whether clicks pass through
 * now, by window, for the probes (haligtreeThrough). A QA run's windows stay
 * unclickable throughout (HALIGTREE_QA_AWAY): only the record changes there.
 */
const through = new WeakMap<BrowserWindow, boolean>()
/**
 * A file dragged in from another app (a screenshot's thumbnail, Finder) sends no pointer moves while clicks pass
 * through, so the page never heard it cross onto the card and the drop fell to the app behind (the user, 5 Nov:
 * a screenshot dropped on quick capture opened in the browser under it). So while a window lets clicks through,
 * main asks it every 100 ms whether the pointer, where it now is, sits over something drawn (lib/clear-room.ts).
 */
const watched = new Set<BrowserWindow>()
let lastPoint = ''
/** How long the pointer has lain exactly where it is, counted on the same readings. */
let rested = 0
setInterval(() => {
  if (!watched.size) return
  const at = screen.getCursorScreenPoint()
  const key = `${at.x},${at.y}`
  if (key === lastPoint) {
    // Come to rest: what floats beside it steps aside, once for each rest (step-aside.ts). A pass across never gets here.
    if ((rested += 100) === REST_MS && stepsAside()) (pillStepsAside(at), cardStepsAside(at))
    return
  }
  lastPoint = key
  rested = 0
  for (const win of watched) {
    if (win.isDestroyed()) { watched.delete(win); continue }
    if (!through.get(win) || !win.isVisible()) continue
    const box = win.getContentBounds()
    if (at.x >= box.x && at.x < box.x + box.width && at.y >= box.y && at.y < box.y + box.height) win.webContents.send('window:probe', at.x - box.x, at.y - box.y)
  }
}, 100).unref?.()
const passThrough = (win: BrowserWindow, on: boolean): void => {
  through.set(win, on)
  watched.add(win)
  win.setIgnoreMouseEvents(on || !!process.env.HALIGTREE_QA_AWAY, { forward: true })
}
ipcMain.on('window:solid', (event, solid: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed() && through.has(win)) passThrough(win, !solid)
})
;(globalThis as { haligtreeThrough?: (id: number) => boolean | null }).haligtreeThrough = (id) => {
  const win = BrowserWindow.fromId(id)
  return win && through.has(win) ? !!through.get(win) : null
}

/** A sticky's card, on the screen: what is kept as its place. */
const cardFrame = (key: string, win: BrowserWindow): Electron.Rectangle => cardOf(win.getBounds(), insetOf(key))
/** The window that draws a card at this frame, with the room round it its material keeps. */
const windowAround = (card: Electron.Rectangle, inset: Inset): Electron.Rectangle =>
  ({ x: card.x - inset.left, y: card.y - inset.top, width: card.width + inset.left + inset.right, height: card.height + inset.top + inset.bottom })

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
/**
 * How long a window waits to have drawn itself before it is shown anyway.
 * Short in a built run; long in a development run, whose pages are compiled
 * as they first load, and in a run just started into (or out of) the sandbox,
 * whose last run keeps its own window up, showing the moment, until this one
 * is on screen: shown early, the main window was a blank dark frame and the
 * stickies empty grey cards.
 */
const PATIENCE = is.dev || process.env.HALIGTREE_ARRIVAL ? 9000 : 3000
/** Stickies whose page has drawn what it holds: only these are ever shown. */
const stickyReady = new WeakSet<BrowserWindow>()
/**
 * For the probes only (HALIGTREE_QA_TRACE, a folder): what a window showed in
 * its first frame on screen, and when, from any run, a relaunched one too.
 */
function qaTrace(name: string, win: BrowserWindow, more: Record<string, unknown> = {}): void {
  const dir = process.env.HALIGTREE_QA_TRACE
  if (!dir || win.isDestroyed()) return
  const at = Date.now()
  const stem = join(dir, `${process.pid}-${at}-${name}`)
  void appendFile(join(dir, 'trace.jsonl'), JSON.stringify({ pid: process.pid, at, name, sandbox: SANDBOX, ...more }) + '\n').catch(() => undefined)
  void win.webContents.capturePage().then((image) => writeFile(`${stem}.png`, image.toPNG())).catch(() => undefined)
}
/** A dragged row came over a new place in a list: one light tap (renderer's slotTicker throttles it). */
// Swipe back reads the fingers' way: with natural scrolling the wheel's deltas run against them.
ipcMain.handle('scroll:natural', () => process.platform === 'darwin' && naturalScrolling())
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
  setTimeout(once, PATIENCE + 2000)
}
/** When each sticky came on screen, beside the main window's own times, for a probe (qa/stickies-after-home.mjs). */
const stickyTimes: number[] = []
;(globalThis as { haligtreeStickyTimes?: number[] }).haligtreeStickyTimes = stickyTimes
function arriveSticky(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isVisible()) return
  stickyTimes.push(Math.round(performance.now()))
  // Its guides ready before it can be carried (guides.ts).
  readyGuides()
  const quiet = quietly.delete(keyOfSticky(win) ?? '')
  if (stillness()) return win.showInactive()
  const drop = quiet ? 0 : 8
  const go = (): void => {
    // Put away while it waited its turn (Show sticky notes unticked as they came): it stays away.
    const key = keyOfSticky(win)
    if (win.isDestroyed() || win.isVisible() || (key && (!stickyUp(key) || stackHidden.has(key)))) return
    const rest = win.getBounds()
    win.setOpacity(0)
    placed.set(win, { x: rest.x, y: rest.y - drop })
    win.setPosition(rest.x, rest.y - drop)
    win.showInactive()
    qaTrace(`sticky-${(key ?? '').replace(/[^a-z0-9]+/gi, '-')}`, win, { ready: stickyReady.has(win), key, bounds: rest, peek: peeking.has(key ?? '') })
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
// Beacon: its goal's “Goal on screen” as it was, when taking the card down turned it off (see takeDownSticky).
let takenDown: (Stuck & { title: string; until: number; beacon?: { was: OpenGoal['beacon'] } }) | null = null
const TAKEN_FOR = 30_000
const canPutBack = (): boolean => !!takenDown && takenDown.until > Date.now() && !stickies.has(`${takenDown.type}:${takenDown.id}`)
/** A sticky taken down by its own hand: peeled off, said where it is seen, and kept a while for "Put it back". */
function takeDownSticky(win: BrowserWindow | null, title: string): void {
  const key = keyOfSticky(win)
  if (!win || !key) return
  const [type, ...rest] = key.split(':')
  const id = rest.join(':')
  // Taken down as a pill (or a card open out of one), it is kept as that pill, with its card's own place.
  const ownPlace = peeking.get(key) ?? openedAt.get(key)
  takenDown = { type, id, bounds: ownPlace ? cardOf(ownPlace, insetOf(key)) : cardFrame(key, win), tint: stuckAs(key)?.tint, asked: stuckAs(key)?.asked, pill: stuckAs(key)?.pill, title, until: Date.now() + TAKEN_FOR }
  // A goal's card that its goal's “Goal on screen” put up stays down once taken down: the goal's setting goes to off,
  // so its page says what is true (“The menu bar and Home still show it”). Left as it was, the next look at the
  // goals put the card straight back (beacons: as a goal changes, and every half minute), seen as “Take it down”
  // doing nothing. One only stuck by hand, on a goal that asks for no card of its own, is just unstuck.
  const goal = type === 'goal' && ownCards.has(key) ? openGoals().find((one) => one.id === id) : undefined
  if (goal) takenDown.beacon = { was: goal.beacon }
  stick(type, id, false)
  if (goal) setGoalBeacon(id, 'off')
  const seen = (one: BrowserWindow | null | undefined): one is BrowserWindow => !!one && !one.isDestroyed() && one.isVisible()
  const voice = [home, prompt].find(seen)
  voice?.webContents.send('sticky:taken', title)
  updateTray()
  setTimeout(updateTray, TAKEN_FOR + 50)
}
/** Back where it was, with its colour, coming in as any sticky does. */
function putStickyBack(): void {
  if (!canPutBack() || !takenDown) return
  const { type, id, bounds, tint, asked, beacon, pill } = takenDown
  takenDown = null
  byHand(`${type}:${id}`)
  stuck.push({ type, id, bounds, tint, ...(asked ? { asked } : {}), ...(pill ? { pill } : {}) })
  stick(type, id, true, bounds)
  // Its goal's “Goal on screen” as it was, after the card is up again where it was (the look that follows finds it there).
  if (beacon) setGoalBeacon(id, beacon.was)
  updateTray()
}
/**
 * Stuck or brought back by hand while the desk is away (a meeting, or quiet hours set to take it): asked for, so it shows. Forgotten
 * when the desk comes back.
 */
const askedFor = new Set<string>()
/** The desk is away: a meeting, or quiet hours where Settings says so, and “Show anyway” not asked for (meeting-away.ts). */
const deskIsAway = (): boolean => deskAway(gate().away, shownAnyway())
/** Done by hand (stuck, put back, brought back): while the desk is away, that one shows all the same. */
const byHand = (key: string): void => void (deskIsAway() && askedFor.add(key))
/**
 * Whether a sticky is on the desktop now: not in safe mode, nor away for a meeting or for quiet hours set to take the
 * desk (unless asked for by hand in them), the stickies shown, and not put away on its own.
 */
const stickyUp = (key: string): boolean => {
  const { blackout, away } = gate()
  return !blackout && (!deskAway(away, shownAnyway()) || askedFor.has(key)) && stickyPrefs().shown && !stuckAs(key)?.hidden && (tucked.get(key) ?? 0) <= Date.now() && ruled.get(key) !== 'tuck'
}
/** How many stickies are out on the screen: Tidy stickies is offered only when there is one to tidy. */
const stickiesOut = (): number => [...stickies].filter(([key, win]) => !win.isDestroyed() && stickyUp(key) && win.isVisible() && !peeking.has(key)).length
let toldOut = -1
let toldSeen = false
/** Whether any sticky is on the screen this moment, whatever the setting says: what "Show sticky notes" ticks. */
const stickiesSeen = (): boolean => [...stickies.values()].some((win) => !win.isDestroyed() && win.isVisible())
/** "Show sticky notes" ticked: one is on the screen, or they are meant to be and nothing (safe mode) keeps them in. */
const stickiesTicked = (): boolean => stickiesSeen() || (stickyPrefs().shown && !gate().blackout)
/** The menus' ⌃⌥⌘H: every open card folded into its pill, or the ones it folded opened again; nothing when there is neither. */
const foldWay = (): 'fold' | 'open' | null => (openCards().length ? 'fold' : foldedByKey.some((key) => stuckAs(key)?.pill) ? 'open' : null)
const tuckItems = (): Electron.MenuItemConstructorOptions[] => tuckLines().map(({ label, run }) => ({ label, accelerator: chordFor('⌃⌥⌘H'), click: run }))
/** The same line for a sticky's own menu (popup-menu.ts), with the keys it answers to. */
const tuckLines = (): (PopupLine & { label: string; run: () => void })[] => {
  const way = foldWay()
  return way === 'fold' ? [{ label: 'Fold every card into its pill', keys: '⌃⌥⌘H', run: foldDesk }] : way === 'open' ? [{ label: 'Open the cards it folded', keys: '⌃⌥⌘H', run: foldDesk }] : []
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
/**
 * Every sticky as the settings say now: shown or away. `atOnce`: back from a meeting or quiet hours, each is simply
 * there again where it was, with no drop, fade or sound: nobody asked for a show.
 */
function applyStickies(atOnce = false): void {
  const away = deskIsAway()
  for (const [key, win] of stickies) {
    if (win.isDestroyed()) continue
    const up = stickyUp(key)
    // Going away, it is out of sight before anything about it changes shape: a pill at the edge is made its whole
    // card again below, and that must never be seen on the way out (a call just started).
    if (!up) win.hide()
    // Away for a meeting or quiet hours, it keeps the shape it has (a pill stays a pill, its page still drawn as one),
    // so it is back exactly as it was, with nothing to draw again in front of you.
    if (!up && away) continue
    // Its pill in the stack or its whole card, as it is and as the clock says, before it comes in: it arrives as what it is.
    shapeCard(key, win, false)
  }
  // The pills in their one stack, once for them all, before any comes in: one past the stack's end waits in its last pill.
  layStack()
  // Coming out, each fades in and settles, one after another.
  for (const [key, win] of stickies) {
    // One still drawing comes in by itself once it has (see stick): never shown empty.
    if (win.isDestroyed() || !stickyUp(key) || !stickyReady.has(win) || stackHidden.has(key)) continue
    if (atOnce) void (win.isVisible() || (win.setOpacity(1), win.showInactive()))
    else arriveSticky(win)
  }
  // Frosted or plain paper, as the setting says now.
  retellFrost()
  tellStickiesOut()
}
/**
 * The desk as a meeting, quiet hours (where Settings' “Sticky notes and goal cards step away too” is on) and “Show
 * anyway” say now (in-meeting.ts, meeting-away.ts). Away: every sticky
 * note, the Today sticky, every goal card and tab hides at once, and a card Haligtree offered on its own with them. Back:
 * each where it was, at once and silent, and no moment missed is made up for. Run when a signal comes or goes, when
 * the setting or quiet hours are changed, when “Show anyway” is chosen, and by the clock (quiet hours' start and end).
 */
let deskWhy: 'meeting' | 'quiet' | null = null
let deskHidden = false
/** What the windows were last told, so they are told again only when it changes. */
let deskTold = ''
/**
 * Nudge cards on the screen as the desk went away: back with it, if they still hold a card. Only a window whose
 * cards Haligtree offered on its own (the review reminder, a practice): a task's alert is yours, and stays up in a
 * meeting as it would with none, as does an answer to something you just did (a sticky hidden, a site sent away).
 */
const nudgesAway = new Set<BrowserWindow>()
const nudgeTall = new WeakMap<BrowserWindow, number>()
const nudgeKinds = new WeakMap<BrowserWindow, Set<string>>()
const OFFERED = ['review', 'practice']
const onlyOffered = (win: BrowserWindow): boolean => [...(nudgeKinds.get(win) ?? [])].every((kind) => OFFERED.includes(kind))
type DeskSaid = { why: 'meeting' | 'quiet' | null; hidden: boolean; seen: string; quiet: string }
const deskSaid = (): DeskSaid => ({ why: deskWhy, hidden: deskHidden, seen: meetingSeen(), quiet: quietSeen(deskHidden) })
function applyDesk(): void {
  const { away: why, blackout } = gate()
  // “Show anyway”, and what was stuck by hand, last only while what hid the rest stays the same: a call starting in
  // quiet hours hides them again.
  if (!anywayKept(true, deskWhy, why)) (forgetAnyway(), askedFor.clear())
  const hidden = deskAway(why, shownAnyway())
  const same = why === deskWhy && hidden === deskHidden
  deskWhy = why
  deskHidden = hidden
  // What a signal says is in Settings as it changes, whether or not the desk moved: told only when the words did
  // (the clock runs this every half minute, and no window is to draw again for nothing).
  const said = JSON.stringify(deskSaid())
  if (said !== deskTold) {
    deskTold = said
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('desk:away', deskSaid())
  }
  if (same) return
  if (!blackout) {
    applyStickies(true)
    if (hidden) {
      for (const { win } of nudgeWins.values()) if (!win.isDestroyed() && win.isVisible() && onlyOffered(win)) (nudgesAway.add(win), win.hide())
    } else {
      for (const win of nudgesAway) if (!win.isDestroyed() && (nudgeTall.get(win) ?? 0) > 0) win.showInactive()
      nudgesAway.clear()
    }
  }
  updateTray()
}
/** The menus' lines while the desk is away, beside “Show sticky notes”: why, and the way to have them out all the same. */
const awayItems = (): Electron.MenuItemConstructorOptions[] =>
  !deskWhy ? [] : deskHidden
    ? [{ label: deskWhy === 'meeting' ? 'Hidden for a meeting' : 'Hidden for quiet hours', enabled: false }, { label: 'Show anyway', click: () => showAnyway(true) }]
    : [{ label: deskWhy === 'meeting' ? 'Shown anyway for this meeting' : 'Shown anyway for these quiet hours', enabled: false }, { label: 'Hide them again', click: () => showAnyway(false) }]

/** Which stickies were made as real glass, so a change of the setting remakes the rest. */
const builtGlass = new Map<string, boolean>()

function stick(type: string, id: string, on: boolean, bounds?: Electron.Rectangle): void {
  // A run that handed off to another book never puts a sticky up again: they belong to the book it left.
  if (on && handedOff()) return
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
    // Still drawing what it holds: it comes in by itself once it has, never shown empty.
    return void (gate().blackout || (deskIsAway() && !askedFor.has(key)) || !stickyReady.has(open) || arriveSticky(open))
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
  // Real glass: the Mac blurs whatever is behind the card, kept on while the window is not the active one (it never
  // is). The card fills the window, so the note sits straight in it.
  const glass = stickyGlass() && !nativeTheme.prefersReducedTransparency
  // Today's list is a little taller than a note: a few tasks under its title.
  const size = type === 'goal' ? (glass ? GOAL_GLASS : GOAL_SIZE) : type === 'goals' ? (glass ? GOALS_GLASS : GOALS_SIZE) : type === 'today' ? { width: 280, height: 300 } : { width: 300, height: 220 }
  builtGlass.set(key, glass)
  // A goal's card and the goals together keep their own size.
  const fixed = type === 'goal' || type === 'goals'
  // A saved place keeps the card itself on a screen: paper's clear room round it may hang past the edge.
  const frame = bounds && windowAround(bounds, insetOf(key))
  const place = frame
    ? cardInView({ ...frame, ...stickySize(fixed ? size.width : frame.width, fixed ? size.height : frame.height, frame) }, insetOf(key), screen.getDisplayMatching(frame).workArea)
    : freeSpot(workArea, size.width, size.height, insetOf(key))
  const win = new BrowserWindow({
    ...place,
    // See-through either way: as glass the Mac's blur is put under its card by the page (main/glass.ts, Raycast's
    // way: cut to the card's rounded shape, the desktop's colour coming through darkened), never the whole window.
    backgroundColor: '#00000000',
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
    transparent: true,
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
  // Paper's clear room round the card lets clicks through until the pointer is over the card.
  if (!glass) passThrough(win, true)
  // The desktop picture, blurred, behind its paper (frost.ts).
  frostWindow(win, () => stickyUp(key), fixed && !glass)
  // Shown once its page has drawn what it holds (sticky:ready, a blank card was seen first) and the main window, if it
  // is opening, has painted: the desk comes in first, the cards are dealt onto it. Never later than PATIENCE.
  let painted = false
  let filled = false
  const arrive = (): void => void (painted && filled && (stickyReady.add(win), stickyUp(key)) && afterHome(() => (shapeCard(key, win), stackHidden.has(key) || arriveSticky(win))))
  win.once('ready-to-show', () => ((painted = true), arrive()))
  readyWaits.set(win.webContents.id, () => ((filled = true), arrive()))
  setTimeout(() => ((filled = true), (painted = true), arrive()), PATIENCE)
  // Where you leave it is where it comes back.
  const remember = (): void => {
    // A pill, the window is at the edge: the card's own place is kept as it was.
    if (peeking.has(key) || openedAt.has(key)) return
    const one = stuck.find((each) => `${each.type}:${each.id}` === key)
    if (one && !win.isDestroyed()) one.bounds = cardFrame(key, win)
    keepStuck()
  }
  // Carried by Haligtree, not the Mac: the page asks on a press (window:grab), then says where the pointer is on the
  // screen as it moves (window:carry, once a frame), and the card follows from where it was picked up, drawn onto a
  // guide when near and held there, rigid, until the hand takes it well past, as Raycast's window does. Carried by
  // the Mac it could not be held, and slid along under the line (10 Nov).
  let hold: { from: Electron.Rectangle; start: Point } | null = null
  // Picked up while risen on hover (glass): it is carried exactly under the hand, still risen, its guides judged by
  // where it would lie, and it settles down onto its place only once let go. Before, the guides took the rise for
  // being off its line and pulled the card 6 points away from the pointer.
  let rise = 0
  handDrags.set(win, {
    grab: (at) => {
      if (hold || win.isDestroyed()) return
      // A pill picked up carries the whole stack.
      if (peeking.has(key)) return carryStack.grab(key, at)
      // Opened out of its pill and picked up: it is pinned first, the card alone in its window, and carried from there.
      if (fromPill.has(key)) pinCard(key, win)
      rise = unlift.get(win)?.() ?? 0
      if (!held.has(win)) (held.add(win), win.webContents.send('sticky:held', true))
      hold = { from: win.getBounds(), start: at }
      drag = dragGuides(others)
      drag.from(cardOf({ ...hold.from, y: hold.from.y + rise }, insetOf(key)))
    },
    carry: (now) => {
      if (stackHold) return carryStack.carry(now)
      if (!hold || !drag || win.isDestroyed()) return
      const { from, start } = hold
      const want = { ...from, x: from.x + now.x - start.x, y: from.y + now.y - start.y }
      const card = cardOf({ ...want, y: want.y + rise }, insetOf(key))
      const lined = drag.to(card)
      const to = { x: want.x + lined.x - card.x, y: want.y + lined.y - card.y }
      const at = win.getBounds()
      if (at.x !== to.x || at.y !== to.y) (win.setPosition(to.x, to.y), placed.set(win, to))
    },
    letGo: () => {
      if (stackHold) return carryStack.letGo()
      if (!hold) return
      hold = null
      placed.delete(win)
      letGo()
    }
  })
  // Picked up by your hand: the page lifts the card (a deeper shadow; paper
  // straightens). Any move of Haligtree's own (a lift on hover, a glide) stops
  // there, so nothing pulls against your hand.
  win.on('will-move', () => {
    if (win.isDestroyed()) return
    unlift.get(win)?.()
    grab(win)
    // Watched from the start on a Mac: picked up and put down without moving,
    // it is set down too. Elsewhere 'moved' comes once, at the end (hand.ts).
    // Picked up already on a line, it is held there without a tick.
    if (process.platform === 'darwin') {
      drag = dragGuides(others, CARRIED)
      drag.from(cardOf(win.getBounds(), insetOf(key)))
      whenLetGo(win, letGo, lining)
    }
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
  // Carried into line with another card's edge, the trackpad taps once
  // (haptic.ts), as the Mac's own guides do; out of line and back, once again.
  // From its first move, Raycast's grey dashed guides show every line it can settle on (snap-lines.ts, guides.ts),
  // fixed until it is let go: a sticky has no home of its own, so they run along the other cards up on its screen
  // (another sticky, a goal's card, quick capture), down each one's left and right edges and across its top. The Mac
  // moves the window under your hand, so it follows the pointer exactly and is drawn onto the line as it is let go.
  let drag: ReturnType<typeof dragGuides> | null = null
  const others = (): ReturnType<typeof cardOf>[] => stickyCards(win)
  const lining = (now: Electron.Rectangle): void => void drag?.to(cardOf(now, insetOf(key)))
  // Let go: the card settles with a soft tap. Past an edge, it glides back
  // until the card is all in view; near the screen's edge or another sticky,
  // it glides into line with it (sticky-place.ts).
  const letGo = (): void => {
    if (win.isDestroyed()) return
    if (held.delete(win)) win.webContents.send('sticky:held', false)
    hideGuides()
    const carried = drag
    drag = null
    const risen = rise
    rise = 0
    if (ours(win)) return
    // Put down by hand, a card opened out of its tab rests where it was put.
    openedAt.delete(key)
    const real = win.getBounds()
    const now = { ...real, y: real.y + risen }
    const inset = insetOf(key)
    const area = screen.getDisplayMatching(now).workArea
    const inView = cardInView(now, inset, area)
    // On the line the drag drew it on; put down by anything else (a move with no drag, off a Mac), onto one within reach.
    const pulled = carried ? carried.rest(cardOf(inView, inset), area) : lineUp(cardOf(inView, inset), others(), area, {}, CARRIED)
    const { x, y } = cardInView({ ...now, x: pulled.x - inset.left, y: pulled.y - inset.top }, inset, area)
    if (x !== real.x || y !== real.y) moveStickies([[key, win, { x, y }]], false)
    else remember()
    // Put down in the stack's column, or taken out of it: the stack stands clear of it again.
    layStack()
  }
  win.on('resized', remember)
  // Its right-click menu, drawn by Haligtree (popup-menu.ts): the writing's own Cut, Copy and Paste where
  // you can write, then this sticky's own lines, its paper's colour, and the whole desk under "All stickies".
  const ownMenu = (params: OwnMenuAsk): void => {
    if (win.isDestroyed()) return
    const page = win.webContents
    // The edit runs in the sticky, its keys handed back first.
    const edit = (what: 'cut' | 'copy' | 'paste') => (): void => void (win.isDestroyed() || page[what]())
    const writing: PopupLine[] = params.isEditable
      ? [
          ...(params.editFlags.canCut ? [{ label: 'Cut', keys: '⌘X', run: edit('cut') }] : []),
          ...(params.editFlags.canCopy ? [{ label: 'Copy', keys: '⌘C', run: edit('copy') }] : []),
          ...(params.editFlags.canPaste ? [{ label: 'Paste', keys: '⌘V', run: edit('paste') }] : [])
        ]
      : params.selectionText ? [{ label: 'Copy', keys: '⌘C', run: edit('copy') }] : []
    // Its own: open it (its ↗) and take it down (its X, at once from here: choosing the line is the asking).
    const own: PopupLine[] = [
      // A pill's menu is its card's, and the way to keep the card open.
      ...(peeking.has(key) || fromPill.has(key) ? [{ label: 'Keep open', run: () => pinCard(key, win) }] : []),
      { label: `Open in ${APP_NAME}`, run: () => page.send('sticky:do', 'open') },
      { label: 'Take it down', keys: '⌘W', run: () => page.send('sticky:do', 'down') }
    ]
    // Its paper's colour, kept with it; a goal's card and the goals together keep their own.
    const now = stuckAs(key)?.tint ?? 'plain'
    const colours: PopupLine[] = fixed ? [] : [
      { heading: 'Paper colour' },
      { swatches: STICKY_TINTS.map(([tint, label]) => ({ color: `rgb(${(TINT_DOTS[tint] ?? TINT_DOTS.plain).join(', ')})`, label, on: now === tint, run: () => tintSticky(key, tint) })) }
    ]
    const all: PopupLine[] = [
      { label: 'Tidy stickies down the right edge', keys: '⌃⌥⌘T', run: () => void tidyStickies(page) },
      ...(canUntidy() ? [{ label: 'Put stickies back where they were', run: untidyStickies }] : []),
      ...tuckLines()
    ]
    // Every sticky's lines in the menu itself: two or three lines folded behind "All stickies" were a step for nothing (10 Nov).
    const groups = [writing, own, colours, all].filter((group) => group.length)
    const lines = groups.flatMap((group, n): PopupLine[] => (n ? [{ separator: true }, ...group] : group))
    const at = win.getBounds()
    void popupMenu(win, { x: at.x + params.x, y: at.y + params.y }, lines, load).then((path) => path && lineAt(lines, path)?.())
  }
  win.webContents.on('context-menu', (_event, params) => ownMenu(params))
  ownMenus.set(win.webContents, ownMenu)
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
  // A new note starts open, pinned where it lands; Today and a goal's card start as pills in the stack.
  if (!stuck.some((one) => `${one.type}:${one.id}` === key)) stuck.push({ type, id, bounds: cardOf(place, insetOf(key)), touched: Date.now(), ...(!handStuck.delete(key) && (pillWish.get(key) ?? (type === 'today' || fixed)) ? { pill: true } : {}) })
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
/**
 * Whether the stickies left last time have been read back yet. Until then no goal card is made: one made first
 * (the goals told as the book opens) landed in a fresh spot, and the place kept for it was lost, so after a
 * restart (into the sandbox and back, say) a card could come back where another had been.
 */
let stickiesRestored = false
/** The stickies left on the desktop last time, back where they were. */
async function restoreStickies(): Promise<void> {
  try {
    const read = JSON.parse(await readFile(stickyFile(), 'utf8')) as Stuck[]
    // The goal stack, from before each goal had a card of its own: its place is the first card's.
    stackWas = read.find((one) => one.type === 'goal' && one.id === 'stack')?.bounds
    const saved = read.filter((one) => !(one.type === 'goal' && one.id === 'stack'))
    // Kept as each was: one left open stays open, pinned; with every sticky tucked at the edge before pills, each is a pill.
    if (wasTucked()) for (const one of saved) one.pill ??= true
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
  stickiesRestored = true
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
    } else if ((win !== focusPill || (focusWanted && focusBubbleShown() && !isWelcoming())) && (!url.includes('view=sticky') || [...stickies].some(([key, one]) => one === win && stickyUp(key) && !stackHidden.has(key)))) {
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
  setTimeout(go, PATIENCE)
}
/** How many trackpad taps were asked for (haptic.ts): what the stickies' probe reads. */
;(globalThis as { haligtreeTaps?: () => number }).haligtreeTaps = () => taps
/** Whether the window server shows Haligtree's cursor while it is not the active app: what the hand probe reads. */
;(globalThis as { haligtreeCursorShown?: () => boolean }).haligtreeCursorShown = () => cursorShown
/** Each tap's kind, in order ('align' or 'level'): what the scrub probe reads. */
;(globalThis as { haligtreeTapKinds?: () => string[] }).haligtreeTapKinds = () => [...tapKinds]
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
  const win = makeHome()
  const go = (): void => void win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent(${JSON.stringify(event)}, { detail: ${JSON.stringify(detail)} }))`).catch(() => undefined)
  // Once the page has drawn itself, not just painted: its listeners are on by then, so nothing said
  // at the start (a restore, an import's end) is lost while the window is still coming up.
  // Told before the window is brought forward (openHome puts the box away and, where AeroSpace is installed, starts
  // asking it where you are): the page answers while that goes on, as the welcome played again shows its loader.
  whenHomeDrawn(go)
  openHome()
}

/** Told to the main window if it is drawn, without bringing it forward: a file sent from Finder says so where you are not looking. */
function inHomeQuietly(event: string, detail: unknown): void {
  if (home && !home.isDestroyed()) whenHomeDrawn(() => void home!.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent(${JSON.stringify(event)}, { detail: ${JSON.stringify(detail)} }))`).catch(() => undefined))
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
      if (win.isDestroyed()) return
      // A first run's window waits for its welcome (welcome:arrive): shown at once in the middle of the screen when the
      // welcome plays plainly, or under the scene's fog once that is whole (placeForWelcome). If its page never asks
      // (it broke), it is shown all the same a moment later.
      if (firstRun() && !startTimes.shown) setTimeout(() => void (!win.isDestroyed() && !win.isVisible() && !scene && win.show()), 4000)
      else win.show()
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
// A test run never asks the real one anything (it could move the person's windows or change their workspace): only a
// stand-in it names (qa/box-aerospace.mjs, qa/sticky-follow.mjs), or none.
const AEROSPACE = process.env.HALIGTREE_QA_AWAY ? process.env.HALIGTREE_AEROSPACE || undefined : ['/opt/homebrew/bin/aerospace', '/usr/local/bin/aerospace'].find((path) => existsSync(path))
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
 * AeroSpace, nothing is done. True when it was parked like that.
 */
function parkedBy(win: BrowserWindow): boolean {
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).bounds
  const seenW = Math.max(0, Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x))
  const seenH = Math.max(0, Math.min(b.y + b.height, area.y + area.height) - Math.max(b.y, area.y))
  if (seenW * seenH > b.width * b.height * 0.1) return false
  // A glide of ours under way (a small window stepping aside as you left it) would pull it back out of hiding.
  stopAside(win)
  followWorkspace()
  return true
}
/**
 * Whether AeroSpace has the box filed under a workspace: the box's window number and the AeroSpace that listed it while
 * it was up (seeBoxFiling), else null. AeroSpace decides once, the first time it sees a window, and keeps to it
 * (AeroSpace 0.20, MacWindow.swift getOrRegister): shown over Haligtree's own window (Haligtree an ordinary app with a
 * Dock icon, see `arrive`) the box is filed under the workspace in view, for good; summoned from another app (Haligtree
 * a menu bar app for the moment, boxUp) it is a popup of no workspace (AxUiElementWindowType.swift isWindowHeuristic).
 * Filed, it took you back to its workspace each time it came up anywhere else, and once it had been up while you
 * changed workspace it took you to that one instead (the user, 13 Nov: "if i then move to any other workspace, and
 * open the prompt, it takes me back to workspace three"). AeroSpace leaves a hidden window out of its list, so the box
 * cannot be found there while it is away, which is why the move before it shows never happened: this note is taken
 * while it is up instead.
 */
let boxFiled: { id: string; by: string } | null = null
/** A window's number as AeroSpace names it (the Mac's own window number). */
const windowNumber = (win: BrowserWindow): string => win.getMediaSourceId().split(':')[1]
const aerospaceAway = (): boolean => !AEROSPACE || (!!process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_FOLLOW)
/** Which AeroSpace is running (its process number): one started again since has forgotten every window it filed. */
const aerospaceRunning = (): Promise<string> =>
  new Promise((done) => execFile('/usr/bin/pgrep', ['-x', 'AeroSpace'], { timeout: 1500 }, (error, out) => done(error ? '' : out.trim())))

/**
 * The box to the AeroSpace workspace in view before it shows, when AeroSpace has it filed under one (boxFiled): moved by
 * its window number, then put back where it was just placed, in case AeroSpace gave it a place of its own. A popup is
 * never moved, since AeroSpace would tile it into the workspace, nor a box filed by an AeroSpace that has since started
 * again; with nothing to move the box opens without asking AeroSpace anything. Null when nothing is to be done.
 */
function boxToWorkspaceHere(win: BrowserWindow): Promise<void> | null {
  if (aerospaceAway()) return null
  const id = windowNumber(win)
  if (boxFiled?.id !== id) return null
  const at = boundsOf(win)
  return (async () => {
    const [here, by] = await Promise.all([aerospace('list-workspaces', '--focused'), aerospaceRunning()])
    if (by !== boxFiled?.by) return void (boxFiled = null)
    if (!here || win.isDestroyed()) return
    await aerospace('move-node-to-workspace', '--window-id', id, here)
    if (!win.isDestroyed() && !sameBox(win.getBounds(), at)) win.setBounds(at)
  })()
}

/**
 * Whether AeroSpace has filed the box (boxFiled), read from its list while the box is up: AeroSpace takes a window in on
 * its own time after the Mac tells it one appeared, so it is read once the box has been up a moment, and again as it
 * is put away (for a box up only a moment). Only ever set: AeroSpace never un-files a window it has filed while that
 * AeroSpace runs, and a popup is never listed.
 */
function seeBoxFiling(win: BrowserWindow): void {
  if (aerospaceAway() || win.isDestroyed() || !win.isVisible()) return
  const id = windowNumber(win)
  void Promise.all([aerospace('list-windows', '--all', '--format', '%{window-id}'), aerospaceRunning()]).then(([rows, by]) => {
    if (rows.split('\n').includes(id)) boxFiled = { id, by }
  })
}
let following: ReturnType<typeof setTimeout> | null = null
function followWorkspace(): void {
  // A test run's windows are parked past the screen's edge on purpose: never sent anywhere, unless the run asks (HALIGTREE_QA_FOLLOW).
  if (!AEROSPACE || following || (process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_FOLLOW)) return
  following = setTimeout(async () => {
    following = null
    const here = await aerospace('list-workspaces', '--focused')
    if (!here) return
    // Each sticky, and each small window, by AeroSpace's own name for its window: the Mac's window number.
    const ours = new Set([...[...stickies].filter(([key, one]) => !one.isDestroyed() && stickyUp(key)).map(([, one]) => one), ...BrowserWindow.getAllWindows().filter((one) => isSmall(one) && one.isVisible())].map((one) => one.getMediaSourceId().split(':')[1]))
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
    if (win.isDestroyed() || win.isFullScreen() || !win.isVisible() || pending?.win === win || welcomePlaced || isWelcoming()) return
    void writeWhole(homeFile(), JSON.stringify(win.getBounds())).catch(() => undefined)
  }, 400)
}

/**
 * The welcome's arrival (welcome-scene.tsx, after Dia's onboarding): a fog over the whole screen, drawn by a window of
 * its own over everything (the scene window, makeScene), that draws in to the welcome's window in the middle of the
 * screen; the whole welcome then plays in that window, and it grows to the app's own size only when the welcome ends
 * (growAfterWelcome). Where the scene cannot be (arrival.ts plainArrival), the welcome's window is put in the middle at
 * once and the welcome plays in it plainly.
 *
 * Under AeroSpace the welcome's window floats while the welcome plays (AeroSpace tiles a window whose full-screen
 * button works, and leaves one whose button is off where it was put; AxUiElementWindowType.swift), and is given back
 * to its tiling when it grows. The scene window, a panel with no buttons and no title, is never AeroSpace's at all.
 */
let scene: BrowserWindow | null = null
type ScenePlace = { screen: { width: number; height: number }; window: { x: number; y: number; width: number; height: number } }
/** The arrival under way: its clock (Date.now() of its start, 0 until the scene window has drawn), where it plays, whose book it signs. */
let arrival: { t0: number; place: ScenePlace; rect: Electron.Rectangle; name: string; timers: ReturnType<typeof setTimeout>[]; handed: boolean } | null = null
/** The main window stands in the middle of the screen for the welcome, to grow when it ends. */
let welcomePlaced = false
/** Floated for the welcome under AeroSpace (or made so from the start, a first run's): tiled again as it grows. */
let floated = false
/**
 * Each placing and each grow takes a turn: a grow outrun by a newer placing (the page made again mid-welcome, a
 * development run's reload, and the welcome back at once) leaves the window to it, and a placing during a grow puts
 * the window back in the middle with where it stood kept again.
 */
let welcomeTurn = 0
/** A grow under way: where the window stood before the welcome. */
let growing: { was: ReturnType<typeof windowBeforeWelcome> } | null = null
/** What the arrival probes read: the scene's place and clock, and each step as it came (ms of this run). */
const sceneSteps: { what: string; at: number }[] = []
const step = (what: string): void => void sceneSteps.push({ what, at: Math.round(performance.now()) })
;(globalThis as { haligtreeArrival?: () => unknown }).haligtreeArrival = () => ({ scene: !!scene && !scene.isDestroyed(), t0: arrival?.t0 ?? 0, place: arrival?.place ?? null, placed: welcomePlaced, floated, steps: sceneSteps })

/**
 * The welcome's window on a screen: in the middle of its usable part, about Dia's share of it, never smaller than its
 * pages need (1100 by 748: the Write and Remember pages' cards and curves fit there, not at 960 by 600; the last page's
 * two choices were cut at 0.625 of the width, the user, 15 Nov 2026: "we can afford to make the welcome a little bit
 * taller"), the desktop showing round it on any screen.
 */
function welcomePlace(display: Electron.Display): Electron.Rectangle {
  const area = display.workArea
  const width = Math.min(area.width - 64, Math.max(1100, Math.min(1280, Math.round(area.width * 0.62))))
  const height = Math.min(area.height - 64, Math.max(748, Math.round(width * 0.68)))
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height }
}

/** Whether the welcome may arrive as a scene over the whole screen, here and now. A test run only when it asks. */
function sceneArrives(win: BrowserWindow, display: Electron.Display): boolean {
  return !plainArrival({
    mac: process.platform === 'darwin',
    welcome: true,
    test: !!process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_ARRIVAL,
    still: stillness(),
    safe: gate().blackout,
    solid: nativeTheme.prefersReducedTransparency,
    secondDisplay: !process.env.HALIGTREE_QA_ARRIVAL && display.id !== screen.getPrimaryDisplay().id,
    fullScreen: win.isFullScreen()
  })
}

/** The scene window: over the whole of one screen, its menu bar and Dock too, see-through wherever nothing is drawn. */
function makeScene(display: Electron.Display): BrowserWindow {
  const win = new BrowserWindow({
    type: 'panel',
    ...display.bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    // Never a full-screen window of its own (the glow's lesson, makeGlow): it joins the Space you are on.
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    show: false,
    title: '',
    // Its clock is the screen's: never slowed while another window has the focus.
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
  })
  // Above the menu bar and the Dock: the fog is the whole screen's.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setBounds(display.bounds)
  load(win, '?view=scene')
  return win
}

/** The scene window has drawn its first, empty frame: the clock starts, for it and for the welcome's window alike. */
function startScene(): void {
  if (!scene || scene.isDestroyed() || !arrival || arrival.t0) return
  const t0 = Date.now() + 50
  arrival.t0 = t0
  step('start')
  scene.webContents.send('scene:start', { t0, place: arrival.place, name: arrival.name, sounds: soundsOn() })
  home?.webContents.send('welcome:scene', { what: 'start', t0 })
  scene.show()
  // Its keys (Esc, Enter) are the arrival's own until the welcome's window takes over.
  app.focus({ steal: true })
  scene.focus()
  const at = (ms: number, then: () => void): void => void arrival?.timers.push(setTimeout(then, Math.max(0, t0 + ms - Date.now())))
  at(SCENE_COVERED, () => void placeForWelcome(arrival?.rect))
  // The scene window says when it has drawn in (scene:done); past that by a little, it gives way all the same.
  at(SCENE_HANDOVER + 1500, handOverScene)
  at(SCENE_WORDS + 400, endScene)
}

/**
 * The welcome's window, put in the middle of the screen for the welcome (where it stood is kept, to grow back to), and
 * shown if it was not: under the scene's fog once that is whole, or at once for a plain arrival (`plain`).
 */
async function placeForWelcome(rect?: Electron.Rectangle, plain = false): Promise<void> {
  const win = home
  if (!win || win.isDestroyed() || win.isFullScreen()) return
  const turn = ++welcomeTurn
  if (growing) {
    // Growing back from a welcome just left: stopped where it is, and placed again, where it stood kept as before.
    if (growing.was) keepWindowBeforeWelcome(growing.was)
    growing = null
    welcomePlaced = false
  }
  if (!welcomePlaced) {
    welcomePlaced = true
    if (!windowBeforeWelcome()) keepWindowBeforeWelcome({ bounds: win.getNormalBounds(), maximized: win.isMaximized() })
    if (win.isMaximized()) win.unmaximize()
    if (AEROSPACE && !floated) {
      floated = true
      await aerospace('layout', 'floating', '--window-id', windowNumber(win))
      if (win.isDestroyed() || turn !== welcomeTurn) return
    }
    win.setFullScreenable(false)
    win.setBounds(rect ?? welcomePlace(screen.getDisplayMatching(win.getBounds())))
  }
  step('placed')
  if (!win.isVisible()) plain ? win.show() : win.showInactive()
  win.webContents.send('welcome:scene', { what: 'covered' })
}

/** The scene has drawn in to the welcome's window: that window takes the keys, and the scene window keeps only its corner buttons. */
function handOverScene(): void {
  if (!arrival || arrival.handed) return
  arrival.handed = true
  step('handover')
  const win = home
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show()
    app.focus({ steal: true })
    win.focus()
  }
  if (scene && !scene.isDestroyed()) passThrough(scene, true)
}

/** The arrival over: the scene window goes. */
function endScene(): void {
  if (arrival) for (const one of arrival.timers) clearTimeout(one)
  arrival = null
  if (scene && !scene.isDestroyed()) (step('ended'), scene.destroy())
  scene = null
}

/**
 * The welcome over: its window takes the app's own size (where it stood before the welcome; a first run's, where it
 * was last left or the whole usable screen) in one move, is given back to AeroSpace's tiling, and the page is told, to
 * bring the app up in it (welcome.tsx). The page under it is the welcome's plain ground while it grows (the app is not
 * laid out yet), so the move shows nothing being drawn again. One move, at once: a resize every frame from a timer
 * stuttered and redrew the window's edges and shadow each time, and under AeroSpace ended in a second jump into its
 * tile (the user, 15 Nov 2026: "expansion from welcome to main app looks wack and laggy, i shouldnt be able to see it
 * glitchily expand"); the Mac's own animated resize says it has ended ('resized') only for a window it animates on
 * screen, so a window off it waited 3 s for an end that never came. Under AeroSpace the tiling places it.
 */
async function growAfterWelcome(): Promise<void> {
  endScene()
  const win = home
  if (!win || win.isDestroyed()) return
  // Never put in the middle (full screen, or the plain way on another platform): nothing to grow, the app comes up at once.
  if (!welcomePlaced || growing) return void (welcomePlaced || win.webContents.send('welcome:scene', { what: 'grown' }))
  const turn = ++welcomeTurn
  const was = windowBeforeWelcome()
  keepWindowBeforeWelcome(null)
  const from = win.getBounds()
  step('grow')
  growing = { was }
  win.setFullScreenable(true)
  if (floated) {
    floated = false
    await aerospace('layout', 'tiling', '--window-id', windowNumber(win))
  }
  // Where it stood before the welcome; a first run's, the app's own place. Not where tiling has put it already.
  const to = was && !was.maximized ? was.bounds : homePlace()
  if (!win.isDestroyed() && turn === welcomeTurn && sameBox(win.getBounds(), from)) win.setBounds(to)
  // A placing took the window over meanwhile (the welcome back at once): it keeps it.
  if (win.isDestroyed() || turn !== welcomeTurn) return
  growing = null
  welcomePlaced = false
  if (was?.maximized) win.maximize()
  step('grown')
  keepHomePlace(win)
  win.webContents.send('welcome:scene', { what: 'grown' })
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

  // Large to start, filling the screen's usable part, then where you leave it. A first run (or the sandbox opened to
  // play the welcome, carriesWelcome) is made as the welcome's window: in the middle of the screen, its full-screen
  // button off so a tiling manager leaves it there (placeForWelcome), to grow to the whole usable screen as it ends.
  const opening = firstRun() || carriesWelcome()
  const place = opening ? welcomePlace(screen.getDisplayNearestPoint(screen.getCursorScreenPoint())) : homePlace()
  if (opening) (welcomePlaced = true), (floated = !!AEROSPACE)
  const made = (home = new BrowserWindow({
    ...place,
    show: false,
    title: APP_NAME,
    backgroundColor: '#1c1c1c',
    fullscreenable: !opening,
    autoHideMenuBar: true,
    // The app draws its own toolbar, with the traffic lights set into it the
    // way Claude's and Linear's are, rather than a grey strip saying "Electron".
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  }))
  // Small enough to sit in a corner, not so small its pages fold up.
  home.setMinimumSize(560, 400)
  // Swipe back (swipe-back.tsx): the page hears the wheel but never the fingers. The Mac's scroll event says when
  // they touch and lift (its phase, native/glass.mm); resting still says nothing. Passed on for this window only.
  const sideways = home
  const number = Number(sideways.getMediaSourceId().split(':')[1])
  watchScroll((kind, windowNumber) => {
    if (!sideways.isDestroyed() && windowNumber === number) sideways.webContents.send('swipe:phase', kind)
  })
  // Its place said again once made: a window made before it is shown can be
  // put in the middle of the screen instead of where it was asked to be.
  home.setBounds(place)
  home.on('focus', homeCameForward)
  home.on('close', (event) => {
    if (quitting || made !== home) return
    event.preventDefault()
    // Mid-welcome, ⌘W or the red dot would leave it half done, so it stays
    // until it is finished or skipped.
    if (isWelcoming()) return void home?.webContents.send('onboarding:held')
    putHomeAway()
  })
  home.on('closed', () => {
    if (made !== home) return
    home = null
    homePainted = false
    homeDrawn = false
    homeAsked = false
  })
  reached('made')
  home.once('ready-to-show', () => ((homePainted = true), reached('painted')))
  home.once('show', () => void (reached('shown'), qaTrace('home', home!, { drawn: homeDrawn, url: home!.webContents.getURL() })))
  // The fill icon follows the window, however it was filled or brought back:
  // the green button, a drag, a tiling manager. Not while it glides.
  for (const change of ['maximize', 'unmaximize', 'resized', 'moved', 'enter-full-screen', 'leave-full-screen'] as const)
    home.on(change as 'resized', () => void (home === made && pending?.win !== home && (tellFilled(home), keepHomePlace(home))))
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
  if (keptRoom(win, next)) return Promise.resolve()
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
 * legend, is one more sticky, 'goals:all', put up by hand like a note, or by
 * itself when there are too many goals for cards of their own.
 */
const GOAL_SIZE = { width: 308, height: 368 }
/** As glass: the card fills it. */
const GOAL_GLASS = { width: 268, height: 328 }
const GOALS_SIZE = { width: 340, height: 400 }
const GOALS_GLASS = { width: 300, height: 360 }
/** At most this many goal cards on their own; more share the goals sticky. */
const GOAL_CARDS = 3
/** Goals made this close together came in together (an import), not one by one. */
const BULK_MS = 60_000
/** How long a goal just made waits for others before its card comes out. */
const FRESH_MS = 2000
let freshWait: ReturnType<typeof setTimeout> | undefined
/** The goals share the goals sticky now, and whether it was put up for that. */
let gathered = false
let gatheredOurs = false
/** Where the old goal stack sat, for the first goal card made after it. */
let stackWas: Electron.Rectangle | undefined
/** When each beacon may show again; Infinity is "at its next moment". */
const tucked = new Map<string, number>()
const beaconModes = new Map<string, 'always' | 'sometimes'>()
/** The goals whose “Goal on screen” asks for a card of their own, as of the last look at the goals (beacons). */
let ownCards = new Set<string>()
/** The goal cards the pointer is on: they never tuck away. */
const beaconHeld = new Set<string>()
const tuckTimers = new Map<string, ReturnType<typeof setTimeout>>()
/**
 * Which of the day's moments have come (wake, open), by the day they came, kept in the book's folder: a run started
 * by the one before (into the sandbox and back, another book, a restore) is not a new opening of the day, so a
 * now-and-then card tucked away stays tucked through it.
 */
const momentsFile = (): string => join(app.getPath('userData'), 'beacon-moments.json')
let momentsDone: Map<string, string> | null = null
const moments = (): Map<string, string> => {
  if (momentsDone) return momentsDone
  try {
    momentsDone = new Map(Object.entries(JSON.parse(readFileSync(momentsFile(), 'utf8')) as Record<string, string>))
  } catch {
    momentsDone = new Map()
  }
  return momentsDone
}
let lastAppear = Date.now()
/** A goal's beacon as it should be now. */
const beaconMode = (goal: { goalAt: string; beacon: 'always' | 'sometimes' | 'off' | null }): 'always' | 'sometimes' | 'off' => {
  const mode = goal.beacon ?? beaconDefault()
  return mode === 'sometimes' && daysLeft(goal.goalAt) <= 7 ? 'always' : mode
}
/** Every goal's beacon made, taken down or tucked as its goal says now. */
function beacons(): void {
  // Read back first (restoreStickies then calls this): each card where it was left, never a fresh spot.
  if (!stickiesRestored) return
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
  // Never a flood: past GOAL_CARDS beacons (an import, say), or goals made
  // together, they share the one goals sticky instead, and only goals set to
  // "Always" by hand keep a card of their own, still no more than GOAL_CARDS.
  // A goal made a moment ago waits a breath, so one made with others is never
  // put up only to be taken down again; one set to "Always" was asked for and
  // comes at once (the sandbox's Dune card, so it is the first in its column).
  const now = Date.now()
  const made = (goal: OpenGoal): number => Date.parse(goal.createdAt) || 0
  const fresh = goals.filter((goal) => now - made(goal) < FRESH_MS)
  if (fresh.length) (clearTimeout(freshWait), (freshWait = setTimeout(beacons, FRESH_MS)))
  const out = goals.filter((goal) => beaconModes.has(`goal:${goal.id}`))
  const crowded = out.length > GOAL_CARDS
  const together = (goal: OpenGoal): boolean => goals.some((other) => other !== goal && Math.abs(made(other) - made(goal)) < BULK_MS)
  const own = new Set((crowded ? out.filter((goal) => goal.beacon === 'always') : out.filter((goal) => goal.beacon === 'always' || !together(goal))).filter((goal) => goal.beacon === 'always' || !fresh.includes(goal)).slice(0, GOAL_CARDS).map((goal) => `goal:${goal.id}`))
  // None for the rest, but one: a card stuck by hand (a page asked for it) is the person's own, and stays while its
  // goal is open. Taken down here it went by itself at the next look, half a minute at most after it was stuck
  // (the menu bar's clock runs this), with nothing changed: seen as a card that vanishes.
  ownCards = own
  const open = new Set(goals.map((goal) => `goal:${goal.id}`))
  for (const key of [...stickies.keys()]) if (key.startsWith('goal:') && cardComesDown(own.has(key), stuckAs(key)?.asked === true, open.has(key))) stick('goal', key.slice(5), false)
  for (const goal of goals) {
    if (!own.has(`goal:${goal.id}`) || stickies.has(`goal:${goal.id}`)) continue
    const at = stackWas
    stackWas = undefined
    stick('goal', goal.id, true, at)
  }
  // The goals sticky comes out once as they gather, said once in the main
  // window, and goes when it is no longer needed. Taken down by its X, it
  // stays down until they gather again.
  if (!fresh.length) {
    const gather = crowded || out.some((goal) => !own.has(`goal:${goal.id}`))
    if (gather && !gathered) {
      gatheredOurs = true
      if (!stickies.has('goals:all')) {
        stick('goals', 'all', true)
        if (home && !home.isDestroyed()) home.webContents.send('goals:gathered', out.length)
      }
    }
    if (!gather && gathered && gatheredOurs) (stick('goals', 'all', false), (gatheredOurs = false))
    gathered = gather
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
  const { blackout, held } = gate()
  if (blackout || held || !stickyPrefs().shown) return
  if (kind !== 'active') {
    if (moments().get(kind) === dayKey()) return
    moments().set(kind, dayKey())
    void writeWhole(momentsFile(), JSON.stringify(Object.fromEntries(moments()))).catch(() => undefined)
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
 * focus session say. Peeking, it is a pill in the desk's stack, as a card
 * folded by hand is; pointed at, it opens out of the pill, and folds back once
 * the pointer has left it for half a second. A card out of sight two days peeks
 * out by itself once that day, for ten minutes, with a small wiggle: seen again,
 * never nagged.
 */
const ruled = new Map<string, Rest>()
/** The cards that are pills now, each with the place its whole card rests at. */
const peeking = new Map<string, Electron.Rectangle>()
/** Peeked out by itself, till then. */
const peekingOut = new Map<string, number>()
/**
 * The desk's one stack: every card folded is a pill, one line at the screen's edge, and all of them stand in one
 * column on the right, from STACK_TOP down: Today first, then the goals nearest first, then the notes most lately
 * touched. A pill is PILL_H tall, PILL_GAP from the next and PILL_IN in from the edge, all of it on the screen; its
 * words decide its width (PILL_MIN to PILL_MAX, as its page measures them). Its window keeps clear room round it for
 * its lift (the session bubble's), which lets clicks through to the app behind (lib/clear-room.ts).
 */
const PILL_H = 28
const PILL_GAP = 6
const PILL_IN = 8
const PILL_ROOM = { side: 6, top: 2, bottom: 6 }
const PILL_MIN = 96
const PILL_MAX = 220
/** A pill's width until its page has measured its words. */
const PILL_GUESS = 140
const STACK_TOP = 0.18
/**
 * Where the stack stands: its edge, its first pill's top, and its screen. The right edge 18% down the main screen to
 * begin with; carried by any of its pills (carryStack), it stays where it was put, kept in desk-stack.json.
 */
let stackSide: 'left' | 'right' = 'right'
let stackTop: number | null = null
let stackDisplay: number | null = null
let stackRead = false
const stackFile = (): string => join(app.getPath('userData'), 'desk-stack.json')
function readStackPlace(): void {
  if (stackRead) return
  stackRead = true
  try {
    const read = JSON.parse(readFileSync(stackFile(), 'utf8')) as { side?: string; top?: number; display?: number }
    if (read.side === 'left' || read.side === 'right') stackSide = read.side
    if (typeof read.top === 'number') stackTop = read.top
    if (typeof read.display === 'number') stackDisplay = read.display
  } catch {
    // Never carried: where it begins.
  }
}
/**
 * The stack carried by one of its pills, kept by the pill's grab point: up and down its edge, or to the other edge,
 * on the screen the pill is carried onto. Where the pill would be under the pointer decides, never the pointer alone.
 */
let stackHold: { start: Point; top: number; pill: Electron.Rectangle } | null = null
const carryStack = {
  grab: (key: string, at: Point): void => {
    const { at: places } = stackPlaces()
    const first = [...places.values()][0]
    const pill = places.get(key)
    if (first && pill) stackHold = { start: at, top: first.y, pill }
  },
  carry: (now: Point): void => {
    if (!stackHold) return
    const { start, top, pill } = stackHold
    const centre = { x: Math.round(pill.x + pill.width / 2 + now.x - start.x), y: Math.round(pill.y + pill.height / 2 + now.y - start.y) }
    const display = screen.getDisplayNearestPoint(centre)
    stackDisplay = display.id
    stackSide = centre.x < display.workArea.x + display.workArea.width / 2 ? 'left' : 'right'
    stackTop = top + now.y - start.y
    layStack()
  },
  letGo: (): void => {
    if (!stackHold) return
    stackHold = null
    // Kept where the stack stands now, its top as laid (held inside the screen).
    const first = [...stackPlaces().at.values()][0]
    if (first) stackTop = first.y
    void writeWhole(stackFile(), JSON.stringify({ side: stackSide, top: stackTop, display: stackDisplay })).catch(() => undefined)
  }
}
/** Each pill's width, as its page last measured its words. */
const pillWidth = new Map<string, number>()
/**
 * Cards opened out of their pill by the pointer, not pinned: each keeps its place in the stack while it is open, and
 * the window that grew out of the pill holds the card beside the stack and the pill's own column.
 */
const fromPill = new Map<string, Electron.Rectangle>()
type Peek = { side: 'left' | 'right'; nudge: boolean; opened?: { pill: Electron.Rectangle; card: number; size: { width: number; height: number } } }
/** What each pill was last told it is, asked for again by its page as it loads (a reload, or told before it listened). */
const peekSaid = new Map<string, Peek>()
ipcMain.handle('beacon:peek:now', (event) => {
  const key = keyOfSticky(BrowserWindow.fromWebContents(event.sender))
  return key ? (peekSaid.get(key) ?? null) : null
})
/** Whether a card is a pill now: folded (its “–”, ⌃⌥⌘H, or made as one), or peeking by the clock's “Tuck away”. */
const pillWanted = (key: string): boolean => stuckAs(key)?.pill === true || ruled.get(key) === 'peek'
/** The open cards on the desk: what ⌃⌥⌘H folds. */
const openCards = (): string[] => [...stickies].filter(([key, win]) => !win.isDestroyed() && stickyUp(key) && !pillWanted(key)).map(([key]) => key)
/** What ⌃⌥⌘H last folded, opened again by the next press. */
let foldedByKey: string[] = []
/** ⌃⌥⌘H: every open card folded into its pill; pressed again with none open, the ones it folded open again. */
function foldDesk(): void {
  const open = openCards()
  const back = open.length ? [] : foldedByKey
  for (const key of open) {
    const one = stuckAs(key)
    if (one) one.pill = true
  }
  for (const key of back) {
    const one = stuckAs(key)
    if (one?.pill) delete one.pill
  }
  foldedByKey = open
  keepStuck()
  for (const key of [...open, ...back]) {
    stopPeek(key)
    beaconHeld.delete(key)
  }
  applyStickies()
  updateTray()
}
/** Each card on the desk by name, with what it is now (“folded”, a pill at the edge, or “open”); chosen, it changes. */
function deskLines(): Electron.MenuItemConstructorOptions[] {
  const cards = [...stickies].filter(([key, win]) => !win.isDestroyed() && stickyUp(key))
  if (!cards.length) return []
  const goals = new Map(openGoals().map((goal) => [`goal:${goal.id}`, goal.title] as [string, string]))
  return [{ type: 'separator' }, ...cards.map(([key, win]): Electron.MenuItemConstructorOptions => {
    const name = key === 'today:today' ? 'Today' : key.startsWith('goals:') ? 'Goals' : goals.get(key) || win.webContents.getTitle() || 'A sticky note'
    const folded = peeking.has(key)
    return { label: `${cut(name, 32)}: ${folded ? 'folded' : 'open'}`, click: () => (folded ? pinCard(key, win) : foldCard(key, win)) }
  })]
}
/** The pills on the desk now in the stack's order, a card opened out of its pill keeping its place. */
function stackKeys(): string[] {
  const keys = [...stickies.keys()].filter((key) => (peeking.has(key) || fromPill.has(key)) && stickyUp(key))
  if (!keys.length) return keys
  let goals: OpenGoal[] = []
  try {
    goals = openGoals()
  } catch {
    // The book shut (a quit under way): the goals keep the order they had.
  }
  const days = new Map<string, number>(goals.map((goal) => [`goal:${goal.id}`, goal.goalAt ? daysLeft(goal.goalAt) : Infinity]))
  const rank = (key: string): number => (key.startsWith('today:') ? 0 : key.startsWith('goal:') ? 1 : key.startsWith('goals:') ? 2 : 3)
  const near = (key: string): number => days.get(key) ?? Infinity
  return keys.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? near(a) - near(b) : (stuckAs(b)?.touched ?? 0) - (stuckAs(a)?.touched ?? 0)) || a.localeCompare(b))
}
/** The most pills the stack shows: past it, the last says how many more and lists them in the app's own menu. */
const STACK_MAX = 6
/** Cards folded past the stack's last place: their windows away, listed by the last pill. */
const stackHidden = new Set<string>()
/** What each pill was last told about the cards it stands for past the stack's end (0: none, it is itself). */
const moreSaid = new Map<string, number>()
/**
 * The screen the stack stands on, and where each of its pills goes: in its column, never past the menu bar or the
 * Dock. `more`: past STACK_MAX, the cards the last pill stands for, itself first.
 */
function stackPlaces(): { area: Electron.Rectangle; at: Map<string, Electron.Rectangle>; more: string[] } {
  readStackPlace()
  const area = (screen.getAllDisplays().find((one) => one.id === stackDisplay) ?? screen.getPrimaryDisplay()).workArea
  const all = stackKeys()
  const more = all.length > STACK_MAX ? all.slice(STACK_MAX - 1) : []
  const keys = all.slice(0, STACK_MAX)
  const step = PILL_H + PILL_GAP
  const tall = keys.length * step - PILL_GAP
  const wanted = Math.max(area.y + PILL_IN, Math.min(stackTop ?? area.y + Math.round(area.height * STACK_TOP), area.y + area.height - PILL_IN - tall))
  // Never over an open card's words: the stack's band steps below any card standing in its column, where there is
  // room; with none, it stays where it was wanted.
  const widest = Math.max(PILL_MIN, ...keys.map((key) => pillWidth.get(key) ?? PILL_GUESS))
  const column = stackSide === 'right' ? { x: area.x + area.width - PILL_IN - widest, right: area.x + area.width } : { x: area.x, right: area.x + PILL_IN + widest }
  const cards = [...stickies].filter(([key, win]) => !win.isDestroyed() && win.isVisible() && !peeking.has(key) && !fromPill.has(key))
    .map(([key, win]) => cardOf(win.getBounds(), insetOf(key)))
    .filter((one) => one.x < column.right && one.x + one.width > column.x)
    .sort((a, b) => a.y - b.y)
  let top = wanted
  for (const one of cards) if (top < one.y + one.height + PILL_GAP && top + tall > one.y - PILL_GAP) top = one.y + one.height + PILL_GAP
  if (top + tall > area.y + area.height - PILL_IN) top = wanted
  const at = new Map<string, Electron.Rectangle>()
  keys.forEach((key, nth) => {
    const width = pillWidth.get(key) ?? PILL_GUESS
    const x = stackSide === 'right' ? area.x + area.width - PILL_IN - width : area.x + PILL_IN
    at.set(key, { x, y: top + nth * step, width, height: PILL_H })
  })
  return { area, at, more }
}
/** The window round a pill: the pill and its clear room. */
const pillWindow = (pill: Electron.Rectangle): Electron.Rectangle =>
  ({ x: pill.x - PILL_ROOM.side, y: pill.y - PILL_ROOM.top, width: pill.width + 2 * PILL_ROOM.side, height: PILL_H + PILL_ROOM.top + PILL_ROOM.bottom })
/** Every pill set in its place in the stack; a window already there is left alone. Past the sixth, they wait in the last. */
function layStack(): void {
  const { at, more } = stackPlaces()
  const away = new Set(more.slice(1))
  for (const key of [...stackHidden]) {
    if (away.has(key)) continue
    stackHidden.delete(key)
    const win = stickies.get(key)
    if (win && !win.isDestroyed() && stickyUp(key) && stickyReady.has(win)) win.showInactive()
  }
  for (const key of away) if (!stackHidden.has(key)) (stackHidden.add(key), stickies.get(key)?.hide())
  for (const [key, win] of stickies) {
    const count = key === more[0] ? more.length : 0
    if (win.isDestroyed() || (moreSaid.get(key) ?? 0) === count) continue
    moreSaid.set(key, count)
    win.webContents.send('pill:more', count)
  }
  for (const [key, pill] of at) {
    const win = stickies.get(key)
    if (!win || win.isDestroyed() || !peeking.has(key)) continue
    const box = pillWindow(pill)
    const now = win.getBounds()
    if (now.x === box.x && now.y === box.y && now.width === box.width && now.height === box.height) continue
    madeOver(win)
    placed.set(win, { x: box.x, y: box.y })
    win.setBounds(box)
  }
}
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
  // Quiet hours start and end by the same clock.
  applyDesk()
  const away = deskIsAway()
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
    // Away for a meeting or quiet hours, nothing peeks out: its once a day is kept for when it can be seen.
    if (!away && peeksOut(rest, rules, record.last[key], record.nudged[key], now, today)) {
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
/** A card opened from its tab, listening for the pointer to leave it; gone from it for half a second, it folds back. */
const peekWatch = new Map<string, () => void>()
/** The wait before a card the pointer has left slides back, then before it is folded even if its page never says the slide is drawn. */
const peekWait = new Map<string, ReturnType<typeof setTimeout>>()
const inside = (p: Electron.Point, b: Electron.Rectangle): boolean => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
/**
 * Whether the pointer is on a sticky's window, as its page last said from its own pointer events (sticky:pointer),
 * sent only as the pointer comes and goes. A menu of the card's own open counts as on it; put away, where the pointer
 * is then is asked once, since the card's page heard nothing while the menu window was over it.
 */
const pointerOn = new WeakMap<BrowserWindow, boolean>()
const pointerHeard = new WeakMap<BrowserWindow, Set<() => void>>()
const onCard = (win: BrowserWindow): boolean => menuOpenFor(win) || pointerOn.get(win) === true
const hearPointer = (win: BrowserWindow, listen: () => void): (() => void) => {
  const all = pointerHeard.get(win) ?? new Set()
  pointerHeard.set(win, all.add(listen))
  return () => void all.delete(listen)
}
const pointerSaid = (win: BrowserWindow, on: boolean): void => {
  pointerOn.set(win, on)
  for (const listen of [...(pointerHeard.get(win) ?? [])]) listen()
}
ipcMain.on('sticky:pointer', (event, on: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) pointerSaid(win, on === true)
})
onMenuShut((owner) => {
  if (!pointerHeard.get(owner)?.size) return
  pointerSaid(owner, !process.env.HALIGTREE_QA_AWAY && inside(screen.getCursorScreenPoint(), owner.getBounds()))
})
/**
 * A card's window as its pill in the stack, or as its whole card, as the card is (folded or pinned), as the clock says
 * and as the pointer allows. `lay`: the stack laid again now (applyStickies lays it once for every card).
 */
function shapeCard(key: string, win: BrowserWindow, lay = true): void {
  if (win.isDestroyed()) return
  const want = stickyUp(key) && pillWanted(key) && !beaconHeld.has(key)
  if (want) {
    if (!peeking.has(key)) {
      madeOver(win)
      // Its whole card's place is kept while it is a pill: a card opened out of its pill keeps the one it had.
      peeking.set(key, openedAt.get(key) ?? win.getBounds())
      openedAt.delete(key)
      fromPill.delete(key)
      stopPeek(key)
      const peek: Peek = { side: stackSide, nudge: nudging.delete(key) }
      peekSaid.set(key, peek)
      win.webContents.send('beacon:peek', peek, byKey)
      // A pill has its own lift, drawn in its page; the clear room round it lets clicks through.
      if (builtGlass.get(key)) (win.setHasShadow(false), passThrough(win, true))
      win.setMinimumSize(1, 1)
    }
    if (lay) layStack()
    return
  }
  if (!peeking.has(key)) return
  madeOver(win)
  const rest = peeking.get(key)!
  peeking.delete(key)
  const pill = win.getBounds()
  if (!beaconHeld.has(key)) {
    // Opened by your hand (pinned, ⌃⌥⌘H) or by the clock: its whole card at its own place, at once.
    showCard(key, win, rest)
    if (lay) layStack()
    return
  }
  // Pointed at, the card opens out of its pill beside the stack, level with it, in the card's own size. The window
  // takes in the pill's column too: the card grows out of the pill (drawn by its page), the pill stays lit in its
  // place, and the stack does not move.
  const { area, at } = stackPlaces()
  const inset = insetOf(key)
  const right = stackSide === 'right'
  const widest = Math.max(PILL_MIN, pill.width - 2 * PILL_ROOM.side, ...[...at.values()].map((one) => one.width))
  const inner = right ? area.x + area.width - PILL_IN - widest - PILL_IN : area.x + PILL_IN + widest + PILL_IN
  const cardWidth = rest.width - inset.left - inset.right
  // Its window's top level with the pill's (so the pill stands at the same point of both windows), unless the screen's foot is nearer.
  const top = Math.max(area.y, Math.min(pill.y, area.y + area.height - rest.height + inset.bottom))
  const card = { x: (right ? inner - cardWidth : inner) - inset.left, y: top, width: rest.width, height: rest.height }
  const x = right ? card.x : pill.x
  const box = { x, y: card.y, width: (right ? pill.x + pill.width : card.x + card.width) - x, height: Math.max(card.height, pill.y + pill.height - card.y) }
  openedAt.set(key, rest)
  fromPill.set(key, card)
  const peek: Peek = { side: stackSide, nudge: false, opened: { pill: { x: pill.x + PILL_ROOM.side - box.x, y: pill.y + PILL_ROOM.top - box.y, width: pill.width - 2 * PILL_ROOM.side, height: PILL_H }, card: card.width, size: { width: box.width, height: box.height } } }
  peekSaid.set(key, peek)
  win.webContents.send('beacon:peek', peek, byKey)
  win.setMaximumSize(4000, 4000)
  placed.set(win, { x: box.x, y: box.y })
  win.setBounds(box)
  stopPeek(key)
  // Gone from it for half a second, the card is told to fold back into its pill (one motion, drawn by its page), and
  // made the pill again only once that is drawn (beacon:folded). The pointer back on it midway: it opens out again.
  // Heard from the window's own pointer events as they happen, never by asking where the pointer is.
  const heard = (): void => {
    if (win.isDestroyed() || !fromPill.has(key) || !beaconHeld.has(key)) return stopPeek(key)
    clearTimeout(peekWait.get(key))
    peekWait.delete(key)
    if (onCard(win)) return void (folding.delete(key) && win.webContents.send('beacon:fold', false))
    if (folding.has(key)) return
    peekWait.set(key, setTimeout(() => {
      if (win.isDestroyed() || !fromPill.has(key) || !beaconHeld.has(key)) return stopPeek(key)
      if (onCard(win)) return
      folding.add(key)
      win.webContents.send('beacon:fold', true)
      // A page that never says (hung, or reloading) still folds, a second and a half later.
      peekWait.set(key, setTimeout(() => folding.has(key) && foldBack(key, win), 1500))
    }, 500))
  }
  peekWatch.set(key, hearPointer(win, heard))
  // Left before it came out (a fast pass over the pill): it goes back as it would have.
  heard()
}
/** A card made whole again in a window of its own at `at`: no pill, its own limits, its shadow and its clicks as made. */
function showCard(key: string, win: BrowserWindow, at: Electron.Rectangle): void {
  madeOver(win)
  stackHidden.delete(key)
  openedAt.delete(key)
  fromPill.delete(key)
  stopPeek(key)
  peekSaid.delete(key)
  win.webContents.send('beacon:peek', null, byKey)
  if (builtGlass.get(key)) (win.setHasShadow(true), passThrough(win, false))
  win.setMinimumSize(214, 124)
  win.setMaximumSize(486, 526)
  placed.set(win, { x: at.x, y: at.y })
  win.setBounds(at)
}
/**
 * Pinned (a click on its pill or on the card it opened, or carried away from the stack): the card stays open where it
 * opened, beside the stack, and is yours to carry anywhere, as any sticky is. Its place is kept from now on.
 */
function pinCard(key: string, win: BrowserWindow): void {
  const one = stuckAs(key)
  if (!one || win.isDestroyed()) return
  // Clicked as a pill before it opened: it opens beside the stack, at once, and stays.
  if (peeking.has(key)) (beaconHeld.add(key), shapeCard(key, win, false))
  const card = fromPill.get(key)
  delete one.pill
  one.touched = Date.now()
  beaconHeld.delete(key)
  if (card) {
    showCard(key, win, card)
    one.bounds = cardFrame(key, win)
    // Chosen from the last pill's list, it was away: out now.
    if (!win.isVisible() && stickyUp(key)) win.showInactive()
  }
  keepStuck()
  layStack()
  tellStickiesOut()
  updateTray()
}
/** Its “–”: folded into its pill in the stack, its card's place kept for when it opens again. */
function foldCard(key: string, win: BrowserWindow): void {
  const one = stuckAs(key)
  if (!one || win.isDestroyed()) return
  one.pill = true
  one.touched = Date.now()
  keepStuck()
  stopPeek(key)
  beaconHeld.delete(key)
  shapeCard(key, win)
  tellStickiesOut()
  updateTray()
}
function stopPeek(key: string): void {
  peekWatch.get(key)?.()
  peekWatch.delete(key)
  clearTimeout(peekWait.get(key))
  peekWait.delete(key)
  folding.delete(key)
}
/** Cards folding back into their pill, waiting for their page to say the fold is drawn. */
const folding = new Set<string>()
ipcMain.on('beacon:folded', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const key = keyOfSticky(win)
  if (win && key && folding.has(key)) foldBack(key, win)
})
function foldBack(key: string, win: BrowserWindow): void {
  stopPeek(key)
  beaconHeld.delete(key)
  shapeCard(key, win)
}
/** A pill's words measured by its page: its width in the stack (PILL_MIN to PILL_MAX). */
ipcMain.on('sticky:pill-width', (event, width: unknown) => {
  const key = keyOfSticky(BrowserWindow.fromWebContents(event.sender))
  if (!key || typeof width !== 'number' || !Number.isFinite(width)) return
  const fit = Math.round(Math.max(PILL_MIN, Math.min(PILL_MAX, width)))
  if (pillWidth.get(key) === fit) return
  pillWidth.set(key, fit)
  layStack()
})
/**
 * A card folded or pinned by a page of the main window (the welcome's goal card), by its key. Asked before its card
 * is made (the goal is still being saved), or made again (Undo, then Redo), the card is made as asked.
 */
const pillWish = new Map<string, boolean>()
/** Stuck by hand from a page a moment ago and not made yet: made open. */
const handStuck = new Set<string>()
ipcMain.on('desk:pill', (_event, key: unknown, on: unknown) => {
  pillWish.set(String(key), on === true)
  const win = stickies.get(String(key))
  if (!win || win.isDestroyed()) return
  if (on === true) foldCard(String(key), win)
  else pinCard(String(key), win)
})
/** The stack's last pill, past six: the cards it stands for, in the app's own menu at the pill; one chosen opens and stays. */
ipcMain.on('sticky:more', (event, x: unknown, y: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const goals = new Map(openGoals().map((goal) => [`goal:${goal.id}`, goal.title] as [string, string]))
  const lines: PopupLine[] = stackPlaces().more.flatMap((key) => {
    const card = stickies.get(key)
    if (!card || card.isDestroyed()) return []
    const name = key === 'today:today' ? 'Today' : key.startsWith('goals:') ? 'Goals' : goals.get(key) || card.webContents.getTitle() || 'A sticky note'
    return [{ label: `Open “${cut(name, 40)}”`, run: () => pinCard(key, card) }]
  })
  const at = win.getBounds()
  void popupMenu(win, { x: at.x + (Number(x) || 0), y: at.y + (Number(y) || 0) }, lines, load).then((path) => path && lineAt(lines, path)?.())
})
/** A click on a pill or on the card it opened pins it; the card's “–” folds it back into its pill. */
ipcMain.on('sticky:pin', (event, on: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const key = keyOfSticky(win)
  if (!win || !key) return
  if (on === false) foldCard(key, win)
  else pinCard(key, win)
})

/**
 * Where a new sticky goes when it has no place of its own: down the right of
 * the screen, under the ones already there with a small gap, then the next
 * column to the left when a column is full. Never on top of another.
 */
function freeSpot(area: Electron.Rectangle, width: number, height: number, inset: Inset): Electron.Rectangle {
  const gap = 16
  // Cards apart and on screen, not windows: a paper card's clear room may overlap a neighbour's and hang past the edge.
  // A pill is no card: the stack's whole band is taken instead, from its first pill to its last, so a new card is
  // never laid over the pills.
  const taken = [...stickies].filter(([key, win]) => !win.isDestroyed() && !peeking.has(key) && !fromPill.has(key)).map(([key, win]) => cardOf(win.getBounds(), insetOf(key)))
  const band = [...stackPlaces().at.values()]
  if (band.length) {
    const x = Math.min(...band.map((one) => one.x))
    const y = band[0].y
    taken.push({ x, y, width: Math.max(...band.map((one) => one.x + one.width)) - x, height: band.at(-1)!.y + PILL_H - y })
  }
  const card = cardOf({ x: 0, y: 0, width, height }, inset)
  const clear = (spot: Electron.Rectangle): boolean =>
    taken.every((one) => spot.x + spot.width + gap <= one.x || one.x + one.width + gap <= spot.x || spot.y + spot.height + gap <= one.y || one.y + one.height + gap <= spot.y)
  const windowAt = (x: number, y: number): Electron.Rectangle => ({ x: x - inset.left, y: y - inset.top, width, height })
  // Columns lined up on their right edges, as the Mac's notifications are: the next column starts left of the
  // cards already in this one, whatever their widths.
  for (let right = area.x + area.width - gap; right - card.width >= area.x;) {
    const x = right - card.width
    for (let y = area.y + gap; y + card.height <= area.y + area.height; y += 8) {
      if (clear({ x, y, width: card.width, height: card.height })) return windowAt(x, y)
    }
    const inColumn = taken.filter((one) => one.x < right && one.x + one.width > x)
    right = Math.min(x, ...inColumn.map((one) => one.x)) - gap
  }
  return windowAt(area.x + area.width - card.width - gap, area.y + gap)
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
    // The card fanned from the top right; its window's clear room round it may hang past the edge.
    const inset = insetOf(key)
    const { width, height } = cardOf(win.getBounds(), inset)
    const card = onScreen({ width, height, x: workArea.x + workArea.width - width - (n % 2) * 24, y: workArea.y + n * 64 })
    const bounds = { x: card.x - inset.left, y: card.y - inset.top }
    n += 1
    if (win.isVisible()) {
      moves.push([key, win, { x: bounds.x, y: bounds.y }])
      continue
    }
    placed.set(win, { x: bounds.x, y: bounds.y })
    win.setPosition(bounds.x, bounds.y)
    const one = stuckAs(key)
    if (one) one.bounds = cardFrame(key, win)
    arriveSticky(win)
  }
  keepStuck()
  moveStickies(moves)
}

/** Stickies Haligtree is moving now, and those your hand has picked up: a move of either is never taken for the other. */
const moving = new WeakSet<BrowserWindow>()
const held = new WeakSet<BrowserWindow>()
/** A sticky's lift on hover, called off when your hand picks it up. */
const unlift = new WeakMap<BrowserWindow, () => number>()
/**
 * How many times each sticky's window was made over (a card folded into its pill, opened out of it, laid in the stack):
 * a glide started before (a lift and its settling) stops there, so it never carries a pill back to where its card stood.
 */
const reshaped = new WeakMap<BrowserWindow, number>()
/** A window made over by shapeCard and the stack: any lift called off and any glide under way stopped. */
const madeOver = (win: BrowserWindow): void => {
  unlift.get(win)?.()
  reshaped.set(win, (reshaped.get(win) ?? 0) + 1)
}

/**
 * Move a sticky's window along a path, a step every display frame on the one
 * clock all glides share (sticky-place.ts), so several move together without
 * stutter; it stops if your hand takes it on the way.
 */
function glide(win: BrowserWindow, ms: number, at: (t: number) => { x: number; y: number }, done?: () => void): void {
  moving.add(win)
  const shape = reshaped.get(win)
  tween(ms, (t) => {
    if (win.isDestroyed() || held.has(win) || (placed.has(win) && !ours(win)) || reshaped.get(win) !== shape) return (moving.delete(win), false)
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
      if (one) (one.bounds = cardFrame(key, win)), keepStuck()
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
    // Measured by the cards, not their windows: a paper card's clear room round it may overlap its neighbour's and hang past the edge.
    const sizes = wins.map(([key, win]) => cardOf(win.getBounds(), insetOf(key)))
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
      const { width, height } = sizes[nth]
      const { left, top: above } = insetOf(key)
      const right = area.x + area.width - MARGIN - width - (fan && nth % 2 ? 16 : 0)
      const was = win.getBounds()
      back.push([key, win, { x: was.x, y: was.y }])
      moves.push([key, win, { x: right - left, y: y - above }])
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

/** The box at the top middle or the middle of a screen, placed by its full height, so its top is the same however tall it opens. */
function opensAt(place: 'top' | 'centre', area: Electron.Rectangle, width: number, height: number): Electron.Rectangle {
  const full = SIZES.compact.height
  const { x, y } = place === 'top' ? topMiddle(area, width, full) : { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - full) / 2) }
  return { x, y, width, height }
}

/**
 * Quick capture's home, as Raycast's window has its own (the place it opens by default, which its guides mark and a
 * drag back near snaps to): where Settings opens it, the middle of its screen if that is “the middle”, else the top
 * middle, where it first opens. On the screen `box` is on, at its size: what its guides mark while it is carried and
 * where it settles carried near, and where a double-click on its grabber sends it.
 */
const boxHome = (box: Electron.Rectangle): Electron.Rectangle =>
  onScreen(opensAt(boxPlacement().place === 'centre' ? 'centre' : 'top', screen.getDisplayMatching(box).workArea, box.width, box.height))

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
    writeWholeSync(spotsFile(), JSON.stringify(Object.fromEntries(thrownSpots())))
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
  const from = win.getBounds()
  const display = screen.getDisplayMatching(from)
  const to = throwSpot(from, display.workArea, dx, dy)
  // A small window (the same page, App.tsx's ⌘ and two fingers) is thrown the same way, on the glide that steps it
  // aside; only quick capture remembers where it was thrown, for the next time it opens.
  if (win !== prompt) {
    stopAside(win)
    const stop = glideTo(win, to, () => asides.delete(win), speed)
    if (stop) asides.set(win, stop)
    return
  }
  throwing?.()
  const land = (): void => {
    throwing = null
    lastBounds = { ...from, x: to.x, y: to.y }
    anchor = { y: to.y, became: to.y }
    keepSpot(display.id, to)
    if (!app.isPackaged) console.log(`[haligtree] box thrown to ${to.x},${to.y} on screen ${display.id}`)
  }
  throwing = glideTo(win, to, land, speed)
}
/**
 * One window gliding, whole, to a place: the one clock for everything of Haligtree's that moves out of the way
 * (quick capture thrown or stepping aside, the session bubble and the corner's cards stepping aside). One curve from
 * start to end on the display's own frames, easing out, never past and back: 300 ms and a little more for a long
 * way, 520 at most, or a flick's own speed (`speed`, px a ms). At once with Motion off or Reduce motion. Gives back
 * the way to stop it part way; null when it is there already.
 */
function glideTo(win: BrowserWindow, to: { x: number; y: number }, land: () => void, speed = 0): (() => void) | null {
  const from = win.getBounds()
  const far = Math.hypot(to.x - from.x, to.y - from.y)
  if (stillness() || far < 1) return (win.setPosition(to.x, to.y), land(), null)
  // An ease-out sine leaves at pi/2 times the average speed: matched to the fingers' when flicked.
  const ms = Math.round(speed > 0 ? Math.max(120, Math.min(560, ((Math.PI / 2) * far) / speed)) : Math.min(520, 300 + far * 0.12))
  // A frame in already: the first step comes at once, a frame's worth, so the fingers' last move flows straight on.
  const lead = 1000 / 60 / ms
  return tween(ms, (t) => {
    if (win.isDestroyed()) return false
    const k = Math.sin((Math.min(1, t + lead) * Math.PI) / 2)
    win.setPosition(Math.round(from.x + (to.x - from.x) * k), Math.round(from.y + (to.y - from.y) * k))
    return true
  }, () => (!win.isDestroyed() && win.setPosition(to.x, to.y), land()))
}

/**
 * Kept open, and you click or switch to something under it or close by: the window glides, whole, to the corner of its
 * screen furthest from the pointer, so what you went to use is free (10 Nov). Quick capture with "Close when you click
 * away" off, and a small window with its "Steps aside" on (small-window.ts): `may` says whether it is on. The Mac tells a
 * window where the pointer is, not where another app's clicks or keys land, so this is the moment it can act on.
 */
const asides = new WeakMap<BrowserWindow, () => void>()
/** That glide stopped where it is, and forgotten: left in the map, no step aside started again. */
const stopAside = (win: BrowserWindow): void => void (asides.get(win)?.(), asides.delete(win))
function stepAside(win: BrowserWindow, may: () => boolean): void {
  setImmediate(() => {
    // Not while it is already on its way (the box thrown, a small window stepping aside).
    if (win.isDestroyed() || !win.isVisible() || win.isFocused() || !may() || dialogs || (win === prompt ? throwing : asides.has(win))) return
    if (process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_STEPASIDE) return
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && focused.getParentWindow() === win) return
    const at = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const near = 48
    if (at.x < b.x - near || at.x > b.x + b.width + near || at.y < b.y - near || at.y > b.y + b.height + near) return
    const area = screen.getDisplayMatching(b).workArea
    const ways = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => {
      const to = throwSpot(b, area, dx, dy)
      return { dx, dy, far: Math.hypot(to.x + b.width / 2 - at.x, to.y + b.height / 2 - at.y) }
    })
    const best = ways.reduce((a, w) => (w.far > a.far ? w : a))
    // The box keeps where it was thrown for its next opening (throwBox); any other window simply goes there.
    if (win === prompt) return throwBox(win, best.dx, best.dy)
    const stop = glideTo(win, throwSpot(b, area, best.dx, best.dy), () => asides.delete(win))
    if (stop) asides.set(win, stop)
  })
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
  const put = (at: Electron.Rectangle): { place: Electron.Rectangle; top: number } => ({ place: onScreen({ ...at, width, height }), top: at.y })
  // While the welcome runs, over the welcome's own picture of the box, under the step's words: never on top of them.
  const welcomeSpot = welcomeBoxSpot()
  if (welcomeSpot && home && !home.isDestroyed() && home.isVisible()) {
    // Its page fills the window to the top (hiddenInset).
    const content = home.getBounds()
    const zoom = home.webContents.getZoomFactor()
    return put({ width, height, x: Math.round(content.x + (welcomeSpot.x + welcomeSpot.width / 2) * zoom - width / 2), y: Math.round(content.y + welcomeSpot.y * zoom) })
  }
  if (place !== 'last') return put(opensAt(place, area, width, height))
  if (sameBox(area, was)) return put(left)
  // Thrown to a place on this screen before: back there.
  const spot = thrownSpots().get(screen.getDisplayMatching(area).id)
  if (spot) return put({ width, height, x: spot.x, y: spot.y })
  const along = (at: number, from: number, span: number, size: number, to: number, room: number): number =>
    Math.round(to + ((at - from) / Math.max(1, span - size)) * Math.max(0, room - size))
  return put({ width, height, x: along(left.x, was.x, was.width, width, area.x, area.width), y: along(left.y, was.y, was.height, SIZES.compact.height, area.y, area.height) })
}

function createWindow(): void {
  reached('box')
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
    // No window buttons at all: AeroSpace leaves a window with no close button
    // alone ("not even a real window") when its app is a menu bar app at the
    // moment it first sees it, which the box is while summoned from another app
    // (boxUp). Seen first over Haligtree's own window, an ordinary app's, it is
    // filed under that workspace instead, and moved to yours before each showing
    // (boxFiled, boxToWorkspaceHere). Either way it turns up where you are.
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
    // See-through and larger than the card it draws (overhang, below): the page
    // paints the card, its surface, corners and shadow, and its menus may hang
    // past the card's edge into the clear room round it. macOS's own frost and
    // shadow would fill the whole window, room and all, so neither is used.
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: '#00000000',

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
  // From here every size and place is the card's; the window keeps BOX_ROOM round it, clicks passing through there.
  const first = mainWindow.getBounds()
  // Made with the room its first open will want for a hint (roomForHint), not BOX_ROOM: given it at that open, the
  // window grew 592px while away and the Mac showed the page's last picture at the old size for a frame, the card
  // off to the left, then jumping to the middle (qa/box-first-place.mjs). Opened where it was made, nothing changes.
  const start = hintRoom(first, screen.getDisplayMatching(first).workArea, BOX_ROOM, boxOneLine() && !isWelcoming())
  hintSide = start.side
  hintBelow = start.room.bottom
  overhang(mainWindow, start.room)
  // Its page reads the room from its environment as it loads (roomInEnv): there before the page is.
  roomInEnv()
  mainWindow.setBounds(first)
  // Moved while a size glide is under way (dragged by hand, or put somewhere by main): the glide stops, landing its
  // size where the box is now. Left going, its target kept the old place, and putting the box away landed it there
  // (hideWindow settles a pending glide): it came back where it was before the drag (qa/box-move-glide.mjs).
  const card = mainWindow
  const dropGlide = (): void => {
    if (pending?.win !== card) return
    arriving?.()
    arriving = undefined
    const now = card.getBounds()
    pending = { win: card, bounds: { ...pending.bounds, x: now.x, y: now.y } }
    settle()
  }
  card.on('will-move', dropGlide)
  const placeAt = card.setPosition.bind(card)
  card.setPosition = (x: number, y: number, animate?: boolean) => (dropGlide(), placeAt(x, y, animate))
  passThrough(mainWindow, true)

  // the ready-to-show event on the BrowserWindow class will be emitted when the renderer process has rendered the page for the first time if the window has not been shown yet.
  // Showing the window after this event will have no visual flash:
  // Like Raycast: the app starts in the background, ready, and the box shows
  // only when summoned (the shortcut or the menu bar). A test run, which
  // drives the window directly, still gets it on screen.
  // Clicked away from, the box puts itself away, as Raycast's does. Not for
  // a window of its own (a picture it opened) or a dialog it asked for, and
  // not in a test run, whose box sits parked while another window is driven.
  // Told by where the focus went, not by a wait: another app came to the front
  // (the app resigned), or another of Haligtree's windows took the keys.
  const box = mainWindow
  const boxMayGo = (): boolean =>
    boxAutoHide() && dialogs === 0 && !(process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_AUTOHIDE) &&
    !box.isDestroyed() && box.isVisible() && !box.isFocused() && !box.webContents.isDevToolsFocused()
  const toOtherApp = (): void => void (boxMayGo() && hideWindow(box))
  const toOtherWindow = (_e: Electron.Event, win: BrowserWindow): void => {
    if (win !== box && win.getParentWindow() !== box && boxMayGo()) hideWindow(box)
  }
  // Off macOS there is no "resigned": a blur with none of the app's windows focused is the same thing.
  const blurred = (): void => void (!BrowserWindow.getFocusedWindow() && toOtherApp())
  app.on('did-resign-active', toOtherApp)
  app.on('browser-window-focus', toOtherWindow)
  if (process.platform !== 'darwin') mainWindow.on('blur', blurred)
  // Kept open (auto-hide off) and you click or switch to something under it or close by: it glides, whole, to the
  // corner of its screen furthest from the pointer, so what you went to use is free (10 Nov). The Mac tells a window
  // where the pointer is, not where another app's clicks or keys land, so this is the moment it can act on.
  mainWindow.on('blur', () => stepAside(box, () => !boxAutoHide()))
  mainWindow.once('closed', () => {
    // Forgotten as it goes, so ⌘. makes a new box rather than reaching for one already destroyed ("Object has been destroyed", 20 Nov).
    if (prompt === mainWindow) (prompt = null), (promptPainted = false)
    app.off('did-resign-active', toOtherApp)
    app.off('browser-window-focus', toOtherWindow)
  })
  mainWindow.on('ready-to-show', () => {
    // HALIGTREE_QA_COLD: a test run's box waits for ⌘. as a person's does, for a probe of the first open (qa/box-first-place.mjs).
    if (!process.env.HALIGTREE_USER_DATA || process.env.HALIGTREE_QA_COLD) return
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

  // Gone while up (not put away): back in the Dock all the same.
  mainWindow.on('closed', () => quitting || boxUp(false))

  guard(mainWindow)
  load(mainWindow)
}

// Web requests say they come from plain Chrome: the app's name and Electron/x come
// off the browser line, since sites often send a stripped page (or none) to a name
// they do not know, and link previews fetch with it. Set before the app is ready.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/[\d.]+/, '')
  .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '')
setOutsideAgent(app.userAgentFallback)

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
// Every panel (quick capture, the stickies, the cards) takes the keys and clicks while the app you were in stays the
// front app, so AeroSpace never follows Haligtree to the main window's workspace (glass.ts nonActivating). Ordinary
// windows are left as they are. What took, by window, for the probes (qa/box-stays-behind.mjs).
const behind = new Map<number, boolean>()
;(globalThis as { haligtreeBehind?: Map<number, boolean> }).haligtreeBehind = behind
app.on('browser-window-created', (_, win) => {
  const id = win.id
  behind.set(id, nonActivating(win))
  win.once('closed', () => behind.delete(id))
})
// Test runs only: every window sits past the screen's right edge, unseen,
// unclickable and never focused, so a run never lands on top of anyone's work.
if (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_AWAY) {
  const away = (win: BrowserWindow): void => {
    const { bounds } = screen.getPrimaryDisplay()
    // The window's own size, not a card's inside it (overhang).
    const [width, height] = proto.getSize.call(win)
    setBounds.call(win, { x: bounds.x + bounds.width - 6, y: bounds.y + 40, width, height })
    // Where the screen will not let it go past the edge, unseen and unclickable all the same.
    win.setOpacity(0)
    win.setIgnoreMouseEvents(true)
  }
  const proto = BrowserWindow.prototype
  const setBounds = proto.setBounds
  // HALIGTREE_QA_ONSCREEN: windows stay where the app puts them, seen, for a probe that must watch real windows
  // (qa/sticky-paper-onscreen.mjs); still silent, unfocused and dialog-free.
  const onscreen = !!process.env.HALIGTREE_QA_ONSCREEN
  if (!onscreen) {
  proto.show = function (this: BrowserWindow) { away(this); this.showInactive() }
  proto.focus = function () {}
  // Where it was asked to be is kept for the checks to read too (qa/welcome-intro.mjs).
  const asked = (win: BrowserWindow, next: Partial<Electron.Rectangle>): void => {
    const kept = win as { qaBounds?: Partial<Electron.Rectangle>; qaBoundsSeen?: Partial<Electron.Rectangle>[] }
    kept.qaBounds = { ...kept.qaBounds, ...next }
    ;(kept.qaBoundsSeen ??= []).push(kept.qaBounds)
  }
  // Its size taken, never its place, not even for a moment. Set where it was asked and parked after, a window was
  // seen on the screen by a tiling window manager (AeroSpace), which took it into the person's own workspace and
  // kept it in a tile for two minutes, their windows made room for it (14 Nov, a welcome probe asking for the whole
  // screen).
  const resize = (win: BrowserWindow, next: Partial<Electron.Rectangle>): void => {
    if (next.width === undefined && next.height === undefined) return
    // Where it is parked (the window's own place, never the one a check keeps for it), at the size it was asked for.
    const [x, y] = proto.getPosition.call(win)
    const [width, height] = proto.getSize.call(win)
    setBounds.call(win, { x, y, width: next.width ?? width, height: next.height ?? height })
  }
  proto.setBounds = function (this: BrowserWindow, next: Partial<Electron.Rectangle>) { asked(this, next); resize(this, next); away(this) }
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
    // Where a window stands when not filling its screen, as the app keeps it before the welcome (placeForWelcome):
    // its own place too, never where it is parked (a test window is never really maximised).
    proto.getNormalBounds = function (this: BrowserWindow) { return this.getBounds() }
    proto.setBounds = function (this: BrowserWindow, next: Partial<Electron.Rectangle>) { asked(this, next); virtual.set(this, { ...this.getBounds(), ...next }); resize(this, next); away(this) }
    // Parked already: only the place it keeps as its own moves.
    proto.setPosition = function (this: BrowserWindow, x: number, y: number) { virtual.set(this, { ...this.getBounds(), x, y }) }
    app.on('browser-window-created', (_, win) => virtual.set(win, getBounds.call(win)))
  }
  app.on('browser-window-created', (_, win) => away(win))
  // Shown and hidden are what the app did, never what the Mac can see. Electron says 'show' and 'hide' as macOS
  // reports a window visible or covered: with the screen locked (12 Nov, 20:30 to 21:13, the screen saver after an
  // hour idle) no 'show' ever came, so whatever waited for one waited for good (a sticky made again as glass kept
  // its old window beside the new: two cards for one goal; the main window's own "shown" was never noted) and three
  // checks failed on every build until the screen was unlocked. In a test run a window says 'show' once when the app
  // shows it and 'hide' once when the app hides it, a turn later as the Mac's own word comes; what the Mac says of
  // either is dropped, so a run reads the same with the screen locked, covered or in view.
  const up = new WeakSet<BrowserWindow>()
  const emit = proto.emit as (this: BrowserWindow, name: string | symbol, ...args: unknown[]) => boolean
  ;(proto as { emit: typeof emit }).emit = function (this: BrowserWindow, name: string | symbol, ...args: unknown[]) {
    return name === 'show' || name === 'hide' ? false : emit.call(this, name, ...args)
  }
  const say = (win: BrowserWindow, name: 'show' | 'hide'): void => {
    if ((name === 'show') === up.has(win)) return
    if (name === 'show') up.add(win)
    else up.delete(win)
    setImmediate(() => win.isDestroyed() || emit.call(win, name))
  }
  // Made already showing (no show() of its own): said once it exists, so its listeners are on by then.
  const isVisible = proto.isVisible
  app.on('browser-window-created', (_, win) => setImmediate(() => !win.isDestroyed() && isVisible.call(win) && say(win, 'show')))
  // Shown without show(), parked all the same: the pill, the glow and the stickies call showInactive themselves.
  const showInactive = proto.showInactive
  proto.showInactive = function (this: BrowserWindow) { away(this); showInactive.call(this); say(this, 'show') }
  proto.show = function (this: BrowserWindow) { away(this); showInactive.call(this); say(this, 'show') }
  const hide = proto.hide
  proto.hide = function (this: BrowserWindow) { hide.call(this); say(this, 'hide') }
  // Full screen is a Space of its own, past any parking: only what was asked is kept, for the checks to read.
  const full = new WeakMap<BrowserWindow, boolean>()
  proto.setFullScreen = function (this: BrowserWindow, on: boolean) { if (full.get(this) === on) return; full.set(this, on); this.emit(on ? 'enter-full-screen' : 'leave-full-screen') }
  proto.isFullScreen = function (this: BrowserWindow) { return full.get(this) ?? false }
  proto.setSimpleFullScreen = function () {}
  proto.setKiosk = function () {}
  // A screen plugged in or taken out puts windows back on a screen: parked again at once.
  const repark = (): void => BrowserWindow.getAllWindows().forEach((win) => !win.isDestroyed() && away(win))
  app.whenReady().then(() => { screen.on('display-added', repark); screen.on('display-removed', repark); screen.on('display-metrics-changed', repark) })
  } else proto.show = function (this: BrowserWindow) { this.showInactive() }
  // Never in the Dock or the ⌘Tab list, never brought forward: a change of policy made the run the front app,
  // taking the keys from whoever was typing. What was asked is kept for the checks to read.
  if (process.platform === 'darwin') app.setActivationPolicy('accessory')
  const asked = globalThis as { qaPolicy?: string }
  asked.qaPolicy = 'regular'
  app.setActivationPolicy = (policy) => void (asked.qaPolicy = policy)
  if (app.dock) app.dock.isVisible = () => asked.qaPolicy === 'regular'
  // Never the Mac's own keys: a run that took ⌘. took it from the Haligtree in use. The chords are still run by
  // the checks (globalThis.haligtreeChords).
  const keysHeld = new Set<string>()
  globalShortcut.register = (accelerator) => (keysHeld.add(accelerator), true)
  globalShortcut.registerAll = (accelerators) => accelerators.forEach((one) => keysHeld.add(one))
  globalShortcut.isRegistered = (accelerator) => keysHeld.has(accelerator)
  globalShortcut.unregister = (accelerator) => void keysHeld.delete(accelerator)
  globalShortcut.unregisterAll = () => keysHeld.clear()
  app.focus = () => {}
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
  const files = argv.slice(1).filter(isFinderFile)
  if (text) captureText(text)
  else if (files.length) files.forEach(fromFinder)
  else toggleWindow()
})

/**
 * A Markdown file or a PDF opened with Haligtree from Finder ("Open With", a
 * double-click once it is the default, or dropped on the Dock icon). A PDF
 * opens in the reader, kept in a note named after it; Markdown comes in as
 * one page in Writing named after its file. Either opened again is the same one, never
 * a second copy. Asked before the app is ready (it was opened by the file),
 * they wait for it here.
 */
const isFinderFile = (path: string): boolean => /\.(md|markdown|pdf)$/i.test(path)
const finderFiles: string[] = []
let openFinderFile: ((path: string) => Promise<void>) | null = null
function fromFinder(path: string): void {
  if (!isFinderFile(path)) return
  if (openFinderFile) void openFinderFile(path)
  else finderFiles.push(path)
}
app.on('open-file', (event, path) => {
  event.preventDefault()
  fromFinder(path)
})
// Windows and Linux hand the file to a first launch as an argument.
if (process.platform !== 'darwin') process.argv.slice(1).filter(isFinderFile).forEach(fromFinder)

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
  if (stopping) return
  const signal = (stopping = new AbortController()).signal
  setImporting(true)
  try {
    // A test run's vault comes in as if every folder were chosen, as the chooser would offer them.
    const every = given !== undefined && (await stat(join(root, '.obsidian')).then((one) => one.isDirectory(), () => false))
    await busy(async () => bringVault(root, given !== undefined, every ? { folders: (await vaultFolders(root)).map((one) => one.id), signal } : undefined, signal))
  } finally {
    stopping = null
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
function importProgress(at: { done: number; total: number; what: 'notes' | 'opening' | 'pictures' | 'cards' | 'files'; /** It can be stopped from the chip. */ stop?: boolean } | null): void {
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

/** The import under way, stopped from its chip: Apple Notes, a vault (chosen folders or the whole folder), or files and Anki decks. */
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
      const groups = fileIntoGroups([...got.byFolder].map(([id, ids]) => ({ path: [names.get(id) ?? 'Notes'], ids })), undefined, 'Apple Notes')
      if (got.denied && !got.made.length) return inHome('haligtree:import-folders', { from: 'Apple Notes', refused: 'denied' })
      inHome('haligtree:import-done', {
        from: 'Apple Notes',
        folder: groups.length ? importFolder('Apple Notes') : null,
        made: got.made.length,
        writing: got.made.length,
        pictures: got.pictures,
        notes: [
          filedSaid(groups, got.made.length),
          got.stopped ? 'Stopped before the end: bring the same folders in again to carry on. Notes already here are skipped.' : '',
          got.already ? `${plural(got.already, 'was', 'were')} already here, from an earlier import, and ${got.already === 1 ? 'was' : 'were'} left as ${got.already === 1 ? 'it was' : 'they were'}.` : '',
          got.locked ? `${num(got.locked)} locked ${got.locked === 1 ? 'note was' : 'notes were'} left in Notes: unlock ${got.locked === 1 ? 'it' : 'them'} there to bring ${got.locked === 1 ? 'it' : 'them'} in.` : '',
          got.missing ? `${plural(got.missing, 'picture or file', 'pictures and files')} could not be read out of Notes and ${got.missing === 1 ? 'was' : 'were'} left out.` : '',
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

/** The folders this book's imports came from, newest first: where a link to a note not here yet looks (vaultRoots). */
const VAULTS_KEPT = 'importedVaults'
const keptVaults = (): string[] => {
  try {
    const row = database().prepare('select value from settings where key = ?').get(VAULTS_KEPT) as { value: string } | undefined
    const list = JSON.parse(row?.value ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((one): one is string => typeof one === 'string') : []
  } catch {
    return []
  }
}

/**
 * `only`: these notes alone (a link to one not here yet, brought in from its
 * vault), each the way the import brings any note: its pictures and files, its
 * tags, its links. Hands back what came in.
 */
async function bringVault(root: string, quiet: boolean, pick?: { folders: string[]; signal: AbortSignal }, stop?: AbortSignal, only?: string[], groups?: string[]): Promise<Imported[]> {
  // Where it came from, so a link to one of its notes not brought in yet can bring it later.
  database().prepare('insert or replace into settings (key, value) values (?, ?)').run(VAULTS_KEPT, JSON.stringify([root, ...keptVaults().filter((one) => one !== root)].slice(0, 8)))
  // “Stop” on the chip, chosen folders or the whole folder: each note already in is whole, and stays.
  const signal = pick?.signal ?? stop
  const notes: string[] = []
  // Only the chosen folders' notes, when some were chosen; every file still, for their pictures.
  const chosen = (path: string): boolean => (only ? only.includes(path) : !pick || pick.folders.includes(relative(root, path).includes('/') ? relative(root, path).split('/')[0] : ''))
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
  // Brought before and changed in the source since: their words are the new ones (captures.ts `importNote`).
  let updated = 0
  let empty = 0
  let marked = 0
  const unread: string[] = []
  // Pictures a note shows that are nowhere in the folder: said at the end, by note.
  const missingHere: string[] = []
  const missing: { link: string; title: string; names: string[] }[] = []
  for (const [at, path] of notes.entries()) {
    if (signal?.aborted) break
    if (!quiet) importProgress({ done: at + 1, total: notes.length, what: 'notes', stop: !!signal })
    missingHere.length = 0
    // Known by its path, so its pictures are not read again; new notes may still link to it.
    const before = alreadyImported(relative(root, path))
    // Changed in the vault since it came: read again, and its words updated where it is kept (captures.ts `importNote`).
    if (before && !sourceChanged(relative(root, path), (await stat(path)).mtime)) {
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
      // [[report.pdf]] or [[photo.png|alias]], no "!": Obsidian's link to a file in the vault. The file comes
      // in as an embedded one does (a picture shows, anything else is a link that opens it); one that is not
      // in the vault, or a note's name with a dot in it, stays a note link.
      next = await swap(next, /(?<!!)\[\[(.+?)\]\](?!\])/g, async (match) => {
        const [target, alias] = match[1].split(/\\?\|/)
        if (/#/.test(target) || /\.md$/i.test(target.trim()) || !/\.[a-z0-9]{1,12}$/i.test(target.trim())) return null
        const found = fileFor(path, target)
        const stored = found && (await keep(found))
        if (!stored) return null
        return shown(stored, alias?.trim() || target.trim().split('/').pop()!, undefined, inTable)
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
    else if (one === 'updated') updated += 1
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
  if (!quiet && !signal?.aborted) importProgress({ done: notes.length, total: notes.length, what: 'notes', stop: !!signal })
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
  if (!showsPictures && !pick && !signal?.aborted) {
    let seen = 0
    for (const path of everyFile) {
      if (signal?.aborted) break
      if (!quiet) importProgress({ done: ++seen, total: everyFile.size, what: 'pictures', stop: !!signal })
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
      else if (one !== 'empty' && one !== 'updated') made.push(one)
    }
    if (!quiet && !signal?.aborted) importProgress({ done: everyFile.size, total: everyFile.size, what: 'pictures', stop: !!signal })
  }
  const linked = linkImported(made, byName, known)
  // And links already here, from an earlier import or typed by hand, waiting for a page that came in only now.
  resolveWaiting(...made.map((one) => one.link))
  // And what they link to that was here before them, a note made by hand among it.
  resolveWithin(...made.map((one) => one.link))
  const inbox = made.filter((one) => !/^(article|nugget):/.test(one.link)).length
  // Chosen folders: each a group in Pages, named for the folder, its subfolders groups inside it; notes at the top
  // of the vault, in no folder, stay loose.
  const dirOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
  const filed = pick
    ? fileIntoGroups([...new Set(made.map((one) => dirOf(one.path)))].filter(Boolean).map((dir) => ({
        path: dir.split('/'),
        ids: made.filter((one) => dirOf(one.path) === dir).map((one) => one.link.replace(/^(article|nugget):/, ''))
      })), groups, `${existsSync(join(root, '.obsidian')) ? 'Obsidian' : 'Markdown'}: ${basename(root)}`)
    : []
  const report = [
    `${num(made.length)} new ${made.length === 1 ? 'note' : 'notes'} from ${basename(root)}, with ${num(pictures)} pictures, ${num(attached)} files and ${num(linked)} links.`,
    // Where they went, said plainly: the Inbox, with time to sort it.
    inbox ? `${plural(inbox, 'note is', 'notes are')} in your Inbox to sort through; ${inbox === 1 ? 'it' : 'they'} won't come back to you as old notes to tidy for 30 days.` : '',
    already && (made.length || updated) ? `${plural(already, 'was', 'were')} already here, from an earlier import, and ${already === 1 ? 'was' : 'were'} left as ${already === 1 ? 'it was' : 'they were'}.` : '',
    updated ? `${plural(updated, 'was', 'were')} changed in ${basename(root)} since the last import: ${updated === 1 ? 'its' : 'their'} words are the new ones, where${updated === 1 ? 'ver it is' : 'ver they are'} kept here.` : '',
    !made.length && !updated && already ? `Everything is already here: ${plural(already, 'note')}.` : '',
    empty ? `${num(empty)} empty ${empty === 1 ? 'file was' : 'files were'} skipped.` : '',
    unshown ? `${plural(unshown, 'picture was', 'pictures were')} skipped: HEIC and TIFF cannot be shown here yet. Export them as JPEG to bring them in.` : '',
    marked ? `${plural(marked, 'note came', 'notes came')} in marked private: ${marked === 1 ? 'its name sounds' : 'their names sound'} like passwords or logins.` : '',
    kept.length ? `Left out because ${kept.length === 1 ? 'it looks' : 'they look'} like passwords or keys: ${kept.join(', ')}.` : '',
    unread.length ? `Left out because ${unread.length === 1 ? 'it could not be read as text' : 'they could not be read as text'}: ${unread.join(', ')}.` : '',
    signal?.aborted ? `Stopped before the end: bring the same ${pick ? 'folders' : 'folder'} in again to carry on. Notes already here are skipped.` : ''
  ].filter(Boolean)
  // Filed into Pages: said in place of the Inbox's line.
  if (pick) report.splice(1, 0, filedSaid(filed, made.length - inbox))
  if (!quiet) importProgress(null)
  if (quiet) {
    if (!only) console.log(`imported ${made.length} new, ${updated} updated, ${already} already here, ${empty} empty, ${kept.length} left out, ${unshown} pictures of other types skipped, ${marked} marked private, ${pictures} pictures, ${attached} files, ${linked} links${kept.length ? ` [${kept.join(', ')}]` : ''}`)
    return made
  }
  // Said in the main window, on a card of its own, while the notes become documents behind it.
  inHome('haligtree:import-done', {
    from: basename(root),
    // Its own folder in Imports, which the card opens (Folders: "the import's last notice opens its folder").
    folder: filed.length ? importFolder(`${existsSync(join(root, '.obsidian')) ? 'Obsidian' : 'Markdown'}: ${basename(root)}`) : null,
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
  return made
}

/**
 * A link to a note not in the book, clicked: the note of that name in the
 * vault this book's notes came from (or one Obsidian knows), brought in as the
 * import brings one, and opened. Several of that name: which, asked by path.
 * None, or no vault to look in, or the vault gone: said, so the link can make
 * an empty note and say why. Nothing in a vault is ever written to.
 */
async function bringLinked(name: string, path?: string): Promise<{ found: 'brought' | 'here'; link: string; title: string; path: string; groups?: string[] } | { found: 'several'; paths: string[]; names: string[] } | { found: 'none'; vault: boolean; unread: string[] } | { found: 'busy' }> {
  const roots = await vaultRoots(keptVaults())
  if (!roots.length) return { found: 'none', vault: false, unread: [] }
  const { found, unread } = await findVaultNotes(name, roots)
  const one = path ? found.find((note) => note.path === path) : found.length === 1 ? found[0] : undefined
  // Said as unread only when no vault could be looked in: one gone among several that were read changes nothing found.
  // Several: each named as Obsidian's own list of files names it, by its vault and its folders there.
  if (!one) return found.length > 1 ? { found: 'several', paths: found.map((note) => note.path), names: found.map((note) => join(basename(note.root), relative(note.root, note.path))) } : { found: 'none', vault: true, unread: unread.length === roots.length ? unread : [] }
  // Brought in before (and renamed since, so its old name finds nothing): that one.
  const before = alreadyImported(relative(one.root, one.path))
  if (before) return { found: 'here', link: before.link, title: before.title, path: one.path }
  // An import under way has the store: the link waits for it rather than bringing one note in the middle of it.
  if (stopping) return { found: 'busy' }
  // As an import: its words become a document once its links are in, in whichever window opens it.
  setImporting(true)
  try {
    // The folders filing it made, for the notice's Undo to take back with it.
    const groups: string[] = []
    const made = await busy(() => bringVault(one.root, true, { folders: [], signal: new AbortController().signal }, undefined, [one.path], groups))
    // Nothing came in: the file was empty (as the import skips one).
    return made[0] ? { found: 'brought', link: made[0].link, title: made[0].title, path: one.path, groups } : { found: 'none', vault: true, unread: [] }
  } catch {
    // A folder in it that cannot be read (permissions, a cloud copy not on this Mac): said as the vault unread.
    return { found: 'none', vault: true, unread: [one.root] }
  } finally {
    setImporting(false)
    changed()
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('imports:ready')
  }
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
  // On the copy thread, as the day's backup is: the window stays answering while the book is copied.
  await copyBook(live, join(backupDir(), 'database', `before-restore-${Date.now()}.db`))
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
/** Sheets asking how a deck comes in, waiting for their answer from the main window. */
const apkgAsked = new Map<string, (choice: ApkgChoice) => void>()
ipcMain.handle('haligtree:apkg:answer', (_event, id: string, choice: ApkgChoice) => {
  apkgAsked.get(id)?.({ keepReviews: !!choice?.keepReviews, hold: !!choice?.hold })
  apkgAsked.delete(id)
})

/**
 * Ask, in the main window's own sheet, how a deck comes in: a stranger's past
 * reviews kept or started fresh (fresh by default, kept for your own
 * collection), and a big deck started whole or held until each topic is
 * started (held by default over HOLD_OVER new cards).
 */
function askApkg(ask: ApkgAsk & { own: boolean }): Promise<ApkgChoice> {
  const id = randomUUID()
  return new Promise((resolve) => {
    apkgAsked.set(id, resolve)
    inHome('haligtree:apkg-ask', { id, ...ask, holdOver: HOLD_OVER })
  })
}

async function importFiles(dropped?: string[]): Promise<void> {
  const filePaths = dropped ?? (await dialog.showOpenDialog({
    title: SANDBOX ? 'Import into the sandbox' : BOOK ? `Import into ${nameOf(here())}` : 'Import',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown, bookmarks, highlights (Readwise, Kindle) or Anki cards and decks', extensions: ['md', 'html', 'htm', 'csv', 'json', 'txt', 'apkg', 'colpkg'] }]
  })).filePaths
  const lines: string[] = []
  // The beam turns in every window while the files are read in.
  let total = 0
  let inbox = 0
  let deckFrom = ''
  let decked = 0
  let gems = 0
  if (stopping || !filePaths.length) return
  const signal = (stopping = new AbortController()).signal
  // A deck stopped part way: nothing of it is kept (anki-apkg.ts); files before it stay, each whole.
  let stoppedAt = ''
  try {
  await busy(async () => {
    for (const [at, path] of filePaths.entries()) {
      if (signal.aborted) break
      importProgress({ done: at + 1, total: filePaths.length, what: 'files', stop: true })
      const name = basename(path)
      // One file that cannot be read is said so, and the rest still come in.
      try {
        // An Anki deck package: cards with their pictures, sounds and schedules.
        if (/\.(apkg|colpkg)$/i.test(name)) {
          // A whole collection (.colpkg) is your own: its reviews are yours. A shared deck's are a stranger's: fresh by default, as Anki does.
          const own = /\.colpkg$/i.test(name)
          const got = await importApkg(path, {
            signal,
            // The cards go in as one write of a second or two: no “Stop” while it runs, since it could not be stopped.
            progress: (done, all, what) => importProgress({ done, total: all, what, stop: what !== 'cards' }),
            // Asked in the app's own sheet (apkg-ask.tsx), before anything is kept.
            choose: (ask) => askApkg({ ...ask, own })
          })
          total += got.cards
          decked += got.cards
          const parts = [`${plural(got.cards, 'card')}`,
            got.pictures && `${plural(got.pictures, 'picture')}`, got.sounds && `${plural(got.sounds, 'sound')}`].filter(Boolean)
          // Named as the deck calls itself, not by its file: "Great Works of Art: Artists, Titles".
          const deckName = got.names.join('; ') || name.replace(/\.(apkg|colpkg)$/i, '').replace(/_/g, ' ')
          // One deck: its name heads the notice ("From Great Works of Art: Artists, Titles"), said once.
          if (filePaths.length === 1) (deckFrom = deckName, lines.push(parts.join(', ')))
          else lines.push(`${deckName}: ${parts.join(', ')}`)
          if (got.held) lines.push(`${num(got.held)} new ${got.held === 1 ? 'card waits' : 'cards wait'}, held: start each topic from Review › Decks when you study it`)
          // Which of the deck's fields became links, said so a wrong guess is caught: changed from the deck on Review › Decks.
          const linkedBy = [got.links.who.size && `“${[...got.links.who].join('”, “')}” became each card’s who, a Sources page each`, got.links.kinds.size && `“${[...got.links.kinds].join('”, “')}” became #tags`].filter(Boolean)
          if (linkedBy.length) lines.push(`Linked from the deck’s own fields: ${linkedBy.join('; ')}. Wrong guess? “Links” on the deck in Review › Decks changes it.`)
          if (got.updated) lines.push(`${plural(got.updated, 'card was', 'cards were')} changed by this newer version, keeping your progress`)
          if (got.paused) lines.push(`${plural(got.paused, 'card was', 'cards were')} suspended in Anki: paused here too, out of Review until you bring ${got.paused === 1 ? 'it' : 'them'} back`)
          if (got.already) lines.push(`${plural(got.already, 'card was', 'cards were')} already here, from an earlier import`)
          if (got.skipped) lines.push(`${plural(got.skipped, 'card')} left out: picture-hiding cards, or a side with nothing on it`)
          // One card as Review will ask it, so what came in is seen before it is studied.
          if (got.sample) lines.push(`A card as Review asks it: “${got.sample.question.replace(/!\[\]\([^)]*\)/g, '[picture]').replace(/\s+/g, ' ').trim().slice(0, 90)}” Answer: “${got.sample.answer.replace(/!\[\]\([^)]*\)/g, '[picture]').replace(/\s+/g, ' ').trim().slice(0, 90)}”`)
          // Coming from Anki: what each thing is called here, once under the counts however many decks came in.
          if (!lines.some((line) => line.startsWith('Coming from Anki?'))) {
            lines.push('Coming from Anki? A deck sits on Review › Decks, out of Gems, and is a #tag too (Biology::Cells is #biology-cells); the Browser is Review › All cards.')
            lines.push('More shared decks are at ankiweb.net/shared/decks: download a .apkg and drop it on this window.')
          }
          continue
        }
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
        if (error instanceof Stopped) {
          stoppedAt = name
          break
        }
        lines.push(`${name}: could not be read (${/\.json$/i.test(name) ? 'it is not a list of highlights in JSON' : error instanceof Error ? error.message : String(error)})`)
      }
    }
    if (!signal.aborted) importProgress({ done: filePaths.length, total: filePaths.length, what: 'files' })
  })
  } finally {
    stopping = null
  }
  importProgress(null)
  if (signal.aborted && !total) return inHome('haligtree:job-stopped', 'Stopped: nothing was imported')
  if (signal.aborted) lines.push(stoppedAt ? `Stopped at ${stoppedAt}: nothing of it was kept. Bring it in again to carry on.` : 'Stopped before the end: bring the rest in again to carry on.')
  // Bookmarks come in as cards holding their sites' pictures: the windows keep copies (link-card.ts cardsUp).
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('imports:ready')
  // Where they went, said first, and the card's button opens it.
  // Some of them: "1 is", "4 are".
  const some = (n: number): string => (n === total ? (total === 1 ? 'It is' : 'They are') : `${plural(n, 'is', 'are')}`)
  const went = [inbox ? `${some(inbox)} in your Inbox.` : '', gems ? `${some(gems)} in Gems, as cards to review.` : '',
    decked ? `${some(decked)} on Review’s Decks shelf, out of Gems: start a topic when you study it.` : ''].filter(Boolean)
  if (lines.length) inHome('haligtree:import-done', { from: deckFrom || (filePaths.length === 1 ? basename(filePaths[0]) : `${num(filePaths.length)} files`), made: total, inbox, gems, decks: decked, notes: [...went, ...lines] })
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
// Quitting mid-meeting: what was recorded is kept first, then the app goes.
app.on('before-quit', (event) => {
  if (!meetingNow()) return
  event.preventDefault()
  void stopMeeting().then(() => app.quit())
})
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
// What the menu bar's menu last said (updateTray), so the same words are not built again.
let trayShape = ''

function createTray(): void {
  const image = nativeImage.createFromBuffer(readFileSync(trayIcon), { scaleFactor: 2 })
  // A template image is drawn in the menu bar's own colour, so it follows the
  // system between light and dark instead of being a small photograph.
  image.setTemplateImage(true)

  tray = new Tray(image)
  trayShape = ''
  onHandOff(() => tray?.destroy())
  whereTray(() => (tray && !tray.isDestroyed() ? tray.getBounds() : null))
  updateTray()
  // Kept current without a window open: the count changes as the day goes on.
  setInterval(() => (updateTray(), beacons()), 30_000)
  // A task done, moved or renamed, a goal renamed, anywhere: the menu bar says so at once, not at the next half minute.
  whenChanged(updateTray)
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
let dockShape = ''
function updateDock(): void {
  if (!app.dock || !app.isReady()) return
  // Built again only when what it says changed, as the menu bar's is: it was built afresh every half minute and on every write.
  const shape = JSON.stringify([awayItems().map((item) => [item.label, item.checked]), stickiesTicked()])
  if (shape === dockShape) return
  dockShape = shape
  app.dock.setMenu(
    Menu.buildFromTemplate([
      { label: 'Quick capture', click: () => void (prompt?.isFocused() || toggleWindow()) },
      // A fresh box, as ⌘N in it makes one: whatever was in it can be brought back.
      { label: 'New note', click: newNote },
      // Apart from quick capture, which stays free: as the File menu and ⌥⌘. have it.
      { label: 'New note in a small window', click: () => smallWindows?.open(null) },
      { label: 'Today', click: () => sendHome('view', 'today', undefined, 'window') },
      ...awayItems(),
      { label: 'Show sticky notes', type: 'checkbox', checked: stickiesTicked(), click: (item) => void showStickies(item.checked) }
    ])
  )
}

/** The menu bar, its items the same as the tray's and the Dock's twins (app-menu.ts); built again when the keys change. */
function appMenu(): void {
  setAppMenu({
    // macOS's About panel shows the app's icon, and Electron does not pass `iconPath` on to it on a Mac (only on Windows
    // and Linux): a run from source would show Electron's atom (the user, 13 Nov: "why isnt this using my logo?"). Put
    // Haligtree's own on just before it opens. A built app's bundle already carries it (build/icon.icns).
    about: () => (wearIcon(), app.showAboutPanel()),
    name: APP_NAME,
    captureKey: chordFor('⌘.'),
    capture: () => void (prompt?.isFocused() || toggleWindow()),
    newNote,
    smallNote: () => smallWindows?.open(null),
    smallKey: chordFor('⌥⌘.'),
    inHome,
    view: (id) => sendHome('view', id, undefined, 'window'),
    importVault: () => void importVault(),
    importFiles: () => void importFiles(),
    safeKey: chordFor('⌥⌘S'),
    safeMode: () => (toggleSafeMode(), updateTray())
  })
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
  tray.setToolTip(`${SANDBOX ? `${APP_NAME} sandbox` : `${APP_NAME} · ${nameOf(here())}`}${tasks ? ` · ${plural(tasks, 'task')} due now` : ''}${due ? ` · ${due} to review` : ''}${safe ? ' · safe mode on' : ''}`)
  // Tempus: how far through the day, week, month and year, each a drawn bar
  // of one width, so the four line up whatever their words.
  const time = tempus()
  const hidden = safe || gate().held
  const marked = nextMilestones()
  // The nearest three: the rest are a click away in the app.
  const goalItems: Electron.MenuItemConstructorOptions[] = goals.slice(0, 3).map((goal) => {
    const left = daysLeft(goal.goalAt)
    const name = goal.private && hidden ? 'A private goal' : clip(goal.title, 34)
    const when = left < 0 ? 'did you make it?' : left === 0 ? 'today' : `${plural(left, 'day')} left`
    // The goal on its own line and where it stands under it, smaller: a menu
    // taller and narrower, rather than one long line setting its width.
    return { label: name, sublabel: `${when}  ·  ${percent(wayThrough(goal.goalFrom, goal.goalAt))} of the time gone`, click: () => sendHome('goal', goal.id, undefined, 'window') }
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
    ...(tasks ? [{ label: `${plural(tasks, 'task')} due now`, click: () => sendHome('view', 'today', undefined, 'window') }] : []),
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
      // A meeting: started here, and while it records, its moment and its end.
      ...(meetingNow() ? [
        { label: meetingState().state === 'saving' ? 'Keeping the recording…' : 'Recording', enabled: false },
        { label: 'Note this moment', accelerator: chordFor('⌃⌥⌘M'), enabled: meetingState().state === 'live', click: () => void startMeeting() },
        { label: 'Stop and keep the recording', enabled: meetingState().state !== 'saving', click: () => void stopMeeting() }
      ] : [{ label: 'Record a call or lecture', accelerator: chordFor('⌃⌥⌘M'), click: () => void startMeeting() }]),
      { label: `Open ${APP_NAME}`, accelerator: chordFor('⌘.'), click: () => toggleWindow() },
      // A note apart from quick capture, as the File menu, the Dock and ⌥⌘. have it.
      { label: 'New note in a small window', accelerator: chordFor('⌥⌘.'), click: () => smallWindows?.open(null) },
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
          // Your books in the order every list of them keeps (the open one, then the one you were just in). In the
          // sandbox none of them is open, so none is a ticked choice: plain lines, each a way out to that book.
          ...books().map((book) => (SANDBOX
            ? { label: book.name, click: () => inHome('haligtree:book-switch', book.id) }
            : { label: book.name, type: 'radio' as const, checked: book.current, click: () => void (book.current || inHome('haligtree:book-switch', book.id)) })),
          { type: 'separator' as const },
          { label: 'New book…', enabled: !SANDBOX, click: () => inHome('haligtree:book-new') },
          // The sandbox is someone else's book, never one of yours: its own line, as in the sidebar's menu. In it, the way back is at this menu's top.
          ...(SANDBOX ? [] : [{ label: 'Open the sandbox…', click: () => openSandbox() }, { label: 'Restore from a backup…', click: () => void restore() }])
        ]
      },
      {
        label: 'Import',
        submenu: [
          { label: 'From Obsidian or Notion…', click: () => void importVault() },
          { label: 'From Apple Notes…', click: () => inHome('haligtree:import-folders', { from: 'Apple Notes' }) },
          { label: 'Files, Anki Decks or CSV…', click: () => void importFiles() },
          ...(SANDBOX ? [] : [{ type: 'separator' as const }, { label: 'Into another book…', click: () => inHome('haligtree:book-import') }])
        ]
      },
      { type: 'separator' },
      { label: 'Safe mode', type: 'checkbox', checked: safe, accelerator: chordFor('⌥⌘S'), click: () => (toggleSafeMode(), updateTray()) },
      // Everything about the stickies, together under one name.
      {
        label: 'Sticky notes',
        submenu: [
          // Away for a meeting or quiet hours: said first, with the way to have them out all the same.
          ...awayItems(),
          // Ticked as they are on the screen; chosen, they come out or go away as the tick now says.
          { label: 'Show sticky notes', type: 'checkbox', checked: stickiesTicked(), accelerator: chordFor('⌃⌥⌘N'), click: (item) => void showStickies(item.checked) },
          { label: 'Bring them here', enabled: !safe && !deskHidden && stickies.size > 0, click: () => gatherStickies() },
          ...(safe ? [] : tuckItems()),
          // What is on the desk, each by name with what it is now: chosen, a pill opens and stays, an open card folds.
          ...(safe ? [] : deskLines()),
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
  // Told of every change, it builds the menu again only when what it says changed: a hundred moved to the Bin build it once, not a hundred times.
  const shape = JSON.stringify([template, goals.slice(0, 3).map((goal) => goal.id), tempusDrawn?.key === tempusKey], (key, value) => (key === 'icon' ? !!value : value))
  if (shape === trayShape) return
  trayShape = shape
  const menu = Menu.buildFromTemplate(template)
  // And the menu itself, so a probe can choose an item as a click would.
  if (process.env.HALIGTREE_QA_AWAY) (globalThis as { trayBuilt?: unknown }).trayBuilt = menu
  tray.setContextMenu(menu)
}

// Asked once, by the main process as it starts and by each window's preload as it loads.
let twelve: boolean | null = null
const twelveHour = (): boolean => (twelve ??= macTwelveHour())
// What every window knows before it draws (its book, the Mac's clock) rides in its environment: a window's process
// starts with main's, so its preload reads them there. They were asked with calls that wait on main (`sendSync`),
// the book's at every list a page kept: a window stood still for as long as main was busy. The two channels stay
// for a window whose process was somehow started without them. (A test run's quiet is read from its own flags.)
process.env.HALIGTREE_BOOK_HERE = here()
ipcMain.on('clock:twelve', (event) => void (event.returnValue = twelveHour()))
ipcMain.on('book:here', (event) => void (event.returnValue = here()))
// The welcome's first sound plays as it arrives, before anything has been clicked (renderer's lib/sound.ts, ambience).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.whenReady().then(() => {
  reached('ready')
  // The hand and the I-beam in quick capture, which has the keys while Haligtree is not the active app (haptic.ts).
  cursorInBackground()
  // Every time Haligtree writes, here and in each window, on the Mac's own clock (12 or 24 hours).
  process.env.HALIGTREE_TWELVE = twelveHour() ? '1' : '0'
  useTwelveHour(twelveHour())
  // The Leaves marks draw on a Noun Project icon used under CC BY 3.0, which asks for this credit.
  // Haligtree's own version and icon, said outright: a dev run is Electron's own app, whose bundle says Electron's
  // (44.3.0). The line goes in the copyright place, which macOS centres under the name; credits are set flush left.
  app.setAboutPanelOptions({
    applicationVersion: app.getVersion(), version: '', iconPath: iconBronze,
    copyright: ANCHOR
  })
  // Haligtree's own menu bar; Edit > Select All asks the page first: a list picks every row (app-menu.ts).
  appMenu()
  // YouTube will not play an embed that comes from no page at all (its
  // "Error 153"), and Haligtree's pages are files. Say where it is shown from.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/embed/*'] }, (details, done) =>
    done({ requestHeaders: { ...details.requestHeaders, Referer: 'https://haligtree.app/' } }))
  letWebPictures(session.defaultSession)
  // YouTube turning the player away (its "unusual traffic" page, or anywhere off YouTube): the block is told, so it
  // says so with a way to watch it on YouTube, rather than showing an empty frame.
  session.defaultSession.webRequest.onBeforeRedirect({ urls: ['https://www.youtube-nocookie.com/embed/*', 'https://www.youtube.com/embed/*'] }, (details) => {
    if (/^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com)\//.test(details.redirectURL)) return
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('video:refused', details.url)
  })
  // The microphone only for a voice note, which asks macOS first (media.ts,
  // `mic:ask`, with the sentence in electron-builder.yml); the camera for a
  // selfie. Only Haligtree's own pages: a web page shown inside never gets either.
  session.defaultSession.setPermissionRequestHandler((wc, permission, allow) =>
    allow(permission !== 'media' || /^(file|http:\/\/localhost)/.test(wc.getURL())))
  registerCaptures()
  reached('book')
  registerImportConversion()
  registerUsage()
  registerHaligtree()
  // Notes imported before front-matter tags stopped coming in twice: tidied as it starts, a no-op once done. After
  // registerHaligtree, which gives a new book's notes their `fields` column: before it, every new book's first start
  // printed "no such column: fields".
  try {
    dropDuplicateTags()
  } catch (error) {
    console.error('Could not tidy imported tags', error)
  }
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
  registerOffers()
  registerAway()
  registerReminders()
  registerWrite()
  // Your sun (sun.ts): today's sunrise and sunset for the city picked, or this Mac's time zone's.
  ipcMain.handle('haligtree:sun', () => sunToday(sunPlace()))
  ipcMain.handle('haligtree:sun:places', () => allPlaces().map(({ zone, city }) => ({ zone, city })))
  registerJournal()
  registerPdfHighlights()
  registerSandbox()
  atLogin()
  registerHome()
  registerSpelling()
  registerNotes({ load, guard, home: (type, id) => sendHome(type, id, undefined, 'window'), homeWindow: () => (home && !home.isDestroyed() ? home : null) })
  smallWindows = registerSmallWindows({ load, guard, stepAside, passThrough, parked: parkedBy })
  smallWindows.restore()
  registerGroups()
  registerSections()
  registerFolders()
  registerFolderGems()
  registerNoteImports()
  registerPeriods()
  // Words written, counted as you save, for Stats: once every page's table is there.
  registerWordLog()
  registerSite()
  registerMilestones()
  registerEvents((type, id) => sendHome(type, id, undefined, 'notification'))
  registerReadingQueue()
  registerReadTime()
  registerStatsMore()
  registerPractices()
  // A practice's offer is asked in one place at a time: inside the main window when that is in front, else the corner's
  // card with the other asks. It never starts by itself.
  whenPracticeOffer(offerPractice, offerOver)
  registerIssues()
  registerScenery()
  registerCelebrations()
  registerOnboarding()
  registerUnused()
  registerMedia()
  registerCollect()
  registerTranscribe()
  registerMeeting({
    send: sendMeeting,
    open: () => {
      // One of Haligtree's floating windows at a time: quick capture goes as the recording's card comes (its draft
      // kept), and opens again on its key as ever.
      if (prompt && !prompt.isDestroyed() && prompt.isVisible()) hideWindow(prompt)
      const win = meetingWindow()
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => (sendMeeting(meetingState()), win.showInactive()))
      else win.showInactive()
    },
    close: () => { if (meetingWin && !meetingWin.isDestroyed()) (meetingWin.setClosable(true), meetingWin.close()) },
    openNote: (id) => sendHome('capture', id, undefined, 'window'),
    // Told, not brought forward: the notice waits in the main window for whenever it is next looked at.
    leftChanged: () => void (home && !home.isDestroyed() && home.webContents.send('meeting:left'))
  })
  // The card tucked to a pill and back: its window the card's size, its bottom middle where it was.
  ipcMain.handle('haligtree:meeting:size', (_event, width: unknown, height: unknown) => {
    const win = meetingWin
    if (!win || win.isDestroyed()) return
    const was = win.getBounds()
    meetingSize = { width: Math.round(Number(width)), height: Math.round(Number(height)) }
    win.setBounds({ x: Math.round(was.x + was.width / 2 - meetingSize.width / 2), y: was.y + was.height - meetingSize.height, ...meetingSize })
  })
  registerJobs()
  registerLabels()
  registerDefaultApp()
  registerPdfText()
  registerUnderstand()
  registerStudyAi(aiStudyOn)
  registerLongNames(nameLongOn, aiStudyOn, () => (home && !home.isDestroyed() ? home : null))
  registerServices()
  registerSpotlight()
  registerDictation()
  registerGlass()
  registerObsidian()
  // A link to a note not here yet, clicked: brought in from its vault if it is there (bringLinked).
  ipcMain.handle('haligtree:vault:bring', (_event, name: unknown, path?: unknown) =>
    typeof name === 'string' && name.trim() && name.length <= 1024 ? bringLinked(name, typeof path === 'string' ? path : undefined) : { found: 'none', vault: false, unread: [] })
  registerPictures()
  registerPictureSight()
  registerContacts()
  registerPeople()
  registerSources()
  registerCite()
  registerFeed()
  registerDefine()
  registerMacCalendar()
  // Last, once every table is there: what other books sent this one is taken in.
  registerBooks(backupBase, () => updateTray())
  void tellRestored()
  tellMovedIn()
  const first = fromCli(process.argv)
  if (first) captureText(first)

  /**
   * A file from disk, a range of it answered as a web server would: 206 Partial
   * Content, saying which bytes of how many. Chromium's own file loader sends the
   * bytes asked for but calls them 200 and says no Content-Range, and a video or
   * recording given that cannot seek: asked for 0:30, it starts again at 0.
   */
  const servedFile = async (path: string, request: Request): Promise<Response> => {
    const asked = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (!asked || (!asked[1] && !asked[2])) {
      const whole = await net.fetch(pathToFileURL(path).toString())
      const headers = new Headers(whole.headers)
      headers.set('accept-ranges', 'bytes')
      return new Response(whole.body, { status: whole.status, headers })
    }
    const { size } = await stat(path)
    // "bytes=-500" is the last 500 bytes; an end past the file is the file's end.
    const start = asked[1] ? Number(asked[1]) : Math.max(0, size - Number(asked[2]))
    const end = asked[1] && asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    const part = await net.fetch(pathToFileURL(path).toString(), { headers: { range: `bytes=${start}-${end}` } })
    const headers = new Headers(part.headers)
    headers.set('accept-ranges', 'bytes')
    headers.set('content-range', `bytes ${start}-${end}/${size}`)
    headers.set('content-length', String(end - start + 1))
    return new Response(part.body, { status: 206, statusText: 'Partial Content', headers })
  }

  // Serve the asset store. The pathname is the only thing trusted: anything
  // with a separator in it is refused, so a crafted src cannot walk the disk.
  // Both names: see registerSchemesAsPrivileged above.
  for (const scheme of ['haligtree', 'mindflow']) protocol.handle(scheme, async (request) => {
    // A standard scheme parses `haligtree://assets/x.png` as host `assets` and
    // path `/x.png`, so the store name is the host, not part of the path.
    const { host, pathname } = new URL(request.url)
    const name = pathname.replace(/^\/+/, '')

    // The drawing editor's hand-drawn fonts, out of the app's own folder (copied beside the pages at build time,
    // electron.vite.config.ts). It reads them with fetch to put them inside a drawing's picture, and a page opened
    // from a file may not fetch a file: it went on to a CDN, which the app's policy refuses. Only a font's own name.
    if (host === 'app') {
      if (!/^fonts\/[A-Za-z]+\/[A-Za-z0-9_-]+\.woff2$/.test(name)) return new Response('not found', { status: 404 })
      try {
        const file = await net.fetch(pathToFileURL(join(__dirname, '../renderer', name)).toString())
        const headers = new Headers(file.headers)
        headers.set('content-type', 'font/woff2')
        headers.set('access-control-allow-origin', '*')
        return new Response(file.body, { status: file.status, statusText: file.statusText, headers })
      } catch {
        return new Response('not found', { status: 404 })
      }
    }

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
        // A range answered as 206, so a clip can loop and seek.
        const file = await servedFile(path, request)
        // Open to the app's own pages, so a recording can be listened to as it plays (Media's moving waveform reads
        // its loudness through Web Audio, which hears only silence from a file another origin has not opened to it).
        const headers = new Headers(file.headers)
        headers.set('access-control-allow-origin', '*')
        return new Response(file.body, { status: file.status, statusText: file.statusText, headers })
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
      const file = join(assetsDir(), name)
      // Not in this book's store: a picture copied from another book or the sandbox is fetched from there and kept
      // here, so the note keeps it whichever book is open next (assetElsewhere).
      if (!existsSync(file)) {
        const other = assetElsewhere(name)
        if (other) await mkdir(assetsDir(), { recursive: true }).then(() => copyFile(other, file))
      }
      // A small copy asked for (`?w=256`): made once by macOS from the picture and kept beside the store (smallCopy), so
      // a grid of 120px squares never decodes 3,000px screenshots (a picker of them took a second or two to fill), and
      // a picture opened to look at comes at the screen's size (`?w=` its long side), its original only once zoomed into.
      const width = Number(new URL(request.url).searchParams.get('w'))
      if (width && /\.(png|jpe?g|webp|heic|tiff?)$/i.test(name)) {
        const small = await smallCopy(name, width <= 256 ? 256 : width <= 640 ? 640 : width <= 2048 ? 2048 : 4096)
        if (small) return await servedFile(small, request)
      }
      // A scanned book whose pages were read (pdf-text.ts): its copy with the words on it, wherever it opens.
      const read = readCopy(name)
      return await servedFile(read && existsSync(read) ? read : file, request)
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
    // A small window too: "is there a reason cmd+swipe doesnt also move it away" (16 Nov).
    if (win && (win === prompt || isSmall(win))) throwBox(win, Number(dx) || 0, Number(dy) || 0, Number(speed) || 0)
  })
  // ⌘ and two fingers moving slowly: the window goes with them, kept on the screen.
  ipcMain.on('box:nudge', (event, dx: unknown, dy: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || (win !== prompt && !isSmall(win))) return
    if (win === prompt) throwing?.()
    else stopAside(win)
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
  ipcMain.on('box:promote', (event, type: unknown, id: unknown) => {
    const go = (): void => (typeof type === 'string' && typeof id === 'string' ? sendHome(type, id, undefined, 'capture') : openHome())
    const win = prompt
    // From a small window: the note opens in the main window, and the small window closes itself (App.tsx).
    if (!win || win.isDestroyed() || !win.isVisible() || isSmall(BrowserWindow.fromWebContents(event.sender))) return go()
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
  // The welcome about to arrive (answered at once, the page waits on it): as a scene over the whole screen that draws in
  // to the welcome's window in the middle of it, or plainly, that window put in the middle at once.
  ipcMain.on('welcome:arrive', (event, _again: unknown, still: unknown) => {
    const win = home
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return void (event.returnValue = { how: 'plain' })
    const display = screen.getDisplayMatching(win.getBounds())
    const rect = welcomePlace(display)
    if (still === true || !sceneArrives(win, display)) {
      void placeForWelcome(rect, true)
      return void (event.returnValue = { how: 'plain' })
    }
    endScene()
    sceneSteps.length = 0
    step('asked')
    const place: ScenePlace = { screen: { width: display.bounds.width, height: display.bounds.height }, window: { x: rect.x - display.bounds.x, y: rect.y - display.bounds.y, width: rect.width, height: rect.height } }
    arrival = { t0: 0, place, rect, name: welcomeName(), timers: [], handed: false }
    scene = makeScene(display)
    // Its page never drew (it broke): the welcome plays in its window all the same, in the middle of the screen.
    arrival.timers.push(setTimeout(() => {
      if (!arrival || arrival.t0) return
      void placeForWelcome(rect, true).then(() => home?.webContents.send('welcome:scene', { what: 'skip' }))
      endScene()
    }, 4000))
    event.returnValue = { how: 'scene', place }
  })
  ipcMain.on('scene:ready', (event) => void (scene && event.sender === scene.webContents && startScene()))
  ipcMain.on('scene:done', (event) => void (scene && event.sender === scene.webContents && handOverScene()))
  // Esc, Enter, a click or "Skip intro" over the scene: the welcome's window in its place with the arrival's end on it, then the scene goes.
  ipcMain.on('scene:skip', (event) => {
    if (!scene || event.sender !== scene.webContents || !arrival) return
    step('skip')
    const rect = arrival.rect
    void placeForWelcome(rect).then(() => {
      home?.webContents.send('welcome:scene', { what: 'skip' })
      // A frame for the welcome's window to draw its end, then the scene goes from over it.
      setTimeout(() => (handOverScene(), endScene()), 90)
    })
  })
  ipcMain.on('scene:sound', (event, on: unknown) => void (scene && event.sender === scene.webContents && home?.webContents.send('welcome:scene', { what: 'sound', on: on === true })))
  ipcMain.on('prompt:hide', () => void (prompt?.isVisible() && hideWindow(prompt)))
  // The first-run step and Settings import the way the menu bar does.
  // From the vault picker too: one of the vaults it showed, or null for the folder dialog.
  ipcMain.handle('import:decks', (_event, paths: unknown) =>
    Array.isArray(paths) ? importFiles(paths.filter((path): path is string => typeof path === 'string' && /\.(apkg|colpkg)$/i.test(path))) : undefined)
  ipcMain.handle('import:run', async (_event, what: unknown, from?: unknown) => {
    if (what === 'apple-notes') return inHome('haligtree:import-folders', { from: 'Apple Notes' })
    if (what !== 'vault') return importFiles()
    if (from === null) return importVault(undefined, null)
    if (typeof from === 'string') return (await isVault(from)) ? importVault(undefined, from) : undefined
    return importVault()
  })
  // Apple Notes and a vault's folders: asked for, chosen in the main window's sheet, brought in, or stopped.
  // “Stop” while Notes is asked (main/jobs.ts): the helper ends, and nothing was read.
  ipcMain.handle('haligtree:notes-import:folders', () => {
    const signal = begin('notes-folders')
    return notesReader().folders(signal).finally(() => endJob('notes-folders', signal))
  })
  ipcMain.handle('haligtree:notes-import:run', (_event, from: unknown, folders: unknown, root: unknown) =>
    void importFolders(from === 'Obsidian' ? 'Obsidian' : 'Apple Notes', Array.isArray(folders) ? (folders as NotesFolder[]) : [], typeof root === 'string' ? root : undefined))
  ipcMain.handle('haligtree:notes-import:stop', () => void stopping?.abort())
  ipcMain.handle('haligtree:notes-import:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'))
  ipcMain.handle('backup:restore', () => restore())
  ipcMain.on('appearance', (_event, mode: string, solid: unknown) => ((worn = { mode, solid: solid === true }), wear()))
  // The box's backing, as its theme says. A solid theme (Paper, Light,
  // Midnight) paints the page fully, so the frosting under it only ever showed
  // where the page had not painted yet: the strip a growing window uncovers
  // for a frame, grey under a paper page. There the window's own colour is the
  // theme's instead, so a new edge is the page's colour from its first frame.
  // A see-through theme keeps the frosting, which is its look.
  const surfaces = new WeakMap<BrowserWindow, string | null>()
  ipcMain.on('window:surface', (event, color: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    // Drawn as a card in clear room (overhang): the card paints its own surface, and the window stays see-through
    // round it whatever the theme; a backing colour or frost here filled the room too.
    if (!win || win !== prompt || win.isDestroyed() || rooms.has(win)) return
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
  // Quick capture's grabber (App.tsx, data-grabber): held, the box follows the pointer from where it was picked up,
  // a move like any other (it stops a size glide, and where it is let go is where it opens next); let go, it stays.
  // From its first move, Raycast's three grey dashed guides mark its home (boxHome), down its left and right edges and
  // across its top, and stay there until it is let go; carried near its home, it is drawn onto it with one haptic
  // tick; taken on past it, it follows again.
  // The page says where the pointer is on the screen (window:carry, once a frame while held): main never asks the
  // screen on a timer, so the box moves on the page's own frames, only when the pointer does.
  let boxHold: { win: BrowserWindow; from: Electron.Rectangle; start: Point; drag: ReturnType<typeof dragGuides> } | null = null
  const boxCarry: Carry = {
    grab: (start) => {
      const win = prompt
      if (!win || win.isDestroyed()) return
      const from = win.getBounds()
      boxHold = { win, from, start, drag: dragGuides((card) => [boxHome(card)]) }
      boxHold.drag.from(from)
    },
    carry: (now) => {
      if (!boxHold || boxHold.win.isDestroyed()) return void (boxHold = null)
      const { win, from, start, drag } = boxHold
      const at = win.getBounds()
      const lined = drag.to({ ...at, x: from.x + now.x - start.x, y: from.y + now.y - start.y })
      if (at.x !== lined.x || at.y !== lined.y) win.setPosition(lined.x, lined.y)
    },
    letGo: () => void ((boxHold = null), hideGuides())
  }
  const carrierOf = (event: Electron.IpcMainEvent): Carry | null => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return !win ? null : (handDrags.get(win) ?? (win === prompt ? boxCarry : null))
  }
  ipcMain.on('window:grab', (event, x: unknown, y: unknown) => {
    const at = pointFrom(x, y)
    if (at) carrierOf(event)?.grab(at)
  })
  ipcMain.on('window:carry', (event, x: unknown, y: unknown) => {
    const at = pointFrom(x, y)
    if (at) carrierOf(event)?.carry(at)
  })
  ipcMain.on('window:let-go', (event) => carrierOf(event)?.letGo())
  // Double-clicked: back to its home, where its guides show it (boxHome).
  ipcMain.on('window:home', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || win.isFullScreen()) return
    const home = boxHome(boundsOf(win))
    anchor = null
    win.setPosition(home.x, home.y)
  })
  ipcMain.on('window:centre', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || win.isFullScreen()) return
    const bounds = boundsOf(win)
    const { x, y } = opensAt('centre', screen.getDisplayMatching(bounds).workArea, bounds.width, bounds.height)
    const next = onScreen({ ...bounds, x, y })
    anchor = { y, became: next.y }
    panelFrom = null
    lastBounds = next
    void reshape(win, next)
  })

  // The side panel, asked for. Centred (the default in Settings), the box grows
  // about its middle, so it stays centred where it was; otherwise it grows to
  // the right and the writing stays exactly where the eye is. Either way the
  // screen's edge pushes it back on, and closing puts it back exactly where it
  // was before, unless it was moved in between.
  // Its new place is inside the window it already has (`within`): main moves
  // nothing on screen, and the page draws the change of shape itself, on one
  // curve (lib/box-morph.ts), from the room it is given back.
  ipcMain.handle('window:panel', async (event, open: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !rooms.has(win)) return null
    panelOpen = Boolean(open)
    const bounds = boundsOf(win)
    const width = boxWidth()
    // Wide already: only the height may be owed (the box opened short).
    if (width === bounds.width) return (await refit(win), within(win))
    const back = !open && panelFrom && panelFrom.became === bounds.x ? panelFrom.x : undefined
    const x = back ?? panelX(bounds, width)
    const next = anchored(win, x, width, boxHeight())
    panelFrom = open ? { x: bounds.x, became: next.x } : null
    return within(win, next)
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
  // The lid closed or the Mac asleep mid-meeting: stopped cleanly, what was recorded kept.
  powerMonitor.on('suspend', () => void ((sleptAt = Date.now()), stopMeeting()))
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
        { label: 'Where I put it', type: 'radio', checked: !pillInNotch(), click: () => resolve('free') },
        // Stepped aside for the pointer: sent back where it was by a press (it is back by itself at the next session).
        ...(pillHome && !focusTucked ? [{ label: 'Back to its place', click: () => (pillGoesHome(true), resolve(null)) }] : [])
      ]).popup({ window: win, callback: () => setTimeout(() => resolve(null), 100) })
    })
  )
  // The pill opening into the island: its window grows down first, from
  // the top it hangs from, and goes back once the pill has closed again.
  // The pill naming a session left running in another book: clicked, back to that book, by the main window's own switch.
  ipcMain.handle('haligtree:books:go', (_event, id: unknown) => inHome('haligtree:book-switch', String(id)))
  // Whether the pointer is over the pill's window now, asked once as its right-click menu is put away: the page
  // heard nothing while the Mac's menu was over it (focus-pill.tsx hears the rest from its own pointer events).
  ipcMain.handle('focus:pointer', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== focusPill || !win.isVisible()) return true
    // Test runs park the pill off screen, where the pointer never is: the probe's own moves say where it is.
    if (process.env.HALIGTREE_QA_AWAY) return false
    const at = screen.getCursorScreenPoint()
    const { x, y, width, height } = win.getBounds()
    return at.x >= x && at.x < x + width && at.y >= y && at.y < y + height
  })
  ipcMain.handle('focus:size', (event, height: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== focusPill) return false
    const bounds = win.getBounds()
    const next = Math.round(Math.max(PILL_REST, Math.min(640, Number(height) || PILL_REST)))
    // Opened where the screen's bottom would cut it (put at the bottom right by hand, 17 Nov: its lower half went off
    // the screen): it rises as far as it must to show whole, and comes back to its place as it shuts.
    const { workArea } = screen.getDisplayMatching(bounds)
    const home = pillRaisedFrom ?? bounds.y
    const onScreen = home >= workArea.y && home < workArea.y + workArea.height
    const y = next > PILL_OPEN && onScreen ? Math.max(workArea.y, Math.min(home, workArea.y + workArea.height - next)) : home
    pillRaisedFrom = y !== home ? home : null
    if (next !== bounds.height || y !== bounds.y) win.setBounds({ ...bounds, y, height: next })
    // Back at rest with the pointer already lying beside it (it opens for a moment as a session begins, and whenever
    // it is pointed at): it steps aside now, as it would have had it been at rest when the pointer stopped.
    if (bounds.height > PILL_OPEN && next <= PILL_OPEN && rested >= REST_MS && stepsAside()) pillStepsAside(screen.getCursorScreenPoint())
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
    reached('drawn')
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
  // A practice's card has left the corner (answered, or let go after its two minutes): the main window's “Now” card has it from here.
  ipcMain.on('nudge:practice-gone', (_event, id: unknown) => void (cornerOffer?.id === id && cornerHolds(null)))
  ipcMain.handle('practice:corner', () => cornerOffer?.id ?? null)
  ipcMain.on('nudge:size', (event, height: unknown) => {
    const win = nudgeHeld(event.sender)?.win
    if (!win) return
    const next = Math.round(Math.max(0, Math.min(520, Number(height) || 0)))
    nudgeTall.set(win, next)
    if (!next) nudgeKinds.delete(win)
    if (!next) return void win.hide()
    const bounds = win.getBounds()
    if (nudgeWins.get('corner')?.win !== win) return void win.setBounds({ ...bounds, height: next })
    // The corner's cards keep their corner as they come and go: down from a top corner, up from a bottom one.
    cardGliding?.()
    cardGliding = null
    win.setBounds(cardAt(cardCorner, next, screen.getDisplayMatching(bounds).workArea))
  })
  // An answer that can be taken back on something floating on its own (a nudge card's Done, the pill's
  // "Session abandoned"): ⌘Z in the main window takes it back too, since those windows rarely have the keys.
  // The newest one is the one taken back; words of '' let it go.
  ipcMain.on('float:undoable', (event, words: unknown) => {
    const said = typeof words === 'string' ? words : ''
    if (!said && floatUndoFrom !== event.sender) return
    floatUndoFrom = said ? event.sender : null
    if (home && !home.isDestroyed() && event.sender !== home.webContents) home.webContents.send('float:undoable', said)
  })
  ipcMain.on('float:undo', () => {
    const from = floatUndoFrom
    floatUndoFrom = null
    if (from && !from.isDestroyed()) from.send('float:undo')
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
  // A task's right-click menu is taller and wider than a sticky's small window, so it opens in the menu
  // window over it (popup-menu.ts), at the point right-clicked; the place of the line chosen goes back to the page.
  type Line = { label?: string; keys?: string; danger?: boolean; separator?: boolean; submenu?: Line[] }
  ipcMain.handle('sticky:menu', (event, items: unknown, at: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !Array.isArray(items)) return null
    const lines = (list: Line[]): PopupLine[] => list.map((one) => (one.separator ? { separator: true } : { label: String(one.label ?? ''), keys: typeof one.keys === 'string' ? one.keys : undefined, danger: one.danger === true, submenu: Array.isArray(one.submenu) ? lines(one.submenu) : undefined }))
    const point = at && typeof at === 'object' && 'x' in at && 'y' in at ? { x: win.getBounds().x + Number(at.x), y: win.getBounds().y + Number(at.y) } : screen.getCursorScreenPoint()
    return popupMenu(win, point, lines(items as Line[]), load)
  })
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
  registerPopupMenu()
  ipcMain.handle('stickies:out', () => stickiesOut())
  ipcMain.on('stickies:untidy', () => untidyStickies())
  ipcMain.on('sticky', (_event, type: unknown, id: unknown, on: unknown) => {
    if (typeof type !== 'string' || typeof id !== 'string') return
    const key = `${type}:${id}`
    // Stuck by hand in a meeting or quiet hours: this one was asked for, so it shows.
    if (on) byHand(key)
    // Stuck by hand from a page, the person asked to see it: it comes open (a Today or goal card that comes out by
    // itself starts as a pill), and one that is a pill already opens where it stands, pinned.
    if (on && !stickies.has(key)) handStuck.add(key)
    stick(type, id, Boolean(on))
    handStuck.delete(key)
    const made = stickies.get(key)
    if (on && made && peeking.has(key)) pinCard(key, made)
    // A goal's own card stuck by hand is kept as asked for, so the look at the goals leaves it up (beacons).
    const one = on && type === 'goal' ? stuckAs(`${type}:${id}`) : undefined
    if (one && !one.asked) ((one.asked = true), keepStuck())
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
  // A meeting or quiet hours: the desk steps away, and comes back as it was (applyDesk). Each signal is an event:
  // the Mac's own (a camera or microphone in use, the screen mirrored), the Calendar's, the recorder's (sendMeeting).
  whenMeeting(applyDesk)
  whenStepAway(applyDesk)
  watchMac()
  const lookAtEvents = followEvents(peopleNow)
  whenEvents(lookAtEvents)
  lookAtEvents()
  applyDesk()
  ipcMain.handle('desk:away', () => deskSaid())
  ipcMain.on('desk:anyway', (_event, on: unknown) => showAnyway(on !== false))
  // Pointed at, a goal's card stays; let go, one out now and then tucks a minute later. A pill pointed at opens.
  ipcMain.on('beacon:hold', (event, on: unknown) => {
    const key = keyOfSticky(BrowserWindow.fromWebContents(event.sender))
    if (!key) return
    const win = stickies.get(key)
    // Pointed at as a pill, it opens out of it; the pointer watched from then on (shapeCard).
    if (on) return void (beaconHeld.add(key), win && peeking.has(key) && shapeCard(key, win))
    // Left as a card opened out of its pill, the watch folds it back.
    if (peekWatch.has(key)) return
    beaconHeld.delete(key)
    if (beaconModes.get(key) === 'sometimes') tuckLater(key)
  })
  // Shown again, every sticky comes back, those put away on their own too. A quiet
  // sound whichever way it went, from the window in front if it is Haligtree's, else the box: never a sticky being hidden.
  let stickiesShown = stickyPrefs().shown
  whenStickies(() => {
    wear()
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
      // The card stays where it was, the same size: as paper it has room round it, as glass none.
      const at = cardFrame(key, win)
      builtGlass.set(key, glass)
      // The old one stays until the new one is on screen, then fades out as it fades in: one card changing its
      // material. Faded at once, every card was gone until its new page had drawn (a blink in a built run, seconds
      // in a development one, where pages compile as they load: "my stickies disappear when I pick Paper").
      stickies.delete(key)
      leaving.add(win)
      quietly.add(key)
      stick(type, rest.join(':'), true, at)
      const made = stickies.get(key)
      if (!made || made === win || made.isDestroyed() || !win.isVisible()) fadeOutSticky(win)
      else {
        const swap = (): void => fadeOutSticky(win)
        made.once('show', swap)
        made.once('closed', swap)
      }
    }
    applyStickies()
    updateTray()
  })
  // “Bring it back”, from the nudge card: a sticky hidden on its own before cards folded into pills, out again where it was.
  ipcMain.on('sticky:unhide', (_event, key: unknown) => {
    const one = stuckAs(String(key))
    if (!one?.hidden) return
    delete one.hidden
    keepStuck()
    byHand(String(key))
    if (!stickyPrefs().shown) return void showStickies(true)
    applyStickies()
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
    // A pill, or a card grown out of one, stays where the stack has it.
    const key = keyOfSticky(win)
    if (key && (peeking.has(key) || fromPill.has(key))) return
    const rest = win.getBounds()
    lifted.set(win, { x: rest.x, y: rest.y })
    let rising = true
    // Set down once the page says the pointer has gone from it (sticky:pointer), heard as it happens.
    // The page asks for the lift only from above the window's foot (lib/card-pointer.ts), so the rise
    // itself never slips the window out from under the pointer.
    const settle = (): void => {
      if (rising || win.isDestroyed() || onCard(win) || !lifted.has(win)) return
      done()
      // Dragged while up: wherever you put it is its place now.
      if (!ours(win)) return
      const from = win.getBounds().y
      glide(win, LIFT_MS, (t) => ({ x: rest.x, y: Math.round(from + (rest.y - from) * outQuint(t)) }))
    }
    const unhear = hearPointer(win, settle)
    // Called off: how far up it stands now, so a hand that takes it judges the guides by its place, not its rise.
    const done = (): number => (unhear(), lifted.delete(win), unlift.delete(win), win.isDestroyed() ? 0 : Math.max(0, rest.y - win.getBounds().y))
    // Picked up: wherever your hand puts it is its place, never set back down where it rose from.
    unlift.set(win, done)
    placed.set(win, { x: rest.x, y: rest.y })
    // Up first, then set down if the pointer went meanwhile: a set-down starting mid-rise would fight it.
    // The same length and curve as a paper card's lift in its page (LIFT_MS), so glass and paper feel one material.
    glide(win, LIFT_MS, (t) => ({ x: rest.x, y: rest.y - Math.round(RISE * outQuint(t)) }), () => ((rising = false), settle()))
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
      if (one) (one.bounds = cardOf(now, insetOf(key))), keepStuck()
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
  // A pop-up (the "…" menu, a picker) open in a short box: the window grows its room below the card, so the
  // pop-up hangs past the card's foot while the card stays as it is. Asked with 0 once it has closed.
  ipcMain.handle('window:room-below', (event, extra: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || !rooms.has(win) || typeof extra !== 'number' || !Number.isFinite(extra)) return false
    const want = Math.max(0, Math.round(extra))
    const card = boundsOf(win)
    const { workArea } = screen.getDisplayMatching(card)
    // Off the screen's foot the room would hide the pop-up: the box grows instead (window:fit), as before.
    if (want && card.y + card.height + BOX_ROOM.bottom + want > workArea.y + workArea.height) return false
    setRoom(win, { ...(rooms.get(win) ?? BOX_ROOM), bottom: Math.max(hintBelow, BOX_ROOM.bottom + want) })
    return true
  })
  // The box at a height at once, answered once the window is there with its inner height, so the page can draw what
  // needs that room in the frame the window has it (a word's meaning grown out of the pill, fit-box's prepare).
  ipcMain.handle('window:fit-now', async (event, height: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== prompt || typeof height !== 'number' || !Number.isFinite(height)) return null
    fit = height
    await refit(win, true)
    return win.isDestroyed() ? null : win.getContentBounds().height
  })
  ipcMain.on('window:fit', (event, height: unknown, snap: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    // A small window grows with its words by the same ask (small-window.ts).
    if (win && typeof height === 'number' && Number.isFinite(height) && fitSmall(win, height)) return
    if (!win || win !== prompt || typeof height !== 'number' || !Number.isFinite(height)) return
    fit = height
    void refit(win, snap === true)
    if (!promptPainted) {
      promptPainted = true
      reached('boxDrawn')
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
  ipcMain.handle('save-file', async (_event, name: unknown, bytes: unknown) =>
    typeof name === 'string' && bytes instanceof Uint8Array ? storeFile(name, bytes) : '')
  async function storeFile(name: string, bytes: Uint8Array): Promise<string> {
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
  }

  // Files opened with Haligtree from Finder (fromFinder, above), now that the store and the book are up.
  openFinderFile = async (path) => {
    const name = basename(path)
    try {
      if (/\.pdf$/i.test(name)) {
        // Into Media with no note, as every file sent from Finder goes, then open. Stored by its bytes, so the same book opened again, under any name, is the one already kept.
        const told = await addMedia([{ path }])
        const book = [...told.added, ...told.revived, ...told.met][0]
        if (!book) return inHome('haligtree:toast', { text: addSaid(told), tone: 'warning' })
        return sendHome('pdf', pdfsToFind(database()).find((one) => one.id.startsWith(`${book.src}|`))?.id ?? `${book.src}|${name}`)
      }
      const before = alreadyImported(path)
      const made = before ?? importNote(path, await readFile(path, 'utf8'), (await stat(path)).mtime, false, true)
      if (made === 'empty') return inHome('haligtree:toast', { text: `${name} is empty, so there was nothing to bring in.`, tone: 'info' })
      if (made === 'already here' || made === 'updated') return
      if (!before) {
        changed()
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('imports:ready')
      }
      const [type, id] = made.link.startsWith('article:') ? ['article', made.link.slice(8)] : made.link.startsWith('nugget:') ? ['nugget', made.link.slice(7)] : ['capture', made.link]
      sendHome(type, id)
    } catch (error) {
      inHome('haligtree:toast', { text: `${name} could not be opened: ${error instanceof Error ? error.message : String(error)}`, tone: 'error' })
    }
  }
  for (const path of finderFiles.splice(0)) void openFinderFile(path)
  // Files sent from Finder's right-click ("Send to Haligtree", services.ts): any file but Markdown or text goes into Media
  // as Media's own "Add" takes them, no note made, saying the same words; Markdown or text comes in as one opened with Haligtree does.
  whenFilesSent(async (paths) => {
    const words = paths.filter((path) => /\.(md|markdown|txt)$/i.test(path))
    for (const path of words) await openFinderFile!(path).catch(() => undefined)
    const files = paths.filter((path) => !words.includes(path))
    const told = files.length ? await addMedia(files.map((path) => ({ path }))) : null
    if (told) {
      // Said in the main window, with Undo, as any add is.
      inHomeQuietly('haligtree:media-told', told)
    }
    return { words: words.length, said: told ? addSaid(told) : '' }
  })
  // ⌘K on a file with no note, from any window: Media, on that tile.
  ipcMain.handle('haligtree:media:show', (_event, src: unknown) => {
    // On the file's own kind, written into the step it opens, so its tile is drawn and Back finds it there.
    const kind = kindByEnd(String(src))
    sendHome('view', 'media', kind ? `kind:${kind === 'gif' ? 'picture' : kind}` : undefined)
    inHome('haligtree:media-file', String(src))
  })

  // A link to a PDF on the web, opened in the reader: fetched once into the
  // book's own files, as a card's picture is, and kept by its address, so
  // opening it again needs no trip and works offline.
  ipcMain.handle('pdf-fetch', async (_event, href: unknown) => {
    if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return null
    database().exec('create table if not exists pdf_downloads (href text primary key, src text not null, name text not null)')
    const kept = database().prepare('select src, name from pdf_downloads where href = ?').get(href) as { src: string; name: string } | undefined
    if (kept && existsSync(join(assetsDir(), kept.src.replace('haligtree://assets/', '')))) return kept
    try {
      const response = await fetchOutside(href, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) return null
      const bytes = new Uint8Array(await response.arrayBuffer())
      // A PDF by its first bytes, whatever the server called it.
      if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') return null
      const last = decodeURIComponent(new URL(href).pathname.split('/').pop() ?? '')
      const name = /\.pdf$/i.test(last) ? last : `${last || 'document'}.pdf`
      const src = await storeFile(name, bytes)
      if (!src) return null
      database().prepare('insert or replace into pdf_downloads (href, src, name) values (?, ?, ?)').run(href, src, name)
      return { src, name }
    } catch {
      return null
    }
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

    // Set as a book page is (the user: "pdf export looks like dogshit"): a serif at 11pt on a 32em measure, headings
    // that step down in size with more room above than below, task boxes drawn, quotes and callouts in a quiet
    // band, pictures whole and never cut across a page, the title and page number at the foot of every page.
    const title = name.replace(/\.pdf$/i, '')
    // Letter where the Mac is set to a country that uses it, A4 everywhere else.
    const paper = /[-_](US|CA|MX|PH|CL|CO|VE)$/i.test(app.getLocaleCountryCode() ? `-${app.getLocaleCountryCode()}` : app.getLocale()) ? 'letter' : 'A4'
    const sheet = `@page{size:${paper};margin:22mm 0 20mm}
      html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font:11pt/1.55 "New York","Iowan Old Style",Charter,Georgia,serif;color:#1c1b19;margin:0 auto;max-width:32em;padding:0 2em;
        font-variant-numeric:oldstyle-nums proportional-nums;hanging-punctuation:first;text-rendering:optimizeLegibility;orphans:3;widows:3}
      h1,h2,h3,h4{font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;line-height:1.2;letter-spacing:-.01em;break-after:avoid;text-wrap:balance;font-weight:650}
      h1{font-size:22pt;margin:0 0 .6em}h2{font-size:15pt;margin:1.8em 0 .5em}h3{font-size:12.5pt;margin:1.5em 0 .4em}h4{font-size:11pt;margin:1.3em 0 .3em}
      p{margin:0 0 .75em}a{color:inherit;text-decoration:underline;text-decoration-color:#b9b2a5;text-underline-offset:.15em}
      strong{font-weight:650}mark{background:#f6e7a8;color:inherit;padding:0 .1em;border-radius:2px}
      ul,ol{margin:0 0 .75em;padding-left:1.4em}li{margin:.15em 0}li>p{margin:0}
      ul[data-type=taskList]{list-style:none;padding-left:0}
      ul[data-type=taskList] li{display:flex;gap:.55em;align-items:baseline}
      ul[data-type=taskList] li>label{flex:none}ul[data-type=taskList] li>div{flex:1}
      ul[data-type=taskList] input{appearance:none;width:.8em;height:.8em;border:1.2px solid #8d877c;border-radius:50%;margin:0;position:relative;top:.08em}
      ul[data-type=taskList] li[data-checked=true]>div{color:#8d877c;text-decoration:line-through;text-decoration-color:#b9b2a5}
      ul[data-type=taskList] li[data-checked=true] input{background:#8d877c}
      blockquote{margin:1em 0;padding:.1em 0 .1em 1em;border-left:2px solid #d6d0c4;color:#4a463f;font-style:italic}
      [data-callout]{margin:1em 0;padding:.7em 1em;background:#f4f1ea;border-radius:6px;break-inside:avoid}
      [data-callout]>:last-child,blockquote>:last-child{margin-bottom:0}
      hr{border:0;border-top:1px solid #d6d0c4;margin:1.8em 25%}
      img,video{display:block;max-width:100%;max-height:220mm;height:auto;margin:1em auto;border-radius:4px;break-inside:avoid}
      figure{margin:1em 0;break-inside:avoid}figcaption,[data-caption]{font:9pt/1.4 -apple-system,system-ui,sans-serif;color:#6b665d;text-align:center;margin-top:.4em}
      code{font:.88em ui-monospace,"SF Mono",Menlo,monospace;background:#f4f1ea;padding:.05em .3em;border-radius:3px}
      pre{font:9pt/1.5 ui-monospace,"SF Mono",Menlo,monospace;background:#f4f1ea;padding:.8em 1em;border-radius:6px;white-space:pre-wrap;break-inside:avoid}
      pre code{background:none;padding:0;font-size:inherit}
      table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92em;break-inside:avoid}
      td,th{border-bottom:1px solid #e2ddd3;padding:.4em .6em;text-align:left;vertical-align:top}th{font-weight:650;border-bottom-color:#b9b2a5}
      .tiptap-note-link-icon,[data-drag-handle],button{display:none}`
    const escaped = (text: string): string => text.replace(/[&<>"]/g, (one) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[one]!)
    const foot = `<div style="width:100%;font:8pt -apple-system,system-ui,sans-serif;color:#8d877c"><div style="width:352pt;margin:0 auto;display:flex;justify-content:space-between"><span>${escaped(title)}</span><span class="pageNumber"></span></div></div>`

    // The beam turns in every window while the PDF is laid out and written.
    return busy(async () => {
      const printer = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
      // The page from a file of its own, never a `data:` address: the largest notes' pages (1.7 million characters
      // of HTML) are past Chromium's 2 MB limit for an address, and their export failed (ERR_INVALID_URL).
      const page = join(app.getPath('temp'), `haligtree-print-${randomUUID()}.html`)
      try {
        await writeFile(page, `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escaped(title)}</title><style>${sheet}</style><body>${html}</body></html>`)
        await printer.loadFile(page)
        // Every picture drawn before the page is printed: one still loading printed as a blank box.
        await printer.webContents.executeJavaScript('Promise.all([...document.images].map((one) => one.complete ? 0 : new Promise((done) => (one.onload = one.onerror = done)))).then(() => document.fonts.ready).then(() => 0)')
        const pdf = await printer.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: foot
        })
        await writeFile(filePath, pdf)
        return true
      } finally {
        printer.destroy()
        await rm(page, { force: true })
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

  // A stored file reaches another app only as a copy outside Haligtree's own
  // folder (app-folder.ts): the store names files by their hash, so the copy
  // takes the name it was shown with (or "Picture"), in a temporary folder.
  // `fresh`: made again from the stored file, so a copy changed in another
  // app never stands in for it. A clone where the disk can make one (APFS):
  // no bytes copied, however large the file. null: no such stored file.
  const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'heic', 'svg'])
  const copyOut = (src: unknown, name: unknown, fresh: boolean): { stored: string; from: string; to: string } | null => {
    const stored = typeof src === 'string' ? src.replace('haligtree://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(stored)) return null
    const from = join(assetsDir(), stored)
    if (!existsSync(from)) return null
    const extension = stored.split('.').pop()!
    const said = (typeof name === 'string' ? name : '').replace(/[/\\:\0]/g, ' ').trim().slice(0, 120)
    const file = said ? (said.toLowerCase().endsWith(`.${extension}`) || (extension === 'jpg' && /\.jpe?g$/i.test(said)) ? said : `${said}.${extension}`) : `${IMAGE_EXT.has(extension) ? 'Picture' : 'File'}.${extension}`
    const dir = join(app.getPath('temp'), 'haligtree-drag', stored.slice(0, 12))
    const to = join(dir, file)
    try {
      mkdirSync(dir, { recursive: true })
      if (fresh) rmSync(to, { force: true })
      if (!existsSync(to)) copyFileSync(from, to, constants.COPYFILE_FICLONE)
    } catch {
      return null
    }
    return { stored, from, to }
  }

  // "Import as a note" from Files' preview of a Markdown or text file: a copy under its own name, brought in and opened
  // exactly as the same file opened from Finder is (openFinderFile), so its name, words and notice are the same.
  ipcMain.handle('haligtree:media:as-note', async (_event, src: unknown, name: unknown) => {
    if (!/\.(md|markdown|txt|text)$/i.test(String(name ?? '')) || !openFinderFile) return false
    const copy = copyOut(src, name, true)
    if (!copy) return false
    await openFinderFile(copy.to)
    return true
  })
  // "Open in its app": a copy, never the stored file, handed to whatever the system opens it with.
  ipcMain.handle('open-file', async (_event, src: unknown, name: unknown) => {
    const copy = copyOut(src, name, true)
    return !!copy && (await openOutside(copy.to)) === ''
  })

  // A stored picture or file dragged out of a note to another app (Finder, a
  // chat, a browser): the system drag starts here, with a copy (copyOut).
  ipcMain.on('drag-out', async (event, src: unknown, name: unknown, card: unknown) => {
    const copy = copyOut(src, name, false)
    if (!copy) return
    const { stored, to } = copy
    const extension = stored.split('.').pop()!
    // What follows the pointer: the picture itself, small, or for any other
    // file the small card the note drew of it (drag-out.ts); Haligtree's icon
    // only if neither could be made.
    const PNG = 'data:image/png;base64,'
    // Drawn at twice its size, for sharp edges on a Retina screen.
    const drawn = typeof card === 'string' && card.startsWith(PNG) ? nativeImage.createFromBuffer(Buffer.from(card.slice(PNG.length), 'base64'), { scaleFactor: 2 }) : nativeImage.createEmpty()
    // A picture's own small copy, drawn by the Mac outside this thread (opened here whole, a 10,446 by 13,522 painting
    // held every window for seconds as the drag began), in the picture's own shape: asked for in a square, the Mac pads
    // it out to one. Its shape is the one kept for it (pictures.ts), or taken as square when none is kept yet.
    const [w, h] = known(stored) ?? [1, 1]
    const box = w >= h ? { width: 192, height: Math.max(1, Math.round((192 * h) / w)) } : { width: Math.max(1, Math.round((192 * w) / h)), height: 192 }
    const small = IMAGE_EXT.has(extension) ? await smallCopy(stored, 256) : null
    let face = small ? nativeImage.createFromPath(small).resize(box) : drawn
    if (!face.isEmpty() && face !== drawn) face = face.resize({ width: Math.min(96, face.getSize().width) })
    if (face.isEmpty()) face = nativeImage.createFromPath(icon).resize({ width: 64 })
    if (face.isEmpty()) face = nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 128), { width: 32, height: 32 })
    event.sender.startDrag({ file: to, icon: face })
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
    // type most apps never ask for, so nothing pasted. A PNG goes as its own
    // bytes; any other picture is turned into one at its own size by the Mac's
    // `sips` in a process of its own (media.ts), a GIF as its first frame. Read
    // whole and written out again on this thread, a 24-megapixel photograph held
    // every window (qa/main-holds.mjs). What sips can't read (an SVG) the system's
    // thumbnailer may draw; anything else goes as its own type.
    const path = join(assetsDir(), name)
    const turned = extension === 'png' ? null : await turnedCopy(path, null, name)
    try {
      const drawn = extension === 'png' || turned ? null : await nativeImage.createThumbnailFromPath(path, { width: 4096, height: 4096 }).catch(() => null)
      const png = extension === 'png' ? await readFile(path) : turned ? await readFile(turned) : drawn && !drawn.isEmpty() ? drawn.toPNG() : null
      await pasteboard.write([new ClipboardItem(png ? { 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) } : { [mime]: new Blob([await readFile(path)], { type: mime }) })])
      return true
    } catch {
      return false
    } finally {
      if (turned) await rm(turned, { force: true })
    }
  })

  // A note drawn as a picture (renderer lib/note-picture.ts): the renderer lays
  // the blocks out over the window in a frame of their own, and this takes what
  // the window shows there, at the screen's own sharpness.
  ipcMain.handle('picture-of-rect', async (event, rect: unknown) => {
    const { x, y, width, height } = (rect ?? {}) as Record<string, unknown>
    if (![x, y, width, height].every((one) => typeof one === 'number' && Number.isFinite(one)) || (width as number) <= 0 || (height as number) <= 0) return null
    const image = await event.sender.capturePage({ x: Math.round(x as number), y: Math.round(y as number), width: Math.round(width as number), height: Math.round(height as number) })
    return image.isEmpty() ? null : new Uint8Array(image.toPNG())
  })

  ipcMain.handle('copy-picture', async (_event, bytes: unknown) => {
    if (!(bytes instanceof Uint8Array) || nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty()) return false
    await pasteboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })])
    return true
  })

  ipcMain.handle('save-picture', async (_event, name: unknown, bytes: unknown) => {
    if (typeof name !== 'string' || !(bytes instanceof Uint8Array)) return false
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name, filters: [{ name: 'PNG picture', extensions: ['png'] }] })
    if (canceled || !filePath) return false
    await writeFile(filePath, bytes)
    return true
  })

  // The clipboard's picture as the system draws it. A paste from Apple Notes
  // hands the page a file that points into Notes' own folder and cannot be
  // read; the picture itself is still on the clipboard, and this reads it.
  // A TIFF (what Notes often offers) goes through the system's reader into a PNG.
  // (Files copied in Finder are in the paste itself, each with where it lies: the page takes them from there,
  // extensions/image-drop.ts. Their names were asked here, with a call that waited on main at every paste.)
  ipcMain.handle('clipboard-image', async () => {
    try {
      for (const item of await pasteboard.read()) {
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
    // Without this the toolkit blocks Cmd+- outright, so the page never hears
    // it and the app could only grow. See @electron-toolkit/utils watchWindowShortcuts.
    optimizer.watchWindowShortcuts(window, { zoom: true })
    // No page zoom, ever: ⌘+ and ⌘− are the app's own size (a saved setting).
    // Chromium keeps a zoom per address and remembers it, so one grown before
    // would come back in a window drawn to a size in pixels, the pill cut off
    // at its right edge: each page is put back at 1 as it loads, and pinching
    // does nothing.
    const { webContents } = window
    const unzoom = (): void => {
      if (webContents.isDestroyed()) return
      if (webContents.getZoomFactor() !== 1) webContents.setZoomFactor(1)
      void webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined)
    }
    webContents.on('did-finish-load', unzoom)
    webContents.on('zoom-changed', unzoom)
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

      // Named as the reader names the page (article-names.ts): a front page calling itself only "Home" by its next name,
      // its og:title, its <title> or its first heading, without the site's name, which the card shows on its own line.
      const titles = [
        meta('og:title'),
        decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''),
        decode((html.match(/<h1[^>]*>([^]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, ''))
      ]
      const scraped = {
        href: target.href,
        title: titles.some((one) => one.trim()) ? articleNames({ titles, siteName: meta('og:site_name'), publisher: '', hostname: base.hostname }).title : target.href,
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
  // The reader's pictures (web-articles.ts) are kept the same way, told why one was not, and stopped with the reading.
  const keepWhy = async (src: string, stop?: AbortSignal): Promise<string | Missed> => {
    if (!/^https?:/.test(src)) return src
    try {
      // A picture on this machine or its network is not one to show, either.
      if (!(await isOutside(new URL(src)))) return ''
      const response = await fetchOutside(src, { signal: stop ? AbortSignal.any([AbortSignal.timeout(8000), stop]) : AbortSignal.timeout(8000) })
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim()
      // Only a picture, and only one of a sane size: a card is no reason to download a film.
      if (!response.ok || !EXTENSIONS[mime] || Number(response.headers.get('content-length')) > PICTURE_CAP) return { why: 'refused' }
      const bytes = new Uint8Array(await response.arrayBuffer())
      return (bytes.byteLength <= PICTURE_CAP && (await storeImage(mime, bytes))) || { why: 'refused' }
    } catch (error) {
      return { why: stop?.aborted ? 'stopped' : (error as Error)?.name === 'TimeoutError' ? 'slow' : 'unreached' }
    }
  }
  const keep = async (src: string): Promise<string> => {
    const kept = await keepWhy(src)
    return typeof kept === 'string' ? kept : src
  }
  // A YouTube thumbnail in 16:9, without the black bands its 4:3 ones carry:
  // the sharpest size where the video has one, else the size every video has.
  const keepWide = async (src: string): Promise<string> => {
    const max = wideThumb(src, 'maxresdefault')
    if (!max) return keep(src)
    const kept = await keep(max)
    return /^https?:/.test(kept) ? keep(wideThumb(src)!) : kept
  }
  // The site's own addresses go along as imageSource and iconSource, so
  // nothing is lost by keeping the copies.
  // A few pages at a time: about 60 links pasted at once were all asked together, waited behind one another for the
  // network, and each ran out its 8 seconds before its page answered, so every card fell back to its plain link, while
  // one link alone came through. Each waits its turn here, its 8 seconds counted from when it is asked.
  const AT_ONCE = 4
  let asking = 0
  const turns: (() => void)[] = []
  const inTurn = async <T,>(job: () => Promise<T>): Promise<T> => {
    // A turn ending hands its place straight to the next in line.
    if (asking >= AT_ONCE) await new Promise<void>((go) => turns.push(go))
    else asking++
    try {
      return await job()
    } finally {
      const next = turns.shift()
      if (next) next()
      else asking--
    }
  }
  ipcMain.handle('fetch-link-metadata', (_event, url: unknown) => inTurn(async () => {
    const found = await lookUp(url)
    const [image, icon] = await Promise.all([keepWide(found.image), keep(found.icon)])
    return { ...found, image, icon, imageSource: found.image, iconSource: found.icon }
  }))
  // A web page in the reader: its article kept offline, its pictures kept as a card's are.
  registerWebArticles(keepWhy)
  // Wikipedia and the other free sites, searched from ⌘K when asked (free-sites.ts).
  registerFreeSites()
  // A card made before its pictures were kept, or imported with the site's
  // addresses: the very pictures it shows, kept now. Each one that cannot be
  // fetched comes back as it was.
  ipcMain.handle('keep-card-pictures', async (_event, image: unknown, icon: unknown) => {
    const [kept, keptIcon] = await Promise.all([keepWide(typeof image === 'string' ? image : ''), keep(typeof icon === 'string' ? icon : '')])
    return { image: kept, icon: keptIcon }
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
    // Dates, emoji and the check of a save (src/main/lazy), read a moment later while nothing waits, so their first
    // use is instant; the Mac's spellchecker woken with them (spell-check.ts), and new pictures' copies begun (scenery.ts).
    setTimeout(() => (warmChrono(), void warmEmoji(), warmZod(), wakeSpelling(), startCopies()), 1000)
  }
  if (!startedAtLogin || firstRun() || process.argv.includes('--show-home')) {
    openHome()
    // Once it is on screen; should macOS not say so, a moment after its page has drawn itself (three seconds at most,
    // whenHomeDrawn), never before it: counted from its first paint, quick capture and the menu bar icon were made
    // before the main window showed once it waited for its whole first screen (windows/home.tsx).
    makeHome().once('show', () => setImmediate(theRest))
    whenHomeDrawn(() => setTimeout(theRest, 1000))
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
  // What each chord from anywhere runs, for a probe to press it (qa/sticky-keys.mjs): the Mac's own keys cannot be sent from a test.
  const chordRuns = new Map<string, () => void>()
  ;(globalThis as { haligtreeChords?: Map<string, () => void> }).haligtreeChords = chordRuns
  const anywhere = (keys: Record<string, string | null>): void => {
    // The menus say the keys as they are now.
    chosenKeys = keys
    updateTray()
    appMenu()
    globalShortcut.unregisterAll()
    const take = (made: string, run: () => void): void => {
      const now = made in keys ? keys[made] : made
      const chord = accelerator(now)
      // Told to the welcome, which offers another key when the one it teaches is taken.
      const ok = !!chord && !pretendTaken(now) && globalShortcut.register(chord, run)
      chordRuns.set(made, run)
      if (chord && !ok) console.error(`Could not register ${chord}: something else already has it`)
      noteChord(made, now, ok)
    }
    take('⌘.', toggleWindow)
    // A new note in a small window of its own, quick capture left free.
    take('⌥⌘.', () => smallWindows?.open(null))
    take('⇧⌘.', () => void areaIntoBox())
    // Safe mode's ⌥⌘S is the menu bar's (app-menu.ts), not the whole Mac's: taken here, it was VS Code's and Xcode's “Save All” too.
    take('⌃⌥⌘N', keyed(() => showStickies()))
    take('⌃⌥⌘T', keyed(() => void tidyStickies()))
    // Every open card folded into its pill at the edge, or the ones it folded opened again.
    take('⌃⌥⌘H', keyed(foldDesk))
    // Ten more minutes on the session or break running, from anywhere; the pill rolls its time up and says so.
    take('⌃⌥⌘=', () => void extendRunning(10 * 60_000))
    // A bare focus session from anywhere, no task first: ⌘K opens on “Start focus”'s lengths.
    take('⌃⌥⌘S', askFocus)
    // Record a meeting from anywhere; while one records, the same key notes the moment.
    take('⌃⌥⌘M', () => void startMeeting())
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
  // No timer is left to read the database once it is shut.
  stopTimers()
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


