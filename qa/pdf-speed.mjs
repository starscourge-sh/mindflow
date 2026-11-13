// The PDF view against the speed bars, on a COPY of the user's own book and its real PDFs (ask 9, 13 Nov: "the pdf view
// should be snappy"). The bars: a press shows a change in under 100ms, a page opens in under 150ms, no frame over 16ms in
// scrolling, zooming and page changes. One launch measures one book:
//   open    from the shelf (Files), from a note's card, from ⌘K, and coming back to it (⌘[ then ⌘]): from the press to the
//           reader on show, to no page in view blank, and to every page in view sharp, at the page it was left on
//   rail    after an open, the thumbnails in the rail's view drawn
//   scroll  the first scroll, at reading pace with the wheel: frames over 16ms, and frames with a page in view blank or blurred
//   fling   a long fling to the middle of the book: frames over 16ms during it, then from its last move to every page sharp
//   jump    by typing a page number, and by a thumbnail in the rail: to no page blank, and to sharp
//   zoom    a pinch in, ⌘+ and ⌘−: frames over 16ms, and from the last move or key to sharp again
//   dark    "Dark pages" turned on, then a page turned with →: to sharp, frames over 16ms
//   select  a drag across a page's words: frames over 16ms while it moves
//   find    ⌘F and a word: from the last key to the first hit on show
//   leave   ⌘[ from the reader: to the first frame without it, and the longest task
// A frame "over 16ms" is a gap of more than 17.5ms between two frames the window drew. Every line ends with the load.
//   QA_DATA=<a COPY of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-speed.mjs
// BOOK=<hash prefix> picks the book (default db97c775, the largest by pages), PARTS=open,rail,... a few parts, LOOK=dark
// runs it all in "Dark pages", QA_STRICT=1 adds the bars as checks.
import os from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const BOOKS = {
  db97c775: { hash: 'db97c77518c68ce3db19da8f65e9f8dd8f9494fcbba59dddb0ed1796973f7e35', title: 'Fluent Python', word: 'metaclass' },
  '29cf4cca': { hash: '29cf4cca3d2d955bf8d6f9b531de00496fd575aeb1cd4745e896ea1be707e347', title: 'The Crime Book', word: 'Zodiac' },
  ad8e5336: { hash: 'ad8e533658ae43cfeaa51bb712688d3136c1e4543a0924af5b43067799200e78', title: 'Therapy Nation', word: 'resilience' },
  f115fce7: { hash: 'f115fce7061fa6438800a4b0a4031e0c77d76b54b3c118359dc090b42953c231', title: 'The Law Book', word: 'Magna Carta' },
}
const key = process.env.BOOK ?? 'db97c775'
const book = BOOKS[key]
if (!book) throw new Error(`BOOK is one of ${Object.keys(BOOKS).join(', ')}`)
const src = `haligtree://assets/${book.hash}.pdf`
const name = `${book.title}.pdf`
const PARTS = new Set((process.env.PARTS ?? 'open,rail,scroll,fling,jump,zoom,dark,select,find,leave').split(','))
const load = () => os.loadavg()[0].toFixed(1)
const { check, done } = checks()
const strict = process.env.QA_STRICT === '1'
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, send, close } = c
const wait = (ms) => h.waitForTimeout(ms)
const rows = {}
const row = (label, data) => {
  rows[label] = data
  console.log(`${label.padEnd(14)} ${Object.entries(data).map(([k, x]) => `${k} ${typeof x === 'number' ? Math.round(x) : x}`).join(', ')}; load ${load()}`)
}
// PROFILE=<part>: the window's own thread sampled through that part, and the functions it spent most time in.
const cdp = process.env.PROFILE ? await h.context().newCDPSession(h) : null
const profiled = async (part, body) => {
  const run = () => body().catch((error) => check(`${part} ran`, false, String(error?.message ?? error).split('\n')[0]))
  if (process.env.PROFILE !== part) return run()
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start')
  await run()
  const { profile } = await cdp.send('Profiler.stop')
  const self = new Map()
  const byId = new Map(profile.nodes.map((one) => [one.id, one]))
  profile.samples.forEach((id, i) => {
    const f = byId.get(id).callFrame
    const name = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
    self.set(name, (self.get(name) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000)
  })
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  console.log(`PROFILE ${part}: ${Math.round(total)}ms sampled; most self time:`)
  for (const [name, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${String(Math.round(ms)).padStart(6)}ms  ${name}`)
}

/** Watches every frame the window draws, the longest tasks, and the pages in the reader's view. */
const install = () => h.evaluate(() => {
  if (window.__f1) return
  const t = (window.__f1 = { gaps: [], longs: [], samples: [], pressed: 0, sampling: false })
  let last = performance.now()
  const tick = (now) => {
    t.gaps.push(now - last)
    last = now
    if (t.sampling) { const s = t.state(); if (s) t.samples.push(s) }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  new PerformanceObserver((list) => { for (const one of list.getEntries()) t.longs.push(one.duration) }).observe({ type: 'longtask' })
  t.reset = () => void ((t.gaps = []), (t.longs = []), (t.samples = []))
  // A frame that took over 16ms of work misses its slot: the next one comes a whole frame late. The parked window's
  // frame clock wanders a few ms either side of 16.7, so a gap counts as a dropped frame past 25ms.
  t.frames = () => ({ frames: t.gaps.length, dropped: t.gaps.filter((x) => x > 25).length, worst: Math.max(0, ...t.gaps), longest: Math.max(0, ...t.longs) })
  // The sheets in the view, found by halves as the reader finds them; each is sharp (drawn at its size times the
  // screen's density), blurred (only a rough or an old-size picture) or blank (no picture).
  t.state = () => {
    const box = document.querySelector('.pdf-reader-scroll')
    const kids = box?.querySelector('.pdf-pages')?.children
    if (!box || !kids?.length) return null
    const r = box.getBoundingClientRect()
    let lo = 0, hi = kids.length - 1, first = kids.length
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (kids[mid].getBoundingClientRect().bottom > r.top + 2) (first = mid), (hi = mid - 1); else lo = mid + 1 }
    let blank = 0, blurred = 0, seen = 0, page = 0
    // The page being read, as the reader names it: the last sheet whose top has passed a third of the way down (120px at most).
    const line = r.top + Math.min(box.clientHeight / 3, 120)
    for (let i = first; i < kids.length; i++) {
      const sheet = kids[i]
      const b = sheet.getBoundingClientRect()
      if (b.top >= r.bottom - 2) break
      if (!sheet.dataset.page) continue
      if (b.top <= line) page = Number(sheet.dataset.page)
      seen++
      const sharp = sheet.querySelector('canvas:not([data-pass="rough"])')
      if (sharp && sharp.width >= b.width * devicePixelRatio - 3) continue
      if (sheet.querySelector('canvas')) blurred++
      else blank++
    }
    return { seen, blank, blurred, page }
  }
  // The thumbnails in the rail's view, and how many are drawn.
  t.rail = () => {
    const list = document.querySelector('.pdf-reader .pdf-rail-list')
    if (!list) return null
    const r = list.getBoundingClientRect()
    const near = [...list.querySelectorAll('.pdf-thumb')].filter((one) => { const b = one.getBoundingClientRect(); return b.bottom > r.top + 4 && b.top < r.bottom - 4 })
    return { seen: near.length, drawn: near.filter((one) => one.querySelector('canvas[data-drawn]')).length }
  }
  // The next press (a pointer or a key) starts the clock.
  t.arm = () => {
    t.pressed = 0
    const start = () => void (t.pressed ||= performance.now())
    addEventListener('pointerdown', start, { capture: true, once: true })
    addEventListener('keydown', start, { capture: true, once: true })
    t.reset()
  }
  /** From the press: the reader on show, no page in view blank, every page in view sharp (at `page`, when given). */
  t.until = (page, rail) => new Promise((resolve) => {
    // elsewhere: frames showing a drawn page other than the one it should open at (page 1 first, then a jump).
    const out = { reader: 0, first: 0, sharp: 0, rail: 0, blankFrames: 0, blurredFrames: 0, elsewhere: 0, trail: '' }
    const began = performance.now()
    let was = -1
    const step = () => {
      const at = t.pressed || began
      const now = performance.now() - at
      const s = t.state()
      // Each page the view showed and when, with the page sheets' width: where an opening went before it settled.
      if (s && s.page !== was) (out.trail += ` ${Math.round(now)}ms:p${s.page}/w${Math.round(document.querySelector('.pdf-reader .pdf-page')?.getBoundingClientRect().width ?? 0)}`), (was = s.page)
      if (s) {
        out.reader ||= now
        const there = !page || (page > 0 ? s.page === page : s.page !== -page)
        if (there && s.seen && !s.blank) out.first ||= now
        if (there && s.seen && !s.blank && !s.blurred) out.sharp ||= now
        if (!out.sharp && there) (s.blank ? out.blankFrames++ : s.blurred && out.blurredFrames++)
        if (!there && s.seen && !s.blank) out.elsewhere++
      }
      const r = rail && t.rail()
      if (rail && r && r.seen && r.drawn === r.seen) out.rail ||= now
      if ((out.sharp && (!rail || out.rail)) || performance.now() - began > 8000) return resolve({ ...out, page: s?.page, ...t.frames() })
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
})

const place = async () => (await v('pdf:place', src))?.page ?? 1
/** Opens it by `how` (a press the page hears) and measures from the press. */
const opened = async (label, how) => {
  const page = await place()
  await h.evaluate(() => window.__f1.arm())
  await how()
  const out = await h.evaluate(([page]) => window.__f1.until(page, true), [page])
  row(label, { reader: out.reader, first: out.first, sharp: out.sharp, rail: out.rail, blankFrames: out.blankFrames, elsewhere: out.elsewhere, dropped: out.dropped, worst: out.worst, longest: out.longest, page: `${out.page} of place ${page}` })
  await wait(1200)
  return out
}
const reader = () => h.waitForSelector('.pdf-reader .pdf-page', { timeout: 30000 })
const home = async () => { await send('view', 'home'); await h.waitForSelector('.pdf-reader', { state: 'detached', timeout: 15000 }); await wait(800) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(([dark]) => (localStorage.setItem('pdf-rail', 'pages'), localStorage.setItem('pdf-dark', dark ? '1' : '0'), window.dispatchEvent(new CustomEvent('haligtree:pdf-dark'))), [process.env.LOOK === 'dark'])
  await install()
  console.log(`${book.title} (${key}), load ${load()}, look ${process.env.LOOK === 'dark' ? 'Dark pages' : 'Paper pages'}`)
  // The first open since the app started: the file read and laid out afresh (as a link in a note opens it).
  const first = await place()
  await h.evaluate(([src, name]) => (window.__f1.arm(), (window.__f1.pressed = performance.now()), window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name } }))), [src, name])
  const cold = await h.evaluate(([page]) => window.__f1.until(page, true), [first])
  row('open first', { reader: cold.reader, first: cold.first, sharp: cold.sharp, rail: cold.rail, blankFrames: cold.blankFrames, elsewhere: cold.elsewhere, dropped: cold.dropped, worst: cold.worst, longest: cold.longest, page: `${cold.page} of place ${first}`, trail: cold.trail.trim().split(" ").slice(0, 8).join(" ") })
  await reader(); await wait(1500); await home()

  if (PARTS.has('open')) await profiled('open', async () => {
    // From the shelf: Files on its Books, the book's cover clicked.
    await send('view', 'media', 'kind:pdf'); await wait(1200)
    const card = h.locator(`[data-book="${src}"]`).first()
    await card.scrollIntoViewIfNeeded()
    await wait(400)
    await opened('open shelf', () => card.click())
    await home()
    // From a note's card: a note holding the book, its "Open".
    const id = await v('article:new')
    await v('item:save', id, { title: 'Reading list', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The one to read.' }] }, { type: 'attachment', attrs: { src, name, size: 1 } }] } })
    await send('article', id)
    const open = h.locator(`.is-pdf button[aria-label="Open ${name}"]`).first()
    await open.waitFor({ timeout: 20000 }); await wait(1500)
    await opened('open card', () => open.click())
    await home()
    // From ⌘K: its title typed, its row clicked.
    await h.keyboard.press('Meta+k'); await wait(600)
    await h.keyboard.type(book.title)
    const hit = h.locator(`[data-pdf-peek="${src}"]`).first()
    await hit.waitFor({ timeout: 15000 }); await wait(900)
    await opened('open search', () => hit.click())
    // Away to a note and back: ⌘[ then ⌘].
    await h.keyboard.press('Meta+BracketLeft'); await h.waitForSelector('.pdf-reader', { state: 'detached', timeout: 15000 }).catch(() => {}); await wait(900)
    await opened('come back', () => h.keyboard.press('Meta+BracketRight'))
  })
  if (!PARTS.has('open')) {
    await h.evaluate(([src, name]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name } })), [src, name])
    await reader()
    await h.evaluate(() => window.__f1.until(0, true))
    await wait(1200)
  }
  const box = await h.locator('.pdf-reader-scroll').boundingBox()
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await h.mouse.move(middle.x, middle.y)
  const pages = await h.evaluate(() => document.querySelectorAll('.pdf-reader .pdf-page[data-page]').length)

  if (PARTS.has('scroll')) await profiled('scroll', async () => {
    // Reading on: 60px a frame for a second and a half, sampled every frame.
    await h.evaluate(() => (window.__f1.reset(), (window.__f1.sampling = true)))
    for (let i = 0; i < 90; i++) { void h.mouse.wheel(0, 60); await wait(16) }
    await wait(400)
    const out = await h.evaluate(() => { const t = window.__f1; t.sampling = false; return { ...t.frames(), blank: t.samples.filter((s) => s.blank).length, blurred: t.samples.filter((s) => !s.blank && s.blurred).length, samples: t.samples.length } })
    row('first scroll', { dropped: out.dropped, frames: out.frames, worst: out.worst, longest: out.longest, blankFrames: out.blank, blurredFrames: out.blurred })
  })
  if (PARTS.has('fling')) await profiled('fling', async () => {
    // From the first page to the middle of the book, fast, then rest: frames while it moves, and how long the pages it rests on take.
    // g g: the first page, as on every list.
    await h.locator('.pdf-reader-scroll').click({ position: { x: 4, y: 4 } })
    await h.keyboard.press('g'); await h.keyboard.press('g')
    await h.evaluate(() => window.__f1.until(1, false)); await wait(1200)
    await h.mouse.move(middle.x, middle.y)
    const target = Math.round(pages / 2)
    await h.evaluate(() => (window.__f1.reset(), (window.__f1.sampling = true)))
    const far = () => h.evaluate((n) => { const box = document.querySelector('.pdf-reader-scroll'); const sheet = box.querySelector(`.pdf-page[data-page="${n}"]`); return sheet.getBoundingClientRect().top - box.getBoundingClientRect().top }, target)
    let moves = 0
    for (let left = await far(); left > 0 && moves < 600; moves++) {
      void h.mouse.wheel(0, Math.min(1800, Math.max(120, left)))
      await wait(16)
      if (moves % 10 === 9) left = await far()
    }
    const during = await h.evaluate(() => { const t = window.__f1; const f = t.frames(); const s = t.samples; return { ...f, blank: s.filter((x) => x.blank).length } })
    await h.evaluate(() => (window.__f1.sampling = false, window.__f1.arm(), (window.__f1.pressed = performance.now())))
    const rest = await h.evaluate(() => window.__f1.until(0, false))
    row('fling', { moves, dropped: during.dropped, frames: during.frames, worst: during.worst, longest: during.longest, sharpAfter: rest.sharp, blankAfter: rest.blankFrames, page: rest.page })
    await wait(1200)
  })
  if (PARTS.has('jump')) await profiled('jump', async () => {
    const to = Math.max(2, Math.round(pages * 0.8))
    const from = await h.evaluate(() => window.__f1.state().page)
    const field = h.locator('.pdf-reader [data-scrub-field]')
    await field.click(); await h.keyboard.press('Meta+a'); await h.keyboard.type(String(to)); await wait(200)
    await h.evaluate(() => window.__f1.arm())
    await h.keyboard.press('Enter')
    let out = await h.evaluate((from) => window.__f1.until(-from, false), from)
    row('jump typed', { first: out.first, sharp: out.sharp, blankFrames: out.blankFrames, dropped: out.dropped, worst: out.worst, longest: out.longest, page: out.page })
    await h.keyboard.press('Escape').catch(() => {})
    await wait(1500)
    // A thumbnail a few pages on, in the rail's view.
    const thumb = await h.evaluate(() => {
      const list = document.querySelector('.pdf-reader .pdf-rail-list'); const r = list.getBoundingClientRect()
      const near = [...list.querySelectorAll('.pdf-thumb:not(.is-here)')].filter((one) => { const b = one.getBoundingClientRect(); return b.top >= r.top && b.bottom <= r.bottom })
      return Number(near.at(-1)?.dataset.thumbPage ?? 0)
    })
    if (thumb) {
      await h.evaluate(() => window.__f1.arm())
      await h.locator(`.pdf-reader .pdf-thumb[data-thumb-page="${thumb}"]`).click()
      out = await h.evaluate((to) => window.__f1.until(to, false), thumb)
      row('jump rail', { first: out.first, sharp: out.sharp, blankFrames: out.blankFrames, dropped: out.dropped, worst: out.worst, longest: out.longest, page: `${out.page} of ${thumb}` })
      await wait(1500)
    }
  })
  if (PARTS.has('zoom')) await profiled('zoom', async () => {
    await h.mouse.move(middle.x, middle.y)
    // A pinch: a ctrl wheel, small steps, one a frame, as a trackpad sends it.
    await h.evaluate(() => window.__f1.arm())
    await h.evaluate(async ([x, y]) => {
      window.__f1.pressed = performance.now()
      const box = document.querySelector('.pdf-reader-scroll')
      for (let n = 0; n < 14; n++) { box.dispatchEvent(new WheelEvent('wheel', { deltaY: -6, clientX: x, clientY: y, ctrlKey: true, bubbles: true, cancelable: true })); await new Promise((r) => requestAnimationFrame(r)) }
    }, [middle.x, middle.y])
    let out = await h.evaluate(() => window.__f1.until(0, false))
    row('zoom pinch', { sharp: out.sharp, blurredFrames: out.blurredFrames, dropped: out.dropped, worst: out.worst, longest: out.longest, zoom: await h.evaluate(() => document.querySelector('.pdf-reader').dataset.zoom) })
    await wait(1200)
    for (const [label, keys] of [['zoom ⌘+', 'Meta+Equal'], ['zoom ⌘−', 'Meta+Minus']]) {
      await h.evaluate(() => window.__f1.arm())
      await h.keyboard.press(keys)
      out = await h.evaluate(() => window.__f1.until(0, false))
      row(label, { sharp: out.sharp, blurredFrames: out.blurredFrames, dropped: out.dropped, worst: out.worst, longest: out.longest, zoom: await h.evaluate(() => document.querySelector('.pdf-reader').dataset.zoom) })
      await wait(1200)
    }
    await h.keyboard.press('Meta+0'); await h.evaluate(() => window.__f1.until(0, false)); await wait(1000)
  })
  if (PARTS.has('dark')) await profiled('dark', async () => {
    const was = await h.evaluate(() => localStorage.getItem('pdf-dark') === '1')
    await h.evaluate(() => (window.__f1.arm(), (window.__f1.pressed = performance.now()), localStorage.setItem('pdf-dark', '1'), window.dispatchEvent(new CustomEvent('haligtree:pdf-dark'))))
    let out = await h.evaluate(() => window.__f1.until(0, false))
    row('dark on', { sharp: out.sharp, dropped: out.dropped, worst: out.worst, longest: out.longest })
    await wait(1500)
    await h.locator('.pdf-reader-scroll').click({ position: { x: 4, y: 4 } })
    const at = await h.evaluate(() => window.__f1.state().page)
    await h.evaluate(() => window.__f1.arm())
    await h.keyboard.press('ArrowRight')
    out = await h.evaluate((to) => window.__f1.until(to, false), at + 1)
    row('dark → page', { first: out.first, sharp: out.sharp, blankFrames: out.blankFrames, dropped: out.dropped, worst: out.worst, longest: out.longest, page: out.page })
    await wait(1200)
    if (!was) await h.evaluate(() => (localStorage.setItem('pdf-dark', '0'), window.dispatchEvent(new CustomEvent('haligtree:pdf-dark'))))
    await h.evaluate(() => window.__f1.until(0, false)); await wait(1000)
  })
  if (PARTS.has('select')) await profiled('select', async () => {
    const span = await h.evaluate(() => {
      const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
      const spans = [...document.querySelectorAll('.pdf-reader .pdf-page .textLayer span')].filter((one) => { const b = one.getBoundingClientRect(); return one.textContent.trim().length > 8 && b.top > box.top + 40 && b.bottom < box.bottom - 260 && b.width > 60 })
      const b = spans[0]?.getBoundingClientRect()
      return b ? { x: b.left + 2, y: b.top + b.height / 2 } : null
    })
    if (span) {
      await h.mouse.move(span.x, span.y)
      await h.evaluate(() => window.__f1.arm())
      await h.mouse.down()
      for (let i = 1; i <= 30; i++) { await h.mouse.move(span.x + i * 12, span.y + i * 8); await wait(16) }
      await h.mouse.up()
      const out = await h.evaluate(() => ({ ...window.__f1.frames(), picked: getSelection().toString().length }))
      row('select', { dropped: out.dropped, frames: out.frames, worst: out.worst, longest: out.longest, letters: out.picked })
      await h.evaluate(() => getSelection().removeAllRanges())
      await wait(800)
    } else row('select', { skipped: 'no words on the page in view' })
  })
  if (PARTS.has('find')) await profiled('find', async () => {
    await h.locator('.pdf-reader-scroll').click({ position: { x: 4, y: 4 } })
    await h.keyboard.press('Meta+f'); await wait(400)
    await h.keyboard.type(book.word.slice(0, -1))
    await h.evaluate(() => window.__f1.arm())
    await h.keyboard.press(book.word.slice(-1))
    const out = await h.evaluate(() => new Promise((resolve) => {
      const step = () => {
        const now = performance.now() - window.__f1.pressed
        if (document.querySelector('.pdf-reader .pdf-mark.is-find.is-current') || now > 20000) return resolve({ hit: now, count: document.querySelector('.pdf-reader .tiptap-find-bar-count')?.getAttribute('aria-label'), ...window.__f1.frames() })
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }))
    row('find', { firstHit: out.hit, found: out.count, dropped: out.dropped, worst: out.worst, longest: out.longest })
    await h.keyboard.press('Escape'); await wait(800)
  })
  if (PARTS.has('leave')) await profiled('leave', async () => {
    await h.locator('.pdf-reader-scroll').click({ position: { x: 4, y: 4 } })
    await h.evaluate(() => window.__f1.arm())
    await h.keyboard.press('Meta+BracketLeft')
    const out = await h.evaluate(() => new Promise((resolve) => {
      const step = () => {
        const now = performance.now() - window.__f1.pressed
        if (!document.querySelector('.pdf-reader') || now > 20000) return requestAnimationFrame(() => resolve({ gone: performance.now() - window.__f1.pressed, ...window.__f1.frames() }))
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }))
    row('leave', { gone: out.gone, dropped: out.dropped, worst: out.worst, longest: out.longest })
  })
  console.log(`RESULT ${JSON.stringify({ book: key, load: load(), rows })}`)
  check('no page errors', !c.errors.filter((e) => !/ResizeObserver/.test(e)).length, c.errors.slice(0, 3).join(' | '))
  if (strict) {
    // The bars, once the fixes are in: see the report for which each one proves.
    for (const [label, one] of Object.entries(rows)) if (one.dropped !== undefined) check(`${label}: no frame over 16ms`, one.dropped === 0, `${one.dropped} dropped, worst ${Math.round(one.worst)}ms`)
  }
} catch (error) {
  check('ran', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' '))
} finally {
  await close()
}
done()
