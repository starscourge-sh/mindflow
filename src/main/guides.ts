import { BrowserWindow, screen, type Display } from 'electron'
import type { Line } from './snap-lines'

/**
 * The guides drawn while quick capture or a sticky is dragged (snap-lines.ts), Raycast's way: from the drag's first
 * move every line the card can settle on runs across the screen it is on, in thin even dashes, and stays where it is
 * until the drag ends; the one the card is on goes solid, in the theme's blue, with the trackpad's tap, and goes quiet
 * again as the card leaves it. Nothing slides and nothing comes late. A quiet line is two inks dashed in turn, each
 * filling the other's gaps: the theme's ink taken darker (lighter on a dark page) and its paper taken lighter (darker),
 * so on any wallpaper one of the two stands out, dark dashes on a pale desktop, pale ones on a dark desktop
 * (1pt dashes in one colour at 70% were hard to see, 10 Nov). The solid line keeps a hairline of the paper's ink each
 * side, so it holds on a wallpaper of its own blue. One see-through window per screen, made the first time it is
 * needed and kept: it never takes a click or the keys, sits over everything, and is put away the moment the drag ends.
 */
const sheets = new Map<number, BrowserWindow>()
/** Sheets whose page has loaded, and the drawing each waits to show until it has. */
const loaded = new WeakSet<BrowserWindow>()
const waiting = new WeakMap<BrowserWindow, string>()
/** What is drawn now, for a probe to read (qa/snap-guides.mjs): every line, and the lit ones among them. */
const drawn: { display: number | null; lines: Line[]; lit: Line[]; inks: Inks | null; shown: boolean } = { display: null, lines: [], lit: [], inks: null, shown: false }
;(globalThis as { haligtreeGuides?: typeof drawn }).haligtreeGuides = drawn
/** The drag that drew what is up, over which card and how, so its inks can be put right without a move (reinkGuides). */
let drawnBy: { by: object; on: Electron.Rectangle; still: boolean } | null = null

