// Settings, Colours: “App icon” offers Leaves and Gold leaves only, each shown as itself;
// Leaves is chosen to start, a click on Gold leaves keeps it and changes the Dock's icon without an error,
// and someone left on an old lamp icon (Lights, Gold lights) is moved to the leaves of the same colour.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/app-icon.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 800 })
const { h, v, send, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const errors = []
electron.process().stderr?.on('data', (d) => /Error|error:/.test(String(d)) && errors.push(String(d).slice(0, 200)))
try {
  send('view', 'settings'); await h.waitForTimeout(1500)
  const row = h.locator('[role=radiogroup][aria-label="App icon"]')
  await row.scrollIntoViewIfNeeded()
  const shown = await row.evaluate((el) => [...el.querySelectorAll('[role=radio]')].map((b) => ({ label: b.getAttribute('aria-label'), on: b.getAttribute('aria-checked'), img: b.querySelector('img')?.naturalWidth })))
  check('only Leaves and Gold leaves are offered, each with its picture', shown.length === 2 && shown.map((one) => one.label).join() === 'Leaves,Gold leaves' && shown.every((one) => one.img > 0), JSON.stringify(shown))
  check('Leaves is chosen to start', shown[0]?.on === 'true')
  await row.locator('[aria-label="Gold leaves"]').click(); await h.waitForTimeout(600)
  check('a click on Gold leaves keeps it', (await v('settings')).appIcon === 'gold')
  await v('settings:set', { appIcon: 'gold-lights' }); await h.waitForTimeout(300)
  check('an old Gold lights choice reads as Gold leaves', (await v('settings')).appIcon === 'gold')
  await v('settings:set', { appIcon: 'lights' }); await h.waitForTimeout(300)
  check('an old Lights choice reads as Leaves', (await v('settings')).appIcon === 'bronze')
  const fits = await row.evaluate((el) => { const box = el.getBoundingClientRect(); return [...el.querySelectorAll('[role=radio]')].every((b) => b.getBoundingClientRect().right <= box.right + 1 && b.getBoundingClientRect().right <= innerWidth) })
  check('both fit on their row', fits)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? process.env.QA_DATA}/app-icon.png` })
  check('the Dock takes it without an error', !errors.length, errors.join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
