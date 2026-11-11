// The Calendar under the fingers (11 Nov): the month's run of weeks lands on a week firmly and soon after the fingers
// lift, and a pinch between Month, Week and Day never stretches what it shows.
// The wheel is the page's real input (Playwright's mouse.wheel), sent as a trackpad does: the fingers touch ("began",
// the Mac's word, as main passes it on), steps a frame apart, they lift ("ended"), then the glide's steps, each
// shorter than the last. Every frame the run's place and the level's transform are written down, and it fails on:
//   (a) a frame where the level, or what swelled under a pinch, is scaled more one way across than the other,
//   (b) more than SETTLE ms from the lift (or from the glide slowing under five weeks a second) to rest on a week,
//   (c) a frame over LONG ms while it lands (the load average is printed beside it),
//   (d) the run passing its week and coming back, or being moved again once it has landed.
// FRAMES=dir writes a picture every 16 to 50ms through each one.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-snap.mjs
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
const SETTLE = 300
const LONG = 20
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go } = c
let ok = true
const load = () => os.loadavg()[0].toFixed(1)
const check = (name, pass, detail = '') => { ok &&= !!pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.FRAMES
if (dir) mkdirSync(dir, { recursive: true })
let shot = 0
const film = async (name, ms, every = 40) => { if (!dir) return wait(ms); const until = Date.now() + ms; while (Date.now() < until) { await h.screenshot({ path: `${dir}/${name}-${String(shot++).padStart(3, '0')}.png` }); await wait(every) } }
const phase = (kind) => h.evaluate((kind) => window.dispatchEvent(new CustomEvent('haligtree:swipe-phase', { detail: kind })), kind)
const mode = () => h.evaluate(() => document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode'))
// Every frame: when, how long it took, where the run is, and the level's and any swollen part's scale each way.
const record = () => h.evaluate(() => {
  window.__rec = []
  window.__recOn = true
  let last = performance.now()
  const scaleOf = (el) => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return [Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)] }
  const tick = (now) => {
    if (!window.__recOn) return
    const run = document.querySelector('[data-month-run]')
    const level = document.querySelector('[data-cal-level]')
    const swollen = document.querySelector('[data-cal-level] [style*="scale("], [data-cal-level][style*="scale("]')
    window.__rec.push({ t: now, dt: now - last, top: run ? run.scrollTop : null, level: level ? scaleOf(level) : null, opacity: level ? Number(getComputedStyle(level).opacity) : 1, swell: swollen ? scaleOf(swollen) : null, mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode') })
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const stop = () => h.evaluate(() => { window.__recOn = false; return window.__rec })
const mark = () => h.evaluate(() => performance.now())
const row = () => h.evaluate(() => document.querySelector('[data-month-run] [data-month-week]').offsetHeight + 1)
// From `from` (the page's clock) on: when the run last moved, where it rests, the longest frame, and how far past its rest it went.
const landing = (rec, from, size) => {
  const after = rec.filter((one) => one.t >= from && one.top !== null)
  const rest = after[after.length - 1].top
  let still = after.length - 1
  while (still > 0 && Math.abs(after[still - 1].top - rest) < 0.5) still--
  const way = Math.sign(rest - after[0].top)
  const past = Math.max(0, ...after.map((one) => (one.top - rest) * way))
  // Coming back after reaching the rest, or turning round on the way: both read as a wobble.
  let turns = 0
  for (let i = 2; i <= still; i++) if (Math.sign(after[i].top - after[i - 1].top) * Math.sign(after[i - 1].top - after[i - 2].top) < 0) turns++
  return { ms: Math.round(after[still].t - from), rest, onWeek: Math.abs(rest / size - Math.round(rest / size)) * size < 0.5, past: Math.round(past * 10) / 10, turns, long: Math.round(Math.max(...after.slice(0, still + 1).map((one) => one.dt)) * 10) / 10, moved: Math.abs(rest - after[0].top) }
}

try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('vigil.calendar.mode', 'month'))
  await go('calendar'); await wait(1500)
  const size = await row()
  const box = await h.evaluate(() => { const r = document.querySelector('[data-month-run]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(box.x, box.y)

  // 1. The fingers move the run two fifths of a week and lift, with no glide.
  for (const round of [1, 2]) {
    await record()
    await phase('began')
    for (let i = 0; i < 8; i++) { await h.mouse.wheel(0, Math.round((size * 0.4) / 8)); await wait(16) }
    await wait(60)
    const lifted = await mark()
    await phase('ended')
    await film(`slow-${round}`, 1300)
    const got = landing(await stop(), lifted, size)
    check(`slow lift ${round}: the run rests on a week within ${SETTLE}ms of the lift`, got.onWeek && got.ms <= SETTLE, `${got.ms}ms, load ${load()}`)
    check(`slow lift ${round}: it never passes its week nor turns round`, got.past <= 0.5 && got.turns === 0, `${got.past}px past, ${got.turns} turns`)
    check(`slow lift ${round}: no frame over ${LONG}ms while it lands`, got.long <= LONG, `longest ${got.long}ms, load ${load()}`)
  }

  // 2. A flick: the fingers lift fast and the trackpad glides on, each step shorter than the last.
  for (const round of [1, 2]) {
    await record()
    await phase('began')
    for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, 30); await wait(8) }
    await phase('ended')
    let slowed = 0
    let step = 30
    while (step >= 1) {
      await h.mouse.wheel(0, Math.round(step)); await wait(16)
      // Five weeks a second, in steps 16ms apart.
      if (!slowed && (step / 16) * 1000 < size * 5) slowed = await mark()
      step *= 0.93
    }
    const glideOver = await mark()
    await film(`flick-${round}`, 1200)
    const rec = await stop()
    const got = landing(rec, slowed, size)
    check(`flick ${round}: the run rests on a week within ${SETTLE}ms of the glide slowing`, got.onWeek && got.ms <= SETTLE, `${got.ms}ms, glide ran on ${Math.round(glideOver - slowed)}ms, load ${load()}`)
    check(`flick ${round}: it never passes its week nor turns round`, got.past <= 0.5 && got.turns === 0, `${got.past}px past, ${got.turns} turns`)
    check(`flick ${round}: no frame over ${LONG}ms while it lands`, got.long <= LONG, `longest ${got.long}ms, load ${load()}`)
    check(`flick ${round}: the glide's last steps do not move it again`, new Set(rec.filter((one) => one.t > slowed + got.ms + 20).map((one) => Math.round(one.top))).size === 1)
  }

  // 3. Fingers back on while it lands: the run is theirs again at once.
  {
    await phase('began')
    for (let i = 0; i < 8; i++) { await h.mouse.wheel(0, Math.round((size * 0.45) / 8)); await wait(16) }
    await phase('ended')
    await wait(50)
    const mid = await h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
    await phase('began')
    for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, 20); await wait(16) }
    const caught = await h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
    check('a new touch while it lands takes the run back', caught - mid > 60, `${Math.round(mid)} -> ${Math.round(caught)} after 120px of fingers`)
    await phase('ended'); await wait(900)
    const end = await h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
    check('and it lands on a week after that', Math.abs(end / size - Math.round(end / size)) * size < 0.5, `${end}`)
  }

  // 4. A mouse wheel (no word from the Mac, notches far apart) still goes its whole way.
  {
    const from = await h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
    for (let i = 0; i < 4; i++) { await h.mouse.wheel(0, size); await wait(160) }
    await wait(900)
    const end = await h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
    check('four notches of a mouse wheel go four weeks', Math.round((end - from) / size) === 4 && Math.abs(end / size - Math.round(end / size)) * size < 0.5, `${(end - from) / size} weeks`)
  }

  // 5. With Motion off it is simply there.
  {
    await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
    await record()
    await phase('began')
    for (let i = 0; i < 8; i++) { await h.mouse.wheel(0, Math.round((size * 0.4) / 8)); await wait(16) }
    await wait(60)
    const lifted = await mark()
    await phase('ended'); await wait(500)
    const got = landing(await stop(), lifted, size)
    check('Motion off: on its week within three frames of the lift, no glide', got.onWeek && got.ms <= 50, `${got.ms}ms`)
    await h.evaluate(() => delete document.documentElement.dataset.motion)
  }

  // 6. A pinch between the levels: what is shown keeps its shape in every frame.
  const pinch = (x, y, dy, n = 7) => h.evaluate(([x, y, dy, n]) => new Promise((res) => { let i = 0; const send = () => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); const tick = () => { send(); if (++i < n) setTimeout(tick, 12); else res() }; tick() }), [x, y, dy, n])
  const shape = (rec, name) => {
    const all = rec.flatMap((one) => [one.level, one.swell].filter(Boolean))
    const worst = Math.max(0, ...all.map(([x, y]) => Math.abs(x / y - 1)))
    const scaled = all.filter(([x]) => Math.abs(x - 1) > 0.002).length
    check(`${name}: nothing is scaled more one way than the other in any frame`, worst < 0.002, `worst ${(worst * 100).toFixed(1)}% out of shape over ${rec.length} frames`)
    check(`${name}: it does move (frames with a scale)`, scaled > 0, `${scaled} frames`)
    const changed = rec.findIndex((one, i) => i && one.mode !== rec[i - 1].mode)
    if (changed > 0) {
      let last = rec.length - 1
      while (last > changed && Math.abs(rec[last].level[0] - 1) < 0.002 && rec[last].opacity > 0.995) last--
      const ms = Math.round(rec[Math.min(rec.length - 1, last + 1)].t - rec[changed].t)
      check(`${name}: the new level is at rest within 260ms of the change`, ms <= 260, `${ms}ms, load ${load()}`)
    }
  }
  const week = await h.evaluate(() => { const r = [...document.querySelectorAll('[data-month-run] [data-month-week]')].find((one) => one.getBoundingClientRect().top > document.querySelector('[data-month-run]').getBoundingClientRect().top + 150).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(week.x, week.y)
  await wait(400)
  for (const [name, at, dy, want] of [['pinch out, month to week', week, -6, 'week'], ['pinch out, week to day', null, -6, 'day'], ['pinch in, day to week', null, 6, 'week'], ['pinch in, week to month', null, 6, 'month']]) {
    const spot = at ?? await h.evaluate(() => { const r = document.querySelectorAll('[data-cal-col]')[Math.min(3, document.querySelectorAll('[data-cal-col]').length - 1)].getBoundingClientRect(); const p = document.querySelector('[data-cal-level]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: p.top + p.height / 2 } })
    await record()
    const sent = pinch(spot.x, spot.y, dy)
    await film(name.replace(/\W+/g, '-'), 800, 16)
    await sent
    const rec = await stop()
    check(`${name}: the level changed`, (await mode()) === want, await mode())
    shape(rec, name)
    await wait(400)
  }
  // 7. A pinch short of the change: what swelled goes back soon after the fingers stop.
  {
    await record()
    const t0 = await mark()
    await pinch(week.x, week.y, -3, 3)
    const stopped = await mark()
    await film('short-pinch', 700, 16)
    const rec = await stop()
    const swollen = rec.filter((one) => one.t >= t0 && one.swell)
    const back = swollen.length ? Math.round(swollen[swollen.length - 1].t - stopped) : -1
    check('a short pinch swells the week under it, in proportion', swollen.length > 0 && swollen.every((one) => Math.abs(one.swell[0] / one.swell[1] - 1) < 0.002) && (await mode()) === 'month', `${swollen.length} frames swollen`)
    check('and it is back within 340ms of the fingers stopping (80 to know they stopped, 260 to land)', back >= 0 && back <= 340, `${back}ms, load ${load()}`)
  }
  // 8. The arrows and the keys, to compare: ← → and the header's arrows.
  {
    const title = () => h.evaluate(() => document.querySelector('[data-cal-title] span:last-child')?.textContent ?? '')
    const before = await title()
    await h.keyboard.press('ArrowRight'); await wait(120)
    const top = await h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
    check('→ is there at once, on a week', (await title()) !== before && Math.abs(top / size - Math.round(top / size)) * size < 0.5, `${before} -> ${await title()}`)
    await h.keyboard.press('ArrowLeft'); await wait(300)
  }
} catch (error) {
  ok = false
  console.log('FAIL  the probe itself', error)
}
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(ok ? `all passed (load ${load()})` : `some failed (load ${load()})`)
await c.close(); process.exit(ok ? 0 : 1)
