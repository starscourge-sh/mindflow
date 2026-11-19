// Every page at the size a book becomes. Run on a COPY of a book (QA_DATA),
// the big one qa/scale-book.mjs writes or the real one, never the book itself:
//
//   QA_DATA=<copy> QA_ARGS= QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/scale-pages.mjs
//
// For each page, as a person reaches it (from another page): the time from
// the press to the page drawn (its first frame, and when it finished drawing:
// no frame over 50 ms and no batch of rows coming in for 700 ms), the frames
// over 17.5 ms in a fling down its longest list (120 px a frame, 40 frames),
// main's longest hold meanwhile (its event loop's worst delay), and the
// window's memory after. Then ⌘K typed key by key, each key to its results.
// Budgets: drawn within 150 ms, no frame over 17.5 ms in a fling, search
// results within 100 ms of a key, main never held over 100 ms.
// PAGES=home,inbox,... runs only those. Prints one line a page, then N/M.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= ''

const { check, done } = checks()
const DATA = process.env.QA_DATA
if (!DATA) throw new Error('QA_DATA is a copy of a book')
const BOOK = JSON.parse(readFileSync(join(DATA, 'books.json'), 'utf8')).books[0].id
const db = new DatabaseSync(join(DATA, 'books', BOOK, 'haligtree.db'), { readOnly: true })
const bigFolder = db.prepare("select group_id as id from nuggets where tier = 'article' and group_id is not null group by group_id order by count(*) desc limit 1").get()?.id
const bigTag = db.prepare("select count(*) as n from captures where body like '%#scale-everyday%'").get().n ? 'scale-everyday' : 'todo'
const person = db.prepare("select attribution as name from captures where attribution is not null and kind = 'quote' group by attribution order by count(*) desc limit 1").get()?.name
db.close()
const DRAWN = 150, FRAME = 17.5, KEY = 100, HELD = 100
const load = () => `load ${loadavg()[0].toFixed(1)}`

// [label, type, id, heading]: reached as the sidebar, a link or ⌘K reaches it (home:open).
const PAGES = [
  ['Home', 'view', 'home'], ['Inbox', 'view', 'inbox'], ['Everything', 'view', 'all'], ['Today', 'view', 'today'], ['Week', 'view', 'weekpage'], ['Month', 'view', 'monthpage'],
  ['Calendar', 'view', 'calendar'], ['Tasks: upcoming', 'view', 'upcoming'], ['Tasks: later', 'view', 'later'], ['Tasks: all', 'view', 'alltasks'], ['Tasks: matrix', 'view', 'matrix'], ['Tasks: routines', 'view', 'routines'],
  ['Writing', 'view', 'articles'], ['The big folder', 'folder', `article:${bigFolder}`], ['Gems', 'view', 'nuggets'], ['Tags', 'view', 'tags'], ['A tag on 8,000', 'tag', bigTag],
  ['Sources', 'view', 'sources'], ['A person', 'person', person], ['Lookups', 'view', 'lookups'], ['Questions', 'view', 'questions'], ['Goals', 'view', 'goals'], ['Review', 'view', 'review'],
  ['Files', 'view', 'media'], ['Stats', 'view', 'stats'], ['Year', 'view', 'yearpage'], ['Map', 'view', 'map'], ['Feed', 'view', 'feed'], ['Bin', 'view', 'discarded'], ['Archive', 'view', 'archived']
].filter(([label, , id]) => !process.env.PAGES || process.env.PAGES.split(',').some((one) => one === id || one === label))

