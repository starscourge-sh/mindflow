// Something clicked grows into what it opens and shrinks back on the way out
// (lib/hero.ts): a book's cover on Files' shelf and in "Continue reading" into
// the reader, a note's tile on Home into the note, a picture into its viewer,
// a deck into studying, a Calendar event into its side form. For each, a click
// runs one view transition whose frame starts on the clicked thing's rect, in
// about 250ms (200ms back); by a key, ⌘K, Reduce motion or Motion off there is
// none; a fast double click and a click mid-flight still land. Frames of one
// open and one close are written, paused every 50ms, to look at.
//
//   npx electron-vite build --outDir out-he
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-he/main/index.js HALIGTREE_QA_AWAY=1 node qa/hero-open.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null
// Run in parts, each its own launch, to stay well inside a probe's time: 1 books and pictures, 2 notes and the ways that do not fly, 3 decks and the Calendar.
const part = Number(process.argv[3] ?? 0)
const runs = (n) => !part || part === n
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 800 })
const { h, go } = c
h.on('console', (m) => m.text().startsWith('HERO') && console.log(m.text()))

// Every view transition the window starts, and for one of ours its frame's first and last keyframes and its length.
const install = () => h.evaluate(() => {
  window.__hero = []
  if (window.__heroWrapped) return
  window.__heroWrapped = true
  // Where the clicked thing is as it is clicked (a cover lifts a little under the pointer).
  const KEY = '[data-book],[data-drag-open],[data-deck],[data-cal-event],[data-cal-event-chip],[data-still-picture]'
  for (const type of ['click', 'dblclick']) addEventListener(type, (event) => {
    const el = event.target.closest?.(KEY)
    if (el) { const r = el.getBoundingClientRect(); window.__clicked = { x: r.x, y: r.y, w: r.width, h: r.height } }
  }, true)
  const start = document.startViewTransition.bind(document)
  document.startViewTransition = (update) => {
    const turn = start(update)
    const one = { kind: document.documentElement.dataset.hero ?? null, skipped: false }
    window.__hero.push(one)
    turn.ready.then(() => {
      const group = document.getAnimations().find((a) => a.effect?.pseudoElement === '::view-transition-group(mf-hero)')
      if (!group) return void (one.group = null)
      const frames = group.effect.getKeyframes()
      const box = (k) => { const m = /matrix\(([^)]+)\)/.exec(k.transform ?? '')?.[1].split(',').map(Number); return { x: m?.[4], y: m?.[5], w: parseFloat(k.width), h: parseFloat(k.height) } }
      const named = [...document.querySelectorAll('*')].find((el) => el.style.viewTransitionName === 'mf-hero')
      const r = named?.getBoundingClientRect()
      one.to = r && { x: r.x, y: r.y, w: r.width, h: r.height }
      one.from = window.__clicked
      one.group = { ms: group.effect.getComputedTiming().duration, ease: group.effect.getComputedTiming().easing, first: box(frames[0]), last: box(frames.at(-1)) }
    }, () => void (one.skipped = true))
    return turn
  }
})
const log = () => h.evaluate(() => window.__hero)
const rectOf = (sel) => h.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }, sel)
const near = (a, b, by = 3) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= by)
const say = (r) => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}` : 'none'
const settle = (ms = 700) => h.waitForTimeout(ms)
const card = () => rectOf('[data-pane-front] > [data-pane-card], [data-pane] > [data-pane-card]')
const back = async () => { await h.locator('[data-tab-step="back"]').first().click(); await settle() }

/** One flight checked: ran, ours, its length, and that it starts (open) or ends (close) on `at`. */
async function flew(name, kind, at, ms) {
  const runs = (await log()).filter((one) => one.kind === kind)
  const one = runs.at(-1)
  const end = kind === 'open' ? one?.group?.first : one?.group?.last
  check(`${name}: one ${kind} flight ran`, runs.length === 1 && !!one?.group, JSON.stringify(runs.map((r) => ({ skipped: r.skipped, group: !!r.group }))))
  check(`${name}: about ${ms}ms on the app's strong ease-out`, one?.group && Math.abs(one.group.ms - ms) < 1, `${one?.group?.ms}ms`)
  // Opening, the thing as it was clicked; closing, the thing it lands on, as the page came back.
  const thing = kind === 'open' ? one?.from ?? at : one?.to ?? at
  check(`${name}: the frame ${kind === 'open' ? 'starts on the clicked thing' : 'ends on the thing it came from'}`, near(end, thing), `frame ${say(end)}, thing ${say(thing)}`)
  return one
}

