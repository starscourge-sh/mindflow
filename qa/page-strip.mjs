// A book's page strip (book-links.tsx, PageBar) felt as the Journal's year is: strokes near the pointer swell, the tip
// under it says "p. 412 · click for its page", a page's picture with its number stands over the stroke pointed at
// (its arrow on that stroke), following the pointer; a pinch spreads the book with page numbers under it and Esc puts
// it back; a click opens the page. Measures what the picture costs on a 1,000-page book: a page drawn the first time,
// from cache, and the frame times while scrubbing fast. Light and dark shots beside the Journal's year go to QA_SHOTS.
//   BOOK=<a pdf of about 1,000 pages> QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/page-strip.mjs
// With no BOOK (or none at the default path) a 1,000-page book is made here.
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? join(tmpdir(), `page-strip-${process.pid}`)
mkdirSync(shots, { recursive: true })
const BOOK = process.env.BOOK ?? join(homedir(), 'Documents/books/Fluent Python Clear, Concise, and Effective Programming, 2nd Edition (Luciano Ramalho) (z-library.sk, 1lib.sk, z-lib.sk).pdf')

const madeBook = async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.TimesRoman)
  for (let n = 1; n <= 1000; n++) {
    const page = pdf.addPage([432, 648])
    page.drawText(`Chapter ${Math.ceil(n / 40)}`, { x: 48, y: 590, size: 18, font })
    for (let l = 0; l < 34; l++) page.drawText(`Line ${l + 1} of page ${n}, words on the nature of things and how they are drawn.`, { x: 48, y: 560 - l * 15, size: 10, font })
    page.drawRectangle({ x: 48, y: 40, width: 120 + (n % 7) * 20, height: 30, color: rgb(0.2, 0.3, 0.6) })
  }
  return { bytes: await pdf.save(), name: 'thousand-pages.pdf' }
}

