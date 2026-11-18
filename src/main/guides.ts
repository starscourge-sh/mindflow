import { BrowserWindow, screen, type Display } from 'electron'
import type { Line } from './snap-lines'

/**
 * The guides drawn while quick capture, a sticky or a goal's card is carried (snap-lines.ts), as Raycast draws its
 * window's: from the drag's first move, thin grey dashed lines across the whole screen the card is on, along the places
 * it can settle, that stay exactly as they are until it is let go: they never move, change colour, light up or turn
 * solid, and the card coming onto one says so with the trackpad's tap alone. One look for every carried window.
 * A dash is 1 point thin, 5 on and 5 off, in two greys taking turns, each filling the other's gaps: the dark one shows
 * on a pale desktop, the pale one on a dark desktop, and on the grey between them both do (1pt dashes in one colour at
 * 70% were hard to see, 10 Nov). Both at 40%, so they are there without striking through the screen ("make the lines
 * fainter", 16 Nov). They are the same in a light and a dark look: they sit on the desktop, not on a page.
 * One see-through window per screen, made before anything can be carried and kept: it never takes a click or the
 * keys, sits over everything, and is put away the moment the drag ends.
 */
const sheets = new Map<number, BrowserWindow>()
/** Sheets whose page has loaded, and the drawing each waits to show until it has. */
const loaded = new WeakSet<BrowserWindow>()
const waiting = new WeakMap<BrowserWindow, string>()
/** What is drawn now, for a probe to read (qa/snap-guides.mjs): every line, and the ones the card is on (drawn no differently). */
const drawn: { display: number | null; lines: Line[]; on: Line[]; shown: boolean } = { display: null, lines: [], on: [], shown: false }
;(globalThis as { haligtreeGuides?: typeof drawn }).haligtreeGuides = drawn

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
svg{position:fixed;inset:0;width:100%;height:100%}
line{shape-rendering:crispEdges;fill:none;stroke-width:1;stroke-dasharray:5 5;opacity:.4}
.ink{stroke:rgb(60,60,60)}
.halo{stroke:rgb(235,235,235);stroke-dashoffset:5}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg"></svg><script>
const svg = document.querySelector('svg')
window.draw = (lines) => {
  const w = innerWidth, h = innerHeight
  svg.innerHTML = lines.map((l) => {
    const at = l.at + .5
    const ends = l.axis === 'x' ? 'x1="' + at + '" y1="0" x2="' + at + '" y2="' + h + '"' : 'x1="0" y1="' + at + '" x2="' + w + '" y2="' + at + '"'
    return '<g data-line="' + l.axis + ':' + l.at + '"><line class="halo" ' + ends + '/><line class="ink" ' + ends + '/></g>'
  }).join('')
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
  // Its address names its view, as every Haligtree window's does (index.ts, load): one with none is quick capture's.
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}#view=guides`)
  win.on('closed', () => sheets.delete(display.id))
  sheets.set(display.id, win)
  return win
}

const sameBounds = (a: Electron.Rectangle, b: Electron.Rectangle): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * Every line a drag can settle on (screen points), drawn over the screen `card` is in; `on`, the lines the card is on
 * now, is kept for a probe and drawn no differently. The other screens' guides are put away. No lines: the guides go.
 */
export function showGuides(card: Electron.Rectangle, lines: Line[], on: Line[]): void {
  if (!lines.length) return hideGuides()
  drawn.on = on
  const display = screen.getDisplayMatching(card)
  if (drawn.shown && drawn.display === display.id && JSON.stringify(drawn.lines) === JSON.stringify(lines)) return
  for (const [id, other] of sheets) if (id !== display.id && !other.isDestroyed() && other.isVisible()) other.hide()
  const win = sheetFor(display)
  const { x, y } = display.bounds
  drawn.display = display.id
  drawn.lines = lines
  drawn.shown = true
  const call = `draw(${JSON.stringify(lines.map((line) => ({ axis: line.axis, at: line.at - (line.axis === 'x' ? x : y) })))})`
  if (loaded.has(win)) void win.webContents.executeJavaScript(call).catch(() => undefined)
  else waiting.set(win, call)
  if (!win.isVisible()) win.showInactive()
}

/**
 * Each screen's sheet made, its page loaded and hidden, before anything can be carried (a sticky or quick capture
 * coming on screen, a drag starting): made at a drag's first move, the very first drag drew nothing until its page
 * had loaded, a line coming late.
 */
export function readyGuides(): void {
  for (const display of screen.getAllDisplays()) sheetFor(display)
}

/** The drag is over: every guide goes at once. */
export function hideGuides(): void {
  if (drawn.shown) for (const win of sheets.values()) if (!win.isDestroyed() && win.isVisible()) {
    waiting.delete(win)
    if (loaded.has(win)) void win.webContents.executeJavaScript('draw([])').catch(() => undefined)
    win.hide()
  }
  drawn.lines = []
  drawn.on = []
  drawn.shown = false
  drawn.display = null
}

/** For a probe: the guide windows made so far, by screen. */
;(globalThis as { haligtreeGuideSheets?: () => BrowserWindow[] }).haligtreeGuideSheets = () => [...sheets.values()].filter((win) => !win.isDestroyed())
