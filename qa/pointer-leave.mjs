// Cards and the timer pill hear the pointer leave from their own pages, never by asking the Mac where it is.
// (A card opened out of its pill at the screen's edge is checked in qa/desk-pills.mjs; the tucked tabs are retired.)
// A glass card rises when pointed at, never from its foot, and sets
// down when the pointer leaves, even mid-rise, and not while its menu is open. The pill, held open (Stop asked), folds
// once the pointer has gone from its window, stays open with the pointer on its tip, and not while its menu is open.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pointer-leave.mjs [lift|pill]
// One part each run keeps a run to a few minutes on a busy Mac; with none, both.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const parts = process.argv[2] ? [process.argv[2]] : ['lift', 'pill']
// Never hangs silently: past eight minutes it says what it got and stops.
setTimeout(async () => {
  console.log('pointer-leave: out of time')
  await Promise.race([c.close().catch(() => {}), wait(15_000)])
  done()
}, 8 * 60_000).unref()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h } = c
const v = (channel, ...args) => h.evaluate(([one, rest]) => window.api.haligtree(one, ...rest), [channel, args])
const bounds = (id) => electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).getBounds(), id)
const menuOpen = async () => !!(await electron.evaluate(() => globalThis.qaPopupMenu?.open))
const menuPage = () => electron.windows().find((p) => p.url().includes('view=menu'))
const OUT = [-40, -40]
/** Waits up to `ms` for `test` to be true, reading every 50ms; false if it never is. */
const until = async (test, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(50)) if (await test()) return true
  return test()
}
/** True if `test` stays true for all of `ms`. */
const stays = async (test, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (!(await test())) return false
  return true
}

