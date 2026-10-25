// A long tag list can be searched, in the sidebar and on the Tags page: the
// field shows past 12 tags, typing narrows (inside words, across hyphens),
// ↑↓ and ↵ open one, Esc clears.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tag-find.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const filler = [...'abcdefghijklmn'].map((one) => `#filler-${one}`).join(' ')
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(`many tags ${filler}`))
  for (let i = 0; i < 3; i++) await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('a joke #programming-humour'))
  const shownIn = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: [...new Set([...shownIn, 'tags'])] })
  await h.reload(); await wait(2500)
  const unfold = h.getByRole('button', { name: 'Show your tags' }).first()
  if (await unfold.isVisible().catch(() => false)) (await unfold.click(), await wait(700))
  const field = h.locator('[data-side-tag-find] input')
  check('the sidebar has a find field past 12 tags', await field.isVisible())
  const side = () => h.evaluate(() => [...document.querySelectorAll('[data-side-tag]')].map((one) => one.dataset.sideTag))
  await field.fill('ammingHum'); await wait(300)
  check('typing narrows, inside words and across the hyphen', JSON.stringify(await side()) === '["programming-humour"]', JSON.stringify(await side()))
  await field.fill('filler'); await wait(300)
  const many = await side()
  check('at most eight at once', many.length === 8, String(many.length))
  await field.press('ArrowDown'); await field.press('ArrowDown'); await wait(200)
  const marked = await h.evaluate(() => document.querySelector('[data-side-tag][data-cursor]')?.dataset.sideTag)
  check('↓ moves the mark down the list', marked === many[2], `${marked} / ${many[2]}`)
  await field.press('ArrowUp'); await field.press('Enter'); await wait(1200)
  const open = await h.evaluate(() => document.querySelector('[data-side-tag][aria-current="page"]')?.dataset.sideTag)
  check('↵ opens the marked tag', open === many[1], `${open} / ${many[1]}`)
  await field.focus(); await field.press('Escape'); await wait(300)
  check('Esc clears the field', (await field.inputValue()) === '' && (await side()).length === 8)

  // The Tags page.
  await go('tags'); await wait(900)
  const page = h.locator('[data-tags-find] input')
  check('the Tags page has a find field', await page.isVisible())
  await page.fill('humour'); await wait(300)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].map((one) => one.textContent.trim()))
  check('typing narrows the page', rows.length === 1 && rows[0].startsWith('programming-humour'), JSON.stringify(rows))
  await page.press('Enter'); await wait(1200)
  const header = await h.evaluate(() => document.body.innerText.includes('#programming-humour') || !!document.querySelector('[data-row].bg-accent'))
  check('↵ opens it', header)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
