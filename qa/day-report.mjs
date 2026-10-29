// Today's page is "The Thursday Report", with the day of the year in its line ("Day 302"), counting down as "T-minus 3" in December.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-dr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/day-report.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, errors, close, go, v } = c
const read = () => h.evaluate(() => ({ title: document.querySelector('h2 span')?.textContent ?? '', line: document.querySelector('[data-today-line]')?.textContent ?? '', count: document.querySelector('[data-day-count]')?.textContent ?? '' }))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const now = new Date()
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const start = new Date(now.getFullYear(), 0, 1)
  const day = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86_400_000) + 1
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await go('day'); await h.waitForTimeout(1800)
    const got = await read()
    check(`${theme}: the title is “The ${weekday} Report”`, got.title === `The ${weekday} Report`, got.title)
    check(`${theme}: the line says the day of the year`, now.getMonth() === 11 ? /^T-minus \d+$/.test(got.count) : got.count === `Day ${day}`, got.line)
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `day-report-${theme}.png`), clip: { x: 0, y: 0, width: 1400, height: 520 } })
  }
  check('“Brief” is said nowhere on the page', !(await h.evaluate(() => /\bBrief\b/.test(document.body.innerText))))
  // 29 December: three days to the new year, counted down.
  const to = new Date(now.getFullYear(), 11, 29, 10, 0)
  await h.evaluate(([code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), to - now])
  await go('home'); await go('day'); await h.waitForTimeout(1500)
  const dec = await read()
  check('in December it counts down: “T-minus 3”', dec.count === 'T-minus 3', dec.line)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'day-report-december.png'), clip: { x: 0, y: 0, width: 1400, height: 520 } })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
