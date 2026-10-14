// A sidebar group's heading lights across the sidebar's width, as its rows
// do: its right edge lines up with theirs, the wrench inside it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/side-heading-edge.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 900 })
const { h } = c
const edges = await h.evaluate(() => {
  const right = (one) => Math.round(one.getBoundingClientRect().right)
  const left = (one) => Math.round(one.getBoundingClientRect().left)
  const row = document.querySelector('aside nav button[data-side-row][aria-label="Gems"]')
  return [...document.querySelectorAll('aside nav button[aria-expanded]')].map((head) => {
    const wrench = head.parentElement.querySelector('svg.lucide-wrench')?.closest('button')
    return { name: head.textContent.trim(), left: left(head), right: right(head), rowLeft: left(row), rowRight: right(row), wrenchIn: !wrench || (left(wrench) >= left(head) && right(wrench) <= right(head)) }
  })
})
for (const one of edges) check(`“${one.name}” heading spans the rows' width, wrench inside`, one.left === one.rowLeft && one.right === one.rowRight && one.wrenchIn, JSON.stringify(one))
if (process.env.SHOT) {
  await h.locator('aside nav button[aria-expanded]', { hasText: 'Saved' }).first().hover()
  await h.waitForTimeout(400)
  const box = await h.locator('aside').first().boundingBox()
  await h.screenshot({ path: `${process.env.SHOT}/heading.png`, clip: { x: box.x, y: box.y, width: box.width, height: 700 } })
}
await c.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
