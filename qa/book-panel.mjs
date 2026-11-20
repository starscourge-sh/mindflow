// A book's panel (Files, Books; and the reader's Details) drawn as the Display menu draws its sections: each part's title
// row above its island on the panel's ground, the island holding only the rows, no title held over rows as they scroll;
// the "↓" pill glides (scrollTop over many frames, no frame's step over 40px), leaves no ring after a click, and fades.
// A reader who opens Files on Books, looks over a book, presses the pill, opens the book and its Details.
// On a copy of the seeded sandbox, with three PDFs added (QA_PDFS: a folder holding them):
//   QA_ARGS=--sandbox QA_DATA=<copy of sandbox-seed.noindex/c-tip> QA_PDFS=<folder> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/book-panel.mjs
import { readdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 1000 })
const { h, go, close, errors } = s
const wait = (ms) => h.waitForTimeout(ms)
const P = '[data-inspector]'
// Each part: the title's foot against its island's top, and whether a title sits inside an island.
const parts = (root) => h.evaluate((root) => [...document.querySelectorAll(`${root} .read-details-section`)].map((sec) => {
  const head = sec.querySelector(':scope > .read-details-heading')?.getBoundingClientRect()
  const island = sec.querySelector(':scope > .read-details-island')?.getBoundingClientRect()
  return { title: sec.querySelector('h3')?.textContent?.trim(), gap: head && island ? Math.round(island.top - head.bottom) : null, inside: !!sec.querySelector('.read-details-island .read-details-heading'), sticky: getComputedStyle(sec.querySelector('.read-details-heading')).position === 'sticky' }
}), root)
try {
  const dir = process.env.QA_PDFS
  const pdfs = readdirSync(dir).filter((one) => one.endsWith('.pdf')).slice(0, 3).map((one) => `${dir}/${one}`)
  const told = await h.evaluate((list) => window.api.haligtree('media:add', list.map((path) => ({ path }))), pdfs)
  const book = told.added[0]
  const colours = [null, 'green', 'blue', 'later']
  for (let n = 0; n < 40; n++) await s.v('pdf:highlight', book.src, { page: 1 + (n % 3), quote: `sequences of outcomes ${n + 1}`, start: n * 50, end: n * 50 + 30, color: colours[n % 4] })
  for (let n = 0; n < 8; n++) await h.evaluate(([b, n]) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Reading notes ${n + 1}` }] }, { type: 'attachment', attrs: { src: b.src, name: b.name, size: b.size } }] } }), [book, n])
  await s.v('pdf:read', book.src, 2, 3).catch(() => {})
  await go('media'); await wait(800)
  await h.locator('[data-media-kinds] button', { hasText: 'Books' }).first().click(); await wait(1500)
  const shelf = await parts(P)
  check('the shelf panel: every title sits above its island, 4px apart (Display\'s gap), none inside one, none held at the top', shelf.length >= 2 && shelf.every((one) => one.gap !== null && one.gap >= 3 && one.gap <= 6 && !one.inside && !one.sticky), JSON.stringify(shelf))
  // Scrolled through: no title ever lies over a row.
  const over = await h.evaluate((P) => {
    const body = document.querySelector(`${P} [data-panel-scroll]`)
    const hits = []
    for (let top = 0; top <= body.scrollHeight; top += 40) {
      body.scrollTop = top
      for (const head of body.querySelectorAll('.read-details-heading')) {
        const r = head.getBoundingClientRect()
        if ([...body.querySelectorAll('.read-details-mark, .book-cited-row, .pdf-inspector-row')].some((row) => { const q = row.getBoundingClientRect(); return q.bottom > r.top + 1 && q.top < r.bottom - 1 })) hits.push(`${top}: ${head.textContent.trim()}`)
      }
    }
    body.scrollTop = 0
    return hits
  }, P)
  check('scrolled from top to foot, no title ever lies over a row', over.length === 0, over.join(' | '))
  await wait(300)
  // The pill, pressed with the pointer: the scroll read on every frame.
  await h.evaluate((P) => {
    const body = document.querySelector(`${P} [data-panel-scroll]`)
    window.__tops = []
    const t0 = performance.now()
    const read = () => { window.__tops.push(body.scrollTop); if (performance.now() - t0 < 1200) requestAnimationFrame(read) }
    requestAnimationFrame(read)
  }, P)
  await h.locator(`${P} [data-more-below] button`).click()
  await wait(1300)
  const tops = await h.evaluate(() => window.__tops)
  const steps = tops.slice(1).map((v, i) => v - tops[i])
  const moving = steps.filter((d) => d > 0.5).length
  check('the "↓" pill glides: the scroll moves over 8 frames or more, no frame\'s step over 40px', moving >= 8 && Math.max(...steps) <= 40 && tops.at(-1) > tops[0], `moved ${Math.round(tops.at(-1) - tops[0])}px over ${moving} frames, largest step ${Math.round(Math.max(...steps))}`)
  check('...and keeps no focus or ring after the click', await h.evaluate(() => !document.activeElement?.closest('[data-more-below]')))
  // At the foot the pill fades away: read part way through its going.
  await h.evaluate((P) => { const body = document.querySelector(`${P} [data-panel-scroll]`); body.scrollTop = body.scrollHeight }, P)
  const fading = []
  for (let i = 0; i < 6; i++) { fading.push(await h.evaluate(() => { const b = document.querySelector('[data-more-below] button'); return b ? Number(getComputedStyle(b).opacity) : 0 })); await wait(30) }
  check('...and fades out at the foot, never gone in one frame', fading.some((o) => o > 0.05 && o < 0.95) && fading.at(-1) < 0.05, JSON.stringify(fading))
  // The reader's Details, the same way.
  await h.locator(`[data-book="${book.src}"]`).click(); await wait(2500)
  if (!(await h.locator('.read-details').count())) { await h.locator('[aria-label="Details"]').first().click(); await wait(1500) }
  const reader = await parts('.read-details')
  check('the reader\'s Details: In your notes, Highlights and Information each titled above its island', reader.length === 3 && reader.every((one) => one.gap >= 3 && one.gap <= 6 && !one.inside && !one.sticky), JSON.stringify(reader))
  check('no page errors', errors.length === 0, errors.join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' '))
} finally {
  await close()
}
done()
