// The main window really into the Mac's full screen and back out (the green
// button), then checked for a grey title bar strip: the page must fill the
// whole window again, the page must know it is out, and the app's own bar must
// sit where it did before, with the traffic lights on its line. The expanded
// view opened after it is checked the same way. This one does take a Space for
// a few seconds, and the window is shown on screen for it: a grey title bar is
// drawn by the Mac over the page, so only a picture of the real window shows it.
// The pictures are kept in QA_SHOTS (default: the run's QA_DATA folder).
// FS_MODE=close leaves by the red dot (out, put away, shown again); FS_MODE=quick
// toggles three times in a row, mid-animation; FS_SMALL=1 starts from a small window.
//   npx electron-vite build --outDir out-f
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 node qa/fullscreen-strip.mjs
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'

const { electron, h, errors, close } = await sandbox({ width: 1100, height: 760 })
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed++ }
const main = (fn, arg) => electron.evaluate(fn, arg)
const home = (fn) => main(({ BrowserWindow }, code) => {
  const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
  return new Function('win', `return (${code})(win)`)(win)
}, fn.toString())

const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
/**
 * A picture of the window as the Mac draws it, title bar and all, and how far
 * its top band (where the traffic lights sit) is from the page's own pixels
 * there: near 0 when the page shows through, large under a grey strip.
 */
const shoot = async (name) => {
  const id = (await home((win) => win.getMediaSourceId())).split(':')[1]
  const file = join(shots, `${name}.png`)
  execFileSync('screencapture', ['-x', '-o', '-l', id, file])
  const gap = await main(async ({ BrowserWindow, nativeImage }, file) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
    const { width } = win.getContentBounds()
    const band = { x: 120, y: 4, width: Math.min(400, width - 140), height: 20 }
    const real = nativeImage.createFromPath(file)
    const scale = real.getSize().width / width
    const a = real.crop({ x: band.x * scale, y: band.y * scale, width: band.width * scale, height: band.height * scale }).resize({ width: band.width, height: band.height }).toBitmap()
    const b = (await win.webContents.capturePage(band)).resize({ width: band.width, height: band.height }).toBitmap()
    let sum = 0
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i])
    return sum / (Math.min(a.length, b.length) * 0.75)
  }, file)
  console.log(`${name}: ${file} (top band differs from the page by ${gap.toFixed(1)} a channel)`)
  return gap
}

/** The window's frame, its page's room, and where the app's first bar sits. */
const measure = async () => ({
  ...(await home((win) => ({ frame: win.getBounds().height, content: win.getContentBounds().height, full: win.isFullScreen() }))),
  ...(await h.evaluate(() => {
    const bar = [...document.querySelectorAll('[data-drag-strip]')].find((one) => one.offsetParent && one.getBoundingClientRect().height > 0)
    return { inner: window.innerHeight, flag: document.documentElement.hasAttribute('data-fullscreen'), barTop: bar?.getBoundingClientRect().top ?? -1, barHeight: bar?.getBoundingClientRect().height ?? -1 }
  }))
})
/** Said once the window has gone in or out: the Mac's own animation takes a moment. */
const heard = async (event) => {
  for (let i = 0; i < 40; i++) {
    if (await main(() => globalThis.fsHeard).then((all) => all.includes(event))) return true
    await h.waitForTimeout(250)
  }
  return false
}

try {
  // As it opens at first, filling the screen's work area, or (FS_SMALL=1) a smaller window.
  await main(({ screen }, small) => void (globalThis.fsPlace = small ? { x: 60, y: 60, width: 1100, height: 760 } : screen.getPrimaryDisplay().workArea), Boolean(process.env.FS_SMALL))
  // Out on the screen for real, seen and unprotected, so the Mac draws its title bar and a picture can show it.
  await home((win) => {
    const base = Object.getPrototypeOf(Object.getPrototypeOf(win))
    base.setOpacity.call(win, 1)
    base.setBounds.call(win, globalThis.fsPlace)
    win.setIgnoreMouseEvents(false)
    win.setContentProtection(false)
    base.focus.call(win)
  })
  await h.waitForTimeout(1500)
  const before = await measure()
  console.log('before', JSON.stringify(before))
  check(before.content === before.frame, `before: the page fills the whole window, no title bar (${before.content} of ${before.frame})`)
  check(await shoot('1-before') < 8, 'before: the page shows through behind the traffic lights')

  await home((win) => { globalThis.fsHeard = []; for (const one of ['enter-full-screen', 'leave-full-screen']) win.on(one, () => globalThis.fsHeard.push(one)) })
  await home((win) => win.setFullScreen(true))
  check(await heard('enter-full-screen'), 'the window goes into full screen')
  await h.waitForTimeout(800)
  const during = await measure()
  console.log('during', JSON.stringify(during))
  check(during.flag, 'the page knows it is full screen')

  // Out as a person would: the green button again, or the red dot (out, then put away, then back).
  if (process.env.FS_MODE === 'close') await home((win) => win.close())
  else if (process.env.FS_MODE === 'quick') await home((win) => (win.setFullScreen(false), win.setFullScreen(true), win.setFullScreen(false)))
  else await home((win) => win.setFullScreen(false))
  check(await heard('leave-full-screen'), 'the window comes out of full screen')
  if (process.env.FS_MODE === 'close') {
    await h.waitForTimeout(1500)
    await home((win) => { const base = Object.getPrototypeOf(Object.getPrototypeOf(win)); base.show.call(win); base.setBounds.call(win, globalThis.fsPlace); base.focus.call(win) })
  }
  await h.waitForTimeout(1200)
  const after = await measure()
  console.log('after', JSON.stringify(after))
  check(!after.full, 'out of full screen')
  check(!after.flag, 'the page knows it is out (no data-fullscreen left on)')
  check(after.content === after.frame, `after: the page fills the whole window again, no title bar band (${after.content} of ${after.frame})`)
  check(after.inner === after.content, `after: the page is as tall as the window's room (${after.inner} of ${after.content})`)
  check(await shoot('2-after') < 8, 'after: the page shows through behind the traffic lights, no grey strip')
  check(after.barTop === before.barTop && after.barHeight === before.barHeight, `after: the app's bar sits where it did (${after.barTop}+${after.barHeight}, was ${before.barTop}+${before.barHeight})`)

  // The expanded view, opened after the trip.
  const note = (await h.evaluate(() => window.api.captures.list())).find((one) => one.status === 'open')
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:expand', { detail: id })), note.id)
  await h.waitForTimeout(1500)
  const sheet = await h.evaluate(() => {
    const box = document.querySelector('[data-expanded-note]')?.getBoundingClientRect()
    return box ? { top: box.top, height: box.height, inner: window.innerHeight } : null
  })
  const frame = await home((win) => ({ frame: win.getBounds().height, content: win.getContentBounds().height }))
  console.log('expanded', JSON.stringify(sheet), JSON.stringify(frame))
  check(await shoot('3-expanded') < 8, 'the expanded view shows through behind the traffic lights, no grey strip')
  check(sheet && sheet.top === 0 && sheet.height === frame.frame && frame.content === frame.frame, `the expanded view fills the whole window from its top (${JSON.stringify(sheet)})`)
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
} finally {
  await home((win) => win.isFullScreen() && win.setFullScreen(false)).catch(() => {})
  await close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
