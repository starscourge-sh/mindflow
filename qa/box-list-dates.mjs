// A Task written as a list, each line with its own day: under the box, every
// line's date is lit, not only the first, and "This will" never says the
// first line's day as if it were all of them. A date kept as plain text on
// one line is kept on that line only, and Create gives each task its own day.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-ld/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-list-dates.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const will = () => page.evaluate(() => document.querySelector('[data-will-do]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
const dates = (line) => page.evaluate(([s, n]) => [...document.querySelectorAll(`${s} > *`)].filter((one) => one.textContent.trim())[n]?.querySelectorAll('.box-token[data-box-token="date"]').length ?? 0, [EDITOR, line])
const named = async (title) => (await v('tasks')).find((one) => one.title === title && one.status === 'open')
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null)
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.waitForTimeout(200)
}
const lines = async (all) => {
  for (const [at, line] of all.entries()) {
    await page.keyboard.type(line, { delay: 5 })
    if (at < all.length - 1) await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(900)
}
// Today, tomorrow and the coming Friday, as the app reads them.
const at = (add) => { const d = new Date(); d.setDate(d.getDate() + add); return d.toLocaleDateString('en-CA') }
const friday = at(((5 - new Date().getDay() + 7) % 7) || 7)

try {
  await fresh()
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(300)
  await lines(['zz a today', 'zz b tomorrow', 'zz c friday'])
  const counts = [await dates(0), await dates(1), await dates(2)]
  check('each line shows its own date token', counts.every((n) => n === 1), JSON.stringify(counts))
  const said = await will()
  check('"This will" does not say "For today" alone', !/For today(?! to)/.test(said) && /Each on its own day/.test(said), said)

  // The second line's date kept as plain text, by a click on it, for that line only.
  await page.locator(`${EDITOR} .box-token[data-box-token="date"]`).nth(1).click()
  await page.waitForTimeout(500)
  const after = [await dates(0), await dates(1), await dates(2)]
  check('the click keeps only that line’s date plain', JSON.stringify(after) === '[1,0,1]', JSON.stringify(after))
  check('and "This will" says one has no day', /1 with no day/.test(await will()), await will())
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(2000)
  const [a, b, cc] = [await named('zz a'), await named('zz b tomorrow'), await named('zz c')]
  check('the first task is for today', day(a?.dueAt) === at(0), `${a?.title} ${a?.dueAt}`)
  check('the second has no date and keeps “tomorrow” in its name', !!b && !b.dueAt, JSON.stringify(b && { title: b.title, due: b.dueAt }))
  check('the third is for Friday', day(cc?.dueAt) === friday, `${cc?.title} ${cc?.dueAt} want ${friday}`)

  // Eight lines, all today: one day, said as one.
  await fresh()
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(300)
  await lines(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((word) => `zz ${word} today`))
  const eight = await page.locator(`${EDITOR} .box-token[data-box-token="date"]`).count()
  check('all eight lines show a date token', eight === 8, String(eight))
  const same = await will()
  check('"This will" says "For today", with no lines left without a day', /For today/.test(same) && !/no day|own day/.test(same), same)
  // Its × keeps every line's "today" plain.
  await page.locator('[data-will="date"] [data-will-off]').click()
  await page.waitForTimeout(500)
  check('the × keeps every line’s date plain', (await page.locator(`${EDITOR} .box-token[data-box-token="date"]`).count()) === 0)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
