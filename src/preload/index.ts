import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { Frost, LinkMetadata, LookPicture } from './index.d'
import type { Capture, CaptureMeta, CapturePatch, Change, SaveResult } from '../main/captures'
import type { Moment } from '../main/celebrate'

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
// The menu bar's Reset the sandbox: asked in the pill, where Start over is held.
ipcRenderer.on('sandbox:ask-reset', () => window.dispatchEvent(new CustomEvent('vigil:sandbox-reset')))
// A book made, renamed or deleted: every list of them looks again.
ipcRenderer.on('books:changed', () => window.dispatchEvent(new CustomEvent('vigil:books-changed')))

// Custom APIs for renderer
const api = {
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

  /** Asked of the page's own spellchecker, which already drew the squiggle. */
  misspelt: (word: string): string[] | null => (webFrame.isWordMisspelled(word) ? webFrame.getWordSuggestions(word) : null),
  /** Keep a word as spelt right, in the Mac's own dictionary too. */
  learnWord: (word: string): Promise<boolean> => ipcRenderer.invoke('vigil:spelling:learn', word),

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
  /** The prompt shows up in screen recordings and shares, or not. */
  setRecordable: (on: boolean): Promise<boolean> => ipcRenderer.invoke('window:recordable', on),
  /** The floating focus timer, shown or put away. */
  showFocus: (on: boolean): void => ipcRenderer.send('focus:show', on),
  /** How long the computer has gone untouched, in seconds. */
  idleSeconds: (): Promise<number> => ipcRenderer.invoke('idle:seconds'),
  /** The focus pill's right-click menu: resolves to what was chosen, or null. */
  focusMenu: (ticking: boolean): Promise<'tick' | null> => ipcRenderer.invoke('focus:menu', ticking),
  /** The pill's window, as tall as the island needs: it grows down from where it hangs. */
  focusSize: (height: number): Promise<boolean> => ipcRenderer.invoke('focus:size', height),
  /** A screenshot of the pill's screen for the session's log, stored; denied without Screen Recording. */
  focusShot: (): Promise<{ url: string } | { denied: true } | null> => ipcRenderer.invoke('focus:shot'),
  /** macOS's Screen Recording settings, for the way back from a denied screenshot. */
  screenSettings: (): void => ipcRenderer.send('focus:screen-settings'),
  /** Light around the edge of the screen: a session or timer finished, or called off. */
  glow: (tone: 'done' | 'cancel'): void => ipcRenderer.send('glow', tone),
  /** In the glow's own window: each glow, including one asked for while it loaded. */
  onGlow: (listen: (tone: 'done' | 'cancel') => void): (() => void) => {
    const relay = (_event: unknown, tone: 'done' | 'cancel'): void => listen(tone)
    ipcRenderer.on('glow', relay)
    void (ipcRenderer.invoke('glow:waiting') as Promise<'done' | 'cancel' | null>).then((tone) => tone && listen(tone))
    return () => ipcRenderer.off('glow', relay)
  },
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
  hideSticky: (type: string, id: string): void => ipcRenderer.send('sticky:hide', type, id),
  resizeSticky: (width: number, height: number): void => ipcRenderer.send('sticky:resize', width, height),
  /** The sticky's whole window wiggles where it stands, and settles back exactly. */
  wiggle: (): void => ipcRenderer.send('sticky:wiggle'),
  /** Pointed at: the window rises a little, and sets down once the pointer leaves. */
  lift: (): void => ipcRenderer.send('sticky:lift'),
  /** The goal stack: the pointer on it (it stays) or off it, and the top card's X (that goal tucked away). */
  holdBeacon: (on: boolean): void => ipcRenderer.send('beacon:hold', on),
  tuckBeacon: (id: string): void => ipcRenderer.send('beacon:tuck', id),
  /** The goals in the stack, nearest first: asked once, then told on each change. */
  beaconStack: (): Promise<string[]> => ipcRenderer.invoke('beacon:stack'),
  onBeaconStack: (listen: (ids: string[]) => void): (() => void) => {
    const relay = (_event: unknown, ids: string[]): void => listen(ids)
    ipcRenderer.on('beacon:stack', relay)
    return () => ipcRenderer.off('beacon:stack', relay)
  },
  /** A sticky's frost: the desktop picture blurred, its screen and where the window is; asked once, then told on each change. */
  frost: (): Promise<Frost | null> => ipcRenderer.invoke('frost'),
  onFrost: (listen: (frost: Frost) => void): (() => void) => {
    const relay = (_event: unknown, frost: Frost): void => listen(frost)
    ipcRenderer.on('frost', relay)
    return () => ipcRenderer.off('frost', relay)
  },
  /** Where the sticky's window is now, as it is dragged. */
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
  /** A milestone reached by something done in this window. */
  onCelebrate: (listen: (moment: Moment) => void): (() => void) => {
    const relay = (_event: unknown, moment: Moment): void => listen(moment)
    ipcRenderer.on('celebrate', relay)
    return () => ipcRenderer.off('celebrate', relay)
  },

  /** Everything past the capture, by channel. Only `vigil:` channels pass. */
  vigil: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(`vigil:${channel}`, ...args),

  /** Bring up the capture prompt, from any window. */
  showPrompt: (): void => ipcRenderer.send('prompt:show'),
  hidePrompt: (): void => ipcRenderer.send('prompt:hide'),
  /** The menu bar's importers, from a window: an Obsidian vault, or files (Readwise, Kindle and the rest). */
  importFrom: (what: 'vault' | 'files'): Promise<void> => ipcRenderer.invoke('import:run', what),
  /** The menu bar's restore, from a window: pick a day's copy, and the app starts again on it. */
  restoreBackup: (): Promise<void> => ipcRenderer.invoke('backup:restore'),
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
  openDrawing: (id: string, scene: unknown): void =>
    ipcRenderer.send('drawing:open', id, scene),

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
    find: (query: string): Promise<{ type: 'capture' | 'nugget' | 'article' | 'question' | 'goal' | 'task'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string }[]> => ipcRenderer.invoke('captures:find', query),
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
contextBridge.exposeInMainWorld('api', api)
