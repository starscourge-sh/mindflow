// Something clicked grows into what it opens and shrinks back on the way out
// (lib/hero.ts): a book's cover on Files' shelf and in "Continue reading" into
// the reader, a note's tile on Home into the note, a picture into its viewer,
// a deck into studying, and (part 4) every
// way in the user clicks: Home's pinned rows, "Jump back in", "Coming back" and
// "Continue reading", a Feed post, a face in Sources, Files' Recent row and
// shelves, a book's cover, a note row in Writing, a deck row in Review's list.
// For each, a press runs one flight (a view transition of the real pictures) that
// starts on the clicked thing's rect, moves once the new page is on show, in
// 260ms (220ms back), with no frame over 34ms; by a key, ⌘K, a swipe, Reduce
// motion or Motion off there is none; a fast double click and a click mid-flight still
// land. Frames of each, every 50ms, are written to look at. Run it on a
// development build too (StrictMode, React's slow build), where a page takes
// longest to build:
//
//   npx electron-vite build --config electron.vite.dev-qa.config.ts --outDir out-hd
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-hd/main/index.js HALIGTREE_QA_AWAY=1 node qa/hero-open.mjs [shots-dir|-] [part]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null
// Run in parts, each its own launch, to stay well inside a probe's time: 1 books and pictures, 2 notes and the ways that do not fly, 3 decks.
const part = Number(process.argv[3] ?? 0)
const runs = (n) => !part || part === n
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 800 })
const { h, go } = c
h.on('console', async (m) => m.type() === 'error' && m.text().includes('cannot be a descendant') && console.log('NEST', (await Promise.all(m.args().map((a) => a.jsonValue().catch(() => '')))).join(' | ').slice(0, 2500)))

