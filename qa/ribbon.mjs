// The ribbon (pdf/ribbon.tsx), as readers use it. In a PDF, one column: right-click page 3, "Lay the ribbon here" (about
// 84px long); closed and opened again it lands on page 3; read on by hand to page 5 (a pill at the TOP of the view, beside
// the pages and never over one, then says "p. 3 ↑"), opened again: still page 3, with the line "You read on to p. 5,
// past your ribbon"; ⇧⌘D goes back to it. Dragged along page 3's top edge, the hand drifting, it follows the pointer
// 1:1 both ways and lies on page 3 again; Esc mid-drag glides it back. In two pages: laid by the menu on the LEFT page
// of a row (4) and the RIGHT page of the next (7), each on its own page's top edge; dragged across its row it lies on
// the other page (6); right-click it for a colour (blue, shown as pointed at, kept); Details says "Ribbon on p. 6" with
// a mark on the strip, and "Go to it" goes there. Then a power user drags it from p. 4 (left) to p. 7 (the right page of
// the next row): the "p. N" chip names the page under its top end at every step, one trackpad tap per page crossed; and
// on, held at the foot of the view, the pages scroll under it to a page far below, where it lies on that page's top
// edge. Read back up, the pill sits at the FOOT ("p. N ↓"), beside the pages; at the ribbon, it is gone; read past it,
// at the top. From far away "Go to it" lands with the ribbon in view and it bounces (its stretch above 1, back to 1
// within 700 ms). In a saved article: ⌘D lays it on the
// paragraph being read; right-click, "Take the ribbon out", then ⌘Z puts it back. The ribbon's place is read every
// 50 ms by the page's clock through each slide and settle. QA_SHOTS=<folder> keeps a picture every 50 ms.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/ribbon.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { fandomPage, png } from './fandom-page.mjs'

process.env.QA_ARGS ??= '--sandbox'
const SITE = 'https://93.184.216.34'
const CDN = 'https://93.184.216.35'
const shots = process.env.QA_SHOTS ?? ''
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, electron, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'

/** Where the ribbon is drawn (its translate, so a sway's turn does not count as a move), and how it lies: `sx`, `sy`
 *  its top left on screen (its room's place plus its translate, scaled as the pages are), `stretch` its bounce, `chip`
 *  what the chip beside it says while it is carried. */
const ribbon = () => h.evaluate(() => {
  const el = document.querySelector('.ribbon:not(.ribbon-tab)') ?? document.querySelector('.ribbon-tab')
  const at = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el?.style.transform ?? '')
  const room = el?.parentElement
  const r = room?.getBoundingClientRect()
  const scale = room && r && room.offsetWidth ? r.width / room.offsetWidth : 1
  const stretch = Number(/scaleY\(([\d.]+)\)/.exec(el?.style.transform ?? '')?.[1] ?? 1)
  // `ms`: the page's own clock as it was read, so the time between samples is the real one, however slow the run.
  return el && at && r ? { x: Number(at[1]), y: Number(at[2]), sx: r.left + Number(at[1]) * scale, sy: r.top + Number(at[2]) * scale, scale, stretch, state: el.dataset.ribbon, at: el.dataset.ribbonAt, h: parseFloat(el.style.height), chip: document.querySelector('[data-ribbon-chip]')?.getAttribute('data-ribbon-chip') ?? null, ms: performance.now() } : null
})

/** The page under a point on screen (by x and y), or the nearest: what the chip should name. */
const pageAt = (x, y) => h.evaluate(([x, y]) => {
  let best = null
  for (const one of document.querySelectorAll('.pdf-reader .pdf-page[data-page]')) {
    const r = one.getBoundingClientRect()
    const d = Math.max(r.left - x, x - r.right, 0) ** 2 + Math.max(r.top - y, y - r.bottom, 0) ** 2
    if (!best || d < best.d) best = { page: Number(one.dataset.page), d }
  }
  return best?.page ?? null
}, [x, y])

/** Trackpad taps asked for so far (main counts them under HALIGTREE_QA_AWAY and never plays one). */
const taps = () => electron.evaluate(() => globalThis.haligtreeTapKinds().length)

/** The out-of-sight pill: shown or not, which way it points, its words, its box, and whether it lies over any page. */
const pill = () => h.evaluate(() => {
  const el = document.querySelector('.ribbon-away')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
  const over = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page]')].some((one) => { const p = one.getBoundingClientRect(); return r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top })
  return { shown: el.hasAttribute('data-shown') && getComputedStyle(el).opacity === '1', side: el.getAttribute('data-ribbon-away'), text: el.textContent, top: r.top - box.top, bottom: box.bottom - r.bottom, over }
})

