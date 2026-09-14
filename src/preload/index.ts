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

  /** Put a stored image on the system clipboard. */
  copyImage: (src: string): Promise<boolean> => ipcRenderer.invoke('copy-image', src),

  /** Read a linked image, which the renderer's own content policy forbids. */
  fetchImage: (href: string): Promise<{ mime: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('fetch-image', href),

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
