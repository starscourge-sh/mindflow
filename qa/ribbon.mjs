// The ribbon (pdf/ribbon.tsx), as a reader uses it. In a PDF: the ribbon dragged from the top of the pages onto page 3,
// the book closed and opened again lands on page 3; read on by hand to page 5, opened again: still page 3, with the
// line "You read on to p. 5, past your ribbon". In a saved article: ⌘D lays it on the paragraph being read; right-click,
// "Take the ribbon out", then ⌘Z puts it back. The ribbon's place is read every 50 ms through the drag and its settle:
// it follows the pointer 1:1 and never jumps. QA_SHOTS=<folder> keeps a picture every 50 ms of the drag and settle.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/ribbon.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { fandomPage, png } from './fandom-page.mjs'

process.env.QA_ARGS ??= '--sandbox'
const SITE = 'https://93.184.216.34'
const CDN = 'https://93.184.216.35'
const shots = process.env.QA_SHOTS ?? ''
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, electron, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'

/** Where the ribbon is drawn (its translate, so a sway's turn does not count as a move), and how it lies. */
const ribbon = () => h.evaluate(() => {
  const el = document.querySelector('.ribbon')
  const at = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el?.style.transform ?? '')
  // `ms`: the page's own clock as it was read, so the time between samples is the real one, however slow the run.
  return el && at ? { x: Number(at[1]), y: Number(at[2]), state: el.dataset.ribbon, at: el.dataset.ribbonAt, h: parseFloat(el.style.height), ms: performance.now() } : null
})

/** Every 50 ms until stopped: the ribbon's place, and with QA_SHOTS a picture. At most 200 samples (10 s). */
function sampler(name) {
  const samples = []
  let on = true
  let n = 0
  const run = (async () => {
    while (on && n < 200) {
      const one = await ribbon()
      samples.push({ ...one })
      if (shots) await h.screenshot({ path: join(shots, `ribbon-${name}-${String(n).padStart(3, '0')}.png`) }).catch(() => {})
      n++
      await wait(50)
    }
  })()
  return async () => ((on = false), await run, samples)
}

/** The page whose top is nearest the top of the pages: the one the reader landed on. */
const landedOn = () => h.evaluate(() => {
  const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
  let best = null
  for (const sheet of document.querySelectorAll('.pdf-reader .pdf-page[data-page]')) {
    const d = Math.abs(sheet.getBoundingClientRect().top - box.top)
    if (!best || d < best.d) best = { page: Number(sheet.dataset.page), d }
  }
  return best?.page ?? null
})

/** The page the reader says you are on: the number in its bar (the file's own pages here, no printed labels). */
const shownPage = () => h.evaluate(() => Number(document.querySelector('.pdf-reader-page [data-scrub-field]')?.value) || null)

