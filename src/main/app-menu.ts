import { app, BrowserWindow, Menu } from 'electron'

/** What the menu bar's items do, each the same as its twin in the tray menu, the Dock or ⌘K (index.ts). */
export type MenuActs = {
  name: string
  /** The capture key as it is now (⌘. unless changed in Settings), as an accelerator. */
  captureKey?: string
  capture: () => void
  newNote: () => void
  /** Something the main window does, told by name (`inHome`). */
  inHome: (event: string, detail?: unknown) => void
  /** A place in the main window, by its id (`sendHome('view', …)`). */
  view: (id: string) => void
  importVault: () => void
  importFiles: () => void
}

/** The places the View menu goes to, in the sidebar's order (places.tsx SECTIONS). */
const PLACES: [string, string][] = [
  ['inbox', 'Inbox'], ['home', 'Home'], ['day', 'Journal'], ['articles', 'Writing'], ['nuggets', 'Gems'],
  ['review', 'Review'], ['today', 'Tasks'], ['calendar', 'Calendar'], ['feed', 'Feed'], ['map', 'Map']
]

/**
 * The menu bar, Haligtree's own: Settings and About in the app menu, making
 * and bringing in notes under File, the places under View, the help under Help.
 * A key the page or the main process already hears is only shown here
 * (`registerAccelerator: false`), so one press never does a thing twice.
 * Edit > Select All (⌘A) asks the window first, so a list with the focus picks
 * every row, as Finder does, whichever of the page and the menu hears the key
 * first. With no list listening, or while writing, it selects the words as before (preload).
 */
export function setAppMenu(acts: MenuActs): void {
  const shown = (accelerator: string | undefined): Partial<Electron.MenuItemConstructorOptions> => (accelerator ? { accelerator, registerAccelerator: false } : {})
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin'
      ? [{
          label: acts.name,
          submenu: [
            { role: 'about' as const, label: `About ${acts.name}` },
            { type: 'separator' as const },
            { label: 'Settings…', ...shown('Command+,'), click: () => acts.view('settings') },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const, label: `Hide ${acts.name}` },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const, label: `Quit ${acts.name}` }
          ]
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Quick capture', ...shown(acts.captureKey), click: acts.capture },
        { label: 'New note', click: acts.newNote },
        { label: 'New page', click: () => acts.inHome('haligtree:new-page') },
        { type: 'separator' },
        {
          label: 'Import',
          submenu: [
            { label: 'From Obsidian or Notion…', click: acts.importVault },
            { label: 'From Apple Notes…', click: () => acts.inHome('haligtree:import-folders', { from: 'Apple Notes' }) },
            { label: 'Files…', click: acts.importFiles }
          ]
        },
        { label: 'Export everything…', click: () => acts.inHome('haligtree:export-all') },
        { type: 'separator' },
        { role: 'close', label: 'Close Window' }
      ]
    },
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
    {
      label: 'View',
      submenu: [
        ...PLACES.map(([id, label]) => ({ label, click: () => acts.view(id) })),
        { type: 'separator' },
        // ⌘\ is the page's own key (home.tsx): told it, as a press would.
        { label: 'Show or Hide Sidebar', ...shown('Command+\\'), click: () => acts.inHome('haligtree:sidebar') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // For working on Haligtree, never in the built app.
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }])
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: `What ${acts.name} can do`, click: () => acts.view('powers') },
        { label: 'Keyboard shortcuts', click: () => acts.inHome('haligtree:shortcuts') }
      ]
    }
  ]))
}
