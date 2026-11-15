// The word count's pill under a note (components/count/word-count.tsx): it shows past the last line and steps aside
// over words, a picture, a button and Related cards; and how often the page is asked what lies under a point while a
// long note is flung down (real wheel events), first with the keys elsewhere, then with the caret in the note (the
// spelling pill, spell-pill.tsx, follows the caret's word). Before, every frame of any scroll asked three times for
// the count alone. On a COPY of a book (QA_DATA), never the book itself:
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/count-pill.mjs
// SHOTS=<folder> keeps a picture of the pill's place in each case.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const SHOTS = process.env.SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const open = "status = 'open' and kind = 'note' and body is not null"
const long = db.prepare(`select id, body from captures where ${open} order by length(body) desc limit 1`).get()
// Short ones that still have a count (40 words and more): the pill shows anywhere in them, and Related cards or a
// button may come after their words. Pictured ones: a picture to put under the pill.
const shorts = db.prepare(`select id, body from captures where ${open} and length(body) between 1500 and 6000 and body not like '%"type":"image"%' order by length(body) limit 12`).all().filter((one) => JSON.parse(one.body).content?.length)
const pictured = db.prepare(`select id, body from captures where ${open} and body like '%"type":"image"%"src":"haligtree://assets/%' and length(body) < 400000 order by length(body) limit 8`).all().filter((one) => JSON.parse(one.body).content?.length)
db.close()
const blocks = (one) => JSON.parse(one.body).content?.length ?? 0
const load = () => `load ${loadavg()[0].toFixed(1)}`

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
await h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected && !one.closest('[inert]')).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
  const pill = () => ed()?.closest('.haligtree-editor-wrapper')?.querySelector('.tiptap-word-count') ?? null
  // Every way the page can be asked what lies under a point, counted (a fling's frames beside them).
  const hits = { n: 0 }
  for (const name of ['elementsFromPoint', 'elementFromPoint', 'caretRangeFromPoint', 'caretPositionFromPoint']) {
    const real = Document.prototype[name]
    if (real) Document.prototype[name] = function (...args) { hits.n++; return real.apply(this, args) }
  }
  window.__pill = {
    ed, box: () => boxOf(ed()), hits,
    opened: (count) => { const e = ed(); return !!e && e.editor.state.doc.childCount >= count && e.textContent.trim().length > 0 },
    middle: () => { const r = boxOf(ed()).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } },
    to: (share) => { const box = boxOf(ed()); box.scrollTo({ top: Math.round((box.scrollHeight - box.clientHeight) * share), behavior: 'instant' }) },
    state: () => { const one = pill(); return one ? { shows: one.hasAttribute('data-clear'), says: one.textContent.trim() } : null },
    // The pill and a little round it, for a picture.
    clip: () => { const r = pill().getBoundingClientRect(); return { x: Math.max(0, r.left - 160), y: Math.max(0, r.top - 70), width: r.width + 320, height: r.height + 100 } },
    // The first thing of a kind that can be put under the pill (over one of the three points it looks at), put there.
    under: (kind) => {
      const e = ed()
      const box = boxOf(e)
      if (!pill()) return null
      const p = pill().getBoundingClientRect()
      const xs = [p.left + 2, p.left + p.width / 2, p.right - 2]
      const pick = {
        picture: () => [...e.querySelectorAll('img, figure')],
        button: () => [...box.querySelectorAll('button:not([data-row]), [role="button"]')].filter((one) => !e.contains(one)),
        related: () => [...box.querySelectorAll('[data-row]')].filter((one) => !e.contains(one)),
      }[kind]()
      const one = pick.find((el) => { const r = el.getBoundingClientRect(); return r.height > 4 && xs.some((x) => r.left <= x && r.right >= x) })
      if (!one) return null
      for (let i = 0; i < 3; i++) {
        const r = one.getBoundingClientRect()
        box.scrollTop += r.top + Math.min(r.height / 2, 12) - (p.top + p.height / 2)
      }
      const r = one.getBoundingClientRect()
      return { what: `${one.tagName.toLowerCase()}${one.getAttribute('aria-label') ? ` "${one.getAttribute('aria-label')}"` : ''}`, inNote: e.contains(one), under: r.top <= p.bottom && r.bottom >= p.top }
    },
  }
}, ED)
const settle = () => h.evaluate(() => new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(next)))))
const openNote = async (one) => {
  await send('capture', one.id)
  await h.waitForFunction((count) => window.__pill.opened(count), blocks(one) - 1, { timeout: 90000, polling: 100 })
  await wait(1500)
}
// In both looks; the dark one last, as the run goes on in it.
const shot = async (name) => {
  if (!SHOTS) return
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await wait(300)
    await h.screenshot({ path: join(SHOTS, `${name}-${theme}.png`), clip: await h.evaluate(() => window.__pill.clip()) })
  }
}
const fling = async (way) => electron.evaluate(async ({ BrowserWindow }, [way, { x, y }]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  const started = performance.now()
  let last = started
  for (;;) {
    await new Promise((next) => setTimeout(next, 8))
    const now = performance.now()
    const t = now - started
    const v = t < 80 ? 6000 * (t / 80) : 6000 * Math.exp(-(t - 80) / 325)
    if (t >= 80 && v < 40) break
    const by = (v * (now - last)) / 1000
    last = now
    if (by >= 0.5) win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: way * by, hasPreciseScrollingDeltas: true, canScroll: true })
  }
}, [way, await h.evaluate(() => window.__pill.middle())])
/** Hit tests per frame through a fling down (whichever way the wheel's sign scrolls down). */
const counted = async () => {
  const before = await h.evaluate(() => (window.__pill.hits.n = 0, window.__pill.box().scrollTop))
  await h.evaluate(() => { window.__frames = 0; window.__on = true; const tick = () => { if (!window.__on) return; window.__frames++; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await fling(-1)
  await wait(400)
  let out = await h.evaluate(() => (window.__on = false, { hits: window.__pill.hits.n, frames: window.__frames, top: window.__pill.box().scrollTop }))
  if (out.top < before) {
    await h.evaluate(() => (window.__pill.hits.n = 0, window.__frames = 0, window.__on = true, requestAnimationFrame(function tick() { if (window.__on) (window.__frames++, requestAnimationFrame(tick)) })))
    await fling(1)
    await wait(400)
    out = await h.evaluate(() => (window.__on = false, { hits: window.__pill.hits.n, frames: window.__frames, top: window.__pill.box().scrollTop }))
  }
  return { ...out, went: Math.round(out.top - before), each: Math.round((out.hits / Math.max(1, out.frames)) * 100) / 100 }
}

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await wait(1200)

  // A short note scrolled to its end: past its last line, nothing under the pill (the first such note).
  let short = null
  for (const one of shorts) {
    await openNote(one)
    await h.evaluate(() => window.__pill.to(1))
    await wait(300)
    await settle()
    const state = await h.evaluate(() => window.__pill.state())
    if (state?.shows) { short = { one, state }; break }
    if (state && !short) short = { one, state }
  }
  console.log(`a short note ${short?.one.id.slice(0, 8)}: ${JSON.stringify(short?.state)}  (${load()})`)
  if (short) await shot('past-the-last-line')
  check('past the last line of a short note the count shows', !!short?.state.shows, JSON.stringify(short?.state))

  // Related cards and a button after a short note's words, each put under the pill.
  const after = {}
  for (const one of shorts) {
    if (after.related && after.button) break
    await openNote(one)
    for (const kind of ['related', 'button']) {
      if (after[kind]) continue
      const put = await h.evaluate((kind) => window.__pill.under(kind), kind)
      if (!put?.under) continue
      await settle()
      after[kind] = { note: one.id.slice(0, 8), ...put, ...(await h.evaluate(() => window.__pill.state())) }
      await shot(kind)
      await h.evaluate(() => window.__pill.to(0))
    }
  }
  for (const [kind, name] of [['related', 'Related cards'], ['button', 'a button']]) {
    console.log(`${name} under the pill: ${JSON.stringify(after[kind] ?? 'none found to put there')}`)
    check(`over ${name} after the words the count steps aside`, !!after[kind] && !after[kind].shows, JSON.stringify(after[kind] ?? null))
  }

  // A picture in a note, under the pill.
  let picture = null
  for (const one of pictured) {
    await openNote(one)
    const put = await h.evaluate(() => window.__pill.under('picture'))
    if (!put?.under) continue
    await settle()
    picture = { note: one.id.slice(0, 8), ...put, ...(await h.evaluate(() => window.__pill.state())) }
    await shot('picture')
    break
  }
  console.log(`a picture under the pill: ${JSON.stringify(picture ?? 'none found to put there')}`)
  check('over a picture the count steps aside', !!picture && !picture.shows, JSON.stringify(picture))

  // The longest note: its middle (words under the pill) and its end, and a fling in its middle.
  await openNote(long)
  await h.evaluate(() => window.__pill.to(0.5))
  await wait(1200)
  await settle()
  const middle = await h.evaluate(() => window.__pill.state())
  await shot('over-words')
  console.log(`the longest note ${long.id.slice(0, 8)} (${blocks(long)} blocks), in its middle: ${JSON.stringify(middle)}  (${load()})`)
  check('over the words in the middle of a long note the count steps aside', !!middle && !middle.shows, JSON.stringify(middle))
  const away = await counted()
  console.log(`a fling in its middle, the keys elsewhere: ${away.hits} hit tests in ${away.frames} frames (${away.each} a frame), went ${away.went}px  (${load()})`)
  check('a fling in the middle of a long note asks what is under a point on no frame', away.went !== 0 && away.each <= 0.05, `${away.each} a frame over ${away.frames} frames`)
  // The caret in its words (a real press on a line on the screen), a pause, then the same fling.
  const spot = await h.evaluate(() => { const e = window.__pill.ed(); const box = window.__pill.box().getBoundingClientRect(); const line = [...e.querySelectorAll('p')].find((one) => { const r = one.getBoundingClientRect(); return r.top > box.top + 120 && r.bottom < box.bottom - 120 && one.textContent.trim().length > 30 }); const r = line?.getBoundingClientRect(); return r ? { x: r.left + Math.min(60, r.width / 3), y: r.top + 8 } : null })
  if (spot) await h.mouse.click(spot.x, spot.y)
  await wait(1600)
  const keyed = await h.evaluate(() => document.activeElement === window.__pill.ed())
  const caret = await counted()
  console.log(`the same with the caret in it (${keyed ? 'the note has the keys' : 'the note does NOT have the keys'}): ${caret.hits} hit tests in ${caret.frames} frames (${caret.each} a frame), went ${caret.went}px  (${load()})`)
  check('with the caret in the note, a fling asks what is under a point on at most one frame in ten', keyed && caret.went !== 0 && caret.each <= 0.1, `${caret.each} a frame over ${caret.frames} frames`)
  // To its end, and again once its drawn blocks have come there (their heights were guesses until drawn).
  await h.evaluate(() => window.__pill.to(1))
  await wait(1200)
  await h.evaluate(() => window.__pill.to(1))
  await wait(800)
  await settle()
  const end = await h.evaluate(() => window.__pill.state())
  await shot('long-note-end')
  console.log(`the longest note at its end: ${JSON.stringify(end)}`)
  const faults = c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|ERR_BLOCKED_BY_RESPONSE|status of 40\d/.test(line))
  check('no page errors', !faults.length, faults.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
