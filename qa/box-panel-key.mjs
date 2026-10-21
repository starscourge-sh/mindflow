// ⌘\ shows and hides quick capture's side panel, with the caret in the note
// and with it in the panel's list.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/box-panel-key.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 800 })
const { page } = c
const wait = (ms) => page.waitForTimeout(ms)
const panel = () => page.evaluate(() => !!document.querySelector('[data-home="inbox"], [data-home="task"]'))
try {
  await c.v('settings:set', { hintRate: 0 })
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  const start = await panel()
  await page.locator('.ProseMirror').first().click(); await wait(200)
  await page.keyboard.press('Meta+Backslash'); await wait(500)
  const one = await panel()
  check('⌘\\ with the caret in the note toggles the panel', one !== start, `${start} -> ${one}`)
  await page.keyboard.press('Meta+Backslash'); await wait(500)
  check('and again brings it back', (await panel()) === start)
  await page.keyboard.type('a few words'); await wait(200)
  await page.keyboard.press('Meta+Backslash'); await wait(500)
  check('with words written, it still toggles', (await panel()) !== start)
  await page.keyboard.press('Meta+Backslash'); await wait(400)
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
