// Reading a long PDF by scrolling steadily: how often the page in the middle of the view is still blank (no
// picture yet) as it arrives. Pages ahead in the direction of reading are drawn before they are reached.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-scroll-ready.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const dir = mkdtempSync(join(tmpdir(), 'pdf-scroll-'))
try {
  await v('settings:set', { hintRate: 0 })
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.TimesRoman)
  const words = 'The quick brown fox jumps over the lazy dog and keeps on running through the field. '.repeat(3)
  for (let n = 1; n <= 60; n++) { const p = doc.addPage([612, 792]); for (let l = 0; l < 46; l++) p.drawText(`${n}.${l} ${words}`.slice(0, 98), { x: 40, y: 760 - l * 16, size: 11, font }) }
  const path = join(dir, 'Long.pdf'); writeFileSync(path, await doc.save())
  const added = await h.evaluate(async (p) => window.api.haligtree('media:add', [{ path: p }]), path)
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Long.pdf' } })), added.added[0].src)
  await wait(2500)
  const sample = () => h.evaluate(() => {
    const view = document.querySelector('.pdf-reader-scroll'); const r = view.getBoundingClientRect()
    const mid = r.top + r.height / 2
    const sheet = [...document.querySelectorAll('.pdf-reader .pdf-page')].find((one) => { const b = one.getBoundingClientRect(); return b.top <= mid && b.bottom >= mid })
    return sheet ? { page: Number(sheet.dataset.page), drawn: !!sheet.querySelector('canvas:not([data-pass="rough"])') } : null
  })
  let blank = 0, seen = 0
  const pages = new Set()
  for (let i = 0; i < 90; i++) {
    await h.evaluate(() => { document.querySelector('.pdf-reader-scroll').scrollTop += 380 })
    await wait(80)
    await h.screenshot()
    const one = await sample()
    if (one) { seen++; pages.add(one.page); if (!one.drawn) blank++ }
  }
  console.log(JSON.stringify({ seen, blank, pages: pages.size }))
  check('read steadily through a long book, the page in view is drawn when it arrives (blank at most 1 sample in 20)', seen > 40 && blank <= seen / 20, `${blank} blank of ${seen} samples over ${pages.size} pages`)
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
rmSync(dir, { recursive: true, force: true })
done()
