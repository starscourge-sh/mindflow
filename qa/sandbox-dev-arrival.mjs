// Into the sandbox from the welcome on the development path, as `npm run dev`
// runs it: pages come from a server (here a slow stand-in for the dev server,
// each page and script held back a while), and the run that starts the
// sandbox is a new process the old one waits on. Every window's first frame on
// screen is written by the app itself (HALIGTREE_QA_TRACE), the new run's too:
// the main window opens on "Opening the sandbox", drawn, and each sticky comes
// only once its page has drawn what it holds, never an empty grey card.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-dev-arrival.mjs [trace-dir]
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { dirname, extname, join } from 'path'
import { checks } from './harness.mjs'

const ENTRY = process.env.QA_ENTRY
const ROOT = join(dirname(dirname(ENTRY)), 'renderer')
const TRACE = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'haligtree-trace-'))
const DELAY = Number(process.env.QA_PAGE_DELAY ?? 700)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.jpg': 'image/jpeg' }
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  await new Promise((r) => setTimeout(r, /\.(html|js)$/.test(path) ? DELAY : 0))
  try {
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(0, r))
process.env.ELECTRON_RENDERER_URL = `http://localhost:${server.address().port}`
process.env.HALIGTREE_QA_TRACE = TRACE
const { sandbox } = await import('./sandbox-lib.mjs')

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 720, seeded: false })
const { h } = c
const read = () => (existsSync(`${TRACE}/trace.jsonl`) ? readFileSync(`${TRACE}/trace.jsonl`, 'utf8').trim().split('\n').map((one) => JSON.parse(one)) : [])
try {
  await h.waitForSelector('.mf-welcome', { timeout: 30000 })
  await h.waitForTimeout(800)
  await h.click('.mf-welcome footer button:has-text("Skip the welcome")')
  await h.waitForSelector('.mf-welcome [data-choice="2"]', { timeout: 15000 })
  await h.waitForTimeout(1200)
  const t0 = Date.now()
  await h.click('.mf-welcome [data-choice="2"]')
  for (let i = 0; i < 60 && read().filter((one) => one.sandbox && one.name.startsWith('sticky')).length < 2; i++) await new Promise((r) => setTimeout(r, 500))
  await new Promise((r) => setTimeout(r, 1500))
  const seen = read().filter((one) => one.sandbox)
  for (const one of seen) console.log(`  ${one.at - t0}ms ${one.name} ${JSON.stringify({ drawn: one.drawn, ready: one.ready })}`)
  const home = seen.find((one) => one.name === 'home')
  check('the new run\'s main window comes up, drawn, on the opening screen', !!home && home.drawn && /[?&]arrived=1/.test(home.url ?? ''), JSON.stringify(home))
  const stickies = seen.filter((one) => one.name.startsWith('sticky'))
  check('its two stickies come, each only once its page has drawn what it holds', stickies.length === 2 && stickies.every((one) => one.ready), JSON.stringify(stickies))
  check('and only after the main window is up', !!home && stickies.every((one) => one.at >= home.at), JSON.stringify(seen.map((one) => [one.name, one.at - t0])))
  console.log(`  first frames: ${TRACE}`)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
  // The run the switch started (the old one's child, so the test does not own it) ends too.
  try { execSync(`pkill -f "${ENTRY} --show-home"`) } catch {}
  server.close()
}
done()