/** Every 50 ms until stopped: the ribbon's place, and with QA_SHOTS a picture. At most 200 samples (10 s). */
function sampler(name) {
  const samples = []
  let on = true
  let n = 0
  const run = (async () => {
    while (on && n < 200) {
      const one = await ribbon()
      samples.push({ ...one })
      if (shots) await h.screenshot({ path: join(shots, `ribbon-${name}-${String(n).padStart(3, '0')}.png`) }).catch(() => {})
      n++
      await wait(50)
    }
  })()
  return async () => ((on = false), await run, samples)
}

/** The page whose top is nearest the top of the pages: the one the reader landed on. */
const landedOn = () => h.evaluate(() => {
  const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
  let best = null
  for (const sheet of document.querySelectorAll('.pdf-reader .pdf-page[data-page]')) {
    const d = Math.abs(sheet.getBoundingClientRect().top - box.top)
    if (!best || d < best.d) best = { page: Number(sheet.dataset.page), d }
  }
  return best?.page ?? null
})

/** The page the reader says you are on: the number in its bar (the file's own pages here, no printed labels). */
const shownPage = () => h.evaluate(() => Number(document.querySelector('.pdf-reader-page [data-scrub-field]')?.value) || null)

/** The PDF's own key in the store (its attachment's src in the note), read once it is dropped in. */
let pdfSrc = null
const SRC = () => pdfSrc
/** The laid ribbon (drawn in the pages' own box), not the tab at the top. */
const LAID = '.ribbon:not(.ribbon-tab)'
/** How far a laid ribbon stands above its page's top edge (ribbon.tsx OVERHANG). */
const OVERHANG = 6

/** The laid ribbon against its page `n`, as drawn now: how far its top is from where it belongs (its page's top edge
 *  less the overhang, scaled as a pinch scales the pages), how much the pages are scaled, and along the page. */
const against = (n) => h.evaluate(([n, over]) => {
  const el = document.querySelector('.ribbon:not(.ribbon-tab)')
  const page = document.querySelector(`.pdf-page[data-page="${n}"]`)
  if (!el || !page) return null
  // The ribbon's own box before its sway's turn: its offsetParent is the pages' box, as the page's is.
  const pr = page.getBoundingClientRect()
  const scale = pr.width / page.offsetWidth
  const at = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform)
  const host = el.parentElement.getBoundingClientRect()
  const top = host.top + Number(at[2]) * scale
  const left = host.left + Number(at[1]) * scale
  return { off: top - (pr.top - over * scale), scale, share: (left - pr.left) / pr.width, ms: performance.now() }
}, [n, OVERHANG])

/** Page `n`'s top edge brought to about `px` below the top of the pages, by the wheel, as a hand would. */
async function bringTop(n, px) {
  const box = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 40; i++) {
    const top = await h.evaluate((n) => document.querySelector(`.pdf-page[data-page="${n}"]`).getBoundingClientRect().top - document.querySelector('.pdf-reader-scroll').getBoundingClientRect().top, n)
    if (Math.abs(top - px) < 40) break
    await h.mouse.wheel(0, Math.max(-200, Math.min(200, top - px))); await wait(60)
  }
  await wait(500)
}

/** Right-click on page `n`, a little into it, and "Lay the ribbon here". */
async function layByMenu(n) {
  const r = await h.locator(`.pdf-page[data-page="${n}"]`).boundingBox()
  await h.mouse.click(r.x + r.width * 0.3, r.y + 80, { button: 'right' }); await wait(400)
  await h.click('[data-ribbon-lay-menu]'); await wait(900)
}

/** The ribbon lies across page `n`'s top edge: its top in the gap above, its body over the page, inside its width. */
const onTopOf = (n) => h.evaluate((n) => {
  const r = document.querySelector('.ribbon:not(.ribbon-tab)').getBoundingClientRect()
  const page = document.querySelector(`.pdf-page[data-page="${n}"]`).getBoundingClientRect()
  const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
  const mid = (r.left + r.right) / 2
  return r.top < page.top && r.bottom > page.top && r.top > box.top && mid > page.left && mid < page.right
}, n)

/** The satin's colour as drawn. */
const satin = () => h.evaluate(() => getComputedStyle(document.querySelector('.ribbon:not(.ribbon-tab) .ribbon-satin')).backgroundColor + getComputedStyle(document.querySelector('.ribbon:not(.ribbon-tab)')).getPropertyValue('--mf-ribbon'))

/** Where it moves on its own (not held: settling, or gliding back on Esc), each step scaled to a real 50 ms by the
 *  page's clock: a glide moves well under 60px in 50 ms; a jump is far over. And still by 700 ms after `t0`. */
