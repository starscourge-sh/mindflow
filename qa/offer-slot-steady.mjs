// The offer slot under a note never sets the editor drawing itself again and again (the main window froze on
// 6 Nov: ProseMirror was handed one element for two widgets, took it away after placing it, and drew again for
// ever). Typing in a note with an offer showing, then resting: the editor's own children settle within a second,
// the page answers quickly, and the slot is there once.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/offer-slot-steady.mjs
import { checks } from './harness.mjs'

const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const para = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
try {
  const stoicism = await v('article:new')
  await v('item:save', stoicism, { title: 'Stoicism', body: para('Stoicism teaches that virtue is the only good and that our judgements are up to us.') })
  const note = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('The Stoics held that only our judgements are up to us.'))
  await send('capture', note)
  await wait(1500)
  // Wait for an offer to be drawn in the slot (the book is read once per launch).
  for (let t = 0; t < 40000 && !(await h.evaluate(() => !!document.querySelector('[data-note-offer]'))); t += 250) await wait(250)
  const offered = await h.evaluate(() => !!document.querySelector('[data-note-offer]'))
  check('an offer shows under the note', offered)
  // Type at the end of the note, as a person does, a line and a new paragraph.
  await h.click('.ProseMirror p:last-of-type')
  await h.keyboard.press('End')
  await h.keyboard.type(' Epictetus said much the same.', { delay: 25 })
  await h.keyboard.press('Enter')
  await h.keyboard.type('Seneca too.', { delay: 25 })
  await wait(800)
  // Count the editor root's own child changes for 1.5 seconds of rest: a loop makes hundreds.
  const changes = await h.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector('.ProseMirror')
    let n = 0
    const watch = new MutationObserver((records) => (n += records.filter((r) => r.type === 'childList' && r.target === root).length))
    watch.observe(root, { childList: true })
    setTimeout(() => (watch.disconnect(), resolve(n)), 1500)
  }))
  check('at rest, the editor stops redrawing its lines', changes <= 2, `${changes} child changes on the editor in 1.5s`)
  const started = Date.now()
  await h.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
  const answered = Date.now() - started
  check('the page answers at once', answered < 250, `${answered} ms for one frame`)
  const slots = await h.evaluate(() => document.querySelectorAll('.mf-offer-slot').length)
  check('one offer slot in the page', slots === 1, `${slots}`)
  const typed = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), note))?.body ?? '')
  check('what was typed is kept', typed.includes('Epictetus') && typed.includes('Seneca'), typed.slice(0, 200))
} finally {
  await c.close()
  done()
}