// Every flight the window starts (lib/hero.ts, a view transition, logged in `window.__heroFlights`): its kind, the
// rect it starts on and ends on, its length and curve, how long after the press it moved (`wait`), how long after the
// new page was on show (`late`), whether that page was on show (not the old one held, page-swap.tsx) as it moved, and
// every frame's length while it moved (`frames`, read by requestAnimationFrame).
const install = () => h.evaluate(() => {
  if (window.__heroFlights) window.__heroFlights.length = 0
  window.__heroFrames = []
  if (window.__heroWrapped) return
  window.__heroWrapped = true
  // Where the clicked thing is as it is clicked (a cover lifts a little under the pointer).
  const KEY = '[data-book],[data-drag-open],[data-deck],[data-deck-row],[data-face],[data-pile],[data-recent-file],[data-resume],[data-row],[data-cal-event],[data-cal-event-chip],[data-still-picture]'
  for (const type of ['click', 'dblclick']) addEventListener(type, (event) => {
    const el = event.target.closest?.(KEY)
    if (el) { const r = el.getBoundingClientRect(); window.__clicked = { x: r.x, y: r.y, w: r.width, h: r.height } }
  }, true)
  // Each frame's length, always: the flight's are picked out by its time.
  let last = performance.now()
  // And what every animation of a flight moves, read as it runs.
  window.__heroProps = new Set()
  const tick = (t) => {
    window.__heroFrames.push([t, t - last]); last = t
    if (window.__heroFrames.length > 2000) window.__heroFrames.splice(0, 1000)
    if (document.documentElement.dataset.hero) for (const a of document.getAnimations()) if (String(a.effect?.pseudoElement ?? '').includes('view-transition')) for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) window.__heroProps.add(`${a.effect.pseudoElement.replace('::view-transition-', '')} ${a.animationName ?? 'script'} ${p}`)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const log = () => h.evaluate(() => (window.__heroFlights ?? []).map((f) => ({
  kind: f.kind, from: f.kind === 'open' ? window.__clicked : undefined, skipped: f.skipped, shown: f.shown, wait: f.moved, made: 0, late: f.steps && f.moved != null ? f.moved - f.steps.at(-1) : null,
  group: f.skipped ? null : { ms: f.ms, ease: f.ease, first: f.from, last: f.to },
  first: f.at ? Math.round(((window.__heroFrames ?? []).find(([t]) => t > f.at + 1)?.[1] ?? 0) * 10) / 10 : null,
  frames: f.at ? (window.__heroFrames ?? []).filter(([t]) => t > f.at + 1).slice(1).filter(([t]) => t <= f.at + f.ms + 20).map(([, d]) => Math.round(d * 10) / 10) : []
})))
const rectOf = (sel) => h.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }, sel)
const near = (a, b, by = 3) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= by)
const say = (r) => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}` : 'none'
// Every flight over first (its view transition finished), then `ms` more.
const settle = async (ms = 700) => { await h.waitForFunction(() => !document.documentElement.dataset.hero, null, { timeout: 8000 }).catch(() => {}); await h.waitForTimeout(ms) }
const look = async (name) => { await h.evaluate(() => (document.documentElement.dataset.motion = 'off')); await c.look(name); await h.evaluate(() => delete document.documentElement.dataset.motion) }
const card = () => rectOf('[data-pane-front] > [data-pane-card], [data-pane] > [data-pane-card]')
const back = async () => { await h.locator('[data-tab-step="back"]').first().click(); await settle() }
// Every frame of every flight, for the totals at the end.
const allFrames = []

/** One flight checked: ran, ours, its length, that it starts (open) or ends (close) on `at`, and every frame of it in time. */
async function flew(name, kind, at, ms) {
  const runs = (await log()).filter((one) => one.kind === kind)
  const one = runs.at(-1)
  const end = kind === 'open' ? one?.group?.first : one?.group?.last
  check(`${name}: one ${kind} flight ran`, runs.length === 1 && !!one?.group, JSON.stringify(runs))
  check(`${name}: ${ms}ms, strong out`, one?.group && Math.abs(one.group.ms - ms) < 1 && /cubic-bezier\(0\.32, 0\.72, 0, 1\)/.test(one.group.ease), `${one?.group?.ms}ms ${one?.group?.ease}`)
  // Opening, the thing as it was clicked; closing, the thing it lands on, as the page came back.
  const thing = kind === 'open' ? one?.from ?? at : at
  check(`${name}: it ${kind === 'open' ? 'starts on the clicked thing' : 'ends on the thing it came from'}`, near(end, thing, kind === 'open' ? 4 : 9), `flight ${say(end)}, thing ${say(thing)}`)
  check(`${name}: it moves only once the new page is on show, and soon then (open within 80ms; back within 250ms, once the thing it lands on stays put)`, one?.shown === true && one.late != null && one.late < (kind === 'open' ? 80 : 250), `on show ${one?.shown}, ${one?.late}ms after, ${one?.wait}ms after the press`)
  await frameCheck(name, one)
  return one
}
/**
 * A flight's frames. It runs on the compositor (transform and opacity only, checked), so a busy page under it does
 * not hold it; the main thread's frames (requestAnimationFrame) are written down beside it, for the totals at the end.
 */
async function frameCheck(name, one) {
  const f = one?.frames ?? []
  allFrames.push(...f)
  const props = await h.evaluate(() => [...(window.__heroProps ?? [])])
  check(`${name}: it moves transform and opacity alone (the compositor's)`, props.length > 0 && props.every((p) => / (transform|opacity)$/.test(p)), props.join(', '))
  console.log(`      main thread while it flew: ${f.length} frames, max ${f.length ? Math.max(...f) : '-'}ms, ${f.filter((d) => d > 20).length} over 20ms`)
}

/**
 * Frames of the flight about to start, every 50ms: `act` starts it, each of
 * its animations is held at its start as it begins, and each 50ms is laid
 * down and pictured.
 */
async function film(label, act) {
  if (!shots) return act()
  const caught = h.evaluate(() => new Promise((done) => {
    const since = performance.now()
    const look = () => {
      const all = document.getAnimations().filter((a) => String(a.effect?.pseudoElement ?? '').includes('view-transition'))
      if (all.some((a) => String(a.effect.pseudoElement).includes('mf-hero'))) return (all.forEach((a) => a.pause()), done(all.length))
      if (performance.now() - since > 5000) return done(0)
      setTimeout(look, 1)
    }
    look()
  }))
  await act()
  if (!(await caught)) return
  for (let t = 0; t <= 300; t += 50) {
    await h.evaluate((ms) => document.getAnimations().filter((a) => String(a.effect?.pseudoElement ?? '').includes('view-transition')).forEach((a) => (a.currentTime = Math.min(ms, a.effect.getComputedTiming().endTime - 1))), t)
    await h.waitForTimeout(120)
    await h.screenshot({ path: `${shots}/${label}-${String(t).padStart(3, '0')}.png` })
  }
  await h.evaluate(() => document.getAnimations().forEach((a) => a.playState === 'paused' && a.play()))
  await settle(900)
}

