// Writing whose only notes are in one group, folded: every view shows the
// group, never "No writing yet" (List, Compact, with a note open beside it,
// and the grids). A fresh book, not the sandbox.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/group-only.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const state = () => h.evaluate(() => ({ empty: /No writing yet/.test(document.body.innerText), group: /Group 1/.test(document.body.innerText) }))
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  const a = await v('article:new'); await v('item:save', a, { title: 'Last Chance' })
  const b = await v('article:new'); await v('item:save', b, { title: 'Nero, a reading note' })
  await v('groups:arrange', 'article', { top: ['g:g1'], groups: { g1: [a, b] }, revive: [{ id: 'g1', name: 'Group 1', icon: null, color: null, folded: 1 }] })
  for (const density of ['list', 'compact', 'small', 'grid']) {
    await h.evaluate((d) => localStorage.setItem('view:article', JSON.stringify({ sort: 'created', group: 'none', filter: {}, density: d })), density)
    await h.reload(); await wait(1800)
    await c.go('articles'); await wait(1000)
    const now = await state()
    check(`${density}: the folded group shows, not "No writing yet"`, now.group && !now.empty, JSON.stringify(now))
  }
  // A note open beside the list: the list still shows the group.
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'created', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await wait(1800)
  await c.size(1300, 900); await c.go('articles'); await wait(900)
  await c.send('article', a); await wait(1500)
  if (process.env.SHOT) await h.screenshot({ path: process.env.SHOT })
  const beside = await state()
  check('with a note open, the list beside it shows the group', beside.group && !beside.empty, JSON.stringify(beside))
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
