// A book's cover and the pages scrubbed over it are one sheet: on the Files page a PDF's tile sits
// on the same paper as the pages that turn over it, light and dark, so scrubbing never changes
// the colour under the page. Also films the reader's rail (the thumbnails following the page, and
// the outline under the tabs) for a look by eye, with SHOT set.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/cover-paper node qa/pdf-cover-paper.mjs
import { PDFDocument, PDFName, PDFNull, PDFNumber, PDFString, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT
const { check, done } = checks()

const CHAPTERS = ['The fire becomes a household god', 'He was an expert in alarm systems', 'A short history of the lamp', 'What the neighbours saw', 'Morning']
const makePdf = async (title) => {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 60; n++) pdf.addPage([300, 400]).drawText(`${title} page ${n}`, { x: 30, y: 300, size: 22, font })
  const ctx = pdf.context
  const root = ctx.nextRef()
  const pages = pdf.getPages()
  const refs = CHAPTERS.map(() => ctx.nextRef())
  CHAPTERS.forEach((one, n) => {
    const entry = ctx.obj({ Title: PDFString.of(one), Parent: root, Dest: [pages[n * 12].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull] })
    if (n > 0) entry.set(PDFName.of('Prev'), refs[n - 1])
    if (n < refs.length - 1) entry.set(PDFName.of('Next'), refs[n + 1])
    ctx.assign(refs[n], entry)
  })
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: PDFNumber.of(refs.length) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return [...(await pdf.save())]
}

const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const src = await h.evaluate((bytes) => window.api.saveFile('book.pdf', new Uint8Array(bytes)), await makePdf('Alpha'))
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shelf' }] }, { type: 'attachment', attrs: { src, name: 'Alpha.pdf', size: 900 } }] })
  await h.reload(); await wait(1500)
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await go('media'); await wait(1200)
    const face = '[data-media=pdf] [data-pdf-peek-scrub]'
    await h.waitForSelector(`${face} img`, { timeout: 8000 })
    const ground = () => h.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, face)
    const cover = await ground()
    if (SHOT) await h.screenshot({ path: `${SHOT}-${look}-tile.png` })
    const r = await h.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } }, face)
    await h.mouse.move(r.x + 10, r.y + r.h / 2); await wait(750)
    for (let i = 1; i <= 6; i++) { await h.mouse.move(r.x + 10 + i * 20, r.y + r.h / 2); await wait(60) }
    await h.waitForSelector('[data-pdf-scrub] img', { timeout: 4000 }).catch(() => {})
    const scrub = await h.evaluate(() => { const s = document.querySelector('[data-pdf-scrub]'); return s ? getComputedStyle(s).backgroundColor : null })
    if (SHOT) await h.screenshot({ path: `${SHOT}-${look}-scrub.png` })
    check(`${look}: the cover sits on the same paper as the pages scrubbed over it`, !!scrub && cover === scrub, `cover ${cover}, pages ${scrub}`)
    await h.mouse.move(5, 450); await wait(300)

    // The reader's rail, filmed as the page moves on.
    if (!SHOT) continue
    await h.evaluate(() => localStorage.setItem('pdf-rail', 'pages'))
    await h.evaluate(([src]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Alpha.pdf' } })), [src])
    await h.waitForSelector('.pdf-rail-list .pdf-thumb canvas', { timeout: 8000 }); await wait(1200)
    const head = await h.evaluate(() => { const one = document.querySelector('.book-head-cover'); const img = one?.querySelector('img'); return one ? { ground: getComputedStyle(one).backgroundColor, blend: img && getComputedStyle(img).mixBlendMode, page: getComputedStyle(document.querySelector('.pdf-reader .pdf-page')).backgroundColor } : null })
    check(`${look}: the cover in the reader's Details is on the pages' paper`, !head || (head.ground === head.page && head.blend === 'multiply'), JSON.stringify(head))
    for (const [k, to] of [[0, 6], [1, 9], [2, 30]].entries()) {
      void h.evaluate((to) => { const view = document.querySelector('.pdf-reader-scroll'); const p = document.querySelector(`.pdf-reader .pdf-page[data-page="${to[1]}"]`); view.scrollTop += p.getBoundingClientRect().top - view.getBoundingClientRect().top }, to)
      for (let f = 0; f < 10; f++) { await h.screenshot({ path: `${SHOT}-${look}-rail-${k}-${String(f).padStart(2, '0')}.png`, clip: { x: 0, y: 0, width: 520, height: 900 } }); await wait(50) }
    }
    await h.click('.pdf-rail [role="tab"]:has-text("Outline")'); await wait(500)
    await h.screenshot({ path: `${SHOT}-${look}-outline.png` })
    await h.keyboard.press('Escape'); await wait(600)
  }
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).split('\n')[0])
}
await c.close()
done()
