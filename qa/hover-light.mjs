// The hover light in the sidebar under a real pointer, frame by frame. Run on a COPY of a book or of the seeded
// sandbox, through the timing queue:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-light.mjs
//
// The pointer is swept down the sidebar's rows at three speeds (SLOW 150, HAND 700 and FAST 3500 px a second), its
// place worked out from the real clock. Every frame records where the pointer is, where the light is and how lit,
// and how long the frame took; React's commits are counted through the sweep (its devtools hook, so in a plain
// build too; in a dev-mode build the components drawn are named). Bars: the light wholly on the row under the
// pointer within 50ms of the pointer coming onto it, never more than one row behind, no frame missed, and no React
// draw for a pointer move. Then Reduce motion and Motion off: the light is never seen between two rows.
// SHOTS=<folder> keeps frames of a hand's-pace sweep, light and dark, a dot drawn where the pointer is.
import { mkdirSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const SHOTS = process.env.SHOTS ?? null
const WITHIN = Number(process.env.WITHIN_MS ?? 50)
const load = () => `load ${loadavg()[0].toFixed(1)}`

/** Counts React's commits and the components each one drew, from before React starts. */
const COUNT_REACT = `(() => {
  if (window.__qaReact) return
  const stats = (window.__qaReact = { on: false, commits: 0, tips: 0, drawn: {} })
  const named = (f) => { const t = f.type; return typeof t === 'function' ? t.displayName || t.name || 'anonymous' : t && typeof t === 'object' ? t.displayName || t.render?.displayName || t.render?.name || t.type?.displayName || t.type?.name || null : null }
  let inCommit = 0
  let names = []
  stats.other = {}
  stats.tipAt = -Infinity
  const walk = (next, prev) => {
    const name = named(next)
    if (name && next.flags & 1) { stats.drawn[name] = (stats.drawn[name] || 0) + 1; inCommit++; names.push(name) }
    if (prev && next.child === prev.child) return
    for (let c = next.child; c; c = c.sibling) walk(c, c.alternate)
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(), supportsFiber: true, checkDCE() {},
    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
    onCommitFiberRoot(id, root) {
      if (!stats.on) return
      stats.commits++
      inCommit = 0
      names = []
      try { walk(root.current, root.current.alternate) } catch {}
      // A row's own tip or preview card coming or going is drawn by React, as any content is: a small commit while
      // one is up, or was a moment ago (the recorder looks every frame), is counted apart from the rest.
      if (document.querySelector('[role="tooltip"]')) stats.tipAt = performance.now()
      // The tip's own start and end count too: Radix marks a tip as about to open one commit before it is in the
      // page, and takes its holder away one commit after it has gone.
      const tipOnly = inCommit < 40 && (names.some((name) => /^Tooltip/.test(name)) || names.every((name) => /^(Presence|Portal|Popper|DismissableLayer|Primitive\.)/.test(name)))
      if ((performance.now() - stats.tipAt < 400 && inCommit < 200) || tipOnly) stats.tips++
      else for (const name of names) stats.other[name] = (stats.other[name] || 0) + 1
    }
  }
})()`

const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, electron, look } = c
try {
  await h.waitForTimeout(2500)
  await electron.context().addInitScript(COUNT_REACT)
  await h.reload()
  await h.waitForSelector('aside[data-chrome] [data-side-row]', { timeout: 60000 })
  await h.waitForTimeout(4000)
  const hooked = await h.evaluate(() => !!window.__qaReact && window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0)
  console.log(`React's commits can be counted: ${hooked}  (${load()})`)

  // The recorder: rows measured once a sweep (they do not move during one), the light every frame.
  await h.evaluate(() => {
    const list = document.querySelector('aside[data-chrome] [data-side-row]').closest('.isolate')
    const rec = (window.__hl = { on: false, frames: [], moves: [], rows: [], last: null })
    const hover = () => [...list.querySelectorAll('[data-glide]')].filter((el) => el.className.includes('bg-accent/60')).map((el) => ({ el, o: parseFloat(getComputedStyle(el).opacity) })).sort((a, b) => b.o - a.o)[0]
    addEventListener('mousemove', (e) => { if (rec.on) { rec.last = { x: e.clientX, y: e.clientY, t: performance.now() }; rec.moves.push(rec.last) } }, true)
    const tick = (t) => {
      if (!rec.on) return
      if (document.querySelector('[role="tooltip"]')) window.__qaReact.tipAt = performance.now()
      const light = hover()
      const r = light?.el.getBoundingClientRect()
      rec.frames.push({ t, now: performance.now(), top: r ? r.top : null, h: r ? r.height : null, o: light ? light.o : 0 })
      requestAnimationFrame(tick)
    }
    rec.start = () => {
      const box = list.getBoundingClientRect()
      rec.rows = [...list.querySelectorAll('[data-side-row]')].filter((r) => !r.closest('[inert]')).map((r) => r.getBoundingClientRect()).filter((r) => r.height > 0 && r.top >= box.top && r.bottom <= box.bottom).map((r) => ({ top: r.top, h: r.height, x: r.left + r.width / 2 })).sort((a, b) => a.top - b.top)
      rec.frames = []
      rec.moves = []
      rec.on = true
      window.__qaReact.commits = 0
      window.__qaReact.tips = 0
      window.__qaReact.other = {}
      window.__qaReact.drawn = {}
      window.__qaReact.on = true
      requestAnimationFrame(tick)
      return rec.rows
    }
    rec.stop = () => { rec.on = false; window.__qaReact.on = false; return { frames: rec.frames, moves: rec.moves, rows: rec.rows, commits: window.__qaReact.commits, tips: window.__qaReact.tips, drawn: window.__qaReact.drawn, other: window.__qaReact.other } }
  })

  /**
   * One sweep down the rows at `speed` px a second, `times` there and back; what every frame saw. The pointer
   * comes in from outside and never rests on a row, so no row's preview card opens (they wait 600ms, and for 900ms
   * after one has shown the next opens at once): this measures the light alone. `warm` rests on the first row
   * until its preview is up, so every row crossed swaps a preview in as well.
   */
  async function sweep(speed, times = 1, warm = false) {
    const rows = await h.evaluate(() => window.__hl.start())
    await h.evaluate(() => (window.__hl.on = false))
    const x = rows[0].x
    const from = rows[0].top + rows[0].h / 2
    const to = rows[rows.length - 1].top + rows[rows.length - 1].h / 2
    await h.mouse.move(x + 400, from)
    await h.waitForTimeout(1100)
    if (warm) { await h.mouse.move(x, from); await h.waitForTimeout(900) }
    await h.evaluate(() => void window.__hl.start())
    await h.mouse.move(x, from)
    for (let pass = 0; pass < times; pass++) {
      const [a, b] = pass % 2 ? [to, from] : [from, to]
      const began = performance.now()
      const whole = (Math.abs(b - a) / speed) * 1000
      for (;;) {
        const p = Math.min(1, (performance.now() - began) / whole)
        await h.mouse.move(x, a + (b - a) * p)
        if (p >= 1) break
      }
    }
    await h.waitForTimeout(150)
    const seen = await h.evaluate(() => window.__hl.stop())
    await h.mouse.move(x + 400, from)
    await h.waitForTimeout(200)
    return seen
  }

  /** What a sweep's frames say: how soon the light was wholly on each row, how far behind it fell, the frames missed. */
  function read({ frames, moves, rows, commits, tips, drawn, other }) {
    const rowAt = (y) => { let best = 0; rows.forEach((r, i) => { if (Math.abs(y - r.top - r.h / 2) < Math.abs(y - rows[best].top - rows[best].h / 2)) best = i }); return best }
    // Each time the pointer came onto a row, and how long it stayed.
    const visits = []
    for (const m of moves) {
      const row = rowAt(m.y)
      const last = visits[visits.length - 1]
      if (last && last.row === row) last.left = m.t
      else visits.push({ row, came: m.t, left: m.t })
    }
    visits.forEach((v, i) => (v.until = visits[i + 1]?.came ?? Infinity))
    const arrivals = []
    for (const v of visits) {
      const r = rows[v.row]
      const on = frames.find((f) => f.now >= v.came && f.now < v.until + 80 && f.top !== null && Math.abs(f.top - r.top) <= 1 && Math.abs(f.h - r.h) <= 1 && f.o >= 0.99)
      arrivals.push({ row: v.row, stayed: v.until - v.came, ms: on ? on.now - v.came : null })
    }
    let behind = 0
    let between = 0
    for (const f of frames) {
      if (f.top === null || f.o < 0.05) continue
      const m = [...moves].reverse().find((one) => one.t <= f.now)
      if (!m) continue
      const lightRow = rowAt(f.top + f.h / 2)
      behind = Math.max(behind, Math.abs(rowAt(m.y) - lightRow))
      if (!rows.some((r) => Math.abs(r.top - f.top) <= 1)) between++
    }
    const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t)
    const sorted = [...gaps].sort((a, b) => a - b)
    return {
      frames: frames.length, worst: Math.max(0, ...gaps), p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, missed: gaps.filter((g) => g > 25).length,
      crossed: visits.length - 1, arrivals, behind, between, commits, tips,
      other: Object.entries(other).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => `${name} x${n}`).join(', '),
      drawn: Object.entries(drawn).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => `${name} x${n}`).join(', ')
    }
  }
  const ms = (n) => (n === null || n === undefined ? 'never' : `${Math.round(n)}ms`)

  const speeds = [['slow', 150, 1], ['hand', 700, 2], ['fast', 3500, 6]]
  let commitsInAll = 0
  for (const [name, speed, times] of speeds) {
    const seen = read(await sweep(speed, times))
    const stayed = seen.arrivals.filter((a) => a.stayed >= WITHIN + 20)
    const late = stayed.filter((a) => a.ms === null || a.ms > WITHIN)
    const times_ = stayed.map((a) => a.ms ?? Infinity).sort((a, b) => a - b)
    commitsInAll += seen.commits
    console.log(`${name} (${speed} px/s): ${seen.frames} frames, worst frame ${seen.worst.toFixed(1)}ms, 95th ${seen.p95.toFixed(1)}ms, ${seen.missed} missed; ${seen.crossed} rows crossed, ${stayed.length} stayed on; light wholly on: median ${ms(times_[Math.floor(times_.length / 2)])}, worst ${ms(times_[times_.length - 1])}; most rows behind ${seen.behind}; React commits ${seen.commits}, ${seen.tips} of them a row's tip or preview card${seen.drawn ? ` (${seen.drawn})` : ''}  (${load()})`)
    if (name !== 'fast') check(`${name}: the light is wholly on each row the pointer stays on within ${WITHIN}ms`, stayed.length > 0 && late.length === 0, `${late.length} of ${stayed.length} late: ${late.slice(0, 6).map((a) => `row ${a.row} ${ms(a.ms)}`).join(', ')}`)
    if (name !== 'slow') check(`${name}: the light is never more than one row behind the pointer`, seen.behind <= 1, `${seen.behind} rows behind at worst`)
    check(`${name}: no frame of the sweep is missed`, seen.missed === 0, `${seen.missed} frames over 25ms, worst ${seen.worst.toFixed(1)}ms`)
    check(`${name}: a pointer move draws nothing in React (a row's own tip or preview card apart)`, seen.commits - seen.tips === 0, `${seen.commits - seen.tips} commits besides ${seen.tips} for tips, over ${seen.crossed} rows crossed: ${seen.other}`)
  }

  // Reduce motion, then the app's own Motion switch: the light goes from row to row and is never seen between two.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.waitForTimeout(300)
  const calm = read(await sweep(300, 1))
  check('Reduce motion: the light is never seen between two rows', calm.frames > 20 && calm.between === 0, `${calm.between} of ${calm.frames} frames between rows`)
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  await c.v('settings:set', { motion: false })
  await h.waitForFunction(() => document.documentElement.dataset.motion === 'off', null, { timeout: 5000 })
  const off = read(await sweep(300, 1))
  check('Motion off: the light is never seen between two rows', off.frames > 20 && off.between === 0, `${off.between} of ${off.frames} frames between rows`)
  await c.v('settings:set', { motion: true })
  await h.waitForFunction(() => document.documentElement.dataset.motion !== 'off', null, { timeout: 5000 })

  // With the rows' preview cards up (the pointer rested on a row first): each row crossed swaps a card in, which
  // React draws. Said, not judged here: the card is content, and its cost is its own.
  const warm = read(await sweep(700, 2, true))
  console.log(`hand, previews showing: ${warm.frames} frames, worst frame ${warm.worst.toFixed(1)}ms, ${warm.missed} missed; most rows behind ${warm.behind}; React commits ${warm.commits} over ${warm.crossed} rows crossed${warm.drawn ? ` (${warm.drawn})` : ''}  (${load()})`)
  check('previews showing: the light is still never more than one row behind', warm.behind <= 1, `${warm.behind} rows behind at worst`)

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    await h.evaluate(() => {
      const dot = document.createElement('div')
      dot.style.cssText = 'position:fixed;z-index:99999;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#e11;pointer-events:none;left:0;top:0'
      document.body.append(dot)
      addEventListener('mousemove', (e) => void (dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`), true)
    })
    for (const theme of ['light', 'dark']) {
      await look(theme)
      const rows = await h.evaluate(() => window.__hl.start())
      await h.evaluate(() => void window.__hl.stop())
      const x = rows[0].x
      const from = rows[0].top + rows[0].h / 2
      const to = rows[Math.min(rows.length - 1, 9)].top + rows[Math.min(rows.length - 1, 9)].h / 2
      await h.mouse.move(x, from)
      await h.waitForTimeout(300)
      let moving = true
      const film = (async () => { for (let i = 0; moving && i < 60; i++) await h.screenshot({ path: join(SHOTS, `${theme}-${String(i).padStart(2, '0')}.png`), clip: { x: 0, y: 80, width: 260, height: 420 } }) })()
      const began = performance.now()
      const whole = ((to - from) / 700) * 1000
      for (;;) {
        const p = Math.min(1, (performance.now() - began) / whole)
        await h.mouse.move(x, from + (to - from) * p)
        if (p >= 1) break
      }
      moving = false
      await film
      await h.waitForTimeout(200)
      await h.screenshot({ path: join(SHOTS, `${theme}-rest.png`), clip: { x: 0, y: 80, width: 260, height: 420 } })
      await h.mouse.move(x + 400, from)
    }
    await look('light')
    console.log(`frames in ${SHOTS}`)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
