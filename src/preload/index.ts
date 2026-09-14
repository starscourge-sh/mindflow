import { contextBridge, ipcRenderer } from 'electron'
import type { LinkMetadata } from './index.d'

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
    ipcRenderer.invoke('fetch-image', href)
}

// Context isolation is on, so this is the only way across.
contextBridge.exposeInMainWorld('api', api)
