// The Calendar under the fingers (11 Nov): the month's run of weeks lands on a week firmly as the fingers lift, and a
// pinch between Month, Week and Day never stretches what it shows nor leaves the pane empty on the way.
// The wheel is the page's real input (Playwright's mouse.wheel), sent as a trackpad does: the fingers touch ("began",
// the Mac's word, as main passes it on), steps a frame apart, they lift ("ended"), then the glide's steps, each
// shorter than the last. Every frame the run's place and each level's scale and strength are written down.
// It runs in parts, each under a minute and a half (PART=run,pinch by default):
//   run     the run of weeks: at rest within LIFT ms of the fingers leaving (lifted from rest, or straight from moving),
//           never under fingers still on the pad, a glide that comes late turns the landing, a flick lands on a week
//           with no tail, a new touch takes the run back, a mouse wheel goes its whole way, Motion off and Reduce
//           motion land in one step, one light tap a landing, no sound, and the arrows and "Today" glide on the
//           same spring (the keys go at once).
//   pinch   the levels: nothing out of shape in any frame, never less than a whole level on show through a change,
//           never two rows of day names at once, one firm tap a change, a pinch turned round takes the level back, a
//           short pinch goes back; a pinch at a hand's pace (a tenth of a second to the line) finds its level drawn
//           and changes with no long frame at all; with Motion off the level is simply there, and with Reduce motion
//           it fades across with nothing grown or moved.
//   today   "Today" in Week and Day glides the hours to now on the calm spring; T is there at once.
//   stills  with FRAMES=dir: pictures to read by eye, light and dark: the pinch held a quarter, half and three
//           quarters of the way to the change (OPEN_AT says how far that is: 0.18 now, 0.22 on the build before),
//           each change of level held at 0, 40, 80 and 140ms, and a change turned round mid-way.
// No frame may take over LONG ms; the frame that draws a new level is timed apart and printed. QA_W and QA_H set the
// window's size (1440 by 900), SETTLE how soon a flick must rest (200ms; 250 for the development build).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-snap.mjs
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
const LIFT = 160
const SETTLE = Number(process.env.SETTLE ?? 200)
const LONG = 16
const OPEN_AT = Number(process.env.OPEN_AT ?? 0.18)
const parts = (process.env.PART ?? 'run,pinch').split(',')
const c = await sandbox({ width: Number(process.env.QA_W ?? 1440), height: Number(process.env.QA_H ?? 900), at: '11:30' })
const { h, v, go, electron } = c
let ok = true
let passed = 0
let all = 0
const load = () => os.loadavg()[0].toFixed(1)
const check = (name, pass, detail = '') => { ok &&= !!pass; all++; if (pass) passed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.FRAMES
if (dir) mkdirSync(dir, { recursive: true })
const phase = (kind) => h.evaluate((kind) => window.dispatchEvent(new CustomEvent('haligtree:swipe-phase', { detail: kind })), kind)
const mode = () => h.evaluate(() => document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode'))
const taps = async (kind) => (await electron.evaluate(() => globalThis.haligtreeTapKinds())).filter((one) => one === kind).length
const cues = () => h.evaluate(() => [...(window.haligtreeCued ?? [])])
// Every frame: when, how long it took, where the run is, and the scale each way and the strength of the level, of each
// level's picture while one gives way to the next, and of any part swollen under a pinch.
const record = () => h.evaluate(() => {
  window.__rec = []
  window.__recOn = true
  // When each wheel step was made and how far, to know the probe itself sent them as a trackpad does (never 100ms apart).
  window.__wheels = []
  window.__wheelSpy ??= (window.addEventListener('wheel', (event) => window.__wheels?.push({ t: event.timeStamp, dy: event.deltaY, pinch: event.ctrlKey }), { capture: true, passive: true }), true)
  let last = performance.now()
  const root = document.documentElement
  const scaleOf = (style) => { const m = new DOMMatrixReadOnly(style.transform); return [Math.hypot(m.a, m.b), Math.hypot(m.c, m.d), Number(style.opacity)] }
  const tick = (now) => {
    if (!window.__recOn) return
    const run = document.querySelector('[data-month-run]')
    const level = document.querySelector('[data-cal-level]')
    const swollen = document.querySelector('[data-cal-level] [style*="scale("], [data-cal-level][style*="scale("]')
    const turning = root.dataset.calZoom && document.getAnimations().some((one) => one.effect?.pseudoElement?.includes('mf-cal-level'))
    // Each level in the pane (two while one gives way to the other): how strong it is, the size of what it shows, how
    // strong its row of day names is, and whether a change is moving it.
    const layers = [...document.querySelectorAll('[data-cal-depth]')].map((layer) => {
      const body = layer.querySelector('[data-cal-body]')
      const names = layer.querySelector('[data-cal-names]')
      return { mode: layer.dataset.calDepth, role: layer.dataset.calRole, o: Number(getComputedStyle(layer).opacity), body: body ? scaleOf(getComputedStyle(body)) : null, names: names ? Number(getComputedStyle(names).opacity) : null, moving: layer.getAnimations({ subtree: true }).some((one) => one.id === 'mf-cal-level') }
    })
    const hours = document.querySelector('[data-cal-level] [data-cal-scroll]')
    window.__rec.push({
      layers, hours: hours ? hours.scrollTop : null,
      t: now, dt: now - last, top: run ? run.scrollTop : null, mode: document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode'),
      level: level ? scaleOf(getComputedStyle(level)) : null, swell: swollen ? scaleOf(getComputedStyle(swollen)) : null,
      gone: turning ? scaleOf(getComputedStyle(root, '::view-transition-old(mf-cal-level)')) : null,
      come: turning ? scaleOf(getComputedStyle(root, '::view-transition-new(mf-cal-level)')) : null
    })
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const stop = () => h.evaluate(() => { window.__recOn = false; return window.__rec })
// WHY=1: what each long frame was spent on, as the browser itself reports it (frames of 50ms and over only).
const why = async (name) => {
  if (!process.env.WHY) return
  const frames = await h.evaluate(() => { const got = window.__why ?? []; window.__why = []; return got })
  for (const one of frames) console.log(`WHY ${name}: a frame of ${Math.round(one.duration)}ms at ${Math.round(one.start)}: ${Math.round(one.work)}ms of scripts, ${Math.round(one.render)}ms drawing (style and layout ${Math.round(one.layout)}ms); ${one.scripts.map((each) => `${each.type} ${each.invoker} ${Math.round(each.duration)}ms${each.forced > 1 ? ` (${Math.round(each.forced)}ms forced layout)` : ''}`).join('; ')}`)
}
if (process.env.WHY) await h.evaluate(() => {
  window.__why = []
  new PerformanceObserver((list) => {
    for (const one of list.getEntries()) window.__why.push({ start: one.startTime, duration: one.duration, work: one.renderStart ? one.renderStart - one.startTime : one.duration, render: one.renderStart ? one.startTime + one.duration - one.renderStart : 0, layout: one.styleAndLayoutStart ? one.startTime + one.duration - one.styleAndLayoutStart : 0, scripts: one.scripts.map((each) => ({ type: each.invokerType, invoker: String(each.invoker).slice(0, 60), duration: each.duration, forced: each.forcedStyleAndLayoutDuration })) })
  }).observe({ type: 'long-animation-frame', buffered: false })
})
const wheels = () => h.evaluate(() => window.__wheels)
const mark = () => h.evaluate(() => performance.now())
const top = () => h.evaluate(() => document.querySelector('[data-month-run]').scrollTop)
const row = () => h.evaluate(() => document.querySelector('[data-month-run] [data-month-week]').offsetHeight + 1)
const onWeek = (at, size) => Math.abs(at / size - Math.round(at / size)) * size < 0.5
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
  return { ms: Math.round(after[still].t - from), rest, from: after[0].top, onWeek: onWeek(rest, size), past: Math.round(past * 10) / 10, turns, long: Math.round(Math.max(...after.slice(0, still + 1).map((one) => one.dt)) * 10) / 10, moved: Math.abs(rest - after[0].top) }
}
const landed = (name, got, within, what) => {
  check(`${name}: the run rests on a week within ${within}ms of ${what}`, got.onWeek && got.ms <= within, `${got.ms}ms, load ${load()}`)
  check(`${name}: it never passes its week nor turns round`, got.past <= 0.5 && got.turns === 0, `${got.past}px past, ${got.turns} turns`)
  check(`${name}: no frame over ${LONG}ms while it lands`, got.long <= LONG, `longest ${got.long}ms, load ${load()}`)
}
// A pinch: ctrl wheel events at the pointer, as a trackpad sends it, `gap` ms apart.
const pinch = (x, y, dy, n = 7, gap = 12) => h.evaluate(([x, y, dy, n, gap]) => new Promise((res) => { let i = 0; const send = () => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); const tick = () => { send(); if (++i < n) setTimeout(tick, gap); else res() }; tick() }), [x, y, dy, n, gap])
// A week well inside the run: the first whose top is 150px down it, or in a small window the middle one in sight.
const weekSpot = () => h.evaluate(() => { const run = document.querySelector('[data-month-run]').getBoundingClientRect(); const weeks = [...document.querySelectorAll('[data-month-run] [data-month-week]')].filter((one) => one.getBoundingClientRect().top >= run.top - 1 && one.getBoundingClientRect().bottom <= run.bottom + 1); const r = (weeks.find((one) => one.getBoundingClientRect().top > run.top + 150) ?? weeks[Math.floor(weeks.length / 2)]).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
const daySpot = () => h.evaluate(() => { const cols = document.querySelectorAll('[data-cal-col]'); const r = cols[Math.min(3, cols.length - 1)].getBoundingClientRect(); const p = document.querySelector('[data-cal-level]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: p.top + p.height / 2 } })
// The month, on today's weeks (the sandbox has tasks and events there to see).
const toMonth = async () => { await h.evaluate(() => localStorage.setItem('vigil.calendar.mode', 'month')); if ((await mode()) !== 'month') { await h.keyboard.press('m'); await wait(700) } await h.keyboard.press('t'); await wait(500) }

try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('vigil.calendar.mode', 'month'))
  await go('calendar'); await wait(1500)
  await toMonth()
  const size = await row()
  const box = await h.evaluate(() => { const r = document.querySelector('[data-month-run]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(box.x, box.y)
  const fingers = async (px, steps = 8, gap = 16) => { for (let i = 0; i < steps; i++) { await h.mouse.wheel(0, Math.round(px / steps)); await wait(gap) } }
  // Steps sent on a clock of the probe's own, as a trackpad sends them: none waits for the page to answer the one
  // before (waiting, a page busy drawing weeks, most of all the development build, spread a glide's steps over 60ms apart).
  const stream = async (steps, every) => { const sent = []; for (const dy of steps) { sent.push(h.mouse.wheel(0, dy)); await new Promise((done) => setTimeout(done, every)) } await Promise.all(sent) }
  const fading = (from) => { const steps = []; for (let step = from; step >= 1; step *= 0.93) steps.push(Math.round(step)); return steps }

  if (parts.includes('run')) {
    const quietFrom = (await cues()).length
    let late1 = 0
    // 1. The fingers move the run two fifths of a week, stop, and lift, with no glide.
    for (const round of [1, 2]) {
      await record()
      await phase('began')
      await fingers(size * 0.4)
      await wait(60)
      const light = await taps('align')
      const lifted = await mark()
      await phase('ended')
      await wait(700)
      const got = landing(await stop(), lifted, size)
      landed(`slow lift ${round}`, got, LIFT, 'the lift')
      check(`slow lift ${round}: one light tap as it lands, no more`, (await taps('align')) - light === 1, `${(await taps('align')) - light} taps`)
    }
    // 2. Lifted straight from moving, slowly, and no glide follows: two frames to know that, then the same landing.
    for (const round of [1, 2]) {
      await record()
      await phase('began')
      await fingers(size * 0.4)
      const lifted = await mark()
      await phase('ended')
      await wait(700)
      landed(`lift from moving ${round}`, landing(await stop(), lifted, size), LIFT, 'the lift')
    }
    // 3. Fingers that stop and stay on the pad: nothing lands under them, however long; it lands when they lift.
    {
      await record()
      await phase('began')
      await fingers(size * 0.4)
      const left = await top()
      await wait(500)
      const resting = await top()
      check('fingers resting on the pad: the run stays where they left it, off its week', Math.abs(resting - left) < 0.5 && !onWeek(resting, size), `${left} -> ${resting} after 500ms`)
      const lifted = await mark()
      await phase('ended')
      await wait(700)
      landed('lifted after resting', landing(await stop(), lifted, size), LIFT, 'the lift')
    }
    // 4. A glide that comes late (a busy frame held its steps back past two frames): the landing already begun turns
    // for the week the glide is heading to, and goes on from where it is.
    {
      await record()
      await phase('began')
      await stream([30, 30, 30, 30, 30, 30], 12)
      const lifted = await mark()
      await phase('ended')
      await wait(45)
      await stream(fading(60).slice(0, 12), 16)
      await wait(700)
      const rec = await stop()
      const got = landing(rec, lifted, size)
      const near = Math.round(got.from / size) * size
      // The glide's second step must reach the page while the landing is still on its way (an eighth of a second):
      // on a busy machine the probe itself is later than that, which is a glide too late to count, not this case.
      const late = (await wheels()).filter((one) => one.t > lifted)
      const kept = late.length > 1 && late[1].t - lifted < 110
      if (!kept) console.log(`(a glide come late: not judged, the probe's own steps came ${Math.round((late[1]?.t ?? 0) - lifted)}ms after the lift, load ${load()})`)
      check('a glide come late: the landing goes on to a week further that way', got.onWeek && (!kept || got.rest >= near + size - 0.5), `lifted at ${Math.round(got.from)}, nearest week ${near}, rests at ${got.rest}${kept ? '' : ', not judged'}; steps after the lift at ${late.slice(0, 5).map((one) => `${Math.round(one.t - lifted)}ms`).join(' ')}; the run at ${[0, 30, 60, 90, 120, 180, 300].map((ms) => Math.round((rec.find((one) => one.t >= lifted + ms) ?? rec[rec.length - 1]).top - got.from)).join(' ')}px`)
      late1 = kept ? 0 : 1
      // The landing begun at the lift made for the nearest week; when that was behind and the glide goes on ahead, the
      // spring turns it round once, from where it is (never more, and never past its week).
      const behind = near < got.from
      check(`a glide come late: it never passes its week, and turns ${behind ? 'once at most (its nearest week was behind it)' : 'nowhere'}`, got.past <= 0.5 && got.turns <= (behind ? 1 : 0), `${got.past}px past, ${got.turns} turns`)
      check(`a glide come late: no frame over ${LONG}ms`, got.long <= LONG, `longest ${got.long}ms, load ${load()}`)
    }
    // 5. A flick: the fingers go a week and two fifths fast and lift, and the trackpad glides on, each step shorter than
    // the last. Landed at the lift it would rest one week on; carried on by its glide, two or more.
    let again = late1
    const flick = Math.round((size * 1.4) / 6)
    for (let round = 1, tries = 0; round <= 2; round++) {
      await record()
      await phase('began')
      await stream([flick, flick, flick, flick, flick, flick], 12)
      phase('ended')
      await stream(fading(flick), 16)
      await wait(1000)
      const rec = await stop()
      // A busy machine held one of the probe's steps back over 60ms: to the page that is fingers lifted from rest, or a
      // new wheel, as it should be. Not a flick as a trackpad sends it: sent again, four times at most, and counted.
      const sent = (await wheels()).filter((one) => !one.pinch)
      const widest = Math.round(Math.max(0, ...sent.slice(1).map((one, i) => one.t - sent[i].t)))
      if (widest > 60 && tries++ < 4) { again++; console.log(`(flick ${round} sent again: the probe's steps came ${widest}ms apart, load ${load()})`); round--; continue }
      // When the glide slowed under five weeks a second, by the page's own reckoning from the steps it was sent.
      let pace = 0
      let slowed = 0
      sent.forEach((one, i) => { const gap = i ? one.t - sent[i - 1].t : 999; pace = gap > 100 ? 0 : pace * 0.5 + (one.dy / Math.max(4, gap)) * 1000 * 0.5; if (!slowed && i > 6 && Math.abs(pace) < size * 5) slowed = one.t })
      const got = landing(rec, slowed, size)
      landed(`flick ${round}`, got, SETTLE, 'its glide slowing under five weeks a second')
      const went = Math.abs(got.rest - rec.find((one) => one.top !== null).top)
      check(`flick ${round}: the flick carries on past the week nearest where the fingers lifted (1.4 weeks of fingers)`, went >= size * 2 - 0.5, `${Math.round(went)}px, ${(went / size).toFixed(1)} weeks`)
      check(`flick ${round}: the glide's last steps do not move it again`, new Set(rec.filter((one) => one.t > slowed + got.ms + 20).map((one) => Math.round(one.top))).size === 1)
    }
    check('the probe kept a trackpad\'s time: no flick sent again, no glide come too late to judge', again === 0, `${again} not in time, load ${load()}`)
    // 6. Fingers back on while it lands: the run is theirs again at once.
    {
      await phase('began')
      await fingers(size * 0.45)
      await wait(60)
      await phase('ended')
      await wait(40)
      const mid = await top()
      await phase('began')
      for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, 20); await wait(16) }
      const caught = await top()
      check('a new touch while it lands takes the run back', !onWeek(mid, size) && caught - mid > 60, `${Math.round(mid)} -> ${Math.round(caught)} after 120px of fingers`)
      await phase('ended'); await wait(700)
      check('and it lands on a week after that', onWeek(await top(), size), `${await top()}`)
    }
    // 7. A mouse wheel (no word from the Mac, notches far apart) still goes its whole way.
    {
      const from = await top()
      for (let i = 0; i < 4; i++) { await h.mouse.wheel(0, size); await wait(160) }
      await wait(900)
      const end = await top()
      check('four notches of a mouse wheel go four weeks', Math.round((end - from) / size) === 4 && onWeek(end, size), `${(end - from) / size} weeks`)
    }
    check('nothing sounded through all of that (a landing is felt, not heard)', (await cues()).length === quietFrom, (await cues()).slice(quietFrom).join(' '))
    // 8. With Motion off, and with the Mac's Reduce motion, it is simply there: one step, one tap.
    for (const [name, on, off] of [
      ['Motion off', () => h.evaluate(() => (document.documentElement.dataset.motion = 'off')), () => h.evaluate(() => delete document.documentElement.dataset.motion)],
      ['Reduce motion', () => h.emulateMedia({ reducedMotion: 'reduce' }), () => h.emulateMedia({ reducedMotion: null })]
    ]) {
      await on(); await wait(200)
      await record()
      await phase('began')
      await fingers(size * 0.4)
      await wait(60)
      const light = await taps('align')
      const lifted = await mark()
      await phase('ended'); await wait(400)
      const rec = await stop()
      const got = landing(rec, lifted, size)
      check(`${name}: on its week in one step as the fingers lift, nothing in between`, got.onWeek && got.ms <= 50 && new Set(rec.filter((one) => one.t >= lifted).map((one) => Math.round(one.top))).size <= 2, `${got.ms}ms`)
      check(`${name}: one light tap all the same`, (await taps('align')) - light === 1, `${(await taps('align')) - light} taps`)
      await off(); await wait(200)
    }
    // 9. The arrows and "Today" glide on the same spring, the calm one; a second press turns it on its way; no tap,
    // for nothing was let go of; one sound a press. The keys go at once.
    {
      const title = () => h.evaluate(() => document.querySelector('[data-cal-title] span:last-child')?.textContent ?? '')
      await h.keyboard.press('t'); await wait(500)
      const before = await title()
      const light = await taps('align')
      const said = (await cues()).length
      await record()
      const pressed = await mark()
      await h.click('[data-cal-next]')
      await wait(700)
      const arrow = await stop()
      const got = landing(arrow, pressed, size)
      check('the › arrow glides to the next month and rests on its first week within 400ms', got.onWeek && got.ms <= 400 && got.moved >= size * 3 && (await title()) !== before, `${got.ms}ms, ${(got.moved / size).toFixed(1)} weeks, ${before} -> ${await title()}`)
      check('the › arrow: one way, never past', got.past <= 0.5 && got.turns === 0, `${got.past}px past, ${got.turns} turns`)
      // The press's own frames draw every week on the way; after them the glide draws nothing new.
      const glide = arrow.filter((one) => one.t >= pressed && one.t <= pressed + got.ms)
      const moving = glide.findIndex((one, i) => i && Math.abs(one.top - glide[0].top) > 0.5)
      const first = Math.round(Math.max(...glide.slice(0, moving + 1).map((one) => one.dt)) * 10) / 10
      const after = Math.round(Math.max(0, ...glide.slice(moving + 1).map((one) => one.dt)) * 10) / 10
      console.log(`MEASURE the › arrow: the frames at the press (the weeks on the way drawn) at most ${first}ms; every frame of the glide after at most ${after}ms; load ${load()}`)
      check(`the › arrow: no frame over ${LONG}ms once it moves`, after <= LONG, `longest ${after}ms, at the press ${first}ms, load ${load()}`)
      check('the › arrow: no tap as it lands, and one sound for the press', (await taps('align')) === light && (await cues()).length - said === 1, `${(await taps('align')) - light} taps, cues: ${(await cues()).slice(said).join(' ')}`)
      await record()
      const twice = await mark()
      await h.click('[data-cal-next]'); await wait(90); await h.click('[data-cal-next]')
      await wait(800)
      const two = landing(await stop(), twice, size)
      check('pressed twice, it carries on to the month after in one move', two.onWeek && two.turns === 0 && two.past <= 0.5 && two.moved >= size * 7, `${(two.moved / size).toFixed(1)} weeks, ${two.turns} turns, ${two.ms}ms`)
      await record()
      const back = await mark()
      await h.click('[data-cal-today]')
      await wait(900)
      const home = landing(await stop(), back, size)
      check('“Today” glides back and rests on a week', home.onWeek && home.turns === 0 && home.moved >= size * 7 && (await title()) === before, `${home.ms}ms, ${(home.moved / size).toFixed(1)} weeks`)
      await h.keyboard.press('ArrowRight'); await wait(120)
      check('→ is there at once, on a week', (await title()) !== before && onWeek(await top(), size), `${before} -> ${await title()}`)
      await h.keyboard.press('ArrowLeft'); await wait(300)
      await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
      await record()
      const still = await mark()
      await h.click('[data-cal-next]'); await wait(400)
      const rec = await stop()
      check('Motion off: the › arrow is there at once', onWeek(await top(), size) && new Set(rec.filter((one) => one.t >= still).map((one) => Math.round(one.top))).size <= 2, `${new Set(rec.filter((one) => one.t >= still).map((one) => Math.round(one.top))).size} places`)
      await h.evaluate(() => delete document.documentElement.dataset.motion)
      await h.keyboard.press('t'); await wait(500)
    }
  }

  // What the frames of a pinch show: each level's and each picture's shape, and how much of a level is on show.
  const shape = (rec, name, window_wheels) => {
    const seen = rec.flatMap((one) => [one.level, one.swell, one.gone, one.come, ...one.layers.map((each) => each.body)].filter(Boolean))
    const worst = Math.max(0, ...seen.map(([x, y]) => Math.abs(x / y - 1)))
    const scaled = seen.filter(([x]) => Math.abs(x - 1) > 0.002).length
    check(`${name}: nothing is scaled more one way than the other in any frame`, worst < 0.002, `worst ${(worst * 100).toFixed(1)}% out of shape over ${rec.length} frames`)
    check(`${name}: it does move (frames with a scale)`, scaled > 0, `${scaled} frames`)
    const changed = rec.findIndex((one, i) => i && one.mode !== rec[i - 1].mode)
    if (changed < 0) return
    const moving = (one) => (one.gone || one.come) || one.layers.some((each) => each.moving) || (one.level && (Math.abs(one.level[0] - 1) >= 0.002 || one.level[2] <= 0.995))
    let last = rec.length - 1
    while (last > changed && !moving(rec[last])) last--
    const ms = Math.round(rec[Math.min(rec.length - 1, last + 1)].t - rec[changed].t)
    check(`${name}: the new level is at rest within 260ms of the change`, ms <= 260, `${ms}ms, load ${load()}`)
    // How much of a level is on show: the old picture and the new one together, or the level itself.
    const shown = rec.slice(changed).map((one) => (one.layers.length ? one.layers.reduce((sum, each) => sum + each.o, 0) : one.gone && one.come ? one.gone[2] + one.come[2] : (one.level?.[2] ?? 1)))
    check(`${name}: never less than a whole level on show (the old one stays until the new one is there)`, Math.min(...shown) >= 0.9, `least ${Math.min(...shown).toFixed(2)} of a level`)
    // The day names: one row at a time. A row counts as seen at a sixth of its strength (its level's times its own).
    const rows = rec.map((one) => (one.layers.length ? one.layers.filter((each) => each.names !== null && each.o * each.names > 0.16).length : one.gone && one.come ? (one.gone[2] > 0.16) + (one.come[2] > 0.16) : 1))
    check(`${name}: never two rows of day names at once`, Math.max(...rows) <= 1, `${rows.filter((n) => n > 1).length} frames with two`)
    // Drawing the new level is the page's work, done in the two frames either side of the change (which of them it
    // falls in depends on when the browser runs it); every other frame is the pinch or the level settling.
    // With the next level drawn ahead, unseen, as the pinch sets off: the frame it comes into the pane in (the first with
    // two levels), which may be the frame of the change itself when the pinch reached the line before it was drawn.
    const came = rec.findIndex((one, i) => i && one.layers.length > rec[i - 1].layers.length && rec[i - 1].layers.length)
    const near = (i) => (came > 0 ? Math.abs(i - came) <= 1 : i >= changed - 2 && i <= changed + 2)
    const drawn = Math.round(Math.max(...rec.filter((_, i) => i && near(i)).map((one) => one.dt)) * 10) / 10
    const rest = Math.round(Math.max(...rec.filter((_, i) => i && !near(i)).map((one) => one.dt)) * 10) / 10
    if (came > 0) console.log(`MEASURE ${name}: the next level came into the pane, unseen, ${Math.round(rec[came].t - (window_wheels ?? []).find((one) => one.pinch)?.t)}ms after the pinch's first step and ${Math.round(rec[changed].t - rec[came].t)}ms before the change; the longest frame from the change on ${Math.round(Math.max(...rec.slice(changed).map((one) => one.dt)) * 10) / 10}ms`)
    // From the pinch's last step before the change to the first frame of the new level moving: what the hand waits.
    const sent = (window_wheels ?? []).filter((one) => one.pinch && one.t <= rec[changed].t)
    const waited = sent.length ? Math.round(rec[changed].t - sent[sent.length - 1].t) : -1
    console.log(`MEASURE ${name}: drawing the new level took a frame of ${drawn}ms (frames about the change: ${rec.slice(Math.max(1, changed - 4), changed + 5).map((one) => Math.round(one.dt)).join(' ')}); the new level began to show ${waited}ms after the pinch's step that changed it; every other frame at most ${rest}ms; load ${load()}`)
    check(`${name}: no frame over ${LONG}ms but the one that draws the new level`, rest <= LONG, `longest ${rest}ms, load ${load()}`)
  }

  if (parts.includes('pinch')) {
    await toMonth()
    // What sounded through the pinches themselves (the probe's own T and M key presses have their sound, as they should).
    const heard = []
    const silent = async (act) => { const from = (await cues()).length; await act(); heard.push(...(await cues()).slice(from)) }
    const week = await weekSpot()
    await h.mouse.move(week.x, week.y)
    await wait(400)
    // 1. A pinch between the levels: what is shown keeps its shape in every frame, and the pane is never left empty.
    for (const [name, at, dy, want] of [['pinch out, month to week', week, -6, 'week'], ['pinch out, week to day', null, -6, 'day'], ['pinch in, day to week', null, 6, 'week'], ['pinch in, week to month', null, 6, 'month']]) {
      const spot = at ?? await daySpot()
      const firm = await taps('level')
      await record()
      await silent(async () => { await pinch(spot.x, spot.y, dy); await wait(700) })
      const rec = await stop()
      check(`${name}: the level changed`, (await mode()) === want, await mode())
      shape(rec, name, await wheels())
      await why(name)
      check(`${name}: one firm tap`, (await taps('level')) - firm === 1, `${(await taps('level')) - firm} taps`)
      await wait(400)
    }
    // 2. A pinch that goes on and on the same way opens one level, never two.
    {
      await silent(async () => { await pinch(week.x, week.y, -6, 16); await wait(600) })
      check('a long pinch out opens one level only', (await mode()) === 'week', await mode())
      await wait(400)
      await h.keyboard.press('m'); await wait(700)
    }
    // 3. A pinch turned round without lifting takes the level back: the fingers are never shut out.
    {
      // Out past the change, a beat of 150ms as a hand takes to turn (under the 300ms that would make it a new pinch), then in.
      await h.evaluate(([x, y]) => new Promise((res) => { let i = 0; const send = (dy) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); const tick = () => { send(i < 7 ? -6 : 6); if (++i < 16) setTimeout(tick, i === 7 ? 150 : 12); else res() }; tick() }), [week.x, week.y])
      await wait(700)
      check('a pinch out, then in without lifting, comes back to the month', (await mode()) === 'month', await mode())
      await wait(400)
      await toMonth()
    }
    // 4. A pinch short of the change: what swelled goes back soon after the fingers stop.
    {
      await record()
      const t0 = await mark()
      const from = (await cues()).length
      await pinch(week.x, week.y, -2, 3)
      const stopped = await mark()
      await wait(700)
      heard.push(...(await cues()).slice(from))
      const rec = await stop()
      const swollen = rec.filter((one) => one.t >= t0 && one.swell)
      const back = swollen.length ? Math.round(swollen[swollen.length - 1].t - stopped) : -1
      check('a short pinch swells the week under it, in proportion', swollen.length > 0 && swollen.every((one) => Math.abs(one.swell[0] / one.swell[1] - 1) < 0.002) && (await mode()) === 'month', `${swollen.length} frames swollen`)
      check('and it is back within 240ms of the fingers stopping (80 to know they stopped, 160 to land)', back >= 0 && back <= 240, `${back}ms, load ${load()}`)
    }
    check('one sound a change of level (five changes), none for a pinch that changes nothing', heard.join(' ') === 'tap tap tap tap tap', heard.join(' '))
    // 5. A pinch at a hand's pace: a tenth of a second from its first step to the line, not one frame. The level it is
    // heading for is drawn, unseen, on the way, so the change draws nothing: no long frame from two frames before it on.
    // (The build before draws the new level in the frame of the change, whatever the pace.)
    for (const [name, at, dy, want] of [['a hand\'s pace, month to week', week, -2, 'week'], ['a hand\'s pace, week to day', null, -2, 'day'], ['a hand\'s pace, day to week', null, 2, 'week'], ['a hand\'s pace, week to month', null, 2, 'month']]) {
      const spot = at ?? await daySpot()
      const firm = await taps('level')
      await record()
      await pinch(spot.x, spot.y, dy, 14, 16)
      await wait(700)
      const rec = await stop()
      const sent = (await wheels()).filter((one) => one.pinch)
      const changed = rec.findIndex((one, i) => i && one.mode !== rec[i - 1].mode)
      check(`${name}: the level changed, with one firm tap`, (await mode()) === want && changed > 0 && (await taps('level')) - firm === 1, `${await mode()}, ${(await taps('level')) - firm} taps`)
      await why(name)
      if (changed > 0) {
        const first = rec.findIndex((one) => one.t >= sent[0].t)
        const came = rec.findIndex((one, i) => i && one.layers.length > rec[i - 1].layers.length && rec[i - 1].layers.length)
        const through = Math.round(Math.max(...rec.slice(Math.max(1, changed - 2)).map((one) => one.dt)) * 10) / 10
        const pinching = Math.round(Math.max(0, ...rec.slice(Math.max(1, first), Math.max(1, changed - 2)).map((one) => one.dt)) * 10) / 10
        console.log(`MEASURE ${name}: the line reached ${Math.round(rec[changed].t - sent[0].t)}ms after the first step; the next level in the pane, unseen, ${came > 0 ? `${Math.round(rec[came].t - sent[0].t)}ms after it (${came < changed ? 'before' : 'at'} the change)` : 'not seen coming in'}; frames from the first step to the change at most ${pinching}ms (${rec.slice(Math.max(1, first), changed).map((one) => Math.round(one.dt)).join(' ')}); from two frames before the change to rest at most ${through}ms (${rec.slice(Math.max(1, changed - 2), changed + 6).map((one) => Math.round(one.dt)).join(' ')}); load ${load()}`)
        check(`${name}: no frame over ${LONG}ms through the change (from two frames before it to rest)`, through <= LONG, `longest ${through}ms, load ${load()}`)
        check(`${name}: no frame over ${LONG}ms while the fingers pinch, the next level being drawn under them`, pinching <= LONG, `longest ${pinching}ms, load ${load()}`)
        const rows = rec.map((one) => one.layers.filter((each) => each.names !== null && each.o * each.names > 0.16).length)
        check(`${name}: never two rows of day names at once, never less than a whole level`, Math.max(1, ...rows) <= 1 && Math.min(...rec.slice(changed).map((one) => (one.layers.length ? one.layers.reduce((sum, each) => sum + each.o, 0) : 1))) >= 0.9)
      }
      await wait(400)
    }
    // 6. With Motion off the level is simply there: no travel, no fade, one firm tap. With the Mac's Reduce motion it
    // fades across (the two are not the same thing): nothing grows or moves, and it is there within 200ms.
    for (const [name, on, off] of [
      ['Motion off', () => h.evaluate(() => (document.documentElement.dataset.motion = 'off')), () => h.evaluate(() => delete document.documentElement.dataset.motion)],
      ['Reduce motion', () => h.emulateMedia({ reducedMotion: 'reduce' }), () => h.emulateMedia({ reducedMotion: null })]
    ]) {
      await on(); await wait(300)
      const firm = await taps('level')
      await record()
      await pinch(week.x, week.y, -6)
      await wait(500)
      const rec = await stop()
      const seen = rec.flatMap((one) => [one.level, one.swell, one.gone, one.come, ...one.layers.map((each) => each.body)].filter(Boolean))
      const sized = seen.filter(([x]) => Math.abs(x - 1) >= 0.002).length
      const fading = rec.filter((one) => one.layers.some((each) => each.o > 0.005 && each.o < 0.995) || (one.level?.[2] ?? 1) <= 0.995 || one.gone || one.come)
      if (name === 'Motion off') check(`${name}: a pinch opens the week at once, nothing scaled or faded in any frame`, (await mode()) === 'week' && !sized && !fading.length, `${sized} frames scaled, ${fading.length} fading`)
      else check(`${name}: a pinch fades the week in across the month, nothing grown or moved, there within 200ms`, (await mode()) === 'week' && !sized && fading.length > 2 && fading[fading.length - 1].t - fading[0].t <= 200, `${sized} frames scaled, ${fading.length} fading over ${fading.length ? Math.round(fading[fading.length - 1].t - fading[0].t) : 0}ms`)
      check(`${name}: one firm tap`, (await taps('level')) - firm === 1, `${(await taps('level')) - firm} taps`)
      await off(); await wait(400)
      await h.keyboard.press('m'); await wait(700)
    }
  }

  // "Today" in Week and Day: the hours glide to now on the calm spring (as Month's weeks do), set off in the frame the
  // day is drawn, never after a wait; T, a key, is there at once.
  if (parts.includes('today')) {
    const hoursTop = () => h.evaluate(() => document.querySelector('[data-cal-level] [data-cal-scroll]').scrollTop)
    for (const [key, name] of [['w', 'Week'], ['d', 'Day']]) {
      await h.keyboard.press(key); await wait(700)
      await h.keyboard.press('t'); await wait(400)
      const home = await hoursTop()
      // A week (or a day) on, scrolled to the small hours, then "Today".
      await h.click('[data-cal-next]'); await wait(400)
      await h.evaluate(() => (document.querySelector('[data-cal-level] [data-cal-scroll]').scrollTop = 0)); await wait(200)
      await record()
      const pressed = await mark()
      await h.click('[data-cal-today]')
      await wait(900)
      const rec = (await stop()).filter((one) => one.t >= pressed && one.hours !== null)
      const rest = rec[rec.length - 1].hours
      let still = rec.length - 1
      while (still > 0 && Math.abs(rec[still - 1].hours - rest) < 0.5) still--
      const set = rec.findIndex((one) => one.hours > 0.5)
      let turns = 0
      for (let i = 2; i <= still; i++) if ((rec[i].hours - rec[i - 1].hours) * (rec[i - 1].hours - rec[i - 2].hours) < 0) turns++
      const places = new Set(rec.slice(0, still + 1).map((one) => Math.round(one.hours))).size
      check(`${name}: “Today” glides the hours to now and rests within 450ms, one way, never past`, Math.abs(rest - home) < 1 && places > 4 && turns === 0 && Math.max(...rec.map((one) => one.hours)) <= rest + 0.5 && rec[still].t - pressed <= 450, `to ${Math.round(rest)} (now is at ${Math.round(home)}), ${places} places, ${turns} turns, at rest ${Math.round(rec[still].t - pressed)}ms after the press, moving ${set >= 0 ? Math.round(rec[set].t - pressed) : -1}ms after it, load ${load()}`)
      check(`${name}: it sets off within 60ms of the press, the day drawn (no wait added)`, set >= 0 && rec[set].t - pressed <= 60, `${set >= 0 ? Math.round(rec[set].t - pressed) : -1}ms`)
      const long = Math.round(Math.max(...rec.slice(Math.max(1, set + 1), still + 1).map((one) => one.dt)) * 10) / 10
      check(`${name}: no frame over ${LONG}ms once it moves`, long <= LONG, `longest ${long}ms, load ${load()}`)
      await h.click('[data-cal-next]'); await wait(400)
      await h.evaluate(() => (document.querySelector('[data-cal-level] [data-cal-scroll]').scrollTop = 0)); await wait(200)
      await record()
      const keyed = await mark()
      await h.keyboard.press('t'); await wait(400)
      const by = (await stop()).filter((one) => one.t >= keyed && one.hours !== null)
      check(`${name}: T is there at once`, Math.abs(by[by.length - 1].hours - home) < 1 && new Set(by.map((one) => Math.round(one.hours))).size <= 2, `${new Set(by.map((one) => Math.round(one.hours))).size} places`)
    }
    await h.keyboard.press('m'); await wait(700)
  }

  // Pictures to read by eye. A picture takes longer than a whole change of level, so each is held still: the pinch by
  // a run of steps that move nothing (fingers resting mid-pinch), the change by stopping its clock.
  if (parts.includes('stills') && dir) {
    await h.evaluate(() => {
      window.__held = []
      const hold = (one) => (one.pause(), window.__held.push(one))
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) { const one = animate.apply(this, args); if (this.matches?.('[data-cal-level]') || this.closest?.('[data-cal-depth]')) hold(one); return one }
      const turn = document.startViewTransition?.bind(document)
      if (turn) document.startViewTransition = (change) => { const one = turn(change); one.ready.then(() => document.getAnimations().filter((each) => each.effect?.pseudoElement?.includes('mf-cal-level')).forEach(hold), () => {}); return one }
    })
    const rest = (x, y, on) => h.evaluate(([x, y, on]) => { clearInterval(window.__resting); if (on) window.__resting = setInterval(() => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: 0, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })), 30) }, [x, y, on])
    for (const look of ['light', 'dark']) {
      await c.look(look)
      await toMonth()
      const week = await weekSpot()
      await h.mouse.move(week.x, week.y); await wait(300)
      // Mid-pinch: a slow pinch out over a week, held a quarter, half and three quarters of the way to the change.
      const step = OPEN_AT / 4 / 6
      for (const [n, part] of [[1, '25'], [2, '50'], [3, '75']]) {
        await pinch(week.x, week.y, -step * 100, 6, 20)
        await rest(week.x, week.y, true)
        await wait(60)
        await h.screenshot({ path: `${dir}/${look}-pinch-out-month-${part}.png` })
        await rest(week.x, week.y, false)
        if (n === 3) await wait(700)
      }
      for (const [name, at, dy] of [['month-to-week', week, -6], ['week-to-day', null, -6], ['day-to-week', null, 6], ['week-to-month', null, 6]]) {
        const spot = at ?? await daySpot()
        if (name === 'day-to-week') {
          // Mid-pinch going up: the whole day drawing in, at half and three quarters of the way.
          for (const part of ['50', '75']) {
            await pinch(spot.x, spot.y, (part === '50' ? 2 : 1) * step * 100, 6, 20)
            await rest(spot.x, spot.y, true)
            await wait(60)
            await h.screenshot({ path: `${dir}/${look}-pinch-in-day-${part}.png` })
            await rest(spot.x, spot.y, false)
          }
          await wait(700)
        }
        await h.evaluate(() => (window.__held = []))
        await pinch(spot.x, spot.y, dy); await wait(500)
        const held = await h.evaluate(() => window.__held.length)
        for (const at of [0, 40, 80, 140]) {
          await h.evaluate((at) => window.__held.forEach((one) => one.playState !== 'idle' && (one.currentTime = at)), at)
          await wait(120)
          await h.screenshot({ path: `${dir}/${look}-${name}-${String(at).padStart(3, '0')}ms.png` })
        }
        await h.evaluate(() => window.__held.forEach((one) => one.playState !== 'idle' && one.finish()))
        console.log(`STILLS ${look} ${name}: ${held} animation${held === 1 ? '' : 's'} held, now ${await mode()}`)
        await wait(600)
      }
      // A change turned round mid-way: out to the week, held 80ms into the change, then the fingers come back without
      // lifting. The way back starts from what is on screen.
      {
        await h.evaluate(() => (window.__held = []))
        await pinch(week.x, week.y, -6, 3); await wait(250)
        await h.evaluate(() => window.__held.forEach((one) => one.playState !== 'idle' && (one.currentTime = 80)))
        await wait(120)
        await h.screenshot({ path: `${dir}/${look}-turned-out-080ms.png` })
        const out = await h.evaluate(() => window.__held.length)
        await pinch(week.x, week.y, 6, 5); await wait(250)
        const held = await h.evaluate(() => window.__held.length)
        for (const at of [0, 40, 80, 140]) {
          await h.evaluate(([at, from]) => window.__held.slice(from).forEach((one) => one.playState !== 'idle' && (one.currentTime = at)), [at, out])
          await wait(120)
          await h.screenshot({ path: `${dir}/${look}-turned-back-${String(at).padStart(3, '0')}ms.png` })
        }
        // (An animation the app has put away is left so: finished, it would come back and hold its last frame.)
        await h.evaluate(() => window.__held.forEach((one) => one.playState !== 'idle' && one.finish()))
        console.log(`STILLS ${look} turned round: ${out} animations held out, ${held - out} back, now ${await mode()}`)
        await wait(600)
      }
    }
    await c.look('light')
  }
} catch (error) {
  ok = false
  console.log('FAIL  the probe itself', error)
}
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(`${passed}/${all} passed (load ${load()})`)
await c.close(); process.exit(ok ? 0 : 1)
