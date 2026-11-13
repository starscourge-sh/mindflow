// Coming back to the app answers like a window that never left: brought forward after another app, shown again after
// it was put away, the Mac woken from sleep, and shown again after a minute away. For each, on Home and then with the
// book's largest note open: no frame of the main window over 100 ms, main's thread never held 100 ms or more (it also
// answers every other window), and what ran is listed (every ask of main with its count and time, the page's changes
// and React's redraws). Nothing that did not change is drawn again: React draws nothing when the answer is the same.
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/come-back.mjs
// MINUTE=0 leaves out the minute away (it waits 61 s).
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const MINUTE = process.env.MINUTE !== '0'
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const largest = db.prepare("select id, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const load = () => `load ${loadavg()[0].toFixed(1)}`

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, electron, send } = c
// React's own door for tools (the one React DevTools uses): each commit counted, from the page's first frame. Set
// before the page is read again, once it has settled (a reload in its first moments can take the renderer down).
await electron.context().addInitScript(() => {
  const rec = (window.__renders = { on: false, commits: 0 })
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(), supportsFiber: true, isDisabled: false,
    inject(renderer) { this.renderers.set(this.renderers.size + 1, renderer); return this.renderers.size },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {}, setStrictMode() {},
    onCommitFiberRoot() { if (rec.on) rec.commits++ }
  }
})
await h.waitForTimeout(1500)
await h.reload()
await h.waitForLoadState('domcontentloaded')
await h.waitForFunction(() => !!document.querySelector('[data-page]'), null, { timeout: 90000, polling: 200 })
await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))

// The page's own record: every frame's length (a frame loop), the long frames the browser saw with the script that
// took most of each, and how many things on the page changed (nodes in and out, attributes, words).
await h.evaluate(() => {
  const real = { state: Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get, hidden: Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get }
  let forced = null
  // Shown and hidden as the Mac says it of a window in front: a test window is parked off the screen and never is.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => forced ?? real.state.call(document) })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => (forced ? forced === 'hidden' : real.hidden.call(document)) })
  const long = []
  new PerformanceObserver((list) => {
    for (const one of list.getEntries()) {
      const worst = [...(one.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0]
      long.push({ at: one.startTime, ms: Math.round(one.duration), what: worst ? `${worst.invoker} ${worst.sourceFunctionName || '(anonymous)'} ${worst.sourceURL.split('/').pop()}:${worst.sourceCharPosition} ${Math.round(worst.duration)} ms` : 'style, layout or paint' })
    }
  }).observe({ type: 'long-animation-frame' })
  let rec = null
  window.__back = {
    /** How long since the window last drew a long frame (ms). */
    calm: () => performance.now() - Math.max(0, ...long.map((one) => one.at + one.ms)),
    seen: (state) => { forced = state; document.dispatchEvent(new Event('visibilitychange')) },
    start: () => {
      rec = { from: performance.now(), frames: [], changes: 0, where: new Map(), on: true }
      window.__renders.commits = 0
      window.__renders.on = true
      let last = performance.now()
      const loop = (t) => { if (!rec?.on) return; rec.frames.push(t - last); last = t; requestAnimationFrame(loop) }
      requestAnimationFrame(loop)
      const name = (node) => { const el = node?.nodeType === 1 ? node : node?.parentElement; const at = el?.closest?.('[data-page], [data-slot], [class]'); return at ? `${at.nodeName.toLowerCase()}${at.dataset?.page ? `[page=${at.dataset.page}]` : ''}${typeof at.className === 'string' && at.className ? '.' + at.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}` : '?' }
      rec.watch = new MutationObserver((list) => {
        for (const m of list) {
          const n = m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length : 1
          rec.changes += n
          const key = `${m.type}${m.attributeName ? ` ${m.attributeName}` : ''} in ${name(m.target)}`
          rec.where.set(key, (rec.where.get(key) ?? 0) + n)
        }
      })
      rec.watch.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
    },
    stop: () => {
      rec.on = false
      rec.watch.disconnect()
      window.__renders.on = false
      const frames = rec.frames.slice(1)
      return {
        worst: Math.round(Math.max(0, ...frames)), over50: frames.filter((ms) => ms > 50).length, frames: frames.length,
        long: long.filter((one) => one.at >= rec.from).map((one) => `${one.ms} ms: ${one.what}`),
        changes: rec.changes, where: [...rec.where].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, n]) => `${n} ${key}`),
        commits: window.__renders.commits
      }
    }
  }
})

