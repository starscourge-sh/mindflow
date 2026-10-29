// A quote's “- who, where, year, page” in quick capture: the year and the page
// are kept as the quote's own Year and Page or place, not as part of where it
// is from, and the quote's page shows the year after who said it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/quote-year.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { page, h, v } = c
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.keyboard.type('“It is alive, it moved” - Mary Shelley, Frankenstein, 1818, p. 42', { delay: 8 })
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1800)
  const one = (await page.evaluate(() => window.api.captures.list())).find((it) => (it.label ?? '').includes('It is alive'))
  check('the quote is kept', !!one)
  check('who said it is Mary Shelley', one?.attribution === 'Mary Shelley', one?.attribution)
  check('where it is from is Frankenstein alone', one?.medium === 'Frankenstein', one?.medium)
  const fields = one ? await h.evaluate((id) => window.api.haligtree('notes:fields', 'captures', id), one.id) : {}
  check('the year is its Year field', fields.year === '1818', JSON.stringify(fields))
  check('the page is its Page or place', fields.location === 'p. 42', JSON.stringify(fields))
  await c.send('capture', one.id); await h.waitForTimeout(1500)
  const signed = await h.evaluate(() => document.querySelector('[data-signed]')?.textContent ?? '')
  check('its page says who said it, with the year', /Mary Shelley.*1818/.test(signed), signed)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/quote-year.png` })
} finally {
  await c.close()
}
done()