/** The inks a drag's guides are drawn in, taken from the dragged window's theme (guideInks). */
export type Inks = { lit: string; ink: string; halo: string }
/** Until the dragged window's page has said its theme's: the Mac's blue, and a neutral pair. */
export const PLAIN_INKS: Inks = { lit: 'rgb(10, 132, 255)', ink: 'rgb(30, 30, 30)', halo: 'rgb(250, 250, 250)' }

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
svg{position:fixed;inset:0;width:100%;height:100%}
line{shape-rendering:crispEdges;fill:none}
g{opacity:1;transition:opacity 120ms cubic-bezier(.16,1,.3,1)}
@starting-style{g{opacity:0}}
.still g{transition:none}
.ink,.halo{stroke-width:1;stroke-dasharray:5 5}
.ink{stroke:var(--ink)}
.halo{stroke:var(--halo);stroke-dashoffset:5}
.rim{stroke:var(--halo);stroke-width:4;opacity:.85}
.lit{stroke:var(--lit);stroke-width:2}
g:not(.on) :is(.rim,.lit),g.on :is(.ink,.halo){display:none}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg"></svg><script>
const svg = document.querySelector('svg')
const key = (l) => l.axis + ':' + l.at
window.draw = (lines, lit, inks, still) => {
  document.body.classList.toggle('still', still)
  for (const name of ['lit', 'ink', 'halo']) if (inks[name]) svg.style.setProperty('--' + name, inks[name])
  // The same lines as before: only which is lit changes, so none is drawn again or fades in again.
  const set = lines.map(key).join(' ')
  if (svg.dataset.set !== set) {
    svg.dataset.set = set
    const w = innerWidth, h = innerHeight
    svg.innerHTML = lines.map((l) => {
      const at = l.at + .5
      const ends = l.axis === 'x' ? 'x1="' + at + '" y1="0" x2="' + at + '" y2="' + h + '"' : 'x1="0" y1="' + at + '" x2="' + w + '" y2="' + at + '"'
      return '<g data-line="' + key(l) + '">' + ['halo', 'ink', 'rim', 'lit'].map((part) => '<line class="' + part + '" ' + ends + '/>').join('') + '</g>'
    }).join('')
  }
  const on = new Set(lit.map(key))
  for (const g of svg.children) g.classList.toggle('on', on.has(g.dataset.line))
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
 * Every line a drag can settle on (screen points), drawn quiet over the screen `on` is in, with `lit` (the lines the
 * card is on) solid; at once, with no fade, when `still` (Reduce motion, Motion off). The other screens' guides are
 * put away. No lines: the guides go. `by`: the drag drawing them (reinkGuides).
 */
export function showGuides(on: Electron.Rectangle, lines: Line[], lit: Line[], inks: Inks, still: boolean, by: object | null = null): void {
  if (!lines.length) return hideGuides()
  drawnBy = by ? { by, on, still } : null
  const display = screen.getDisplayMatching(on)
  for (const [id, other] of sheets) if (id !== display.id && !other.isDestroyed() && other.isVisible()) other.hide()
  const win = sheetFor(display)
  const { x, y } = display.bounds
  const local = (list: Line[]): Line[] => list.map((line) => ({ axis: line.axis, at: line.at - (line.axis === 'x' ? x : y) }))
  // The inks too: a page that says its theme's after the first step has them drawn at once (reinkGuides).
  const same = drawn.shown && drawn.display === display.id && JSON.stringify([drawn.lines, drawn.lit, drawn.inks]) === JSON.stringify([lines, lit, inks])
  drawn.display = display.id
  drawn.lines = lines
  drawn.lit = lit
  drawn.inks = inks
  drawn.shown = true
  if (same) return
  const call = `draw(${JSON.stringify(local(lines))}, ${JSON.stringify(local(lit))}, ${JSON.stringify(inks)}, ${still})`
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

/**
 * The dragged window's page has said its inks after `by` drew in older ones (its theme changed since its last drag):
 * the same lines drawn again in them, at once, the card still or not. Nothing once that drag's guides are gone.
 */
export function reinkGuides(by: object, inks: Inks): void {
  if (drawn.shown && drawnBy?.by === by) showGuides(drawnBy.on, drawn.lines, drawn.lit, inks, drawnBy.still, by)
}

/** The drag is over: every guide goes at once. */
export function hideGuides(): void {
  drawnBy = null
  if (drawn.shown) for (const win of sheets.values()) if (!win.isDestroyed() && win.isVisible()) {
    waiting.delete(win)
    if (loaded.has(win)) void win.webContents.executeJavaScript('draw([], [], {}, true)').catch(() => undefined)
    win.hide()
  }
  drawn.lines = []
  drawn.lit = []
  drawn.inks = null
  drawn.shown = false
  drawn.display = null
}

/**
 * The guides' inks as the dragged window's page has its theme: the theme's blue for the line the card is on, and for
 * the quiet ones its ink and its paper each taken further from the other (toward black and white on a light page,
 * the other way on a dark one), so the pair stands out on any desktop.
 */
export function guideInks(win: BrowserWindow): Promise<Inks | null> {
  return win.webContents
    .executeJavaScript(`(() => {
      const read = (colour) => { const i = document.createElement('i'); i.style.color = colour; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c }
      const pen = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')
      pen.fillStyle = read('var(--background)'); pen.fillRect(0, 0, 1, 1)
      const [r, g, b] = pen.getImageData(0, 0, 1, 1).data
      const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
      return { lit: read('var(--tt-color-text-blue, var(--tt-brand-color-400))'), ink: read('color-mix(in oklab, var(--foreground) 55%, ' + (dark ? 'white' : 'black') + ')'), halo: read('color-mix(in oklab, var(--background) 45%, ' + (dark ? 'black' : 'white') + ')') }
    })()`)
    .then((inks: unknown) => {
      const said = inks as Partial<Inks> | null
      return said && [said.lit, said.ink, said.halo].every((one) => typeof one === 'string' && one) ? (said as Inks) : null
    })
    .catch(() => null)
}

/** For a probe: the guide windows made so far, by screen. */
;(globalThis as { haligtreeGuideSheets?: () => BrowserWindow[] }).haligtreeGuideSheets = () => [...sheets.values()].filter((win) => !win.isDestroyed())
