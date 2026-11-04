// A task made from a note offers that note in its right-click menu (the
// tracker: "so how do i edit that attached file here?"): "Open “raycast
// notes”", and choosing it opens the note, ready to change.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/task-from-note.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)

const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', title: 'raycast notes', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'raycast notes' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'What the launcher should do.' }] }] } }))
await v('task:add', 'analyse claude usage on fc today', note, true)
await go('today')
await wait(1200)
const row = h.locator('[data-row], [role="option"], li').filter({ hasText: 'analyse claude usage on fc' }).first()
await row.click({ button: 'right' })
await wait(500)
const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
const line = lines.find((one) => /^Open “raycast notes”/.test(one))
check('the task\'s menu offers "Open “raycast notes”", the note it came from', !!line, lines.join(' / '))
if (line) {
  await h.getByRole('menuitem', { name: /Open “raycast notes”/ }).click()
  await wait(1500)
  const open = await h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].some((one) => one.isContentEditable && one.textContent.includes('What the launcher should do.')))
  check('choosing it opens the note, to change', open)
}

console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