// Books and pictures of its own in the sandbox's store: 3 PDFs, two part way through ("Continue reading"), and 6 pictures.
const pdfBytes = (word) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = `BT /F1 28 Tf 40 300 Td (${word}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
const store = await c.electron.evaluate(({ app }) => process.mainModule.require('path').join(app.getPath('userData'), 'assets'))
const write = (name, bytes) => c.electron.evaluate((_, [dir, name, bytes]) => { const fs = process.mainModule.require('fs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(process.mainModule.require('path').join(dir, name), Buffer.from(bytes)) }, [store, name, bytes])
const titles = ['Meditations', 'Walden', 'Middlemarch']
const files = []
for (const [i, title] of titles.entries()) {
  const name = `hero-book-${i}.pdf`
  await write(name, pdfBytes(title))
  files.push({ src: `haligtree://assets/${name}`, kind: 'pdf', name: `${title}.pdf`, size: 1000, type: '', id: '', title: '', private: false, near: '', at: new Date(Date.now() - i * 3600_000).toISOString(), uses: [], added: true, gone: false, how: 'library' })
}
const pictures = await h.evaluate(async () => {
  const out = []
  for (let n = 0; n < 6; n++) {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240
    const pen = canvas.getContext('2d')
    pen.fillStyle = `hsl(${(n * 47) % 360} 42% 50%)`; pen.fillRect(0, 0, 320, 240)
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    out.push([...new Uint8Array(await blob.arrayBuffer())])
  }
  return out
})
for (const [i, bytes] of pictures.entries()) {
  // Saved as the app saves a picture, into the open book's own store (the sandbox keeps its own).
  const src = await h.evaluate((png) => window.api.saveImage('image/png', new Uint8Array(png)), bytes)
  files.push({ src, kind: 'picture', name: '', size: 1000, type: '', id: '', title: '', private: false, near: '', at: new Date(Date.now() - (i + 3) * 3600_000).toISOString(), uses: [], added: true, gone: false, how: 'library' })
}
const books = files.filter((f) => f.kind === 'pdf').map((f, i) => ({ src: f.src, name: f.name, title: f.name.replace(/\.pdf$/, ''), author: '', pages: 40, page: i < 2 ? 12 + i : null, readAt: i < 2 ? new Date(Date.now() - i * 3600_000).toISOString() : null, addedAt: f.at, highlights: 0, gems: 0, bytes: 1000 }))
await c.electron.evaluate(({ ipcMain }, [list, shelf]) => {
  ipcMain.removeHandler('haligtree:media:list'); ipcMain.handle('haligtree:media:list', () => list)
  ipcMain.removeHandler('haligtree:pdf:library'); ipcMain.handle('haligtree:pdf:library', () => shelf)
}, [files, books])

await go('home')
await settle(1500)

// 1. A book on Files' shelf: a double click opens it; Back shrinks the reader into its cover.
if (runs(1)) {
await go('media')
await h.locator('[data-media-kinds] button', { hasText: /^Books$/ }).first().click().catch(() => {})
await settle(1200)
{
  const sel = '[data-library] [data-book]'
  const src = await h.locator(sel).first().getAttribute('data-book')
  const at = await rectOf(`[data-book="${src}"]`)
  await install()
  await film('book-open', () => h.locator(sel).first().click())
  await settle()
  const opened = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
  check('Books: the shelf\'s cover opens the reader', opened === 'pdf', opened)
  await flew('Books', 'open', at, 260)
  const page = await card()
  check('Books: it grows into the pane\'s page', near((await log()).at(-1)?.group?.last, page), say(page))
  await install()
  await film('book-close', back)
  const after = await rectOf(`[data-book="${src}"]`)
  await flew('Books, back', 'close', after, 220)
  // The same flight in a dark theme, filmed, for its mid-flight frame beside the light one.
  if (shots) {
    await look('dark')
    await install()
    await film('book-open-dark', () => h.locator(sel).first().click())
    await settle()
    await back()
    await look('light')
  }
}

// 1a. Out of the reader by a two-finger swipe (swipe-back.tsx), in a dark theme: the swipe has its own motion, so
// no flight runs, and the page simply goes back. The same for ⌘[ and a mouse's back button.
{
  await look('dark')
  const sel = '[data-library] [data-book]'
  for (const [how, leave] of [
    ['a two-finger swipe', async () => {
      const R = (await h.evaluate(() => window.api.naturalScrolling())) ? -1 : 1
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:swipe-phase', { detail: 'began' })))
      for (let n = 0; n < 14; n++) (await h.evaluate(([dx]) => document.elementFromPoint(700, 450).dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: 0, bubbles: true, cancelable: true })), [12 * R]), await h.waitForTimeout(16))
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:swipe-phase', { detail: 'ended' })))
    }],
    ['⌘[', () => h.keyboard.press('Meta+BracketLeft')],
    ['the mouse\'s back button', () => h.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true })))]
  ]) {
    await h.locator(sel).first().click()
    await settle(1200)
    const inReader = (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'pdf'
    await install()
    await leave()
    await settle(1200)
    const page = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
    check(`Out of the reader by ${how}: back on the shelf, with no flight`, inReader && page === 'media' && (await log()).length === 0, `${inReader} ${page} ${JSON.stringify(await log())}`)
  }
  await look('light')
}