const home = (run) => electron.evaluate(({ BrowserWindow, app, powerMonitor }, run) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  new Function('win', 'app', 'powerMonitor', run)(win, app, powerMonitor)
}, run)
const page = (event) => h.evaluate((event) => window.dispatchEvent(new Event(event)), event)
const seen = (state) => h.evaluate((state) => window.__back.seen(state), state)
/** Main's table of what held its thread (stalls.ts): each name's calls and time, read before and after. */
const table = () => electron.evaluate(() => globalThis.mainStalls())
/** Until the window has drawn nothing long for a while: what a person coming back finds already settled. */
const settled = () => h.waitForFunction(() => window.__back.calm() > 1500, null, { timeout: 60000, polling: 250 }).catch(() => undefined)

/** The ways of coming back: what goes, then what comes back. */
const WAYS = {
  'after another app': {
    away: async () => { await home("app.emit('did-resign-active'); win.emit('blur')"); await page('blur') },
    back: async () => { await home("app.emit('did-become-active'); win.emit('focus'); app.emit('browser-window-focus', {}, win)"); await page('focus') }
  },
  'after it was put away': {
    away: async () => { await home('win.close()'); await seen('hidden'); await page('blur') },
    back: async () => { await home("app.emit('activate', {}, false)"); await seen('visible'); await page('focus') }
  },
  'after the Mac slept': {
    away: async () => { await home("powerMonitor.emit('lock-screen'); powerMonitor.emit('suspend')"); await seen('hidden'); await page('blur') },
    back: async () => { await home("powerMonitor.emit('resume'); powerMonitor.emit('unlock-screen')"); await seen('visible'); await page('focus') }
  }
}

async function comeBack(where, name, way, gone = 1500) {
  await settled()
  await way.away()
  await h.waitForTimeout(gone)
  const before = await table()
  await h.evaluate(() => window.__back.start())
  await way.back()
  await h.waitForTimeout(2000)
  const seenThere = await h.evaluate(() => window.__back.stop())
  const after = await table()
  const was = new Map(before.rows.map((row) => [row.name, row]))
  const ran = after.rows.map((row) => ({ name: row.name, calls: row.calls - (was.get(row.name)?.calls ?? 0), ms: row.ms - (was.get(row.name)?.ms ?? 0) })).filter((row) => row.calls > 0).sort((a, b) => b.ms - a.ms)
  const held = after.slow.filter((one) => !before.slow.some((old) => old.at === one.at && old.name === one.name))
  const heldMost = Math.max(0, ...held.map((one) => one.ms))
  console.log(`\n${where}, ${name}${gone > 2000 ? ` (${Math.round(gone / 1000)} s away)` : ''}  [${load()}]`)
  console.log(`  the window: worst frame ${seenThere.worst} ms, ${seenThere.over50} of ${seenThere.frames} frames over 50 ms; ${seenThere.commits} React commits; ${seenThere.changes} changes on the page${seenThere.where.length ? `: ${seenThere.where.join(', ')}` : ''}`)
  if (seenThere.long.length) console.log(`  long frames: ${seenThere.long.join(' | ')}`)
  console.log(`  main: asked ${ran.reduce((sum, row) => sum + row.calls, 0)} times, ${ran.reduce((sum, row) => sum + row.ms, 0)} ms in all, held its thread ${heldMost} ms at most; event loop worst ${after.delay.worst} ms`)
  console.log(`    ${ran.slice(0, 10).map((row) => `${row.name} x${row.calls} ${row.ms} ms`).join(' · ') || 'nothing'}`)
  check(`${where}, ${name}: no frame over 100 ms`, seenThere.worst <= 100, `worst ${seenThere.worst} ms  [${load()}]`)
  check(`${where}, ${name}: main's thread never held 100 ms`, heldMost < 100, held.map((one) => `${one.name} ${one.ms} ms`).join(', ') || 'none')
  return { worst: seenThere.worst, held: heldMost, commits: seenThere.commits, changes: seenThere.changes, asks: ran.reduce((sum, row) => sum + row.calls, 0) }
}

const same = {}
try {
  await h.waitForTimeout(3000)
  for (const [name, way] of Object.entries(WAYS)) same[`home ${name}`] = await comeBack('Home', name, way)
  // The largest note open: the page that costs most to draw again.
  await send('capture', largest.id)
  await h.waitForFunction(() => [...document.querySelectorAll('.tiptap.ProseMirror')].some((one) => one.editor?.state.doc.childCount > 1000), null, { timeout: 90000, polling: 200 })
  await h.waitForTimeout(4000)
  for (const [name, way] of Object.entries(WAYS)) same[`note ${name}`] = await comeBack(`The largest note (${largest.size.toLocaleString()} characters)`, name, way)
  if (MINUTE) same['note a minute away'] = await comeBack(`The largest note (${largest.size.toLocaleString()} characters)`, 'after a minute away', WAYS['after it was put away'], 61_000)
  check('no page errors', c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).length === 0, c.errors.slice(0, 3).join(' | '))
  console.log(`\nSAME ${JSON.stringify(same)}`)
} finally {
  await Promise.race([c.close(), new Promise((next) => setTimeout(next, 8000))])
}
done()
