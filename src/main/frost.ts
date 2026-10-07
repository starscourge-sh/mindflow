import { execFile } from 'child_process'
import { stat } from 'fs/promises'
import { BrowserWindow, ipcMain, nativeImage, nativeTheme, screen, type Display } from 'electron'
import { stickyFrost } from './vigil'
import type { Frost } from '../preload/index.d'

/**
 * Frosted stickies, faked. macOS blurs next to nothing behind a window this
 * small and tilted, so text showed over text. Instead each sticky draws the
 * desktop picture itself, small and softly blurred, lined up with where the
 * window sits on its screen, under a wash of the theme's paper.
 *
 * The picture is found the way System Settings sets it (NSWorkspace, asked
 * through osascript's JavaScript), which needs no Screen Recording or
 * Automation permission. It is only read, kept as a tiny blurred copy per
 * screen, and never leaves the Mac. A picture that can't be read (a moving
 * Aerial, a shuffling folder) means none: the sticky shows a plain frosted wash.
 */


// Asks AppKit for each screen's desktop picture. Prints [{ id, path }], id being Electron's display id.
const ASK = `ObjC.import("AppKit")
const screens = $.NSScreen.screens, out = []
for (let i = 0; i < screens.count; i++) {
  const one = screens.objectAtIndex(i)
  const url = $.NSWorkspace.sharedWorkspace.desktopImageURLForScreen(one)
  out.push({ id: one.deviceDescription.objectForKey("NSScreenNumber").intValue, path: url.isNil() ? null : ObjC.unwrap(url.path) })
}
JSON.stringify(out)`

/** Each screen's desktop picture, as last asked: its path, when it last changed, and the blurred copy once made. */
const pictures = new Map<number, { path: string; stamp: string; image?: Promise<string | null> }>()
const windows = new Map<BrowserWindow, { up: () => boolean; display?: number }>()

/** Ask which picture each screen shows now. Quiet on failure: no picture is the fallback. */
function ask(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()
  return new Promise((done) =>
    execFile('osascript', ['-l', 'JavaScript', '-e', ASK], { timeout: 5000 }, async (error, stdout) => {
      try {
        const found = error ? [] : (JSON.parse(stdout) as { id: number; path: string | null }[])
        const seen = new Set<number>()
        for (const { id, path } of found) {
          // A folder (shuffling) or nothing at all (Aerial) is no picture.
          const file = path ? await stat(path).catch(() => null) : null
          if (!path || !file?.isFile()) continue
          seen.add(id)
          const stamp = `${path}:${file.mtimeMs}:${file.size}`
          if (pictures.get(id)?.stamp !== stamp) pictures.set(id, { path, stamp })
        }
        for (const id of [...pictures.keys()]) if (!seen.has(id)) pictures.delete(id)
      } catch {
        pictures.clear()
      }
      done()
    })
  )
}

/**
 * A screen's picture made tiny (a sixteenth of the screen) and blurred, as a
 * data URL: cropped as macOS fills a screen (scaled to cover, centred). A few
 * kilobytes, made once per picture and screen size. QuickLook reads it, so
 * HEIC, PNG and JPEG all work, at no more than 640 pixels.
 */
async function blurred(path: string, display: Display): Promise<string | null> {
  const { width, height } = display.bounds
  const thumb = await nativeImage.createThumbnailFromPath(path, { width: 640, height: 640 }).catch(() => null)
  if (!thumb || thumb.isEmpty()) return null
  const size = thumb.getSize()
  const scale = Math.max(width / size.width, height / size.height)
  const crop = { width: Math.round(width / scale), height: Math.round(height / scale), x: 0, y: 0 }
  crop.x = Math.round((size.width - crop.width) / 2)
  crop.y = Math.round((size.height - crop.height) / 2)
  const w = Math.max(8, Math.round(width / 16))
  const h = Math.max(8, Math.round(height / 16))
  const small = thumb.crop(crop).resize({ width: w, height: h, quality: 'good' })
  const pixels = small.toBitmap()
  if (pixels.length < w * h * 4) return null
  // Three passes of a small box blur at this size: about 30 pixels of blur on the screen.
  for (let pass = 0; pass < 3; pass++) boxBlur(pixels, w, h, 2)
  return nativeImage.createFromBitmap(pixels, { width: w, height: h }).toDataURL()
}

