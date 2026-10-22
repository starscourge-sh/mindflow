// The sidebar's foot menu has one "Import" line, opening on Apple Notes,
// Obsidian or Notion, and highlights and files: not two bare lines at the top.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/import-menu.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
try {
  await c.go('home'); await h.waitForTimeout(900)
  await h.locator('button[aria-label$=" menu"]').last().click(); await h.waitForTimeout(500)
  const top = await h.locator('[role="menu"]').first().locator('[role="menuitem"], [role="menuitemcheckbox"]').allInnerTexts()
  check('one "Import" line at the top level', top.filter((one) => /^Import/.test(one.trim())).length === 1 && top.some((one) => one.trim().startsWith('Import')), top.join(' | '))
  await h.locator('[role="menuitem"]', { hasText: /^Import/ }).first().hover(); await h.waitForTimeout(600)
  check('no card beside the menu covers the submenu', !(await h.evaluate(() => /bring your notes in from/.test(document.body.innerText))))
  const inside = await h.locator('[role="menu"]').nth(1).locator('[role="menuitem"]').allInnerTexts()
  check('opening on the three ways in', ['Apple Notes', 'Obsidian or Notion', 'highlights and files'].every((one) => inside.some((line) => line.includes(one))), inside.join(' | '))
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
