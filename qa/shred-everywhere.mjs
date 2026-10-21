// Moving to the Bin by pointer shreds the row wherever it is binned from, in
// the main window as in quick capture: a note in Everything, a task on Today,
// an article in Writing. By a key it simply goes.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/shred-everywhere.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const watch = () => h.evaluate(() => {
  window.__strips = 0
  new MutationObserver((changes) => { for (const one of changes) for (const node of one.addedNodes) if (node instanceof HTMLElement && node.style.zIndex === '60' && node.style.position === 'fixed') window.__strips++ }).observe(document.body, { childList: true })
})
async function binFrom(page, name, byKey = false) {
  await c.go(page); await wait(1200)
  const row = h.locator('[data-row][data-id]').first()
  await row.scrollIntoViewIfNeeded()
  await watch()
  if (byKey) { await row.click(); await wait(300); await h.keyboard.press('Backspace') }
  else { await row.click({ button: 'right' }); await wait(400); await h.locator('[role="menuitem"]', { hasText: 'Move to the Bin' }).first().click() }
  await wait(900)
  return h.evaluate(() => window.__strips)
}
try {
  await v('settings:set', { motion: true, sounds: false, hintRate: 0 })
  for (const [page, name] of [['everything', 'Everything'], ['today', 'Today'], ['articles', 'Writing']]) {
    const strips = await binFrom(page, name)
    check(`${name}: "Move to the Bin" from the menu shreds the row`, strips >= 8, `${strips} strips`)
  }
  const keyed = await binFrom('everything', 'Everything', true)
  check('by ⌫ it simply goes, with no shred', keyed === 0, `${keyed} strips`)
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
