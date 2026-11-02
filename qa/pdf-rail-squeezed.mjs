// The PDF reader squeezed into half of a split: its rail, left on "Outline",
// opens on "Pages" instead (titles cut to "The…" read as nothing, thumbnails
// read at any width). Outline picked by hand stays; with room, the outline is
// back as it was left.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/rail node qa/pdf-rail-squeezed.mjs
import { PDFDocument, PDFName, PDFNull, PDFNumber, PDFString, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-rail-squeezed'
const { check, done } = checks()

const CHAPTERS = ['The Code of Hammurabi', 'The Twelve Tables', 'This should be readable', 'The Venetian Patent Statute']
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 12; n++) pdf.addPage([612, 792]).drawText(`Page ${n}`, { x: 60, y: 720, size: 22, font })
  const ctx = pdf.context
  const root = ctx.nextRef()
  const pages = pdf.getPages()
  const refs = CHAPTERS.map(() => ctx.nextRef())
  CHAPTERS.forEach((title, n) => {
    const entry = ctx.obj({ Title: PDFString.of(title), Parent: root, Dest: [pages[n * 3].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull] })
    if (n > 0) entry.set(PDFName.of('Prev'), refs[n - 1])
    if (n < refs.length - 1) entry.set(PDFName.of('Next'), refs[n + 1])
    ctx.assign(refs[n], entry)
  })
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: PDFNumber.of(refs.length) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return [...(await pdf.save())]
}

const c = await sandbox({ width: 1400, height: 900 })
const { h, v, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const state = () => h.evaluate(() => ({
  room: document.querySelector('.pdf-reader-body')?.clientWidth,
  squeeze: document.querySelector('.pdf-reader-body')?.dataset.railSqueeze,
  rail: Math.round(document.querySelector('.pdf-reader .pdf-rail')?.getBoundingClientRect().width ?? 0),
  tab: document.querySelector('.pdf-reader .pdf-rail-tab[aria-selected="true"]')?.textContent,
  thumbs: document.querySelectorAll('.pdf-reader .pdf-rail .pdf-thumb-sheet').length,
  outline: !!document.querySelector('.pdf-reader .pdf-outline'),
}))
let extra = 0
const roomTo = async (w) => { await size(w + extra, 900); await wait(900) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('pdf-rail', 'outline'))
  const src = await h.evaluate((bytes) => window.api.saveFile('law-book.pdf', new Uint8Array(bytes)), await makePdf())
  const open = async () => {
    await h.evaluate(([src]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'law-book.pdf', page: 1 } })), [src])
    await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 }); await wait(1200)
  }
  await open()
  extra = 1400 - (await state()).room
  const wide = await state()
  check('with room: the rail opens on the outline, as it was left', wide.squeeze === 'full' && wide.tab === 'Outline' && wide.outline, JSON.stringify(wide))

  // Half of a split: the page column under 520px, the rail squeezed to 152px.
  await roomTo(700)
  const squeezed = await state()
  check('squeezed: the rail shows "Pages", its thumbnails, not cut-off titles', squeezed.squeeze === 'narrow' && squeezed.tab === 'Pages' && squeezed.thumbs > 0 && !squeezed.outline, JSON.stringify(squeezed))
  check('the choice left is kept: the outline is still what it opens on with room', await h.evaluate(() => localStorage.getItem('pdf-rail')) === 'outline', '')
  await c.both(`${SHOT}-squeezed`)

  // Outline picked by hand: it stays, squeezed or not.
  await h.locator('.pdf-reader .pdf-rail-tab', { hasText: 'Outline' }).click(); await wait(500)
  const picked = await state()
  check('Outline picked by hand while squeezed: it shows', picked.tab === 'Outline' && picked.outline, JSON.stringify(picked))
  await roomTo(760); await roomTo(700)
  check('and stays as the pane changes', (await state()).tab === 'Outline', JSON.stringify(await state()))

  // With room again, in a fresh reader: the outline, as left.
  await roomTo(1100)
  check('with room again: the outline', (await state()).tab === 'Outline', JSON.stringify(await state()))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
