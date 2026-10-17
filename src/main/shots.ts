import { execFile } from 'child_process'
import { readFile, rm } from 'fs/promises'
import { join } from 'path'
import { app, BrowserWindow, desktopCapturer, nativeImage, screen, shell, systemPreferences, type Display } from 'electron'

/**
 * Pictures Vigil takes for you: a screenshot of a screen without any of
 * Vigil's own windows in it, and the camera for a selfie in a session's log.
 * Both need a macOS permission, asked for the way macOS expects; refused,
 * the window says so in plain words and offers the Privacy settings.
 *
 * For test runs, which have no camera or screen to look at:
 * MINDFLOW_QA_FAKE_SCREEN=1 answers with a made-up picture of a desktop, and
 * MINDFLOW_QA_FAKE_CAMERA=1 hands the windows Chromium's own pretend camera.
 * Either set to "denied" answers as a refused permission does.
 */

const FAKE_SCREEN = process.env.MINDFLOW_QA_FAKE_SCREEN
const FAKE_CAMERA = process.env.MINDFLOW_QA_FAKE_CAMERA
// Chromium's pretend camera, with no "allow" question: set before the app is ready.
if (FAKE_CAMERA && FAKE_CAMERA !== 'denied') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

export type ScreenShot = { png: Buffer; app: string } | { denied: true; asked: boolean }

const screenAllowed = (): string => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted')

/** A made-up desktop for test runs: a soft gradient with two windows on it. */
function fakeDesktop(width: number, height: number): Electron.NativeImage {
  const bytes = Buffer.alloc(width * height * 4)
  const windows = [
    { x: 0.08, y: 0.12, w: 0.5, h: 0.6, c: [250, 250, 248] },
    { x: 0.5, y: 0.3, w: 0.42, h: 0.5, c: [40, 44, 52] }
  ]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      const [u, v] = [x / width, y / height]
      const inside = [...windows].reverse().find((one) => u >= one.x && u < one.x + one.w && v >= one.y && v < one.y + one.h)
      const bar = inside && v < inside.y + 0.04
      const [r, g, b] = inside ? (bar ? [220, 220, 224] : inside.c) : [Math.round(90 + 80 * u), Math.round(120 + 60 * v), Math.round(200 - 40 * u)]
      // BGRA, as the system keeps a bitmap.
      bytes[at] = b
      bytes[at + 1] = g
      bytes[at + 2] = r
      bytes[at + 3] = 255
    }
  return nativeImage.createFromBitmap(bytes, { width, height })
}

/**
 * The app whose window is frontmost on that screen, Vigil's own left out: from
 * the window list, which says whose each window is without needing Screen
 * Recording. Empty when it cannot be told.
 */
function frontApp(display: Display): Promise<string> {
  if (FAKE_SCREEN) return Promise.resolve(process.env.MINDFLOW_QA_FAKE_APP ?? 'Safari')
  if (process.platform !== 'darwin') return Promise.resolve('')
  const { x, y, width, height } = display.bounds
  const script = `ObjC.import('CoreGraphics'); ObjC.import('Foundation')
function run(argv) {
  const [skip, x, y, w, h] = argv.map(Number)
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID))) || []
  const one = list.find((win) => { const b = win.kCGWindowBounds; return win.kCGWindowLayer === 0 && win.kCGWindowOwnerPID !== skip && win.kCGWindowAlpha > 0 && b.Width > 80 && b.Height > 80 && b.X < x + w && b.X + b.Width > x && b.Y < y + h && b.Y + b.Height > y })
  return one ? one.kCGWindowOwnerName : ''
}`
  return new Promise((done) =>
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, String(process.pid), String(x), String(y), String(width), String(height)], { timeout: 3000 }, (error, out) => done(error ? '' : out.trim().slice(0, 60)))
  )
}

/**
 * The screen `display` as it is, with every one of Vigil's windows out of it:
 * each is made see-through for the moment the picture is taken, then back.
 * Never wider than 2880 pixels, plenty to read and not a huge file.
 */
export async function shootScreen(display: Display, protectedWin?: BrowserWindow | null): Promise<ScreenShot> {
  if (FAKE_SCREEN === 'denied') return { denied: true, asked: false }
  const before = screenAllowed()
  if (before === 'denied' || before === 'restricted') return { denied: true, asked: false }
  const named = frontApp(display)
  const shown = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed() && win.isVisible() && win.getOpacity() > 0 && win !== protectedWin)
  const opacity = new Map(shown.map((win) => [win, win.getOpacity()]))
  for (const win of shown) win.setOpacity(0)
  try {
    // A frame or two for the screen to draw without them.
    await new Promise((done) => setTimeout(done, 80))
    const scale = Math.min(1, 2880 / (display.size.width * display.scaleFactor))
    const size = { width: Math.round(display.size.width * display.scaleFactor * scale), height: Math.round(display.size.height * display.scaleFactor * scale) }
    if (FAKE_SCREEN) return { png: fakeDesktop(Math.round(size.width / 4), Math.round(size.height / 4)).toPNG(), app: await named }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
    // Without the permission macOS still answers, with the wallpaper alone.
    // The first time, it has just asked: say so, rather than "refused".
    if (screenAllowed() !== 'granted') return { denied: true, asked: before === 'not-determined' }
    const source = sources.find((one) => one.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) return { denied: true, asked: false }
    return { png: source.thumbnail.toPNG(), app: await named }
  } catch {
    return { denied: true, asked: false }
  } finally {
    for (const [win, was] of opacity) if (!win.isDestroyed()) win.setOpacity(was)
  }
}

/**
 * Kept out of the picture: the box made invisible to screen capture for the
 * while `run` takes, then as it was. It stays on screen for you all along.
 */
