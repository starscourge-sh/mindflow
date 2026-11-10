// Switching books on Media's shelf: the panel's parts hold still. The cover's
// box, the "Continue" button, the page bar and the list under them are measured
// for one book, then in every frame for 1s after picking another (a short title
// and a long one): nothing moves, and the new book's cover is there in the first frame.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-panel-still.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const makePdf = async (title) => {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 30; n++) pdf.addPage([300, 400]).drawText(`${n}`, { x: 30, y: 300, size: 22, font })
  return [...(await pdf.save())]
}
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const content = []
  for (const title of ['Law', 'The Very Long Book of Laws, Customs and the Courts That Keep Them']) {
    const src = await h.evaluate((bytes) => window.api.saveFile('b.pdf', new Uint8Array(bytes)), await makePdf(title))
    await v('pdf:read', src, 5, 30)
    content.push({ type: 'attachment', attrs: { src, name: `${title.slice(0, 10)}.pdf`, size: 900 } })
  }
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shelf' }] }, ...content] })
  await h.reload(); await wait(1500)
  await go('media'); await wait(800)
  // Books alone: the kinds row only shows with two kinds or more, so the shelf is asked for directly, as a pile's link asks.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:media-kind', { detail: 'pdf' }))); await wait(2500)
  const boxes = () => h.evaluate(() => {
    const p = document.querySelector('[data-inspector]')
    const at = (sel) => { const r = p?.querySelector(sel)?.getBoundingClientRect(); return r ? `${Math.round(r.top)}:${Math.round(r.height)}` : 'none' }
    return { cover: at('.book-head-cover'), open: at('.pdf-inspector-open'), bar: at('[data-page-bar]'), body: at('.book-panel-body'), image: !!p?.querySelector('.book-head-cover img') }
  })
  const before = await boxes()
  await h.locator('[data-library] .pdf-book').nth(1).click()
  const frames = []
  for (let i = 0; i < 20; i++) { frames.push(await boxes()); await wait(50) }
  const moved = frames.filter((one) => one.cover !== before.cover || one.open !== before.open || one.bar !== before.bar || one.body !== before.body)
  console.log(JSON.stringify({ before, frames: frames.slice(0, 3), last: frames.at(-1) }))
  check('picking another book: the cover, Continue, the page bar and the list hold still in every frame', !moved.length, JSON.stringify({ before, moved: moved.slice(0, 2) }))
  check('the new book\'s cover is there in the first frame', frames[0].image, JSON.stringify(frames[0]))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
