// The welcome's "Name your book" book: it faces you more at rest (a slight angle only), barely follows the pointer
// about the rest of the page but turns more close by, comes forward a little past its pose as it arrives and then
// settles once with no rocking, and the whole name fits on its cover and in the field at every length up to 60.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-book-pose.mjs
//   SHOTS=<folder> films the arrival (a frame every 16ms) and saves short and long names, light and dark.
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const W = Number(process.env.QA_WIDTH ?? 1300), H = 860
const c = await sandbox({ width: W, height: H, seeded: false })
const { h, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
// The book's turn (rotateY) and lean (rotateX), in degrees.
const pose = () => h.evaluate(() => {
  const el = document.querySelector('[data-reader-hold] .\\[transform-style\\:preserve-3d\\]')
  const y = el && /rotateY\((-?[\d.]+)deg\)/.exec(el.style.transform), x = el && /rotateX\((-?[\d.]+)deg\)/.exec(el.style.transform)
  return { turn: y ? Number(y[1]) : 0, lean: x ? Number(x[1]) : 0 }
})
const book = () => h.evaluate(() => { const r = document.querySelector('[data-reader-hold]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
try {
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await h.click('[data-skip-intro]').catch(() => {})
  await wait(1500)
  for (let i = 0; i < 40 && !(await chapter()).includes('Make it yours'); i++) {
    for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await wait(150))
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.keyboard.press('Enter')
    await wait(900)
  }
  for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await wait(150))
  await h.mouse.move(W / 2, H - 10)
  await h.evaluate(() => {
    window.__poses = []
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector('[data-reader-hold] .\\[transform-style\\:preserve-3d\\]')
      const y = el && /rotateY\((-?[\d.]+)deg\)/.exec(el.style.transform), x = el && /rotateX\((-?[\d.]+)deg\)/.exec(el.style.transform)
      if (y && x) window.__poses.push([Number(y[1]), Number(x[1])])
      if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
    }
    tick()
  })
  await h.keyboard.press('Enter')
  if (shots) for (let i = 0; i < 40; i++) { await h.screenshot({ path: `${shots}/arrive-f${String(i).padStart(2, '0')}.png` }); await wait(16) }
  await wait(5200)
  check('reached Name it', (await chapter()).includes('Name it'), await chapter())
  const poses = await h.evaluate(() => window.__poses)
  const leans = poses.map(([, x]) => x), end = leans.at(-1)
  // Forward past its pose: the lean goes below where it rests (it starts lying back, far above).
  const forward = end - Math.min(...leans)
  // How many times the lean changes direction by more than a hair: once (forward, then back to rest) is a settle;
  // more is rocking.
  let turns = 0, dir = 0
  for (let i = 1; i < leans.length; i++) {
    const d = leans[i] - leans[i - 1]
    if (Math.abs(d) < 0.05) continue
    if (dir && Math.sign(d) !== dir) turns++
    dir = Math.sign(d)
  }
  check('it comes forward a little past its pose as it arrives', forward > 9 && forward < 18, `${forward.toFixed(1)}° past`)
  check('then settles once, with no rocking', turns <= 1, `${turns} changes of direction`)
  // At rest, the pointer far below it: a slight angle only.
  const rest = await pose()
  check('at rest it faces you, at a slight angle only', Math.abs(rest.turn) <= 20 && Math.abs(rest.turn) >= 6, `turned ${rest.turn.toFixed(1)}°`)
  // About the page, away from the book: hardly moves.
  const [bl, bt, bw, bh] = await book()
  await h.mouse.move(W - 10, H - 10, { steps: 8 }); await wait(900)
  const right = (await pose()).turn
  await h.mouse.move(10, H - 10, { steps: 8 }); await wait(900)
  const left = (await pose()).turn
  check('the pointer across the rest of the page barely turns it', Math.abs(right - left) <= 4, `${Math.abs(right - left).toFixed(1)}° between the far right and far left`)
  // Close by the book, just outside it on each side: it turns more.
  await h.mouse.move(bl + bw + 30, bt + bh / 2, { steps: 8 }); await wait(900)
  const nearRight = (await pose()).turn
  await h.mouse.move(bl - 30, bt + bh / 2, { steps: 8 }); await wait(900)
  const nearLeft = (await pose()).turn
  check('close by the book it turns toward the pointer', nearRight - nearLeft > 6, `${(nearRight - nearLeft).toFixed(1)}° between just right and just left`)
  // Every length of name up to the limit fits, on the cover and in the field.
  const field = '[data-welcome-book-name]'
  for (const name of ['Ink', 'The Long Commonplace Book of Small Things', 'The Very Long and Winding Commonplace Book of Everything Kept']) {
    await h.fill(field, name.slice(0, 60))
    await wait(500)
    const fit = await h.evaluate(() => {
      const cover = document.querySelector('[data-reader-name]'), input = document.querySelector('[data-welcome-book-name]')
      return { cover: cover.scrollHeight <= cover.clientHeight + 3, coverH: [cover.scrollHeight, cover.clientHeight], input: input.scrollWidth <= input.clientWidth + 1, inputW: [input.scrollWidth, input.clientWidth], value: input.value.length }
    })
    check(`a ${fit.value}-letter name fits on the cover`, fit.cover, `${fit.coverH[0]} of ${fit.coverH[1]}px high`)
    check(`a ${fit.value}-letter name fits in the field`, fit.input, `${fit.inputW[0]} of ${fit.inputW[1]}px wide`)
    if (shots) await c.both(`${shots}/name-${fit.value}`)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
}
await c.close()
done()
