import { contextBridge, ipcRenderer } from 'electron'
import type { LinkMetadata } from './index.d'
import type { Capture, CaptureMeta, CapturePatch } from '../main/captures'

// Every live view listens for changes; one IPC listener tells them all,
// rather than one each past Node's limit of ten.
const changes = new Set<() => void>()
// A burst of changes, an import or several saves in a row, is told once.
let telling: ReturnType<typeof setTimeout> | undefined
ipcRenderer.on('captures:changed', () => {
  clearTimeout(telling)
  telling = setTimeout(() => changes.forEach((listen) => listen()), 60)
})

// A note opened in a window of its own, told by the main process to every
// other window, which closes it there: two editors on one note would each
// save over the other's words.
ipcRenderer.on('notes:opened-apart', (_event, id: string) => window.dispatchEvent(new CustomEvent('vigil:opened-apart', { detail: id })))

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

  /** Put a stored image on the system clipboard. */
  copyImage: (src: string): Promise<boolean> => ipcRenderer.invoke('copy-image', src),

  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string): Promise<{ mime: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('fetch-image', href),

  /** Swap the window between the capture size and the roomier one. */
  setExpanded: (expanded: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:expand', expanded),
  /** Widen the window for the side panel, or narrow it back to the box. */
  setPanel: (open: boolean): Promise<boolean> => ipcRenderer.invoke('window:panel', open),
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

  /** Each time the window is about to be put away. */
  onHiding: (listen: () => void): (() => void) => {
    const relay = (): void => listen()
    ipcRenderer.on('window:hiding', relay)
    return () => ipcRenderer.off('window:hiding', relay)
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

  /** Everything past the capture, by channel. Only `vigil:` channels pass. */
  vigil: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(`vigil:${channel}`, ...args),

  /** Bring up the capture prompt, from any window. */
  showPrompt: (): void => ipcRenderer.send('prompt:show'),
  /** The menu bar's importers, from a window: an Obsidian vault, or files (Readwise, Kindle and the rest). */
  importFrom: (what: 'vault' | 'files'): Promise<void> => ipcRenderer.invoke('import:run', what),
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
    list: (): Promise<CaptureMeta[]> => ipcRenderer.invoke('captures:list'),
    get: (id: string): Promise<Capture | null> => ipcRenderer.invoke('captures:get', id),
    /** Links and captures holding a card, to tidy: read without counting as an open. */
    cards: (): Promise<{ id: string; kind: string; body: unknown }[]> => ipcRenderer.invoke('captures:cards'),
    /** Search the titles and bodies, newest first. */
    find: (query: string): Promise<{ type: 'capture' | 'nugget' | 'article' | 'task'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; body: unknown; capturedAt: string }[]> => ipcRenderer.invoke('captures:find', query),
    /** Three open captures, leaning old: the rot sampler. */
    rot: (): Promise<Capture[]> => ipcRenderer.invoke('captures:rot'),
    /** What `@` offers for the text typed after it. */
    search: (query: string): Promise<CaptureMeta[]> => ipcRenderer.invoke('captures:search', query),
    create: (patch: CapturePatch): Promise<string> => ipcRenderer.invoke('captures:create', patch),
    save: (id: string, patch: CapturePatch): Promise<void> =>
      ipcRenderer.invoke('captures:save', id, patch),
    /** Any window's write, as it happens. */
    onChange: (listen: () => void): (() => void) => {
      changes.add(listen)
      return () => void changes.delete(listen)
    }
  }
}

// Context isolation is on, so this is the only way across.
contextBridge.exposeInMainWorld('api', api)
