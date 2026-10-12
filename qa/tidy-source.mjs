// Tidy lets a quote's source be put right: "Who said it" and "Where from"
// sit under the tags, filled with what it has, and what you type is saved.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/tidy-source.mjs [shot.png]
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
try {
  await v('settings:set', { hintRate: 0 })
  const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The unexamined life is not worth living.' }] }] }
  const id = await h.evaluate((b) => window.api.captures.create({ kind: 'quote', body: b, attribution: 'Socrates' }), body)
  await h.evaluate((one) => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: 'tidy', ids: [one] } })), id)
  await h.waitForTimeout(900)
  const who = h.locator('[data-pass] input[placeholder="Who said it"]')
  const where = h.locator('[data-pass] input[placeholder="Where from"]')
  check('Tidy shows "Who said it" on a quote', await who.count() === 1)
  check('Tidy shows "Where from" on a quote', await where.count() === 1)
  check('it holds the quote\'s own source', (await who.inputValue().catch(() => '')) === 'Socrates', await who.inputValue().catch(() => ''))
  await who.fill('Socrates, via Plato')
  await where.fill('The Apology')
  await h.waitForTimeout(500)
  const saved = await h.evaluate((one) => window.api.captures.get(one), id)
  check('what you type is saved', saved?.attribution === 'Socrates, via Plato' && saved?.medium === 'The Apology', `${saved?.attribution} / ${saved?.medium}`)
  if (process.argv[2]) await h.screenshot({ path: process.argv[2] })
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
