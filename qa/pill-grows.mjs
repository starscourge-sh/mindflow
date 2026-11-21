// A goal's pill grows into its card (21 Nov: "why separate? why cant the pill become the card? similar to how the notch
// session pill elastically expands"). An everyday person points at the goal's pill in the desk's stack, it grows into
// the card, they read it, they move away and it shrinks back into the pill. Every 50 ms through the open and the close
// the visible shape is read (the card's window clip, its paper and the pill): it starts as the pill's own box, ends as
// the card's, never steps more than a spring frame's worth from one reading to the next, and is one surface throughout
// (never the pill's ground and the card's paper on screen at once). (qa/desk-pill-glass.mjs checks the open card is opaque.)
// With QA_SHOTS, a picture every 50 ms of each.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/pill-grows.mjs
import { writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (test, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(50)) if (await test()) return true
  return test()
}
const shots = process.env.QA_SHOTS
/** The most an edge of the shape may move in 50 ms: the opening spring's fastest stretch on a card this size is about
 * 1,200 points a second on its height (about 60 in 50 ms); a jump (a snap, a second surface popping in) is far more. */
const STEP = 70
/** How near the first and last shapes must be to the pill's own box, in points. */
const NEAR = 3

const c = await sandbox()
const goalWin = () => c.electron.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.isVisible() && /view=sticky/.test(one.webContents.getURL()) && one.webContents.getURL().includes('type=goal&'))
  return w ? { id: w.id, url: w.webContents.getURL() } : null
})
/** What is on screen in the goal's window now, in screen points: the pill if its ground shows, the card's visible
 * shape (its paper cut by the clip it is growing through) if any of it shows, and the words of the pill alone. */
const look = (id) => c.electron.evaluate(async ({ BrowserWindow }, id) => {
  const w = BrowserWindow.fromId(id)
  if (!w || w.isDestroyed()) return null
  const at = w.getBounds()
  const page = await w.webContents.executeJavaScript(`(() => {
    const seen = (el) => { if (!el) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && Number(s.opacity) > 0.01 }
    const pill = document.querySelector('[data-desk-pill]')
    const root = document.getElementById('root')
    const paper = document.querySelector('[data-goal-card]')
    const ghost = document.querySelector('[data-pill-ghost]')
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
    let card = null
    if (paper && seen(root) && seen(paper)) {
      // The clip's box in the root's own points, then moved and scaled as the root is.
      const box = r(paper)
      const clip = getComputedStyle(root).clipPath
      const m = /inset\\(([-\\d.]+)px(?: ([-\\d.]+)px)?(?: ([-\\d.]+)px)?(?: ([-\\d.]+)px)?/.exec(clip)
      if (m) {
        const [t, ri = t, b = t, l = ri] = m.slice(1).filter(Boolean).map(Number)
        const rb = r(root)
        const k = rb.w / root.offsetWidth || 1
        const cut = { x: rb.x + l * k, y: rb.y + t * k, w: rb.w - (l + ri) * k, h: rb.h - (t + b) * k }
        const x = Math.max(box.x, cut.x), y = Math.max(box.y, cut.y)
        const x2 = Math.min(box.x + box.w, cut.x + cut.w), y2 = Math.min(box.y + box.h, cut.y + cut.h)
        card = x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null
      } else card = box
    }
    return {
      pill: pill && seen(pill) ? r(pill) : null,
      pillAt: pill ? r(pill) : null,
      card,
      ghost: ghost ? { bg: getComputedStyle(ghost).backgroundColor, border: getComputedStyle(ghost).borderTopColor, opacity: Number(getComputedStyle(ghost).opacity) } : null,
      open: document.documentElement.getAttribute('data-pill-open')
    }
  })()`)
  const add = (b) => b && { x: Math.round(b.x + at.x), y: Math.round(b.y + at.y), w: Math.round(b.w), h: Math.round(b.h) }
  return { ...page, pill: add(page.pill), pillAt: add(page.pillAt), card: add(page.card), png: process.env.QA_SHOTS ? (await w.webContents.capturePage()).toDataURL() : null }
}, id)
/** Readings every 50 ms for `ms`. */
const film = async (id, ms, name) => {
  const all = []
  for (let n = 0; n * 50 < ms; n++) {
    const one = await look(id)
    all.push(one)
    if (shots && one?.png) writeFileSync(join(shots, `${name}-${String(n * 50).padStart(4, '0')}ms.png`), Buffer.from(one.png.split(',')[1], 'base64'))
    await wait(50)
  }
  return all
}
const edges = (b) => [b.x, b.y, b.x + b.w, b.y + b.h]
const near = (a, b, by) => !!a && !!b && edges(a).every((v, i) => Math.abs(v - edges(b)[i]) <= by)
/** What shows as the one surface: the card's shape while it is out, else the pill. */
const shapeOf = (one) => one?.card ?? one?.pill ?? null
/** The biggest move of any edge from one reading to the next. */
const steps = (all) => all.map(shapeOf).filter(Boolean).map((b, i, list) => (i ? Math.max(...edges(b).map((v, k) => Math.abs(v - edges(list[i - 1])[k]))) : 0))

