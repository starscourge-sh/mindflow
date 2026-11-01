// Writing and Gems hold still: pressing each of their filter chips, and going between the two pages and
// Questions, moves no chip, no button on the line and not the list's left edge, by even 1px; the chip
// you press keeps its size. Frames every 50ms through each press go to QA_SHOTS when it is set.
//
//   npx electron-vite build --outDir out-wr
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/writing-gems-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1300), height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const boxes = () => h.evaluate(() => {
  const at = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` }
  const out = {}
  document.querySelectorAll('[data-kind-chips] button').forEach((one, k) => (out[`chip${k}`] = at(one)))
  // The list's own left edge: its first row's words.
  const row = document.querySelector('[role="main"] [data-row] , [role="main"] [role="option"]')
  out.rowLeft = row ? String(Math.round(row.getBoundingClientRect().left)) : null
  document.querySelectorAll('[role="main"] section > div:first-child button').forEach((one, k) => (out[`bar${k}`] = at(one)))
  return out
})
try {
  await v('settings:set', { hintRate: 0 })
  for (const page of ['nuggets', 'articles']) {
    await go(page)
    await h.waitForTimeout(900)
    const start = await boxes()
    const chips = await h.locator('[data-kind-chips] button').count()
    const moved = []
    for (let k = 0; k < chips; k++) {
      await h.locator('[data-kind-chips] button').nth(k).click()
      if (shots) for (let f = 0; f < 6; f++) { await h.screenshot({ path: `${shots}/${page}-chip${k}-${f}.png` }); await h.waitForTimeout(50) }
      else await h.waitForTimeout(400)
      const now = await boxes()
      for (const key of Object.keys(start)) if (key.startsWith('chip') && now[key] !== start[key]) moved.push(`chip ${k} pressed: ${key} ${start[key]} -> ${now[key]}`)
      if (now.rowLeft && start.rowLeft && now.rowLeft !== start.rowLeft) moved.push(`chip ${k} pressed: list edge ${start.rowLeft} -> ${now.rowLeft}`)
      await h.locator('[data-kind-chips] button').nth(k).click()
      await h.waitForTimeout(300)
    }
    check(`${page}: ${chips} chips pressed, nothing on the line or the list's edge moves`, moved.length === 0, moved.slice(0, 6).join('; '))
  }
  // Between the pages: the list's left edge is the same on Writing, Gems and Questions.
  const edges = {}
  for (const page of ['articles', 'nuggets', 'questions']) { await go(page); await h.waitForTimeout(800); edges[page] = (await boxes()).rowLeft }
  check('Writing, Gems and Questions start their rows on one edge', new Set(Object.values(edges)).size === 1, JSON.stringify(edges))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
