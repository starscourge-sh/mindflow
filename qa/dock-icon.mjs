// Quick capture steps out of the Dock while it is up (so AeroSpace leaves it
// where you are); back in the Dock, macOS shows the bundle's own icon, so
// Vigil's chosen icon is put on again each time.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/dock-icon.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1000, height: 700 })
const { page, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
try {
  await electron.evaluate(({ app }) => {
    globalThis.__icons = []
    const set = app.dock.setIcon.bind(app.dock)
    app.dock.setIcon = (image) => (globalThis.__icons.push(String(image)), set(image))
  })
  for (let round = 0; round < 2; round++) {
    await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
    await page.evaluate(() => window.api.hideWindow()); await page.waitForTimeout(700)
  }
  const icons = await electron.evaluate(() => globalThis.__icons)
  check('each time quick capture goes, the Dock gets Vigil\'s icon again', icons.length >= 2 && icons.every((one) => /icon-(lights|gold-lights|bronze|gold)/.test(one)), icons.map((one) => one.split('/').pop()).join(', '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
