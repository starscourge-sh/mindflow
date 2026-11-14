// A scanned book's pages draw: a PDF whose pages are black-and-white scans stored as fax-style (CCITT) images, which
// pdf.js decodes with a decoder of its own that it must be told where to find. Told nowhere, every page drew blank
// and only the scan's hidden words were there (the user, 14 Nov: "it seems that book does not display in haligtree…
// is it because it seems to be a scan?"; pdf.js: "Unable to decode image … JBig2 failed to initialize").
// The scan is a page of print from a book of the user's own (SCAN=<its path>, SCAN_PAGE=<from 1>, the 11th by
// default; never copied into the repo): taken in memory with pdf-lib and dropped into a page, as Finder drops a file.
// Not the first: that book's cover is a colour photo (JPEG), which drew before the fix as well.
//   SCAN=<a scanned PDF> QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-scan-pages.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const scan = process.env.SCAN ?? join(homedir(), 'Documents/books/12 - Beyond Good and Evil (Friedrich Nietzsche, Walter Kaufmann).pdf')
if (!existsSync(scan)) { console.log(`SKIP  no scanned PDF at ${scan} (SCAN=<path>)`); process.exit(0) }
const EDITOR = '.tiptap.ProseMirror'
const { check, done } = checks()
// That page alone, in memory.
const whole = await PDFDocument.load(readFileSync(scan), { ignoreEncryption: true })
const one = await PDFDocument.create()
const [page] = await one.copyPages(whole, [Number(process.env.SCAN_PAGE ?? 11) - 1])
one.addPage(page)
const bytes = Array.from(await one.save())
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'A scanned page', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'scan.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] canvas', { timeout: 20000 }).catch(() => {})
  await wait(2500)
  // How much of the drawn page is ink: a blank sheet has none, a scanned page of print a good deal.
  const ink = await h.evaluate(() => {
    const canvas = document.querySelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] canvas')
    if (!canvas || !canvas.width) return null
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < 110) dark++
    return { dark, of: data.length / 4, share: Math.round((dark / (data.length / 4)) * 10000) / 100, png: canvas.toDataURL('image/png') }
  })
  // The page as drawn, to look at (QA_SHOTS=<folder>).
  if (ink?.png && process.env.QA_SHOTS) writeFileSync(join(process.env.QA_SHOTS, 'scanned-page.png'), Buffer.from(ink.png.split(',')[1], 'base64'))
  if (ink) delete ink.png
  check('a scanned page draws: its print is on the page, not a blank sheet', !!ink && ink.dark > 2000, JSON.stringify(ink))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
