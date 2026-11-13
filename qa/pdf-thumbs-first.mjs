// Opening a PDF: the thumbnails in the rail's view show their pages close behind the page itself, never a
// row of empty boxes for a second or two while pages out of sight are drawn first. Also: jumping deep into
// the book, the rail follows to the new page's thumbnail with an eased glide, not a snap, and a thumbnail
// already in view never moves the rail.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-thumbs-first.mjs
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
const dir = mkdtempSync(join(tmpdir(), 'pdf-thumbs-'))
const SHOT = process.env.SHOT
try {
  await v('settings:set', { hintRate: 0 })
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.TimesRoman)
  const words = 'The quick brown fox jumps over the lazy dog and keeps on running through the field. '.repeat(3)
  // Dense pages, so each one takes the worker a while, as a real book's do.
  for (let n = 1; n <= 80; n++) { const p = doc.addPage([612, 792]); for (let l = 0; l < 90; l++) p.drawText(`${n}.${l} ${words}`.slice(0, 160), { x: 30, y: 770 - l * 8.4, size: 6, font }) }
  const path = join(dir, 'Dense.pdf'); writeFileSync(path, await doc.save())
  const added = await h.evaluate(async (p) => window.api.haligtree('media:add', [{ path: p }]), path)
  await h.evaluate(() => localStorage.setItem('pdf-rail', 'pages'))
  const t0 = await h.evaluate((src) => (window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Dense.pdf' } })), performance.now()), added.added[0].src)
  // Every 25ms: has the page drawn, and how many thumbnails in the rail's view still show nothing.
  const state = () => h.evaluate(() => {
    const page = !!document.querySelector('.pdf-reader .pdf-page canvas')
    const sharp = document.querySelectorAll('.pdf-reader .pdf-page canvas:not([data-pass="rough"])').length
    const list = document.querySelector('.pdf-rail-list')
    if (!list) return { now: performance.now(), page, sharp, seen: 0, blank: 0 }
    const r = list.getBoundingClientRect()
    const inView = [...list.querySelectorAll('.pdf-thumb')].filter((one) => { const b = one.getBoundingClientRect(); return b.bottom > r.top && b.top < r.bottom })
    const blank = inView.filter((one) => {
      const c = one.querySelector('canvas')
      const img = one.querySelector('img')
      if (img && img.complete && img.naturalWidth) return false
      if (!c || !c.width || !c.height) return true
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < px.length; i += 4 * 97) if (px[i]) return false
      return true
    }).length
    return { now: performance.now(), page, sharp, seen: inView.length, blank }
  })
  let pageAt = null, thumbsAt = null, sharpBefore = 0
  for (let i = 0; i < 400 && thumbsAt === null; i++) {
    const one = await state()
    if (one.page && pageAt === null) pageAt = one.now - t0
    if (one.seen && !one.blank && thumbsAt === null) (thumbsAt = one.now - t0), (sharpBefore = one.sharp)
    await wait(25)
  }
  const gap = thumbsAt === null || pageAt === null ? Infinity : thumbsAt - pageAt
  console.log(JSON.stringify({ pageAt: Math.round(pageAt), thumbsAt: Math.round(thumbsAt), gap: Math.round(gap), sharpBefore }))
  // Pages out of sight never go ahead of the thumbnails in sight: the page on show, and at most the one neighbour already
  // being drawn before the rail asked, are sharp by then.
  check('no more than one page out of sight is drawn sharp before the thumbnails in view', sharpBefore <= 2, `${sharpBefore} pages drawn sharp first`)
  // Each thumbnail in view still has its own page to read; what it no longer waits for is pages nobody is looking at.
  check('the thumbnails in view show their pages within 1.2s of the page itself', gap <= 1200, `page at ${Math.round(pageAt)}ms, every thumbnail in view at ${Math.round(thumbsAt)}ms, ${Math.round(gap)}ms behind`)
  if (SHOT) await h.screenshot({ path: `${SHOT}-open.png` })

  // A thumbnail already in view, picked: it stays in view, and the rail moves only the little way that brings it to the
  // middle (the page you are on is kept in the rail's middle, one glide a page turned: qa/pdf-rail-centre.mjs, 11 Nov),
  // never a jump. This line used to want the rail still, which the rail's middle-keeping rightly ended on every build.
  await wait(600)
  const top = () => h.evaluate(() => document.querySelector('.pdf-rail-list').scrollTop)
  const before = await top()
  await h.click('.pdf-rail-list .pdf-thumb[aria-label="Page 2"]')
  await wait(400)
  const picked = await h.evaluate(() => {
    const list = document.querySelector('.pdf-rail-list'); const r = list.getBoundingClientRect()
    const b = list.querySelector('.pdf-thumb[aria-label="Page 2"]').getBoundingClientRect()
    return { top: list.scrollTop, inView: b.top >= r.top - 1 && b.bottom <= r.bottom + 1, tall: Math.round(b.height) }
  })
  check('picking a thumbnail already in view keeps it in view, the rail moving no more than one thumbnail to bring it to the middle', picked.inView && Math.abs(picked.top - before) <= picked.tall, `${before} then ${picked.top}, a thumbnail ${picked.tall}px, in view ${picked.inView}`)

  // A jump far down: the rail glides there over several frames, and gets there.
  const tops = await h.evaluate(async () => {
    const list = document.querySelector('.pdf-rail-list')
    const view = document.querySelector('.pdf-reader-scroll')
    const target = document.querySelector('.pdf-reader .pdf-page[data-page="40"]')
    view.scrollTop += target.getBoundingClientRect().top - view.getBoundingClientRect().top
    const seen = []
    const t = performance.now()
    while (performance.now() - t < 900) { await new Promise(requestAnimationFrame); seen.push(list.scrollTop) }
    return seen
  })
  const moves = tops.filter((one, i) => i && one !== tops[i - 1]).length
  const end = await h.evaluate(() => { const list = document.querySelector('.pdf-rail-list').getBoundingClientRect(); const b = document.querySelector('.pdf-thumb.is-here')?.getBoundingClientRect(); return b ? b.top >= list.top - 1 && b.bottom <= list.bottom + 1 : false })
  const biggest = Math.max(...tops.slice(1).map((one, i) => Math.abs(one - tops[i])))
  const travel = Math.abs(tops.at(-1) - tops[0])
  console.log(JSON.stringify({ moves, biggest: Math.round(biggest), travel: Math.round(travel) }))
  // A jump of many views first skips to a view and a half short (no rows streaming past), then eases the rest.
  const steps = tops.slice(1).map((one, i) => Math.abs(one - tops[i])).filter(Boolean)
  const eased = steps.slice(1)
  const glided = eased.reduce((a, b) => a + b, 0)
  check('a jump far down eases the last stretch over several frames, no single frame doing most of it', eased.length >= 6 && Math.max(...eased) < glided * 0.4, `${steps.length} frames moved, eased ${Math.round(glided)}px of ${Math.round(travel)}px, biggest eased step ${Math.round(Math.max(0, ...eased))}px`)
  check('the new page\'s thumbnail ends in view', end)
  if (SHOT) await h.screenshot({ path: `${SHOT}-jumped.png` })
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
rmSync(dir, { recursive: true, force: true })
done()
