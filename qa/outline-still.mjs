// Settings' outline, open beside the column, stays still under the pointer: every row's box and every word's place
// the same before and during a hover, the hover fill inside the row and hugging its words. Also What Haligtree can do and Stats.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/outline-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1600, height: 960 })
const { h, go, close, errors } = s
const shots = process.env.QA_SHOTS
const boxes = () => h.evaluate(() => [...document.querySelectorAll('[data-page-contents] .tiptap-toc-item')].map((row) => {
  const r = row.getBoundingClientRect()
  const t = row.querySelector('.tiptap-toc-text').getBoundingClientRect()
  return [r.left, r.top, r.width, r.height, t.left, t.top].map(Math.round).join(',')
}))
try {
  for (const page of ['settings', 'powers', 'stats']) {
    await go(page)
    await h.waitForTimeout(1200)
    if (page === 'settings') (await h.click('[data-section="Appearance"]'), await h.waitForTimeout(900))
    const wide = await h.evaluate(() => document.querySelector('[data-page-contents]')?.hasAttribute('data-wide'))
    if (!wide) { check(`${page}: the outline is open beside the column`, false); continue }
    await h.mouse.move(5, 500)
    await h.waitForTimeout(300)
    const rest = await boxes()
    const rows = h.locator('[data-page-contents] .tiptap-toc-item')
    for (const at of [4, 1]) {
      const box = await rows.nth(at).evaluate((row) => { const t = row.querySelector('.tiptap-toc-text').getBoundingClientRect(); return { x: t.left + 20, y: t.top + t.height / 2 } })
      await h.mouse.move(box.x, box.y, { steps: 4 })
      await h.waitForTimeout(250)
      const during = await boxes()
      const moved = rest.map((one, i) => (one === during[i] ? null : `${i}: ${one} -> ${during[i]}`)).filter(Boolean)
      check(`${page}: hovering row ${at} moves no row by 1px (${rest.length} rows)`, rest.length > 2 && !moved.length, moved.slice(0, 3).join(' | '))
      const fill = await rows.nth(at).evaluate((row) => {
        const r = row.getBoundingClientRect()
        const filled = [row, ...row.querySelectorAll('*')].find((one) => one.checkVisibility() && getComputedStyle(one).backgroundColor !== 'rgba(0, 0, 0, 0)')
        const f = filled?.getBoundingClientRect()
        return f && { inside: f.left >= r.left - 0.5 && f.right <= r.right + 0.5 && f.top >= r.top - 0.5 && f.bottom <= r.bottom + 0.5, hugs: filled.classList.contains('tiptap-toc-text') }
      })
      check(`${page}: row ${at}'s hover fill sits inside the row and hugs its words`, !!fill?.inside && !!fill?.hugs, JSON.stringify(fill))
      if (shots) await h.screenshot({ path: `${shots}/outline-${page}-hover-${at}.png`, clip: { x: 1150, y: 40, width: 450, height: 500 } })
    }
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
