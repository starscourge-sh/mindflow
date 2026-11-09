import { BrowserWindow, screen, type Display } from 'electron'
import type { Line } from './snap-lines'

/**
 * The guides drawn while quick capture or a sticky is dragged (snap-lines.ts):
 * faint dashed lines across the screen it is on, in the theme's blue. One
 * see-through window per screen, made the first time it is needed and kept:
 * it never takes a click or the keys, sits over everything, and is put away
 * the moment the drag ends.
 */
const sheets = new Map<number, BrowserWindow>()
/** Sheets whose page has loaded, and the drawing each waits to show until it has. */
const loaded = new WeakSet<BrowserWindow>()
const waiting = new WeakMap<BrowserWindow, string>()
/** What is drawn now, for a probe to read (qa/snap-guides.mjs). */
const drawn: { display: number | null; lines: Line[]; shown: boolean } = { display: null, lines: [], shown: false }
;(globalThis as { haligtreeGuides?: typeof drawn }).haligtreeGuides = drawn

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
svg{position:fixed;inset:0;width:100%;height:100%}
line{stroke-width:1;stroke-dasharray:4 4;shape-rendering:crispEdges;opacity:.7;transition:opacity 120ms cubic-bezier(.16,1,.3,1)}
@starting-style{line{opacity:0}}
.still line{transition:none}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg"></svg><script>
window.draw = (lines, colour, still) => {
  const svg = document.querySelector('svg')
  document.body.classList.toggle('still', still)
  const w = innerWidth, h = innerHeight
  svg.innerHTML = lines.map((l) => l.axis === 'x'
    ? '<line x1="' + (l.at + .5) + '" y1="0" x2="' + (l.at + .5) + '" y2="' + h + '" stroke="' + colour + '"/>'
    : '<line x1="0" y1="' + (l.at + .5) + '" x2="' + w + '" y2="' + (l.at + .5) + '" stroke="' + colour + '"/>').join('')
}
</script></body></html>`

function sheetFor(display: Display): BrowserWindow {
  const had = sheets.get(display.id)
  if (had && !had.isDestroyed()) {
    if (!sameBounds(had.getBounds(), display.bounds)) had.setBounds(display.bounds)
    return had
  }
  const win = new BrowserWindow({
    ...display.bounds,
    title: 'Haligtree guides',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Lines asked for before the page was in are drawn the moment it is.
  win.webContents.once('did-finish-load', () => {
    loaded.add(win)
    const call = waiting.get(win)
    waiting.delete(win)
    if (call) void win.webContents.executeJavaScript(call).catch(() => undefined)
  })
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
  win.on('closed', () => sheets.delete(display.id))
  sheets.set(display.id, win)
  return win
}

const sameBounds = (a: Electron.Rectangle, b: Electron.Rectangle): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * Lines (in screen points) drawn over the screen `on` is in, in `colour`;
 * at once, with no fade, when `still` (Reduce motion, Motion off). The other
 * screens' guides are put away. No lines: the guides go.
 */
export function showGuides(on: Electron.Rectangle, lines: Line[], colour: string, still: boolean): void {
  if (!lines.length) return hideGuides()
  const display = screen.getDisplayMatching(on)
  for (const [id, other] of sheets) if (id !== display.id && !other.isDestroyed() && other.isVisible()) other.hide()
  const win = sheetFor(display)
  const { x, y } = display.bounds
  const local = lines.map((line) => ({ axis: line.axis, at: line.at - (line.axis === 'x' ? x : y) }))
  const same = drawn.shown && drawn.display === display.id && JSON.stringify(drawn.lines) === JSON.stringify(lines)
  drawn.display = display.id
  drawn.lines = lines
  drawn.shown = true
  if (same) return
  const call = `draw(${JSON.stringify(local)}, ${JSON.stringify(colour)}, ${still})`
  if (loaded.has(win)) void win.webContents.executeJavaScript(call).catch(() => undefined)
  else waiting.set(win, call)
  if (!win.isVisible()) win.showInactive()
}

/** The drag is over: every guide goes at once. */
export function hideGuides(): void {
  if (drawn.shown) for (const win of sheets.values()) if (!win.isDestroyed() && win.isVisible()) {
    waiting.delete(win)
    if (loaded.has(win)) void win.webContents.executeJavaScript('draw([], "", true)').catch(() => undefined)
    win.hide()
  }
  drawn.lines = []
  drawn.shown = false
  drawn.display = null
}

/** The theme's blue as the dragged window's page has it: what the guides are drawn in. */
export function guideColour(win: BrowserWindow): Promise<string> {
  return win.webContents
    .executeJavaScript(`(() => { const i = document.createElement('i'); i.style.color = 'var(--tt-color-text-blue, var(--tt-brand-color-400))'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c })()`)
    .then((colour: unknown) => (typeof colour === 'string' && colour ? colour : ''))
    .catch(() => '')
}

/** For a probe: the guide windows made so far, by screen. */
;(globalThis as { haligtreeGuideSheets?: () => BrowserWindow[] }).haligtreeGuideSheets = () => [...sheets.values()].filter((win) => !win.isDestroyed())
