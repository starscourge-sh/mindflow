// Sorting a capture as it is written (row 1 of "What macOS Gives Haligtree"): quick capture's offer line offers the
// tags the person's own notes most like the words carry, “Tag it #baking · Add ⇥”, beside the kind the box already
// guesses and the day it already reads. One key (⇥) writes the tag in, with a notice; ⌘Z takes it back; sent, the
// capture keeps it. Never a tag the words already have.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/box-sort.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, h, v, both } = c
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const make = (text) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const words = () => page.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.textContent ?? '')
const offer = () => page.waitForSelector('[data-box-offers][data-offer="tag"]', { timeout: 30000 }).then(async (el) => ((await el.textContent()) ?? '').replace(/\s+/g, ' ').trim(), () => '')
const SOURDOUGH = 'My sourdough starter doubled overnight, so I folded the dough and baked the loaf in the lidded pot.'

try {
  await v('settings:set', { sounds: true, celebrate: false })
  for (const text of [
    'Feed the sourdough starter twice a day; the starter is ready when it doubles and smells sour. #baking',
    'A wet sourdough dough opens a big crumb: fold the dough every half hour while the starter works. #baking',
    'Score the sourdough loaf with a razor and bake the dough in a lidded pot; a lively starter makes it rise. #baking',
    'An overproofed sourdough dough spreads flat in the pot: the starter was past its peak and the loaf baked dense. #baking'
  ]) await make(text)

  await h.evaluate(() => window.api.showPrompt())
  await page.waitForSelector(EDITOR, { state: 'visible' })
  await page.click(EDITOR)
  await page.keyboard.type(SOURDOUGH, { delay: 5 })
  const said = await offer()
  check('the box offers the tag its nearest notes carry: “Tag it #baking”, with “Add ⇥”', /Tag it #baking/.test(said) && /Add/.test(said), said)
  if (process.env.QA_SHOTS) await both(join(process.env.QA_SHOTS, 'box-sort-offer'), page)
  await page.evaluate(() => void (window.haligtreeCued && (window.haligtreeCued.length = 0)))
  await page.keyboard.press('Tab')
  await page.waitForTimeout(500)
  check('⇥ writes #baking into the words', (await words()).includes('#baking'), await words())
  const notice = await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map((el) => el.textContent).join(' | '))
  check('with a notice “Tagged #baking”, and one sound', /Tagged #baking/.test(notice) && JSON.stringify(await page.evaluate(() => window.haligtreeCued ?? [])) === '["noted"]', `${notice} ${JSON.stringify(await page.evaluate(() => window.haligtreeCued ?? []))}`)
  check('the offer goes once taken', !(await page.$('[data-box-offers][data-offer="tag"]')))
  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(400)
  check('⌘Z takes it back off', !(await words()).includes('#baking'), await words())
  // A fresh box: taken by a click this time, and sent: the capture keeps the tag.
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1200)
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForSelector(EDITOR, { state: 'visible' })
  await page.click(EDITOR)
  await page.keyboard.type(SOURDOUGH.replace('My', 'Our'), { delay: 5 })
  const again = await offer()
  check('a new note on it is offered it too', /Tag it #baking/.test(again), again)
  await page.click('[data-box-tag]')
  await page.waitForTimeout(300)
  await page.keyboard.press('Meta+Enter')
  await h.waitForTimeout(1500)
  const kept = await h.evaluate(() => window.api.captures.list().then((all) => all.find((one) => (one.label ?? '').startsWith('Our sourdough starter'))))
  const body = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), kept?.id))?.body ?? '')
  check('sent, the capture keeps #baking', body.includes('#baking'), body.slice(0, 200))

  // Words already carrying the tag: not offered it.
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForSelector(EDITOR, { state: 'visible' })
  await page.click(EDITOR)
  await page.keyboard.type(`${SOURDOUGH} #baking`, { delay: 5 })
  await page.waitForTimeout(4000)
  check('never a tag the words already have', !(await page.$('[data-box-offers][data-offer="tag"]')))
  await page.keyboard.press('Escape')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
