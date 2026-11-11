// The Calendar's month: every day's date has room above it (6px from the cell's top line), and a busy day shows only
// whole lines, then "+N more", never a line cut in half behind it (10 Nov: "no padding on the top?", and "schedule"
// half-hidden under "+2 more"). Checked at the usual interface size and a larger one.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/month-cells-fit.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1800, height: 1100 })
const { h, v } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
try {
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
  for (let i = 1; i <= 14; i++) await v('task:add', `Month probe task ${i} tomorrow`)
  for (const size of [100, 115]) {
    await v('settings:set', { interfaceSize: size }); await h.waitForTimeout(600)
    await c.go('calendar'); await h.waitForTimeout(1200)
    await h.keyboard.press('m').catch(() => {}); await h.waitForTimeout(1200)
    const look = await h.evaluate(() => [...document.querySelectorAll('[data-day]')].map((cell) => {
      const box = cell.getBoundingClientRect()
      const num = cell.querySelector('[data-day-number]')?.getBoundingClientRect()
      const rows = [...cell.querySelectorAll('.h-5')].filter((row) => row.getClientRects().length).map((row) => row.getBoundingClientRect())
      return { day: cell.dataset.day, top: num ? Math.round(num.top - box.top) : null, cut: rows.filter((r) => r.bottom > box.bottom + 0.5).length, rows: rows.length, more: !!cell.querySelector('[data-plan-more], [data-plan-more-events]') }
    }))
    const tight = look.filter((one) => one.top !== null && one.top < 6)
    const cut = look.filter((one) => one.cut)
    check(`${size}%: every date sits 6px or more below its cell's top`, !tight.length && look.length > 27, JSON.stringify(tight.slice(0, 3)))
    check(`${size}%: no line in any day is cut off`, !cut.length, JSON.stringify(cut.slice(0, 3)))
    const busy = look.reduce((a, b) => (b.rows > a.rows ? b : a), look[0])
    // Home's six weeks give a busy week more room; the Calendar's run of weeks (11 Nov) keeps every week the same height, so a
    // busy day there shows the whole lines that fit and "+N more" for the rest, never fewer than one line.
    const run = await h.evaluate(() => !!document.querySelector('[data-month-run]'))
    check(`${size}%: the busy day still lists lines`, run ? busy.rows >= 2 && busy.more : busy.rows >= 3, JSON.stringify(busy))
    if (process.env.SHOT) await c.both(`${process.env.SHOT}-${size}`)
  }
} catch (error) { check('the run finished', false, error.message.split('\n')[0]) }
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(ok ? 0 : 1)
