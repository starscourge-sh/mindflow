import type { Capture, CaptureMeta, CapturePatch, Change, SaveResult } from '../main/captures'

/** A sticky's frost (main/frost.ts): whether to frost, its screen's desktop picture small and blurred (or null), where that screen is, and where the window is. */
export type Frost = { on: boolean; image: string | null; display: { x: number; y: number; width: number; height: number }; at: { x: number; y: number } }

/** A milestone to celebrate, as src/main/celebrate.ts describes it. */
export type Moment = { id: string; kind: 'kept' | 'streak' | 'inbox' | 'tasks' | 'year' | 'answered'; rank: number; headline: string; line?: string; mark: string; tint: string }

export interface LinkMetadata {
  href: string
  title: string
  description: string
  image: string
  icon: string
  site: string
}

/** A picture as the look window shows it; `rect` is where it sits on screen, if it is in view. */
export interface LookPicture {
  src: string
  width: number
  height: number
  caption: string
  rect?: { x: number; y: number; width: number; height: number }
}

export interface Api {
  fetchLinkMetadata: (url: string) => Promise<LinkMetadata>
  /** Store image bytes and get back the URL that reads them again. */
  saveImage: (mime: string, bytes: Uint8Array) => Promise<string>
  /** Store any file and get back the URL that reads it again. */
  saveFile: (name: string, bytes: Uint8Array) => Promise<string>
  /** Write text to a file the user picks. */
  exportText: (name: string, text: string) => Promise<boolean>
  /** Render HTML to a PDF at a path the user picks. */
  exportPdf: (name: string, html: string) => Promise<boolean>
  /** Copy a stored file somewhere the user picks, under its original name. */
  saveFileAs: (src: string, name: string) => Promise<boolean>
  /** Open a stored file with whatever the system uses for it. */
  openFile: (src: string) => Promise<boolean>
  /** Put a stored image on the system clipboard. */
  copyImage: (src: string) => Promise<boolean>
  /** A word's spelling suggestions when it is misspelt, null when it is not. */
  misspelt: (word: string) => string[] | null
  /** Keep a word as spelt right, in the Mac's own dictionary too. */
  learnWord: (word: string) => Promise<boolean>
  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string) => Promise<{ mime: string; bytes: Uint8Array } | null>
  /** Find pictures a note from Obsidian points at in the vaults Obsidian knows, and store them. */
  bringEmbeds: (refs: string[]) => Promise<({ src: string; name: string; size: number; image: boolean } | null)[]>
  /** Swap the window between the capture size and the roomier one. */
  setExpanded: (expanded: boolean) => Promise<boolean>
  setPanel: (open: boolean) => Promise<boolean>
  fitBox: (height: number, snap?: boolean) => void
  fillHome: (fill: boolean | 'toggle') => Promise<boolean>
  onFilled: (listen: (filled: boolean) => void) => () => void
  showFocus: (on: boolean) => void
  idleSeconds: () => Promise<number>
  focusMenu: (ticking: boolean, abandon?: boolean, extend?: boolean, endBreak?: boolean, early?: boolean) => Promise<'tick' | 'abandon' | 'extend' | 'end' | 'early' | null>
  focusSize: (height: number) => Promise<boolean>
  focusPlace: () => Promise<{ notch: number }>
  onFocusPlaced: (listen: () => void) => () => void
  focusShot: () => Promise<{ url: string } | { denied: true } | null>
  screenSettings: () => void
  glow: (tone: 'done' | 'cancel' | 'break') => void
  onGlow: (listen: (tone: 'done' | 'cancel' | 'break', at?: { x: number; y: number }) => void) => () => void
  onNudge: (listen: (nudge: unknown) => void) => () => void
  nudgeSize: (height: number) => void
  nudge: (nudge: unknown) => void
  stick: (type: string, id: string, on: boolean) => void
  gatherStickies: () => void
  tidyStickies: () => void
  untidyStickies: () => void
  onStickiesTidied: (listen: (count: number) => void) => () => void
  stickiesOut: () => Promise<number>
  onStickiesOut: (listen: (count: number) => void) => () => void
  showFolder: (path: string) => void
  look: (pictures: LookPicture[], at: number) => void
  lookWhat: () => Promise<{ pictures: LookPicture[]; at: number } | null>
  lookDone: () => void
  onLookOver: (listen: () => void) => () => void
  hideSticky: (type: string, id: string) => void
  wiggle: () => void
  lift: () => void
  resizeSticky: (width: number, height: number, done?: boolean) => void
  takeDownSticky: (title: string) => void
  putStickyBack: () => void
  stickyTint: () => Promise<string | null>
  openSticky: (tier: string, id: string, title: string, alt: boolean) => void
  onStickyMotion: (listen: (what: 'arrive' | 'peel' | 'held' | 'tint', value?: unknown) => void) => () => void
  onStickyTaken: (listen: (title: string) => void) => () => void
  onHomeGrow: (listen: (grow: { from: { x: number; y: number; width: number; height: number }; title: string; tint?: string; round?: number }) => void) => () => void
  holdBeacon: (on: boolean) => void
  tuckBeacon: (id: string) => void
  beaconStack: () => Promise<string[]>
  onBeaconStack: (listen: (ids: string[]) => void) => () => void
  frost: () => Promise<Frost | null>
  onFrost: (listen: (frost: Frost) => void) => () => void
  onFrostAt: (listen: (at: { x: number; y: number }) => void) => () => void
  onStir: (listen: () => void) => () => void
  onStickiesShown: (listen: (shown: boolean) => void) => () => void
  hideWindow: () => void
  showPrompt: (text?: string) => void
  revealPrompt: () => void
  onSeed: (listen: (text: string) => void) => () => void
  onPromoteAsked: (listen: () => void) => () => void
  promote: (type: string | null, id: string | null) => void
  hidePrompt: () => void
  /** A vault: the picker's choice, a path, or null for the folder dialog; left out, the picker asks. */
  importFrom: (what: 'vault' | 'files', from?: string | null) => Promise<void>
  restoreBackup: () => Promise<void>
  setAppearance: (mode: 'light' | 'dark') => void
  openInHome: (type: string, id: string, heading?: string) => void
  onSentTo: (listen: (type: string, id: string, heading?: string) => void) => () => void
  vigil: (channel: string, ...args: unknown[]) => Promise<unknown>
  celebrateHere: (on: boolean) => void
  onCelebrate: (listen: (moment: Moment) => void) => () => void
  onShown: (listen: () => void) => () => void
  onBusy: (listen: (count: number) => void) => () => void
  /** How far an import has got, for the main window's chip; null once it is over. */
  onImportProgress: (listen: (at: { done: number; total: number; what: 'notes' | 'pictures' | 'files' } | null) => void) => () => void
  /** The daily backup has failed twice in a row (why), or works again (null). */
  onBackupTrouble: (listen: (reason: string | null) => void) => () => void
  setSurface: (color: string | null) => void
  onBoxShown: (listen: () => void) => () => void
  onBoxAway: (listen: () => void) => () => void
  onHeld: (listen: () => void) => () => void
  onHiding: (listen: () => void) => () => void
  onImported: (listen: () => void) => () => void
  hints: {
    next: () => Promise<{ id: string; captureId: string | null; kind: string; title: string; body: unknown; event: number } | null>
    react: (event: number, id: string, reaction: 'up' | 'down') => Promise<void>
    dwell: (event: number, ms: number) => Promise<void>
  }
  onPointer: (listen: (inside: boolean) => void) => () => void
  openDrawing: (id: string, scene: unknown, name?: string, picture?: string) => void
  drawingPicture: (id: string) => Promise<string | null>
  onDrawingChange: (listen: (id: string, scene: unknown) => void) => () => void
  onDrawingWindow: (listen: (id: string, open: boolean) => void) => () => void
  drawingScene: (id: string) => Promise<unknown>
  saveDrawing: (id: string, scene: unknown) => void
  /** Every capture, kept by the main process. */
  captures: {
    list: () => Promise<CaptureMeta[]>
    get: (id: string) => Promise<Capture | null>
    cards: () => Promise<{ id: string; kind: string; body: unknown }[]>
    search: (query: string) => Promise<CaptureMeta[]>
    rot: () => Promise<Capture[]>
    find: (query: string) => Promise<{ type: 'capture' | 'nugget' | 'article' | 'question' | 'goal' | 'task'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string }[]>
    peek: (type: string, id: string) => Promise<unknown>
    create: (patch: CapturePatch) => Promise<string>
    save: (id: string, patch: CapturePatch) => Promise<SaveResult>
    onChange: (listen: (what: Change[] | null) => void, kinds?: Change['kind'][]) => () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}
