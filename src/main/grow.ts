import type { BrowserWindow, Rectangle } from 'electron'

/**
 * What a small window looked like as it opens into the main one, so the page
 * can grow out of it: its title, and its paper's colour and corner.
 */
export type GrowLook = { title: string; tint?: string; round?: number }

/**
 * Something small (a sticky, a note's own window, the box) opened into the
 * main window as the same note, the way Little Arc opens into Arc: once the
 * main window is on screen, its page is told to grow out of `from` (a place
 * on the screen, in points), rather than appearing in one frame. The page
 * itself does the growing (grow-from.tsx), after `home:open` has opened the
 * note. Shared by whatever promotes into the main window.
 */
export function growFrom(win: BrowserWindow | null, from: Rectangle, look: GrowLook): void {
  if (!win || win.isDestroyed()) return
  const tell = (): void => void (!win.isDestroyed() && win.webContents.send('home:grow', { from, ...look }))
  if (win.isVisible()) tell()
  else win.once('show', () => setTimeout(tell, 16))
}
