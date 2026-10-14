// A card or row carried inside its own list or board shows one lifted
// picture, never two, and the “Open on the left / right” places come up only
// while the pointer is at the page's very edge, as narrow strips, and go again
// when it comes back in. Let go over another box, it lands there. Checked on
// the Matrix, the week board, the Inbox and Gems in your own order and the sidebar, out of sight.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/matrix-drag.mjs
// SHOTS=dir keeps a picture mid-drag and at the edge.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c

// What is on screen mid-drag: lifted pictures, the places and how wide they are.
const seen = () => h.evaluate(() => {
  const shown = (one) => { const box = one.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(one).opacity !== '0' }
  return {
    pictures: [...document.querySelectorAll('.mf-drag-picture')].filter((one) => one.children.length && shown(one)).length + [...document.querySelectorAll('[data-split-card]')].filter(shown).length,
    zones: [...document.querySelectorAll('[data-split-zone]')].map((one) => Math.round(one.getBoundingClientRect().width))
  }
})
const area = () => h.evaluate(() => { const box = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom } })
const centre = (locator) => locator.boundingBox().then((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }))
// Moved as a hand moves, a step at a time, so the page sees each one.
let at = { x: 0, y: 0 }
async function glide(to, steps = 12) {
  const from = at
  for (let i = 1; i <= steps; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps); await h.waitForTimeout(30) }
  at = to
  await h.waitForTimeout(250)
}

async function carry(name, from, to, { land } = {}) {
  const start = await centre(from)
  await h.mouse.move(start.x, start.y)
  at = start
  await h.mouse.down()
  await glide({ x: start.x + 30, y: start.y + 10 }, 6)
  // Across the page, over somewhere it could land.
  const over = await centre(to)
  await glide(over)
  let s = await seen()
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-').toLowerCase()}-carried.png` })
  check(`${name}: one lifted picture while carried`, s.pictures === 1, `${s.pictures} pictures`)
  check(`${name}: no places over the page while it is inside`, !s.zones.length, `zones ${s.zones.join(', ')}`)
  // At the page's left edge: the places, narrow, still one picture.
  const box = await area()
  await glide({ x: box.left + 20, y: over.y })
  s = await seen()
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-').toLowerCase()}-edge.png` })
  check(`${name}: at the edge the places come up, narrow`, s.zones.length === 2 && s.zones.every((width) => width <= 80), `zones ${s.zones.join(', ')}`)
  check(`${name}: at the edge, still one picture`, s.pictures === 1, `${s.pictures} pictures`)
  // Back in: they go.
  await glide(over)
  s = await seen()
  check(`${name}: back in from the edge, the places go`, !s.zones.length, `zones ${s.zones.join(', ')}`)
  await h.mouse.up()
  await h.waitForTimeout(900)
  if (land) check(`${name}: let go over another box, it lands there`, await land())
  if (await h.evaluate(() => !!document.querySelector('[role=dialog], [data-push-ask]'))) await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await v('onboarding:set', { pageHints: false })
  // The Matrix: a card from "Drop or later" to "Plan".
  await go('matrix'); await h.waitForTimeout(900)
  const card = h.locator('[data-quadrant="drop"] [data-row]').first()
  const id = await card.getAttribute('data-id')
  const plan = h.locator('[data-quadrant="plan"]')
  const planId = await plan.getAttribute('data-quadrant')
  await carry('Matrix', card, plan, { land: () => h.evaluate(([id, q]) => !!document.querySelector(`[data-quadrant="${q}"] [data-row][data-id="${id}"]`), [id, planId]) })
  // The week board: a card to the next day.
  await go('week'); await h.waitForTimeout(900)
  const days = h.locator('[data-day]')
  const from = h.locator('[data-day] [data-row]').first()
  const day = await from.evaluate((one) => Number(one.closest('[data-day]').dataset.day))
  await carry('This week', from, days.nth(day === 6 ? 5 : day + 1))
  // A list in your own order (Inbox, Gems): a row down the list.
  for (const [name, id] of [['Inbox', 'inbox'], ['Gems', 'nuggets']]) {
    await go(id); await h.waitForTimeout(900)
    const rows = h.locator(`[data-page="${id}"] [data-sortable-id] [data-row][data-id]`)
    if (await rows.count() > 3) await carry(name, rows.nth(0), rows.nth(3))
    else console.log(`  ${name}: not in your own order here, skipped`)
  }
  // The sidebar: a place carried down its own list keeps to it, one picture, no places over the page.
  const places = h.locator('aside [data-sortable-id], nav [data-sortable-id]')
  if (await places.count() > 3) {
    const start = await centre(places.nth(0))
    await h.mouse.move(start.x, start.y); at = start; await h.mouse.down()
    await glide(await centre(places.nth(3)))
    const s = await seen()
    check('Sidebar: one picture, no places over the page', s.pictures <= 1 && !s.zones.length, `${s.pictures} pictures, zones ${s.zones.join(', ')}`)
    await h.keyboard.press('Escape'); await h.mouse.up(); await h.waitForTimeout(400)
  } else console.log('  Sidebar: no places to carry, skipped')
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
