// Time gone on Home: off at first; its switch in Settings turns it on, and
// Home shows four bars, today, this week, this month and this year, each
// saying how much has gone, the same figures as the menu bar's.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/time-gone.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// The menu bar's own sums (src/main/goal-days.ts), worked out here the same way.
const through = (unit) => {
  const at = new Date()
  const start = new Date(at)
  start.setHours(0, 0, 0, 0)
  if (unit === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (unit === 'month') start.setDate(1)
  if (unit === 'year') start.setMonth(0, 1)
  const end = new Date(start)
  if (unit === 'day') end.setDate(end.getDate() + 1)
  if (unit === 'week') end.setDate(end.getDate() + 7)
  if (unit === 'month') end.setMonth(end.getMonth() + 1)
  if (unit === 'year') end.setFullYear(end.getFullYear() + 1)
  const share = (at - start) / (end - start)
  return `${share >= 1 ? 100 : Math.min(99, Math.floor(share * 100))}%`
}

const c = await sandbox({ width: 1200, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  check('off at first', (await v('settings')).homeTimeGone === false)
  await go('home')
  check('so Home shows no time gone', await h.locator('[data-time-gone]').count() === 0)
  await go('settings')
  await h.locator('[data-section="Calendar"]').first().click()
  await wait(500)
  const toggle = h.getByRole('switch', { name: 'Show the time gone on Home' })
  await toggle.scrollIntoViewIfNeeded()
  await toggle.click()
  await wait(500)
  check('its switch in Settings turns it on', (await v('settings')).homeTimeGone === true)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    for (const [w, hh] of [[1600, 1000], [900, 700]]) {
      await c.size(w, hh)
      await go('home')
      await wait(800)
      const rows = await h.evaluate(() => [...document.querySelectorAll('[data-time-unit]')].map((one) => [one.dataset.timeUnit, [one.querySelector('[data-time-label]').textContent, one.querySelector('[data-time-said]').dataset.timeSaid]]))
      check(`${theme} ${w}: four bars, day to year`, rows.map(([id]) => id).join() === 'day,week,month,year', JSON.stringify(rows))
      for (const [id, parts] of rows) check(`${theme} ${w}: ${id} says ${through(id)} gone, as the menu bar does`, parts[1] === `${through(id)} gone`, parts.join(' | '))
      const cramped = await h.evaluate(() => [...document.querySelectorAll('[data-time-label], [data-time-said]')].filter((one) => one.getClientRects().length > 1 || one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent))
      check(`${theme} ${w}: no label wraps or is cut`, cramped.length === 0, cramped.join(', '))
      await h.locator('[data-time-gone]').scrollIntoViewIfNeeded()
      await h.screenshot({ path: `${dir}/46b-time-gone-${theme}-${w}.png` })
    }
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
