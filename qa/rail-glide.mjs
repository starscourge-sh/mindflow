// The PDF reader's Pages rail follows the page you are on with a glide, never a snap (pdf-rail.tsx, the user, 18 Nov:
// "the focussing and centering ... is too abrupt"): pages flung fast, the rail's scroll is sampled every frame and never
// moves more than a glide's step at once; the ring eases from page to page. A 60-page PDF dropped in a note, opened.
// Real wheel on the pages.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/rail-glide.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
try {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Long Probe Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 60; n++) pdf.addPage([400, 560]).drawText(`Page ${n}`, { x: 40, y: 500, size: 18, font })
  const bytes = [...(await pdf.save())]
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'With a long PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await s.send('article', id); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'long-probe.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open long-probe.pdf"]', { timeout: 15000 })
  await h.click('.is-pdf button[aria-label="Open long-probe.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"]', { timeout: 15000 }); await wait(800)
  if (!(await h.locator('.pdf-rail .pdf-thumb').count())) { await h.click('.pdf-reader button[aria-label="Sidebar"]'); await wait(800) }
  check('the rail shows the pages', (await h.locator('.pdf-rail .pdf-thumb').count()) === 60)
  // Every frame from here: the rail's scroll, and which page is ringed.
  await h.evaluate(() => {
    const list = document.querySelector('.pdf-rail-list')
    window.__rail = []
    const each = () => { window.__rail.push({ top: list.scrollTop, here: document.querySelector('.pdf-thumb.is-here')?.dataset.thumbPage }); window.__railFrame = requestAnimationFrame(each) }
    each()
  })
  // Flung: the pages wheeled fast, many pages passed.
  const pages = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(pages.x + pages.width / 2, pages.y + pages.height / 2)
  // Fast enough to count as a fling (pdf-draw.ts pagesAt: three scrolls over 3px a ms, under 100ms apart).
  for (let i = 0; i < 24; i++) { await h.mouse.wheel(0, 2400); await wait(10) }
  await wait(1500)
  const frames = await h.evaluate(() => (cancelAnimationFrame(window.__railFrame), window.__rail))
  const steps = frames.slice(1).map((one, at) => Math.abs(one.top - frames[at].top))
  const turned = new Set(frames.map((one) => one.here)).size
  const view = await h.evaluate(() => document.querySelector('.pdf-rail-list').clientHeight)
  check('pages flung, the rail followed', turned > 3 && frames.at(-1).top > 0, `${turned} pages ringed, top ${frames.at(-1).top}`)
  check('and glided there: no frame jumped it half its height or more', Math.max(...steps) < view / 2, `largest step ${Math.max(...steps)}px of a ${view}px rail`)
  const ring = await h.evaluate(() => getComputedStyle(document.querySelector('.pdf-thumb-sheet')).transitionProperty + ' ' + getComputedStyle(document.querySelector('.pdf-thumb-sheet')).transitionDuration)
  check('the ring eases from page to page', /box-shadow/.test(ring) && !/^box-shadow 0s/.test(ring), ring)
} finally {
  await close()
}
done()
