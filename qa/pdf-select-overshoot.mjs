// Selecting a PDF's words by dragging past the last line, down and off at an angle, takes the selection to the
// end of the page's words, as Preview and PDF.js's viewer do; it never stops short where the pointer left the words.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-select-overshoot.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h, v, close } = c
const wait = (ms) => h.waitForTimeout(ms)
const dir = mkdtempSync(join(tmpdir(), 'pdf-select-'))
try {
  await v('settings:set', { hintRate: 0 })
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([420, 600])
  for (let n = 0; n < 6; n++) page.drawText(`Line ${n + 1} of the page, a few words long.`, { x: 40, y: 540 - n * 26, size: 14, font })
  doc.addPage([420, 600]).drawText('The next page.', { x: 40, y: 540, size: 14, font })
  const path = join(dir, 'Lines.pdf'); writeFileSync(path, await doc.save())
  const added = await h.evaluate(async (p) => window.api.haligtree('media:add', [{ path: p }]), path)
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Lines.pdf' } })), added.added[0].src)
  await wait(2500)
  const span = h.locator('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { hasText: 'Line 1' }).first()
  const last = h.locator('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { hasText: 'Line 6' }).first()
  const a = await span.boundingBox(), z = await last.boundingBox()
  check('the words are laid on the page, with their end', !!a && !!z && (await h.locator('.pdf-reader .pdf-page[data-page="1"] .textLayer .endOfContent').count()) === 1)
  await h.mouse.move(a.x + 2, a.y + a.height / 2); await h.mouse.down()
  // Down the lines, then off past the last one, down and to the right at an angle, over blank page.
  const to = { x: z.x + z.width + 140, y: z.y + z.height + 160 }
  for (let i = 1; i <= 20; i++) { await h.mouse.move(a.x + 2 + ((to.x - a.x) * i) / 20, a.y + a.height / 2 + ((to.y - a.y) * i) / 20); await wait(25) }
  const during = await h.evaluate(() => document.querySelector('.pdf-reader .pdf-page[data-page="1"] .textLayer')?.classList.contains('selecting'))
  await h.mouse.up(); await wait(300)
  const said = await h.evaluate(() => window.getSelection()?.toString() ?? '')
  check('while held, the page is in selecting', during === true, String(during))
  check('overshot at an angle: every line to the last is selected', said.includes('Line 1') && /Line 6 of the page, a few words long\.\s*$/.test(said), JSON.stringify(said.slice(-80)))
  check('let go, the page is no longer selecting', await h.evaluate(() => !document.querySelector('.textLayer.selecting')))
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