/** Frames of the flight about to start, paused every 50ms: `act` starts it. */
async function film(label, act) {
  if (!shots) return act()
  await h.evaluate(() => { window.__pause = true })
  await h.evaluate(() => {
    const was = document.startViewTransition
    document.startViewTransition = (update) => {
      const turn = was(update)
      // Held at the start, so each 50ms can be laid down and pictured.
      turn.ready.then(() => document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition')).forEach((a) => (a.pause(), (a.currentTime = 0)))).catch(() => {})
      document.startViewTransition = was
      return turn
    }
  })
  await act()
  await h.waitForTimeout(400)
  for (let t = 0; t <= 300; t += 50) {
    await h.evaluate((ms) => document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition')).forEach((a) => (a.currentTime = ms)), t)
    await h.waitForTimeout(60)
    await h.screenshot({ path: `${shots}/${label}-${String(t).padStart(3, '0')}.png` })
  }
  await h.evaluate(() => document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition')).forEach((a) => a.finish()))
  await settle(400)
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
  const name = `hero-picture-${i}.png`
  await write(name, bytes)
  files.push({ src: `haligtree://assets/${name}`, kind: 'picture', name: '', size: 1000, type: '', id: '', title: '', private: false, near: '', at: new Date(Date.now() - (i + 3) * 3600_000).toISOString(), uses: [], added: true, gone: false, how: 'library' })
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
  await film('book-open', () => h.locator(sel).first().dblclick())
  await settle()
  const opened = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
  check('Books: the shelf\'s cover opens the reader', opened === 'pdf', opened)
  await flew('Books', 'open', at, 250)
  const page = await card()
  check('Books: it grows into the pane\'s page', near((await log()).at(-1)?.group?.last, page), say(page))
  await install()
  await film('book-close', back)
  const after = await rectOf(`[data-book="${src}"]`)
  await flew('Books, back', 'close', after, 200)
}

// 1b. "Continue reading": a cover drawn in the glass row.
{
  await settle(600)
  const row = await rectOf('[data-shelf-continue] [data-flex-carousel], [data-shelf-continue] [data-still-picture]')
  if (!row) check('Continue reading: the row is there', false)
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
    check('Continue reading, back: it shrinks to where the cover is', !!close?.group && near(close.group.last, close.to ?? first, 3) && Math.abs(close.group.last.x - first.x) < 3, `${say(close?.group?.last)}, cover ${say(close?.to)}`)
  }
}

// 3. A picture in Files' grid: it lifts out of its square into the viewer (its own lift, image-look.tsx).
{
  await h.locator('[data-media-kinds] button', { hasText: /^Pictures$/ }).first().click().catch(() => {})
  await settle(1000)
  const at = await rectOf('.files-square')
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
  check('Pictures: it starts near its square and grows', !!first && Math.abs(first.x + first.w / 2 - (at.x + at.w / 2)) < at.w && first.w < last.w * 0.8, `first ${say(first)}, square ${say(at)}, last ${say(last)}`)
  await h.keyboard.press('Escape')
  await settle()
}

}

// 2. A note's tile on Home ("Jump back in"): it grows into the note; Back shrinks it home.
await go('home')
await settle(1200)
const tile = async () => h.evaluate(() => {
  const el = [...document.querySelectorAll('[data-drag-open]')].find((one) => /^(capture|nugget|article|question):/.test(one.getAttribute('data-drag-open')) && one.getBoundingClientRect().height > 0 && one.getBoundingClientRect().top < innerHeight - 60)
  if (!el) return null
  el.scrollIntoView({ block: 'center' })
  return el.getAttribute('data-drag-open')
})
if (runs(2)) {
{
  const key = await tile()
  await settle(300)
  const at = await rectOf(`[data-drag-open="${key}"]`)
  await install()
  await film('note-open', () => h.locator(`[data-drag-open="${key}"]`).first().click())
  await settle()
  check('Notes: a tile on Home opens its note', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) !== 'home', key)
  await flew('Notes', 'open', at, 250)
  await install()
  await film('note-close', back)
  await settle(300)
  const after = await rectOf(`[data-drag-open="${key}"]`)
  await flew('Notes, back', 'close', after, 200)
}

// Not by a key: the same tile, Enter on it.
{
  const key = await tile()
  await install()
  await h.locator(`[data-drag-open="${key}"]`).first().focus()
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
  await h.locator(`[data-drag-open="${key}"]`).first().click()
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
  await h.locator(`[data-drag-open="${key}"]`).first().dblclick()
  await settle()
  const page = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
  const steps = await h.evaluate(() => document.querySelector('[data-tab-step="back"]')?.disabled === false)
  check('A fast double click: the note is open, Back one step away', page !== 'home' && steps, `${page}`)
  await back()
  check('…and Back is Home again', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'home')
  const again = await tile()
  await install()
  await h.locator(`[data-drag-open="${again}"]`).first().click()
  await h.waitForTimeout(80)
  await h.locator('[data-tab-step="back"]').first().click()
  await settle()
  check('A click on Back 80ms into the flight lands: Home again', (await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))) === 'home', JSON.stringify(await log()))
  check('…and the window takes input again (no transition left on)', await h.evaluate(() => !document.documentElement.dataset.hero && document.getAnimations().every((a) => !a.effect?.pseudoElement?.startsWith('::view-transition'))))
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
  await flew('Decks', 'open', at, 250)
  await install()
  await back()
  const after = await rectOf(`[data-deck="${id}"]`)
  await flew('Decks, back', 'close', after, 200)
}

