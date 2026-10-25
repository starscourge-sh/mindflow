// Times follow the Mac's clock: run as a 12-hour Mac (HALIGTREE_QA_CLOCK=12),
// each window is told so by its preload and Today's line by the hour says a
// running session as "2:00 PM to 2:25 PM"; as a 24-hour Mac, "14:00 to 14:25".
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-clock.mjs
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const base = process.env.QA_DATA

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))
for (const [hours, want, from] of [['12', '2:00 PM to 2:25 PM', '2:00 PM'], ['24', '14:00 to 14:25', '14:00']]) {
  process.env.HALIGTREE_QA_CLOCK = hours
  // A fresh data folder each run (inside the one given, if any).
  process.env.QA_DATA = mkdtempSync(join(base ?? tmpdir(), `clock-${hours}-`))
  const c = await sandbox({ width: 1100, height: 800, at: '14:00' })
  try {
    check(`${hours}-hour Mac: the window is told`, (await c.h.evaluate(() => window.api.twelveHour)) === (hours === '12'))
    await c.v('settings:set', { sounds: false, countIn: false })
    const task = (await c.v('tasks')).find((one) => one.status === 'open' && one.title)
    const id = await c.v('session:start', task.id, 'Draft the essay', 25 * 60000)
    await c.go('day')
    await c.h.waitForTimeout(1500)
    const text = await c.h.locator(`[data-line-session="${id}"] [data-session-block]`).innerText().catch(() => '')
    check(`${hours}-hour Mac: Today says “${want}”`, text.replace(/\s+/g, ' ').includes(want), text.replace(/\s+/g, ' '))
    const column = await c.h.locator(`[data-line-session="${id}"] > span`).first().evaluate((one) => ({ text: one.textContent, lines: Math.round(one.getBoundingClientRect().height / parseFloat(getComputedStyle(one).lineHeight)) })).catch(() => null)
    check(`${hours}-hour Mac: the time on the left fits on one line`, column?.text === from && column.lines === 1, JSON.stringify(column))
    await c.go('week')
    await c.h.waitForTimeout(1500)
    const chip = await c.h.locator(`[data-week-session="${id}"]`).innerText().catch(() => '')
    check(`${hours}-hour Mac: the week says it the same way`, chip.replace(/\s+/g, ' ').includes(want), chip)
    const pill = c.electron.windows().find((one) => one.url().includes('view=focus'))
    await c.h.evaluate(() => window.api.showFocus(true))
    for (let i = 0; i < 20 && !c.electron.windows().find((one) => one.url().includes('view=focus')); i++) await wait(200)
    const bubble = pill ?? c.electron.windows().find((one) => one.url().includes('view=focus'))
    await bubble?.waitForTimeout(2500)
    await bubble?.hover('[data-island]', { position: { x: 160, y: 10 } }).catch(() => {})
    await bubble?.waitForTimeout(900)
    const span = await bubble?.locator('[data-span-pill]').first().innerText().catch(() => '')
    check(`${hours}-hour Mac: the bubble says it the same way`, (span ?? '').startsWith(`${from} →`), span)
    await c.v('session:abandon', id)
    check(`${hours}-hour Mac: no page errors`, c.errors.length === 0, c.errors.join(' | '))
  } catch (error) {
    check('ran to the end', false, error?.stack ?? error)
  } finally {
    await c.close()
    rmSync(process.env.QA_DATA, { recursive: true, force: true })
  }
}
done()
