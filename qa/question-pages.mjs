// Questions are pages in Writing. An open question is a row in Writing with
// its "?" mark; the "Questions" chip shows every question, answered ones too;
// Questions (the old page, G H, a question opened from anywhere) lands in
// Writing with that chip on. The question's page says what it is for in two
// sentences and has an "Answered" button, which makes a page of writing from
// the clues, oldest first. Pinned questions still show in quick capture, and
// in the box a line ending in "?" offers "Keep as a question" on Tab.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/question-pages.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, page, v, go, send } = c
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-row][data-id]')].map((one) => ({ id: one.dataset.id, type: one.dataset.type, text: one.textContent })))
const chip = (name) => h.locator(`button[aria-pressed][aria-label="${name}"]`).first()
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
  const id = await v('question:new', 'Why do tides lag behind the moon?')
  await v('clue', id, 'First: the water has to move a long way.')
  await new Promise((done) => setTimeout(done, 30))
  await v('clue', id, 'Second: friction with the sea floor slows it.')
  await v('question:pin', id, true)

  // In Writing, with the "?" mark.
  await go('articles')
  await h.waitForTimeout(600)
  let list = await rows()
  const row = list.find((one) => one.id === id)
  check('an open question is a row in Writing', !!row && row.type === 'question', list.length + ' rows')
  check('beside the writing', list.some((one) => one.type === 'article'), list.map((one) => one.type).join(','))
  const mark = await h.evaluate((qid) => !!document.querySelector(`[data-row][data-id="${qid}"] svg`), id)
  check('the row has its "?" mark', mark)
  check('Writing shows the "All" and "Questions" chips', (await chip('All').count()) > 0 && (await chip('Questions').count()) > 0)
  const before = await h.evaluate(() => document.querySelector('[data-new-writing]')?.getBoundingClientRect().toJSON())
  await chip('Questions').click()
  await h.waitForTimeout(500)
  list = await rows()
  check('the "Questions" chip shows only questions', list.length > 0 && list.every((one) => one.type === 'question'), list.map((one) => one.type).join(','))
  const after = await h.evaluate(() => ({ box: document.querySelector('[data-new-writing]')?.getBoundingClientRect().toJSON(), said: document.querySelector('[data-new-writing]')?.dataset.newWriting }))
  check('its button now makes a question, in the same place and size', after.said === 'question' && Math.round(after.box.x) === Math.round(before.x) && Math.round(after.box.width) === Math.round(before.width), JSON.stringify([before?.x, before?.width, after.box?.x, after.box?.width]))
  await chip('All').click()
  await h.waitForTimeout(300)

  // Sent to a question from anywhere: Writing, Questions chip on, the question open.
  await go('home')
  await send('question', id)
  await h.waitForTimeout(1200)
  const landed = await h.evaluate(() => ({ title: document.querySelector('h1, [data-page-title]')?.textContent, how: document.querySelector('[data-question-how]')?.textContent ?? '', answered: !!document.querySelector('[data-question-answered]'), on: [...document.querySelectorAll('[aria-pressed="true"], [data-on], [data-state="on"]')].map((one) => one.textContent).join('|') }))
  check('a question opens in Writing', /Writing/.test(await h.evaluate(() => document.body.innerText.slice(0, 4000))), landed.title)
  const sentences = landed.how.split(/(?<=\.)\s+/).filter(Boolean)
  check('its page says what it is for in two sentences', sentences.length === 2 && /clue/.test(landed.how) && /“Answered”/.test(landed.how), landed.how)
  check('its page has an "Answered" button', landed.answered)
  // The old Questions page is Writing with the chip on.
  // (Narrow, an open note takes the page and the list is a step back: from Home, it is the list.)
  await go('home')
  await go('questions')
  list = await rows()
  check('Questions is Writing with the "Questions" chip on', list.length > 0 && list.every((one) => one.type === 'question'), list.map((one) => one.type).join(','))

  // Pinned questions still show in quick capture.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(900)
  const pinnedInBox = (await v('questions:pinned')).some((one) => one.id === id)
  check('a pinned question is still kept in view for quick capture', pinnedInBox)
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(400)

  // A line ending in "?": "Keep as a question", Tab keeps it.
  const editor = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
  await page.click(editor)
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('Does the harbour silt up every winter?', { delay: 8 })
  await page.waitForTimeout(900)
  const offer = await page.evaluate(() => document.querySelector('[data-offer="ask"]')?.textContent ?? '')
  check('a line ending in "?" offers "Keep as a question" with its key', /Keep as a question/.test(offer) && /⇥/.test(offer), offer)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(1200)
  const made = (await v('items', 'question')).find((one) => one.title === 'Does the harbour silt up every winter?')
  check('Tab keeps it as a question', !!made)
  const emptied = await page.evaluate((sel) => document.querySelector(sel)?.innerText.trim() ?? '', editor)
  check('and the box is ready for the next thought', emptied === '', emptied)
  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(1200)
  const undone = (await v('items', 'question')).find((one) => one.title === 'Does the harbour silt up every winter?')
  const back = await page.evaluate((sel) => document.querySelector(sel)?.innerText.trim() ?? '', editor)
  check('⌘Z takes it back, words and all', !undone && back === 'Does the harbour silt up every winter?', back)
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  await page.evaluate(() => window.api.hidePrompt())

  // Answered: writing from the clues, oldest first.
  await send('question', id)
  await h.waitForTimeout(1200)
  await h.locator('[data-question-answered]').click()
  await h.waitForTimeout(1500)
  const article = (await v('items', 'article')).find((one) => one.title === 'Why do tides lag behind the moon?')
  const full = article && await v('item', article.id)
  const text = JSON.stringify(full?.body ?? '')
  check('"Answered" makes a page of writing', !!article)
  check('with the clues oldest first', text.indexOf('First:') >= 0 && text.indexOf('First:') < text.indexOf('Second:'), text.slice(0, 200))
  // Settled, it rests under the "Questions" chip, still readable.
  await go('articles')
  list = await rows()
  check('an answered question leaves the writing list', !list.some((one) => one.id === id))
  await chip('Questions').click()
  await h.waitForTimeout(400)
  list = await rows()
  check('and rests under "Questions"', list.some((one) => one.id === id))
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
done()
