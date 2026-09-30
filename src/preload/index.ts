import { contextBridge, ipcRenderer } from 'electron'
import type { LinkMetadata } from './index.d'
import type { NotePatch } from './index.d'
import type { Note, NoteMeta } from '../main/notes'

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

  /** Put the window away. It keeps its contents and its place on screen. */
  hideWindow: (): void => ipcRenderer.send('window:hide'),

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

  /** The stored notes. */
  notes: {
    list: (): Promise<NoteMeta[]> => ipcRenderer.invoke('notes:list'),
    /** No id opens the one last worked on, making one if the store is empty. */
    open: (id?: string): Promise<Note> => ipcRenderer.invoke('notes:open', id),
    create: (): Promise<Note> => ipcRenderer.invoke('notes:create'),
    save: (id: string, patch: NotePatch): Promise<NoteMeta | null> =>
      ipcRenderer.invoke('notes:save', id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('notes:delete', id)
  }
}

// Context isolation is on, so this is the only way across.
contextBridge.exposeInMainWorld('api', api)
