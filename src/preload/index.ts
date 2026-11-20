import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { channels } from './hear'
import type { Frost, LinkMetadata, LookPicture } from './index.d'
import type { Capture, CaptureMeta, CapturePatch, Change, SaveResult } from '../main/captures'
import type { Moment } from '../main/celebrate'
import type { Slept } from '../main/session-log'
import type { PictureLines } from '../main/picture-words'
import { standInClipboard } from './stand-in-clipboard'

// A test run's pages copy to and paste from main's stand-in, never the Mac's clipboard (main/pasteboard.ts).
if (process.env.HALIGTREE_QA_AWAY)
  contextBridge.executeInMainWorld({
    func: standInClipboard,
    args: [{ write: (items: Record<string, Uint8Array>[]) => ipcRenderer.invoke('qa:pasteboard-write', items), read: () => ipcRenderer.invoke('qa:pasteboard-read') }]
  })

// Every live view listens for changes; one IPC listener tells them all,
// rather than one each past Node's limit of ten.
// Each says which kinds of note it shows; none means everything.
// Every channel a page listens to goes through one listener on the wire
// (hear.ts), so many parts of a page hearing "shown" and "put away" at once
// (each looping picture, the beam, the glide, the box's notices) never pile
// up on IpcRenderer itself.
const heard = channels(ipcRenderer)

const changes = new Map<(what: Change[] | null) => void, Change['kind'][] | undefined>()
// A burst of changes, an import or several saves in a row, is told once,

// with every note it touched (null: anything may have changed).
let telling: ReturnType<typeof setTimeout> | undefined
let told: Change[] | null | undefined
heard.on('captures:changed', (_event, what: Change[] | null) => {
  told = told === null || !what ? null : [...(told ?? []), ...what]
  clearTimeout(telling)
  telling = setTimeout(() => {
    const now = told ?? null
    told = undefined
    changes.forEach((kinds, listen) => {
      if (!now || !kinds || now.some((one) => kinds.includes(one.kind))) listen(now)
    })
  }, 60)
})

let listed: { rows: CaptureMeta[]; version: number } | null = null

// A note opened in a window of its own, told by the main process to every
// other window, which closes it there: two editors on one note would each
// save over the other's words.
heard.on('collect:item', (_event, copied: unknown) => window.dispatchEvent(new CustomEvent('haligtree:collect-item', { detail: copied })))
heard.on('collect:state', (_event, on: boolean) => window.dispatchEvent(new CustomEvent('haligtree:collect-state', { detail: on })))
heard.on('notes:opened-apart', (_event, id: string) => window.dispatchEvent(new CustomEvent('haligtree:opened-apart', { detail: id })))
// A note moving between the main window and its own (lib/apart.ts): its window
// closed, a caret carried in, or asked to go back home.
heard.on('notes:apart', (_event, what: string, link: string) => window.dispatchEvent(new CustomEvent('haligtree:apart', { detail: { what, link } })))
// A small window told something by main (main/small-window.ts): resized by hand, it stopped growing with the words.
heard.on('small:said', (_event, what: string, value: unknown) => window.dispatchEvent(new CustomEvent('haligtree:small', { detail: { what, value } })))
// The menu bar's Reset the sandbox: asked in the pill, where Start over is held.
heard.on('sandbox:ask-reset', () => window.dispatchEvent(new CustomEvent('haligtree:sandbox-reset')))
// The View menu's app size items, pressed or clicked: offered first to what is in
// front (a PDF zooms its pages), else the page steps the size (lib/editor-setup.ts).
heard.on('menu:app-size', (_event, way: 1 | -1 | 0) => {
  if (window.dispatchEvent(new CustomEvent('haligtree:zoom-key', { detail: way, cancelable: true }))) window.dispatchEvent(new CustomEvent('haligtree:app-size', { detail: way }))
})
// The web reader's pictures, each settled as it comes after the words (main/web-articles.ts), and how many are.
heard.on('article:picture', (_event, reading: string, href: string, at: number, html: string) => window.dispatchEvent(new CustomEvent('haligtree:article-picture', { detail: { reading, href, at, html } })))
heard.on('article:pictures', (_event, reading: string, href: string, settled: number, total: number) => window.dispatchEvent(new CustomEvent('haligtree:article-pictures', { detail: { reading, href, settled, total } })))
// View > Read the Page Again (⌘R): the reader in front takes it.
heard.on('menu:read-again', () => window.dispatchEvent(new Event('haligtree:read-again')))
// Edit > Select All from the menu bar: a list with the focus takes it
// (lib/select-all.ts cancels the event); otherwise the words, as before.
heard.on('menu:select-all', () => {
  if (window.dispatchEvent(new Event('haligtree:select-all', { cancelable: true }))) document.execCommand('selectAll')
})
// File > Close (⌘W): the page closes what is open in front if it can (it cancels the event); otherwise the window.
heard.on('menu:close', () => {
  if (window.dispatchEvent(new Event('haligtree:close-front', { cancelable: true }))) window.close()
})
// A note renamed and the links to it written again: the window it was renamed in says so, with an Undo.
heard.on('links:renamed', (_event, info: unknown) => window.dispatchEvent(new CustomEvent('haligtree:links-renamed', { detail: info })))
// How far into a recording its words have been made out (main/transcribe.ts), as each part comes.
heard.on('transcribe:heard', (_event, src: string, seconds: number) => window.dispatchEvent(new CustomEvent('haligtree:transcribe-heard', { detail: { src, seconds } })))
// A book made, renamed or deleted: every list of them looks again.
heard.on('books:changed', () => window.dispatchEvent(new CustomEvent('haligtree:books-changed')))
// A word learnt or unlearnt (spell-check.ts): what each page was told about spelling is asked afresh.
heard.on('spelling:changed', () => window.dispatchEvent(new CustomEvent('haligtree:spelling-changed')))
// A YouTube player YouTube would not serve here (sent on to its "sorry" page): the block says so (youtube-view.tsx).
heard.on('video:refused', (_event, src: string) => window.dispatchEvent(new CustomEvent('haligtree:video-refused', { detail: src })))

type RoomHere = { left: number; top: number; right: number; bottom: number; side?: 'above' | 'below' | 'left' | 'right' | null; menu?: number; pill?: number }
/** A sticky as its pill in the desk's stack (main's shapeCard): the stack's edge, and, opened, where the pill stands in the window and how wide the card is. */
export type PillPeek = { side: 'left' | 'right'; nudge: boolean; opened?: { pill: { x: number; y: number; width: number; height: number }; card: number; size: { width: number; height: number } } }
/** Quick capture's window: the one page that is not another kind's (main's pages.ts), and the only one with room round its card.
 * A small window (main/small-window.ts) is the same page in a window that is all card: never the box's room. */
const boxHere = /\/index\.html$/.test(window.location.pathname) && !new URLSearchParams(window.location.search).has('small')
/**
 * The room round this window's card, known at once. The box reads it from its own environment, where main wrote it
 * before the page loaded (main's `roomInEnv`): no call that waits on main, which held the box still while main was
 * busy. Asked the old way only by a box whose process was started without it. Every other window is all card.
 */
const roomHere = (): RoomHere =>
  !boxHere ? { left: 0, top: 0, right: 0, bottom: 0 } : process.env.HALIGTREE_BOX_ROOM ? JSON.parse(process.env.HALIGTREE_BOX_ROOM) : ipcRenderer.sendSync('window:room')
