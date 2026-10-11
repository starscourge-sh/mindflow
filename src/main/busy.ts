import { BrowserWindow } from 'electron'

/**
 * Work the main process is doing that a person waits on or should know of
 * (an import, a backup, an export): every window is told how much is under
 * way, and its beam turns round the edge while any is (beam.tsx).
 */
let count = 0
const tell = (): void => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('work:busy', count)
}

/** Runs the work with every window's beam turning, and hands back its result. */
export async function busy<T>(work: () => Promise<T> | T): Promise<T> {
  count++
  tell()
  try {
    return await work()
  } finally {
    count = Math.max(0, count - 1)
    tell()
  }
}
