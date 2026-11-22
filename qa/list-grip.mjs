// A list beside an open note widens and narrows by its right edge (ui.tsx useListWidth): dragged right, it gets wider.
// The page around it was a box-less wrapper (display: contents) measuring 0, so every drag pinned the list to its least (22 Nov).
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 850 })
const { h, close } = s
try {
  await s.go('inbox'); await h.waitForTimeout(1200)
  await h.locator('[data-capture-id], [data-id]').first().click(); await h.waitForTimeout(1500)
  const grip = await h.evaluate(() => { const g = document.querySelector('[aria-label="Drag to resize the list"]'); if (!g) return null; const r = g.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y); return { x, y, list: Math.round(g.parentElement.getBoundingClientRect().width), on: top === g || g.contains(top), top: `${top?.tagName}.${top?.className?.toString().slice(0, 80)}` } })
  if (grip) {
    await h.mouse.move(grip.x, grip.y); await h.mouse.down(); await h.mouse.move(grip.x + 120, grip.y, { steps: 8 }); await h.mouse.up(); await h.waitForTimeout(400)
    const after = await h.evaluate(() => Math.round(document.querySelector('[aria-label="Drag to resize the list"]').parentElement.getBoundingClientRect().width))
    await h.screenshot({ path: `${process.env.QA_SHOTS}/grip.png` })
    check('the list’s edge drags it wider', after > grip.list + 60, JSON.stringify({ before: grip.list, after, top: grip.top }))
  } else check('a grip is there', false)
} catch (error) { check('ran', false, error.stack) } finally { await close() }
done()
