// The first sweep along a big PDF's name moves the picture with the pointer, and the page stopped on
// is drawn soon after: before, every page passed was queued and the card sat on one page for seconds.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-peek-first-sweep.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { castFrames } from './cast-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
try {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 300; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n}`, { x: 40, y: 480, size: 48, font })
    for (let k = 0; k < 30; k++) page.drawText(`Line ${k} of a long page of text, number ${n}.`, { x: 40, y: 420 - k * 12, size: 9, font })
  }
  const bytes = [...(await pdf.save())]
  await v('settings:set', { sounds: false, hintRate: 0 })
  if (process.env.LOOK) { await c.look(process.env.LOOK); await wait(400) }
  const id = await v('article:new')
  await v('item:save', id, { title: 'Big book', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'big-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  const name = h.locator('.tiptap-attachment-name[data-pdf-peek]').first()
  await name.waitFor({ timeout: 15000 })
  const box = await name.boundingBox()
  // With FRAMES=dir (and LOOK=dark for the dark look) the card's entrance is kept at the page's own pace, to be read by eye.
  if (process.env.FRAMES) await castFrames(h, process.env.FRAMES, `pdf-peek-${process.env.LOOK ?? 'light'}`, () => h.mouse.move(box.x + 2, box.y + box.height / 2), 1200)
  else await h.mouse.move(box.x + 2, box.y + box.height / 2)
  await h.waitForSelector('[data-pdf-peek-card]', { timeout: 8000 })
  await wait(300)
  // Every picture shown while sweeping and after, with its time.
  await h.evaluate(() => {
    window.__shots = []
    const tick = () => {
      const src = document.querySelector('[data-pdf-peek-card] img')?.src ?? ''
      const corner = document.querySelector('[data-pdf-peek-page]')?.textContent?.trim() ?? ''
      const last = window.__shots.at(-1)
      if (!last || last.src !== src || last.corner !== corner) window.__shots.push({ t: performance.now(), src: src.slice(-40), corner })
      window.__raf = requestAnimationFrame(tick)
    }
    tick()
  })
  // A fast sweep to 90% of the name, as a person flicks across it.
  for (let i = 1; i <= 30; i++) { await h.mouse.move(box.x + 2 + (box.width * 0.9 * i) / 30, box.y + box.height / 2); await wait(15) }
  const stopped = await h.evaluate(() => performance.now())
  await wait(2500)
  const shots = await h.evaluate(() => (cancelAnimationFrame(window.__raf), window.__shots))
  const during = new Set(shots.filter((s) => s.t <= stopped).map((s) => s.src)).size
  const final = shots.at(-1)
  const settledAt = [...shots].reverse().find((s) => s.src !== final.src)
  const lastChange = shots.filter((s) => s.src === final.src)[0]?.t ?? stopped
  const wait_ms = Math.max(0, Math.round(lastChange - stopped))
  console.log(JSON.stringify({ during, corner: final.corner, wait_ms, changes: shots.length }))
  check('the picture moves while sweeping (more than one page shown on the way)', during > 2, `${during} pictures`)
  check('the page stopped on is drawn within 600 ms', wait_ms <= 600, `${wait_ms} ms`)
  void settledAt
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