// Main moves the room for a hint and tells the page (onRoomHint): kept here too, in this process's own environment,
// so the page loaded again in the same process reads the room as it is now, not as it was when the process began.
if (boxHere) heard.on('window:room-hint', (_event, room: Partial<RoomHere>) => void (process.env.HALIGTREE_BOX_ROOM = JSON.stringify({ ...roomHere(), ...room })))

// Custom APIs for renderer
const api = {
  /** The Mac tells the time on a 12-hour clock ("9:05 PM"); read by dates.ts `clock`. */
  // Read from this window's own environment, where main put it before any window started (main/index.ts): no
  // call that waits on main. Asked the old way only by a window whose process was started without it.
  twelveHour: process.env.HALIGTREE_TWELVE ? process.env.HALIGTREE_TWELVE === '1' : ipcRenderer.sendSync('clock:twelve') === true,
  /** A test run: nothing is said aloud (read-aloud.ts). */
  quiet: !!process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_SOUND,
  /** A test run: a page names what held it past its limit, for the probes (lib/reads-in.tsx). */
  testRun: !!process.env.HALIGTREE_QA_AWAY,
  /** A test run may name the welcome's story (welcome-stories.ts): who the sandbox's characters are depends on which is told. */
  story: (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_STORY) || '',
  /** The book open now (or the sandbox), known at once: what a page drew last time is kept per book. */
  book: (): string => process.env.HALIGTREE_BOOK_HERE ?? String(ipcRenderer.sendSync('book:here')),
  fetchLinkMetadata: (url: string): Promise<LinkMetadata> =>
    ipcRenderer.invoke('fetch-link-metadata', url),
  /** A card's picture and icon kept with the notes: each comes back local, or as it was. */
  keepCardPictures: (image: string, icon: string): Promise<{ image: string; icon: string }> =>
    ipcRenderer.invoke('keep-card-pictures', image, icon),

  /** Store image bytes and get back the URL that reads them again. */
  saveImage: (mime: string, bytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('save-image', mime, bytes),

  /** Store any file and get back the URL that reads it again. */
  saveFile: (name: string, bytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('save-file', name, bytes),
  /** A PDF on the web, kept in the book's files once: where it is kept now, and its name. Null when it is not a PDF or cannot be fetched. */
  fetchPdf: (href: string): Promise<{ src: string; name: string } | null> => ipcRenderer.invoke('pdf-fetch', href),
  fetchArticle: (href: string, again?: boolean): Promise<{ article: { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }; reading?: string; error?: string } | { error: string } | { stopped: true }> => ipcRenderer.invoke('article-fetch', href, again),

  /** Write text to a file the user picks. */
  exportText: (name: string, text: string): Promise<boolean> =>
    ipcRenderer.invoke('export-text', name, text),

  /** Render HTML to a PDF at a path the user picks. */
  exportPdf: (name: string, html: string): Promise<boolean> =>
    ipcRenderer.invoke('export-pdf', name, html),

  /** Copy a stored file somewhere the user picks, under its original name. */
  saveFileAs: (src: string, name: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file-as', src, name),

  /** Open a copy of a stored file, under `name`, outside Haligtree's own folder, with whatever the system uses for it. */
  openFile: (src: string, name?: string): Promise<boolean> => ipcRenderer.invoke('open-file', src, name),

  /** What this window shows inside `rect` (CSS pixels), as a PNG: one slice of a note drawn as a picture (lib/note-picture.ts). */
  pictureOfRect: (rect: { x: number; y: number; width: number; height: number }): Promise<Uint8Array | null> =>
    ipcRenderer.invoke('picture-of-rect', rect),

  /** A PNG on the system clipboard, ready to paste anywhere. */
  copyPicture: (bytes: Uint8Array): Promise<boolean> => ipcRenderer.invoke('copy-picture', bytes),

  /** A PNG saved where the user picks; false when they cancel. */
  savePicture: (name: string, bytes: Uint8Array): Promise<boolean> => ipcRenderer.invoke('save-picture', name, bytes),

  /** Put a stored image on the system clipboard. */
  copyImage: (src: string): Promise<boolean> => ipcRenderer.invoke('copy-image', src),

  /** The words in a stored picture, read by the Mac (Apple's Vision): '' with none, null when it could not be read. */
  imageText: (src: string): Promise<string | null> => ipcRenderer.invoke('image-text', src),
  /** A photo of a page read whole (macOS 26): its title, paragraphs, lists and tables, top to bottom; null elsewhere. */
  imagePage: (src: string): Promise<({ heading: string } | { paragraph: string } | { list: string[]; ordered: boolean } | { table: string[][] })[] | null> => ipcRenderer.invoke('image-page', src),
  /** The same words with where each lies in the picture, for selecting them in place; kept after the first reading. */
  imageLines: (src: string): Promise<PictureLines | null> => ipcRenderer.invoke('image-lines', src),

  /** One light tap on a Force Touch trackpad (main/haptic.ts): a dragged row reached a new place. */
  tap: (): void => ipcRenderer.send('haptic:tap'),
  /** The firmer tap (the Mac's level change): a dial's stop clicking into place under the finger. */
  tapHard: (): void => ipcRenderer.send('haptic:tap', 'level'),

  /** Drag a stored picture or file out to another app: called from dragstart, the system drag starts from here. */
  dragOut: (src: string, name: string, face?: string): void => ipcRenderer.send('drag-out', src, name, face),
  /** Where a dropped file lies on disk, so a picture dragged out and back in is known as the same one. */
  pathOf: (file: File): string => webUtils.getPathForFile(file),

  /**
   * Whether the word at `start` in `text` is misspelt, what it might be, and the language the text was read as.
   * Asked without waiting: on a Mac of the Mac's own checker, the one that draws the underline, in the main
   * process (spell-check.ts), with the text round the word so the language is judged as the underline's is. Never
   * `webFrame.isWordMisspelled` there: that call holds the whole window until the main process answers, and froze
   * it on a caret move whenever main was busy. Other systems check in the page itself, the word alone.
   */
  spelling: (text: string, start: number, length: number): Promise<{ flagged: boolean; guesses: string[]; language: string } | null> => {
    if (process.platform === 'darwin') return ipcRenderer.invoke('spell:check', text, start, length)
    const word = text.slice(start, start + length)
    const flagged = webFrame.isWordMisspelled(word)
    return Promise.resolve({ flagged, guesses: flagged ? webFrame.getWordSuggestions(word) : [], language: '' })
  },
  /** “Learn spelling”: the word into the Mac's dictionary (`on` false: out of it again, the notice's Undo). Every window is told. */
  learnSpelling: (word: string, on = true): Promise<boolean> => ipcRenderer.invoke('spell:learn', word, on),
  /** A right-click the writing took to ask about its word, and has no menu for: the window's own menu, where main draws one (a sticky's). */
  ownMenu: (x: number, y: number, picked: string): void => ipcRenderer.send('menu:own', x, y, picked),

  /** The picture on the system clipboard, read by the system rather than from a pasted file that may not open. */
  clipboardImage: (): Promise<{ mime: string; bytes: Uint8Array } | null> => ipcRenderer.invoke('clipboard-image'),
  /** Collect what you copy anywhere on the Mac into this window's note (main/collect.ts). */
  collect: { start: (): Promise<boolean> => ipcRenderer.invoke('collect:start'), stop: (): Promise<void> => ipcRenderer.invoke('collect:stop') },

  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string): Promise<{ mime: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('fetch-image', href),

  /** Find pictures a note from Obsidian points at in the vaults Obsidian knows, and store them. */
  bringEmbeds: (refs: string[]): Promise<({ src: string; name: string; size: number; image: boolean } | null)[]> =>
    ipcRenderer.invoke('obsidian:bring', refs),

  /** Swap the window between the capture size and the roomier one. */
  setExpanded: (expanded: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:expand', expanded),
  /**
   * The side panel shown or shut: main puts the card at its new place inside the window it already has and gives back
   * the room round it and the window's size, for the page to draw the change (lib/box-morph.ts). Null for no card.
   */
  setPanel: async (open: boolean): Promise<(RoomHere & { width: number; height: number }) | null> => {
    const room = await ipcRenderer.invoke('window:panel', open)
    // Kept as main's room-hint is, for the page loaded again in this process.
    if (boxHere && room) process.env.HALIGTREE_BOX_ROOM = JSON.stringify({ ...roomHere(), left: room.left, top: room.top, right: room.right, bottom: room.bottom })
    return room
  },
  /** The box to the middle of its screen (⌃⌘C). */
  centreBox: (): void => ipcRenderer.send('window:centre'),
  /** The box's height as its writing needs it: it grows down to it, up to its full size. */
  fitBox: (height: number, snap = false): void => ipcRenderer.send('window:fit', height, snap),
  /** The room main keeps round this window's card (quick capture's overhang), 0 for a window that is all card. */
  room: roomHere(),
  /** Main changed the room round the card while the box was away, for a hint (above it, beside it, or none): the page moves its card to match and says so once drawn. */
  onRoomHint: (listen: (room: { top: number; left: number; right: number; bottom: number; side: 'above' | 'below' | 'left' | 'right' | null }) => void): (() => void) => {
    const relay = (_event: unknown, room: Parameters<typeof listen>[0]): void => listen(room)
    heard.on('window:room-hint', relay)
    return () => heard.off('window:room-hint', relay)
  },
  /** How many parts of this page listen on each channel from main now (a count that climbs as notes open and close is a leak). */
  listening: (): Record<string, number> => heard.counts(),
  roomDrawn: (): void => ipcRenderer.send('window:room-drawn'),
  /** When the box's draft turns into a leftover (null for no draft), told as the box goes away. */
  leftoverAt: (at: number | null): void => ipcRenderer.send('box:leftover-at', at),
  /** Main asks, before the box shows, for an old draft set aside; the page says once it has drawn the fresh box. */
  onSetAside: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('window:set-aside', relay)
    return () => heard.off('window:set-aside', relay)
  },
  asideDrawn: (): void => ipcRenderer.send('window:set-aside-drawn'),
  /**
   * This window picked up by the hand (quick capture's grabber, a sticky's card), at a point on the screen; carried to
   * each point the pointer moves to; put down. Screen points (an event's screenX and screenY): see lib/carry.ts.
   */
  grab: (screenX: number, screenY: number): void => ipcRenderer.send('window:grab', screenX, screenY),
  carry: (screenX: number, screenY: number): void => ipcRenderer.send('window:carry', screenX, screenY),
  letGo: (): void => ipcRenderer.send('window:let-go'),
  /** Quick capture back to where it first opens, the top middle of its screen. */
  boxHome: (): void => ipcRenderer.send('window:home'),
  /** Room below the card for a pop-up to hang into, the card staying put; false where the screen has none. */
  roomBelow: (px: number): Promise<boolean> => ipcRenderer.invoke('window:room-below', px),
  /** The box at `height` at once; answers with the window's inner height once it is there (null: no box window). */
  fitNow: (height: number): Promise<number | null> => ipcRenderer.invoke('window:fit-now', height),
  /** The main window: fill the screen, or back to its compact size. */
  fillHome: (fill: boolean | 'toggle'): Promise<boolean> => ipcRenderer.invoke('home:fill', fill),
  /** Told whenever the main window fills the screen or comes back from it. */
  onFilled: (listen: (filled: boolean) => void): (() => void) => {
    const relay = (_event: unknown, filled: boolean): void => listen(filled)
    heard.on('home:filled', relay)
    return () => heard.off('home:filled', relay)
  },
  /** The floating focus timer, shown or put away. */
  showFocus: (on: boolean): void => ipcRenderer.send('focus:show', on),
  /** How long the computer has gone untouched, in seconds. */
  idleSeconds: (): Promise<number> => ipcRenderer.invoke('idle:seconds'),
  /** The focus pill's right-click menu: resolves to what was chosen, or null. */
  focusMenu: (ticking: boolean, abandon = false, extend = false, endBreak = false, early = false): Promise<'tick' | 'abandon' | 'extend' | 'end' | 'early' | 'notch' | 'free' | null> => ipcRenderer.invoke('focus:menu', ticking, abandon, extend, endBreak, early),
  /** The pill's window, as tall as the island needs: it grows down from where it hangs. */
  focusSize: (height: number): Promise<boolean> => ipcRenderer.invoke('focus:size', height),
  /** Whether the pointer is over the pill's window right now, asked of the Mac rather than the page. */
  focusPointer: (): Promise<boolean> => ipcRenderer.invoke('focus:pointer'),
  /** Put the pill where Settings says it sits; the notch's height, or 0 where it is not under one. */
  focusPlace: (): Promise<{ notch: number }> => ipcRenderer.invoke('focus:place'),
  /** Told when where the pill sits has changed, or the screens have (`again`: woken, or a screen changed). */
  onFocusPlaced: (listen: (why?: 'again') => void): (() => void) => {
    const relay = (_event: unknown, why?: 'again'): void => listen(why)
    heard.on('focus:placed', relay)
    return () => heard.off('focus:placed', relay)
  },
  /** The Mac woke after sleeping in a session that Settings ended there: what ended, and how. */
  onFocusSlept: (listen: (slept: Slept) => void): (() => void) => {
    const relay = (_event: unknown, slept: Parameters<typeof listen>[0]): void => listen(slept)
    heard.on('focus:slept', relay)
    return () => heard.off('focus:slept', relay)
  },
  /** A screenshot of the pill's screen for the session's log, stored; denied without Screen Recording. */
  focusShot: (): Promise<{ url: string } | { denied: true; asked?: boolean; restart?: boolean; blank?: boolean } | null> => ipcRenderer.invoke('focus:shot'),
  /** A screenshot of the box's screen for its note, without Haligtree's windows; with the app in front there. */
  screenShot: (area = false): Promise<{ url: string; app: string } | { denied: true; asked: boolean; restart?: boolean } | { cancelled: true } | null> => ipcRenderer.invoke('shots:screen', area),
  /** The camera, asked for before its first use: granted or denied. */
  cameraAccess: (): Promise<'granted' | 'denied'> => ipcRenderer.invoke('shots:camera'),
  /** macOS's Privacy settings, at the camera's page or Screen Recording's. */
  privacySettings: (what: 'camera' | 'screen'): void => ipcRenderer.send('shots:privacy', what),
  /** Whether Haligtree can see the screen now: on, allowed but needing a restart, or off. */
  screenAccess: (): Promise<'on' | 'restart' | 'off'> => ipcRenderer.invoke('shots:access'),
  /** Haligtree started again, as it was (a permission turned on since becomes live). */
  restart: (): void => ipcRenderer.send('app:restart'),
  /** Light around the edge of the screen: a session or timer finished, or called off. */
  glow: (tone: 'done' | 'cancel' | 'break'): void => ipcRenderer.send('glow', tone),
  /** In the glow's own window: each glow, including one asked for while it loaded. */
  /** `rounded`: the screen is a Mac's own, with rounded corners and a notch, which the light follows. */
  onGlow: (listen: (tone: 'done' | 'cancel' | 'break', at?: { x: number; y: number } | null, rounded?: boolean) => void): (() => void) => {
    const relay = (_event: unknown, tone: 'done' | 'cancel' | 'break', at?: { x: number; y: number } | null, rounded?: boolean): void => listen(tone, at, rounded)
    heard.on('glow', relay)
    void (ipcRenderer.invoke('glow:waiting') as Promise<{ tone: 'done' | 'cancel'; rounded: boolean } | null>).then((was) => was && listen(was.tone, null, was.rounded))
    return () => heard.off('glow', relay)
  },
  /** In the meeting card's own window (and any window that cares): the meeting as it goes, and how loud each side is. */
  onMeeting: (listen: (live: unknown, level: { you: number; others: number } | null) => void): (() => void) => {
    const relay = (_event: unknown, live: unknown, level: { you: number; others: number } | null): void => listen(live, level)
    heard.on('meeting:live', relay)
    void (ipcRenderer.invoke('haligtree:meeting:state') as Promise<unknown>).then((live) => listen(live, null))
    return () => heard.off('meeting:live', relay)
  },
  /** The recordings left behind by a crash have changed: a recording ended, or another began. */
  onMeetingLeft: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('meeting:left', relay)
    return () => heard.off('meeting:left', relay)
  },
  /** In the nudge card's own window: each nudge, including those told while it loaded. */
  onNudge: (listen: (nudge: unknown) => void): (() => void) => {
    const relay = (_event: unknown, nudge: unknown): void => listen(nudge)
    heard.on('nudge', relay)
    void (ipcRenderer.invoke('nudge:waiting') as Promise<unknown[]>).then((all) => all.forEach(listen))
    return () => heard.off('nudge', relay)
  },
  /** In the nudge card's own window: a practice's offer is over (started or answered elsewhere, or now asked inside the main window), so its card goes. */
  onNudgeDrop: (listen: (id: string) => void): (() => void) => {
    const relay = (_event: unknown, id: string): void => listen(id)
    heard.on('nudge:drop', relay)
    return () => heard.off('nudge:drop', relay)
  },
  /** From the nudge card's window: a practice's card has left the corner, answered or let go. */
  practiceCardGone: (id: string): void => ipcRenderer.send('nudge:practice-gone', id),
  /** In the main window: the practice the corner's card is asking about now (null for none), now and as it changes. */
  practiceCorner: (): Promise<string | null> => ipcRenderer.invoke('practice:corner'),
  onPracticeCorner: (listen: (id: string | null) => void): (() => void) => {
    const relay = (_event: unknown, id: string | null): void => listen(id)
    heard.on('practice:corner', relay)
    return () => heard.off('practice:corner', relay)
  },
  /** In the sandbox's main window: its review reminder, said inside the window and never over the desktop. */
  onReviewOffered: (listen: (text: string, again: boolean) => void): (() => void) => {
    const relay = (_event: unknown, text: string, again: boolean): void => listen(text, again)
    heard.on('review:offered', relay)
    return () => heard.off('review:offered', relay)
  },
  /** In the main window: a practice is offered while this window is the place to ask it (it is in front, or it is the sandbox's). */
  onPracticeOffered: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('practice:offered', relay)
    return () => heard.off('practice:offered', relay)
  },
  /** The nudge card's height as its cards change; 0 hides it. */
  nudgeSize: (height: number): void => ipcRenderer.send('nudge:size', height),
  /** An answer that can be taken back on something floating on its own, told to the main window so its ⌘Z can (and asked back from it). */
  floatUndoable: (words: string): void => ipcRenderer.send('float:undoable', words),
  onFloatUndoable: (listen: (words: string) => void): (() => void) => {
    const relay = (_event: unknown, words: string): void => listen(words)
    heard.on('float:undoable', relay)
    return () => heard.off('float:undoable', relay)
  },
  floatUndo: (): void => ipcRenderer.send('float:undo'),
  onFloatUndo: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('float:undo', relay)
    return () => heard.off('float:undo', relay)
  },
  /** Show a nudge card from another window (the pill, when it is not on screen). */
  nudge: (nudge: unknown): void => ipcRenderer.send('nudge:show', nudge),
  /** Stick a note on the desktop in a small window of its own, or take it down. */
  stick: (type: string, id: string, on: boolean): void => ipcRenderer.send('sticky', type, id, on),
  /** Every sticky to the screen in front of you: the way back for one lost off an edge. */
  gatherStickies: (): void => ipcRenderer.send('stickies:gather'),
  /** Every sticky tidied down the right middle of its screen, and put back where it was. */
  tidyStickies: (): void => ipcRenderer.send('stickies:tidy'),
  untidyStickies: (): void => ipcRenderer.send('stickies:untidy'),
  /** Told, in the one window main picks, how many were tidied: for the toast with "Put them back". */
  onStickiesTidied: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    heard.on('stickies:tidied', relay)
    return () => heard.off('stickies:tidied', relay)
  },
  /** A note renamed by the app in the background (a recording named by what was said, long-names.ts): for its notice with Undo. */
  onRenamed: (listen: (renamed: { id: string; from: string; to: string; was: unknown[]; quiet?: boolean; fromEvent?: boolean }) => void): (() => void) => {
    const relay = (_event: unknown, renamed: { id: string; from: string; to: string; was: unknown[]; quiet?: boolean; fromEvent?: boolean }): void => listen(renamed)
    heard.on('names:renamed', relay)
    return () => heard.off('names:renamed', relay)
  },
  /** How many stickies are out on the screen, so Tidy stickies is offered only when there is something to tidy. */
  stickiesOut: (): Promise<number> => ipcRenderer.invoke('stickies:out'),
  onStickiesOut: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    heard.on('stickies:out', relay)
    return () => heard.off('stickies:out', relay)
  },
  /** Too many goals for cards of their own: they share the goals sticky now, this many of them. */
  onGoalsGathered: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    heard.on('goals:gathered', relay)
    return () => heard.off('goals:gathered', relay)
  },
  /** A picture folder of the person's own, from Settings, in Finder: '' when it opened, otherwise why not. */
  showFolder: (path: string): Promise<string> => ipcRenderer.invoke('folder:show', path),
  /** A sticky's pictures in Haligtree's own Quick Look, in a window over its screen rather than inside the small one. */
  look: (pictures: LookPicture[], at: number): void => ipcRenderer.send('look', pictures, at),
  /** The look window's own: what to show, and that it is done. */
  lookWhat: (): Promise<{ pictures: LookPicture[]; at: number } | null> => ipcRenderer.invoke('look:what'),
  lookDone: (): void => ipcRenderer.send('look:done'),
  /** The sticky's: its picture is back from the look window. */
  onLookOver: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('look:over', relay)
    return () => heard.off('look:over', relay)
  },
  /** A hidden sticky out again, from the nudge card's “Bring it back”. */
  unhideSticky: (key: string): void => ipcRenderer.send('sticky:unhide', key),
  /** A sticky sized from its corner grip. */
  resizeSticky: (width: number, height: number, done = false): void => ipcRenderer.send('sticky:resize', width, height, done),
  /** A sticky's own X or ⌘W: it peels off, and the window in sight offers "Put it back". */
  takeDownSticky: (title: string): void => ipcRenderer.send('sticky:takedown', title),
  putStickyBack: (): void => ipcRenderer.send('sticky:putback'),
  /** A sticky's own paper colour, kept by main; null for plain. */
  stickyTint: (): Promise<string | null> => ipcRenderer.invoke('sticky:tint'),
  /** "Open it": the note in the main window, growing out of the sticky; with `alt`, the sticky comes down. */
  openSticky: (tier: string, id: string, title: string, alt: boolean): void => ipcRenderer.send('sticky:open', tier, id, title, alt),
  /** A menu over a sticky, drawn in Haligtree's menu window at `at` (a point in this window); resolves to the place of the line chosen, or null. */
  stickyMenu: (items: unknown[], at?: { x: number; y: number }): Promise<number[] | null> => ipcRenderer.invoke('sticky:menu', items, at),
  /** A sticky's own lines chosen in its menu: open it, or take it down at once. */
  onStickyDo: (listen: (what: 'open' | 'down') => void): (() => void) => {
    const relay = (_event: unknown, what: 'open' | 'down'): void => listen(what)
    heard.on('sticky:do', relay)
    return () => void heard.off('sticky:do', relay)
  },
  /** The menu window's page (windows/menu.tsx): a menu to show, at a point, and told when to put it away. */
  onPopupMenu: (listen: (menu: { id: number; x: number; y: number; lines: unknown[] } | null) => void): (() => void) => {
    const show = (_event: unknown, menu: { id: number; x: number; y: number; lines: unknown[] }): void => listen(menu)
    const hide = (): void => listen(null)
    heard.on('menu:show', show)
    heard.on('menu:hide', hide)
    // Said to main, which sends a menu only to a page that hears it (popup-menu.ts).
    ipcRenderer.send('menu:listening')
    return () => void (heard.off('menu:show', show), heard.off('menu:hide', hide))
  },
  /** The menu window's answer: the place of the line chosen, or null when it was put away. */
  popupMenuDone: (id: number, path: number[] | null): void => ipcRenderer.send('menu:done', id, path),
  /** A sticky's page: told as its window comes in, peels off, is picked up or let go (`held`), or changes colour. */
  /** The pointer is over something drawn (true) or the clear room round the card (false): clicks there pass to the app behind (lib/clear-room.ts). */
  solid: (on: boolean): void => ipcRenderer.send('window:solid', on),
  /** Main asking, while clicks pass through, whether this point (in the window) sits over something drawn: an outside drag sends no moves. */
  onProbe: (listen: (x: number, y: number) => void): (() => void) => {
    const relay = (_event: unknown, x: number, y: number): void => listen(x, y)
    heard.on('window:probe', relay)
    return () => void heard.off('window:probe', relay)
  },
  /** A sticky's page has drawn what it holds: it may come onto the desktop now. */
  stickyReady: (): void => ipcRenderer.send('sticky:ready'),
  onStickyMotion: (listen: (what: 'arrive' | 'peel' | 'held' | 'tint', value?: unknown) => void): (() => void) => {
    const relays = (['arrive', 'peel', 'held', 'tint'] as const).map((what) => [`sticky:${what}`, (_event: unknown, value?: unknown): void => listen(what, value)] as const)
    for (const [channel, relay] of relays) heard.on(channel, relay)
    return () => { for (const [channel, relay] of relays) heard.off(channel, relay) }
  },
  /** In the window in sight: a sticky was taken down from its own X or ⌘W, by its title. */
  onStickyTaken: (listen: (title: string) => void): (() => void) => {
    const relay = (_event: unknown, title: string): void => listen(title)
    heard.on('sticky:taken', relay)
    return () => heard.off('sticky:taken', relay)
  },
  /** In the main window: the note just opened grows out of a small window's place on the screen (main/grow.ts). */
  onHomeGrow: (listen: (grow: { from: { x: number; y: number; width: number; height: number }; title: string; tint?: string; round?: number }) => void): (() => void) => {
    const relay = (_event: unknown, grow: { from: { x: number; y: number; width: number; height: number }; title: string; tint?: string; round?: number }): void => listen(grow)
    heard.on('home:grow', relay)
    return () => heard.off('home:grow', relay)
  },
  /** Pointed at: the window rises a little, and sets down once the pointer leaves. */
  lift: (): void => ipcRenderer.send('sticky:lift'),
  /** The pointer come onto the sticky's window (true) or gone from it (false), from the page's own pointer events. */
  pointerOn: (on: boolean): void => ipcRenderer.send('sticky:pointer', on),
  /** The pointer resting on a pill (it opens out of it), or on a goal's card (it stays) or off it. */
  holdBeacon: (on: boolean): void => ipcRenderer.send('beacon:hold', on),
  /** A click on a pill or on the card it opened: pinned open (true); the card's “–”: folded back into its pill (false). */
  pinSticky: (on: boolean): void => ipcRenderer.send('sticky:pin', on),
  /** A card on the desk by its key ("goal:…"), folded into its pill (true) or pinned open (false): the welcome's goal card. */
  deskPill: (key: string, on: boolean): void => ipcRenderer.send('desk:pill', key, on),
  /** The stack's last pill, past six: how many cards it stands for (0: only itself). */
  onPillMore: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    heard.on('pill:more', relay)
    return () => void heard.off('pill:more', relay)
  },
  /** That pill clicked: the cards it stands for, listed in the app's own menu at the point clicked. */
  pillMore: (x: number, y: number): void => ipcRenderer.send('sticky:more', x, y),
  /** A pill's words measured: its width in the desk's stack. */
  pillWidth: (width: number): void => ipcRenderer.send('sticky:pill-width', width),
  /** A card opened out of its pill, the pointer gone from it: fold it back into the pill (true), or, the pointer back on it midway, open again (false). */
  onBeaconFold: (listen: (on: boolean) => void): (() => void) => {
    const relay = (_event: unknown, on: boolean): void => listen(on)
    heard.on('beacon:fold', relay)
    return () => heard.off('beacon:fold', relay)
  },
  /** The fold back into the pill drawn: main makes the window the pill again. */
  beaconFolded: (): void => ipcRenderer.send('beacon:folded'),
  /** A sticky's frost: the desktop picture blurred, its screen and where the window is; asked once, then told on each change. */
  frost: (): Promise<Frost | null> => ipcRenderer.invoke('frost'),
  /** The main screen's desktop picture, small, for Settings' sticky material previews; null when it can't be read. */
  wallpaper: (): Promise<string | null> => ipcRenderer.invoke('wallpaper'),
  onFrost: (listen: (frost: Frost) => void): (() => void) => {
    const relay = (_event: unknown, frost: Frost): void => listen(frost)
    heard.on('frost', relay)
    return () => heard.off('frost', relay)
  },
  /** A sticky told to be its pill in the desk's stack on that edge (nudge: it came out by itself), or its whole card again (null); opened: the card grown out of its pill, the pill where it stands in the window and the card's width; instant: asked by a key, so it lands without a motion. */
  onBeaconPeek: (listen: (peek: PillPeek | null, instant?: boolean) => void): (() => void) => {
    // Told once it listens, what it was told wins: the answer to the question below can come after a newer word
    // (folded as the page loaded, then opened), and must never put the old shape back.
    let told = false
    const relay = (_event: unknown, peek: PillPeek | null, instant?: boolean): void => ((told = true), listen(peek, instant))
    heard.on('beacon:peek', relay)
    // As it starts listening: what it is now, in case it was told before (or before a reload).
    void ipcRenderer.invoke('beacon:peek:now').then((peek) => peek && !told && listen({ ...peek, nudge: false }), () => undefined)
    return () => heard.off('beacon:peek', relay)
  },
  /** Whether AeroSpace, the tiling window manager, is on this Mac (Settings shows its rule for the stickies). */
  aerospace: (): Promise<boolean> => ipcRenderer.invoke('aerospace:here'),
  /**
   * The desk (stickies, goal cards, their tabs) away for a meeting or quiet hours, or not: why, whether they are hidden
   * now, what “Step away in meetings” sees, and what the row under “Quiet hours” says. Asked once, then told on each change.
   */
  deskAway: (): Promise<{ why: 'meeting' | 'quiet' | null; hidden: boolean; seen: string; quiet: string }> => ipcRenderer.invoke('desk:away'),
  onDeskAway: (listen: (said: { why: 'meeting' | 'quiet' | null; hidden: boolean; seen: string; quiet: string }) => void): (() => void) => {
    const relay = (_event: unknown, said: { why: 'meeting' | 'quiet' | null; hidden: boolean; seen: string; quiet: string }): void => listen(said)
    heard.on('desk:away', relay)
    return () => heard.off('desk:away', relay)
  },
  /** “Show anyway”: the stickies and goal cards out again for this meeting (or these quiet hours) only; false hides them again. */
  showDeskAnyway: (on = true): void => ipcRenderer.send('desk:anyway', on),
  onFrostAt: (listen: (at: { x: number; y: number }) => void): (() => void) => {
    const relay = (_event: unknown, at: { x: number; y: number }): void => listen(at)
    heard.on('frost:at', relay)
    return () => heard.off('frost:at', relay)
  },
  /** Told when every sticky is shown or put away, for its sound. */
  onStickiesShown: (listen: (shown: boolean) => void): (() => void) => {
    const relay = (_event: unknown, shown: boolean): void => listen(shown)
    heard.on('stickies:shown', relay)
    return () => heard.off('stickies:shown', relay)
  },

  /** The main window's page has drawn itself, so it may be shown. */
  homeDrawn: (): void => ipcRenderer.send('home:drawn'),
  /** Whether this window is on screen now. */
  isShown: (): Promise<boolean> => ipcRenderer.invoke('window:is-shown'),

  /** Each time the window is about to be put away. */
  onHiding: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('window:hiding', relay)
    return () => heard.off('window:hiding', relay)
  },

  /** An import has landed: told shown or hidden, so its notes are read into documents at once. */
  onImported: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('imports:ready', relay)
    return () => heard.off('imports:ready', relay)
  },

  /** In the main window: each time the box is brought up, whichever app had the keys. For the welcome. */
  onBoxShown: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('onboarding:box', relay)
    return () => heard.off('onboarding:box', relay)
  },
  /** In any window: a key held back while the welcome runs, to say so in a line. */
  onHeld: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('onboarding:held', relay)
    return () => heard.off('onboarding:held', relay)
  },
  /** In the main window: each time the box is put away. For the welcome. */
  onBoxAway: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('onboarding:box-away', relay)
    return () => heard.off('onboarding:box-away', relay)
  },

  /** Talk to type: each line the listening helper says (main/dictation.ts), as it says it. */
  onDictation: (listen: (line: Record<string, unknown>) => void): (() => void) => {
    const relay = (_event: unknown, line: Record<string, unknown>): void => listen(line)
    heard.on('dictate:line', relay)
    return () => heard.off('dictate:line', relay)
  },
  /** How much work main has under way (an import, a backup, an export): the beam turns while any is. */
  onBusy: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    heard.on('work:busy', relay)
    return () => heard.off('work:busy', relay)
  },
  /** How far an import has got, for the main window's chip; null once it is over. */
  onImportProgress: (listen: (at: { done: number; total: number; what: 'notes' | 'opening' | 'pictures' | 'cards' | 'files'; stop?: boolean } | null) => void): (() => void) => {
    const relay = (_event: unknown, at: { done: number; total: number; what: 'notes' | 'opening' | 'pictures' | 'cards' | 'files'; stop?: boolean } | null): void => listen(at)
    heard.on('import:progress', relay)
    return () => heard.off('import:progress', relay)
  },
  /** In the main window: the daily backup has failed twice in a row (a reason), or works again (null). */
  onBackupTrouble: (listen: (reason: string | null) => void): (() => void) => {
    const relay = (_event: unknown, reason: string | null): void => listen(reason)
    heard.on('backup:trouble', relay)
    return () => heard.off('backup:trouble', relay)
  },
  /** The box's own colour behind the page, or null for the frosted backing: see setSurface in main. `page`: the page's colour, worn by an opaque window (main/small-window.ts). */
  setSurface: (color: string | null, page?: string | null): void => ipcRenderer.send('window:surface', color, page),
  /** In the box: the welcome starting or ending (it wears no side panel while it runs). */
  onWelcoming: (listen: (on: boolean) => void): (() => void) => {
    const relay = (_event: unknown, on: boolean): void => listen(on)
    heard.on('box:welcoming', relay)
    return () => heard.off('box:welcoming', relay)
  },
  /** Each time the window is brought up: the moment the rot cards reshuffle and a hint may show. */
  onShown: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('window:shown', relay)
    return () => heard.off('window:shown', relay)
  },

  /** Hints: one nugget at a time, with up and down. */
  hints: {
    next: (): Promise<{ id: string; captureId: string | null; kind: string; title: string; body: unknown; event: number } | null> =>
      ipcRenderer.invoke('hints:next'),
    react: (event: number, id: string, reaction: 'up' | 'down'): Promise<void> =>
      ipcRenderer.invoke('hints:react', event, id, reaction),
    /** How long it was on screen before the window went. */
    dwell: (event: number, ms: number): Promise<void> => ipcRenderer.invoke('hints:dwell', event, ms)
  },

  /** This window can show a celebration (or no longer can); told once it is listening. */
  celebrateHere: (on: boolean): void => ipcRenderer.send('celebrate:host', on),
  /** A milestone quick capture could not show (it was leaving): the main window shows it instead. */
  celebrateInHome: (moment: unknown): void => ipcRenderer.send('celebrate:home', moment),
  /** A notice quick capture could not show (it was leaving): the main window says it instead (lib/tasks.ts). */
  sayInHome: (said: unknown): void => ipcRenderer.send('say:home', said),
  onSay: (listen: (said: unknown) => void): (() => void) => {
    const relay = (_event: unknown, said: unknown): void => listen(said)
    heard.on('say', relay)
    return () => heard.off('say', relay)
  },
  /** A milestone reached by something done in this window. */
  onCelebrate: (listen: (moment: Moment) => void): (() => void) => {
    const relay = (_event: unknown, moment: Moment): void => listen(moment)
    heard.on('celebrate', relay)
    return () => heard.off('celebrate', relay)
  },

  /** Back at the Mac after four hours or more locked or asleep (main/away.ts): how long, for the catch-up line. */
  onBack: (listen: (ms: number) => void): (() => void) => {
    const relay = (_event: unknown, ms: number): void => listen(ms)
    heard.on('haligtree:back', relay)
    return () => heard.off('haligtree:back', relay)
  },

  /** A scanned book's pages being read (main/pdf-text.ts): each page as it is read, then done or why not. */
  onPdfReading: (listen: (said: { src: string; page?: number; of?: number; done?: boolean; lines?: number; pages?: number; error?: string }) => void): (() => void) => {
    const relay = (_event: unknown, said: Parameters<typeof listen>[0]): void => listen(said)
    heard.on('pdf:reading', relay)
    return () => heard.off('pdf:reading', relay)
  },

  /** Everything past the capture, by channel. Only `haligtree:` channels pass. `T` is what the channel answers with. */
  haligtree: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(`haligtree:${channel}`, ...args),

  /** Bring up the capture prompt, from any window. */
  showPrompt: (text?: string): void => ipcRenderer.send('prompt:show', text),
  /** Real glass under these rounded shapes ([x, y, width, height, radius] in the page's pixels), dark or light; none takes it away (main/glass.ts). */
  glass: (dark: boolean, shapes: number[][]): void => ipcRenderer.send('glass:shapes', dark, shapes),
  /** The box shown again if it has gone, never put away: an undone send brought back. */
  revealPrompt: (): void => ipcRenderer.send('prompt:reveal'),
  /** In the box: words sent to finish here (⌘K's "in quick capture"), now and from here on. */
  /**
   * Quick capture thrown toward an edge or corner: dx and dy say which way, -1 to 1.
   * With `speed` (px a ms) it came from the wheel, read as it came: main turns it the fingers' way.
   */
  throwBox: (dx: number, dy: number, speed?: number): void => ipcRenderer.send('box:throw', dx, dy, speed),
  /** Quick capture moved with the fingers by these wheel deltas (main turns them the fingers' way); restBox when they let go slowly. */
  moveBox: (dx: number, dy: number): void => ipcRenderer.send('box:nudge', dx, dy),
  restBox: (): void => ipcRenderer.send('box:rest'),
  /** A picture from ⇧⌘.'s area pick, to put in the note with the caret under it. */
  onPicture: (listen: (shot: { url: string; app: string } | { denied: true; asked: boolean }) => void): (() => void) => {
    const relay = (_event: Electron.IpcRendererEvent, shot: { url: string; app: string } | { denied: true; asked: boolean }): void => listen(shot)
    heard.on('box:picture', relay)
    void (ipcRenderer.invoke('box:picture') as Promise<{ url: string; app: string } | { denied: true; asked: boolean } | null>).then((shot) => shot && listen(shot))
    return () => heard.off('box:picture', relay)
  },
  onSeed: (listen: (text: string) => void): (() => void) => {
    const relay = (_event: unknown, text: string): void => listen(text)
    heard.on('box:seed', relay)
    void (ipcRenderer.invoke('box:seed') as Promise<string | null>).then((text) => text && listen(text))
    return () => heard.off('box:seed', relay)
  },
  /** In the box: ⌘O was pressed, asking for what is open here to go to the main window. */
  onPromoteAsked: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    heard.on('box:promote-asked', relay)
    return () => heard.off('box:promote-asked', relay)
  },
  /** The box grows toward the main window and fades, and the main window opens on this one thing (or Home). */
  promote: (type: string | null, id: string | null): void => ipcRenderer.send('box:promote', type, id),
  hidePrompt: (): void => ipcRenderer.send('prompt:hide'),
  /**
   * The welcome about to arrive (answered at once): 'scene' when it comes as a fog over the whole screen that draws in
   * to this window, put in the middle of the screen for it (main: makeScene, placeForWelcome), with the screen and the
   * window in the screen's points; 'plain' when it plays in this window, put in the middle of the screen at once.
   */
  welcomeArrive: (again: boolean, still: boolean): { how: 'scene' | 'plain'; place: { screen: { width: number; height: number }; window: { x: number; y: number; width: number; height: number } } | null } => {
    const answer = ipcRenderer.sendSync('welcome:arrive', again, still) as { how?: unknown; place?: unknown } | null
    return answer?.how === 'scene' && answer.place ? { how: 'scene', place: answer.place as never } : { how: 'plain', place: null }
  },
  /**
   * The arrival's moments, from main: its clock started (`t0`, Date.now() of its start), this window put in its place
   * under the fog, the intro skipped or its sound switched from the scene's own corner buttons, and, the welcome over,
   * this window grown to the app's own size.
   */
  onWelcomeScene: (listen: (event: { what: 'start'; t0: number } | { what: 'covered' } | { what: 'skip' } | { what: 'sound'; on: boolean } | { what: 'grown' }) => void): (() => void) => {
    const relay = (_event: unknown, what: unknown): void => listen(what as never)
    heard.on('welcome:scene', relay)
    return () => heard.off('welcome:scene', relay)
  },
  /** In the scene window: told when and where the scene plays, and whose book it signs. */
  onScene: (listen: (start: { t0: number; place: { screen: { width: number; height: number }; window: { x: number; y: number; width: number; height: number } }; name: string; sounds: boolean }) => void): (() => void) => {
    const relay = (_event: unknown, start: unknown): void => listen(start as never)
    heard.on('scene:start', relay)
    return () => heard.off('scene:start', relay)
  },
  /** The scene window has drawn its first, empty frame: it may be shown and its clock started. */
  sceneReady: (): void => ipcRenderer.send('scene:ready'),
  /** Esc, Enter, a click or “Skip intro” over the scene: straight to the end of the arrival. */
  sceneSkip: (): void => ipcRenderer.send('scene:skip'),
  /** The scene's sound button: the welcome's sound on or off, here and in Settings. */
  sceneSound: (on: boolean): void => ipcRenderer.send('scene:sound', on),
  /** The scene has drawn in to the window: the welcome's window takes over from here. */
  sceneDone: (): void => ipcRenderer.send('scene:done'),
  /** The menu bar's importers, from a window: an Obsidian vault, or files (Readwise, Kindle and the rest). */
  importFrom: (what: 'vault' | 'files' | 'apple-notes', from?: string | null): Promise<void> => ipcRenderer.invoke('import:run', what, from),
  /** Anki decks (.apkg) dropped on a note: imported as cards, not attached. */
  importDecks: (files: File[]): Promise<void> => ipcRenderer.invoke('import:decks', files.map((file) => webUtils.getPathForFile(file))),
  /** The menu bar's restore, from a window: pick a day's copy, and the app starts again on it. */
  restoreBackup: (): Promise<void> => ipcRenderer.invoke('backup:restore'),
  /** The answer to Haligtree's own "Go back to this copy?" sheet. */
  answerRestore: (token: string, ok: boolean): void => ipcRenderer.send('backup:restore-answer', token, ok),
  /** The frosted backing follows the theme: dark under a dark theme. */
  setAppearance: (mode: 'light' | 'dark', solid = false): void => ipcRenderer.send('appearance', mode, solid),
  /** Bring up the main window with one thing open in it. */
  openInHome: (type: string, id: string, heading?: string): void => ipcRenderer.send('home:open', type, id, heading),
  /** In the main window: where the prompt sent you, now and from here on. */
  onSentTo: (listen: (type: string, id: string, heading?: string) => void): (() => void) => {
    const relay = (_event: unknown, type: string, id: string, heading?: string): void => listen(type, id, heading)
    heard.on('home:open', relay)
    void (ipcRenderer.invoke('home:sent') as Promise<[string, string, string?] | null>).then((sent) => sent && listen(...sent))
    return () => heard.off('home:open', relay)
  },
  /** In the main window: how the next thing sent here was found (a notification, quick capture, another window), for the usage counts. */
  onUsageVia: (listen: (via: string) => void): (() => void) => {
    const relay = (_event: unknown, via: string): void => listen(via)
    heard.on('usage:via', relay)
    return () => heard.off('usage:via', relay)
  },

  /** Whether the Mac scrolls naturally (the wheel's deltas run against the fingers), read fresh from the system. */
  naturalScrolling: (): Promise<boolean> => ipcRenderer.invoke('scroll:natural') as Promise<boolean>,
  /** In the main window: the trackpad's fingers touched ('began') or lifted ('ended'), from the Mac's scroll events, for swipe back. */
  onSwipePhase: (listen: (kind: 'began' | 'ended') => void): (() => void) => {
    const relay = (_event: unknown, kind: 'began' | 'ended'): void => listen(kind)
    heard.on('swipe:phase', relay)
    return () => heard.off('swipe:phase', relay)
  },

  /** Put the window away. It keeps its contents and its place on screen. */
  hideWindow: (): void => ipcRenderer.send('window:hide'),

  /** Open a drawing in a window of its own, or bring that window forward. */
  openDrawing: (id: string, scene: unknown, name?: string, picture?: string): void =>
    ipcRenderer.send('drawing:open', id, scene, name, picture),
  /** The note's picture of a drawing, shown while its window's canvas loads. */
  drawingPicture: (id: string): Promise<string | null> => ipcRenderer.invoke('drawing:picture', id),

  /** What that window has drawn, for the block it came from to write down. */
  onDrawingChange: (listen: (id: string, scene: unknown) => void): (() => void) => {
    const relay = (_event: unknown, id: string, scene: unknown): void => listen(id, scene)
    heard.on('drawing:changed', relay)
    return () => heard.off('drawing:changed', relay)
  },

  /** Whether a drawing is open in a window of its own, as that changes. */
  onDrawingWindow: (listen: (id: string, open: boolean) => void): (() => void) => {
    const relay = (_event: unknown, id: string, open: boolean): void => listen(id, open)
    heard.on('drawing:open', relay)
    return () => heard.off('drawing:open', relay)
  },

  /** The other side: a drawing window asking what it is meant to show. */
  drawingScene: (id: string): Promise<unknown> => ipcRenderer.invoke('drawing:scene', id),

  /** And telling the note what it has become. */
  saveDrawing: (id: string, scene: unknown): void =>
    ipcRenderer.send('drawing:change', id, scene),

  /** Every capture, kept by the main process. */
  captures: {
    // The list as this window last had it: asked again, the main process says
    // only whether it changed, and sends it whole only when it did.
    list: async (): Promise<CaptureMeta[]> => {
      const got = (await ipcRenderer.invoke('captures:list', listed?.version)) as typeof listed
      if (got) listed = got
      return listed!.rows
    },
    get: (id: string): Promise<Capture | null> => ipcRenderer.invoke('captures:get', id),
    /** Links and captures holding a card, to tidy: read without counting as an open. */
    cards: (): Promise<{ id: string; kind: string; body: unknown }[]> => ipcRenderer.invoke('captures:cards'),
    /** Search the titles and bodies, newest first. */
    /** `asker` names the one search box asking: of its asks, one main has not begun gives way to a newer one. */
    find: (query: string, /** Only these types are looked through. */ only?: string[], asker?: string): Promise<{ type: 'capture' | 'pdf' | 'web' | 'media' | 'work' | 'nugget' | 'article' | 'question' | 'goal' | 'task' | 'event' | 'day'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string; /** The line the words were found on, when not in the name. */ line?: string; /** The picture that line was read in. */ picture?: string; /** How it matched: its name, its words, a picture's words, or only a close spelling of them. */ match?: 'name' | 'words' | 'picture' | 'near'; /** Found only by a close spelling: the words in it that stood in for those typed. */ near?: string[] }[]> => ipcRenderer.invoke('captures:find', query, only, asker),
    /** What a link written by name, or `@`, points at, in one ask: notes and pages of that name, and the PDFs and kept articles (`exact`: only by their names). */
    named: (query: string, exact: boolean): Promise<{ captures: CaptureMeta[]; items: { id: string; tier: 'nugget' | 'article' | 'question'; title: string; updatedAt?: string; goalAt?: string | null; closedHow?: string | null }[]; files: { type: 'capture' | 'pdf' | 'web' | 'media' | 'work' | 'nugget' | 'article' | 'question' | 'goal' | 'task' | 'event' | 'day'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string; /** The line the words were found on, when not in the name. */ line?: string; /** The picture that line was read in. */ picture?: string }[] }> => ipcRenderer.invoke('captures:named', query, exact),
    /** Three open captures, leaning old: the rot sampler. */
    rot: (): Promise<Capture[]> => ipcRenderer.invoke('captures:rot'),
    /** What `@` offers for the text typed after it. */
    search: (query: string): Promise<CaptureMeta[]> => ipcRenderer.invoke('captures:search', query),
    /** The start of one note, for search's preview. */
    /** `words`: searched for; the preview shows the part of a long note they first stand in. */
    peek: (type: string, id: string, words?: string[]): Promise<unknown> => ipcRenderer.invoke('captures:peek', type, id, words),
    create: (patch: CapturePatch): Promise<string> => ipcRenderer.invoke('captures:create', patch),
    save: (id: string, patch: CapturePatch): Promise<SaveResult> =>
      ipcRenderer.invoke('captures:save', id, patch),
    /** The same, answered before this returns, for a page on its way out: its last words and the Markdown copy it owes reach main, and the disk, before it is gone. Null if it did not land. */
    saveNow: (id: string, patch: CapturePatch): SaveResult | null => ipcRenderer.sendSync('captures:save-now', id, patch),
    /** Many saved in one write, the windows told once: each its own patch, the results in the same order. */
    saveMany: (saves: { id: string; patch: CapturePatch }[]): Promise<SaveResult[]> =>
      ipcRenderer.invoke('captures:save-many', saves),
    /** Every note's #tags moved out of its name to its last line, once a book, on the first ask: how many, and when. */
    tagsMoved: (): Promise<{ at: string; count: number } | null> => ipcRenderer.invoke('captures:tags-moved'),
    tagsMovedUndo: (): Promise<number> => ipcRenderer.invoke('captures:tags-moved-undo'),
    /**
     * Any window's write, as it happens: told which notes, or null for
     * anything. With `kinds`, only writes that could touch those.
     */
    onChange: (listen: (what: Change[] | null) => void, kinds?: Change['kind'][]): (() => void) => {
      changes.set(listen, kinds)
      return () => void changes.delete(listen)
    }
  }
}

// Context isolation is on, so this is the only way across.
export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

// The Mac's own full screen hides a window's traffic lights, so the page marks
// itself and closes up the room its toolbar keeps for them.
heard.on('window:fullscreen', (_event, on: boolean) => document.documentElement.toggleAttribute('data-fullscreen', on))