// 1b. "Continue reading": a cover drawn in the glass row.
{
  await settle(600)
  const row = await rectOf('[data-shelf-continue] [data-flex-carousel], [data-shelf-continue] [data-still-picture]')
  // "Continue reading" shows only past 4 books (10 Nov): with fewer, it only repeated the shelf right under it.
  const books = await h.evaluate(() => document.querySelectorAll('[data-book]').length)
  if (!row) check('Continue reading: the row is there, or the shelf is short enough not to need it', books <= 4, `${books} books`)
  else {
    await install()
    const still = await h.evaluate(() => !!document.querySelector('[data-shelf-continue] [data-still-picture]'))
    const at = still ? await rectOf('[data-shelf-continue] [data-still-picture]') : null
    if (still) await h.locator('[data-shelf-continue] [data-still-picture]').first().click()
    else await h.mouse.click(row.x + row.w / 2, row.y + row.h / 2)
    await settle()
    const runs = await log()
    const one = runs.find((r) => r.kind === 'open')
    check('Continue reading: a cover opens the reader with one flight', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'pdf' && !!one?.group, JSON.stringify(runs))
    const first = one?.group?.first
    check('Continue reading: it starts inside the row, the size of a cover', !!first && (at ? near(first, at) : first.x >= row.x - 2 && first.x + first.w <= row.x + row.w + 2 && first.h < row.h + 2), `frame ${say(first)}, row ${say(row)}`)
    await install()
    await back()
    const close = (await log()).find((r) => r.kind === 'close')
    check('Continue reading, back: it shrinks to where the cover is', !!close?.group && near(close.group.last, first, 9) && Math.abs(close.group.last.x - first.x) < 3, `${say(close?.group?.last)}, cover as clicked ${say(first)}`)
  }
}

// 3. A picture in Files' grid: it lifts out of its square into the viewer (its own lift, image-look.tsx).
{
  await h.locator('[data-media-kinds] button', { hasText: /^Images$/ }).first().click().catch(() => {})
  await settle(1000)
  const at = await rectOf('.files-square')
  await install()
  const frames = h.evaluate(() => new Promise((done) => {
    const seen = []
    let frames = 0
    const tick = () => {
      const img = document.querySelector('.mf-look-image')
      if (img) { const r = img.getBoundingClientRect(); seen.push({ x: r.x, y: r.y, w: r.width, h: r.height }) }
      if (seen.length < 30 && ++frames < 240) requestAnimationFrame(tick)
      else done(seen)
    }
    requestAnimationFrame(tick)
  }))
  await h.locator('.files-square').first().click()
  const seen = await frames
  console.log('squares', await h.evaluate(() => document.querySelectorAll('.files-square').length), 'viewer', await h.evaluate(() => !!document.querySelector('.mf-look-image')))
  const first = seen[0]
  const last = seen.at(-1)
  check('Pictures: the viewer opens', !!last, say(last))
  check('Pictures: no view transition (it lifts on its own)', (await log()).length === 0, JSON.stringify(await log()))
  check('Pictures: it starts near its square and grows', !!first && Math.abs(first.x + first.w / 2 - (at.x + at.w / 2)) < at.w && first.w < last.w * 0.8, `first ${say(first)}, square ${say(at)}, last ${say(last)}`)
  await h.keyboard.press('Escape')
  await settle()
}

}