function noJump(name, frames, t0) {
  const own = frames.slice(1).map((one, at) => [frames[at], one]).filter(([a, b]) => a.state !== 'held' && b.state !== 'held' && a.ms >= t0 - 60)
  const rates = own.map(([a, b]) => (Math.hypot(b.x - a.x, b.y - a.y) * 50) / Math.max(1, b.ms - a.ms))
  console.log(`  ${name}: ${frames.length} samples, ms between them: ${frames.slice(1).map((one, at) => Math.round(one.ms - frames[at].ms)).join(' ')}`)
  check(`${name}: no jump on its own (px per 50 ms)`, own.length >= 3 && Math.max(...rates) < 60, `${own.length} steps, fastest ${Math.max(0, ...rates).toFixed(1)}px per 50 ms`)
  const last = frames[frames.length - 1]
  const late = frames.filter((one) => one.ms >= t0 + 600) // samples ~110 ms apart: the last may fall just short of 700
  check(`${name}: comes to rest by 700 ms`, late.length >= 1 && late.every((one) => Math.abs(one.x - last.x) < 1 && Math.abs(one.y - last.y) < 1), JSON.stringify(frames.filter((one) => one.ms >= t0).map((one) => [Math.round(one.ms - t0), one.x, one.y])))
}

/** Out to the note and the book opened again from its card, as a reader closes and reopens it. */
async function reopen(note) {
  await s.send('article', note); await wait(1200)
  await h.click('.is-pdf button[aria-label="Open ribbon-probe.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"]', { timeout: 15000 })
  await h.waitForSelector('.ribbon[data-ribbon="laid"]', { timeout: 8000 }).catch(() => {})
  await wait(1200)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Ribbon Probe')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 24; n++) {
    const page = pdf.addPage([400, 560])
    for (let line = 0; line < 30; line++) page.drawText(`Page ${n}, line ${line + 1}`, { x: 40, y: 510 - line * 15, size: 11, font })
  }
  const bytes = [...(await pdf.save())]
  const note = await v('article:new')
  await v('item:save', note, { title: 'With a book to mark', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await s.send('article', note); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'ribbon-probe.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open ribbon-probe.pdf"]', { timeout: 15000 })
  // The PDF's key in the store: the src its attachment carries in the note.
  pdfSrc = await h.evaluate((sel) => {
    let found = null
    const walk = (node) => { if (found) return; const src = node?.attrs?.src; if (typeof src === 'string' && /\.pdf/i.test(src)) found = src; (node?.content ?? []).forEach(walk) }
    walk(document.querySelector(sel).editor.getJSON())
    return found
  }, EDITOR)
  check('the PDF is in the note', !!pdfSrc, String(pdfSrc))
  await h.click('.is-pdf button[aria-label="Open ribbon-probe.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"]', { timeout: 15000 }); await wait(1000)

  // A first look: the ribbon hangs from the top of the pages, a short tab with the hand.
  const hanging = await ribbon()
  check('a new book shows the ribbon hanging at the top', hanging?.state === 'hanging' && hanging.y < 4 && hanging.h <= 60, JSON.stringify(hanging))
  check('it shows the hand', (await h.evaluate(() => getComputedStyle(document.querySelector('.ribbon-tab')).cursor)) === 'pointer')

  // An everyday reader: page 3 brought to about 400px down by hand, then right-click on it, "Lay the ribbon here".
  const scroller = await h.locator('.pdf-reader-scroll').boundingBox()
  await bringTop(3, 400)
  await layByMenu(3)
  const laid = await ribbon()
  check('laid by the menu, it lies on page 3', laid?.state === 'laid' && laid.at === '3', JSON.stringify(laid))
  await wait(400)
  const length = (await ribbon())?.h
  check('a laid ribbon is about 84px long (no longer 138)', Math.abs(length - 84) <= 2, String(length))
  check('across page 3\'s top edge, inside its width, on screen', await onTopOf(3))
  const edge = await against(3)
  check('its top is on page 3\'s own top edge, standing a few px above it (not in the gap)', edge && Math.abs(edge.off) <= 1, JSON.stringify(edge))

  // A first-timer clicks the laid ribbon: its own small menu opens there, its colours and "Take the ribbon out".
  check('a laid ribbon shows the open hand', (await h.evaluate(() => getComputedStyle(document.querySelector('.ribbon:not(.ribbon-tab)')).cursor)) === 'grab')
  const lr = await h.locator(LAID).boundingBox()
  await h.mouse.click(lr.x + lr.width / 2, lr.y + 50); await wait(500)
  check('a click on it opens its own menu', (await h.locator('[data-ribbon-menu]').count()) === 1 && (await h.locator('[data-ribbon-menu] [data-ribbon-hue-pick]').count()) === 9 && (await h.locator('[data-ribbon-menu] [data-ribbon-out-own]').count()) === 1)
  check('and the click did not move it', (await v('ribbon:get', SRC()))?.page === 3)
  await h.keyboard.press('Escape'); await wait(400)
  check('Esc closes its menu', (await h.locator('[data-ribbon-menu]').count()) === 0)

  // The page's own right-click: the ribbon rows, and no longer the chapter's cards (their home is the sparkles button).
  const p2 = await h.locator('.pdf-page[data-page="3"]').boundingBox()
  await h.mouse.click(p2.x + p2.width * 0.3, p2.y + 200, { button: 'right' }); await wait(400)
  check('a page\'s right-click has no "Five cards" line', (await h.locator('[data-ribbon-lay-menu]').count()) === 1 && (await h.locator('[data-chapter-cards-menu]').count()) === 0)
  await h.keyboard.press('Escape'); await wait(400)

  // A pinch over the pages (ctrl and the wheel, as a trackpad's pinch arrives) and a zoom step: every 50 ms the ribbon
  // stays on its page's top edge, within 1px, and at the same place along it.
  const pinch = []
  const ps = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(ps.x + ps.width / 2, ps.y + ps.height / 2)
  await h.keyboard.down('Control')
  for (let i = 0; i < 16; i++) {
    await h.mouse.wheel(0, -12)
    await wait(35)
    pinch.push(await against(3))
  }
  await h.keyboard.up('Control')
  for (let i = 0; i < 16; i++) { await wait(50); pinch.push(await against(3)) }
  await h.keyboard.press('Meta+Equal')
  for (let i = 0; i < 12; i++) { await wait(50); pinch.push(await against(3)) }
  const seen = pinch.filter(Boolean)
  console.log('  pinch: ' + seen.map((one) => `${one.scale.toFixed(2)}x off ${one.off.toFixed(1)} at ${one.share.toFixed(3)}`).join(' | '))
  check('pinched and zoomed, the pages did grow', seen.some((one) => one.scale > 1.1) || (await h.evaluate(() => document.querySelector('.pdf-reader').dataset.zoom)) !== '1', JSON.stringify(seen.at(-1)))
  check('through the pinch and the zoom step, its top stays on its page\'s edge within 1px', seen.length >= 40 && seen.every((one) => Math.abs(one.off) <= 1), `worst ${Math.max(...seen.map((one) => Math.abs(one.off))).toFixed(2)}px`)
  check('and at the same place along it', Math.max(...seen.map((one) => one.share)) - Math.min(...seen.map((one) => one.share)) < 0.01)
  await h.keyboard.press('Meta+Digit0'); await wait(900)

  // Closed and opened again: page 3, where the ribbon is.
  await reopen(note)
  check('opened again, it lands on the ribbon, page 3', (await landedOn()) === 3, `landed on ${await landedOn()}`)
  check('with no "read on" line: nothing was read past it', !(await h.locator('[data-ribbon-read-on]').count()))

  // Read on by hand to page 5 (until the bar says 5), then opened again: page 3, with the line offering page 5.
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2)
  for (let i = 0; i < 60 && (await shownPage()) !== 5; i++) {
    const top = await h.evaluate(() => document.querySelector('.pdf-page[data-page="5"]').getBoundingClientRect().top - document.querySelector('.pdf-reader-scroll').getBoundingClientRect().top)
    await h.mouse.wheel(0, Math.max(-120, Math.min(120, top + 20))); await wait(80)
  }
  await wait(1200)
  check('read on by hand, the bar says page 5', (await shownPage()) === 5, `bar says ${await shownPage()}`)
  // Out of sight above, a pill at the top of the view names its page, beside the pages, never over one's words.
  const above = await pill()
  check('scrolled past it, a pill at the TOP says "p. 3 ↑", beside the pages, over none', above?.shown && above.side === 'up' && /p\. 3/.test(above.text) && /↑/.test(above.text) && above.top < 40 && !above.over, JSON.stringify(above))
  await reopen(note)
  check('read on to page 5, opened again: still page 3', (await landedOn()) === 3, `landed on ${await landedOn()}`)
  const line = await h.locator('[data-ribbon-read-on]').textContent().catch(() => '')
  check('and a line says how far you read', /You read on to p\. 5, past your ribbon/.test(line ?? ''), line)
  await h.click('[data-ribbon-read-on-go]'); await wait(900)
  check('"Go there" goes to page 5', (await landedOn()) === 5, `landed on ${await landedOn()}`)

  // A power user's way back: ⇧⌘D glides to the ribbon's page.
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2)
  await h.keyboard.press('Meta+Shift+KeyD'); await wait(1200)
  check('⇧⌘D goes back to the ribbon, page 3', (await landedOn()) === 3, `landed on ${await landedOn()}`)

  // Dragged by hand along page 3's top edge, the hand drifting up and down: it follows the pointer 1:1 both ways, and
  // let go it lies on page 3's edge again, no jump. (Brought down the view first, clear of the edge where it scrolls.)
  await bringTop(3, 300)
  const before = await ribbon()
  const band = await h.locator(LAID).boundingBox()
  const grip = { x: band.x + band.width / 2, y: band.y + 30 }
  const slide = sampler('slide')
  await h.mouse.move(grip.x, grip.y)
  await h.mouse.down()
  const held = []
  for (let i = 1; i <= 30; i++) {
    const x = grip.x - (120 * i) / 30
    // A hand drifts down and up as it slides: the ribbon stays on its edge.
    await h.mouse.move(x, grip.y + (i % 2 ? 40 : -10))
    await wait(16)
    if (i > 3) held.push({ x, y: grip.y + (i % 2 ? 40 : -10), at: await ribbon() })
  }
  await h.mouse.up()
  const letGo = await h.evaluate(() => performance.now())
  await wait(800)
  const slid = await slide()
  const gaps = held.map(({ x, at }) => x - at.sx)
  const gapsY = held.map(({ y, at }) => y - at.sy)
  check('dragged, it follows the pointer 1:1 sideways', Math.max(...gaps) - Math.min(...gaps) <= 2, `gap ${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)}px`)
  check('and 1:1 up and down as the hand drifts', Math.max(...gapsY) - Math.min(...gapsY) <= 2, `gap ${Math.min(...gapsY).toFixed(1)} to ${Math.max(...gapsY).toFixed(1)}px`)
  noJump('slide', slid, letGo)
  const after = await ribbon()
  const keptSlid = await v('ribbon:get', SRC())
  check('let go, it rests where it was slid, still on page 3, on its top edge', after.at === '3' && after.x < before.x - 100 && Math.abs(after.y - before.y) < 1 && keptSlid?.page === 3 && keptSlid.across > 0 && keptSlid.across < 0.9, `${JSON.stringify(after)} kept ${JSON.stringify(keptSlid)}`)

  // Esc mid-slide: it glides back to where it lay.
  const band2 = await h.locator(LAID).boundingBox()
  const esc = sampler('esc')
  await h.mouse.move(band2.x + band2.width / 2, band2.y + 30)
  await h.mouse.down()
  for (let i = 1; i <= 15; i++) { await h.mouse.move(band2.x + band2.width / 2 + 4 * i, band2.y + 30); await wait(16) }
  const midway = await ribbon()
  await h.keyboard.press('Escape')
  const escAt = await h.evaluate(() => performance.now())
  await wait(800)
  await h.mouse.up()
  const backFrames = await esc()
  const home = await ribbon()
  check('held, it had moved with the pointer', midway.state === 'held' && midway.x > after.x + 40, JSON.stringify(midway))
  check('Esc: it glides back to where it lay, and the reader stays open', Math.abs(home.x - after.x) < 1 && home.state === 'laid' && (await h.locator('.pdf-reader').count()) > 0, JSON.stringify(home))
  noJump('esc', backFrames, escAt)
  check('and its place is not changed', (await v('ribbon:get', SRC()))?.across === keptSlid.across)

  // Two pages: an everyday reader switches to the spread, lays the ribbon on the LEFT page of a row (page 4, of 4|5).
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:pdf-layout', { detail: 'spread' })))
  await h.waitForSelector('.pdf-pages.is-spread', { timeout: 8000 }); await wait(900)
  await bringTop(4, 200)
  await layByMenu(4)
  check('in two pages, laid on the left page: page 4', (await ribbon())?.at === '4' && (await v('ribbon:get', SRC()))?.page === 4, JSON.stringify(await ribbon()))
  check('on page 4\'s top edge, never over page 5', await onTopOf(4))
  // And on the RIGHT page of the next row (page 7, of 6|7).
  await bringTop(7, 200)
  await layByMenu(7)
  check('laid on the right page: page 7', (await ribbon())?.at === '7', JSON.stringify(await ribbon()))
  check('on page 7\'s top edge, never over page 6', await onTopOf(7))

  // Slid across its row from the right page to the left: let go over page 6, it lies on page 6.
  const onRight = await h.locator(LAID).boundingBox()
  const leftMid = await h.evaluate(() => { const r = document.querySelector('.pdf-page[data-page="6"]').getBoundingClientRect(); return r.left + r.width / 2 })
  const across = sampler('row')
  const from = { x: onRight.x + onRight.width / 2, y: onRight.y + 30 }
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  for (let i = 1; i <= 30; i++) { await h.mouse.move(from.x + ((leftMid - from.x) * i) / 30, from.y); await wait(16) }
  await h.mouse.up()
  const rowGo = await h.evaluate(() => performance.now())
  await wait(800)
  noJump('row', await across(), rowGo)
  check('slid across the row, it lies on the left page: page 6', (await ribbon())?.at === '6' && (await v('ribbon:get', SRC()))?.page === 6, JSON.stringify(await ribbon()))
  check('on page 6\'s top edge', await onTopOf(6))
  check('a notice says it moved', /Ribbon moved to p\. 6/.test(await h.evaluate(() => document.body.innerText)))

  // Its colour: right-click the ribbon, point at blue (shown at once), pick it (kept and drawn).
  const red = await satin()
  const r6 = await h.locator(LAID).boundingBox()
  await h.mouse.click(r6.x + r6.width / 2, r6.y + 40, { button: 'right' }); await wait(500)
  check('right-click on the ribbon shows its colours', (await h.locator('[data-ribbon-colours] [data-ribbon-hue-pick]').count()) === 9)
  await h.hover('[data-ribbon-hue-pick="blue"]'); await wait(250)
  const peek = await satin()
  check('pointing at blue shows it on the ribbon at once', peek !== red, `${red} → ${peek}`)
  await h.click('[data-ribbon-hue-pick="blue"]'); await wait(500)
  check('picked: kept as blue and drawn blue', (await v('ribbon:get', SRC()))?.hue === 'blue' && (await satin()) === peek, `${await satin()} kept ${JSON.stringify(await v('ribbon:get', SRC()))}`)

  // The details panel: "Ribbon on p. 6", a mark on the strip, and "Go to it" takes you there.
  await bringTop(2, 100)
  if (!(await h.$('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
  await h.waitForSelector('[data-book-ribbon]', { timeout: 8000 }).catch(() => {})
  check('Details says where the ribbon lies', /Ribbon on p\. 6/.test((await h.locator('[data-book-ribbon]').textContent().catch(() => '')) ?? ''))
  check('and the strip marks its page', (await h.locator('[data-book-ribbon-tick="6"]').count()) === 1)
  await h.click('[data-book-ribbon-go]'); await wait(1200)
  check('"Go to it" goes to the ribbon\'s row', [6, 7].includes(await landedOn()), `landed on ${await landedOn()}`)

  // A power user drags it in two pages: from p. 4 (a left page) to p. 7 (the right page of the next row). At every
  // step the chip names the page under its top end, and each page crossed is one tap on the trackpad, never repeated.
  await bringTop(4, 220)
  await layByMenu(4)
  const b4 = await h.locator(LAID).boundingBox()
  const p7 = await h.locator('.pdf-page[data-page="7"]').boundingBox()
  const take = { x: b4.x + b4.width / 2, y: b4.y + 30 }
  // Let go with its top end over page 7, a third of the way along it, 40px below its top (it is held 30px down it).
  const drop7 = { x: p7.x + p7.width / 3, y: p7.y + 40 + 30 }
  const taps0 = await taps()
  const named = []
  await h.mouse.move(take.x, take.y)
  await h.mouse.down()
  for (let i = 1; i <= 40; i++) {
    await h.mouse.move(take.x + ((drop7.x - take.x) * i) / 40, take.y + ((drop7.y - take.y) * i) / 40)
    await wait(30)
    const now = await ribbon()
    if (i > 2 && now?.chip) named.push({ chip: now.chip, under: await pageAt(now.sx + 11 * now.scale, now.sy + 24 * now.scale) })
  }
  const heldOver7 = await ribbon()
  await h.mouse.up()
  await wait(900)
  const crossings = named.filter((one, i) => i > 0 && one.chip !== named[i - 1].chip).length
  const tapped = (await taps()) - taps0
  check('carried, the chip always names the page under its top end', named.length >= 30 && named.every((one) => one.chip === `p. ${one.under}`), JSON.stringify(named.filter((one) => one.chip !== `p. ${one.under}`).slice(0, 4)))
  check('it crossed pages on the way (4, then over the gutter or the next row, to 7)', named[0]?.chip === 'p. 4' && named.at(-1)?.chip === 'p. 7' && crossings >= 2, named.map((one) => one.chip).join(' '))
  check('one trackpad tap per page crossed, never repeated', tapped === crossings, `${tapped} taps for ${crossings} crossings`)
  const on7 = await v('ribbon:get', SRC())
  const want7 = await h.evaluate(([sx, scale]) => { const r = document.querySelector('.pdf-page[data-page="7"]').getBoundingClientRect(); return (sx + 11 * scale - r.left) / r.width }, [heldOver7.sx, heldOver7.scale])
  check('let go over page 7, it lies on page 7, on its top edge', (await ribbon())?.at === '7' && on7?.page === 7 && Math.abs((await against(7))?.off ?? 99) <= 1, `${JSON.stringify(await ribbon())} kept ${JSON.stringify(on7)}`)
  check('where along it it was let go', Math.abs((on7?.across ?? -1) - want7) < 0.03, `kept ${on7?.across} let go at ${want7.toFixed(3)}`)

  // And on, to a page far below: held at the foot of the view, the pages scroll under it, while it stays under the
  // pointer; let go, it lies on the page the chip named.
  const b7 = await h.locator(LAID).boundingBox()
  const view = await h.locator('.pdf-reader-scroll').boundingBox()
  const take7 = { x: b7.x + b7.width / 2, y: b7.y + 30 }
  const foot = { x: take7.x, y: view.y + view.height - 10 }
  const scroll0 = await h.evaluate(() => document.querySelector('.pdf-reader-scroll').scrollTop)
  const taps1 = await taps()
  const deep = []
  await h.mouse.move(take7.x, take7.y)
  await h.mouse.down()
  const moving = []
  for (let i = 1; i <= 20; i++) { await h.mouse.move(take7.x, take7.y + ((foot.y - take7.y) * i) / 20); await wait(20); moving.push(await ribbon()) }
  // Held still at the foot, every 50 ms, until the chip names page 16 or later (at most 160 samples).
  for (let i = 0; i < 160; i++) {
    const now = await ribbon()
    deep.push(now)
    if (Number(now?.chip?.slice(3)) >= 16) break
    await wait(50)
  }
  const lastHeld = await ribbon()
  await h.mouse.up()
  await wait(1200)
  const far = await v('ribbon:get', SRC())
  const scrolled = (await h.evaluate(() => document.querySelector('.pdf-reader-scroll').scrollTop)) - scroll0
  const deepChips = [...moving, ...deep].map((one) => one?.chip).filter(Boolean)
  const deepCrossings = deepChips.filter((one, i) => (i ? one !== deepChips[i - 1] : one !== 'p. 7')).length
  const stuck = deep.map((one) => [foot.x - one.sx, foot.y - one.sy])
  console.log('  far: ' + deepChips.join(' '))
  check('held at the foot, the pages scrolled under it, far', scrolled > 1500 && Number(lastHeld?.chip?.slice(3)) >= 16, `scrolled ${Math.round(scrolled)}px, chip ${lastHeld?.chip}`)
  check('and it stayed under the pointer as they scrolled (1:1)', Math.max(...stuck.map((one) => one[1])) - Math.min(...stuck.map((one) => one[1])) <= 2 && Math.max(...stuck.map((one) => one[0])) - Math.min(...stuck.map((one) => one[0])) <= 2, JSON.stringify(stuck.slice(0, 6)))
  check('let go, it lies on the page the chip named, on its top edge', far?.page === Number(lastHeld.chip.slice(3)) && (await ribbon())?.at === String(far.page) && Math.abs((await against(far.page))?.off ?? 99) <= 1, `kept ${JSON.stringify(far)} chip ${lastHeld.chip}`)
  check('one tap per page crossed on the way down', (await taps()) - taps1 === deepCrossings, `${(await taps()) - taps1} taps for ${deepCrossings} crossings`)

  // Read back up to page 2: the ribbon lies below, so the pill sits at the FOOT, pointing down, beside the pages.
  await bringTop(2, 100)
  const below = await pill()
  check(`the ribbon below the view: a pill at the FOOT says "p. ${far.page} ↓", over no page`, below?.shown && below.side === 'down' && below.text.includes(`p. ${far.page}`) && /↓/.test(below.text) && below.bottom < 40 && !below.over, JSON.stringify(below))
  // At the ribbon, the pill is gone.
  await bringTop(far.page, 200)
  await wait(300)
  check('with the ribbon in view, the pill is gone', !(await pill())?.shown, JSON.stringify(await pill()))
  // Read past it: the pill at the top, pointing up.
  await bringTop(Math.min(24, far.page + 5), 100)
  const past = await pill()
  check('read past it, the pill is at the top, pointing up, over no page', past?.shown && past.side === 'up' && /↑/.test(past.text) && past.top < 40 && !past.over, JSON.stringify(past))

  // "Go to it" from far away (page 2): it glides there, the ribbon in view, and once the pages rest it bounces: its
  // stretch goes above 1 and back to 1 within 700 ms, sampled every 50 ms by the page's clock.
  await bringTop(2, 100)
  if (!(await h.$('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
  await h.waitForSelector('[data-book-ribbon-go]', { timeout: 8000 }).catch(() => {})
  const bounceFrames = sampler('bounce')
  await h.click('[data-book-ribbon-go]')
  await wait(2600)
  const bf = await bounceFrames()
  const up = bf.findIndex((one) => one.stretch > 1.02)
  const backAt = up < 0 ? -1 : bf.findIndex((one, i) => i > up && Math.abs(one.stretch - 1) < 0.005 && bf.slice(i).every((later) => Math.abs(later.stretch - 1) < 0.005))
  console.log('  bounce: ' + bf.map((one) => one.stretch.toFixed(3)).join(' '))
  check('"Go to it" from far away lands with the ribbon in view', await h.evaluate(() => { const r = document.querySelector('.ribbon:not(.ribbon-tab)').getBoundingClientRect(); const b = document.querySelector('.pdf-reader-scroll').getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom }))
  check('and it bounces: stretched above 1, back to 1 within 700 ms', up >= 0 && backAt > up && bf[backAt].ms - bf[up].ms <= 700, `up at ${up}, back at ${backAt}, ${backAt > up ? Math.round(bf[backAt].ms - bf[up].ms) : '-'} ms`)
  check('only once the pages came to rest, never while they moved', up >= 0 && bf.slice(Math.max(0, up - 1)).every((one, i, all) => !i || Math.abs(one.sy - all[i - 1].sy) < 1), JSON.stringify(bf.slice(Math.max(0, up - 2), up + 4).map((one) => [Math.round(one.sy), one.stretch.toFixed(3)])))

  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:pdf-layout', { detail: 'continuous' })))
  await wait(600)

  // An article, saved in the reader: ⌘D lays the ribbon on the paragraph being read.
  await electron.evaluate((_, [site, cdn, page, pic]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (url.startsWith(site + '/')) return new URL(url).pathname === '/wiki/Harry_Potter' ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
      if (url.startsWith(cdn + '/')) return new Response(Buffer.from(pic, 'base64'), { headers: { 'content-type': 'image/png' } })
      return globalThis.__realFetch(input, init)
    }
  }, [SITE, CDN, fandomPage({ site: SITE, cdn: CDN, sections: 8 }), png(70, 110, 150, 500, 360)])
  const href = `${SITE}/wiki/Harry_Potter`
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
  await h.waitForSelector('.web-reader-body p', { timeout: 60000 }); await wait(1500)
  await h.evaluate(() => { const p = document.querySelectorAll('.web-reader-body p')[6]; const box = document.querySelector('.web-reader-scroll'); box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 60 })
  await wait(400)
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2)
  await h.keyboard.press('Meta+KeyD'); await wait(900)
  const onArticle = await ribbon()
  const kept = await v('ribbon:get', href)
  check('⌘D lays the ribbon on the paragraph being read', onArticle?.state === 'laid' && kept?.block === Number(onArticle.at), `${JSON.stringify(onArticle)} kept ${JSON.stringify(kept)}`)
  check('beside that paragraph', await h.evaluate(() => {
    const r = document.querySelector('.ribbon:not(.ribbon-tab)').getBoundingClientRect()
    const p = document.querySelector('.web-reader-scroll').getBoundingClientRect()
    return r.top > p.top && r.top < p.top + p.height / 2
  }))
  // Right-click a paragraph: "Take the ribbon out", then ⌘Z puts it back.
  const para = await h.locator('.web-reader-body p').nth(7).boundingBox()
  await h.mouse.click(para.x + 20, para.y + 6, { button: 'right' }); await wait(400)
  await h.click('[data-ribbon-out-menu]'); await wait(900)
  check('taken out: it hangs again and the book forgets it', (await ribbon())?.state === 'hanging' && !(await v('ribbon:get', href)), JSON.stringify(await ribbon()))
  check('a notice says so', /Ribbon taken out/.test(await h.evaluate(() => document.body.innerText)))
  await h.keyboard.press('Meta+z'); await wait(1000)
  const back = await v('ribbon:get', href)
  check('⌘Z puts it back where it was', (await ribbon())?.state === 'laid' && back?.block === kept?.block, `${JSON.stringify(await ribbon())} kept ${JSON.stringify(back)}`)
} finally {
  await electron.evaluate(() => void (globalThis.__realFetch && (globalThis.fetch = globalThis.__realFetch))).catch(() => {})
  await close()
}
done()
