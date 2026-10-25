// Two or more filter chips on, one × beside them clears them all; with one
// on, the chip itself takes it off and no × shows.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/clear-filters.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
const chip = (label) => h.locator('[data-filter-chips] button[aria-pressed]', { hasText: label }).first()
const on = () => h.locator('[data-filter-chips] button[aria-pressed="true"]').count()
try {
  for (const page of ['all', 'inbox']) {
    await c.go(page); await h.waitForTimeout(1200)
    await chip('Note').click(); await h.waitForTimeout(300)
    check(`${page}: one chip on, no ×`, (await h.locator('[data-clear-filters]').count()) === 0)
    await chip('Quote').click(); await h.waitForTimeout(300)
    check(`${page}: two on, the × shows`, (await h.locator('[data-clear-filters]').count()) === 1, `${await on()} on`)
    await h.locator('[data-clear-filters]').click(); await h.waitForTimeout(400)
    check(`${page}: the × clears them all`, (await on()) === 0, `${await on()} on`)
  }
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
