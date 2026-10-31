// The PDF reader's narrow panes, zoom and page scrub: a PDF link in a note
// has no "⌥-click" tip; the Pages rail squeezes, then folds, as the pane
// narrows, comes back as it widens, and a choice made by hand wins; pages are
// drawn at a narrow width; a pinch (a ctrl wheel) and ⌘-scroll zoom round the
// pointer, with a chip saying the zoom; double-click toggles Fit; dragging
// the page number scrubs pages (⇧ faster), a click types, ↑ ↓ step.
//   npx electron-vite build --outDir out-pdfzoom
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-pdfzoom/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-zoom-scrub.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/pdf-zoom-shots'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, size, both, close } = c
const wait = (ms) => h.waitForTimeout(ms)
const ED = '[data-open] .tiptap'

/** Forty letter-size pages, each saying which it is. */
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Scrub Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) {
    const page = pdf.addPage([612, 792])
    page.drawText(`Page ${n} of the scrub book`, { x: 60, y: 720, size: 22, font })
    page.drawText(`A sentence to read on page ${n}.`, { x: 60, y: 680, size: 13, font })
  }
  return Array.from(await pdf.save())
}
const state = () => h.evaluate(() => {
  const rail = document.querySelector('.pdf-reader .pdf-rail')
  const body = document.querySelector('.pdf-reader-body')
  return { room: body?.clientWidth, squeeze: body?.dataset.railSqueeze, rail: rail ? Math.round(rail.getBoundingClientRect().width) : 0, zoom: Number(document.querySelector('.pdf-reader')?.dataset.zoom), page: Number(document.querySelector('.pdf-reader [data-scrub-field]')?.value) }
})
/** The window width that gives the reader's body this much room. */
let extra = 0
const roomTo = async (w) => { await size(w + extra, 900); await wait(700) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('pdf-rail', 'pages'))

  // 1. A note with a PDF link and a web link: only the web link keeps its tip.
  const id = await v('article:new')
  await v('item:save', id, { title: 'Links', body: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'the book', marks: [{ type: 'link', attrs: { href: 'haligtree://assets/abc.pdf#page=3&name=Book.pdf' } }] },
    { type: 'text', text: ' and ' },
    { type: 'text', text: 'a site', marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }] },
    { type: 'text', text: ' and ' },
    { type: 'text', text: 'a web pdf', marks: [{ type: 'link', attrs: { href: 'https://example.com/paper.pdf' } }] },
  ] }] } })
  await c.send('article', id); await wait(1400)
  const tips = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} a`)].map((a) => [a.textContent, a.getAttribute('data-title-tip')]), ED)
  check('no tip on a PDF link (kept or on the web)', tips.filter(([t]) => /book|pdf/.test(t)).every(([, tip]) => !tip), JSON.stringify(tips))
  check('a web link keeps its tip', tips.some(([t, tip]) => t === 'a site' && /Click to open/.test(tip ?? '')), JSON.stringify(tips))

  // The reader, opened from a PDF dropped in the note.
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'scrub-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, [ED, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open scrub-book.pdf"]', { timeout: 15000 })
  await h.click('.is-pdf button[aria-label="Open scrub-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 15000 })
  await wait(800)
  extra = 1400 - (await state()).room

  // 2. Rail: full when there is room, narrow, then folded; back as it widens.
  await roomTo(1000)
  const wide = await state()
  check('wide pane: the rail at its own width', wide.squeeze === 'full' && wide.rail >= 190, JSON.stringify(wide))
  // At page 20 the pane narrows: the place you read stays (on main it drifted to pages not yet drawn).
  await h.click('.pdf-reader [data-scrub-field]'); await h.keyboard.type('20'); await h.keyboard.press('Enter'); await wait(600)
  await roomTo(700)
  const mid = await state()
  const kept = await h.evaluate(() => { const box = document.querySelector('.pdf-reader-scroll'); const r = box.querySelector('.pdf-page[data-page="20"]').getBoundingClientRect(); return Math.round(r.top - box.getBoundingClientRect().top) })
  check('a narrower pane keeps the page you were on in place', mid.page === 20 && Math.abs(kept) < 30, `page ${mid.page}, top ${kept}`)
  check('narrower (page column under 520px): the rail squeezes to 152px', mid.squeeze === 'narrow' && mid.rail === 152, JSON.stringify(mid))
  await roomTo(560)
  const tight = await state()
  check('narrower still (under 420px): the rail folds away', tight.squeeze === 'folded' && tight.rail === 0, JSON.stringify(tight))
  // Pages drawn at the narrow width: every sheet in view has its picture, at its own size.
  await wait(800)
  const drawn = await h.evaluate(() => {
    const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
    return [...document.querySelectorAll('.pdf-reader .pdf-page')].filter((one) => { const r = one.getBoundingClientRect(); return r.bottom > box.top && r.top < box.bottom }).map((one) => {
      const canvas = one.querySelector('canvas')
      return { page: one.dataset.page, w: Math.round(one.getBoundingClientRect().width), canvas: canvas ? Math.round(canvas.width / devicePixelRatio) : 0 }
    })
  })
  check('pages are drawn at the narrow width, sharp at their size', drawn.length > 0 && drawn.every((one) => one.canvas && Math.abs(one.canvas - one.w) <= 2), JSON.stringify(drawn))
  await h.screenshot({ path: `${SHOTS}/narrow-folded.png` })
  await roomTo(700)
  check('wider again: the rail comes back, narrow', (await state()).rail === 152, JSON.stringify(await state()))
  await roomTo(1000)
  check('wide again: the rail at its own width', (await state()).rail >= 190, JSON.stringify(await state()))
  // A choice by hand wins: opened at a tight width, it stays open and full.
  await roomTo(560)
  await h.click('.pdf-reader .pdf-reader-bar button[aria-label="Sidebar"]:visible').catch(async () => { await h.click('.pdf-reader .pdf-reader-bar button[aria-label="More"]'); await wait(300); await h.click('[data-radix-popper-content-wrapper] button[aria-label="Sidebar"]'); await h.keyboard.press('Escape') })
  await wait(500)
  const byHand = await state()
  check('opened by hand when folded: it stays open at its own width', byHand.squeeze === 'full' && byHand.rail >= 190, JSON.stringify(byHand))
  await roomTo(700)
  check('and stays so as the pane changes', (await state()).rail >= 190, JSON.stringify(await state()))
  await roomTo(1000)
  await wait(600)

  // 3. Pinch and ⌘-scroll zoom round the pointer.
  const point = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-page[data-page="20"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.3), y: Math.round(r.top + r.height * 0.4) } })
  const at = (p) => h.evaluate((p) => {
    for (const one of document.querySelectorAll('.pdf-reader .pdf-page')) { const r = one.getBoundingClientRect(); if (p.y >= r.top && p.y <= r.bottom) return { page: one.dataset.page, fx: (p.x - r.left) / r.width, fy: (p.y - r.top) / r.height } }
    return null
  }, p)
  const where = (spot) => h.evaluate((s) => { const r = document.querySelector(`.pdf-reader .pdf-page[data-page="${s.page}"]`).getBoundingClientRect(); return { x: r.left + s.fx * r.width, y: r.top + s.fy * r.height } }, spot)
  const wheel = (p, deltaY, keys, times) => h.evaluate(async ([p, deltaY, keys, times]) => {
    const box = document.querySelector('.pdf-reader-scroll')
    for (let n = 0; n < times; n++) {
      box.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, ...keys }))
      await new Promise((r) => requestAnimationFrame(r))
    }
  }, [p, deltaY, keys, times])
  let spot = await at(point)
  await wheel(point, -6, { ctrlKey: true }, 12)
  const chip = await h.evaluate(() => { const el = document.querySelector('.pdf-zoom-chip'); return { shown: el.hasAttribute('data-shown'), text: el.textContent } })
  check('the zoom chip shows while pinching', chip.shown && /%/.test(chip.text), JSON.stringify(chip))
  await wait(900)
  let s = await state()
  let now = await where(spot)
  check('pinch: the pages zoom in', s.zoom > 1.3, String(s.zoom))
  check('pinch: the point under the pointer stays put (within 4px)', Math.abs(now.x - point.x) <= 4 && Math.abs(now.y - point.y) <= 4, `${JSON.stringify(point)} -> ${JSON.stringify(now)}`)
  const canvasW = await h.evaluate(() => { const one = document.querySelector(`.pdf-reader .pdf-page[data-page="${document.querySelector('[data-scrub-field]').value}"]`); return [Math.round(one.getBoundingClientRect().width), Math.round((one.querySelector('canvas')?.width ?? 0) / devicePixelRatio)] })
  check('drawn again sharp at the new zoom', Math.abs(canvasW[0] - canvasW[1]) <= 2, JSON.stringify(canvasW))
  await wait(1200)
  check('the chip fades once the zoom rests', !(await h.evaluate(() => document.querySelector('.pdf-zoom-chip').hasAttribute('data-shown'))))
  spot = await at(point)
  const pinched = s.zoom
  await wheel(point, 100, { metaKey: true }, 2)
  await wait(700)
  s = await state(); now = await where(spot)
  check('⌘-scroll: the pages zoom out, a notch at a time', s.zoom < pinched * 0.75, `${pinched} -> ${s.zoom}`)
  check('⌘-scroll: the point under the pointer stays put (within 4px)', Math.abs(now.x - point.x) <= 4 && Math.abs(now.y - point.y) <= 4, `${JSON.stringify(point)} -> ${JSON.stringify(now)}`)
  // Past the largest: it gives, then settles at 300%.
  await wheel(point, -40, { ctrlKey: true }, 40)
  const over = await h.evaluate(() => document.querySelector('.pdf-zoom-chip').textContent)
  await wait(900)
  check('past the largest it gives a little, then rests at 300%', parseInt(over) > 300 && (await state()).zoom === 3, `${over} then ${(await state()).zoom}`)
  await h.keyboard.press('Meta+0'); await wait(600)
  check('⌘0 is Fit again', (await state()).zoom === 1, String((await state()).zoom))
  await h.locator('.pdf-reader-scroll').click({ position: { x: 5, y: 5 } })
  await h.keyboard.press('Meta+='); await wait(600)
  check('⌘+ still steps up', (await state()).zoom === 1.1, String((await state()).zoom))
  await h.keyboard.press('Meta+-'); await wait(600)
  check('⌘− still steps down', (await state()).zoom === 1, String((await state()).zoom))

  // Double-click on a page, away from its words: Fit and actual size.
  const blank = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-page[data-page="20"]').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.6 } })
  await h.mouse.dblclick(blank.x, blank.y); await wait(700)
  const dbl = (await state()).zoom
  check('double-click zooms in from Fit', dbl > 1.05, String(dbl))
  await h.mouse.dblclick(blank.x, blank.y); await wait(700)
  check('double-click again is Fit', (await state()).zoom === 1, String((await state()).zoom))
  await both(`${SHOTS}/reader`)

  // 4. The page number scrubs.
  const field = await h.locator('.pdf-reader [data-scrub-field]').boundingBox()
  const cursor = await h.evaluate(() => getComputedStyle(document.querySelector('.pdf-reader [data-scrub-field]')).cursor)
  check('the page number shows the left-right cursor', cursor === 'ew-resize', cursor)
  const drag = async (dx, shift) => {
    const from = (await state()).page
    await h.mouse.move(field.x + field.width / 2, field.y + field.height / 2)
    await h.mouse.down()
    if (shift) await h.keyboard.down('Shift')
    for (let n = 1; n <= 8; n++) await h.mouse.move(field.x + field.width / 2 + (dx * n) / 8, field.y + field.height / 2)
    const live = await h.evaluate(() => document.documentElement.hasAttribute('data-scrubbing'))
    await h.mouse.up()
    if (shift) await h.keyboard.up('Shift')
    await wait(500)
    return { from, to: (await state()).page, live }
  }
  const plain = await drag(40, false)
  check('dragging the page number right scrubs forward', plain.to > plain.from && plain.live, JSON.stringify(plain))
  const top = await h.evaluate(() => { const box = document.querySelector('.pdf-reader-scroll'); const r = box.querySelector(`.pdf-page[data-page="${document.querySelector('[data-scrub-field]').value}"]`).getBoundingClientRect(); return Math.round(r.top - box.getBoundingClientRect().top) })
  check('the pages follow to that page', Math.abs(top) < 40, String(top))
  const back = await drag(-40, false)
  await h.mouse.click(field.x + field.width / 2, field.y + field.height / 2); await h.keyboard.type('1'); await h.keyboard.press('Enter'); await wait(400)
  const fast = await drag(40, true)
  check('⇧ scrubs faster', fast.to - fast.from > (plain.to - plain.from) * 3, `${plain.to - plain.from} vs ${fast.to - fast.from} (back to ${back.to})`)
  // A plain click: a number to type.
  await h.mouse.click(field.x + field.width / 2, field.y + field.height / 2)
  const focused = await h.evaluate(() => document.activeElement?.hasAttribute('data-scrub-field'))
  await h.keyboard.type('7'); await h.keyboard.press('Enter'); await wait(500)
  check('a click lets you type a page', focused && (await state()).page === 7, JSON.stringify(await state()))
  await h.mouse.click(field.x + field.width / 2, field.y + field.height / 2)
  await h.keyboard.press('ArrowUp'); await wait(300)
  const up = (await state()).page
  await h.keyboard.press('ArrowDown'); await h.keyboard.press('ArrowDown'); await wait(300)
  check('↑ and ↓ step pages while it has the keys', up === 8 && (await state()).page === 6, `${up} then ${(await state()).page}`)
  await h.keyboard.press('Escape')

  // Narrow pane screenshots, light and dark.
  await roomTo(700)
  await both(`${SHOTS}/narrow`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await close()
}
done()
