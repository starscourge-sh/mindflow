// A book's cover on the shelf turns into its pages in place, YouTube-preview
// style: a sweep across covers sets nothing off; resting on one about 0.6s and
// then sliding sideways turns the cover into that page with "n / 20" on it, and
// no second floating card comes up; leaving puts the cover back. A frame every
// 50ms through rest, slide and leave, light and dark. A Media tile does the same,
// and so does a book's cover in Home's "Continue reading", each page felt as a
// tap (haptics), the cover's box never moving.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/scrub node qa/pdf-cover-scrub.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-cover-scrub'
mkdirSync(`${SHOT}-frames`, { recursive: true })
const { check, done } = checks()

const makePdf = async (title) => {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 20; n++) pdf.addPage([300, 400]).drawText(`${title} page ${n}`, { x: 30, y: 300, size: 22, font })
  return [...(await pdf.save())]
}

const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const state = () => h.evaluate(() => ({ scrub: !!document.querySelector('[data-pdf-scrub]'), inCover: !!document.querySelector('.pdf-book-cover [data-pdf-scrub], [data-media] [data-pdf-scrub], [data-still-picture] [data-pdf-scrub]'), chip: document.querySelector('[data-pdf-scrub-page]')?.textContent ?? '', card: !!document.querySelector('[data-pdf-peek-card]') }))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const content = []
  for (const title of ['Alpha', 'Beta', 'Gamma']) {
    const src = await h.evaluate((bytes) => window.api.saveFile('book.pdf', new Uint8Array(bytes)), await makePdf(title))
    content.push({ type: 'attachment', attrs: { src, name: `${title}.pdf`, size: 900 } })
  }
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shelf' }] }, ...content] })
  await h.reload(); await wait(1500)
  await go('media'); await wait(1000)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Books' }).first().click(); await wait(2500)
  const covers = await h.evaluate(() => [...document.querySelectorAll('.pdf-book-cover')].map((one) => { const r = one.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }))
  check('three covers on the shelf', covers.length === 3, String(covers.length))
  const [a, , last] = covers
  const mid = (one) => ({ x: one.x + one.w / 2, y: one.y + one.h / 2 })

  // A sweep across the shelf: through every cover in 300ms, nothing comes up.
  await h.mouse.move(a.x - 20, mid(a).y)
  let seen = false
  for (let x = a.x - 20; x <= last.x + last.w + 20; x += 25) {
    await h.mouse.move(x, mid(a).y); await wait(15)
    const now = await state(); if (now.scrub || now.card) seen = true
  }
  await wait(700)
  const after = await state()
  check('a sweep across the covers sets nothing off', !seen && !after.scrub && !after.card, JSON.stringify(after))
  await h.mouse.move(5, 450); await wait(300)

  // Rest on the first cover, then slide: frames every 50ms, light and dark.
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await h.mouse.move(a.x + 10, mid(a).y)
    const clip = { x: a.x - 10, y: a.y - 10, width: a.w + 200, height: a.h + 60 }
    const frames = []
    for (let i = 0; i < 14; i++) { await wait(50); frames.push(await state()); await h.screenshot({ path: `${SHOT}-frames/${theme}-rest-${String(i).padStart(2, '0')}.png`, clip }) }
    check(`${theme}: resting alone changes nothing (no card, the cover stays)`, frames.every((one) => !one.scrub && !one.card), JSON.stringify(frames.filter((one) => one.scrub || one.card)))
    for (let i = 1; i <= 12; i++) {
      await h.mouse.move(a.x + 10 + (i * (a.w - 20)) / 12, mid(a).y); await wait(50)
      frames.push(await state())
      await h.screenshot({ path: `${SHOT}-frames/${theme}-slide-${String(i).padStart(2, '0')}.png`, clip })
    }
    const sliding = frames.slice(14)
    check(`${theme}: sliding after the rest turns the cover itself into the page, "n / 20" on it`, sliding.at(-1).inCover && /^\d+ \/ 20$/.test(sliding.at(-1).chip), JSON.stringify(sliding.at(-1)))
    check(`${theme}: the pages turn as it slides (from low to high)`, Number(sliding.at(-1).chip.split(' ')[0]) > Number(sliding[1]?.chip.split(' ')[0] || 0), sliding.map((one) => one.chip).join(','))
    check(`${theme}: never a second floating card`, frames.every((one) => !one.card), '')
    await h.mouse.move(5, 450)
    for (let i = 0; i < 4; i++) { await wait(50); await h.screenshot({ path: `${SHOT}-frames/${theme}-leave-${i}.png`, clip }) }
    check(`${theme}: leaving puts the cover back`, !(await state()).scrub, '')
  }
  await c.look('light')

  // Files' first page, "All": a book under "Recent" turns its pages on its own cover too, never in a card beside it
  // (the user, 12 Nov: "why the heck does a separate thumbnail popup show up ... the pdf itself already has a thumbnail").
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'All' }).first().click(); await wait(1200)
  const recent = await h.evaluate(() => { const one = document.querySelector('[data-files-recent-grid] [data-recent-file=pdf] .pdf-book-cover'); one?.scrollIntoView({ block: 'center' }); const r = one?.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height } })
  check('"Recent" on Files\' first page shows a book', !!recent, '')
  if (recent) {
    await h.mouse.move(recent.x + 10, recent.y + recent.h / 2); await wait(750)
    const rested = await state()
    check('Recent: resting on the cover brings up nothing, no card', !rested.card && !rested.scrub, JSON.stringify(rested))
    for (let i = 1; i <= 8; i++) { await h.mouse.move(recent.x + 10 + (i * (recent.w - 20)) / 8, recent.y + recent.h / 2); await wait(60) }
    await wait(200)
    const turned = await state()
    check('Recent: sliding turns the cover itself into the page, "n / 20" on it, and no card beside it', turned.inCover && !turned.card && /^\d+ \/ 20$/.test(turned.chip), JSON.stringify(turned))
    await h.screenshot({ path: `${SHOT}-recent.png` })
    // A click lands on the page on show.
    const at = turned.chip.split(' ')[0]
    await h.mouse.down(); await h.mouse.up()
    let opened = null
    for (let i = 0; i < 16 && !opened; i++) { await wait(500); opened = await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value ?? null) }
    // The book is held by a note: the turned page still opens the book there, not the note.
    check('Recent: a click on the turned cover opens the book at the page on show', !!at && opened === at, `chip ${at}, reader ${opened}`)
    await go('media'); await wait(1000)
    await h.mouse.move(5, 450); await wait(300)
  }

  // A Media tile: the same, among what a search under All finds (All itself shows a pile per kind).
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'All' }).first().click(); await wait(800)
  await h.locator('[data-page=media] input').first().fill('Alpha'); await wait(1500)
  const tile = await h.evaluate(() => { const r = document.querySelector('[data-media=pdf] [data-pdf-peek-scrub]')?.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height } })
  check('a Media tile of a PDF can turn its pages too', !!tile, '')
  if (tile) {
    await h.mouse.move(tile.x + 10, tile.y + tile.h / 2); await wait(750)
    for (let i = 1; i <= 6; i++) { await h.mouse.move(tile.x + 10 + i * 20, tile.y + tile.h / 2); await wait(60) }
    const t = await state()
    check('the tile turns into the page in place, no card', t.inCover && !t.card && /\/ 20$/.test(t.chip), JSON.stringify(t))
    await h.screenshot({ path: `${SHOT}-tile.png` })
  }

  // Home's "Continue reading": the same three books, part way through.
  const books = content.map(({ attrs }, i) => ({ src: attrs.src, name: attrs.name, title: attrs.name.replace(/\.pdf$/, ''), author: '', pages: 20, page: 5 + i, readAt: new Date(Date.now() - i * 3600_000).toISOString(), addedAt: new Date().toISOString(), highlights: 0, gems: 0, bytes: 900 }))
  await c.electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:pdf:library'); ipcMain.handle('haligtree:pdf:library', () => list) }, books)
  await h.reload(); await wait(1500)
  await go('home'); await wait(1500)
  await h.locator('[data-continue-reading]').scrollIntoViewIfNeeded().catch(() => {}); await wait(800)
  const book = await h.evaluate(() => { const r = document.querySelector('[data-continue-reading] [data-still-picture="0"] [data-pdf-peek-scrub]')?.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height } })
  check('Continue reading shows the books\' covers, each able to turn its pages', !!book, '')
  if (book) {
    // Each page crossed is felt: count the taps main is asked for.
    await c.electron.evaluate(({ ipcMain }) => { globalThis.__taps = 0; ipcMain.on('haptic:tap', () => globalThis.__taps++) })
    const box = () => h.evaluate(() => { const r = document.querySelector('[data-continue-reading] [data-still-picture="0"]')?.getBoundingClientRect(); return r && [r.left, r.top, r.width, r.height].map(Math.round).join(',') })
    const before = await box()
    for (const theme of ['light', 'dark']) {
      await c.look(theme)
      await h.mouse.move(book.x + 6, book.y + book.h / 2)
      const clip = { x: book.x - 12, y: book.y - 12, width: book.w + 24, height: book.h + 70 }
      for (let i = 0; i < 14; i++) { await wait(50); await h.screenshot({ path: `${SHOT}-frames/continue-${theme}-rest-${String(i).padStart(2, '0')}.png`, clip }) }
      const chips = []
      for (let i = 1; i <= 12; i++) {
        await h.mouse.move(book.x + 6 + (i * (book.w - 12)) / 12, book.y + book.h / 2); await wait(50)
        chips.push((await state()).chip)
        await h.screenshot({ path: `${SHOT}-frames/continue-${theme}-slide-${String(i).padStart(2, '0')}.png`, clip })
      }
      const now = await state()
      check(`${theme}: Continue reading's cover turns into its pages in place, "n / 20" on it, no card`, now.inCover && !now.card && /^\d+ \/ 20$/.test(now.chip), JSON.stringify(now))
      check(`${theme}: its pages run low to high as the pointer slides`, Number(chips.at(-1).split(' ')[0]) > Number(chips.find(Boolean)?.split(' ')[0] || 0), chips.join(','))
      const taps = await c.electron.evaluate(() => { const n = globalThis.__taps; globalThis.__taps = 0; return n })
      check(`${theme}: each page crossed is felt as a tap`, taps >= 3, `${taps} taps`)
      check(`${theme}: the cover's box never moved`, (await box()) === before, `${before} -> ${await box()}`)
      await h.mouse.move(5, 450)
      for (let i = 0; i < 4; i++) { await wait(50); await h.screenshot({ path: `${SHOT}-frames/continue-${theme}-leave-${i}.png`, clip }) }
      check(`${theme}: leaving puts Continue reading's cover back`, !(await state()).scrub, '')
    }
    await c.look('light')
  }
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
