// How long the window stalls when a theme is chosen in Settings: a frame loop
// runs in the page, a theme tile is pointed at and clicked, and the longest
// gap between frames (and the long tasks) over the next two seconds is
// reported. Passes when no frame gap is over 200ms (it was 900 to 2,300ms
// when every element glided its colours; a crossfade's capture costs about 150).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/theme-switch-timing.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { h, go } = c
await go('settings')
await h.waitForSelector('[data-theme-tile]', { timeout: 10000 })
const tiles = await h.$$eval('[data-theme-tile]', (all) => all.map((one) => one.getAttribute('data-theme-tile')))
const watch = () => h.evaluate(() => {
  const w = window
  w.__gaps = []; w.__long = []
  let last = performance.now()
  w.__stop = false
  const loop = (now) => { w.__gaps.push(now - last); last = now; if (!w.__stop) requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  try { w.__obs?.disconnect(); w.__obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__long.push(Math.round(e.duration)) }); w.__obs.observe({ type: 'longtask' }) } catch {}
})
const read = () => h.evaluate(() => { window.__stop = true; const g = window.__gaps.slice(1); return { maxGap: Math.round(Math.max(0, ...g)), over50: g.filter((x) => x > 50).length, long: window.__long } })

const results = []
const picks = ['paper', 'midnight', 'github', 'light', tiles[tiles.length - 1]].filter((t, i, a) => tiles.includes(t) && a.indexOf(t) === i)
for (const theme of picks) {
  const tile = h.locator(`[data-theme-tile="${theme}"]`)
  await tile.scrollIntoViewIfNeeded()
  await h.mouse.move(5, 5)
  await h.waitForTimeout(400)
  await watch()
  const box = await tile.boundingBox()
  const t0 = Date.now()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 })
  const hoverMs = Date.now() - t0
  await h.waitForTimeout(300)
  const hover = await read()
  await watch()
  const t1 = Date.now()
  await h.mouse.down(); await h.mouse.up()
  // Click to the next painted frame.
  const clickToFrame = await h.evaluate((start) => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(Date.now() - start)))), t1)
  await h.waitForTimeout(2000)
  const click = await read()
  results.push({ theme, hoverMs, hover, clickToFrame, click })
}
// Each style worn over the theme: Brutal, Paper, Swiss and back to Soft.
for (const which of ['brutal', 'paper', 'swiss', 'soft']) {
  const pick = h.locator(`.mf-style-${which}`).first()
  if (!(await pick.count())) continue
  await pick.scrollIntoViewIfNeeded()
  await h.waitForTimeout(400)
  const spot = await pick.boundingBox()
  await h.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2)
  await h.waitForTimeout(300)
  await watch()
  const t1 = Date.now()
  await h.mouse.down(); await h.mouse.up()
  const clickToFrame = await h.evaluate((start) => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(Date.now() - start)))), t1)
  await h.waitForTimeout(1500)
  results.push({ theme: `style ${which}`, clickToFrame, click: await read(), hover: { maxGap: 0 } })
}
for (const r of results) console.log(JSON.stringify(r))
const worst = Math.max(...results.map((r) => Math.max(r.click.maxGap, r.hover.maxGap)))
console.log(`worst frame gap ${worst}ms`)
console.log(c.errors.length ? 'errors: ' + c.errors.join(' | ') : 'no page errors')
console.log(worst <= 200 ? 'PASS' : 'FAIL')
await c.close()
process.exit(worst <= 200 ? 0 : 1)
