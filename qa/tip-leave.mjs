// Tips close when the pointer leaves toward the window's left edge (x=5) or
// out of the window, and the next tip still opens.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tip-leave.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 800 })
const { h: home, page: box } = c
let h = home
const tip = () => h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content]')].filter((one) => one.getAttribute('data-state') !== 'closed').map((one) => one.textContent.trim().slice(0, 40)).join(' | '))
async function walk(name) {
  await h.waitForTimeout(1500)
  // Every control with a tip that is on screen, left to right.
  const spots = await h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-trigger]')].map((one) => one.getBoundingClientRect())
    .filter((r) => r.width && r.height && r.x >= 0 && r.y >= 0 && r.x < innerWidth && r.y < innerHeight).slice(0, 8).map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })))
  check(`${name}: some tips to try`, spots.length >= 2, `${spots.length}`)
  for (const [i, at] of spots.entries()) {
    await h.mouse.move(at.x, at.y, { steps: 4 })
    await h.waitForTimeout(1100)
    const shown = await tip()
    if (!shown) continue
    // Off to the left edge, then out of the window.
    if (i % 2) await h.mouse.move(5, at.y, { steps: 6 })
    else await h.mouse.move(-20, at.y, { steps: 6 })
    await h.waitForTimeout(500)
    const left = await tip()
    check(`${name}: tip “${shown}” closes when the pointer goes to x=${i % 2 ? 5 : -20}`, !left, left)
  }
  // And the next one still opens.
  const next = spots[spots.length - 1]
  await h.mouse.move(next.x, next.y, { steps: 4 }); await h.waitForTimeout(1100)
  check(`${name}: the next tip still opens`, !!(await tip()))
  await h.mouse.move(-20, 5)
}
try {
  await walk('Main window')
  h = box
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(800)
  await walk('Quick capture')
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
