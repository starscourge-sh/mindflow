// Starting a drag on Today written out moves nothing else on the page: every other line and box keeps its place
// while the drag starts and goes on (sampled each frame).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-q/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/drag-hint-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 1000 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// Every line and box on the page but the one carried, by its place on screen.
// Only what comes after the carried line's own list: inside it, lines make way for the drag by design.
const places = (carried) => h.evaluate((carried) => {
  const page = document.querySelector('[data-page]')
  const row = document.querySelector(`[data-sortable-id="${carried}"]`)
  let list = row.parentElement
  while (list && list.querySelectorAll('[data-sortable-id]').length < 2) list = list.parentElement
  const out = {}
  for (const one of page.querySelectorAll('[data-sortable-id], h2, h3, form, p, button')) {
    if (one.closest('[data-drop-foot-over]') || list.contains(one) || !(list.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
    const key = one.getAttribute('data-sortable-id') ?? `${one.tagName}:${one.textContent.slice(0, 30)}`
    out[key] = Math.round(one.getBoundingClientRect().top)
  }
  return out
}, carried)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const words of ['Ring the plumber today', 'Post the parcel today', 'Buy stamps today']) await v('task:add', words)
  await go('today'); await wait(800)
  // "Write out my day" lives in the bar's ⋯ (23 Nov).
  await h.locator('[data-page] header [aria-label="More"]').last().click(); await h.waitForTimeout(400)
  await h.getByRole('menuitem', { name: /Write out my day/ }).first().click(); await h.waitForTimeout(1200)
  const rows = h.locator('[data-page] [data-sortable-id]')
  check('Today written out has lines to drag', (await rows.count()) >= 2, String(await rows.count()))
  const carried = await rows.first().getAttribute('data-sortable-id')
  const before = await places(carried)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/before.png` })
  delete before[carried]
  const box = await rows.first().boundingBox()
  await h.mouse.move(box.x + 40, box.y + box.height / 2)
  await h.mouse.down()
  const moved = new Set()
  for (let step = 1; step <= 12; step++) {
    await h.mouse.move(box.x + 40, box.y + box.height / 2 + step * 3)
    await h.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
    const now = await places(carried)
    for (const [key, top] of Object.entries(before)) if (key in now && Math.abs(now[key] - top) > 1 && key !== carried) moved.add(`${key} ${top}→${now[key]}`)
  }
  check(`nothing under the list moves as the drag starts (${Object.keys(before).length} sampled)`, Object.keys(before).length > 0 && moved.size === 0, [...moved].slice(0, 4).join('; '))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? process.env.QA_DATA}/drag.png` })
  await h.mouse.up()
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