try {
  await wait(2500)
  // --- Tucked into a tab: retired with the tabs (K2a). What it held of a card opened from the edge (out on a rest, out
  // while pointed at, back when the pointer goes, even before it came out, out again when caught midway, and out while
  // its own menu is open) is checked on the pills in qa/desk-pills.mjs.
  // --- Glass, not tucked: pointed at, the window rises; the pointer gone, it sets down.
  if (parts.includes('lift')) {
    await v('settings:set', { stickiesFrosted: true, stickiesGlass: true })
    await wait(4000)
    const glass = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible() && /view=sticky.*glass/.test(w.webContents.getURL()))?.id)
    const gurl = glass && await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).webContents.getURL(), glass)
    const gpage = electron.windows().find((p) => p.url() === gurl)
    if (!glass || !gpage) check('glass: a glass card is out', false)
    else {
      await gpage.mouse.move(...OUT)
      await wait(600)
      const rest = (await bounds(glass)).y
      const y = async () => (await bounds(glass)).y
      const [gw, gh] = await gpage.evaluate(() => [innerWidth, innerHeight])
      await gpage.mouse.move(gw / 2, gh / 2)
      check('glass: pointed at, it rises 6 points', await until(async () => (await y()) === rest - 6, 800), `${rest} then ${await y()}`)
      check('glass: and stays up while the pointer is on it', await stays(async () => (await y()) === rest - 6, 1200))
      await gpage.mouse.move(...OUT)
      check('glass: the pointer gone, it sets down where it was', await until(async () => (await y()) === rest, 1000), `${rest} now ${await y()}`)
      // From its foot: the last few points never lift it (risen, the pointer would be left below it).
      await wait(300)
      await gpage.mouse.move(gw / 2, gh - 2)
      const seen = []
      check('glass: pointed at on its very foot, it does not rise', await stays(async () => (seen.push(await y()), seen.at(-1) === rest), 800), `${rest}: ${seen.join(' ')} in a ${gh}-point window`)
      await gpage.mouse.move(gw / 2, gh / 2)
      check('glass: moved up from its foot, it rises', await until(async () => (await y()) === rest - 6, 800))
      await gpage.mouse.move(...OUT)
      check('glass: and sets down when the pointer goes', await until(async () => (await y()) === rest, 1000))
      // In and straight out again, mid-rise: it finishes rising, then sets down.
      await wait(300)
      await gpage.mouse.move(gw / 2, gh / 2)
      await wait(40)
      await gpage.mouse.move(...OUT)
      check('glass: left mid-rise, it still ends set down', await until(async () => (await y()) === rest, 1500), `${rest} now ${await y()}`)
      // Its menu open: it stays up while the pointer is on the menu; put away, it sets down.
      await wait(300)
      await gpage.mouse.move(gw / 2, gh / 2)
      await until(async () => (await y()) === rest - 6, 800)
      await gpage.mouse.click(gw / 2, gh / 2, { button: 'right' })
      check('glass: its menu opens', await until(menuOpen, 2000))
      await gpage.mouse.move(...OUT)
      check('glass: the pointer on its menu, it stays up', await stays(async () => (await y()) === rest - 6, 1500))
      await menuPage()?.keyboard.press('Escape')
      check('glass: the menu put away, the pointer gone, it sets down', await until(async () => (await y()) === rest, 1500), `${rest} now ${await y()}`)
      // Held by its grabber while risen: it follows the pointer exactly, never set down or lifted under the hand.
      await gpage.mouse.move(gw / 2, gh / 2)
      await until(async () => (await y()) === rest - 6, 800)
      const grip = await gpage.evaluate(() => { const r = document.querySelector('[data-grabber]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 8 } })
      await gpage.mouse.move(grip.x, grip.y)
      await wait(300)
      const before = await bounds(glass)
      await gpage.mouse.down()
      await wait(80)
      await gpage.mouse.move(grip.x + 40, grip.y + 30)
      await wait(300)
      const after = await bounds(glass)
      await gpage.mouse.up()
      check('glass: held by its grabber while risen, it follows the pointer exactly', after.x - before.x === 40 && after.y - before.y === 30, `${after.x - before.x},${after.y - before.y}`)
      check('glass: let go, it settles the 6 points down onto its place', await until(async () => (await y()) === after.y + 6, 1500), `${after.y} then ${await y()}`)
    }
  }

  // --- The pill: held open, it folds once the pointer has gone from its window.
  if (parts.includes('pill')) {
    await v('session:start', '', 'Pointer probe', 25 * 60_000)
    await h.evaluate(() => window.api.showFocus(true))
    let pill = null
    for (let i = 0; i < 40 && !pill; i++) (pill = electron.windows().find((p) => p.url().includes('view=focus'))), await wait(250)
    if (!pill) check('pill: the pill is out', false)
    else {
      await pill.waitForLoadState('domcontentloaded')
      await wait(3500)
      const island = () => pill.$eval('[data-island]', (one) => one.getAttribute('data-island')).catch(() => null)
      const holdOpen = async () => {
        await pill.hover('[data-island]')
        await until(async () => (await island()) === 'open', 1500)
        await pill.click('[data-island-panel] button:has-text("Stop")')
        await until(async () => !!(await pill.$('[data-stop-ask]')), 1000)
      }
      await holdOpen()
      check('pill: Stop asks, and holds it open', !!(await pill.$('[data-stop-ask]')) && (await island()) === 'open')
      // On a tip of its own (drawn in its window): it stays open.
      const tipped = await pill.$('[data-island] [data-take-selfie]') ?? await pill.$('[data-island] button[aria-label]')
      if (tipped) {
        await tipped.hover()
        const tip = await until(async () => !!(await pill.$('[role=tooltip]')), 1500)
        const box = tip && await pill.locator('[role=tooltip]').first().boundingBox()
        if (box) await pill.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      }
      check('pill: with the pointer on it and its tips, it stays open', await stays(async () => (await island()) === 'open', 2500))
      await pill.mouse.move(...OUT)
      check('pill: the pointer gone from its window, it folds', await until(async () => (await island()) === 'rest', 2500), await island())
      // Its right-click menu (the Mac's, faked here as one open for a second and a half): open, the pointer on it holds it.
      await pill.mouse.move(...OUT)
      await wait(600)
      await holdOpen()
      await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('focus:menu'); ipcMain.handle('focus:menu', () => new Promise((r) => setTimeout(() => r(null), 1500))) })
      await pill.click('[data-island]', { button: 'right', position: { x: 20, y: 12 } })
      await pill.mouse.move(...OUT)
      check('pill: its menu open, the pointer on the menu, it stays open', await stays(async () => (await island()) === 'open', 1300))
      check('pill: the menu put away and the pointer not back, it folds', await until(async () => (await island()) === 'rest', 3000), await island())
    }
  }
} finally {
  await c.close()
}
done()
