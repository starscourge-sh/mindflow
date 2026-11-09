// Reading a 320-page PDF fast: scrolled steadily (about 1,400px a second), paged a screen at a time and scrolled
// back, every page that comes into view is timed from coming into view to drawn, and every sample counts as blank
// when any page on show has no picture yet. Memory is the renderer's working set before and after.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-scroll-speed.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, close, electron } = s
const wait = (ms) => h.waitForTimeout(ms)
const dir = mkdtempSync(join(tmpdir(), 'pdf-speed-'))
const memory = async () => {
  const metrics = await electron.evaluate(({ app }) => app.getAppMetrics())
  const tabs = metrics.filter((m) => m.type === 'Tab' || m.type === 'Renderer')
  return Math.round(Math.max(...tabs.map((m) => m.memory.workingSetSize)) / 1024)
}
try {
  await v('settings:set', { hintRate: 0 })
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.TimesRoman)
  const words = 'The quick brown fox jumps over the lazy dog and keeps on running through the field. '.repeat(3)
  // Scanned pages, as a library book is: a page-sized photo on each, eight different ones so none is read from a
  // cache, made as JPEGs in the window itself.
  const scans = await h.evaluate(async () => {
    const out = []
    for (let k = 0; k < 8; k++) {
      const c = document.createElement('canvas'); c.width = 1275; c.height = 1650
      const g = c.getContext('2d'); g.fillStyle = '#f4efe4'; g.fillRect(0, 0, c.width, c.height)
      for (let i = 0; i < 9000; i++) { g.fillStyle = `hsl(${(i * 7 + k * 40) % 360} 30% ${20 + (i % 60)}%)`; g.fillRect((i * 97 + k * 13) % 1275, (i * 61) % 1650, 2 + (i % 13), 1 + (i % 5)) }
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8))
      out.push([...new Uint8Array(await blob.arrayBuffer())])
    }
    return out
  })
  const images = await Promise.all(scans.map((bytes) => doc.embedJpg(Uint8Array.from(bytes))))
  for (let n = 1; n <= 320; n++) {
    const p = doc.addPage([612, 792])
    p.drawImage(images[n % 8], { x: 0, y: 0, width: 612, height: 792 })
    for (let l = 0; l < 46; l++) p.drawText(`${n}.${l} ${words}`.slice(0, 98), { x: 40, y: 760 - l * 16, size: 11, font })
  }
  const path = join(dir, 'Long.pdf'); writeFileSync(path, await doc.save())
  const added = await h.evaluate(async (p) => window.api.haligtree('media:add', [{ path: p }]), path)
  // DARK=1: "Dark pages", where each scanned page is drawn twice and its picture read piece by piece, the heaviest case.
  if (process.env.DARK) await h.evaluate(() => localStorage.setItem('pdf-dark', '1'))
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'Long.pdf' } })), added.added[0].src)
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 })
  await wait(2500)
  const before = await memory()
  // Watches every sheet: when it comes into view, when its first picture shows, and per sample whether a page on show is blank.
  await h.evaluate(() => {
    const view = document.querySelector('.pdf-reader-scroll')
    const t = (window.__speed = { entered: new Map(), shown: [], frames: 0, blank: 0, blurry: 0 })
    const has = (sheet) => !!sheet.querySelector('canvas')
    // Sharp: drawn at the screen's own density, not the quick half-size picture shown first.
    const sharp = (sheet) => !!sheet.querySelector('canvas:not([data-pass="rough"])')
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const page = Number(e.target.dataset.page)
        if (!e.isIntersecting || t.entered.has(page)) continue
        if (sharp(e.target)) (t.shown.push(0), t.entered.set(page, -1))
        else t.entered.set(page, performance.now())
      }
    }, { root: view })
    document.querySelectorAll('.pdf-reader .pdf-page').forEach((one) => io.observe(one))
    new MutationObserver((list) => {
      for (const m of list) {
        const sheet = m.target.closest?.('.pdf-page')
        const page = Number(sheet?.dataset.page)
        if (sheet && t.entered.get(page) > 0 && sharp(sheet)) (t.shown.push(performance.now() - t.entered.get(page)), t.entered.set(page, -1))
      }
    }).observe(document.querySelector('.pdf-reader .pdf-pages'), { childList: true, subtree: true })
    t.sample = () => {
      const r = view.getBoundingClientRect()
      t.frames++
      for (const sheet of document.querySelectorAll('.pdf-reader .pdf-page')) {
        const b = sheet.getBoundingClientRect()
        if (b.bottom > r.top && b.top < r.bottom && !sharp(sheet)) { if (has(sheet)) t.blurry++; else t.blank++; return }
      }
    }
  })
  // Scrolled as a person does, with the wheel (the compositor moves the page while the main thread draws), and
  // sampled on every frame the page paints.
  await h.evaluate(() => {
    const t = window.__speed
    t.long = 0
    new PerformanceObserver((list) => { for (const one of list.getEntries()) t.long += one.duration }).observe({ type: 'longtask', buffered: false })
    const tick = () => { t.sample(); t.raf = requestAnimationFrame(tick) }
    tick()
  })
  const box = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const wheel = async (dy, count, gap) => { for (let i = 0; i < count; i++) { void h.mouse.wheel(0, dy); await wait(gap) } }
  const began = Date.now()
  // Reading fast: 60px every 16ms, about 3,700px (four pages) a second.
  await wheel(60, 400, 16)
  const down = Date.now() - began
  await wait(400)
  // Paging: a screen at a time, eight a second.
  await wheel(Math.round(box.height * 0.9), 60, 120)
  // And back up the way it came.
  await wheel(-60, 300, 16)
  await wait(1500)
  const after = await memory()
  const r = await h.evaluate(() => {
    cancelAnimationFrame(window.__speed.raf); const t = window.__speed; const s = [...t.shown].sort((a, b) => a - b)
    const at = (q) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? -1)
    return { pages: s.length, instant: s.filter((x) => x === 0).length, median: at(0.5), p90: at(0.9), worst: Math.round(s.at(-1) ?? -1), frames: t.frames, blank: t.blank, blurry: t.blurry, longTaskMs: Math.round(t.long), top: Math.round(document.querySelector(".pdf-reader-scroll").scrollTop), sheets: document.querySelectorAll(".pdf-reader .pdf-page").length, entered: t.entered.size, canvases: document.querySelectorAll('.pdf-reader .pdf-pages canvas').length }
  })
  console.log(JSON.stringify({ ...r, downMs: down, memoryBeforeMB: before, memoryAfterMB: after }))
  check('pages coming into view are already drawn sharp (median 0ms)', r.median === 0, `median ${r.median}ms, p90 ${r.p90}ms, worst ${r.worst}ms over ${r.pages} pages, ${r.instant} drawn sharp before they came into view`)
  check('samples with a blank page on show while reading fast: none', r.blank === 0, `${r.blank} blank and ${r.blurry} still blurry of ${r.frames} samples`)
  check('far pages let go: at most 16 page pictures left in the page', r.canvases <= 16, `${r.canvases} canvases`)
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
rmSync(dir, { recursive: true, force: true })
done()