// 2. A note's tile on Home ("Jump back in"): it grows into the note; Back shrinks it home.
await go('home')
await settle(1200)
const tile = async () => h.evaluate(() => {
  // A tile on Home's own page (the sidebar's Recent rows carry the same mark): the first that opens a note.
  const el = [...document.querySelectorAll('[data-pane-card] [data-drag-open]')].find((one) => /^(capture|nugget|article|question):/.test(one.getAttribute('data-drag-open')) && one.getBoundingClientRect().height > 0)
  if (!el) return null
  el.scrollIntoView({ block: 'center' })
  return el.getAttribute('data-drag-open')
})
if (runs(2)) {
{
  const key = await tile()
  await settle(300)
  const at = await rectOf(`[data-pane-card] [data-drag-open="${key}"]`)
  await install()
  await film('note-open', () => h.locator(`[data-pane-card] [data-drag-open="${key}"]`).first().click())
  await settle()
  check('Notes: a tile on Home opens its note', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) !== 'home', key)
  await flew('Notes', 'open', at, 260)
  await install()
  await film('note-close', back)
  await settle(300)
  const after = await rectOf(`[data-pane-card] [data-drag-open="${key}"]`)
  await flew('Notes, back', 'close', after, 220)
}

// Not by a key: the same tile, Enter on it.
{
  const key = await tile()
  await install()
  await h.locator(`[data-pane-card] [data-drag-open="${key}"]`).first().focus()
  await h.keyboard.press('Enter')
  await settle()
  check('By a key: opened, with no flight', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) !== 'home' && (await log()).length === 0, JSON.stringify(await log()))
  await h.keyboard.press('Meta+BracketLeft')
  await settle()
  check('Back by ⌘[: no flight', (await log()).length === 0)
}

// Not from ⌘K.
{
  await install()
  await h.keyboard.press('Meta+k')
  await settle(500)
  await h.keyboard.type('a')
  await settle(500)
  await h.keyboard.press('Enter')
  await settle()
  check('From ⌘K: opened with no flight', (await log()).length === 0, JSON.stringify(await log()))
  await h.keyboard.press('Meta+BracketLeft')
  await settle()
}

// Reduce motion, then Motion off: a click opens at once.
for (const [name, on, off] of [
  ['Reduce motion', () => h.emulateMedia({ reducedMotion: 'reduce' }), () => h.emulateMedia({ reducedMotion: 'no-preference' })],
  ['Motion off', () => h.evaluate(() => (document.documentElement.dataset.motion = 'off')), () => h.evaluate(() => delete document.documentElement.dataset.motion)]
]) {
  await go('home')
  await settle(800)
  await on()
  const key = await tile()
  await install()
  await h.locator(`[data-pane-card] [data-drag-open="${key}"]`).first().click()
  await settle()
  const opened = (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) !== 'home'
  await back()
  check(`${name}: a click opens and Back returns, with no flight`, opened && (await log()).length === 0 && (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'home', JSON.stringify(await log()))
  await off()
}

// A fast double click opens once; a click on Back mid-flight goes through.
{
  await go('home')
  await settle(800)
  const key = await tile()
  await install()
  await h.locator(`[data-pane-card] [data-drag-open="${key}"]`).first().dblclick()
  await settle()
  const page = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
  const steps = await h.evaluate(() => document.querySelector('[data-tab-step="back"]')?.disabled === false)
  check('A fast double click: the note is open, Back one step away', page !== 'home' && steps, `${page}`)
  await back()
  check('…and Back is Home again', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'home')
  const again = await tile()
  await install()
  await h.locator(`[data-pane-card] [data-drag-open="${again}"]`).first().click()
  await h.waitForTimeout(80)
  await h.locator('[data-tab-step="back"]').first().click()
  await settle()
  check('A click on Back 80ms into the flight lands: Home again', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'home', JSON.stringify(await log()))
  check('…and the window takes input again (no flight left over it)', await h.evaluate(() => !document.documentElement.dataset.hero && !document.documentElement.style.viewTransitionName && !document.querySelector('[style*="view-transition-name"]')))
}

}

