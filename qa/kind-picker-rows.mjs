// Quick capture's "Change type…" list is three and a half rows tall: the half
// row says there are more below, and the list scrolls to the rest.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/kind-picker-rows.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1100, height: 760 })
const { page, electron } = s
try {
  await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); win?.setBounds({ x: 60, y: 60, width: 760, height: 520 }); win?.show() })
  await page.waitForTimeout(800)
  await page.click('.tiptap.ProseMirror')
  await page.keyboard.type('Something to keep', { delay: 15 })
  await page.waitForTimeout(500)
  await page.click('[data-kind-chip]')
  await page.waitForTimeout(600)
  const seen = await page.evaluate(() => {
    const list = document.querySelector('[cmdk-list]')
    const rows = [...list.querySelectorAll('[cmdk-item]')]
    // What clips the list on screen: the list, and the popover round it.
    const outer = list.closest('[data-slot="popover-content"]').getBoundingClientRect()
    const own = list.getBoundingClientRect()
    const box = { top: Math.max(own.top, outer.top), bottom: Math.min(own.bottom, outer.bottom) }
    const shown = rows.map((one) => { const r = one.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) / r.height })
    return { rows: rows.length, shown: shown.reduce((a, b) => a + b, 0), each: shown.slice(0, 5).map((one) => one.toFixed(2)).join(' '), fourth: shown[3], scrolls: list.scrollHeight > list.clientHeight + 4, mask: getComputedStyle(list).maskImage || getComputedStyle(list).webkitMaskImage }
  })
  check('three whole rows, then the fourth cut through its words', seen.shown >= 3.5 && seen.fourth >= 0.55 && seen.fourth <= 0.75, `${seen.each} of ${seen.rows}`)
  check('the rest are a scroll away', seen.scrolls)
  check('a light shade over the cut row, never a fade to nothing', /gradient/.test(seen.mask ?? '') && !/transparent\)/.test(seen.mask), seen.mask)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/kind-picker.png` })
  await page.keyboard.press('End'); await page.waitForTimeout(300)
  const last = await page.evaluate(() => { const list = document.querySelector('[cmdk-list]'); const sel = list.querySelector('[cmdk-item][data-selected="true"]'); if (!sel) return false; const a = sel.getBoundingClientRect(), b = list.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1 })
  check('the last type, picked with the keys, scrolls into view', last)
} finally { await s.close() }
done()