export async function unseen<T>(win: BrowserWindow | null, run: () => Promise<T>): Promise<T> {
  const live = win && !win.isDestroyed() ? win : null
  const was = live?.isContentProtected() ?? false
  live?.setContentProtection(true)
  try {
    return await run()
  } finally {
    if (live && !live.isDestroyed()) live.setContentProtection(was)
  }
}

/** Under 300ms, quick away and settling softly: an ease-out of its own. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 4)
const REDUCED = (): boolean => process.platform === 'darwin' && (() => { try { return systemPreferences.getAnimationSettings().prefersReducedMotion } catch { return false } })()
const tween = (ms: number, step: (k: number) => void): Promise<void> =>
  new Promise((done) => {
    const start = Date.now()
    const tick = (): void => {
      const t = Math.min(1, (Date.now() - start) / ms)
      step(easeOut(t))
      if (t < 1) setTimeout(tick, 1000 / 60)
      else done()
    }
    tick()
  })

/**
 * While you drag out an area, the box tucks into the nearest edge of its
 * screen as a small tab, out of what you want, and comes back when you are
 * done or press Esc. Moved, never focused or shown, so the crosshair keeps
 * the keys. With Reduce motion it fades to almost nothing instead.
 * Returns how to bring it back.
 */
export async function tuckAway(win: BrowserWindow | null): Promise<() => Promise<void>> {
  if (!win || win.isDestroyed() || !win.isVisible()) return async () => {}
  const from = win.getBounds()
  const opacity = win.getOpacity()
  if (REDUCED()) {
    await tween(160, (k) => !win.isDestroyed() && win.setOpacity(opacity + (0.15 - opacity) * k))
    return () => tween(160, (k) => void (!win.isDestroyed() && win.setOpacity(0.15 + (opacity - 0.15) * k)))
  }
  const area = screen.getDisplayMatching(from).workArea
  const TAB = 24
  const gaps = { left: from.x - area.x, right: area.x + area.width - (from.x + from.width), top: from.y - area.y, bottom: area.y + area.height - (from.y + from.height) }
  const edge = (Object.keys(gaps) as (keyof typeof gaps)[]).sort((m, n) => gaps[m] - gaps[n])[0]
  const to = { ...from }
  if (edge === 'left') to.x = area.x - from.width + TAB
  if (edge === 'right') to.x = area.x + area.width - TAB
  if (edge === 'top') to.y = area.y - from.height + TAB
  if (edge === 'bottom') to.y = area.y + area.height - TAB
  const move = (a: typeof from, b: typeof from) => (k: number): void => {
    if (!win.isDestroyed()) win.setPosition(Math.round(a.x + (b.x - a.x) * k), Math.round(a.y + (b.y - a.y) * k))
  }
  tucked = edge
  ;(globalThis as { vigilTucked?: string | null }).vigilTucked = edge
  await tween(240, move(from, to))
  return async () => {
    await tween(240, move(to, from))
    tucked = null
    ;(globalThis as { vigilTucked?: string | null }).vigilTucked = null
  }
}
/** The edge the box is tucked into just now, for tests to read. */
export let tucked: string | null = null

/**
 * Just an area: the Mac's own crosshair (screencapture -i) over every screen,
 * with the box tucked away and kept out of the picture. Esc there is no
 * picture and no complaint. MINDFLOW_QA_FAKE_SCREEN stands in for the real
 * tool (it waits MINDFLOW_QA_FAKE_AREA_MS, or 400ms), so tests never start it.
 */
export async function shootArea(box: BrowserWindow | null): Promise<ScreenShot | { cancelled: true }> {
  if (FAKE_SCREEN === 'denied') return { denied: true, asked: false }
  if (!FAKE_SCREEN) {
    const before = screenAllowed()
    if (before === 'denied' || before === 'restricted') return { denied: true, asked: false }
  }
  return unseen(box, async () => {
    const back = await tuckAway(box)
    const file = join(app.getPath('temp'), `vigil-area-${process.pid}-${Date.now()}.png`)
    try {
      if (FAKE_SCREEN) {
        await new Promise((done) => setTimeout(done, Number(process.env.MINDFLOW_QA_FAKE_AREA_MS ?? 400)))
        return process.env.MINDFLOW_QA_FAKE_AREA === 'cancel' ? { cancelled: true as const } : { png: fakeDesktop(320, 200).toPNG(), app: '' }
      }
      await new Promise<void>((done) => execFile('/usr/sbin/screencapture', ['-i', '-x', file], () => done()))
      const png = await readFile(file).catch(() => null)
      return png && png.length ? { png, app: '' } : { cancelled: true as const }
    } finally {
      void rm(file, { force: true })
      await back()
    }
  })
}

/** The screen a window is on. */
export const displayOf = (win: BrowserWindow | null): Display => (win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay())

/** The camera, asked for once the way macOS asks; 'granted' or 'denied'. */
export async function cameraAccess(): Promise<'granted' | 'denied'> {
  if (FAKE_CAMERA) return FAKE_CAMERA === 'denied' ? 'denied' : 'granted'
  if (process.platform !== 'darwin') return 'granted'
  const now = systemPreferences.getMediaAccessStatus('camera')
  if (now === 'granted') return 'granted'
  if (now !== 'not-determined') return 'denied'
  return (await systemPreferences.askForMediaAccess('camera').catch(() => false)) ? 'granted' : 'denied'
}

/** macOS's Privacy settings, at the camera's page or the screen's. */
export const privacySettings = (what: 'camera' | 'screen'): Promise<void> =>
  shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?Privacy_${what === 'camera' ? 'Camera' : 'ScreenCapture'}`)
