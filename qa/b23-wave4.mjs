// b23 wave 4, in the sandbox: Lookups' empty page shows its example; the
// main window dims under a veil (the page itself stays at full strength, so a
// toast on it stays solid); a note moved into its own window and back, timed:
// how often its window changes size (each one lays the page out again) and
// how long the frames take while it moves.
//
//   npx electron-vite build --outDir out-w4
// W4_FRESH=1 with no QA_ARGS: a new book with one note and no word asked, for Lookups' example.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-w4/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_VIRTUAL=1 node qa/b23-wave4.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const fresh = !!process.env.W4_FRESH
const c = await sandbox({ width: 1300, height: 860, seeded: !fresh })
const { h, v, go, electron } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)

try {
  await v('settings:set', { safeMode: false, hintRate: 0, motion: false })
  await v('onboarding:set', { pageHints: false })

  // 9: Lookups with no word asked yet shows its example, though the Inbox has notes.
  if (fresh) await h.evaluate(() => window.api.captures.create({ body: 'A first plain note' }))
  const asked = await h.evaluate(async () => (await window.api.captures.list()).filter((one) => one.lookup).length)
  await go('lookups'); await wait(1500)
  const lookups = await h.evaluate(() => ({ example: !!document.querySelector('[data-example-frame]'), text: document.querySelector('[data-example-frame] [role="note"]')?.textContent ?? '' }))
  if (fresh) check('9: Lookups shows its example when no word was ever asked', asked === 0 && lookups.example && lookups.text.includes('Word'), JSON.stringify({ asked, ...lookups }))
  if (fresh) throw 'done'

  // 22b: left, the page stays at full strength under a veil.
  await go('inbox'); await wait(800)
  await h.evaluate(() => (document.documentElement.dataset.blurred = 'on')); await wait(400)
  const dim = await h.evaluate(() => ({ body: getComputedStyle(document.body).opacity, veil: getComputedStyle(document.body, '::after').opacity, events: getComputedStyle(document.body, '::after').pointerEvents, bg: getComputedStyle(document.body, '::after').backgroundColor }))
  check('22b: left, the page keeps full strength and a veil dims it', dim.body === '1' && Number(dim.veil) > 0.3 && dim.events === 'none', JSON.stringify(dim))
  await h.screenshot({ path: process.env.SHOT ?? '/dev/null' }).catch(() => {})
  await h.evaluate(() => (document.documentElement.dataset.blurred = 'off')); await wait(400)
  check('22b: back, the veil is gone', (await h.evaluate(() => getComputedStyle(document.body, '::after').opacity)) === '0')

  // 17: out to its own window and back, timed in the main process.
  await v('settings:set', { motion: true })
  await electron.evaluate(({ BrowserWindow }) => {
    const log = (globalThis.__moves = [])
    const proto = BrowserWindow.prototype
    for (const name of ['setBounds', 'setOpacity']) {
      const was = proto[name]
      proto[name] = function (...args) {
        if (!this.isDestroyed() && this.webContents.getURL().includes('note=')) {
          const before = this.getBounds()
          log.push({ at: performance.now(), name, resized: name === 'setBounds' && ((args[0].width ?? before.width) !== before.width || (args[0].height ?? before.height) !== before.height) })
        }
        return was.apply(this, args)
      }
    }
  })
  const page = (await v('items', 'article')).filter((one) => !one.archivedAt)[0]
  const stats = (moves) => {
    const steps = moves.map((one, n) => (n ? one.at - moves[n - 1].at : 0)).slice(1)
    return { steps: moves.length, resizes: moves.filter((one) => one.resized).length, worstGapMs: Math.round(Math.max(0, ...steps)), over20ms: steps.filter((one) => one > 20).length, ms: Math.round(moves.length ? moves.at(-1).at - moves[0].at : 0) }
  }
  await v('notes:window', 'article', page.id, { x: 300, y: 200, width: 600, height: 400 }, null)
  let win = null
  for (let i = 0; i < 40 && !win; i++) {
    win = electron.windows().find((w) => decodeURIComponent(w.url()).includes(`note=article:${page.id}`)) ?? null
    if (!win) await wait(100)
  }
  await wait(1500)
  const out = stats(await electron.evaluate(() => globalThis.__moves.splice(0)))
  // Frames in the note's window while it settled: long ones, from the browser's own record.
  const long = await win.evaluate(() => performance.getEntriesByType('long-animation-frame').map((one) => Math.round(one.duration)))
  console.log('17 out:', JSON.stringify(out), 'long frames in its window:', JSON.stringify(long))
  check('17: going out, its window never changes size on the way (no page laid out again each frame)', out.resizes === 0, JSON.stringify(out))
  const shown = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('note=')).map((w) => ({ opacity: w.qaOpacity ?? w.getOpacity(), ...w.getBounds() })))
  check('17: it arrives whole, at its own size', shown.length === 1 && shown[0].opacity === 1 && shown[0].width === 720, JSON.stringify(shown))
  // Back: the main window's frames while its window lands.
  await h.evaluate(() => {
    const gaps = (window.__gaps = [])
    let last = performance.now()
    const step = (now) => { gaps.push(now - last); last = now; if (gaps.length < 90) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  })
  await win.evaluate(() => void window.api.haligtree('notes:promote', null)).catch(() => {})
  await wait(1500)
  const back = stats(await electron.evaluate(() => globalThis.__moves.splice(0)))
  const gaps = await h.evaluate(() => window.__gaps.map(Math.round))
  console.log('17 back:', JSON.stringify(back), 'main window frame gaps over 20ms:', gaps.filter((one) => one > 20).length, 'worst', Math.max(...gaps))
  check('17: coming back, its window never changes size on the way', back.resizes === 0, JSON.stringify(back))
  check('17: the note is back in the main window, its own window gone', (await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('note=')).length)) === 0)
} catch (error) {
  if (error !== 'done') throw error
} finally {
  await c.close()
  done()
}
