// The session bubble's shape: it drops in as a capsule, opens, settles to the
// pill, and after the session turns into a band and folds away. The size it
// is seen at changes by clip and transform only: nothing inside it is laid
// out again on each frame (its box changes size at most once per change, not
// every frame). Shots of each stage, free and under the notch.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/pill-shape.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(100)
  }
  throw new Error('no pill')
}
/** Watch the island for a while: how often a box inside it changed size, and the shapes it was seen at. */
const watch = (pill, ms, sel = '[data-island]') => pill.evaluate(([ms, sel]) => new Promise((done) => {
  const island = document.querySelector(sel)
  if (!island) return done({ frames: 0, sizes: ['none'], seen: 0 })
  const sizes = new Set()
  const seen = []
  const start = performance.now()
  let frames = 0
  const step = () => {
    frames++
    const r = island?.getBoundingClientRect()
    if (r) sizes.add(`${Math.round(r.width)}x${Math.round(r.height)}`)
    // What is seen: the clip on the island's frame, or its box.
    const frame = island?.closest('[data-island-frame]')
    seen.push(frame ? getComputedStyle(frame).clipPath : r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '')
    if (performance.now() - start < ms) requestAnimationFrame(step)
    else done({ frames, sizes: [...sizes], seen: new Set(seen).size })
  }
  requestAnimationFrame(step)
}), [ms, sel])

try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  for (const sits of ['free', 'notch']) {
    await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', pillSits: sits })
    const id = await v('timer:start', 'Read the chapter on rivers', 120000)
    await h.evaluate(() => window.api.showFocus(true))
    const pill = await pillWindow()
    await pill.waitForSelector('[data-island]', { timeout: 10000 })
    const opening = await watch(pill, 3200)
    check(`${sits}: it moves while it opens and settles`, opening.seen > 8, `${opening.seen} shapes over ${opening.frames} frames`)
    check(`${sits}: its box is laid out a few times at most, not each frame`, opening.sizes.length <= 4, opening.sizes.join(' '))
    if (SHOT) await pill.screenshot({ path: `${SHOT}/pill-${sits}-rest.png` }).catch(() => {})
    await pill.hover('[data-island]', { position: { x: 60, y: 10 } }).catch(() => {})
    await pill.waitForTimeout(1200)
    if (SHOT) await pill.screenshot({ path: `${SHOT}/pill-${sits}-open.png` }).catch(() => {})
    await pill.mouse.move(2, 300).catch(() => {})
    await pill.waitForTimeout(1500)
    // Ended: the band.
    await v('session:end', id, '', true)
    await pill.waitForTimeout(250)
    const band = await watch(pill, 1200, '[data-after]')
    check(`${sits}: the band springs without a box changing size each frame`, band.seen > 4 && band.sizes.length <= 4, band.sizes.join(' '))
    if (SHOT) await pill.screenshot({ path: `${SHOT}/pill-${sits}-band.png` }).catch(() => {})
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=focus'))?.close())
    await wait(800)
  }
  check('no errors', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
