// Quick capture's Inbox offers a chip only for what it can show. A task caught in the box leaves the Inbox for Tasks at
// once, yet the Inbox built its chips from the captures that had left it too: "Task" was always there and always
// showed "0 shown", and once picked it stayed picked with nothing to unpick (note 81d0c7a2).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/inbox-task-chip.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1300, height: 800, at: CALM_HOUR })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const seen = () => page.evaluate(() => ({
  chips: [...document.querySelectorAll('[data-box-panel] [data-filter-chips] button, [data-box-panel] [data-filter-chips] [data-chip-split]')].map((el) => el.textContent.trim()).filter(Boolean),
  rows: document.querySelectorAll('[data-box-panel] [data-capture-row], [data-box-panel] [data-row-id], [data-box-panel] [role=option]').length,
  nothing: /Nothing matches|0 shown/.test(document.querySelector('[data-box-panel]')?.textContent ?? '')
}))
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  await page.evaluate(() => localStorage.setItem('boxPanel', 'open'))
  await page.reload(); await wait(1500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  // A task taken in the box: it goes to Tasks, its capture leaves the Inbox.
  await page.click(EDITOR); await page.keyboard.type('ring the plumber tomorrow at 5pm'); await wait(500)
  await page.keyboard.press('Meta+Enter'); await wait(1500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1000)
  const before = await seen()
  check('the Inbox has no Task chip (no task ever reaches it)', !before.chips.some((one) => /^Task\b/.test(one)), JSON.stringify(before))
  // Task picked before (in an older build, or by hand): nothing hidden by it.
  await page.evaluate(() => { const key = 'view:prompt:captures'; const was = JSON.parse(localStorage.getItem(key) ?? '{}'); localStorage.setItem(key, JSON.stringify({ ...was, filter: { ...(was.filter ?? {}), status: ['open'], kind: ['task'] } })) })
  await page.reload(); await wait(1500); await page.evaluate(() => window.api.showPrompt()); await wait(1000)
  const picked = await seen()
  check('a Task picked before hides nothing: the Inbox still lists its captures', !picked.nothing, JSON.stringify(picked))
} catch (error) { check('ran', false, error.message) }
await c.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(0)
