// Small leftovers from the 3 Nov bug notes, each read in the page:
// - Settings' theme dial: no two swatches on its ring touch (each at least 40px from the next, centre to centre)
// - Today's "Happy <day>" line is there whole from its first frame, never typed in (the Journal box types its own hints)
// - Writing: an empty folder is drawn hollow (dashed outline, no front); one with pages is not
// - a picture's caption riding beside the pointer is 0.6875rem (11px), down from 0.75rem (Settings' picture sample shows the same label)
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/small-leftovers.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  // The dial.
  await c.go('settings')
  await h.click('[data-section="Appearance"]').catch(() => undefined)
  await wait(900)
  await h.locator('[data-theme-dial]').scrollIntoViewIfNeeded()
  await wait(600)
  const gaps = await h.evaluate(() => {
    const dots = [...document.querySelectorAll('[data-theme-dial] [data-detent]')].map((one) => { const r = one.getBoundingClientRect(); return { i: Number(one.dataset.detent), x: r.x + r.width / 2, y: r.y + r.height / 2 } }).sort((a, b) => a.i - b.i)
    return dots.map((one, n) => Math.round(Math.hypot(one.x - dots[(n + 1) % dots.length].x, one.y - dots[(n + 1) % dots.length].y)))
  })
  check('Settings dial: every swatch at least 40px from the next round the ring', gaps.length >= 14 && Math.min(...gaps) >= 40, gaps.join(' '))
  if (shots) await (await h.$('[data-theme-dial]')).screenshot({ path: `${shots}/dial-light.png` })
  await c.look('dark'); await wait(500)
  if (shots) await (await h.$('[data-theme-dial]')).screenshot({ path: `${shots}/dial-dark.png` })
  await c.look('light')
  // The caption label, from the picture sample.
  // The sample under "Captions follow the pointer": each sample is pointed at until a caption rides beside the pointer.
  const label = () => h.evaluate(() => { const one = [...document.querySelectorAll('span[aria-hidden]')].find((el) => el.textContent === 'Harbour at dawn' && getComputedStyle(el).position === 'fixed'); return one ? `${parseFloat(getComputedStyle(one).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize)}rem` : null })
  let size = null
  let box = null
  for (let n = 0; n < (await h.locator('[data-picture-sample]').count()) && !size; n++) {
    const sample = h.locator('[data-picture-sample]').nth(n)
    await sample.scrollIntoViewIfNeeded()
    box = await sample.boundingBox()
    await h.mouse.move(box.x + box.width / 2 - 12, box.y + box.height / 2)
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
    await wait(500)
    size = await label()
  }
  check('A picture\'s caption beside the pointer is a size down: 0.6875rem (11px at 16px text; it was 0.75rem)', size === '0.6875rem', String(size))
  if (shots) await h.screenshot({ path: `${shots}/caption-follow.png`, clip: { x: box.x - 160, y: box.y - 40, width: box.width + 320, height: box.height + 120 } })
  await h.mouse.move(5, 5)
  // Today's greeting: whole from the first frame it shows.
  const today = await h.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  await h.evaluate(() => { window.__greet = []; const end = performance.now() + 5000; const tick = () => { const p = document.querySelector('[data-day-greeting]'); if (p && p.textContent) window.__greet.push(p.querySelector('.mf-typed, [data-line]') ? -1 : p.textContent.length); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await send('day', today)
  await wait(5500)
  const lengths = await h.evaluate(() => window.__greet)
  check('Today: "Happy <day>" is whole from its first frame, never typed', lengths.length > 5 && lengths[0] > 0 && lengths.every((n) => n === lengths[0]) && /^Happy /.test(await h.evaluate(() => document.querySelector('[data-day-greeting]')?.textContent ?? '')), `${lengths[0]} .. ${lengths.at(-1)} (${new Set(lengths).size} lengths)`)
  // Folders: empty looks empty.
  await c.go('articles')
  await wait(1200)
  const folders = await h.evaluate(() => [...document.querySelectorAll('[data-group-tile]')].map((tile) => { const row = tile.closest('[data-row-menu], li, [role="row"]') ?? tile.parentElement; return { text: (row?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 40), empty: !!tile.querySelector('[data-folder-empty]') } }))
  const trips = folders.find((one) => one.text.includes('Trips to write up'))
  check('Writing: the empty folder "Trips to write up" is drawn hollow', !!trips?.empty, JSON.stringify(folders))
  check('...and the folders with pages are not', folders.filter((one) => !one.text.includes('Trips')).every((one) => !one.empty) && folders.length >= 3)
  if (shots) await h.locator('[data-group-tile]').first().evaluate((el) => el.scrollIntoView({ block: 'center' })), await h.screenshot({ path: `${shots}/folders-light.png` })
  await c.look('dark'); await wait(500)
  if (shots) await h.screenshot({ path: `${shots}/folders-dark.png` })
  await c.look('light')
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
