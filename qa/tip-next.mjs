// Moving straight from one control onto the next never leaves the first tip
// showing: after each move only the tip of the control under the pointer is
// open, or none. Walks the sidebar (tips to the right) and the top bar (tips
// below), going on to the neighbour without stopping, and back.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tip-next.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const open = () => h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content]')].filter((one) => one.getAttribute('data-state') !== 'closed').map((one) => one.textContent.trim().slice(0, 40)))
try {
  await c.go('home')
  await h.waitForTimeout(1200)
  // Controls with tips, grouped by row (same y) and by column (same x), neighbours only.
  const spots = await h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-trigger]')].map((one) => ({ r: one.getBoundingClientRect(), one }))
    .filter(({ r }) => r.width > 4 && r.height > 4 && r.x >= 0 && r.y >= 0 && r.right < innerWidth && r.bottom < innerHeight)
    .map(({ r }) => ({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height })))
  const pairs = []
  for (const a of spots) for (const b of spots) {
    if (a === b) continue
    const row = Math.abs(a.y - b.y) < 3 && b.x > a.x && b.x - a.x < a.w / 2 + b.w / 2 + 12
    const col = Math.abs(a.x - b.x) < 30 && b.y > a.y && b.y - a.y < a.h / 2 + b.h / 2 + 12
    if (row || col) pairs.push([a, b])
  }
  check('some neighbouring controls with tips to walk', pairs.length >= 3, `${pairs.length} pairs`)
  let tried = 0
  for (const [a, b] of pairs.slice(0, 14)) {
    await h.mouse.move(a.x, a.y, { steps: 3 })
    await h.waitForTimeout(1100)
    const first = await open()
    if (!first.length) continue
    tried++
    // Straight on to the neighbour, at a quick hand's pace, then still.
    await h.mouse.move(b.x, b.y, { steps: 3 })
    await h.waitForTimeout(700)
    const after = await open()
    const stale = after.filter((words) => words === first[0])
    check(`from “${first[0]}” onto its neighbour, “${first[0]}” has gone`, after.length <= 1 && !stale.length, JSON.stringify(after))
    // And back, the other way.
    await h.mouse.move(a.x, a.y, { steps: 3 })
    await h.waitForTimeout(700)
    const back = await open()
    check(`and back, at most one tip shows`, back.length <= 1, JSON.stringify(back))
    await h.mouse.move(600, 790, { steps: 2 })
    await h.waitForTimeout(500)
  }
  check('several tips walked', tried >= 3, `${tried}`)
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} catch (error) {
  check('probe ran', false, error.message)
} finally {
  await c.close()
  done()
}
