// An everyday user puts quick capture near the top of the screen (thrown up with ⌃⌥↑, carried up by its grabber,
// left there by an older build) and grows it into the box: every round control above the card ("2 favorites ›", the
// pencil, the gear, the side panel) is wholly inside the window and the screen's work area, never cut off by the menu
// bar (the user, 22 Nov: only their feet showed at the top right), and the card does not jump as it grows. The row's
// top is the window's own top: no clear room above it to go under the menu bar first.
// Then the hint above the box ("Still in your Inbox"): opened again and again, it is there from the box's first frame
// or not at all, never drawn for a frame and then taken away (the user, 22 Nov: "I saw that card flash away").
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/box-top-controls.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Each window keeps the place it is given as its own while parked off screen, so the box can be moved.
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const shot = async (name) => process.env.QA_SHOTS && page.screenshot({ path: join(process.env.QA_SHOTS, `box-top-controls-${name}.png`) })
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const box = () => electron.evaluate(({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /\/index\.html(\?|$)/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('view='))
  globalThis.qaBox = win
  const card = win.getBounds()
  // The window's own frame, as the app placed it (parked off screen in a test run, it keeps that place as its own).
  return { card, frame: BrowserWindow.prototype.getBounds.call(win), zoom: win.webContents.getZoomFactor() || 1, area: screen.getDisplayMatching(card).workArea }
})
/** Every round control drawn above or beside the card, in screen points, and whether each is wholly in the window and the work area. */
const controls = async () => {
  const at = await box()
  const rects = await page.evaluate(() => [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')]
    .map((one) => one.getBoundingClientRect()).filter((r) => r.width > 0)
    .map((r) => ({ top: r.top, left: r.left, bottom: r.bottom, right: r.right, vw: innerWidth, vh: innerHeight })))
  const out = rects.filter((r) => {
    const top = at.frame.y + r.top * at.zoom
    const bottom = at.frame.y + r.bottom * at.zoom
    const left = at.frame.x + r.left * at.zoom
    const right = at.frame.x + r.right * at.zoom
    const inWindow = r.top >= 0 && r.left >= 0 && r.bottom <= r.vh && r.right <= r.vw
    const inArea = top >= at.area.y && bottom <= at.area.y + at.area.height && left >= at.area.x && right <= at.area.x + at.area.width
    return !(inWindow && inArea)
  })
  const rowTop = Math.min(...rects.map((r) => r.top * at.zoom))
  return { count: rects.length, out: out.length, cardTop: at.card.y - at.area.y, rowFromWindowTop: Math.round(rowTop), rowFromAreaTop: Math.round(at.frame.y + rowTop - at.area.y) }
}
/** The card's top read every 50 ms for a while: the most it moved in one step. */
const steps = async (ms) => {
  const ys = []
  for (let t = 0; t < ms; t += 50) { ys.push((await box()).card.y); await wait(50) }
  return { most: Math.max(0, ...ys.slice(1).map((y, i) => Math.abs(y - ys[i]))), ys }
}
const open = async () => { await page.evaluate(() => window.api.showPrompt()); await wait(1300) }
const close = async () => { await page.evaluate(() => window.api.hidePrompt()); await wait(500) }
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  await close()

  // Thrown up with ⌃⌥↑: it lands flush with the top, its controls' row under the menu bar, not behind it.
  await open()
  await page.click(EDITOR)
  await page.keyboard.press('Control+Alt+ArrowUp')
  await wait(900)
  let seen = await controls()
  await shot('thrown')
  // Still up after the move, the window keeps the room it opened with above the row (where the box with its panel,
  // ⌃⇧F, would grow up from the screen's foot where it opened): nothing is drawn there, and it is made again for the
  // new place as the box next opens (main's roomForHint, while the box is away, so the card never jumps a frame).
  check('the box thrown to the top: all its round controls are inside the window and on the screen', seen.count >= 3 && seen.out === 0, JSON.stringify(seen))
  await close()
  await open()
  seen = await controls()
  check('…opened again there: the row is the window\'s top, every control on the screen', seen.count >= 3 && seen.out === 0 && seen.rowFromWindowTop <= 2, JSON.stringify(seen))

  // Carried up by its grabber, far past the top: it stops with its controls on the screen, and stays there let go.
  const g = await page.evaluate(() => { const r = document.querySelector('[data-grabber]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await electron.evaluate(() => { const b = globalThis.qaBox.getBounds(); globalThis.qaBox.setPosition(b.x, b.y + 300) })
  await wait(300)
  await page.mouse.move(g.x, g.y)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) { await page.mouse.move(g.x, g.y - i * 20); await wait(30) }
  await page.mouse.up()
  await wait(700)
  seen = await controls()
  await shot('carried')
  check('carried up past the top by its grabber: it stops with every control on the screen', seen.count >= 3 && seen.out === 0, JSON.stringify(seen))
  await close()
  await open()
  seen = await controls()
  check('…opened again there: the row is the window\'s top, every control on the screen', seen.count >= 3 && seen.out === 0 && seen.rowFromWindowTop <= 2, JSON.stringify(seen))

  // Left near the top by an older build (the place it opens at is the last one): it opens already clear of the menu bar.
  await electron.evaluate(({ screen }) => { const b = globalThis.qaBox.getBounds(); globalThis.qaBox.setPosition(b.x, screen.getDisplayMatching(b).workArea.y + 4) })
  await close()
  await open()
  seen = await controls()
  check('left 4 points under the menu bar and opened again: it opens with every control on the screen', seen.count >= 3 && seen.out === 0 && seen.rowFromWindowTop <= 2 && seen.cardTop >= 40, JSON.stringify(seen))
  await close()

  // "One line to start": the pill thrown to the top, then a second line grows it into the box where it is.
  await v('settings:set', { boxOneLine: true })
  await open()
  await page.click(EDITOR)
  await page.keyboard.press('Control+Alt+ArrowUp')
  await wait(900)
  const before = (await box()).card.y
  await shot('pill-top')
  await page.keyboard.type('need')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('From Dia: where you met it')
  const grow = await steps(800)
  seen = await controls()
  await shot('pill-grown')
  check('the pill at the top grown into the box: its card stays where it was put, never a jump', grow.ys.every((y) => y === before), JSON.stringify({ before, ys: grow.ys }))
  check('…and every round control above the grown box is inside the window and on the screen, the row at the window\'s top', seen.count >= 3 && seen.out === 0 && seen.rowFromWindowTop <= 2, JSON.stringify(seen))
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await close()

  // The hint card above the box, every open: in the first frame drawn after the box shows exactly when it is there at
  // 400 ms (a card that leaves fades, a card that comes is there from the start).
  await v('settings:set', { boxOneLine: false, hintRate: 1 })
  // A card on every open: main's picker asked until it hands over an Inbox capture ("Still in your Inbox"), then that
  // one every time (as qa/hint-room.mjs pins one), and the page's dice at 0.4 (no held question, no memory instead).
  const pinned = await electron.evaluate(({ ipcMain }) => {
    const handlers = ipcMain._invokeHandlers
    const own = (globalThis.qaHintsNext ??= handlers.get('hints:next'))
    let one = null
    let any = null
    for (let i = 0; i < 400 && !one; i++) {
      const row = own({})
      any ??= row
      if (row && row.id === row.captureId) one = row
    }
    one ??= any
    handlers.set('hints:next', () => one)
    return one && { id: one.id, inbox: one.id === one.captureId }
  })
  check('a hint to show was found (an Inbox capture, else any)', !!pinned, JSON.stringify(pinned))
  await page.evaluate(() => { Math.random = () => 0.4 })
  // Away once with the dice set, so the next open's card is picked by them.
  await open()
  await close()
  await electron.evaluate(() => {
    globalThis.qaShows = []
    const show = globalThis.qaBox.show.bind(globalThis.qaBox)
    globalThis.qaBox.show = () => (globalThis.qaShows.push(Date.now()), show())
  })
  await page.evaluate(() => {
    window.qaHint = []
    const tick = () => {
      const card = document.querySelector('[data-hint-room] [data-hint-surface], [data-hint-room] [data-hint-card]')
      const r = card?.getBoundingClientRect()
      const shown = !!r && r.width > 0 && Number(getComputedStyle(card).opacity) > 0.5 && !document.documentElement.hasAttribute('data-card-gone')
      window.qaHint.push({ t: Date.now(), shown, seen: document.visibilityState })
      requestAnimationFrame(tick)
    }
    tick()
  })
  let flashes = 0
  let withCard = 0
  const rounds = []
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => (window.qaHint = window.qaHint.slice(-1)))
    await open()
    const [s] = (await electron.evaluate(() => globalThis.qaShows.splice(0))).slice(-1)
    const log = await page.evaluate(() => window.qaHint)
    const first = log.find((one) => one.t >= s && one.seen === 'visible')
    const later = log.filter((one) => one.t <= s + 400).at(-1)
    if (first && later && first.shown !== later.shown) flashes++
    if (later?.shown) withCard++
    rounds.push(`${first?.shown ? 'card' : 'none'}→${later?.shown ? 'card' : 'none'}`)
    if (i === 0) await shot('hint-open')
    await close()
  }
  check('opened six times with hints on: the hint card is in the first frame exactly when it is there at 400 ms, never a flash', flashes === 0 && withCard > 0, rounds.join(' '))
  await v('settings:set', { hintRate: 0 })
  await electron.evaluate(({ ipcMain }) => void (globalThis.qaHintsNext && ipcMain._invokeHandlers.set('hints:next', globalThis.qaHintsNext)))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
