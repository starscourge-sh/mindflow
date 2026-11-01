// Open quick capture, then press ⌘K, as the user does: a frame every 50ms for 1.5s after each (pictures into
// QA_SHOTS), and the layout read every animation frame. Fails if the card, the controls above it or the window move
// or change size more than once, if the footer (Note, camera, mic, Create) ever goes, if the block handle shows
// beside the empty line, or if the palette is ever cut off at the window's foot.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/qc-cmdk-still.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
mkdirSync(shots, { recursive: true })
const boxWin = `BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=') && w.isVisible())`

// Read every frame in the page: the card, the controls above it, the footer, the handle, the palette.
const watch = () => page.evaluate(() => {
  window.__frames = []
  const seen = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    let o = 1
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return o > 0.5 && getComputedStyle(el).visibility !== 'hidden'
  }
  const sample = () => {
    const card = document.querySelector('.app-container')?.getBoundingClientRect()
    const chips = document.querySelector('.mf-top')?.getBoundingClientRect()
    const create = document.querySelector('[data-create]')
    const handle = [...document.querySelectorAll('.tiptap-drag-handle')].some(seen)
    const palette = [...document.querySelectorAll('[role=dialog]')].map((one) => one.getBoundingClientRect()).find((r) => r.height > 40)
    const scrim = document.querySelector('[role=dialog][aria-label=Search]')?.getBoundingClientRect()
    const cardBox = document.querySelector('.app-container')?.getBoundingClientRect()
    const dimOut = !!(scrim && cardBox && getComputedStyle(document.querySelector('[role=dialog][aria-label=Search]')).backgroundColor !== 'rgba(0, 0, 0, 0)' && (scrim.left < cardBox.left - 1 || scrim.right > cardBox.right + 1 || scrim.top < cardBox.top - 1 || scrim.bottom > cardBox.bottom + 1))
    window.__frames.push({ dimOut, t: Math.round(performance.now()), h: innerHeight, card: card && [Math.round(card.top), Math.round(card.left), Math.round(card.height)], chips: chips && [Math.round(chips.top), Math.round(chips.left)], footer: seen(create), handle, palette: palette && [Math.round(palette.top), Math.round(palette.bottom)] })
    if (window.__frames.length < 120) requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})
const frames = () => page.evaluate(() => window.__frames)
const bounds = []
const film = async (name) => {
  const start = Date.now()
  let n = 0
  while (Date.now() - start < 1500) {
    bounds.push(await c.electron.evaluate(new Function('{ BrowserWindow }', `const w = ${boxWin}; return w && w.getBounds()`)))
    await page.screenshot({ path: `${shots}/qc-cmdk-${name}-${String(n++).padStart(2, '0')}.png` }).catch((e) => console.log("shot failed", e.message.split("\n")[0]))
    const left = 50 - ((Date.now() - start) % 50)
    if (left > 0) await wait(left)
  }
  return n
}
const changes = (list, key) => list.filter((f, i) => i && JSON.stringify(key(f)) !== JSON.stringify(key(list[i - 1]))).length

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  await page.evaluate(() => window.api.hidePrompt())
  await wait(800)
  // Pointer over the writing, where the user's was.
  for (const step of ['open', 'cmdk']) {
    bounds.length = 0
    if (step === 'open') {
      await page.evaluate(() => window.api.showPrompt())
      await watch()
    } else {
      await watch()
      await page.keyboard.press('Meta+k')
    }
    await page.mouse.move(300, 200)
    const taken = await film(step)
    const all = await frames()
    const settled = all.filter((f) => f.card && f.card[2] > 0)
    check(`${step}: the card never moves or changes size more than once`, changes(settled, (f) => f.card) <= 1, `${changes(settled, (f) => f.card)} changes: ${[...new Set(settled.map((f) => f.card.join(',')))].slice(0, 6).join(' | ')}`)
    check(`${step}: the controls above the card never move`, changes(settled, (f) => f.chips) === 0, [...new Set(settled.map((f) => String(f.chips)))].slice(0, 6).join(' | '))
    check(`${step}: the window changes size at most once`, changes(settled, (f) => f.h) <= 1, [...new Set(settled.map((f) => f.h))].join(', '))
    const placed = bounds.filter(Boolean)
    check(`${step}: the window never moves on the screen`, new Set(placed.map((b) => b.y)).size <= 1 && new Set(placed.map((b) => b.x)).size <= 1, [...new Set(placed.map((b) => `${b.x},${b.y}`))].join(' | '))
    const gone = settled.filter((f) => !f.footer && !(step === 'cmdk' && f.palette))
    check(`${step}: the footer never goes`, gone.length === 0, `${gone.length} of ${settled.length} frames without it`)
    const handle = settled.filter((f) => f.handle)
    check(`${step}: no block handle beside the empty line`, handle.length === 0, `${handle.length} frames`)
    if (step === 'cmdk') {
      const cut = settled.filter((f) => f.palette && f.palette[1] > f.h + 0.5)
      const outside = settled.filter((f) => f.dimOut)
      check('cmdk: the dim lies over the card only, never the clear room round it', outside.length === 0, `${outside.length} frames`)
      check('cmdk: the palette is never cut off at the window\'s foot', cut.length === 0, `${cut.length} frames, e.g. ${JSON.stringify(cut[0] ?? null)}`)
    }
    console.log(`  ${step}: ${taken} pictures, ${settled.length} frames read`)
  }
  await page.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
