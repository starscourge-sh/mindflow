// A card turned back to its question after its answer was shown (the user, 13 Nov, three screenshots of Review:
// "spot the problem after closing a card"): the card stood as tall as its answer, an empty panel under the
// question, the grades pushed out of sight, and the page scrolled. A card is the size of the side that is up.
//   Each line: before the answer, with it, turned back to the question, over again; by a click, at the page's own
//   pace (frames every 30 ms through the turn back: the card's height only ever moves toward the question's, and
//   nothing of the card is drawn over what sits under it); with Motion off; at 560 by 400.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-turn-back.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(150)) if (await test()) return true; return false }
// The card (Flip's own box), its two sides, what sits under it, and the page's scroll.
const read = () => h.evaluate(() => {
  const back = document.querySelector('[data-answer-side]')
  const front = [...document.querySelectorAll('[data-review-card] [data-finish-face]')].find((one) => !one.hasAttribute('data-answer-side'))
  const box = (back ?? front)?.closest('[class*="perspective"]')
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height), width: Math.round(b.width) } }
  const under = document.querySelector('[data-grades]') ?? document.querySelector('[data-show-answer]')
  let scroller = box?.parentElement
  while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
  // The side that is up: the one not hidden from the reader.
  const up = [front, back].find((one) => one && !one.closest('[aria-hidden="true"]'))
  return { box: r(box), front: r(front), back: r(back), up: up === back ? 'back' : 'front', under: r(under), underIs: under?.hasAttribute('data-grades') ? 'grades' : 'show', scroll: scroller ? Math.round(scroller.scrollTop) : 0 }
})
const LONG = [
  'Rational root theorem: for a polynomial with integer coefficients, any rational root p/q in lowest terms has p a factor of the constant term and q a factor of the leading coefficient.',
  'Finding roots of polynomials is hard in general. The theorem does not solve the problem, but it cuts the search down to a short list of candidates to test.',
  'The setup: a polynomial with integer coefficients set equal to zero.',
  'Any rational root p/q must satisfy: p divides the constant term; q divides the leading coefficient; the fraction is in lowest terms.',
  'Worked example: for 2x³ − 3x² − 11x + 6 = 0 the constant term 6 has factors ±1, ±2, ±3, ±6 and the leading coefficient 2 has ±1, ±2.',
  'Possible rational roots: ±1, ±2, ±3, ±6, ±1/2, ±3/2. Test x = 3: 54 − 27 − 33 + 6 = 0.',
  'Key limitations: it only finds rational roots; it gives candidates, not guarantees; each candidate still has to be tested.',
  'It is useful because it makes root-finding systematic rather than a guess.'
].join('\n\n')
try {
  await v('settings:set', { hintRate: 0 })
  const id = await v('nugget:from', LONG, {})
  await v('item:save', id, { prompt: 'What does “Rational root theorem” mean?' })
  for (const one of await v('cards:all')) if (one.id !== id) await v('item:save', one.id, { suspended: true })
  await h.reload()
  await wait(2500)
  await c.go('review', ':today')
  check('the card is asked', await waitFor(() => h.evaluate(() => /Rational root theorem/.test(document.querySelector('h2')?.textContent ?? ''))))
  await wait(600)
  const asked = await read()
  // Its answer shown (Space), then turned back to the question by a click on the answer's words.
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Space')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
  await wait(900)
  const answered = await read()
  check('with its answer the card is as tall as the answer', answered.up === 'back' && answered.box.height >= answered.back.height - 2 && answered.box.height > asked.box.height + 150, JSON.stringify({ asked: asked.box, answered: answered.box, back: answered.back }))
  if (shots) await h.screenshot({ path: `${shots}/turn-back-0-answer.png` })
  const gap = answered.under.top - answered.box.bottom
  const at = await h.evaluate(() => { const el = document.querySelector('[data-answer-side] p'); const b = el.getBoundingClientRect(); return { x: b.left + 30, y: b.top + 8 } })
  // Frames through the turn back: the page's own pace, read every 30 ms.
  const frames = []
  await h.mouse.click(at.x, at.y)
  for (let n = 0; n < 30; n++) { frames.push({ t: n * 30, ...(await read()) }); if (shots && [1, 3, 6, 10].includes(n)) await h.screenshot({ path: `${shots}/turn-back-${n}.png` }); await wait(30) }
  await wait(600)
  const back = await read()
  if (shots) await h.screenshot({ path: `${shots}/turn-back-9-question.png` })
  check('turned back to the question, the card is the question\'s size again, not the answer\'s', back.up === 'front' && Math.abs(back.box.height - asked.box.height) <= 2, JSON.stringify({ asked: asked.box.height, now: back.box.height, answer: answered.box.height }))
  // Under a long answer the grades stay in sight at the page's foot (review-view.tsx), the answer passing under them; turned
  // back to its question, the card is short again and they sit in their own place under it, never over the card.
  check('and the grades sit under it in their own place, never over the card', back.underIs === 'grades' && back.under.top >= back.box.bottom, JSON.stringify({ gapUnderTheAnswer: gap, now: back.under.top - back.box.bottom, under: back.under }))
  check('and the page is not scrolled by the turn', back.scroll === answered.scroll, JSON.stringify({ before: answered.scroll, after: back.scroll }))
  // The way there: the card's height only ever moves from the answer's toward the question's, never up again,
  // and the side drawn never runs past the card's box onto what is under it. Read only where the side faces you
  // (its drawn width 95% of the card's or more): turned further, the near edge of a card in perspective is drawn
  // taller than the card, as any card turned toward you is, whatever its height.
  let ups = 0, past = 0
  for (let n = 1; n < frames.length; n++) if (frames[n].box.height > frames[n - 1].box.height + 1) ups++
  for (const one of frames) for (const side of [one.front, one.back]) if (side && one.up === (side === one.back ? 'back' : 'front') && side.width >= one.box.width * 0.95 && side.bottom > one.box.bottom + 2) past++
  check('through the turn the card only shrinks toward the question, never grows back', ups === 0, frames.map((one) => one.box.height).join(' '))
  check('through the turn the side that is up never runs past the card onto the grades', past === 0, frames.map((one) => `${one.up}:${one.box.bottom}/${(one.up === 'back' ? one.back : one.front)?.bottom}`).join(' '))
  // Over again: the answer's size.
  await h.mouse.click(at.x - 10, back.box.top + 30)
  await wait(900)
  const again = await read()
  check('turned over again, the card is the answer\'s size', again.up === 'back' && Math.abs(again.box.height - answered.box.height) <= 2, JSON.stringify({ answer: answered.box.height, now: again.box.height }))
  // Motion off: one side gives way to the other, and the card is the size of the one up.
  await h.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'))
  await h.mouse.click(at.x - 10, again.box.top + 30)
  await wait(500)
  const flat = await read()
  check('with Motion off, turned back, the card is the question\'s size', flat.up === 'front' && Math.abs(flat.box.height - asked.box.height) <= 2, JSON.stringify({ asked: asked.box.height, now: flat.box.height }))
  await h.evaluate(() => document.documentElement.removeAttribute('data-motion'))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
  done()
}
