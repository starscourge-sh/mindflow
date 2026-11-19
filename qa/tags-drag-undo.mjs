// A favourite tag dragged to a new place in the sidebar, and ⌘Z pressed at once: the sidebar draws the tags back in
// their old order, as the book has them. Before 19 Nov the list held the dropped order until a saved one was read
// back; undone before that read was shown, the order read back was the old one, the same as the list had, so it never
// changed and the drop stayed drawn (sortable.tsx `useLetGoOnUndo`, ui.tsx `undone`).
//
//   QA_ARGS=--sandbox QA_DATA=<sandbox copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tags-drag-undo.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1180, height: 800 })
const h = c.h
const wait = (ms) => h.waitForTimeout(ms)
try {
  const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  for (const text of ['first #alphaqa', 'second #betaqa']) await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(text))
  await c.v('settings:set', { sideTags: ['alphaqa', 'betaqa'], tagOrder: ['alphaqa', 'betaqa'] })
  await wait(1200)
  const row = (tag) => h.locator(`[data-side-tag="${tag}"]`)
  if (!(await row('alphaqa').isVisible())) await h.locator('[data-tags-fold]').click().catch(() => {})
  await wait(400)
  const drawn = () => h.evaluate(() => [...document.querySelectorAll('[data-side-tag]')].map((one) => one.getAttribute('data-side-tag')).filter((one) => /qa$/.test(one)).join())
  check('two favourite tags, alphaqa first', (await drawn()) === 'alphaqa,betaqa', await drawn())
  const from = await row('betaqa').boundingBox()
  const to = await row('alphaqa').boundingBox()
  await h.mouse.move(from.x + 40, from.y + from.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 10; i++) await (h.mouse.move(from.x + 40, from.y + from.height / 2 + (to.y + 2 - (from.y + from.height / 2)) * (i / 10)), wait(25))
  await wait(200)
  await h.mouse.up()
  // At once, as a person who dropped it in the wrong place would.
  await h.keyboard.press('Meta+z')
  let back = ''
  for (let i = 0; i < 30 && back !== 'alphaqa,betaqa'; i++) (back = await drawn(), await wait(100))
  const saved = (await c.v('settings')).tagOrder ?? []
  check('the book has the old order back', saved.indexOf('alphaqa') < saved.indexOf('betaqa'), saved.join())
  check('and the sidebar draws it so', back === 'alphaqa,betaqa', back)
} finally {
  await c.close()
}
done()
