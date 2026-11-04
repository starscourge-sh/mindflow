// Every day in a week or month strip has the same cell (the user: "when no box, it looks broken"): the week's
// page and the month's page, light and dark. Each day's cell is drawn (not see-through), all empty days alike,
// today's set apart, and every cell the same size. Pictures with QA_SHOTS.
//   QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/day-cells.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800, at: CALM_HOUR })
const { h } = c

try {
  for (const look of ['light', 'dark']) for (const view of ['weekpage', 'monthpage']) {
    await c.look(look)
    await c.go(view)
    await h.waitForTimeout(800)
    const cells = await h.evaluate(() => [...document.querySelectorAll('[data-grid-day]')].map((one) => {
      const r = one.getBoundingClientRect()
      return { day: one.getAttribute('data-grid-day'), bg: getComputedStyle(one).backgroundColor, today: one.getAttribute('aria-current') === 'date', marked: !!one.getAttribute('style')?.includes('background') || !!one.dataset.reviews, w: Math.round(r.width), hgt: Math.round(r.height) }
    }))
    const clear = (bg) => bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || /,\s*0\)$/.test(bg)
    const bare = cells.filter((one) => clear(one.bg))
    const empty = cells.filter((one) => !one.today && !one.marked)
    const kinds = [...new Set(empty.map((one) => one.bg))]
    const today = cells.find((one) => one.today)
    const sizes = [...new Set(cells.map((one) => one.w))]
    check(`${view} ${look}: every one of its ${cells.length} days has a cell`, cells.length >= 7 && !bare.length, bare.map((one) => one.day).slice(0, 8).join(', '))
    check(`${view} ${look}: the ${empty.length} empty days all look alike`, kinds.length === 1, kinds.join(' / '))
    check(`${view} ${look}: today is set apart`, !today || today.bg !== kinds[0], `${today?.bg} vs ${kinds[0]}`)
    check(`${view} ${look}: every cell the same width`, sizes.length === 1, sizes.join(', '))
    if (shots) {
      const grid = h.locator('[role=grid]').first()
      await grid.screenshot({ path: `${shots}/${view}-${look}.png` }).catch(() => {})
    }
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
