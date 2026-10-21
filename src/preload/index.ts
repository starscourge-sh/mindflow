import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { Frost, LinkMetadata, LookPicture } from './index.d'
import type { Capture, CaptureMeta, CapturePatch, Change, SaveResult } from '../main/captures'
import type { Moment } from '../main/celebrate'
import type { Slept } from '../main/session-log'

// Every live view listens for changes; one IPC listener tells them all,
// rather than one each past Node's limit of ten.
// Each says which kinds of note it shows; none means everything.
const changes = new Map<(what: Change[] | null) => void, Change['kind'][] | undefined>()
// A burst of changes, an import or several saves in a row, is told once,
// with every note it touched (null: anything may have changed).
let telling: ReturnType<typeof setTimeout> | undefined
let told: Change[] | null | undefined
ipcRenderer.on('captures:changed', (_event, what: Change[] | null) => {
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
ipcRenderer.on('notes:opened-apart', (_event, id: string) => window.dispatchEvent(new CustomEvent('vigil:opened-apart', { detail: id })))
// A note moving between the main window and its own (lib/apart.ts): its window
// closed, a caret carried in, or asked to go back home.
ipcRenderer.on('notes:apart', (_event, what: string, link: string) => window.dispatchEvent(new CustomEvent('vigil:apart', { detail: { what, link } })))
// The menu bar's Reset the sandbox: asked in the pill, where Start over is held.
ipcRenderer.on('sandbox:ask-reset', () => window.dispatchEvent(new CustomEvent('vigil:sandbox-reset')))
// Edit > Select All from the menu bar: a list with the focus takes it
// (lib/select-all.ts cancels the event); otherwise the words, as before.
ipcRenderer.on('menu:select-all', () => {
  if (window.dispatchEvent(new Event('vigil:select-all', { cancelable: true }))) document.execCommand('selectAll')
})
// A note renamed and the links to it written again: the window it was renamed in says so, with an Undo.
ipcRenderer.on('links:renamed', (_event, info: unknown) => window.dispatchEvent(new CustomEvent('vigil:links-renamed', { detail: info })))
// A book made, renamed or deleted: every list of them looks again.
ipcRenderer.on('books:changed', () => window.dispatchEvent(new CustomEvent('vigil:books-changed')))

// Custom APIs for renderer
const api = {
  /** The Mac tells the time on a 12-hour clock ("9:05 PM"); read by dates.ts `clock`. */
  twelveHour: ipcRenderer.sendSync('clock:twelve') === true,
  fetchLinkMetadata: (url: string): Promise<LinkMetadata> =>
    ipcRenderer.invoke('fetch-link-metadata', url),

  /** Store image bytes and get back the URL that reads them again. */
  saveImage: (mime: string, bytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('save-image', mime, bytes),

  /** Store any file and get back the URL that reads it again. */
  saveFile: (name: string, bytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('save-file', name, bytes),

  /** Write text to a file the user picks. */
  exportText: (name: string, text: string): Promise<boolean> =>
    ipcRenderer.invoke('export-text', name, text),

  /** Render HTML to a PDF at a path the user picks. */
  exportPdf: (name: string, html: string): Promise<boolean> =>
    ipcRenderer.invoke('export-pdf', name, html),

  /** Copy a stored file somewhere the user picks, under its original name. */
  saveFileAs: (src: string, name: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file-as', src, name),

  /** Open a stored file with whatever the system uses for it. */
  openFile: (src: string): Promise<boolean> => ipcRenderer.invoke('open-file', src),

  /** Show a stored file in Finder. */
  showFile: (src: string): Promise<boolean> => ipcRenderer.invoke('show-file', src),

  /** Put a stored image on the system clipboard. */
  copyImage: (src: string): Promise<boolean> => ipcRenderer.invoke('copy-image', src),

  /** Drag a stored picture or file out to another app: called from dragstart, the system drag starts from here. */
  dragOut: (src: string, name: string): void => ipcRenderer.send('drag-out', src, name),
  /** Where a dropped file lies on disk, so a picture dragged out and back in is known as the same one. */
  pathOf: (file: File): string => webUtils.getPathForFile(file),

  /** Asked of the page's own spellchecker, which already drew the squiggle. */
  misspelt: (word: string): string[] | null => (webFrame.isWordMisspelled(word) ? webFrame.getWordSuggestions(word) : null),
  /** Keep a word as spelt right, in the Mac's own dictionary too. */
  learnWord: (word: string): Promise<boolean> => ipcRenderer.invoke('vigil:spelling:learn', word),

  /** The picture on the system clipboard, read by the system rather than from a pasted file that may not open. */
  clipboardImage: (): Promise<{ mime: string; bytes: Uint8Array } | null> => ipcRenderer.invoke('clipboard-image'),

  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string): Promise<{ mime: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('fetch-image', href),

  /** Find pictures a note from Obsidian points at in the vaults Obsidian knows, and store them. */
  bringEmbeds: (refs: string[]): Promise<({ src: string; name: string; size: number; image: boolean } | null)[]> =>
    ipcRenderer.invoke('obsidian:bring', refs),

  /** Swap the window between the capture size and the roomier one. */
  setExpanded: (expanded: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:expand', expanded),
  /** Widen the window for the side panel, or narrow it back to the box. */
  setPanel: (open: boolean): Promise<boolean> => ipcRenderer.invoke('window:panel', open),
  /** The box to the middle of its screen (⌃⌘C). */
  centreBox: (): void => ipcRenderer.send('window:centre'),
  /** The box's height as its writing needs it: it grows down to it, up to its full size. */
  fitBox: (height: number, snap = false): void => ipcRenderer.send('window:fit', height, snap),
  /** The main window: fill the screen, or back to its compact size. */
  fillHome: (fill: boolean | 'toggle'): Promise<boolean> => ipcRenderer.invoke('home:fill', fill),
  /** Told whenever the main window fills the screen or comes back from it. */
  onFilled: (listen: (filled: boolean) => void): (() => void) => {
    const relay = (_event: unknown, filled: boolean): void => listen(filled)
    ipcRenderer.on('home:filled', relay)
    return () => ipcRenderer.off('home:filled', relay)
  },
  /** The floating focus timer, shown or put away. */
  showFocus: (on: boolean): void => ipcRenderer.send('focus:show', on),
  /** How long the computer has gone untouched, in seconds. */
  idleSeconds: (): Promise<number> => ipcRenderer.invoke('idle:seconds'),
  /** The focus pill's right-click menu: resolves to what was chosen, or null. */
  focusMenu: (ticking: boolean, abandon = false, extend = false, endBreak = false, early = false): Promise<'tick' | 'abandon' | 'extend' | 'end' | 'early' | 'notch' | 'free' | null> => ipcRenderer.invoke('focus:menu', ticking, abandon, extend, endBreak, early),
  /** The pill's window, as tall as the island needs: it grows down from where it hangs. */
  focusSize: (height: number): Promise<boolean> => ipcRenderer.invoke('focus:size', height),
  /** Put the pill where Settings says it sits; the notch's height, or 0 where it is not under one. */
  focusPlace: (): Promise<{ notch: number }> => ipcRenderer.invoke('focus:place'),
  /** Told when where the pill sits has changed. */
  onFocusPlaced: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('focus:placed', relay)
    return () => ipcRenderer.off('focus:placed', relay)
  },
  /** The Mac woke after sleeping in a session that Settings ended there: what ended, and how. */
  onFocusSlept: (listen: (slept: Slept) => void): (() => void) => {
    const relay = (_event: unknown, slept: Parameters<typeof listen>[0]): void => listen(slept)
    ipcRenderer.on('focus:slept', relay)
    return () => ipcRenderer.off('focus:slept', relay)
  },
  /** A screenshot of the pill's screen for the session's log, stored; denied without Screen Recording. */
  focusShot: (): Promise<{ url: string } | { denied: true } | null> => ipcRenderer.invoke('focus:shot'),
  /** A screenshot of the box's screen for its note, without Vigil's windows; with the app in front there. */
  screenShot: (area = false): Promise<{ url: string; app: string } | { denied: true; asked: boolean } | { cancelled: true } | null> => ipcRenderer.invoke('shots:screen', area),
  /** The camera, asked for before its first use: granted or denied. */
  cameraAccess: (): Promise<'granted' | 'denied'> => ipcRenderer.invoke('shots:camera'),
  /** macOS's Privacy settings, at the camera's page or Screen Recording's. */
  privacySettings: (what: 'camera' | 'screen'): void => ipcRenderer.send('shots:privacy', what),
  /** Light around the edge of the screen: a session or timer finished, or called off. */
  glow: (tone: 'done' | 'cancel' | 'break'): void => ipcRenderer.send('glow', tone),
  /** In the glow's own window: each glow, including one asked for while it loaded. */
  onGlow: (listen: (tone: 'done' | 'cancel' | 'break', at?: { x: number; y: number }) => void): (() => void) => {
    const relay = (_event: unknown, tone: 'done' | 'cancel' | 'break', at?: { x: number; y: number }): void => listen(tone, at)
    ipcRenderer.on('glow', relay)
    void (ipcRenderer.invoke('glow:waiting') as Promise<'done' | 'cancel' | null>).then((tone) => tone && listen(tone))
    return () => ipcRenderer.off('glow', relay)
  },
  /** In the nudge card's own window: each nudge, including those told while it loaded. */
  onNudge: (listen: (nudge: unknown) => void): (() => void) => {
    const relay = (_event: unknown, nudge: unknown): void => listen(nudge)
    ipcRenderer.on('nudge', relay)
    void (ipcRenderer.invoke('nudge:waiting') as Promise<unknown[]>).then((all) => all.forEach(listen))
    return () => ipcRenderer.off('nudge', relay)
  },
  /** The nudge card's height as its cards change; 0 hides it. */
  nudgeSize: (height: number): void => ipcRenderer.send('nudge:size', height),
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
    ipcRenderer.on('stickies:tidied', relay)
    return () => ipcRenderer.off('stickies:tidied', relay)
  },
  /** How many stickies are out on the screen, so Tidy stickies is offered only when there is something to tidy. */
  stickiesOut: (): Promise<number> => ipcRenderer.invoke('stickies:out'),
  onStickiesOut: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    ipcRenderer.on('stickies:out', relay)
    return () => ipcRenderer.off('stickies:out', relay)
  },
  showFolder: (path: string): void => ipcRenderer.send('folder:show', path),
  /** A sticky's pictures in Vigil's own Quick Look, in a window over its screen rather than inside the small one. */
  look: (pictures: LookPicture[], at: number): void => ipcRenderer.send('look', pictures, at),
  /** The look window's own: what to show, and that it is done. */
  lookWhat: (): Promise<{ pictures: LookPicture[]; at: number } | null> => ipcRenderer.invoke('look:what'),
  lookDone: (): void => ipcRenderer.send('look:done'),
  /** The sticky's: its picture is back from the look window. */
  onLookOver: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('look:over', relay)
    return () => ipcRenderer.off('look:over', relay)
  },
  /** A sticky's own: put just this one away, or size it from its corner grip. */
  hideSticky: (type: string, id: string, title?: string): void => ipcRenderer.send('sticky:hide', type, id, title),
  /** A hidden sticky out again, from the nudge card's “Bring it back”. */
  unhideSticky: (key: string): void => ipcRenderer.send('sticky:unhide', key),
  resizeSticky: (width: number, height: number, done = false): void => ipcRenderer.send('sticky:resize', width, height, done),
  /** A sticky's own X or ⌘W: it peels off, and the window in sight offers "Put it back". */
  takeDownSticky: (title: string): void => ipcRenderer.send('sticky:takedown', title),
  putStickyBack: (): void => ipcRenderer.send('sticky:putback'),
  /** A sticky's own paper colour, kept by main; null for plain. */
  stickyTint: (): Promise<string | null> => ipcRenderer.invoke('sticky:tint'),
  /** "Open it": the note in the main window, growing out of the sticky; with `alt`, the sticky comes down. */
  openSticky: (tier: string, id: string, title: string, alt: boolean): void => ipcRenderer.send('sticky:open', tier, id, title, alt),
  /** A menu drawn by the Mac over a sticky; resolves to the place of the line chosen, or null. */
  stickyMenu: (items: unknown[]): Promise<number[] | null> => ipcRenderer.invoke('sticky:menu', items),
  /** A sticky's page: told as its window comes in, peels off, is picked up or let go (`held`), or changes colour. */
  onStickyMotion: (listen: (what: 'arrive' | 'peel' | 'held' | 'tint', value?: unknown) => void): (() => void) => {
    const relays = (['arrive', 'peel', 'held', 'tint'] as const).map((what) => [`sticky:${what}`, (_event: unknown, value?: unknown): void => listen(what, value)] as const)
    for (const [channel, relay] of relays) ipcRenderer.on(channel, relay)
    return () => { for (const [channel, relay] of relays) ipcRenderer.off(channel, relay) }
  },
  /** In the window in sight: a sticky was taken down from its own X or ⌘W, by its title. */
  onStickyTaken: (listen: (title: string) => void): (() => void) => {
    const relay = (_event: unknown, title: string): void => listen(title)
    ipcRenderer.on('sticky:taken', relay)
    return () => ipcRenderer.off('sticky:taken', relay)
  },
  /** In the main window: the note just opened grows out of a small window's place on the screen (main/grow.ts). */
  onHomeGrow: (listen: (grow: { from: { x: number; y: number; width: number; height: number }; title: string; tint?: string; round?: number }) => void): (() => void) => {
    const relay = (_event: unknown, grow: { from: { x: number; y: number; width: number; height: number }; title: string; tint?: string; round?: number }): void => listen(grow)
    ipcRenderer.on('home:grow', relay)
    return () => ipcRenderer.off('home:grow', relay)
  },
  /** The sticky's whole window wiggles where it stands, and settles back exactly. */
  wiggle: (): void => ipcRenderer.send('sticky:wiggle'),
  /** Pointed at: the window rises a little, and sets down once the pointer leaves. */
  lift: (): void => ipcRenderer.send('sticky:lift'),
  /** A goal's card: the pointer on it (it stays) or off it, and its X (that goal tucked away). */
  holdBeacon: (on: boolean): void => ipcRenderer.send('beacon:hold', on),
  tuckBeacon: (id: string): void => ipcRenderer.send('beacon:tuck', id),
  /** A sticky's frost: the desktop picture blurred, its screen and where the window is; asked once, then told on each change. */
  frost: (): Promise<Frost | null> => ipcRenderer.invoke('frost'),
  onFrost: (listen: (frost: Frost) => void): (() => void) => {
    const relay = (_event: unknown, frost: Frost): void => listen(frost)
    ipcRenderer.on('frost', relay)
    return () => ipcRenderer.off('frost', relay)
  },
  /** Told now and then to stir, so a sticky is seen again. */
  onStir: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('sticky:stir', relay)
    return () => ipcRenderer.off('sticky:stir', relay)
  },
  onFrostAt: (listen: (at: { x: number; y: number }) => void): (() => void) => {
    const relay = (_event: unknown, at: { x: number; y: number }): void => listen(at)
    ipcRenderer.on('frost:at', relay)
    return () => ipcRenderer.off('frost:at', relay)
  },
  /** Told when every sticky is shown or put away, for its sound. */
  onStickiesShown: (listen: (shown: boolean) => void): (() => void) => {
    const relay = (_event: unknown, shown: boolean): void => listen(shown)
    ipcRenderer.on('stickies:shown', relay)
    return () => ipcRenderer.off('stickies:shown', relay)
  },

  /** Each time the window is about to be put away. */
  onHiding: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('window:hiding', relay)
    return () => ipcRenderer.off('window:hiding', relay)
  },

  /** An import has landed: told shown or hidden, so its notes are read into documents at once. */
  onImported: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('imports:ready', relay)
    return () => ipcRenderer.off('imports:ready', relay)
  },

  /** In the main window: each time the box is brought up, whichever app had the keys. For the welcome. */
  onBoxShown: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('onboarding:box', relay)
    return () => ipcRenderer.off('onboarding:box', relay)
  },
  /** In any window: a key held back while the welcome runs, to say so in a line. */
  onHeld: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('onboarding:held', relay)
    return () => ipcRenderer.off('onboarding:held', relay)
  },
  /** In the main window: each time the box is put away. For the welcome. */
  onBoxAway: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('onboarding:box-away', relay)
    return () => ipcRenderer.off('onboarding:box-away', relay)
  },

  /** How much work main has under way (an import, a backup, an export): the beam turns while any is. */
  onBusy: (listen: (count: number) => void): (() => void) => {
    const relay = (_event: unknown, count: number): void => listen(count)
    ipcRenderer.on('work:busy', relay)
    return () => ipcRenderer.off('work:busy', relay)
  },
  /** How far an import has got, for the main window's chip; null once it is over. */
  onImportProgress: (listen: (at: { done: number; total: number; what: 'notes' | 'pictures' | 'files' } | null) => void): (() => void) => {
    const relay = (_event: unknown, at: { done: number; total: number; what: 'notes' | 'pictures' | 'files' } | null): void => listen(at)
    ipcRenderer.on('import:progress', relay)
    return () => ipcRenderer.off('import:progress', relay)
  },
  /** In the main window: the daily backup has failed twice in a row (a reason), or works again (null). */
  onBackupTrouble: (listen: (reason: string | null) => void): (() => void) => {
    const relay = (_event: unknown, reason: string | null): void => listen(reason)
    ipcRenderer.on('backup:trouble', relay)
    return () => ipcRenderer.off('backup:trouble', relay)
  },
  /** The box's own colour behind the page, or null for the frosted backing: see setSurface in main. */
  setSurface: (color: string | null): void => ipcRenderer.send('window:surface', color),
  /** Each time the window is brought up: the moment the rot cards reshuffle and a hint may show. */
  onShown: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('window:shown', relay)
    return () => ipcRenderer.off('window:shown', relay)
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
    ipcRenderer.on('say', relay)
    return () => ipcRenderer.off('say', relay)
  },
  /** A milestone reached by something done in this window. */
  onCelebrate: (listen: (moment: Moment) => void): (() => void) => {
    const relay = (_event: unknown, moment: Moment): void => listen(moment)
    ipcRenderer.on('celebrate', relay)
    return () => ipcRenderer.off('celebrate', relay)
  },

  /** Everything past the capture, by channel. Only `vigil:` channels pass. `T` is what the channel answers with. */
  vigil: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(`vigil:${channel}`, ...args),

  /** Bring up the capture prompt, from any window. */
  showPrompt: (text?: string): void => ipcRenderer.send('prompt:show', text),
  /** The box shown again if it has gone, never put away: an undone send brought back. */
  revealPrompt: (): void => ipcRenderer.send('prompt:reveal'),
  /** In the box: words sent to finish here (⌘K's "in quick capture"), now and from here on. */
  /** Quick capture thrown toward an edge or corner: dx and dy say which way, -1 to 1. */
  throwBox: (dx: number, dy: number): void => ipcRenderer.send('box:throw', dx, dy),
  /** A picture from ⇧⌘.'s area pick, to put in the note with the caret under it. */
  onPicture: (listen: (shot: { url: string; app: string } | { denied: true; asked: boolean }) => void): (() => void) => {
    const relay = (_event: Electron.IpcRendererEvent, shot: { url: string; app: string } | { denied: true; asked: boolean }): void => listen(shot)
    ipcRenderer.on('box:picture', relay)
    void (ipcRenderer.invoke('box:picture') as Promise<{ url: string; app: string } | { denied: true; asked: boolean } | null>).then((shot) => shot && listen(shot))
    return () => ipcRenderer.off('box:picture', relay)
  },
  onSeed: (listen: (text: string) => void): (() => void) => {
    const relay = (_event: unknown, text: string): void => listen(text)
    ipcRenderer.on('box:seed', relay)
    void (ipcRenderer.invoke('box:seed') as Promise<string | null>).then((text) => text && listen(text))
    return () => ipcRenderer.off('box:seed', relay)
  },
  /** In the box: ⌘O was pressed, asking for what is open here to go to the main window. */
  onPromoteAsked: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('box:promote-asked', relay)
    return () => ipcRenderer.off('box:promote-asked', relay)
  },
  /** The box grows toward the main window and fades, and the main window opens on this one thing (or Home). */
  promote: (type: string | null, id: string | null): void => ipcRenderer.send('box:promote', type, id),
  hidePrompt: (): void => ipcRenderer.send('prompt:hide'),
  /** The menu bar's importers, from a window: an Obsidian vault, or files (Readwise, Kindle and the rest). */
  importFrom: (what: 'vault' | 'files', from?: string | null): Promise<void> => ipcRenderer.invoke('import:run', what, from),
  /** The menu bar's restore, from a window: pick a day's copy, and the app starts again on it. */
  restoreBackup: (): Promise<void> => ipcRenderer.invoke('backup:restore'),
  /** The answer to Vigil's own "Go back to this copy?" sheet. */
  answerRestore: (token: string, ok: boolean): void => ipcRenderer.send('backup:restore-answer', token, ok),
  /** The frosted backing follows the theme: dark under a dark theme. */
  setAppearance: (mode: 'light' | 'dark'): void => ipcRenderer.send('appearance', mode),
  /** Bring up the main window with one thing open in it. */
  openInHome: (type: string, id: string, heading?: string): void => ipcRenderer.send('home:open', type, id, heading),
  /** In the main window: where the prompt sent you, now and from here on. */
  onSentTo: (listen: (type: string, id: string, heading?: string) => void): (() => void) => {
    const relay = (_event: unknown, type: string, id: string, heading?: string): void => listen(type, id, heading)
    ipcRenderer.on('home:open', relay)
    void (ipcRenderer.invoke('home:sent') as Promise<[string, string, string?] | null>).then((sent) => sent && listen(...sent))
    return () => ipcRenderer.off('home:open', relay)
  },

  /** Put the window away. It keeps its contents and its place on screen. */
  hideWindow: (): void => ipcRenderer.send('window:hide'),

  /** Whether the pointer is over the window, as that changes. */
  onPointer: (listen: (inside: boolean) => void): (() => void) => {
    const relay = (_event: unknown, inside: boolean): void => listen(inside)
    ipcRenderer.on('window:pointer', relay)
    return () => ipcRenderer.off('window:pointer', relay)
  },

  /** Open a drawing in a window of its own, or bring that window forward. */
  openDrawing: (id: string, scene: unknown, name?: string, picture?: string): void =>
    ipcRenderer.send('drawing:open', id, scene, name, picture),
  /** The note's picture of a drawing, shown while its window's canvas loads. */
  drawingPicture: (id: string): Promise<string | null> => ipcRenderer.invoke('drawing:picture', id),

  /** What that window has drawn, for the block it came from to write down. */
  onDrawingChange: (listen: (id: string, scene: unknown) => void): (() => void) => {
    const relay = (_event: unknown, id: string, scene: unknown): void => listen(id, scene)
    ipcRenderer.on('drawing:changed', relay)
    return () => ipcRenderer.off('drawing:changed', relay)
  },

  /** Whether a drawing is open in a window of its own, as that changes. */
  onDrawingWindow: (listen: (id: string, open: boolean) => void): (() => void) => {
    const relay = (_event: unknown, id: string, open: boolean): void => listen(id, open)
    ipcRenderer.on('drawing:open', relay)
    return () => ipcRenderer.off('drawing:open', relay)
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
    find: (query: string): Promise<{ type: 'capture' | 'nugget' | 'article' | 'question' | 'goal' | 'task' | 'event'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string }[]> => ipcRenderer.invoke('captures:find', query),
    /** Three open captures, leaning old: the rot sampler. */
    rot: (): Promise<Capture[]> => ipcRenderer.invoke('captures:rot'),
    /** What `@` offers for the text typed after it. */
    search: (query: string): Promise<CaptureMeta[]> => ipcRenderer.invoke('captures:search', query),
    /** The start of one note, for search's preview. */
    peek: (type: string, id: string): Promise<unknown> => ipcRenderer.invoke('captures:peek', type, id),
    create: (patch: CapturePatch): Promise<string> => ipcRenderer.invoke('captures:create', patch),
    save: (id: string, patch: CapturePatch): Promise<SaveResult> =>
      ipcRenderer.invoke('captures:save', id, patch),
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
ipcRenderer.on('window:fullscreen', (_event, on: boolean) => document.documentElement.toggleAttribute('data-fullscreen', on))