/** Out to the note and the book opened again from its card, as a reader closes and reopens it. */
async function reopen(note) {
  await s.send('article', note); await wait(1200)
  await h.click('.is-pdf button[aria-label="Open ribbon-probe.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"]', { timeout: 15000 })
  await h.waitForSelector('.ribbon[data-ribbon="laid"]', { timeout: 8000 }).catch(() => {})
  await wait(1200)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Ribbon Probe')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 8; n++) {
    const page = pdf.addPage([400, 560])
    for (let line = 0; line < 30; line++) page.drawText(`Page ${n}, line ${line + 1}`, { x: 40, y: 510 - line * 15, size: 11, font })
  }
  const bytes = [...(await pdf.save())]
  const note = await v('article:new')
  await v('item:save', note, { title: 'With a book to mark', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await s.send('article', note); await wait(1400)
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'ribbon-probe.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open ribbon-probe.pdf"]', { timeout: 15000 })
  await h.click('.is-pdf button[aria-label="Open ribbon-probe.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"]', { timeout: 15000 }); await wait(1000)

  // A first look: the ribbon hangs from the top of the pages, a short tab with the hand.
  const hanging = await ribbon()
  check('a new book shows the ribbon hanging at the top', hanging?.state === 'hanging' && hanging.y < 4 && hanging.h <= 40, JSON.stringify(hanging))
  check('it shows the hand', (await h.evaluate(() => getComputedStyle(document.querySelector('.ribbon')).cursor)) === 'pointer')

  // Page 3's top edge brought to about 400px down by hand, then the ribbon carried so its end lies in the gap above
  // page 3 (between pages 2 and 3), as a ribbon lies between the leaves: it marks page 3.
  const scroller = await h.locator('.pdf-reader-scroll').boundingBox()
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2)
  for (let i = 0; i < 40; i++) {
    const top = await h.evaluate(() => document.querySelector('.pdf-page[data-page="3"]').getBoundingClientRect().top - document.querySelector('.pdf-reader-scroll').getBoundingClientRect().top)
    if (Math.abs(top - 400) < 40) break
    await h.mouse.wheel(0, Math.max(-200, Math.min(200, top - 400))); await wait(60)
  }
  await wait(500)
  const tab = await h.locator('.ribbon').boundingBox()
  const from = { x: tab.x + tab.width / 2, y: tab.y + 10 }
  // Held 10px below its top, a 92px ribbon's end is 82px under the pointer: the pointer goes there, read from page 3 now.
  const target = await h.evaluate(() => { const r = document.querySelector('.pdf-page[data-page="3"]').getBoundingClientRect(); return { x: r.right - 37, y: r.top - 6 - 82 } })
  const stop = sampler('drag')
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  const held = []
  for (let i = 1; i <= 30; i++) {
    const x = from.x + ((target.x - from.x) * i) / 30
    const y = from.y + ((target.y - from.y) * i) / 30
    await h.mouse.move(x, y)
    await wait(16)
    if (i > 3) held.push({ pointer: { x, y }, at: await ribbon() })
  }
  const tip = await h.evaluate(() => document.querySelector('[data-ribbon-tip]')?.textContent ?? '')
  await h.mouse.up()
  const letGo = await h.evaluate(() => performance.now())
  await wait(900)
  const frames = await stop()
  // 1:1: the gap from the pointer to the ribbon's top stays the same as it is carried (to within a pixel or two).
  const gaps = held.map(({ pointer, at }) => pointer.y - at.y)
  check('held, it follows the pointer 1:1', Math.max(...gaps) - Math.min(...gaps) <= 2, `gap ${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)}px`)
  check('held over page 3, it says so', tip === 'p. 3', tip)
  // Held, it is wherever the pointer is (the 1:1 check above): a big step then is the pointer's own. Judged are the steps
  // where it moves by itself, hanging before the pick-up and laid as it settles, each scaled to a real 50 ms by the
  // page's clock. A glide moves well under 60px in 50 ms; a jump (21 Nov, frame 008: 827px to a page top off screen) is far over.
  const gapsMs = frames.slice(1).map((one, at) => Math.round(one.ms - frames[at].ms))
  console.log(`  samples ${frames.length}, ms between them: ${gapsMs.join(' ')}`)
  const own = frames.slice(1).map((one, at) => [frames[at], one]).filter(([a, b]) => a.state !== 'held' && b.state !== 'held')
  const rates = own.map(([a, b]) => (Math.hypot(b.x - a.x, b.y - a.y) * 50) / Math.max(1, b.ms - a.ms))
  console.log('  own steps: ' + own.map(([a, b]) => `${a.state}(${Math.round(a.x)},${Math.round(a.y)})→${b.state}(${Math.round(b.x)},${Math.round(b.y)}) in ${Math.round(b.ms - a.ms)}ms`).join(' | '))
  check('picked up and settling, no jump (px per 50 ms)', own.length >= 3 && Math.max(...rates) < 60, `${own.length} steps on its own, fastest ${Math.max(0, ...rates).toFixed(1)}px per 50 ms`)
  const laid = await ribbon()
  check('let go, it lies on page 3', laid?.state === 'laid' && laid.at === '3', JSON.stringify(laid))
  check('in the gap above page 3, on screen', await h.evaluate(() => {
    const r = document.querySelector('.ribbon').getBoundingClientRect()
    const page = document.querySelector('.pdf-page[data-page="3"]').getBoundingClientRect()
    const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
    return r.top < page.top && r.bottom > page.top && r.top > box.top
  }))
  // The settle swings once or twice, then is still: by 700 ms after letting go every sample is the laid place.
  const still = (one) => Math.abs(one.x - laid.x) < 1 && Math.abs(one.y - laid.y) < 1
  const late = frames.filter((one) => one.ms >= letGo + 700)
  check('and comes to rest by 700 ms', late.length >= 1 && late.every(still) && frames.slice(-2).every(still), JSON.stringify(frames.filter((one) => one.ms >= letGo).map((one) => [Math.round(one.ms - letGo), one.x, one.y])))
  // Laid, in both looks, for the eye: its top in the shade of the page above, the same deep red on the paper.
  if (shots) {
    for (const t of ['light', 'dark']) {
      await s.look(t); await wait(600)
      const r = await h.locator('.ribbon').boundingBox()
      await h.screenshot({ path: `${shots}/ribbon-laid-${t}.png`, clip: { x: r.x - 160, y: r.y - 80, width: 260, height: r.height + 140 } })
    }
    await s.look('light'); await wait(400)
  }

  // Closed and opened again: page 3, where the ribbon is.
  await reopen(note)
  check('opened again, it lands on the ribbon, page 3', (await landedOn()) === 3, `landed on ${await landedOn()}`)
  check('with no "read on" line: nothing was read past it', !(await h.locator('[data-ribbon-read-on]').count()))

  // Read on by hand to page 5 (until the bar says 5), then opened again: page 3, with the line offering page 5.
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2)
  for (let i = 0; i < 60 && (await shownPage()) !== 5; i++) {
    const top = await h.evaluate(() => document.querySelector('.pdf-page[data-page="5"]').getBoundingClientRect().top - document.querySelector('.pdf-reader-scroll').getBoundingClientRect().top)
    await h.mouse.wheel(0, Math.max(-120, Math.min(120, top + 20))); await wait(80)
  }
  await wait(1200)
  check('read on by hand, the bar says page 5', (await shownPage()) === 5, `bar says ${await shownPage()}`)
  await reopen(note)
  check('read on to page 5, opened again: still page 3', (await landedOn()) === 3, `landed on ${await landedOn()}`)
  const line = await h.locator('[data-ribbon-read-on]').textContent().catch(() => '')
  check('and a line says how far you read', /You read on to p\. 5, past your ribbon/.test(line ?? ''), line)
  await h.click('[data-ribbon-read-on-go]'); await wait(900)
  check('"Go there" goes to page 5', (await landedOn()) === 5, `landed on ${await landedOn()}`)

  // An article, saved in the reader: ⌘D lays the ribbon on the paragraph being read.
  await electron.evaluate((_, [site, cdn, page, pic]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (url.startsWith(site + '/')) return new URL(url).pathname === '/wiki/Harry_Potter' ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
      if (url.startsWith(cdn + '/')) return new Response(Buffer.from(pic, 'base64'), { headers: { 'content-type': 'image/png' } })
      return globalThis.__realFetch(input, init)
    }
  }, [SITE, CDN, fandomPage({ site: SITE, cdn: CDN, sections: 8 }), png(70, 110, 150, 500, 360)])
  const href = `${SITE}/wiki/Harry_Potter`
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
  await h.waitForSelector('.web-reader-body p', { timeout: 60000 }); await wait(1500)
  await h.evaluate(() => { const p = document.querySelectorAll('.web-reader-body p')[6]; const box = document.querySelector('.web-reader-scroll'); box.scrollTop += p.getBoundingClientRect().top - box.getBoundingClientRect().top - 60 })
  await wait(400)
  await h.mouse.move(scroller.x + scroller.width / 2, scroller.y + scroller.height / 2)
  await h.keyboard.press('Meta+KeyD'); await wait(900)
  const onArticle = await ribbon()
  const kept = await v('ribbon:get', href)
  check('⌘D lays the ribbon on the paragraph being read', onArticle?.state === 'laid' && kept?.block === Number(onArticle.at), `${JSON.stringify(onArticle)} kept ${JSON.stringify(kept)}`)
  check('beside that paragraph', await h.evaluate(() => {
    const r = document.querySelector('.ribbon').getBoundingClientRect()
    const p = document.querySelector('.web-reader-scroll').getBoundingClientRect()
    return r.top > p.top && r.top < p.top + p.height / 2
  }))

  // Right-click a paragraph: "Take the ribbon out", then ⌘Z puts it back.
  const para = await h.locator('.web-reader-body p').nth(7).boundingBox()
  await h.mouse.click(para.x + 20, para.y + 6, { button: 'right' }); await wait(400)
  await h.click('[data-ribbon-out-menu]'); await wait(900)
  check('taken out: it hangs again and the book forgets it', (await ribbon())?.state === 'hanging' && !(await v('ribbon:get', href)), JSON.stringify(await ribbon()))
  check('a notice says so', /Ribbon taken out/.test(await h.evaluate(() => document.body.innerText)))
  await h.keyboard.press('Meta+z'); await wait(1000)
  const back = await v('ribbon:get', href)
  check('⌘Z puts it back where it was', (await ribbon())?.state === 'laid' && back?.block === kept?.block, `${JSON.stringify(await ribbon())} kept ${JSON.stringify(back)}`)
} finally {
  await electron.evaluate(() => void (globalThis.__realFetch && (globalThis.fetch = globalThis.__realFetch))).catch(() => {})
  await close()
}
done()
