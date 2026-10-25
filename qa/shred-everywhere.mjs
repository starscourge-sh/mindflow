// Moving to the Bin by pointer shreds the row wherever it is binned from, in
// the main window as in quick capture: a note in Everything, a task on Today,
// an article in Writing. By a key it simply goes.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/shred-everywhere.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const watch = () => h.evaluate(() => {
  window.__strips = 0
  window.__rows = new Set()
  // One watcher for the whole run: each page's count starts again from nought.
  if (!window.__watching) (window.__watching = true, new MutationObserver((changes) => { for (const one of changes) for (const node of one.addedNodes) if (node instanceof HTMLElement && node.style.zIndex === '60' && node.style.position === 'fixed') (window.__strips++, window.__rows.add(node.style.top)) }).observe(document.body, { childList: true }))
})
async function binFrom(page, name, byKey = false) {
  await c.go(page); await wait(1200)
  const row = h.locator('[data-row][data-id]').first()
  const id = await row.getAttribute('data-id')
  await row.scrollIntoViewIfNeeded()
  await watch()
  if (byKey) { await row.click(); await wait(300); await h.keyboard.press('Backspace') }
  else { await row.click({ button: 'right' }); await wait(400); await h.locator('[role="menuitem"]', { hasText: 'Move to the Bin' }).first().click() }
  await wait(900)
  const gone = await h.locator(`[data-row][data-id="${id}"]`).count() === 0
  return h.evaluate((gone) => `${gone ? 'gone' : 'STILL THERE'}, ${window.__strips} strips from ${window.__rows.size} row(s)`, gone)
}
try {
  await v('settings:set', { motion: true, sounds: false, hintRate: 0 })
  for (const [page, name] of [['all', 'Everything'], ['today', 'Today'], ['articles', 'Writing']]) {
    const said = await binFrom(page, name)
    check(`${name}: "Move to the Bin" from the menu shreds the row`, /^gone, \d+ strips from 1 row/.test(said) && parseInt(said.split(", ")[1]) >= 8, said)
  }
  const keyed = await binFrom('all', 'Everything', true)
  check('by ⌫ it simply goes, with no shred', keyed.startsWith('gone, 0 strips'), keyed)
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
