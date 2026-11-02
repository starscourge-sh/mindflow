// The pile in motion, as a person does it:
// - Review: a card graded with a click tucks under the pile (drops a little, shrinks, goes behind the next);
//   graded with a key it is simply gone; a flick down on the card puts it off until tomorrow and grades nothing.
// - A sticky's X pressed and held crumples it more the longer the hold; let go early and it smooths flat with
//   nothing moved; held to the end it drops off the window's foot into the Bin, and "Bring it back" undoes it.
// Every frame is read in the page (requestAnimationFrame), so short motion is never missed between screenshots.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=dir] node qa/pile-motion.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1200, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (page, test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await page.waitForTimeout(120)) if (await test()) return true; return false }
// Each frame for `ms`: what `read` gives back in the page.
const record = (page, read, ms = 1500) => page.evaluate(([read, ms]) => { const fn = new Function(`return (${read})()`); window.__frames = []; window.__times = []; const end = performance.now() + ms; const tick = () => { window.__frames.push(fn()); window.__times.push(performance.now()); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }, [read.toString(), ms])
const frames = (page) => page.evaluate(() => window.__frames)
const asked = () => h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
try {
  // ---- Review ----
  await c.go('review', ':today')
  await waitFor(h, async () => (await asked()).length > 3)
  if (shots) await h.screenshot({ path: join(shots, 'review-start.png') })
  const reveal = async () => { await h.getByRole('button', { name: /^Show the / }).first().click({ timeout: 4000 }).catch((e) => console.log(String(e).slice(0, 200))); return waitFor(h, () => h.evaluate(() => !!document.querySelector('[data-grades] button'))) }
  check('Review: "Show the answer" turns the card over', await reveal())
  const sheets = () => [...document.querySelectorAll('[data-review-sheet]')].map((one) => { const m = new DOMMatrix(getComputedStyle(one).transform); return { y: Math.round(m.m42 * 10) / 10, s: Math.round(m.a * 1000) / 1000, z: getComputedStyle(one).zIndex, o: Math.round(Number(getComputedStyle(one).opacity) * 100) / 100 } })
  await record(h, sheets, 700)
  await h.locator('[data-grades] button').nth(2).click()
  await wait(800)
  const graded = await frames(h)
  // The one leaving: a frame with two sheets, the second (leaving) one lower, smaller and behind.
  const leaving = graded.filter((one) => one.length === 2).map((one) => one.find((s) => s.z === '0') ?? one[0])
  if (shots) await h.screenshot({ path: join(shots, 'review-after-click.png') })
  check('Review, graded with a click: the card tucks under (drops, shrinks, goes behind the next)', leaving.some((one) => one.y > 4 && one.s < 0.99 && one.z === '0'), JSON.stringify(leaving.slice(0, 6)))
  // Timed by the page's clock: on a busy machine frames come slower, but the leaving card's time on screen is what counts.
  const times = await h.evaluate(() => window.__times ?? [])
  const twoAt = graded.map((one, n) => (one.length === 2 ? times[n] : null)).filter((one) => one !== null)
  const gone = twoAt.length ? Math.round(twoAt.at(-1) - twoAt[0]) : -1
  check('...and it is gone within about 300ms (400 allowed on a busy machine), one card left', gone >= 0 && gone <= 400 && graded.at(-1).length === 1, `${gone}ms on screen leaving`)
  // By a key: no motion at all.
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Space')
  await waitFor(h, () => h.evaluate(() => !!document.querySelector('[data-grades] button')))
  await record(h, sheets, 500)
  await h.keyboard.press('3')
  await wait(600)
  const keyed = await frames(h)
  check('Review, graded with a key: nothing moves (no frame shows a card dropping or shrinking)', keyed.every((one) => one.every((s) => s.y === 0 && s.s === 1)), JSON.stringify(keyed.filter((one) => one.some((s) => s.y || s.s !== 1)).slice(0, 3)))
  // A flick down: put off, not graded.
  const before = await asked()
  const heardFrom = await h.evaluate(() => (window.haligtreeHeard ?? []).length)
  const box = await h.locator('[data-review-card] > div').first().boundingBox()
  // On the card's paper, clear of its words (the question can be edited in place).
  const at = { x: box.x + box.width - 160, y: box.y + box.height - 16 }
  await h.mouse.move(at.x, at.y)
  await h.mouse.down()
  // A quick flick pressed near the card's foot: the first move seen is already 20px down, off the card.
  await h.mouse.move(at.x + 1, at.y + 20)
  for (let n = 3; n <= 16; n++) { await h.mouse.move(at.x + 1, at.y + n * 10); await wait(8) }
  if (shots) await h.screenshot({ path: join(shots, 'review-flick-held.png') })
  await h.mouse.up()
  await wait(700)
  const after = await asked()
  const heard = await h.evaluate((n) => (window.haligtreeHeard ?? []).slice(n), heardFrom)
  check('Review, flicked down: the next card is up', after !== before, `${before} → ${after}`)
  check('...put off (the "later" sound of Not today), not graded (no grade sound)', heard.includes('cue:later') && !heard.some((one) => /cue:(again|hard|good|easy)/.test(one)), heard.join(','))
  // A short drag down and back: nothing happens.
  const still = await asked()
  const box2 = await h.locator('[data-review-card] > div').first().boundingBox()
  await h.mouse.move(box2.x + box2.width - 160, box2.y + box2.height - 16)
  await h.mouse.down()
  await h.mouse.move(box2.x + box2.width - 160, box2.y + box2.height + 14, { steps: 4 })
  await wait(200)
  await h.mouse.up()
  await wait(500)
  check('Review, dragged down a little and let go slowly: it springs back, the same card', (await asked()) === still)

  // ---- A sticky: press and hold ----
  const captures = await h.evaluate(() => window.api.captures.list?.() ?? [])
  const one = (Array.isArray(captures) ? captures : []).find((x) => x?.id && x.status === 'open' && x.title)
  check('a capture to stick', !!one)
  await h.evaluate((id) => window.api.stick('capture', id, true), one.id)
  let sticky = null
  for (let n = 0; n < 50 && !sticky; n++) { sticky = electron.windows().find((w) => w.url().includes(`id=${one.id}`)) ?? null; await wait(200) }
  check('the sticky is up', !!sticky)
  await wait(1800)
  const close = sticky.locator('[data-sticky-close]')
  const cb = await close.boundingBox()
  const card = () => { const el = document.querySelector('[data-clear] > div'); const m = new DOMMatrix(getComputedStyle(el).transform); return { s: Math.round(m.a * 100) / 100, clip: getComputedStyle(el).clipPath.slice(0, 22) } }
  await sticky.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await wait(400)
  await record(sticky, card, 2500)
  await sticky.mouse.down()
  // Let go part way, timed by the sheet itself (a busy machine stretches any fixed wait): once it is about a fifth crumpled.
  await sticky.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-clear] > div')).transform).a < 0.85, null, { polling: 16, timeout: 8000 })
  await sticky.mouse.up()
  await wait(2000)
  const early = await frames(sticky)
  const least = Math.min(...early.map((f) => f.s))
  check('Sticky, held part way: it crumples, more each frame it is held', least < 0.9 && early.slice(0, early.indexOf(early.find((f) => f.s === least))).every((f, n, all) => n === 0 || f.s <= all[n - 1].s), early.map((f) => f.s).join(' '))
  check('...let go early: it smooths flat again', early.at(-1).s === 1 && !early.at(-1).clip.startsWith('polygon'), JSON.stringify(early.at(-1)))
  check('...and nothing moved to the Bin', (await h.evaluate((id) => window.api.captures.get(id), one.id)).status !== 'discarded')
  check('...nor taken off the desktop (a hold is not a click)', !!electron.windows().find((w) => w.url().includes(`id=${one.id}`)) && !(await sticky.evaluate(() => document.body.textContent.includes('Take down?'))))
  // Held to the end.
  await record(sticky, card, 2200)
  await sticky.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await sticky.mouse.down()
  for (let n = 0; n < 6; n++) { await wait(200); if (shots) await sticky.screenshot({ path: join(shots, `sticky-hold-${n}.png`) }) }
  await sticky.mouse.up()
  await wait(900)
  const full = await frames(sticky)
  check('Sticky, held to the end: it becomes a ball', Math.min(...full.map((f) => f.s)) < 0.4, full.map((f) => f.s).join(' '))
  check('...and its note is in the Bin', (await h.evaluate((id) => window.api.captures.get(id), one.id)).status === 'discarded')
  check('...the card smooths back to say so, with "Bring it back"', await sticky.evaluate(() => document.body.textContent.includes('This note went to the Bin')))
  if (shots) await sticky.screenshot({ path: join(shots, 'sticky-after.png') })
  await sticky.locator('text=Bring it back').click()
  await wait(900)
  check('"Bring it back" takes it out of the Bin', (await h.evaluate((id) => window.api.captures.get(id), one.id)).status !== 'discarded')
  await h.evaluate((id) => window.api.stick('capture', id, false), one.id)
  void v
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
