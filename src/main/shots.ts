import { execFile } from 'child_process'
import { readFile, rm } from 'fs/promises'
import { join } from 'path'
import { app, BrowserWindow, desktopCapturer, nativeImage, screen, shell, systemPreferences, type Display } from 'electron'
import { MOST_SHOWN, shownOf, tuckPlaces } from './tuck-place'
import { glide } from './glide'
import { outQuart, tween } from './sticky-place'

/**
 * Pictures Haligtree takes for you: a screenshot of a screen without any of
 * Haligtree's own windows in it, and the camera for a selfie in a session's log.
 * Both need a macOS permission, asked for the way macOS expects; refused,
 * the window says so in plain words and offers the Privacy settings.
 *
 * For test runs, which have no camera or screen to look at:
 * HALIGTREE_QA_FAKE_SCREEN=1 answers with a made-up picture of a desktop, and
 * HALIGTREE_QA_FAKE_CAMERA=1 hands the windows Chromium's own pretend camera.
 * Either set to "denied" answers as a refused permission does.
 */

const FAKE_SCREEN = process.env.HALIGTREE_QA_FAKE_SCREEN
const FAKE_CAMERA = process.env.HALIGTREE_QA_FAKE_CAMERA
// Chromium's pretend camera, with no "allow" question: set before the app is ready.
if (FAKE_CAMERA && FAKE_CAMERA !== 'denied') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

/** Refused: `asked` when macOS has just asked; `restart` when allowed since Haligtree started, so usable once it starts again. */
export type ScreenShot = { png: Buffer; app: string } | { denied: true; asked: boolean; restart?: boolean }

const screenAllowed = (): string => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted')

/**
 * Screen Recording as it was when Haligtree started. macOS lets a running app use
 * the permission only once it has started again, so a switch turned on since
 * reads as granted while the screen still cannot be seen.
 */
let startedWith: string | null = null
export const noteScreenAtStart = (): void => void (startedWith ??= screenAllowed())
/**
 * Whether Haligtree can see the screen, asked again each time (a window coming to
 * the front asks, so the notice follows System Settings): 'on'; 'restart',
 * allowed since Haligtree started and live once it starts again; or 'off', not
 * allowed, which is also how a switch left on for an older build of Haligtree reads.
 * HALIGTREE_QA_FAKE_SCREEN=restart stands in for the middle one.
 */
export function screenAccess(): 'on' | 'restart' | 'off' {
  // Read each time, so a test run can turn the switch while the app runs.
  const fake = process.env.HALIGTREE_QA_FAKE_SCREEN
  if (fake === 'denied') return 'off'
  if (fake === 'restart') return 'restart'
  const now = fake ? 'granted' : screenAllowed()
  if (now !== 'granted') return 'off'
  return startedWith && startedWith !== 'granted' ? 'restart' : 'on'
}

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
 * The app whose window is frontmost on that screen, Haligtree's own left out: from
 * the window list, which says whose each window is without needing Screen
 * Recording. Empty when it cannot be told.
 */
