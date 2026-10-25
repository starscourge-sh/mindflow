// Dragging a row onto another shows "New group" as a panel around that row and
// the carried row's place under it, and nothing else: the rows after it make
// way, so none sits inside the panel as if it would join too.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/new-group-preview.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1500, height: 1000 })
const { h, go, close } = s
try {
  await go('articles'); await h.waitForTimeout(1500)
  const boxes = await h.evaluate(() => [...document.querySelectorAll('[data-sortable-id]')].filter((n) => !n.closest('aside') && n.getClientRects().length).slice(0, 2).map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }))
  const [first, second] = boxes
  // Carry the first row onto the middle of the second: "New group".
  await h.mouse.move(first.x + 60, first.y + first.height / 2); await h.mouse.down()
  for (let i = 1; i <= 20; i++) { await h.mouse.move(first.x + 60, first.y + first.height / 2 + ((second.y + second.height / 2) - (first.y + first.height / 2)) * (i / 20)); await h.waitForTimeout(20) }
  await h.waitForTimeout(700)
  const m = await h.evaluate(() => {
    const panel = document.querySelector('[data-preview]')?.getBoundingClientRect()
    const third = [...document.querySelectorAll('[data-sortable-id]')].filter((n) => !n.closest('aside') && n.getClientRects().length)[2]?.getBoundingClientRect()
    const said = document.body.innerText.includes('New group')
    return { panel: panel && { top: Math.round(panel.top), bottom: Math.round(panel.bottom) }, third: third && { top: Math.round(third.top), bottom: Math.round(third.bottom) }, said }
  })
  await h.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/new-group-preview.png`, clip: { x: 0, y: 150, width: 1500, height: 420 } })
  await h.keyboard.press('Escape'); await h.mouse.up()
  check('dropping onto a row says "New group"', m.said)
  check('the panel is drawn', !!m.panel, JSON.stringify(m))
  check(`the next row sits below the panel, not inside it (${m.third?.top} vs ${m.panel?.bottom})`, m.panel && m.third && m.third.top >= m.panel.bottom - 2, JSON.stringify(m))
} finally {
  await close()
}
done()
