// A PDF's side strip of pages, scrolled, keeps the house rules for long lists:
// its edges fade where more is out of sight, and the way back up shows.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-rail-scroll.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
try {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) pdf.addPage([400, 560]).drawText(`Page ${n}`, { x: 40, y: 480, size: 40, font })
  const bytes = [...(await pdf.save())]
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Long', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'long-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page canvas', { timeout: 15000 })
  await h.click('.tiptap-attachment.is-pdf button[aria-label="Sidebar"]')
  await h.waitForSelector('.pdf-rail-list .pdf-thumb', { timeout: 8000 })
  const list = '.tiptap-attachment.is-pdf .pdf-rail-list'
  check('the strip fades at its edges where there is more', await h.evaluate((sel) => getComputedStyle(document.querySelector(sel)).maskImage !== 'none', list))
  check('no way back up at the top', !(await h.$('.pdf-rail button[aria-label="Back to top"]')))
  await h.evaluate((sel) => { const el = document.querySelector(sel); el.scrollTop = el.scrollHeight }, list)
  await h.waitForSelector('.pdf-rail button[aria-label="Back to top"]', { timeout: 4000 }).catch(() => {})
  check('scrolled down: "Back to top" shows', !!(await h.$('.pdf-rail button[aria-label="Back to top"]')))
  await c.both?.(process.env.SHOT ?? '/tmp/pdf-rail-scroll')
  await h.click('.pdf-rail button[aria-label="Back to top"]')
  await wait(1200)
  check('and takes the strip back to its first page', await h.evaluate((sel) => document.querySelector(sel).scrollTop < 4, list), String(await h.evaluate((sel) => document.querySelector(sel).scrollTop, list)))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