function frontApp(display: Display): Promise<string> {
  if (FAKE_SCREEN) return Promise.resolve(process.env.HALIGTREE_QA_FAKE_APP ?? 'Safari')
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
 * The screen `display` as it is, with every one of Haligtree's windows out of it:
 * each is made see-through for the moment the picture is taken, then back.
 * Never wider than 2880 pixels, plenty to read and not a huge file.
 */
export async function shootScreen(display: Display, protectedWin?: BrowserWindow | null): Promise<ScreenShot> {
  if (screenAccess() === 'off' && process.env.HALIGTREE_QA_FAKE_SCREEN) return { denied: true, asked: false }
  if (screenAccess() === 'restart') return { denied: true, asked: false, restart: true }
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

const REDUCED = (): boolean => process.platform === 'darwin' && (() => { try { return systemPreferences.getAnimationSettings().prefersReducedMotion } catch { return false } })()
/** A fade on the display's own frames (sticky-place.ts), easing out; with Reduce motion a fade still plays. */
const fade = (win: BrowserWindow, from: number, to: number): Promise<void> =>
  new Promise((done) => void tween(160, (t) => void (!win.isDestroyed() && win.setOpacity(from + (to - from) * outQuart(t))), done))

type Box = Electron.Rectangle
const say = (line: string): void => void (!app.isPackaged && console.log(`[haligtree] area pick: ${line}`))
const at = (b: Box): string => `${b.x},${b.y} ${b.width}x${b.height}`

/**
 * While you drag out an area, the box tucks into the nearest free edge of its
 * screen as a small tab (tuck-place.ts: left, right or bottom, never the top),
 * out of what you want, and comes back when you are done or press Esc. It is
 * moved before the crosshair comes up, never focused or shown. If more than a
 * sliver of it is still in view at any look (once it lands, a move or resize
 * while you pick, just before the crosshair and 100ms into it), whatever kept
 * it there (no free edge, the Mac holding it, something putting it back), it
 * goes see-through and lets clicks pass instead, so it is never in the way,
 * and comes back the same way. With Reduce motion it fades instead of moving.
 * `look` checks it again; `back` brings it back. Target, actual and how much
 * is in view go to the terminal in dev.
 */
export async function tuckAway(win: BrowserWindow | null): Promise<{ look: (when: string) => void; back: () => Promise<void> }> {
  if (!win || win.isDestroyed() || !win.isVisible()) return { look: () => {}, back: async () => {} }
  const from = win.getBounds()
  const opacity = win.getOpacity()
  const mark = (edge: string | null): void => void ((tucked = edge), ((globalThis as { haligtreeTucked?: string | null }).haligtreeTucked = edge), (tuckedWindow = edge ? win : null))
  let hidden = false
  const hide = (why: string): void => {
    if (hidden || win.isDestroyed()) return
    hidden = true
    win.setOpacity(0)
    win.setIgnoreMouseEvents(true)
    say(`box hidden instead (${why})`)
  }
  if (REDUCED()) {
    mark('faded')
    await fade(win, opacity, 0.15)
    say(`box faded (Reduce motion), stays at ${at(from)}`)
    return {
      look: () => {},
      back: async () => {
        await fade(win, 0.15, opacity)
        mark(null)
      }
    }
  }
  const screens = screen.getAllDisplays()
  const place = tuckPlaces(from, screens)[0]
  const to = place?.to ?? from
  mark(place?.edge ?? 'hidden')
  say(`box at ${at(from)}, target ${place ? `${place.edge} edge ${at(to)}` : 'none (another screen against every edge)'}`)
  // Where it really is, and how much of it shows: more than a sliver and it is in the way.
  const look = (when: string): void => {
    if (win.isDestroyed() || hidden) return
    const now = win.getBounds()
    const shown = shownOf(now, place?.edge ?? null, screen.getAllDisplays())
    say(`${when}: target ${to.x},${to.y}, actual ${now.x},${now.y} ${now.width}x${now.height}, ${shown}px in view`)
    if (shown > MOST_SHOWN) hide(`${shown}px still in view ${when}`)
  }
  if (place) {
    await glide(win, { x: to.x, y: to.y }, { ms: 240 })
    look(`tucked ${place.edge}`)
  } else hide('no free edge')
  // Put back or grown by anything while you pick (a resize, the system): out of the way all the same.
  const watch = (): void => look('moved while picking')
  win.on('move', watch)
  win.on('resize', watch)
  return {
    look,
    back: async () => {
      win.off('move', watch)
      win.off('resize', watch)
      if (win.isDestroyed()) return mark(null)
      if (hidden) win.setBounds(from, false)
      else await glide(win, { x: from.x, y: from.y }, { ms: 240 })
      if (hidden && !win.isDestroyed()) (win.setIgnoreMouseEvents(false), win.setOpacity(opacity))
      if (!win.isDestroyed()) say(`done, box back at ${at(win.getBounds())}`)
      mark(null)
    }
  }
}
/** The edge the box is tucked into just now ('hidden' or 'faded' when it could not move), for tests to read. */
export let tucked: string | null = null
/** The window tucked away just now: nothing else moves or resizes it until it is back (index.ts, refit). */
export let tuckedWindow: BrowserWindow | null = null

/**
 * Just an area: the Mac's own crosshair (screencapture -i) over every screen,
 * with the box tucked away and kept out of the picture. Esc there is no
 * picture and no complaint. HALIGTREE_QA_FAKE_SCREEN stands in for the real
 * tool (it waits HALIGTREE_QA_FAKE_AREA_MS, or 400ms), so tests never start it.
 */
export async function shootArea(box: BrowserWindow | null): Promise<ScreenShot | { cancelled: true }> {
  if (screenAccess() === 'off' && process.env.HALIGTREE_QA_FAKE_SCREEN) return { denied: true, asked: false }
  if (screenAccess() === 'restart') return { denied: true, asked: false, restart: true }
  if (!FAKE_SCREEN) {
    const before = screenAllowed()
    if (before === 'denied' || before === 'restricted') return { denied: true, asked: false }
  }
  return unseen(box, async () => {
    const { look, back } = await tuckAway(box)
    const file = join(app.getPath('temp'), `haligtree-area-${process.pid}-${Date.now()}.png`)
    // Looked at again just before the crosshair comes up, and once it is up.
    look('before the crosshair')
    const soon = setTimeout(() => look('100ms into the pick'), 100)
    try {
      if (FAKE_SCREEN) {
        await new Promise((done) => setTimeout(done, Number(process.env.HALIGTREE_QA_FAKE_AREA_MS ?? 400)))
        return process.env.HALIGTREE_QA_FAKE_AREA === 'cancel' ? { cancelled: true as const } : { png: fakeDesktop(320, 200).toPNG(), app: '' }
      }
      await new Promise<void>((done) => execFile('/usr/sbin/screencapture', ['-i', '-x', file], () => done()))
      const png = await readFile(file).catch(() => null)
      return png && png.length ? { png, app: '' } : { cancelled: true as const }
    } finally {
      clearTimeout(soon)
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
