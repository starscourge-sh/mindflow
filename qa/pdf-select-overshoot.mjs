// Selecting a PDF's words by dragging past the last line, down and off at an angle, takes the selection to the
// end of the page's words, as Preview and PDF.js's viewer do; it never stops short where the pointer left the words.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-select-overshoot.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
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

  // A magazine's page (the user, 13 Nov: "why all the selection, because i was just tryign to select this line first",
  // a DK book): its words in columns, and a box at the top whose words come LAST in the page's own order. One line low
  // on the page, picked from its start to past its end, is that line alone; it never takes the box and everything
  // between. Only a drag below the page's lowest words goes to the end of the page.
  const mag = await PDFDocument.create(); const serif = await mag.embedFont(StandardFonts.TimesRoman)
  const sheet = mag.addPage([420, 600])
  const body = ['Without a trace', 'On the night of 16 February 2003,', 'the thieves broke into the vault.', 'Despite ten layers of security,', 'they left without setting it off.']
  body.forEach((line, n) => sheet.drawText(line, { x: 40, y: 300 - n * 24, size: 14, font: serif }))
  // The box, drawn last: last in the page's order, highest on the page.
  ;['IN CONTEXT', 'LOCATION Antwerp, Belgium', 'THEME Vault heist'].forEach((line, n) => sheet.drawText(line, { x: 40, y: 540 - n * 22, size: 12, font: serif }))
  const magPath = join(dir, 'Magazine.pdf'); writeFileSync(magPath, await mag.save())
  const magAdded = await h.evaluate(async (p) => window.api.haligtree('media:add', [{ path: p }]), magPath)
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Magazine.pdf' } })), magAdded.added[0].src)
  await wait(2500)
  const words = (text) => h.locator('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { hasText: text }).first()
  const night = await words('On the night').boundingBox()
  const box = await words('THEME').boundingBox()
  check('the box sits above the line, and its words come after it in the page', !!night && !!box && box.y < night.y && await h.evaluate(() => { const spans = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .textLayer span')].map((one) => one.textContent); return spans.findIndex((one) => /THEME/.test(one)) > spans.findIndex((one) => /On the night/.test(one)) }))
  const pick = async (from, to) => {
    await h.evaluate(() => window.getSelection()?.removeAllRanges())
    await h.mouse.move(from.x, from.y); await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await wait(25) }
    await h.mouse.up(); await wait(300)
    return h.evaluate(() => window.getSelection()?.toString() ?? '')
  }
  // Along the line, and on past its end over the blank page beside it.
  const one = await pick({ x: night.x + 1, y: night.y + night.height / 2 }, { x: night.x + night.width + 60, y: night.y + night.height / 2 + 3 })
  check('one line low on the page, picked along and past its end, is that line alone', /On the night of 16 February 2003,/.test(one) && !/THEME|LOCATION|CONTEXT|vault|Despite/.test(one), JSON.stringify(one.slice(0, 160)))
  // Below every word on the page: to the end of the page's words, as before.
  const low = await words('they left').boundingBox()
  const all = await pick({ x: night.x + 1, y: night.y + night.height / 2 }, { x: low.x + 60, y: low.y + low.height + 120 })
  check('a drag below the page\'s lowest words still goes to the end of the page', /On the night/.test(all) && /setting it off\./.test(all) && /THEME Vault heist\s*$/.test(all), JSON.stringify(all.slice(-120)))
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
rmSync(dir, { recursive: true, force: true })
done()
