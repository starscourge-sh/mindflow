import type { Capture, CaptureMeta, CapturePatch } from '../main/captures'

export interface LinkMetadata {
  href: string
  title: string
  description: string
  image: string
  icon: string
  site: string
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
  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string) => Promise<{ mime: string; bytes: Uint8Array } | null>
  /** Swap the window between the capture size and the roomier one. */
  setExpanded: (expanded: boolean) => Promise<boolean>
  setPanel: (open: boolean) => Promise<boolean>
  fillHome: (fill: boolean | 'toggle') => Promise<boolean>
  onFilled: (listen: (filled: boolean) => void) => () => void
  setRecordable: (on: boolean) => Promise<boolean>
  showFocus: (on: boolean) => void
  glow: (tone: 'done' | 'cancel') => void
  onGlow: (listen: (tone: 'done' | 'cancel') => void) => () => void
  stick: (type: string, id: string, on: boolean) => void
  hideWindow: () => void
  showPrompt: () => void
  importFrom: (what: 'vault' | 'files') => Promise<void>
  setAppearance: (mode: 'light' | 'dark') => void
  openInHome: (type: string, id: string) => void
  onSentTo: (listen: (type: string, id: string) => void) => () => void
  vigil: (channel: string, ...args: unknown[]) => Promise<unknown>
  onShown: (listen: () => void) => () => void
  onHiding: (listen: () => void) => () => void
  hints: {
    next: () => Promise<{ id: string; captureId: string | null; kind: string; title: string; body: unknown; event: number } | null>
    react: (event: number, id: string, reaction: 'up' | 'down') => Promise<void>
    dwell: (event: number, ms: number) => Promise<void>
  }
  onPointer: (listen: (inside: boolean) => void) => () => void
  openDrawing: (id: string, scene: unknown) => void
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
    find: (query: string) => Promise<{ type: 'capture' | 'nugget' | 'article' | 'task'; id: string; number: number | null; kind: string; status: string; source: string; attribution: string | null; label: string; body: unknown; capturedAt: string }[]>
    create: (patch: CapturePatch) => Promise<string>
    save: (id: string, patch: CapturePatch) => Promise<void>
    onChange: (listen: () => void) => () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}
