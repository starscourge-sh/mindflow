// The PDF rail keeps the page you are on in its middle (at the book's ends as near as it can), with one glide
// per page turned; a wheel on the rail is never pulled against, and once it stops the rail glides to the page you
// are on. The View menu's "Only this page in colour" greys the other thumbnails with a filter, draws nothing again,
// and is remembered. Measures fast reading on a 1,011-page book: the slowest frames, rail shut and rail open with both on.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-rail-centre.mjs
// QA_SHOTS=<folder> saves light and dark pictures and frames every 50ms through one page turn.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const PAGES = 1011
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const LIST = '.pdf-reader .pdf-rail-list'
// The current thumbnail's middle against the rail's middle, and where the rail is in its range.
const where = () => h.evaluate((sel) => {
  const list = document.querySelector(sel)
  const here = list?.querySelector('.pdf-thumb.is-here')
  if (!list || !here) return null
  const a = list.getBoundingClientRect(), b = here.getBoundingClientRect()
  return { off: Math.round((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2), top: Math.round(list.scrollTop), max: list.scrollHeight - list.clientHeight, page: Number(here.dataset.thumbPage) }
}, LIST)
const goTo = (page) => h.evaluate((page) => document.querySelector(`.pdf-reader .pdf-page[data-page="${page}"]`)?.scrollIntoView({ block: 'start' }), page)
let src = ''
const openReader = async () => {
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Long.pdf' } })), src)
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 })
  await wait(1500)
}
const openRail = async () => {
  if (!(await h.$(LIST))) await h.click('.pdf-reader button[aria-label="Sidebar"]')
  await h.waitForSelector(`${LIST} .pdf-thumb`, { timeout: 8000 })
  await wait(600)
}
// Fast reading with the wheel, 60px every 16ms, every frame's gap timed.
const fastRead = async () => {
  await h.evaluate(() => {
    const t = (window.__frames = { gaps: [], last: performance.now(), raf: 0 })
    const tick = (now) => { t.gaps.push(now - t.last); t.last = now; t.raf = requestAnimationFrame(tick) }
    t.raf = requestAnimationFrame(tick)
  })
  const box = await h.locator('.pdf-reader .pdf-reader-scroll').boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 300; i++) { void h.mouse.wheel(0, 60); await wait(16) }
  await wait(300)
  return h.evaluate(() => {
    cancelAnimationFrame(window.__frames.raf)
    const s = window.__frames.gaps.slice(1).sort((a, b) => a - b)
    const at = (q) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))])
    return { frames: s.length, median: at(0.5), p99: at(0.99), worst: Math.round(s.at(-1)), over16: s.filter((x) => x > 17).length }
  })
}
try {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= PAGES; n++) pdf.addPage([400, 560]).drawText(`Page ${n}`, { x: 40, y: 480, size: 40, font })
  const dir = mkdtempSync(join(process.env.QA_DATA ?? tmpdir(), 'rail-'))
  const path = join(dir, 'Long.pdf'); writeFileSync(path, await pdf.save())
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.removeItem('pdf-one-colour'))
  src = (await h.evaluate((p) => window.api.haligtree('media:add', [{ path: p }]), path)).added[0].src
  await openReader()
  // The rail shut for the figure to compare against.
  if (await h.$(LIST)) await h.click('.pdf-reader button[aria-label="Sidebar"]')
  await wait(500)

  // 0. Fast reading with the rail shut, the figure to compare against.
  await goTo(1); await wait(800)
  const shut = await fastRead()

  await openRail()
  // 1. Centred on a page in the middle of the book, at its first page, and at its last.
  await goTo(150); await wait(1500)
  let at = await where()
  check('page 150: its thumbnail is in the rail\'s middle', at && at.page === 150 && Math.abs(at.off) <= 4, JSON.stringify(at))
  if (SHOTS) {
    await goTo(151)
    for (let f = 0; f < 10; f++) { await h.screenshot({ path: join(SHOTS, `turn-${String(f).padStart(2, '0')}.png`) }); await wait(50) }
  }
  await goTo(1); await wait(1500)
  at = await where()
  check('page 1: the rail is at its top, as near the middle as it can be', at && at.page === 1 && at.top === 0, JSON.stringify(at))
  await goTo(PAGES); await wait(1500)
  at = await where()
  check(`page ${PAGES}: the rail is at its end`, at && at.page === PAGES && at.top >= at.max - 1, JSON.stringify(at))

  // 2. A wheel on the rail is not pulled against while a page turns; once it stops, the rail centres.
  await goTo(300); await wait(1500)
  const rail = await h.locator(LIST).boundingBox()
  await h.mouse.move(rail.x + rail.width / 2, rail.y + rail.height / 2)
  // A stream of small wheel steps, as a trackpad sends, every scroll of the rail recorded in the window; a page
  // turned seven steps in.
  await h.evaluate((sel) => { const list = document.querySelector(sel); window.__tops = []; list.addEventListener('scroll', () => window.__tops.push(Math.round(list.scrollTop)), { passive: true }) }, LIST)
  for (let i = 0; i < 24; i++) {
    void h.mouse.wheel(0, -50)
    if (i === 6) void goTo(320)
    await wait(16)
  }
  await wait(60)
  const tops = await h.evaluate(() => window.__tops.slice())
  // A thumbnail above drawn a little taller nudges the list by a few pixels; a pull to the page is thousands.
  const pulled = tops.slice(1).some((top, i) => top > tops[i] + 100)
  check('while the wheel moves the rail, a page turned does not pull it back', !pulled, tops.join(','))
  await wait(600)
  const resting = await where()
  check('the pointer resting on the rail after the wheel, the rail stays where the hand left it', resting && resting.top < tops.at(-1) + 100, JSON.stringify(resting))
  const pages = await h.locator('.pdf-reader .pdf-reader-scroll').boundingBox()
  await h.mouse.move(pages.x + pages.width / 2, pages.y + pages.height / 2)
  await wait(1500)
  at = await where()
  check('once the pointer leaves the rail, it glides to the page you are on', at && at.page === 320 && Math.abs(at.off) <= 4, JSON.stringify(at))

  // 3. "Only this page in colour" from the View menu: a filter, nothing drawn again.
  await h.evaluate(() => {
    const p = CanvasRenderingContext2D.prototype
    // Only a thumbnail already drawn and drawn on again counts: one coming into view as the rail settles is
    // nearView's ordinary first drawing, nothing to do with the switch, and is counted apart.
    window.__draws = 0
    window.__fresh = 0
    for (const name of ['drawImage', 'putImageData', 'fillRect', 'save']) { const was = p[name]; p[name] = function (...args) { if (this.canvas?.closest?.('.pdf-rail')) { if (this.canvas.dataset.drawn) window.__draws++; else window.__fresh++ } return was.apply(this, args) } }
  })
  await h.click('.pdf-reader button[aria-label="View"]')
  await h.getByRole('menuitemcheckbox', { name: 'Only this page in colour' }).click({ timeout: 3000 }).catch(() => {})
  await wait(500)
  const grey = await h.evaluate((sel) => {
    const list = document.querySelector(sel)
    const other = list.querySelector('.pdf-thumb:not(.is-here) .pdf-thumb-sheet canvas')
    const here = list.querySelector('.pdf-thumb.is-here .pdf-thumb-sheet canvas')
    return { on: list.closest('.pdf-rail').hasAttribute('data-one-in-colour'), other: other && getComputedStyle(other).filter, here: here && getComputedStyle(here).filter, draws: window.__draws, fresh: window.__fresh, stored: localStorage.getItem('pdf-one-colour') }
  }, LIST)
  check('the switch is on in the menu', await h.getByRole('menuitemcheckbox', { name: 'Only this page in colour' }).getAttribute('aria-checked', { timeout: 2000 }).catch(() => null) === 'true')
  check('other thumbnails are grey', grey.on && /grayscale\(1\)/.test(grey.other ?? ''), JSON.stringify(grey))
  check('the page you are on is in colour', grey.here === 'none', grey.here)
  check('turning it on drew no thumbnail again', grey.draws === 0, `${grey.draws} drawn again, ${grey.fresh} drawn for the first time as they came into view`)
  await h.keyboard.press('Escape'); await wait(300)
  if (SHOTS) await c.both(join(SHOTS, 'rail-one-colour'))

  // 4. Fast reading with the rail open, centred, both with "Only this page in colour" on and off.
  await goTo(1); await wait(1500)
  const coloured = await fastRead()
  await h.evaluate(() => localStorage.setItem('pdf-one-colour', '0'))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:pdf-one-colour')))
  await goTo(1); await wait(1500)
  const plain = await fastRead()
  await h.evaluate(() => localStorage.setItem('pdf-one-colour', '1'))
  console.log(`MEASURE fast reading, ${PAGES} pages, rail shut: ${JSON.stringify(shut)}`)
  console.log(`MEASURE fast reading, rail open, only this page in colour off: ${JSON.stringify(plain)}`)
  console.log(`MEASURE fast reading, rail open, only this page in colour on: ${JSON.stringify(coloured)}`)
  // Not a pass or fail: on the same machine a main build, with no such switch, read 30 then 39ms in this same order, so the two runs differ by about that much on their own.

  // 5. Remembered: the window opened again, the rail is still greyed.
  await h.reload(); await wait(2500)
  await openReader()
  await openRail()
  check('opened again, the choice is remembered', await h.evaluate((sel) => document.querySelector(sel)?.closest('.pdf-rail')?.hasAttribute('data-one-in-colour'), LIST))
  check('no errors in the main window', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await h.evaluate(() => localStorage.removeItem('pdf-one-colour')).catch(() => {})
  await c.close?.()
}
done()
