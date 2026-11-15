import { clipboard, ClipboardItem, ipcMain } from 'electron'

/**
 * The clipboard the app copies to and pastes from. On a person's Mac it is the Mac's own (Electron's clipboard).
 * Under a test run (HALIGTREE_QA_AWAY) it is a stand-in kept in memory, so a probe never reads or overwrites what
 * the person at the Mac copied (15 Nov 2026: every merge check emptied it, and two test lanes raced through it).
 * Every copy and paste in main goes through here, and under a test run so does every one a page makes (the
 * preload's bridge, standInClipboard): one stand-in, read and filled by probes as globalThis.qaPasteboard
 * (qa/pasteboard.mjs).
 */
export type Pasteboard = Pick<Electron.Clipboard, 'clear' | 'has' | 'read' | 'readText' | 'write' | 'writeText'>

/** One copy as it crosses to a page and back: each kind's bytes, by its type. */
export type Carried = Record<string, Uint8Array>

/** What a test run's clipboard holds: the last copy only, as on the Mac. */
let held: Carried[] = []

const words = new TextEncoder()

/** One copy's kinds as bytes (a bookmark, the one kind Electron hands back as an object, as its address). */
async function carry(item: Electron.ClipboardItem): Promise<Carried> {
  const kinds: Carried = {}
  for (const type of item.types) {
    const one = await item.getType(type)
    kinds[type] = one instanceof Blob ? new Uint8Array(await one.arrayBuffer()) : words.encode(one.url)
  }
  return kinds
}

const item = (kinds: Carried): Electron.ClipboardItem => new ClipboardItem(Object.fromEntries(Object.entries(kinds).map(([type, bytes]) => [type, new Blob([new Uint8Array(bytes)], { type })])))

const standIn: Pasteboard = {
  clear: () => void (held = []),
  has: async (type) => held.some((kinds) => type in kinds),
  read: async () => held.map(item),
  readText: async () => new TextDecoder().decode(held.find((kinds) => kinds['text/plain'])?.['text/plain'] ?? new Uint8Array()),
  write: async (items) => void (held = await Promise.all(items.map(carry))),
  writeText: async (text) => void (held = [{ 'text/plain': words.encode(text) }])
}

export const pasteboard: Pasteboard = process.env.HALIGTREE_QA_AWAY ? standIn : clipboard

if (process.env.HALIGTREE_QA_AWAY) {
  ;(globalThis as { qaPasteboard?: Pasteboard }).qaPasteboard = pasteboard
  // The pages' side of the same stand-in (preload standInClipboard): what a page copies, and what it reads to paste.
  ipcMain.handle('qa:pasteboard-write', (_event, items: Carried[]) => void (held = items))
  ipcMain.handle('qa:pasteboard-read', () => held)
}
