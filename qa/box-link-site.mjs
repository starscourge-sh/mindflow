// A link in quick capture fills "Site" as soon as it is read, not only on
// Create: en.wikipedia.org shows "Wikipedia" in the field, a hand-typed site
// is kept, and taking the link out empties the guess again.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-link-site.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 700 })
const { page, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
// The where field: "Site" on a link, "Where from" once words make it a note.
const site = () => page.evaluate(() => [...document.querySelectorAll('input')].find((i) => /^(Site|Where)/.test(i.placeholder))?.value ?? null)
try {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  await page.locator('.haligtree-editor[contenteditable=true]').first().click()
  await electron.evaluate(({ clipboard }) => clipboard.writeText('https://en.wikipedia.org/wiki/Deal_with_the_Devil'))
  await page.keyboard.press('Meta+v')
  await page.waitForFunction(() => document.querySelector('input[placeholder="Site"]')?.value, null, { timeout: 8000 }).catch(() => {})
  check('a pasted Wikipedia link fills Site with "Wikipedia" before Create', (await site()) === 'Wikipedia', String(await site()))
  await page.locator('input[placeholder="Site"]').fill('My reading list')
  await page.locator('.haligtree-editor[contenteditable=true]').first().click()
  await page.keyboard.type(' ok', { delay: 20 }); await page.waitForTimeout(900)
  check('a site typed by hand is kept', (await site()) === 'My reading list', String(await site()))
  await page.locator('input[placeholder^="Site"], input[placeholder^="Where"]').first().fill('')
  await page.locator('.haligtree-editor[contenteditable=true]').first().click()
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(300)
  await electron.evaluate(({ clipboard }) => clipboard.writeText('https://github.com/tolkien/notes'))
  await page.keyboard.press('Meta+v')
  await page.waitForFunction(() => document.querySelector('input[placeholder="Site"]')?.value, null, { timeout: 8000 }).catch(() => {})
  check('github.com reads as "GitHub"', (await site()) === 'GitHub', String(await site()))
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(1200)
  check('emptied, the guess goes with the link', !(await site()), String(await site()))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