// 4. A deck in Review grows into studying; Back shrinks it to its tile.
if (runs(3)) {
  await go('review')
  await settle(1200)
  const id = await h.evaluate(() => [...document.querySelectorAll('[data-deck]')].find((one) => !one.querySelector('[data-deck-empty]') && one.getBoundingClientRect().height > 0)?.getAttribute('data-deck'))
  const at = await rectOf(`[data-deck="${id}"]`)
  await install()
  await film('deck-open', () => h.locator(`[data-deck="${id}"]`).first().click())
  await settle()
  check('Decks: a deck opens studying', await h.evaluate(() => !!document.querySelector('[data-review-card], [data-study]') || !document.querySelector('[data-deck-shelf]')), id)
  await flew('Decks', 'open', at, 260)
  await install()
  await back()
  const after = await rectOf(`[data-deck="${id}"]`)
  await flew('Decks, back', 'close', after, 220)
}

// 5. (A Calendar event grew into its side form here. Since 12 Nov a double click on an event opens the popover tied to
// it, with no flight, and the side form comes from the popover's "Open", sliding in from its edge: qa/cal-add.mjs,
// PART=open, drives that. Nothing on the Calendar grows into a page any more, so there is nothing here to fly.)

// 6. Every way in the user clicks, by a real pointer (the mouse moved to the thing and pressed): a flight runs,
// starts on the thing, holds the old picture only briefly (`wait`, the press to the first moving frame), and
// Back shrinks it home. Frames of each, every 50ms, are written to look at.
if (runs(4)) {
  const surfaces = [
    { name: 'Home, pinned', view: 'home', under: 'Favorites, and what you opened lately', sel: '[data-drag-open]' },
    { name: 'Home, Jump back in', view: 'home', under: 'Jump back in', sel: '[data-drag-open]' },
    { name: 'Home, Coming back', view: 'home', under: 'Coming back', sel: '[data-drag-open]' },
    { name: 'Home, Continue reading', view: 'home', sel: '[data-pane-card] [data-reading-row]', canvas: true },
    { name: 'Feed, a post', view: 'feed', sel: '[data-pane-card] li[data-feed-post] [data-feed-title], [data-pane-card] li[data-feed-post] [data-feed-quote]' },
    { name: 'Sources, a face', view: 'sources', sel: '[data-pane-card] [data-face]' },
    { name: 'Files All, Recent', view: 'media', kind: 'All', sel: '[data-pane-card] [data-recent-file="pdf"]' },
    { name: 'Files All, a shelf', view: 'media', kind: 'All', sel: '[data-pane-card] [data-pile]' },
    { name: 'Files Books, a cover', view: 'media', kind: 'Books', sel: '[data-pane-card] [data-library] [data-book]' },
    { name: 'Files Books, Continue reading', view: 'media', kind: 'Books', sel: '[data-pane-card] [data-shelf-continue] [data-reading-row]', canvas: true, optional: true },
    { name: 'Writing, a note row', view: 'articles', sel: '[data-pane-card] [data-list-space] [data-row]', beside: true },
    { name: 'Review, a deck row', view: 'review', list: true, sel: '[data-pane-card] [data-deck-row]' }
  ]
  const only = process.env.HERO_ONLY
  for (const one of surfaces.filter((s) => !only || s.name.toLowerCase().includes(only.toLowerCase()))) {
    await go(one.view)
    await settle(1000)
    if (one.kind) { await h.locator('[data-media-kinds] button', { hasText: new RegExp(`^${one.kind}$`) }).first().click().catch(() => {}); await settle(1000) }
    if (one.list) { await h.locator('[data-deck-look-to="list"]').first().click().catch(() => {}); await settle(800) }
    // The thing to click, marked so it is found again: the first shown, under its heading when it has one.
    const found = await h.evaluate(([sel, under]) => {
      document.querySelector('[data-hero-probe]')?.removeAttribute('data-hero-probe')
      const card = document.querySelector('[data-pane-front] > [data-pane-card], [data-pane] > [data-pane-card]')
      let room = card
      if (under) {
        const head = [...card.querySelectorAll('h2, h3, h4, [data-heading], span, p')].find((one) => one.textContent.trim().startsWith(under) && one.children.length <= 2)
        room = head; while (room && room !== card && !room.querySelector(sel)) room = room.parentElement
      }
      const el = room && [...room.querySelectorAll(sel)].find((el) => el.getBoundingClientRect().height > 8)
      if (!el) return false
      el.setAttribute('data-hero-probe', '')
      const b = el.getBoundingClientRect()
      const p = card.getBoundingClientRect()
      // Off screen: how far to scroll to have it in the middle, and a spot on the page's own margin to wheel over.
      return b.top < 90 || b.bottom > innerHeight - 70 ? { by: Math.round(b.top + b.height / 2 - innerHeight / 2), x: p.x + 10, y: p.y + p.height / 2 } : { by: 0 }
    }, [one.sel.replace(/\[data-pane-card\] /g, ''), one.under])
    if (!found) { if (!one.optional) check(`${one.name}: there to click`, false, one.sel); continue }
    // Scrolled to it as a person does, by the wheel: a page come back by Back holds its place against any scroll
    // that is not the person's own (panes.tsx, PaneFrame's put-back, since 625e2e121), and lets go on a wheel, a
    // press or a key. A script's scrollIntoView alone was put straight back, so the thing stayed off screen
    // ("thing 284,1244", "290,-710") and the click missed it.
    if (found.by) {
      await h.mouse.move(found.x, found.y)
      await h.mouse.wheel(0, found.by)
      await settle(400)
      await h.evaluate(() => {
        const el = document.querySelector('[data-hero-probe]')
        const b = el?.getBoundingClientRect()
        if (b && (b.top < 90 || b.bottom > innerHeight - 70)) el.scrollIntoView({ block: 'center' })
      })
    }
    await settle(400)
    const r = await rectOf('[data-hero-probe]')
    const page = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
    await install()
    // A real pointer: moved there, then pressed and let go (twice for a double click).
    const x = one.canvas ? r.x + Math.min(70, r.w / 4) : r.x + Math.min(r.w / 2, 60)
    const y = r.y + Math.min(r.h / 2, 14)
    await h.mouse.move(x, y)
    await settle(150)
    await film(`s-${one.name.replace(/\W+/g, '-').toLowerCase()}`, () => h.mouse.click(x, y, { clickCount: one.dbl ? 2 : 1 }))
    await settle(1500)
    const flights = (await log()).filter((f) => f.kind === 'open')
    // A row of a list that stays on screen swaps its note in beside it, with no flight (10 Nov: Mail and Notes).
    if (one.beside) { check(`${one.name}: the note is swapped in beside the list, no flight`, flights.length === 0, JSON.stringify(flights)); continue }
    const f = flights.at(-1)
    console.log(`  ${one.name}: ${flights.length} open, ${f?.skipped ? `skipped: ${f.skipped}` : f?.group ? `${say(f.group.first)} -> ${say(f.group.last)}, ${f.group.ms}ms, moving ${f.wait}ms after the press, ${f.late}ms after the page was on show` : 'none'}`)
    check(`${one.name}: a click grows it open`, flights.length === 1 && !!f?.group, JSON.stringify(flights))
    check(`${one.name}: from where it was clicked`, !!f?.group && (one.canvas ? f.group.first.x >= r.x - 2 && f.group.first.x + f.group.first.w <= r.x + r.w + 2 : near(f.group.first, f.from ?? r, 4)), `flight ${say(f?.group?.first)}, thing ${say(f?.from ?? r)}`)
    check(`${one.name}: it moves only once the new page is on show, and at once then (within 80ms)`, f?.shown === true && f.late != null && f.late < 80, `${f?.late}ms`)
    await frameCheck(one.name, f)
    await install()
    await back()
    const closes = (await log()).filter((f) => f.kind === 'close')
    check(`${one.name}: Back shrinks it home, onto where it is`, closes.length === 1 && !!closes[0].group && near(closes[0].group.last, await rectOf('[data-hero-probe]') ?? closes[0].group.last, 4), JSON.stringify(closes))
    if (closes[0]?.group) await frameCheck(`${one.name}, back`, closes[0])
    check(`${one.name}: and the page is back`, (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === page)
  }
  await h.evaluate(() => localStorage.removeItem('haligtree:deck-look'))
}

check('no errors in the window', c.errors.filter((e) => !/ResizeObserver|favicon|Failed to load resource/.test(e)).length === 0, c.errors.slice(0, 3).join(' | '))
if (allFrames.length) { const sorted = [...allFrames].sort((a, b) => a - b); console.log(`main thread while flights ran: ${sorted.length} frames, median ${sorted[sorted.length >> 1]}ms, ${sorted.filter((d) => d > 20).length} over 20ms (${(100 * sorted.filter((d) => d > 20).length / sorted.length).toFixed(1)}%), max ${sorted.at(-1)}ms`) }
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
