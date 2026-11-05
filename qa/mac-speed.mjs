// Launch and typing, measured, so a Mac feature never slows either: how long from launch until the
// main window shows its page, and how long each key takes to be drawn in a note (keydown to the next
// frame), over 120 keys. Run against two builds to compare (QA_ENTRY).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-speed.mjs
import { open } from './harness.mjs'

const started = Date.now()
const qa = await open()
const { electron } = qa
let h = null
for (let i = 0; i < 200 && !h; i++) (h = electron.windows().find((w) => w.url().includes('view=home')) ?? null), h || (await new Promise((r) => setTimeout(r, 50)))
await h.waitForSelector('main, [data-page], .tiptap', { timeout: 30000 }).catch(() => {})
const launch = Date.now() - started
await h.waitForTimeout(3000)
const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'capture', id), id)
await h.waitForTimeout(1500)
await h.click('.tiptap.ProseMirror').catch(() => {})
await h.evaluate(() => {
  window.__keys = []
  document.addEventListener('keydown', (event) => { const at = performance.now(); requestAnimationFrame(() => setTimeout(() => window.__keys.push(performance.now() - at), 0)) }, true)
})
await h.keyboard.type('The Stoics taught that only our judgements are up to us, and so we keep a book of them. '.repeat(2).slice(0, 120), { delay: 35 })
await h.waitForTimeout(500)
const keys = (await h.evaluate(() => window.__keys)).sort((a, b) => a - b)
const median = keys[Math.floor(keys.length / 2)]
const p95 = keys[Math.floor(keys.length * 0.95)]
console.log(JSON.stringify({ launchMs: launch, keys: keys.length, keyMedianMs: Math.round(median * 10) / 10, keyP95Ms: Math.round(p95 * 10) / 10 }))
await qa.close().catch(() => {})
try { qa.electron.process().kill('SIGKILL') } catch {}
process.exit(0)
