// Look Up in Review: words picked in a card's answer, right-clicked, offer
// "Look up", and it opens the one Look Up card (the same as in a note or a reader).
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/look-up-review.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860, seeded: false })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload(); await wait(2000)
  const card = await v('nugget:from', 'Petrichor is the smell of rain on dry earth', {})
  await v('item:save', card, { prompt: 'What is the smell of rain called?', title: 'What is the smell of rain called?' })
  await c.go('review'); await wait(1500)
  await h.keyboard.press('Space'); await wait(1200)
  const box = await h.evaluate(() => {
    const ed = [...document.querySelectorAll('.tiptap')].find((one) => one.textContent.includes('Petrichor'))
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode()
    while (text && !text.data.includes('Petrichor')) text = walker.nextNode()
    const at = text.data.indexOf('Petrichor')
    const range = document.createRange()
    range.setStart(text, at); range.setEnd(text, at + 'Petrichor'.length)
    getSelection().removeAllRanges(); getSelection().addRange(range)
    const r = range.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await wait(300)
  await h.mouse.click(box.x, box.y, { button: 'right' }); await wait(500)
  check('right-click on picked words in a card\'s answer offers "Look up"', await h.locator('[data-look-menu] [role="menuitem"]', { hasText: 'Look up' }).count() === 1, '')
  if (shots) await h.screenshot({ path: `${shots}/look-up-review-menu.png` })
  await h.click('[data-look-menu] [role="menuitem"]').catch(() => {}); await wait(1500)
  check('and it opens the one Look Up card, the word as its headword', (await h.evaluate(() => document.querySelector('[data-look-up-host] .look-up-headword')?.textContent)) === 'Petrichor', String(await h.evaluate(() => document.querySelector('[data-look-up-host] .look-up-headword')?.textContent)))
  if (shots) await h.screenshot({ path: `${shots}/look-up-review.png` })
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc puts it away', !(await h.evaluate(() => !!document.querySelector('[data-look-up-host] .look-up'))), '')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
