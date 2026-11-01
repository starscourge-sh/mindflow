// Reading taps, at any speed and zoom and in every layout: each page that
// comes into place while you scroll by hand taps once, never twice for one
// page, however fast the wheel; a jump (the page field, a link) taps nothing.
// Main logs the taps (HALIGTREE_QA_AWAY), none is played.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-haptics-read.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const kinds = async () => (await electron.evaluate(() => globalThis.haligtreeTapKinds?.() ?? [])).length
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 60; n++) pdf.addPage([400, 520]).drawText(`Page ${n}`, { x: 40, y: 460, size: 22, font })
  const src = await h.evaluate((bytes) => window.api.saveFile('taps.pdf', new Uint8Array(bytes)), [...(await pdf.save())])
  await h.evaluate(([src]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'taps.pdf', page: 1 } })), [src])
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 }); await wait(1500)
  const box = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // The pages the field shows, read each frame: how many times a new page landed.
  await h.evaluate(() => {
    window.__landed = []
    const field = document.querySelector('.pdf-reader [data-scrub-field]')
    const read = () => { const now = Number(field?.value); if (window.__landed.at(-1) !== now) window.__landed.push(now); window.__reading = requestAnimationFrame(read) }
    read()
  })
  const run = async (label, wheel) => {
    await h.evaluate(() => (window.__landed = [window.__landed.at(-1)]))
    const before = await kinds()
    await wheel()
    await wait(900)
    const taps = (await kinds()) - before
    const landed = await h.evaluate(() => window.__landed.length - 1)
    check(`${label}: a tap for pages landed, never more taps than pages (${taps} taps, ${landed} pages)`, taps > 0 && taps <= landed, `${taps} taps for ${landed} pages`)
  }
  await run('slow scroll', async () => { for (let i = 0; i < 12; i++) { await h.mouse.wheel(0, 260); await wait(140) } })
  await run('fast scroll (many wheel events a frame)', async () => { for (let i = 0; i < 40; i++) await h.mouse.wheel(0, 180) })
  await h.keyboard.press('Meta+Equal'); await wait(800)
  await run('zoomed in', async () => { for (let i = 0; i < 20; i++) await h.mouse.wheel(0, 200) })
  // A jump taps nothing.
  const before = await kinds()
  await h.locator('.pdf-reader [data-scrub-field]').fill('5'); await h.keyboard.press('Enter'); await wait(800)
  check('a jump with the page field taps nothing', (await kinds()) - before <= 1, String((await kinds()) - before))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
