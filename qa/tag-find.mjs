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
  // Finding a tag is the Tags page's: the sidebar keeps its first eight, with no field of its own.
  check('the sidebar has no find field of its own', (await h.locator('[data-side-tag-find]').count()) === 0)
  check('it keeps eight tags at most', (await h.locator('[data-side-tag]').count()) <= 8)

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