const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(50)) if (await test()) return true; return false }
const stat = (all) => { const s = [...all].sort((a, b) => a - b); const at = (q) => Math.round((s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0) * 10) / 10; return { n: s.length, p50: at(0.5), p95: at(0.95), max: at(1) } }
// Light and dark shots with the pointer held on the strip: each theme change redraws, so the pointer goes off and back.
const held = async (file, target, x, yy) => {
  for (const name of ['light', 'dark']) {
    await c.look(name)
    await h.mouse.move(10, 10); await wait(200)
    await h.mouse.move(x - 3, yy); await h.mouse.move(x, yy); await wait(700)
    await target.screenshot({ path: `${file}-${name}.png` })
  }
  await c.look('light')
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const { bytes, name } = existsSync(BOOK) ? { bytes: readFileSync(BOOK), name: 'fluent-python.pdf' } : await madeBook()
  // Into the book's files in pieces: one evaluate of 16 MB is too much at once.
  await h.evaluate(() => (window.__book = []))
  const b64 = Buffer.from(bytes).toString('base64')
  for (let i = 0; i < b64.length; i += 2_000_000) await h.evaluate((part) => window.__book.push(part), b64.slice(i, i + 2_000_000))
  const src = await h.evaluate(async (name) => {
    const text = atob(window.__book.join(''))
    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
    delete window.__book
    return window.api.saveFile(name, out)
  }, name)
  check('the book is in the sandbox', /\.pdf$/.test(src), src)
  await h.evaluate(([src, name]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name, page: 83 } })), [src, name])
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 30000 })
  await wait(1500)
  if (!(await h.$('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
  await h.waitForSelector('[data-page-bar] svg[data-strokes]', { timeout: 8000 })
  await wait(1500)
  const pages = await h.evaluate(() => Number(document.querySelector('.pdf-reader-of')?.textContent?.match(/(\d[\d,]*)\s*$/)?.[1]?.replace(/,/g, '')) || 0)
  check('a book of about a thousand pages', pages >= 900, String(pages))
  await h.locator('[data-page-bar]').scrollIntoViewIfNeeded()
  await wait(300)
  let box = await h.locator('[data-page-bar] svg[data-strokes]').boundingBox()
  let y = box.y + box.height - 4
  const xAt = (f) => Math.round(box.x + f * box.width)
  const heights = () => h.evaluate(() => [...document.querySelectorAll('[data-page-bar] svg [data-stroke]')].map((r) => { const g = r.getBoundingClientRect(); return { x: g.left + g.width / 2, h: Math.round(g.height), tick: r.hasAttribute('data-tick') || r.hasAttribute('data-here') } }))
  const seen = () => h.evaluate(() => {
    const pic = document.querySelector('[data-page-bar] [data-page-picture]')
    const arrow = pic?.querySelector('.book-thumb-arrow')?.getBoundingClientRect()
    const sheet = pic?.querySelector('.book-thumb-sheet')?.getBoundingClientRect()
    const strip = document.querySelector('[data-page-bar] svg[data-strokes]')?.getBoundingClientRect()
    return {
      page: pic?.getAttribute('data-page-picture') ?? null,
      number: pic?.querySelector('[data-page-picture-number]')?.textContent ?? null,
      drawn: !!pic?.querySelector('.book-thumb-sheet img, .book-thumb-sheet canvas'),
      arrow: arrow ? arrow.left + arrow.width / 2 : null,
      above: sheet && strip ? sheet.bottom <= strip.top : null,
      width: sheet ? Math.round(sheet.width) : null,
      tip: document.querySelector('[data-page-bar] [data-stroke-tip]')?.textContent ?? null
    }
  })

  // The swell: strokes by the pointer stand taller, falling off; far ones stay low.
  await h.mouse.move(xAt(0.5), y)
  await wait(500)
  const hs = await heights()
  const px = xAt(0.5)
  const near = hs.filter((one) => !one.tick && Math.abs(one.x - px) < 3).map((one) => one.h)
  const mid = hs.filter((one) => !one.tick && Math.abs(Math.abs(one.x - px) - 12) < 2).map((one) => one.h)
  const far = hs.filter((one) => !one.tick && Math.abs(one.x - px) > 120).map((one) => one.h)
  check('the strokes swell round the pointer: tallest under it, lower further off, the far ones low', Math.max(...near) >= 24 && Math.max(...mid) < Math.max(...near) && Math.max(...mid) > 14 && Math.max(...far) <= 14, JSON.stringify({ near, mid: mid.slice(0, 4), far: Math.max(...far) }))
  let now = await seen()
  check('the tip under it names the page and says what a click does ("p. 412 · click for its page")', /^pp?\. \S+.* · /.test(now.tip ?? ''), now.tip)
  const tipPage = (now.tip ?? '').match(/^pp?\. (\S+)/)?.[1]
  // The number is the page's own (its printed label, as the tip's), the first page of the stroke's stretch.
  check('the picture over it shows the page the stroke opens, numbered', now.page !== null && now.number === tipPage, JSON.stringify({ ...now, tipPage }))
  check('the picture stands over the strip, about 80px wide, its arrow on the stroke pointed at', now.above === true && Math.abs(now.width - 80) <= 2 && Math.abs(now.arrow - px) <= 3, JSON.stringify(now))
  await held(join(shots, 'strip'), h.locator('.read-details'), xAt(0.5), y)

  // Cost of a page's picture: first time (drawn), then from cache. Pages far from the rail's, so none is copied.
  // (The shots above scrolled the panel: the strip is found again.)
  await h.locator('[data-page-bar]').scrollIntoViewIfNeeded()
  box = await h.locator('[data-page-bar] svg[data-strokes]').boundingBox()
  y = box.y + box.height - 4
  const first = []
  const firstDraw = []
  const spots = [0.62, 0.68, 0.74, 0.8, 0.86, 0.92, 0.3, 0.38]
  for (const f of spots) {
    await h.evaluate(() => performance.clearMeasures('pdf-page-small'))
    const t = Date.now()
    await h.mouse.move(xAt(f), y)
    const ok = await waitFor(async () => (await seen()).drawn, 10000)
    first.push(Date.now() - t)
    const d = await h.evaluate(() => performance.getEntriesByName('pdf-page-small').map((e) => e.duration))
    firstDraw.push(...d)
    if (!ok) check(`page at ${f} drawn`, false, JSON.stringify(await seen()))
  }
  const cached = []
  for (const f of spots) {
    await h.mouse.move(xAt(f) - 40, y)
    await wait(80)
    // Moved and looked at in the same frame: from cache, the picture is there at once.
    cached.push(await h.evaluate((x) => new Promise((res) => {
      const svg = document.querySelector('[data-page-bar] svg[data-strokes]')
      const t = performance.now()
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: svg.getBoundingClientRect().bottom - 4, bubbles: true }))
      const look = () => (document.querySelector('[data-page-bar] .book-thumb-sheet :is(img, canvas)') ? res(performance.now() - t) : requestAnimationFrame(look))
      requestAnimationFrame(look)
    }), xAt(f)))
  }
  const drawnFirst = stat(firstDraw)
  console.log('COST first time: pointer to picture (ms)', JSON.stringify(stat(first)), 'drawing alone (ms)', JSON.stringify(drawnFirst))
  console.log('COST from cache: pointer to picture (ms)', JSON.stringify(stat(cached)))
  check('a page drawn the first time takes under 150ms at the 95th percentile', drawnFirst.p95 < 150, JSON.stringify(drawnFirst))
  check('a page from cache shows within a frame or two (under 40ms)', stat(cached).max < 40, JSON.stringify(cached))

  // Scrubbing fast: two moves a frame across the whole strip and back, frame gaps measured; never more than one page drawn at a time.
  box = await h.locator('[data-page-bar] svg[data-strokes]').boundingBox()
  const sweep = (sel = '[data-page-bar] svg[data-strokes]', left = box.x, width = box.width) => h.evaluate(([left, width, sel]) => new Promise((res) => {
    performance.clearMeasures('pdf-page-small')
    const svg = document.querySelector(sel)
    const yy = svg.getBoundingClientRect().bottom - 4
    const gaps = []
    const long = []
    const watch = new PerformanceObserver((list) => list.getEntries().forEach((e) => long.push(e.duration)))
    try { watch.observe({ type: 'longtask', buffered: false }) } catch { /* not offered */ }
    let then = performance.now()
    let i = 0
    const N = 240
    const tick = (now) => {
      gaps.push(now - then); then = now
      for (const k of [0, 0.5]) {
        const f = (i + k) / N
        const x = left + 2 + (f < 0.5 ? f * 2 : 2 - f * 2) * (width - 4)
        ;(document.elementFromPoint(x, yy) ?? svg).dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: yy, bubbles: true }))
      }
      if (++i < N) requestAnimationFrame(tick)
      else setTimeout(() => (watch.disconnect(), res({ gaps: gaps.slice(1), long, drew: performance.getEntriesByName('pdf-page-small').map((e) => e.duration) })), 50)
    }
    requestAnimationFrame(tick)
  }), [left, width, sel])
  const idle = stat(await h.evaluate(() => new Promise((res) => { const gaps = []; let then = performance.now(); const end = then + 2000; const tick = (now) => { gaps.push(now - then); then = now; if (now < end) requestAnimationFrame(tick); else res(gaps.slice(1)) }; requestAnimationFrame(tick) })))
  console.log('IDLE frame gaps, nothing moving (ms)', JSON.stringify(idle))
  const strokes = await h.evaluate(() => document.querySelectorAll('[data-page-bar] svg [data-stroke]').length)
  const scrub = await sweep()
  const g = stat(scrub.gaps)
  console.log('SCRUB first sweep, frame gaps (ms)', JSON.stringify(g), 'long tasks', JSON.stringify(stat(scrub.long)), 'pages drawn during it', scrub.drew.length, JSON.stringify(stat(scrub.drew)), 'strokes passed', strokes * 2)
  await wait(1500)
  // The same sweep again: the pages are mostly kept now, so this is the strip's own cost with little drawing.
  const again = await sweep()
  const g2 = stat(again.gaps)
  console.log('SCRUB second sweep, frame gaps (ms)', JSON.stringify(g2), 'long tasks', JSON.stringify(stat(again.long)), 'pages drawn during it', again.drew.length)
  check('scrubbing fast keeps frames: no task over 50ms, 95th percentile within a frame of the idle window', g.p95 <= idle.p95 + 17 && scrub.long.length === 0, JSON.stringify({ g, idle }))
  check('scrubbing draws at most a page a frame, far fewer than it passes (the newest wins)', scrub.drew.length <= scrub.gaps.length && scrub.drew.length < strokes * 2, `${scrub.drew.length} drawn, ${strokes * 2} passed, ${scrub.gaps.length} frames`)
  await wait(600)

  // Pinch: the book spreads, page numbers come in under it; Esc puts the whole book back.
  await h.locator('[data-page-bar]').scrollIntoViewIfNeeded()
  box = await h.locator('[data-page-bar] svg[data-strokes]').boundingBox()
  y = box.y + box.height - 4
  await h.mouse.move(xAt(0.5), y)
  for (let i = 0; i < 20; i++) await h.evaluate(([x, yy]) => document.elementFromPoint(x, yy).dispatchEvent(new WheelEvent('wheel', { deltaY: -30, ctrlKey: true, clientX: x, clientY: yy, bubbles: true, cancelable: true })), [xAt(0.5), y])
  await wait(700)
  const zoom = () => h.evaluate(() => Number(document.querySelector('[data-page-bar] [data-book-zoom]')?.getAttribute('data-book-zoom') ?? 0))
  const z = await zoom()
  const words = await h.evaluate(() => [...document.querySelectorAll('[data-page-bar] [data-book-pages] span')].map((s) => s.textContent))
  check('a pinch spreads the book, page numbers under it', z > 2 && words.length >= 2, JSON.stringify({ z, words }))
  check('zoomed, it says how to go back', await h.evaluate(() => !!document.querySelector('[data-book-zoom-hint]')))
  await h.mouse.move(xAt(0.55), y)
  await wait(300)
  now = await seen()
  // Zoomed, a stroke is a page some 8px apart: the arrow is on the stroke pointed at, within that of the pointer.
  check('zoomed, the picture still follows the pointer', now.page !== null && Math.abs(now.arrow - xAt(0.55)) <= 9, JSON.stringify({ ...now, pointer: xAt(0.55) }))
  await held(join(shots, 'strip-zoomed'), h.locator('.read-details'), xAt(0.55), y)
  await h.keyboard.press('Escape')
  await waitFor(async () => (await zoom()) === 1, 3000)
  check('Esc puts the whole book back', (await zoom()) === 1, String(await zoom()))

  // A click opens the page the picture shows.
  await h.mouse.move(xAt(0.4), y)
  await wait(300)
  const want = (await seen()).page
  await h.mouse.click(xAt(0.4), y)
  const went = await waitFor(() => h.evaluate((p) => document.querySelector('[data-page-bar] [data-here]')?.getAttribute('data-here') === p, want), 6000)
  check('a click opens the page the picture shows', went, want)
  await h.mouse.move(10, 10)
  await wait(400)
  check('leaving the strip takes the picture and tip away', !(await h.$('[data-page-bar] [data-page-picture]')) && !(await h.$('[data-page-bar] [data-stroke-tip]')))

  // The Journal's year beside it, pointed at the same way.
  await go('yearpage')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-year-marks] svg [data-stroke]')))
  await h.locator('[data-year-marks]').scrollIntoViewIfNeeded()
  const yb = await h.locator('[data-year-band="0"] svg').boundingBox()
  await h.mouse.move(yb.x + yb.width * 0.4, yb.y + yb.height - 4)
  await wait(500)
  check('the year still swells and tips', await h.evaluate(() => !!document.querySelector('[data-year-marks] [data-stroke-tip]') && [...document.querySelectorAll('[data-year-band="0"] svg [data-stroke]')].some((r) => r.getBoundingClientRect().height > 22)))
  const yearSweep = stat((await sweep('[data-year-band="0"] svg', yb.x, yb.width)).gaps)
  console.log('SCRUB the Journal year, same sweep, frame gaps (ms)', JSON.stringify(yearSweep))
  await h.mouse.move(yb.x + yb.width * 0.4, yb.y + yb.height - 4)
  await wait(500)
  await held(join(shots, 'year'), h.locator('[data-year-marks]'), yb.x + yb.width * 0.4, yb.y + yb.height - 4)
  console.log('shots in', shots)
} finally {
  await c.close()
}
done()
