// Frames in the largest note of a book while the caret moves (↓, or j with VIM=on) and while the page scrolls by
// the wheel: how many frames ran past 17.5 ms, and the longest. Run it on a build without line numbers and on one
// with them, back to back, through the timing queue, on a COPY of a book (QA_DATA), never the book itself:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/line-numbers-long.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const note = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const blocks = JSON.parse(note.body).content.length
const VIM = process.env.VIM === 'on'
const STEPS = Number(process.env.STEPS ?? 40)
const load = () => `load ${loadavg()[0].toFixed(1)}`
console.log(`note ${note.id.slice(0, 8)}: ${blocks} blocks  (${load()})`)

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const record = () => h.evaluate(() => {
  window.__frames = []
  window.__rec = true
  let last = performance.now()
  const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const stop = () => h.evaluate(() => { window.__rec = false; return window.__frames.slice(1) })
const sum = (frames) => `${frames.length} frames, ${frames.filter((ms) => ms > 17.5).length} over 17.5 ms, longest ${Math.round(Math.max(0, ...frames) * 10) / 10} ms`
try {
  await h.evaluate((vim) => { localStorage.setItem('vim', vim ? 'on' : 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: vim ? 'on' : 'off' })) }, VIM)
  await send('capture', note.id)
  await h.waitForFunction(() => !!document.querySelector('[data-open] .tiptap[data-long]'), null, { timeout: 60000 })
  await wait(4000)
  // The caret on a paragraph in the middle of the screen, by a real press.
  const spot = await h.evaluate(() => {
    const mid = innerHeight / 2
    const one = [...document.querySelectorAll('[data-open] .tiptap[data-long] > p')].find((p) => { const r = p.getBoundingClientRect(); return r.top > mid - 200 && r.bottom < mid + 200 && p.textContent.trim().length > 3 })
    const r = one?.getBoundingClientRect()
    return r ? { x: r.left + 8, y: r.top + 6 } : null
  })
  if (!spot) throw new Error('No paragraph in the middle of the screen')
  await h.mouse.click(spot.x, spot.y)
  await wait(1200)
  const numbered = await h.evaluate(() => document.querySelectorAll('[data-open] .mf-lines .mf-line').length)
  const key = VIM ? 'j' : 'ArrowDown'
  // Into Normal mode if the note is not in it yet (Esc in Normal mode takes the keys out of the note).
  if (VIM && (await h.evaluate(() => document.querySelector('[data-open] .tiptap').getAttribute('data-vim-mode'))) !== 'normal') await h.keyboard.press('Escape')
  await record()
  for (let i = 0; i < STEPS; i++) { await h.keyboard.press(key); await wait(60) }
  await wait(300)
  const caret = await stop()
  await h.mouse.move(spot.x + 120, 450)
  await record()
  for (let i = 0; i < STEPS; i++) { await h.mouse.wheel(0, 140); await wait(30) }
  await wait(600)
  const scroll = await stop()
  console.log(`numbers drawn: ${numbered}; caret moved by ${key} x${STEPS}: ${sum(caret)}; wheel x${STEPS}: ${sum(scroll)}  (${load()})`)
  check('the run finished, with frames counted both ways', caret.length > 10 && scroll.length > 10, `${caret.length} and ${scroll.length} frames`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
