// Quick capture is for getting a thought down: on a deciding day its notice
// is one short line, says "Bin" (never "let go of"), does not repeat its own
// name under itself, and steps aside the moment you start typing (back when
// the box is empty again). A quote's source is said once, in its Who and
// Where fields, not again under "This will".
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-deciding.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const c = await sandbox({ width: 1000, height: 700 })
const { h, page, v } = c
// The notice comes once a day (haligtree.ts, nudge), and the box opening at launch may already have had today's:
// the app's clock goes to tomorrow at noon, a fresh day and out of quiet hours (22:00 to 07:00), when nothing is offered unasked.
const noon = new Date()
noon.setDate(noon.getDate() + 1)
noon.setHours(12, 0, 0, 0)
await c.electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), noon.getTime() - Date.now()])
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false })
  // Today is the deciding day, and something waits to be decided.
  // The sandbox's exam falling behind is a nudge too, and comes first: off, so deciding day is the one said.
  await v('settings:set', { weeklyReview: true, weeklyDay: noon.getDay(), examNudges: false })
  // Put away first: the notice is asked for as the box comes up, and a box already up never comes up again.
  await h.evaluate(() => window.api.hidePrompt())
  await page.waitForTimeout(800)
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(3500)
  const card = async () => ((await page.locator('text=waits for a keep or the Bin').isVisible().catch(() => false)) ? true : null)
  const shown = await card()
  check('on the deciding day, the empty box shows the notice', !!shown)
  if (shown) {
    const text = await page.evaluate(() => [...document.querySelectorAll('[data-chrome] button')].find((one) => one.textContent === 'Decide now')?.closest('.rounded-lg')?.textContent ?? '')
    check('the notice is one short line that says "Bin", never "let go of"', /Bin/.test(text) && !/let go/i.test(text) && text.split(/\s+/).length <= 18, text)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/deciding-empty.png` })
    const times = await page.evaluate(() => (document.body.innerText.match(/Deciding day/g) ?? []).length)
    check('"Deciding day" is not said twice on the notice', times <= 2, `${times} on screen, the side panel's tab included`)
    await page.click(EDITOR)
    await page.keyboard.type('A thought worth keeping', { delay: 10 })
    // Within a moment of the first words (the box reads its words a beat after a key).
    let gone = false
    for (let i = 0; i < 20 && !gone; i++) (gone = !(await card())) || (await page.waitForTimeout(100))
    check('typing puts the notice aside: nothing sits between the words and Create', gone)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/deciding-typing.png` })
    await page.keyboard.press('Meta+A')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(2500)
    check('an empty box shows it again', !!(await card()))
  }
  // A quote's source: once, in its fields.
  await page.click(EDITOR)
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('"The unexamined life is not worth living." - Socrates, Apology', { delay: 5 })
  await page.waitForTimeout(800)
  const said = await page.evaluate(() => ({ will: document.querySelector('[data-will-do]')?.textContent ?? '', signature: !!document.querySelector('[data-will="signature"]'), fields: [...document.querySelectorAll('input')].map((one) => one.value).join('|') }))
  check('the quote\'s source is in its fields, and not again under "This will"', !said.signature && !/Said by/.test(said.will) && /Socrates/.test(said.fields), JSON.stringify(said))
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quote.png` })
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
process.exit(failed ? 1 : 0)
