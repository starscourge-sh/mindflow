// The sidebar says "Tags" once: with tags to list, the heading over them opens
// the Tags page and its chevron folds the list, and the Tags page's own row is
// not listed a second time, even when switched on.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-tags.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 900 })
const { h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
try {
  const shown = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: [...new Set([...shown, 'tags'])] })
  await h.waitForTimeout(1200)
  const says = () => h.evaluate(() => [...document.querySelectorAll('nav ~ * button, nav button, aside button')].filter((b) => b.textContent.trim() === 'Tags' && b.offsetParent).length)
  check('"Tags" is in the sidebar once, with the Tags page switched on', (await says()) === 1, String(await says()))
  // The heading folds; the arrow at its end, on pointing, opens the Tags page.
  await h.hover('[data-tags-fold]'); await h.click('[data-tags-page]'); await h.waitForTimeout(800)
  check('the arrow on the heading opens the Tags page', await h.evaluate(() => document.querySelector('[aria-current=page]')?.textContent.trim() === 'Tags'))
  const before = await h.evaluate(() => document.querySelectorAll('[data-side-row]').length)
  const fold = h.getByRole('button', { name: /Fold the tags away|Show your tags/ }).first()
  await fold.click(); await h.waitForTimeout(700)
  const after = await h.evaluate(() => document.querySelectorAll('[data-side-row]').length)
  check('the chevron folds the list of tags', after !== before, `${before} → ${after}`)
  await fold.click(); await h.waitForTimeout(400)
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