// 5. A Calendar event: a double click grows it into the side form; its close shrinks it back.
if (runs(3)) {
  await go('calendar')
  await settle(1500)
  const sel = await h.evaluate(() => {
    const el = [...document.querySelectorAll('[data-cal-event], [data-cal-event-chip]')].find((one) => !one.hasAttribute('data-readonly') && one.getBoundingClientRect().height > 12)
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    return el.hasAttribute('data-cal-event') ? `[data-cal-event="${el.getAttribute('data-cal-event')}"]` : `[data-cal-event-chip="${el.getAttribute('data-cal-event-chip')}"]`
  })
  if (!sel) check('Calendar: an event to open', false)
  else {
    await settle(300)
    const at = await rectOf(sel)
    await install()
    await film('event-open', () => h.locator(sel).first().dblclick())
    await settle()
    check('Calendar: the event\'s side form is open', await h.evaluate(() => !!document.querySelector('[data-day-side="event"]')))
    await flew('Calendar', 'open', at, 250)
    const form = await rectOf('[data-day-side="event"]')
    check('Calendar: it grows into the side form', near((await log()).find((r) => r.kind === 'open')?.group?.last, form), say(form))
    await install()
    await film('event-close', () => h.locator('[data-day-side-close]').first().click())
    await settle()
    check('Calendar: closed', await h.evaluate(() => !document.querySelector('[data-day-side="event"]')))
    await flew('Calendar, back', 'close', await rectOf(sel), 200)
  }
}

check('no errors in the window', c.errors.filter((e) => !/ResizeObserver|favicon/.test(e)).length === 0, c.errors.slice(0, 3).join(' | '))
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
