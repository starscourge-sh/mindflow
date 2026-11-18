import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

/** The app's size a step, told to the window in front: it saves it for every window (lib/editor-setup.ts). */
const appSize = (way: 1 | -1 | 0): MenuItemConstructorOptions['click'] => (_item, win) => (win instanceof BrowserWindow ? win : BrowserWindow.getFocusedWindow())?.webContents.send('menu:app-size', way)

/** What the menu bar's items do, each the same as its twin in the tray menu, the Dock or ⌘K (index.ts). */
type MenuActs = {
  name: string
  /** The capture key as it is now (⌘. unless changed in Settings), as an accelerator. */
  captureKey?: string
  capture: () => void
  newNote: () => void
  /** A new note in a small window of its own (small-window.ts), and its key from anywhere. */
  smallNote: () => void
  smallKey?: string
  /** Something the main window does, told by name (`inHome`). */
  inHome: (event: string, detail?: unknown) => void
  /** A place in the main window, by its id (`sendHome('view', …)`). */
  view: (id: string) => void
  importVault: () => void
  importFiles: () => void
  /** Safe mode on or off, and its key: heard only while a Haligtree window is in front, so ⌥⌘S stays “Save All” elsewhere. */
  safeKey?: string
  safeMode: () => void
  /** The About panel, with Haligtree's own icon put on first (a run from source is Electron's app, whose icon it would show). */
  about: () => void
}

/** The places the View menu goes to, in the sidebar's order (places.tsx SECTIONS). */
const PLACES: [string, string][] = [
  ['inbox', 'Inbox'], ['home', 'Home'], ['day', 'Journal'], ['articles', 'Writing'], ['questions', 'Questions'], ['nuggets', 'Gems'],
  ['review', 'Review'], ['today', 'Tasks'], ['calendar', 'Calendar'], ['feed', 'Feed'], ['map', 'Map']
]

/**
 * The menu bar, Haligtree's own: Settings and About in the app menu, making
 * and bringing in notes under File, the places under View, the help under Help.
 * A key the page or the main process already hears is only shown here
 * (`registerAccelerator: false`). macOS ignores that flag and the menu still
 * takes any key the page lets go, so the page calls preventDefault on each key
 * it takes (⌘B and ⌘\ in home.tsx) and one press never does a thing twice.
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
            { label: `About ${acts.name}`, click: () => acts.about() },
            // The welcome's goodbye and What Haligtree can do say both wait here, as in ⌘K.
            { label: "What's new", click: () => acts.inHome('haligtree:whats-new') },
            { label: 'Show the welcome again', click: () => acts.inHome('haligtree:welcome') },
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
        { label: 'New note in a small window', ...shown(acts.smallKey), click: acts.smallNote },
        { label: 'New page', click: () => acts.inHome('haligtree:new-page') },
        { type: 'separator' },
        {
          label: 'Import',
          submenu: [
            { label: 'From Obsidian or Notion…', click: acts.importVault },
            { label: 'From Apple Notes…', click: () => acts.inHome('haligtree:import-folders', { from: 'Apple Notes' }) },
            { label: 'Files, Anki Decks or CSV…', click: acts.importFiles }
          ]
        },
        { label: 'Export everything…', click: () => acts.inHome('haligtree:export-all') },
        { type: 'separator' },
        // ⌘W closes what is open in front first (a note or task beside its list, a tab, a panel), the
        // window only when nothing is (preload, menu:close; home.tsx says what it closed).
        { label: 'Close', accelerator: 'CommandOrControl+W', click: (_item, win) => (win instanceof BrowserWindow ? win : BrowserWindow.getFocusedWindow())?.webContents.send('menu:close') }
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
        // ⌘B and ⌘\ are the page's own keys (home.tsx): told them, as a press would.
        { label: 'Show or Hide Sidebar', ...shown('Command+B'), click: () => acts.inHome('haligtree:sidebar') },
        { label: 'Split the Page', ...shown('Command+\\'), click: () => acts.inHome('haligtree:split-right') },
        { label: 'Open in a split to the right', ...shown('Alt+Command+\\'), click: () => acts.inHome('haligtree:split-right', true) },
        { type: 'separator' },
        // A PDF's pages, as Preview's View menu lays them out: told to the reader open in the main window.
        { label: 'Continuous Scroll', click: () => acts.inHome('haligtree:pdf-layout', 'continuous') },
        { label: 'Single Page', click: () => acts.inHome('haligtree:pdf-layout', 'single') },
        { label: 'Two Pages', click: () => acts.inHome('haligtree:pdf-layout', 'spread') },
        // ⌘R is the web reader's own key (web-reader.tsx), pressed there; this is for a click, told to the window in front.
        { label: 'Read the Page Again', ...shown('Command+R'), click: (_item, win) => (win instanceof BrowserWindow ? win : BrowserWindow.getFocusedWindow())?.webContents.send('menu:read-again') },
        { type: 'separator' },
        { label: 'Safe Mode', accelerator: acts.safeKey, click: acts.safeMode },
        { type: 'separator' },
        // No page zoom: these step the app's own size, saved and the same in every window. Pressed, ⌘+ ⌘− ⌘0 are
        // the page's first (with ⌥, the text in notes); these are for a click.
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: appSize(0) },
        { label: 'Bigger', accelerator: 'CommandOrControl+Plus', click: appSize(1) },
        { label: 'Bigger', accelerator: 'CommandOrControl+=', visible: false, acceleratorWorksWhenHidden: true, click: appSize(1) },
        { label: 'Smaller', accelerator: 'CommandOrControl+-', click: appSize(-1) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // For working on Haligtree, never in the built app. No ⌥⌘I (asked for, 5 Nov). ⌥⌘R, as ⌘R reads a web page again.
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const, accelerator: 'Alt+CommandOrControl+R' }])
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