try {
  await wait(2500)
  await c.v('settings:set', { stickiesFrosted: false, stickiesGlass: false })
  check('a goal card is up', await until(async () => !!(await goalWin()), 10_000))
  await wait(1500)
  const goal = await goalWin()
  const page = c.electron.windows().find((p) => p.url() === goal.url)
  await page.hover('[data-goal-card]').catch(() => {})
  await page.locator('[aria-label="Fold it into its pill"]').first().dispatchEvent('click')
  check('its “–” folds it into its pill', await until(async () => !!(await look(goal.id))?.pill, 4000))
  await page.mouse.move(-40, -40)
  await wait(900)

  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await wait(600)
    const rest = await look(goal.id)
    const pill = rest.pill
    // Points at the pill and stays on it: it grows.
    const inWin = await c.electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), goal.id)
    await page.mouse.move(pill.x - inWin.x + pill.w / 2, pill.y - inWin.y + pill.h / 2)
    const opening = await film(goal.id, 1100, `${theme}-open`)
    const out = opening.filter((one) => one?.open)
    const both = opening.filter((one) => one?.pill && one?.card)
    check(`${theme}: one surface while it grows: never the pill and the card on screen together`, out.length > 0 && !both.length, `${both.length} of ${opening.length} readings had both`)
    check(`${theme}: the pill's words while it grows have no ground of their own`, out.every((one) => !one.ghost || (/rgba\(0, 0, 0, 0\)|transparent/.test(one.ghost.bg) && /rgba\(0, 0, 0, 0\)|transparent/.test(one.ghost.border))), JSON.stringify(out[0]?.ghost))
    const firstCard = opening.find((one) => one?.card)
    check(`${theme}: it starts as the pill's own box (within ${NEAR} points), no pop`, near(firstCard?.card, pill, NEAR) || (firstCard?.card && firstCard.card.w < pill.w + 60 && Math.abs(firstCard.card.y - pill.y) <= NEAR), JSON.stringify({ pill, first: firstCard?.card }))
    const last = opening.at(-1)
    check(`${theme}: open, the card stands where the pill hung (its top and its edge on the stack's side)`, !!last?.card && Math.abs(last.card.y - pill.y) <= NEAR && (Math.abs(last.card.x + last.card.w - (pill.x + pill.w)) <= NEAR || Math.abs(last.card.x - pill.x) <= NEAR) && last.card.w > 200, JSON.stringify({ pill, card: last?.card }))
    const openSteps = steps(opening)
    check(`${theme}: no reading jumps while it grows (each edge under ${STEP} points in 50 ms)`, openSteps.length > 8 && Math.max(...openSteps) < STEP, JSON.stringify(openSteps))
    console.log(`  ${theme} open, 50 ms readings: ${opening.map((one) => JSON.stringify(shapeOf(one))).join(' ')}`)

    // Reads it, then moves away: it shrinks back into the pill.
    await wait(400)
    await page.mouse.move(-40, -40)
    const closing = await film(goal.id, 1500, `${theme}-close`)
    const bothClosing = closing.filter((one) => one?.pill && one?.card)
    check(`${theme}: one surface while it shrinks back`, !bothClosing.length, `${bothClosing.length} of ${closing.length} readings had both`)
    const closeSteps = steps(closing)
    check(`${theme}: no reading jumps while it shrinks back (each edge under ${STEP} points in 50 ms)`, Math.max(...closeSteps) < STEP, JSON.stringify(closeSteps))
    // The last card shape before the pill shows again is the pill's own box: it folds into it, it does not vanish.
    const lastCard = [...closing].reverse().find((one) => one?.card)
    const back = closing.at(-1)
    check(`${theme}: it ends as the pill again, in the pill's place`, !!back?.pill && !back.card && near(back.pill, pill, NEAR), JSON.stringify({ pill, back: back?.pill }))
    check(`${theme}: its last card shape is the pill's box (within ${NEAR + 3} points)`, near(lastCard?.card, pill, NEAR + 3), JSON.stringify({ pill, last: lastCard?.card }))
    await wait(500)
  }
} catch (error) {
  check('ran to the end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
