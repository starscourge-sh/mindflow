// The line lit as it plays: while the meeting plays, the line being said and its speaker are softly lit; the page
// follows only while that line is in view, and stops the moment you scroll yourself, until you play from a line again;
// a click on any line plays from it. With reduce motion: the light, no smooth scroll. Silent: the player is muted.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-follow.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'

const FRAMES = process.env.FRAMES
const { check, done } = checks()
// A longer stand-up (three rounds), so the transcript runs past the window.
const { c, made, record } = await recorded({ repeat: 3, height: 700 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const lit = () => h.evaluate(() => { const el = document.querySelector('[data-meeting-line][data-lit]'); const r = el?.getBoundingClientRect(); return el ? { index: Number(el.dataset.lineIndex), at: Number(el.dataset.at), seen: r.top >= 0 && r.bottom <= innerHeight, name: getComputedStyle(el.querySelector('.mf-meeting-name')).visibility } : null })
const scroller = () => h.evaluate(() => { let at = document.querySelector('[data-meeting-transcript]'); while (at && !(/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight)) at = at.parentElement; return at ? at.scrollTop : null })
try {
  await record()
  await h.evaluate(() => { const a = document.querySelector('[data-meeting-page] audio'); a.muted = true })
  check('nothing is lit before it plays', !(await lit()))
  // A click on a line plays from it, and lights it.
  await h.locator('[data-meeting-line] .mf-meeting-words').nth(2).click()
  await wait(400)
  const first = await lit()
  const time = await h.evaluate(() => document.querySelector('[data-meeting-page] audio').currentTime)
  check('a click on a line plays from it', Math.abs(time - made.lines[2].start) < 1.2 && !(await h.evaluate(() => document.querySelector('[data-meeting-page] audio').paused)), `${time} for ${made.lines[2].start}`)
  check('the line being said is lit, its speaker shown', first?.index === 2 && first.name === 'visible', JSON.stringify(first))
  if (FRAMES) await c.both(join(FRAMES, 'follow-lit'))
  // Played on near the foot of the window: the page follows to keep the lit line in view.
  const late = made.lines.findIndex((one, n) => n > 10)
  await h.locator('[data-meeting-line]').nth(late).scrollIntoViewIfNeeded()
  await h.evaluate(() => { const rows = document.querySelectorAll('[data-meeting-line]'); const s = (function f(at) { while (at && !(/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight)) at = at.parentElement; return at })(rows[0]); const r = rows[14].getBoundingClientRect(); s.scrollTop += r.bottom - innerHeight + 20 })
  await h.locator('[data-meeting-line] .mf-meeting-time').nth(14).click()
  const frames = []
  for (let i = 0; i < 70; i += 1) { frames.push(await lit()); if (FRAMES && i % 4 === 0) await h.screenshot({ path: join(FRAMES, `follow-${String(i).padStart(3, '0')}.png`) }); await wait(100) }
  const moved = frames.filter(Boolean)
  check('as it plays on, the light moves line to line', new Set(moved.map((one) => one.index)).size >= 2, moved.map((one) => one.index).join(','))
  check('and the page follows: the lit line stays in view', moved.every((one) => one.seen), JSON.stringify(moved.filter((one) => !one.seen).slice(0, 2)))
  // Scrolled by hand: it stops following.
  await h.mouse.move(500, 300)
  await h.mouse.wheel(0, -900)
  await wait(300)
  const held = await scroller()
  await wait(3500)
  check('scrolled by hand, the page stays where you put it', Math.abs((await scroller()) - held) < 2, `${held} then ${await scroller()}`)
  // Played from a line again: it follows again.
  await h.evaluate(() => document.querySelector('[data-meeting-page] audio').pause())
  await h.locator('[data-meeting-line] .mf-meeting-words').nth(3).click()
  await wait(500)
  check('playing from a line again lights that line', (await lit())?.index === 3)
  await h.evaluate(() => document.querySelector('[data-meeting-page] audio').pause())
  // Reduce motion: the light, no smooth scroll.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  const smooth = await h.evaluate(() => { const was = Element.prototype.scrollBy; let how = null; Element.prototype.scrollBy = function (o) { how = o?.behavior; return was.call(this, { ...o, behavior: 'instant' }) }; window.__how = () => how; return true })
  void smooth
  await h.locator('[data-meeting-line] .mf-meeting-time').nth(14).click()
  await wait(4000)
  const how = await h.evaluate(() => window.__how())
  check('with reduce motion the page jumps, never glides', how === null || how === 'instant', how)
  check('and the line is still lit', !!(await lit()))
  await h.evaluate(() => document.querySelector('[data-meeting-page] audio').pause())
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
  done()
}
