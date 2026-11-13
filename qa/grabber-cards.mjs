// Every floating card wears quick capture's grabber and moves by it: stickies (a note, Today, Goals), goal cards,
// the meeting card (and its pill) and the focus pill. For each, beside quick capture's own: the same 32x4 bar in the
// same ink, centred over the card's top edge; hidden at rest, shown with the pointer on the card, grown (1.5x) and
// darker pointed at, with the grab hand; and held, the window follows the pointer by exactly as far as it went,
// carried by Haligtree (the pointer is moved in main, never on the real screen). Light and dark; screenshots of each
// pointed at with QA_SHOTS. The nudge cards are not moved at all (main makes them unmovable) and have none.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=<dir>] node qa/grabber-cards.mjs
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const { c, card } = await recorded({})
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)

// What the grabber is, where it is against its card, and how it looks now.
const read = (page, cardSel) => page.evaluate((cardSel) => {
  const grab = document.querySelector('[data-grabber]')
  const bar = grab?.firstElementChild
  const box = document.querySelector(cardSel)
  if (!grab || !bar || !box) return null
  const g = bar.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const m = new DOMMatrix(getComputedStyle(bar).transform)
  return { hovered: [...document.querySelectorAll(':hover')].map((el) => `${el.tagName}.${String(el.className).slice(0, 30)}`).join(' > '), opacity: Number(getComputedStyle(grab).opacity), w: bar.offsetWidth, h: bar.offsetHeight, ink: getComputedStyle(bar).backgroundColor, scale: m.a,
    cursor: getComputedStyle(grab).cursor, offCentre: Math.abs(g.left + g.width / 2 - (b.left + b.width / 2)), above: b.top - g.bottom,
    grab: (() => { const r = grab.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 8 } })(), centre: { x: b.left + b.width / 2, y: b.top + b.height / 2 } }
}, cardSel)

// Held by its grabber, the pointer moved 40 right and 30 down through the page's own pointer events (lib/carry.ts):
// where the window went.
const carried = async (page, wid, at) => {
  await page.mouse.move(at.x, at.y)
  const before = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), wid)
  await page.mouse.down()
  await page.waitForTimeout(80)
  await page.mouse.move(at.x + 40, at.y + 30)
  await page.waitForTimeout(200)
  const after = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), wid)
  await page.mouse.up()
  await page.waitForTimeout(150)
  return { dx: after.x - before.x, dy: after.y - before.y }
}

const idOf = (url) => electron.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url)?.id, url)

try {
  await v('session:start', '', 'Grabber check', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  await v('meeting:start', null)
  await card()
  await h.evaluate(() => window.api.showPrompt())
  await wait(3500)
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    for (const page of electron.windows()) await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme).catch(() => {})
    await wait(800)
    // Quick capture's own, the one to match.
    const box = electron.windows().find((one) => !/view=/.test(one.url()) && one !== h) ?? h
    const qc = await box.evaluate(() => {
      const bar = document.querySelector('[data-grabber] > span')
      return bar ? { w: bar.offsetWidth, h: bar.offsetHeight, ink: getComputedStyle(bar).backgroundColor } : null
    })
    check(`${theme}: quick capture has its grabber`, !!qc, JSON.stringify(qc))
    const kinds = [
      ['a note sticky', /view=sticky(?!.*type=(goal|goals|today))/, '.mf-card'],
      ['the Today sticky', /view=sticky.*type=today/, '.mf-card'],
      ['the Goals sticky', /view=sticky.*type=goals/, '[data-goals-sticky]'],
      ['a goal card', /view=sticky.*type=goal(&|$)/, '[data-goal-card]'],
      ['the meeting card', /view=meeting/, '[data-meeting-card]'],
      ['the focus pill', /view=focus/, '[data-island]']
    ]
    for (const [name, url, sel] of kinds) {
      const page = electron.windows().find((one) => url.test(one.url()))
      if (!page) { console.log(`  (${theme}: no ${name} up in this book)`); continue }
      await page.mouse.move(-20, -20)
      await page.waitForTimeout(300)
      const rest = await read(page, sel)
      if (!rest) { check(`${theme}: ${name} has the grabber`, false); continue }
      check(`${theme}: ${name}: the same bar as quick capture's, same ink`, !!qc && rest.w === qc.w && rest.h === qc.h && rest.ink === qc.ink, `${rest.w}x${rest.h} ${rest.ink} vs ${qc?.w}x${qc?.h} ${qc?.ink}`)
      check(`${theme}: ${name}: centred over the card's top edge`, rest.offCentre <= 1 && rest.above >= -10 && rest.above <= 8, `off centre ${rest.offCentre.toFixed(1)}px, ${rest.above.toFixed(1)}px above the edge`)
      check(`${theme}: ${name}: hidden with the pointer away`, rest.opacity === 0, `${rest.opacity} ${rest.opacity ? rest.hovered : ''}`)
      await page.mouse.move(rest.centre.x, rest.centre.y)
      await page.waitForTimeout(300)
      const over = await read(page, sel)
      check(`${theme}: ${name}: shown with the pointer on the card`, over.opacity === 1, String(over.opacity))
      await page.mouse.move(over.grab.x, over.grab.y)
      await page.waitForTimeout(300)
      const on = await read(page, sel)
      check(`${theme}: ${name}: pointed at, it grows to 1.5x with the grab hand`, Math.abs(on.scale - 1.5) < 0.01 && on.cursor === 'grab', `${on.scale} ${on.cursor}`)
      if (shots) await page.screenshot({ path: `${shots}/grabber-${theme}-${name.replace(/\W+/g, '-')}.png` })
      const wid = await idOf(page.url())
      const moved = await carried(page, wid, on.grab)
      check(`${theme}: ${name}: held, it follows the pointer`, moved.dx === 40 && moved.dy === 30, `${moved.dx},${moved.dy}`)
    }
    if (shots) await box.screenshot({ path: `${shots}/grabber-${theme}-quick-capture.png` }).catch(() => {})
  }
  // The nudge window is made unmovable: no grabber to offer.
  const nudge = electron.windows().find((one) => /view=nudge/.test(one.url()))
  if (nudge) check('a nudge card offers no grabber (it does not move)', !(await nudge.$('[data-grabber]')))
} catch (e) {
  check('ran', false, e.message.split('\n')[0])
} finally {
  await c.close()
}
done()
