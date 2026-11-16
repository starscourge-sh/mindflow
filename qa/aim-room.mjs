// Word aim on a Journal day, in the writing room and on the page: its question is the app's own sheet (the same
// radius, padding, type and keycaps as the yes-or-no sheet, no stock form box), and the aim's bar has room: a gap
// over it from the day's caption, under it before its count, and under the count before the words.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=<dir>] node qa/aim-room.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
let base = null
const theme = async (one) => { base = await h.evaluate(([t, was]) => { const r = document.documentElement; was ??= r.className; r.className = t === 'dark' ? 'dark' : was.replace(/dark/, ''); return was }, [one, base]); await wait(300) }
const sheet = (sel) => h.evaluate((sel) => {
  const one = document.querySelector(sel); if (!one) return null
  const s = getComputedStyle(one); const title = getComputedStyle(one.querySelector('h2, p'))
  return { radius: s.borderTopLeftRadius, pad: s.paddingTop, width: Math.round(one.getBoundingClientRect().width), title: title.fontSize + ' ' + title.fontWeight, caps: one.querySelectorAll('kbd').length }
}, sel)
// The gaps, top to bottom: caption, bar, count, first line of the words.
const gaps = () => h.evaluate(() => {
  const scope = document.querySelector('[data-room]') ?? document
  const aim = [...scope.querySelectorAll('[data-word-aim]')].find((one) => one.getBoundingClientRect().height > 0)
  if (!aim) return null
  // The aim's bar is the one progress bar every place draws (progress-bar.tsx), known by its role, not its classes.
  const bar = aim.querySelector('[role="progressbar"]').getBoundingClientRect()
  const count = aim.querySelector('button').getBoundingClientRect()
  const caption = [...scope.querySelectorAll('*')].find((one) => one.children.length === 0 && /pages:/.test(one.textContent) && one.getBoundingClientRect().height > 0)?.getBoundingClientRect()
  const range = document.createRange(); const first = aim.parentElement.querySelector('.tiptap p')
  range.selectNodeContents(first.firstChild ?? first); const line = range.getClientRects()[0]
  return { captionToBar: caption ? Math.round(bar.top - caption.bottom) : null, barToCount: Math.round(count.top - bar.bottom), countToWords: Math.round(line.top - count.bottom) }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [para('I keep telling myself stories at night and I did not sleep again.')] } })
  await go('day'); await wait(900)
  await h.click('[data-room-open]'); await wait(700)
  if (!(await h.locator('[data-room-tools-panel]').count())) { await h.click('[data-room-tools]'); await h.waitForTimeout(250) }
  await h.click('[data-aim-ask]'); await wait(500)
  const asked = await sheet('[role="dialog"]')
  const field = await h.evaluate(() => { const one = document.querySelector('[role="dialog"] input'); const s = getComputedStyle(one); return { size: s.fontSize, height: one.getBoundingClientRect().height } })
  if (shots) for (const one of ['light', 'dark']) { await theme(one); await h.screenshot({ path: `${shots}/aim-ask-${one}.png` }) }
  await theme('light')
  await h.keyboard.type('300'); await h.keyboard.press('Enter'); await wait(600)
  void ('after aim', await h.evaluate(() => ({ room: !!document.querySelector('[data-room]'), aims: [...document.querySelectorAll('[data-word-aim]')].map((o) => o.getBoundingClientRect().height + ':' + getComputedStyle(o).display) })))
  // The sibling: the app's yes-or-no sheet.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:sure', { detail: { question: 'Put this day away?', detail: 'It goes to the Bin, and comes back from there.', yes: 'Put away', answer: () => {} } })))
  await wait(400)
  const sure = await sheet('[data-sure]')
  if (shots) for (const one of ['light', 'dark']) { await theme(one); await h.screenshot({ path: `${shots}/aim-sibling-sure-${one}.png` }) }
  await theme('light')
  await h.keyboard.press('Escape'); await wait(400)
  check('2. Esc on a yes-or-no sheet over the room closes the sheet, not the room too', (await h.locator('[data-room]').count()) === 1 && (await h.locator('[data-sure]').count()) === 0)
  check('2. the aim\'s question is the same sheet as its sibling (radius, padding, width, title)', asked && sure && asked.radius === sure.radius && asked.pad === sure.pad && asked.width === sure.width && asked.title === sure.title, JSON.stringify({ asked, sure }))
  check('2. its keys are shown as keycaps', asked?.caps === 2, JSON.stringify(asked))
  check('2. its field reads at body size, not small grey type', parseFloat(field.size) >= 14 && field.height >= 28, JSON.stringify(field))

  const room = await gaps()
  if (shots) for (const one of ['light', 'dark']) { await theme(one); await h.screenshot({ path: `${shots}/aim-room-${one}.png` }) }
  await theme('light')
  check('3. in the room the bar has room: 12px or more from the caption, 6px or more to its count, 16px or more to the words', room && room.captionToBar >= 12 && room.barToCount >= 6 && room.countToWords >= 16, JSON.stringify(room))
  await h.keyboard.press('Escape'); await wait(700)
  const page = await gaps()
  if (shots) for (const one of ['light', 'dark']) { await theme(one); await h.screenshot({ path: `${shots}/aim-page-${one}.png` }) }
  await theme('light')
  // On the page the aim rides in the writer's line at the window's foot (main.css), so nothing sits between caption and words.
  const line = await h.evaluate(() => document.querySelector('[data-writer-line]')?.textContent.replace(/\s+/g, ' ').trim() ?? null)
  check('3. on the Journal page the aim is in the writer\'s line, the bar there not crowding the words', page === null ? / of 300/.test(line ?? '') : page.barToCount >= 6 && page.countToWords >= 16, JSON.stringify({ page, line }))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
