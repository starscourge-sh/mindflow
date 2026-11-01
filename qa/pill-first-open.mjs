// The first open of quick capture after the app starts, with "One line to start" on: the box comes on screen
// already the finished pill, never the whole box (or its panel, or its controls) for a frame first. The app writes
// the box's first frame on screen (HALIGTREE_QA_TRACE) and the page records every frame after it. Run it against a
// production build, and against a development build served slowly as `npm run dev` serves it (QA_PAGE_DELAY):
// React's development mode and the dev server's slower pages are where it flashed.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_PAGE_DELAY=700] node qa/pill-first-open.mjs [frames-dir]
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
// QA_PAGE_DELAY (ms): pages served from a server, each page and script held back that long, as the dev server
// serves them (a development build, NODE_ENV=development, for React's development checks and StrictMode).
if (process.env.QA_PAGE_DELAY) {
  const { createServer } = await import('http')
  const { readFile } = await import('fs/promises')
  const { dirname, extname } = await import('path')
  const ROOT = join(dirname(dirname(process.env.QA_ENTRY)), 'renderer')
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.jpg': 'image/jpeg' }
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    await new Promise((r) => setTimeout(r, /\.(html|js)$/.test(path) ? Number(process.env.QA_PAGE_DELAY) : 0))
    try {
      const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path))
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
      res.end(body)
    } catch { res.writeHead(404); res.end() }
  })
  await new Promise((r) => server.listen(0, r))
  server.unref()
  process.env.ELECTRON_RENDERER_URL = `http://localhost:${server.address().port}`
}
const TRACE = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'haligtree-trace-'))
process.env.HALIGTREE_QA_TRACE = TRACE
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
const { CALM_HOUR, sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const read = () => (existsSync(`${TRACE}/trace.jsonl`) ? readFileSync(`${TRACE}/trace.jsonl`, 'utf8').trim().split('\n').map((one) => JSON.parse(one)) : [])
const box = async (c) => {
  for (let i = 0; i < 100; i++) {
    const page = c.electron.windows().find((w) => /index\.html|localhost:\d+\/?(\?|$)/.test(w.url()) && !/view=/.test(w.url()))
    if (page) return page
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('no quick capture window')
}

// First run: "One line to start" on, kept for the next start.
let c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
await new Promise((r) => setTimeout(r, 1500))
await c.close()

// Second run: the first open after starting.
c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
try {
  const page = await box(c)
  // Every frame from the moment it shows: whether it is the pill, what the card and window measure, and whether the
  // full box's rows (its header strip, its footer, the side panel) are drawn.
  await page.evaluate(() => {
    window.__first = []
    const tick = () => {
      if (document.visibilityState === 'visible') {
        const card = document.querySelector('.app-container')
        window.__first.push({
          pill: !!document.querySelector('.app-container[data-pill]'),
          card: card ? Math.round(card.getBoundingClientRect().height) : 0,
          footer: [...document.querySelectorAll('[data-zen-row]')].some((one) => one.offsetParent)
        })
      }
      requestAnimationFrame(tick)
    }
    tick()
  }).catch(() => {})
  const before = await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !/view=/.test(w.webContents.getURL())).map((w) => [w.webContents.getURL().slice(-40), w.isVisible()]))
  console.log(`  before the open: ${JSON.stringify(before)}`)
  const t0 = Date.now()
  await c.h.evaluate(() => window.api.showPrompt())
  for (let i = 0; i < 30 && !read().some((one) => one.name === 'prompt'); i++) await new Promise((r) => setTimeout(r, 200))
  await new Promise((r) => setTimeout(r, 900))
  const frames = await page.evaluate(() => window.__first)
  const shown = read().filter((one) => one.name === 'prompt')
  console.log(`  ${process.env.QA_PAGE_DELAY ? 'served slowly (dev path)' : 'production'} renderer; first frame on screen at ${shown[0] ? shown[0].at - t0 : '?'}ms: ${TRACE}`)
  console.log(`  frames: ${frames.length}, ${[...new Set(frames.map((one) => JSON.stringify(one)))].join(' ')}`)
  // Under the probes the box's window is already up, parked out of sight, before the first open: its trace is kept
  // when there is one, and the check that matters is the first height below.
  if (shown.length) console.log(`  first frame on screen: ${JSON.stringify(shown[0])}`)
  check('every frame from the first is the finished pill (56px card, no footer)', frames.length > 10 && frames.every((one) => one.pill && one.card === 56 && !one.footer), `${frames.length} frames`)
  // The cause, seen from main: the box is shown at its first fit (window:fit), so the first height the page asks
  // for must already be the pill's. Its page loaded again from the start, as at a launch, every height it asks for.
  await c.electron.evaluate(({ ipcMain }) => {
    globalThis.__fits = []
    ipcMain.on('window:fit', (_event, height) => globalThis.__fits.push(height))
  })
  await page.reload()
  await new Promise((r) => setTimeout(r, 4000))
  const fits = await c.electron.evaluate(() => globalThis.__fits)
  console.log(`  heights asked for after a fresh load: ${JSON.stringify(fits)}`)
  check('a fresh load asks first for the pill\'s height (56), never the whole box\'s', fits.length > 0 && fits[0] === 56, JSON.stringify(fits))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
