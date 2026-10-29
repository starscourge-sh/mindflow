// The welcome's "Name it" book: it stands up from lying back and goes a touch past its pose before settling (a
// spring with a little give), and while the pointer moves about the page (not on the book) it turns a few degrees
// toward it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-book-motion.mjs
import { sandbox } from './sandbox-lib.mjs'
let failed = 0
const check = (name, ok, more = '') => (ok || failed++, console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`))
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h } = c
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
// The book's turn (rotateY) in degrees, read from its matrix.
const turn = () => h.evaluate(() => {
  const el = document.querySelector('[data-reader-hold] [style*="preserve-3d"], [data-reader-hold] .\\[transform-style\\:preserve-3d\\]')
  if (!el) return null
  const y = /rotateY\((-?[\d.]+)deg\)/.exec(el.style.transform)
  return y ? Math.round(Number(y[1]) * 10) / 10 : null
})
try {
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await h.click('[data-skip-intro]').catch(() => {})
  await h.waitForTimeout(1500)
  for (let i = 0; i < 40 && !(await chapter()).includes('Make it yours'); i++) {
    for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await h.waitForTimeout(150))
    // Catch waits for a try in quick capture; its own skip moves on.
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.keyboard.press('Enter')
    await h.waitForTimeout(900)
  }
  for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await h.waitForTimeout(150))
  await h.mouse.move(700, 880)
  // Sampled each frame as it stands up.
  await h.evaluate(() => {
    window.__turns = []
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector('[data-reader-hold] .\\[transform-style\\:preserve-3d\\]')
      const y = el && /rotateY\((-?[\d.]+)deg\)/.exec(el.style.transform)
      if (y) window.__turns.push(Number(y[1]))
      if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
    }
    tick()
  })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(5200)
  check('reached Name it', (await chapter()).includes('Name it'), await chapter())
  const turns = await h.evaluate(() => window.__turns)
  const end = turns.at(-1), start = turns[0]
  const past = Math.max(...turns.map((t) => (end - start) * (t - end) > 0 ? Math.abs(t - end) : 0))
  console.log('turn from', start?.toFixed(1), 'to', end?.toFixed(1), 'frames', turns.length)
  check('it stands up from turned away', Math.abs(start - end) > 15, `${start?.toFixed(1)} → ${end?.toFixed(1)}`)
  check('and goes a little past its pose before settling', past > 0.5 && past < 12, `${past.toFixed(1)}° past`)
  // Follows the pointer about the page.
  await h.mouse.move(1380, 450, { steps: 8 }); await h.waitForTimeout(900)
  const right = await turn()
  await h.mouse.move(20, 450, { steps: 8 }); await h.waitForTimeout(900)
  const left = await turn()
  check('it turns toward the pointer moving about the page', right !== null && left !== null && right - left > 6, `pointer right ${right}°, left ${left}°`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