// Until the page has finished drawing: the later of its last busy frame (50 ms or more) and the last batch of rows (25 elements at once), once 700 ms pass with neither.
const settle = (h, page) => h.evaluate((page) => new Promise((resolve) => {
  const t0 = window.__t0
  let found = null, rows = t0, busy = t0, quiet = performance.now()
  const here = () => document.querySelector(`[data-page="${page}"]`)
  const observer = new MutationObserver((list) => {
    if (!here()) return
    let added = 0
    for (const one of list) for (const node of one.addedNodes) if (node.nodeType === 1) added += 1 + node.querySelectorAll('*').length
    if (added >= 25) (rows = performance.now(), (quiet = rows))
  })
  observer.observe(document.body, { childList: true, subtree: true })
  const frames = new PerformanceObserver((list) => {
    for (const one of list.getEntries()) if (one.duration >= 50 && one.startTime + one.duration > t0) (busy = Math.max(busy, one.startTime + one.duration), (quiet = performance.now()))
  })
  try { frames.observe({ type: 'long-animation-frame', buffered: true }) } catch {}
  const end = performance.now() + 15000
  const tick = () => {
    const now = performance.now()
    if (!found && here()) found = now
    if ((found && now - quiet > 700) || now > end) {
      observer.disconnect(); frames.disconnect()
      resolve({ first: Math.round((found ?? now) - t0), drawn: Math.round(Math.max(found ?? now, rows, busy) - t0), elements: here()?.querySelectorAll('*').length ?? -1, timedOut: now > end })
    } else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), page)

// A fling down the page's longest scrolling list: each frame's gap, and the long frames the browser saw.
const fling = (h, page) => h.evaluate(async (page) => {
  const root = document.querySelector(`[data-page="${page}"]`)
  const box = root && [root, ...root.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 600 && /auto|scroll/.test(getComputedStyle(el).overflowY)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  if (!box) return null
  const gaps = []
  const long = []
  const seen = new PerformanceObserver((list) => { for (const one of list.getEntries()) long.push(Math.round(one.duration)) })
  try { seen.observe({ type: 'long-animation-frame' }) } catch {}
  // The window's own pace with nothing moving, for what a frame over 17.5 ms means here.
  let still = 0
  let was = performance.now()
  for (let i = 0; i < 40; i++) {
    await new Promise((go) => requestAnimationFrame(go))
    if (performance.now() - was > 17.5) still++
    was = performance.now()
  }
  let last = performance.now()
  for (let i = 0; i < 40; i++) {
    box.scrollTop += 120
    await new Promise((go) => requestAnimationFrame(go))
    const now = performance.now()
    gaps.push(now - last)
    last = now
  }
  seen.disconnect()
  box.scrollTop = 0
  gaps.sort((a, b) => a - b)
  return { still, over: gaps.filter((gap) => gap > 17.5).length, worst: Math.round(gaps.at(-1)), median: Math.round(gaps[20] * 10) / 10, long: long.length ? Math.max(...long) : 0, height: box.scrollHeight }
}, page)

const started = Date.now()
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { electron, send } = c
// The window a book opens in can be made again as it starts: always the one there now.
let h = c.h
const fresh = async () => {
  for (let i = 0; i < 150; i++) {
    const one = electron.windows().find((w) => !w.isClosed() && w.url().includes('view=home'))
    if (one && (await one.evaluate(() => !!document.querySelector('[data-page]')).catch(() => false))) return (h = one)
    await new Promise((go) => setTimeout(go, 200))
  }
  throw new Error('no main window with a page')
}
await fresh()
const cold = Date.now() - started
console.log(`cold start to its first page drawn: ${cold} ms (${await h.evaluate(() => document.querySelector('[data-page]').dataset.page)})  [${load()}]`)
const stalls = () => electron.evaluate(() => globalThis.mainStalls())
const memory = () => electron.evaluate(({ app }) => Math.round(app.getAppMetrics().reduce((sum, one) => sum + one.memory.workingSetSize, 0) / 1024))
const rows = []
try {
  await h.waitForTimeout(3000)
  for (const [label, type, id, heading] of PAGES) {
    const page = id === 'all' ? 'inbox' : type === 'view' ? id : type === 'folder' ? 'articles' : type === 'tag' ? 'tags' : type === 'person' ? 'source' : id
    // From another page, once it has finished drawing: what is timed is this page alone.
    const from = page === 'home' ? 'inbox' : 'home'
    await h.evaluate(() => (window.__t0 = performance.now()))
    await send('view', from)
    await fresh()
    await settle(h, from)
    await stalls()
    const since = Date.now()
    await h.evaluate(() => (window.__t0 = performance.now()))
    await send(type, id, heading)
    const shown = await settle(h, page)
    const flung = await fling(h, page)
    const table = await stalls()
    const held = table.delay.worst
    // What held main, by name (the jobs of 50 ms or more since the press).
    const who = table.slow.filter((one) => one.at >= since).sort((a, b) => b.ms - a.ms).slice(0, 4).map((one) => `${one.name} ${one.ms}`).join(', ')
    const mb = await memory()
    const row = { label, ...shown, fling: flung, held, mb }
    rows.push(row)
    console.log(`${label.padEnd(16)} first ${String(shown.first).padStart(5)} ms  drawn ${String(shown.drawn).padStart(5)} ms  ${String(shown.elements).padStart(6)} elements  fling ${flung ? `${flung.over}/40 over 17.5 (still ${flung.still}/40) (worst ${flung.worst}, long ${flung.long}, ${flung.height}px)` : 'nothing to scroll'}  main held ${held} ms${who ? ` (${who})` : ''}  ${mb} MB  [${load()}]`)
    check(`${label}: drawn within ${DRAWN} ms`, shown.drawn <= DRAWN && !shown.timedOut, `${shown.drawn} ms`)
    if (flung) check(`${label}: no frame over ${FRAME} ms in a fling`, flung.over === 0, `${flung.over} frames, worst ${flung.worst} ms`)
    check(`${label}: main never held over ${HELD} ms`, held <= HELD, `${held} ms`)
  }
  if (!process.env.PAGES || process.env.PAGES.includes('search')) {
    await send('view', 'home')
    await h.waitForTimeout(900)
    await h.keyboard.press('Meta+k')
    await h.waitForSelector('[aria-label="Search"] input', { timeout: 5000 })
    await h.locator('[aria-label="Search"] input').first().focus()
    await h.waitForTimeout(500)
    await stalls()
    const RESULTS = '[aria-label="Search"] [data-row]'
    const keys = []
    for (const ch of 'docker shell') {
      await h.evaluate((results) => {
        const words = () => [...document.querySelectorAll(results)].map((one) => one.textContent).join('|')
        const box = document.querySelector('[aria-label="Search"]')
        window.__typed = { t0: performance.now(), last: null, was: words() }
        window.__typed.observer = new MutationObserver(() => { const now = words(); if (now !== window.__typed.was) (window.__typed.was = now, (window.__typed.last = performance.now())) })
        window.__typed.observer.observe(box, { childList: true, subtree: true, characterData: true })
      }, RESULTS)
      await h.keyboard.press(ch === ' ' ? 'Space' : ch)
      keys.push(await h.evaluate(() => new Promise((resolve) => {
        const tick = () => {
          const typed = window.__typed
          const since = performance.now() - (typed.last ?? typed.t0)
          if (since > 400) (typed.observer.disconnect(), resolve(typed.last ? Math.round(typed.last - typed.t0) : 0))
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })))
    }
    const held = (await stalls()).delay.worst
    const worst = Math.max(...keys)
    console.log(`⌘K typing       keys ${JSON.stringify(keys)}  worst ${worst} ms  main held ${held} ms  ${await memory()} MB  [${load()}]`)
    check(`⌘K: each key's results within ${KEY} ms`, worst <= KEY, `${worst} ms`)
    check(`⌘K: main never held over ${HELD} ms`, held <= HELD, `${held} ms`)
    await h.keyboard.press('Escape')
  }
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 6))
} catch (error) {
  check('probe ran', false, error.stack)
} finally {
  await c.close()
}
console.log(`rows ${JSON.stringify(rows)}`)
done()
