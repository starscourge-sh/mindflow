// The writing room on an empty Journal day stays still: with no input its words never move, and a scroll can never
// carry them out of sight (the user, 5 Nov: frames 7s apart showing the prompt at the top, then mid-window, then
// cut off at the top, then gone).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/room-still.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const words = () => h.evaluate(() => { const r = document.querySelector('[data-room] .ProseMirror')?.getBoundingClientRect(); return r ? Math.round(r.top) : null })
try {
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [] } })
  await go('day'); await wait(1000)
  await h.click('[data-day-write] .ProseMirror').catch(() => {})
  await h.keyboard.press('Shift+Meta+Enter'); await wait(800)
  check('the room opens', await h.evaluate(() => !!document.querySelector('[data-room]')))
  const tops = []
  for (let n = 0; n < 8; n++) { tops.push(await words()); if (shots) await h.screenshot({ path: join(shots, `still-${n}.png`) }); await wait(1500) }
  check('with no input, the words stay where they are', new Set(tops).size === 1, tops.join(' '))
  const box = await h.evaluate(() => { const r = document.querySelector('[data-room]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.move(box.x, box.y)
  for (let n = 0; n < 12; n++) { await h.mouse.wheel(0, 400); await wait(60) }
  await wait(600)
  const after = await words()
  if (shots) await h.screenshot({ path: join(shots, 'scrolled.png') })
  check('scrolling an empty page never carries its words out of sight', after !== null && after > 40, String(after))
  check('the room has nothing to scroll while the words fit', await h.evaluate(() => { const r = document.querySelector('[data-room]'); return r.scrollHeight <= r.clientHeight + 1 }), await h.evaluate(() => { const r = document.querySelector('[data-room]'); return `${r.scrollHeight} vs ${r.clientHeight}` }))
  // Writing mode on the Journal's own page (a few words typed, then taken back): the faded page round the words
  // must not carry them out of sight under a swipe.
  await h.keyboard.press('Shift+Meta+Enter'); await wait(800)
  await h.click('[data-day-write] .ProseMirror')
  await h.keyboard.type('one two three four ', { delay: 40 }); await wait(1200)
  for (let i = 0; i < 19; i++) await h.keyboard.press('Backspace')
  await wait(1200)
  check('writing mode is on', await h.evaluate(() => document.documentElement.hasAttribute('data-day-writing')))
  await h.mouse.move(640, 430)
  for (let n = 0; n < 15; n++) { await h.mouse.wheel(0, 300); await h.waitForTimeout(60) }
  await wait(800)
  const mode = await h.evaluate(() => { const r = document.querySelector('[data-day-write] .ProseMirror')?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.bottom)] : null })
  if (shots) await h.screenshot({ path: join(shots, 'mode-scrolled.png') })
  check('in writing mode a swipe never carries the words out of sight', !!mode && mode[1] > 100 && mode[0] < 860, JSON.stringify(mode))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  done()
}
