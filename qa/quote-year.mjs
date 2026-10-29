// A quote's “- who, where, year, page” in quick capture: the page is the
// quote's own Page or place; the year lives in one place, on the source it
// names (Frankenstein's year), or on the quote when it names no source. The
// quote's page shows the year right after who said it, with no gap before ", 1818".
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
  const card = await v('source:card', '', 'Frankenstein')
  check('the year is set on its source, Frankenstein', card?.born === '1818', JSON.stringify(card))
  check('and not kept a second time on the quote', !fields.year, JSON.stringify(fields))
  check('the page is its Page or place', fields.location === 'p. 42', JSON.stringify(fields))
  await c.send('capture', one.id); await h.waitForTimeout(1500)
  const signed = await h.evaluate(() => document.querySelector('[data-signed]')?.textContent ?? '')
  check('its page says who said it, with the year', /Mary Shelley.*1818/.test(signed), signed)
  const gap = await h.evaluate(() => { const name = document.querySelector('[data-signed] .mf-signature'); const year = document.querySelector('[data-signed] [data-signed-year]'); return name && year ? Math.round(year.getBoundingClientRect().left - name.getBoundingClientRect().right) : null })
  check('no gap before ", 1818"', gap !== null && gap <= 1, String(gap))
  const yearProp = await h.evaluate(() => [...document.querySelectorAll('.note-pane *')].some((one) => one.childElementCount === 0 && one.textContent.trim() === 'Year' && one.getClientRects().length))
  check('no empty Year property beside it: the year is the source\'s', !yearProp)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/quote-year.png` })

  // A quote with no source keeps its own year.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('“Less is more” - Mies van der Rohe, 1947', { delay: 8 })
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1800)
  const two = (await page.evaluate(() => window.api.captures.list())).find((it) => (it.label ?? '').includes('Less is more'))
  const own = two ? await h.evaluate((id) => window.api.haligtree('notes:fields', 'captures', id), two.id) : {}
  check('a quote with no source keeps its own year', !two?.medium && own.year === '1947', `${two?.medium} ${JSON.stringify(own)}`)
  await c.send('capture', two.id); await h.waitForTimeout(1500)
  const signed2 = await h.evaluate(() => document.querySelector('[data-signed]')?.textContent ?? '')
  check('and shows it after who said it', /Mies van der Rohe, 1947/.test(signed2), signed2)
} finally {
  await c.close()
}
done()
