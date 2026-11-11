// The app started with a book's largest note last open: does the window
// answer at once, and how long was it frozen while it came up? Run on a COPY
// of a book (QA_DATA), never the book itself:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/starts-on-big-note.mjs
//
// It opens the note, shuts the app, starts it again and prints, with the load
// beside them: whether the note came back on show, when the window first
// answered, and its frozen stretches (long tasks) since it began loading, the
// longest and their sum. The check: no frozen stretch over BLOCK_MS (100).
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const BLOCK_MS = Number(process.env.BLOCK_MS ?? 100)
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const load = () => `load ${loadavg()[0].toFixed(1)}`
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const note = db.prepare("select id, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const onShow = (h) => h.evaluate((sel) => Math.max(0, ...[...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).map((one) => one.editor.state.doc.childCount)), ED)

// First run: the note opened, and the app shut with it open.
let c = await sandbox({ width: 1300, height: 900, seeded: false })
await c.h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await c.h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
await c.h.waitForTimeout(1500)
await c.send('capture', note.id)
await c.h.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((one) => one.editor && one.editor.state.doc.childCount > 500 && one.textContent.trim().length > 0), ED, { timeout: 120000 })
await c.h.waitForTimeout(3000)
const blocks = await onShow(c.h)
console.log(`note ${note.id.slice(0, 8)} (${Math.round(note.size / 1024)} KB, ${blocks} blocks) open; shutting the app  [${load()}]`)
await c.close()
await new Promise((next) => setTimeout(next, 1500))

// Second run: started on it.
const started = Date.now()
c = await sandbox({ width: 1300, height: 900, seeded: false })
try {
  const answered = Date.now() - started
  await c.h.waitForTimeout(4000)
  const back = await onShow(c.h)
  const long = await c.h.evaluate(() => new Promise((got) => {
    const all = []
    const seen = new PerformanceObserver((list) => all.push(...list.getEntries().map((e) => [Math.round(e.startTime), Math.round(e.duration)])))
    seen.observe({ type: 'longtask', buffered: true })
    setTimeout(() => (seen.disconnect(), got(all)), 300)
  }))
  const longest = Math.max(0, ...long.map(([, d]) => d))
  console.log(`started again: the window was up and answering ${answered} ms after launch (the harness's own waits included); the note ${back > 500 ? `is back on show (${back} blocks)` : 'is NOT on show'}  [${load()}]`)
  console.log(`frozen stretches while it came up: ${long.length}, longest ${longest} ms, ${long.reduce((sum, [, d]) => sum + d, 0)} ms in all: ${long.map(([at, d]) => `${d} ms at ${at}`).join(', ')}`)
  check('started on its largest note, the note is on show', back > 500, `${back} blocks`)
  check(`started on its largest note, the window is never frozen over ${BLOCK_MS} ms`, longest <= BLOCK_MS, `${longest} ms`)
} finally {
  await c.close()
}
done()
