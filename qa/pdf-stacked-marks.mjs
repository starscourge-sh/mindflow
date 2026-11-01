// Highlights over highlights, and old joined words. Two highlights kept over the
// same words (one pink, one green; the same line twice, one with its full stop)
// are offered as one in Details, "Join them" makes them one; on the page,
// overlapping colours are never drawn twice over the same words. A highlight kept
// as "thenature of justice" on a page never drawn is put right once the book
// opens, and the gem it made reads "the nature" too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/stacked node qa/pdf-stacked-marks.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-stacked-marks'
const { check, done } = checks()

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText('Their philosophers wrote on the', { x: 40, y: 470, size: 12, font })
    page.drawText('nature of justice and how law shaped', { x: 40, y: 454, size: 12, font })
    page.drawText('Genocide is an attempt to destroy a group.', { x: 40, y: 420, size: 12, font })
  }
  return [...(await pdf.save())]
}

const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const NAME = 'the-law.pdf'
  const src = await h.evaluate((bytes) => window.api.saveFile('the-law.pdf', new Uint8Array(bytes)), await makePdf())
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pile' }] }, { type: 'attachment', attrs: { src, name: NAME, size: 900 } }] })
  // The page text: "Their philosophers wrote on the" (31) + "nature of justice and how law shaped" ... offsets of "the" at 28.
  const gem = await v('nugget:from', 'thenature of justice\n\n[The Law Book, p. 30](x)', {})
  await v('item:save', gem, { title: 'thenature of justice' })
  const old = await v('pdf:highlight', src, { page: 30, quote: 'thenature of justice', start: 28, end: 48, gemId: gem })
  // Two stacked on p. 5: the same line, pink then green, one with its full stop.
  const line = 'Genocide is an attempt to destroy a group'
  const at = 'Their philosophers wrote on thenature of justice and how law shaped'.length
  await v('pdf:highlight', src, { page: 5, quote: line, start: at, end: at + line.length, color: 'pink' })
  await v('pdf:highlight', src, { page: 5, quote: line + '.', start: at, end: at + line.length + 1, color: 'green' })
  await h.reload(); await wait(1500)

  await h.evaluate(([src, name]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name, page: 5 } })), [src, NAME])
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 }); await wait(1500)
  if (!(await h.$('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
  await h.waitForSelector('.read-details', { timeout: 5000 }); await wait(1500)

  // On the page: no word under two colours at once.
  const bands = await h.evaluate(() => {
    const all = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="5"] .pdf-mark')].map((one) => one.getBoundingClientRect())
    let overlap = 0
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), hh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 2 && hh > 2) overlap++
    }
    return { bands: all.length, overlap }
  })
  check('stacked highlights on the page: no words under two colours at once', bands.bands > 0 && bands.overlap === 0, JSON.stringify(bands))
  await c.both(`${SHOT}-page`)

  const offer = await h.evaluate(() => document.querySelector('.read-details-stacked')?.textContent ?? '')
  check('Details offers to join the two highlights over the same line', /Two highlights cover the same words on p\. 5/.test(offer), offer)
  await c.both(`${SHOT}-offer`)
  await h.locator('.read-details-stacked button').click(); await wait(1000)
  const left = (await v('pdf:highlights', src)).filter((one) => one.page === 5)
  check('"Join them" leaves one highlight, the fuller words, the colour on top', left.length === 1 && left[0].quote === line + '.' && left[0].color === 'green', JSON.stringify(left))
  check('the offer goes once they are one', !(await h.$('.read-details-stacked')))

  // The page never drawn (p. 30): its highlight and gem read "the nature".
  let fixed
  for (let i = 0; i < 20; i++) { fixed = (await v('pdf:highlights', src)).find((one) => one.id === old); if (fixed?.quote === 'the nature of justice') break; await wait(300) }
  check('a highlight kept as "thenature" on a page never drawn reads "the nature"', fixed?.quote === 'the nature of justice', fixed?.quote)
  const gemNow = await v('item', gem)
  const said = JSON.stringify({ title: gemNow?.title, body: gemNow?.body })
  check('its gem reads "the nature" too, title and words', /the nature of justice/.test(said) && !/thenature/.test(said), said.slice(0, 300))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