/** A box blur in place, across then down, edges held. */
function boxBlur(pixels: Buffer, w: number, h: number, r: number): void {
  const line = new Float32Array(Math.max(w, h) * 4)
  const run = (count: number, at: (i: number) => number): void => {
    for (let i = 0; i < count; i++) for (let c = 0; c < 4; c++) line[i * 4 + c] = pixels[at(i) + c]
    for (let i = 0; i < count; i++)
      for (let c = 0; c < 4; c++) {
        let sum = 0
        for (let k = -r; k <= r; k++) sum += line[Math.min(count - 1, Math.max(0, i + k)) * 4 + c]
        pixels[at(i) + c] = Math.round(sum / (2 * r + 1))
      }
  }
  for (let y = 0; y < h; y++) run(w, (x) => (y * w + x) * 4)
  for (let x = 0; x < w; x++) run(h, (y) => (y * w + x) * 4)
}

/** Frosted unless turned off in Settings or Reduce transparency is on. */
const frostOn = (): boolean => stickyFrost() && !nativeTheme.prefersReducedTransparency

/** Everything a sticky needs to draw its frost now. */
async function frostOf(win: BrowserWindow): Promise<Frost> {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const on = frostOn()
  const picture = on ? pictures.get(display.id) : undefined
  if (picture && !picture.image) picture.image = blurred(picture.path, display).catch(() => null)
  return { on, image: (await picture?.image) ?? null, display: display.bounds, at: { x: bounds.x, y: bounds.y } }
}

/** Tell one sticky its frost in full. */
async function tell(win: BrowserWindow): Promise<void> {
  const one = windows.get(win)
  if (!one || win.isDestroyed()) return
  const frost = await frostOf(win)
  if (win.isDestroyed()) return
  one.display = screen.getDisplayMatching(win.getBounds()).id
  win.webContents.send('frost', frost)
}

/** Every sticky on the desktop told again: the setting, a screen or its picture changed. */
export function retellFrost(): void {
  for (const [win, one] of windows) if (one.up()) void tell(win)
}

let asked = 0
/** Ask afresh, then tell the stickies whose picture changed (or all, when asked to). */
async function refresh(all = false): Promise<void> {
  const before = new Map([...pictures].map(([id, one]) => [id, one.stamp]))
  await ask()
  asked = Date.now()
  const changed = (id?: number): boolean => id === undefined || before.get(id) !== pictures.get(id)?.stamp
  for (const [win, one] of windows) if (one.up() && (all || changed(one.display))) void tell(win)
}

/**
 * A sticky (or a goal's beacon) frosted: told when it loads and is shown, and
 * where it is as it moves. `up` says whether it is on the desktop now; one
 * put away is not told anything until it is back.
 */
export function frostWindow(win: BrowserWindow, up: () => boolean): void {
  windows.set(win, { up })
  win.on('closed', () => windows.delete(win))
  win.webContents.on('did-finish-load', () => void tell(win))
  // Shown after a while away: the picture may have changed meanwhile.
  win.on('show', () => void (Date.now() - asked > 60_000 ? refresh() : tell(win)))
  // Where it is, as it moves; a full telling when it crosses to another screen.
  win.on('move', () => {
    const one = windows.get(win)
    if (!one || win.isDestroyed() || !frostOn()) return
    const bounds = win.getBounds()
    if (screen.getDisplayMatching(bounds).id !== one.display) return void tell(win)
    win.webContents.send('frost:at', { x: bounds.x, y: bounds.y })
  })
  if (!asked) void refresh()
}

/**
 * Asked by a sticky as it starts, kept fresh after: a cheap look once a
 * minute while any sticky is out, and at once when screens or Reduce
 * transparency change. Nothing at all while every sticky is put away.
 */
export function registerFrost(): void {
  ipcMain.handle('frost', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win && windows.has(win) ? frostOf(win) : null
  })
  setInterval(() => [...windows].some(([win, one]) => !win.isDestroyed() && one.up()) && void refresh(), 60_000)
  const screens = (): void => {
    for (const one of pictures.values()) delete one.image
    void refresh(true)
  }
  screen.on('display-added', screens)
  screen.on('display-removed', screens)
  screen.on('display-metrics-changed', screens)
  let clear = nativeTheme.prefersReducedTransparency
  nativeTheme.on('updated', () => {
    if (clear === nativeTheme.prefersReducedTransparency) return
    clear = nativeTheme.prefersReducedTransparency
    retellFrost()
  })
}
