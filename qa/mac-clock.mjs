// Times follow the Mac's clock: run as a 12-hour Mac (MINDFLOW_QA_CLOCK=12),
// each window is told so by its preload and Today's line by the hour says a
// running session as "2:00 PM to 2:25 PM"; as a 24-hour Mac, "14:00 to 14:25".
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/mac-clock.mjs
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 240)})` : ''}`) }
const base = process.env.QA_DATA

for (const [hours, want] of [['12', '2:00 PM to 2:25 PM'], ['24', '14:00 to 14:25']]) {
  process.env.MINDFLOW_QA_CLOCK = hours
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
    await c.v('session:abandon', id)
    check(`${hours}-hour Mac: no page errors`, c.errors.length === 0, c.errors.join(' | '))
  } catch (error) {
    console.log('FAIL  the probe threw: ' + (error?.stack ?? error))
    results.push(false)
  } finally {
    await c.close()
    rmSync(process.env.QA_DATA, { recursive: true, force: true })
  }
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
