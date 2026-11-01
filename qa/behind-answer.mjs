// "Behind the answer": a gem's Context and Why are one field. A gem with only
// a Why shows the Why there; one with both shows the context, a blank line,
// then the why. Saved, it all goes into `context` and only then is `why`
// cleared, so nothing is lost. Review shows the one "Behind the answer" after
// the answer, and Learn after a card is answered.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/behind-answer.mjs [shots-folder]
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const shots = process.argv[2]

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const gem = async (words, prompt) => {
  const id = await v('nugget:from', words, {})
  await v('item:save', id, { title: prompt, prompt })
  return id
}
const openGem = async (id) => {
  await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  await send('nugget', id); await wait(1500)
  const head = h.locator('[data-details-group="Behind the answer"]:not([data-open]) button[aria-expanded]')
  if (await head.count()) { await head.first().click(); await wait(400) }
}
const field = () => h.locator('textarea[aria-label="Behind the answer"]:visible')
const groups = () => h.evaluate(() => [...document.querySelectorAll('[data-details-group]')].map((one) => one.dataset.detailsGroup))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { newsSeen: true, pageHints: false })
  const whyOnly = await gem('Water boils at 100 C at sea level.', 'When does water boil?')
  await v('item:save', whyOnly, { why: 'Air pressure holds the molecules in' })
  const bothFilled = await gem('The Rosetta Stone was found in 1799.', 'When was the Rosetta Stone found?')
  await v('item:save', bothFilled, { context: 'French soldiers in Egypt', why: 'Napoleon brought scholars along' })

  // One island, never two.
  await openGem(whyOnly)
  const names = await groups()
  check('one "Behind the answer" island', names.includes('Behind the answer'), names.join(', '))
  check('no "Context" or "Why" island', !names.includes('Context') && !names.includes('Why'), names.join(', '))
  check('a gem with only a Why shows the Why there', (await field().inputValue().catch(() => '?')) === 'Air pressure holds the molecules in', await field().inputValue().catch(() => '?'))

  // Both: context, a blank line, then why.
  await openGem(bothFilled)
  const merged = await field().inputValue().catch(() => '?')
  check('a gem with both shows the context, a blank line, then the why', merged === 'French soldiers in Egypt\n\nNapoleon brought scholars along', JSON.stringify(merged))
  const untouched = await v('item', bothFilled)
  check('only opening it changes nothing stored', untouched.context === 'French soldiers in Egypt' && untouched.why === 'Napoleon brought scholars along', JSON.stringify([untouched.context, untouched.why]))
  if (shots) await both(`${shots}/behind-answer-panel`)

  // An edit saves it all in context, then clears why: nothing lost.
  await field().click()
  await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.type(', 1799.')
  await blur(); await wait(900)
  const saved = await v('item', bothFilled)
  check('saved: the merged words are in context', saved.context === 'French soldiers in Egypt\n\nNapoleon brought scholars along, 1799.', JSON.stringify(saved.context))
  check('and why is cleared only with them kept', !saved.why && saved.context.includes('Napoleon brought scholars along'), JSON.stringify(saved.why))

  // Review shows the one "Behind the answer" after the answer, not before.
  await v('blurt:sooner', [whyOnly, bothFilled])
  for (const one of await v('review:queue')) if (![whyOnly, bothFilled].includes(one.id)) await v('review:bury', one.id)
  for (const one of await v('review:queue')) if (![whyOnly, bothFilled].includes(one.id)) await v('item:save', one.id, { suspended: true })
  await go('home'); await go('review', ':today')
  await h.waitForFunction(() => document.querySelector('[data-review-card] h2'), null, { timeout: 8000 })
  await blur()
  const asked = await h.locator('[data-review-card] h2').first().textContent()
  check('before the answer, nothing behind it shows', (await h.locator('[data-card-context]').count()) === 0)
  await h.keyboard.press(' '); await wait(800)
  const shown = (await h.locator('[data-card-context]:visible').first().textContent().catch(() => '')).replace(/\s+/g, ' ')
  const expect = asked.includes('Rosetta') ? 'French soldiers in Egypt' : 'Air pressure holds the molecules in'
  check('after the answer, "Behind the answer" shows', shown.startsWith('Behind the answer') && shown.includes(expect), shown)
  check('Review has no separate Why line', !/\bWhy: /.test(await h.locator('[data-review-card]').textContent()))
  if (shots) await both(`${shots}/behind-answer-review`)
} catch (error) { console.log(String(error).slice(0, 400), c.errors.slice(-3).join('\n')) } finally {
  await c.close()
  done()
}
