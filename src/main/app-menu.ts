import { BrowserWindow, Menu } from 'electron'

/**
 * The menu bar: Electron's own, with one change. Edit > Select All (⌘A) asks
 * the window first, so a list with the focus picks every row, as Finder does,
 * whichever of the page and the menu hears the key first. With no list
 * listening, or while writing, it selects the words as before (preload).
 */
export function setAppMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { label: 'Select All', accelerator: 'CommandOrControl+A', click: (_item, win) => (win instanceof BrowserWindow ? win : BrowserWindow.getFocusedWindow())?.webContents.send('menu:select-all') },
        ...(process.platform === 'darwin' ? [{ type: 'separator' as const }, { label: 'Speech', submenu: [{ role: 'startSpeaking' as const }, { role: 'stopSpeaking' as const }] }] : [])
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]))
}
