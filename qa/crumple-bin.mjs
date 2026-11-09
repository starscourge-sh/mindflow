// Moved to the Bin by a click: the row crumples like paper (React Bits' PaperCrumple)
// and flies to the sidebar's Bin; the note is in the Bin and Undo brings it back.
// By a key (⌘⌫) nothing crumples, and with Motion off nothing crumples either.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/crumple-bin.mjs
// QA_FRAMES=<folder> keeps a frame every 50ms through the first move.
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: Number(process.env.QA_W ?? 1400), height: Number(process.env.QA_H ?? 900) })
if (process.env.QA_DARK) await c.theme?.('dark')
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const frames = process.env.QA_FRAMES
if (frames) mkdirSync(frames, { recursive: true })

// Watches for the paper: whether it came, how long it stayed, and where it last was.
const watch = () => h.evaluate(() => {
  const seen = (window.qaCrumple = { came: false, at: 0, gone: 0, last: null, ready: false, click: 0, longest: 0 })
  addEventListener('click', () => void (seen.click ||= performance.now()), { capture: true, once: true })
  addEventListener('keydown', () => void (seen.click ||= performance.now()), { capture: true, once: true })
  // With no paper (a key), the watch ends 1.2s after the key.
  setTimeout(() => void (!seen.came && seen.click && (seen.gone = seen.click + 1200)), 3000)
  // The longest task on the page's thread from the click till the paper is gone.
  new PerformanceObserver((list) => { for (const one of list.getEntries()) if (seen.click && !seen.gone) seen.longest = Math.max(seen.longest, Math.round(one.duration)) }).observe({ type: 'longtask' })
  const tick = () => {
    const stage = document.querySelector('[data-paper-stage]')
    const paper = document.querySelector('[data-crumple]') ?? (stage?.style.visibility === 'visible' ? stage : null)
    if (paper) {
      if (!seen.came) (seen.came = true, (seen.at = performance.now()))
      // The stage is the whole window, still: where the paper is, the scene says (its middle, in the window).
      if (paper === stage) {
        const [x, y] = (stage.dataset.at ?? '0,0').split(',').map(Number)
        seen.last = { x: x - 1, y: y - 1, width: 2, height: 2 }
      } else seen.last = paper.getBoundingClientRect().toJSON()
      if (!seen.ready && stage?.style.visibility === 'visible') seen.ready = performance.now() - seen.at
    } else if (seen.came && !seen.gone) seen.gone = performance.now()
    if (!seen.gone) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const seen = () => h.evaluate(() => window.qaCrumple)
// The Bin at the sidebar's foot (or its row, with it shown in the list).
const binRow = () => h.evaluate(() => [...document.querySelectorAll('[data-home~="bin"]')].find((el) => el.offsetParent)?.getBoundingClientRect().toJSON() ?? null)
const titleOf = (row) => row.evaluate((el) => el.getAttribute('data-id'))
const inList = (id) => h.evaluate((id) => !!document.querySelector(`[data-id="${CSS.escape(id)}"]`), id)
const byMenu = async (row) => {
  await row.click({ button: 'right' }); await wait(500)
  await h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click()
}

let cdp = null

// QA_PROFILE: the sampling profile since the last start, by function (self and inclusive ms), then started again.
async function profiled(print = true) {
  if (!cdp) return
  const { profile } = await cdp.send('Profiler.stop')
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const [self, whole] = [new Map(), new Map()]
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`
  profile.samples.forEach((sid, i) => {
    const us = profile.timeDeltas[i] ?? 0
    self.set(key(byId.get(sid)), (self.get(key(byId.get(sid))) ?? 0) + us)
    const once = new Set()
    for (let cur = sid; cur; cur = parent.get(cur)) { const k = key(byId.get(cur)); if (!once.has(k)) (once.add(k), whole.set(k, (whole.get(k) ?? 0) + us)) }
  })
  if (!print) return cdp.send('Profiler.start')
  console.log('-- self ms'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(Math.round(v / 1000), k))
  console.log('-- inclusive ms'); [...whole].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.QA_PROFILE)).forEach(([k, v]) => console.log(Math.round(v / 1000), k))
  await cdp.send('Profiler.start')
}

try {
  await go('articles'); await wait(1500)
  // The app idle a while first, as it is before anyone deletes: three.js loads and the paper's folds are worked out.
  await wait(5000)
  const bin = await binRow()
  check('the sidebar Bin row is a landing place', !!bin, JSON.stringify(bin))

  // 1. A click: it crumples, flies to the Bin, is in the Bin, and Undo brings it back.
  let row = h.locator('[data-id]').first()
  let id = await titleOf(row)
  await watch()
  // QA_SHAKE: the window as it was before the menu, so the ball can be told from what is behind it.
  const box0 = await row.evaluate((el) => el.getBoundingClientRect().toJSON())
  await row.click({ button: 'right' }); await wait(500)
  const menuBox = await h.getByRole('menu').first().evaluate((el) => el.getBoundingClientRect().toJSON()).catch(() => null)
  // QA_PROFILE: where the page's thread spends the move (the CDP sampling profiler), by function.
  cdp = process.env.QA_PROFILE ? await h.context().newCDPSession(h) : null
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start') }
  const t0 = Date.now()
  const clicked = h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click()
  // Filmed from inside the page (the window's own capturePage), a frame every 50ms: page.screenshot is too slow for it.
  const every = Number(process.env.QA_EVERY ?? 50)
  const film = frames || process.env.QA_SHAKE ? h.evaluate(async ({ every, keep, flightAt }) => {
    window.qaFlightAt = flightAt
    const shots = []
    const t0 = performance.now()
    while (performance.now() - t0 < 1500) {
      const at = performance.now() - t0
      const png = await window.api.pictureOfRect({ x: 0, y: 0, width: innerWidth, height: innerHeight })
      if (png) shots.push({ at: Math.round(at), png: keep ? btoa(Array.from(png, (b) => String.fromCharCode(b)).join('')) : png })
      await new Promise((go) => setTimeout(go, Math.max(0, every * (shots.length) - (performance.now() - t0))))
    }
    if (keep) return shots
    // QA_SHAKE: the ball told from the window as it was (outside the row and the menu): its middle, its size,
    // and how much its own picture changes from one frame to the next once scaled to one size.
    const pixels = async (png) => {
      const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }))
      const pen = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true })
      pen.drawImage(bmp, 0, 0)
      return pen.getImageData(0, 0, bmp.width, bmp.height)
    }
    // What is behind the flight: the last frame before it (the ball still on its row, which is left out).
    const still = shots.filter((one) => one.at <= Number(window.qaFlightAt)).at(-1)
    const back = await pixels(still.png)
    const k = back.width / innerWidth
    const out = []
    for (const shot of shots.filter((one) => one.at > still.at)) {
      const img = await pixels(shot.png)
      if (img.width !== back.width) { out.skipped = `${img.width} vs ${back.width}`; continue }
      const xs = [], ys = []
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const [px, py] = [x / k, y / k]
        if (px >= qaSkip.row.x - 4 && px <= qaSkip.row.x + qaSkip.row.width + 4 && py >= qaSkip.row.y - 70 && py <= qaSkip.row.y + qaSkip.row.height + 70) continue
        if (qaSkip.menu && px >= qaSkip.menu.x - 4 && px <= qaSkip.menu.x + qaSkip.menu.width + 4 && py >= qaSkip.menu.y - 4 && py <= qaSkip.menu.y + qaSkip.menu.height + 4) continue
        const i = (y * img.width + x) * 4
        if (Math.abs(img.data[i] - back.data[i]) + Math.abs(img.data[i + 1] - back.data[i + 1]) + Math.abs(img.data[i + 2] - back.data[i + 2]) < 60) continue
        xs.push(x); ys.push(y)
      }
      if (xs.length < 40) continue
      // The ball: the changed pixels near the middle of them all (a toast or a hover far off left out).
      const mid = (list) => [...list].sort((a, b) => a - b)[list.length >> 1]
      const [mx, my] = [mid(xs), mid(ys)]
      let [n, sx, sy, x0, y0, x1, y1] = [0, 0, 0, 1e9, 1e9, -1, -1]
      xs.forEach((x, j) => {
        const y = ys[j]
        if (Math.abs(x - mx) > 90 * k || Math.abs(y - my) > 90 * k) return
        n++; sx += x; sy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
      })
      if (n < 40) continue
      // Its picture at 24 x 24, read from the frame.
      const S = 24, crop = new Float32Array(S * S)
      for (let j = 0; j < S; j++) for (let i2 = 0; i2 < S; i2++) {
        const x = Math.round(x0 + ((i2 + 0.5) * (x1 - x0 + 1)) / S), y = Math.round(y0 + ((j + 0.5) * (y1 - y0 + 1)) / S)
        const i = (Math.min(y, img.height - 1) * img.width + Math.min(x, img.width - 1)) * 4
        crop[j * S + i2] = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
      }
      out.push({ at: shot.at, cx: sx / n / k, cy: sy / n / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k, n, crop })
    }
    // Change in its own picture between frames (0 to 255), and how far its size and middle stray from a smooth line.
    // In flight only (the Bin's own nod after it lands is left out), and the shimmer read where the ball barely
    // changes size (the slow end of the flight): there any change in its picture is the ball itself flickering.
    const flying = out.filter((one) => one.n > 300)
    const calm = flying.slice(1).map((one, i) => [one, flying[i]]).filter(([a, b]) => Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2)
      .map(([a, b]) => a.crop.reduce((sum, v, j) => sum + Math.abs(v - b.crop[j]), 0) / a.crop.length)
    const steps = out.slice(1).map((one, i) => one.crop.reduce((sum, v, j) => sum + Math.abs(v - out[i].crop[j]), 0) / one.crop.length)
    const wobble = (key) => out.slice(1, -1).map((one, i) => Math.abs(one[key] - (out[i][key] + out[i + 2][key]) / 2))
    const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
    return { shots: shots.length, skipped: out.skipped, small: out.small, calmSteps: calm.map((one) => one.toFixed(1)), frames: out.length, gaps: out.slice(1).map((one, i) => one.at - out[i].at), picture: avg(steps).toFixed(1), pictureMax: Math.max(0, ...steps).toFixed(1), size: avg([...wobble('w'), ...wobble('h')]).toFixed(2), middle: avg([...wobble('cx'), ...wobble('cy')]).toFixed(2), rows: out.map((one) => `${one.at}ms ${one.cx.toFixed(1)},${one.cy.toFixed(1)} ${one.w.toFixed(1)}x${one.h.toFixed(1)} n${one.n}`) }
  }, { every, keep: !!frames, flightAt: Number(process.env.QA_FLIGHT_AT ?? 900) }) : null
  if (process.env.QA_SHAKE) await h.evaluate((skip) => (window.qaSkip = skip), { row: box0, menu: menuBox })
  const filmed = await film
  if (process.env.QA_SHAKE) console.log('shake', JSON.stringify(filmed, null, 1))
  else for (const [n, shot] of (filmed ?? []).entries()) writeFileSync(`${frames}/f${String(n).padStart(2, '0')}-${shot.at}ms.png`, Buffer.from(shot.png, 'base64'))
  await clicked; await wait(1200)
  await profiled()
  let s = await seen()
  // Where the time goes: the paper's own marks (paper-crumple.tsx), the warm-up's and this move's.
  const parts = await h.evaluate(() => performance.getEntriesByType('measure').filter((one) => one.name.startsWith('paper:')).map((one) => `${one.name.slice(6)} ${Math.round(one.startTime)} ${one.duration.toFixed(1)}ms`))
  console.log(['click at ' + Math.round(s.click), ...parts.filter((one) => !/^(deform|render|frame) /.test(one) || Number(one.split(' ').at(-1).replace('ms', '')) > 4)].join('\n'))
  console.log(`frames drawn ${parts.filter((one) => one.startsWith('frame')).length}, longest ${Math.max(0, ...parts.filter((one) => one.startsWith('frame')).map((one) => Number(one.split(' ').at(-1).replace('ms', ''))))}ms`)
  check('click: the paper crumpled (React Bits paper drawn)', s.came && s.ready, JSON.stringify(s))
  // The menu blinks its choice first (menu-blink.ts, about 150ms, as macOS does); the move starts as it runs.
  check('click: a copy of the row stands in its place in the frame the move starts (no empty slot)', s.came, `${Math.round(s.at - s.click)}ms click to move (the menu's blink)`)
  check('click: 3D paper drawn under 100ms after the move starts', s.ready < 100, `${Math.round(s.ready)}ms move to paper`)
  // Slowed on the user's word ("runs too quickly"): 650ms crumpling, 450ms flying.
  check('click: landed on the Bin within 1.3s of the move starting', s.gone - s.at < 1300, `${Math.round(s.gone - s.at)}ms move to landed, ${Math.round(s.gone - s.click)}ms click to landed`)
  check('click: no long task over 50ms during the move', s.longest <= 50, `longest task ${s.longest}ms`)
  const near = s.last && bin && Math.abs(s.last.x + s.last.width / 2 - (bin.x + bin.width / 2)) < 60 && Math.abs(s.last.y + s.last.height / 2 - (bin.y + bin.height / 2)) < 40
  check('click: it ends on the sidebar Bin', !!near, JSON.stringify({ last: s.last, bin }))
  check('click: the row left the list', !(await inList(id)))
  const toast = h.getByText(/^Moved to the Bin/).first()
  check('click: "Moved to the Bin" is said', await toast.isVisible().catch(() => false))
  await h.getByRole('button', { name: /^Undo/ }).first().click(); await wait(1500)
  check('Undo: the note is back in the list', await inList(id))
  await go('discarded'); await wait(1200)
  check('Undo: the note is not in the Bin', !(await inList(id)))

  // 2. Moved again, then looked for in the Bin.
  await go('articles'); await wait(1200)
  row = h.locator('[data-id]').first(); id = await titleOf(row)
  await byMenu(row); await wait(1500)
  await go('discarded'); await wait(1200)
  check('click: the note is in the Bin', await inList(id))

  // 3. By a key, nothing crumples.
  await go('articles'); await wait(1200)
  row = h.locator('[data-id]').first(); id = await titleOf(row)
  await row.click(); await wait(800)
  await watch()
  await profiled(false)
  await h.keyboard.press('Meta+Backspace'); await wait(1400)
  if (cdp) console.log('== ⌘⌫ profile'), await profiled()
  s = await seen()
  check('⌘⌫: nothing crumples', !s.came)
  console.log(`⌘⌫ (no paper, the app's own work): longest task ${s.longest}ms`)
  check('⌘⌫: still goes to the Bin', !(await inList(id)))

  // 4. Motion off: nothing crumples.
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  row = h.locator('[data-id]').first(); id = await titleOf(row)
  await watch()
  await byMenu(row); await wait(1400)
  s = await seen()
  check('Motion off: nothing crumples', !s.came)
  check('Motion off: still goes to the Bin', !(await inList(id)))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
