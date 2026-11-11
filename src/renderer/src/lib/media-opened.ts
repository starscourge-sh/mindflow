import { call } from './haligtree'

/**
 * A stored file opened as itself (a picture looked at, a book opened in the reader, a recording played), written down
 * for Files' "Last opened" column and its Recent cards. Said at once to the page in this window, so its row moves
 * without the whole list being read again.
 */
const STORED = /^(?:haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/i
const opened = new Map<string, string>()

/** When this window last opened it, if it did since the list was read. */
export const openedHere = (src: string): string | undefined => opened.get(src)

export function markOpened(src: string): void {
  if (!STORED.test(src)) return
  opened.set(src, new Date().toISOString())
  void call('media:opened', src).catch(() => undefined)
  window.dispatchEvent(new CustomEvent('haligtree:media-opened', { detail: src }))
}
