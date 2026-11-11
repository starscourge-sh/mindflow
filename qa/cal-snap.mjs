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
//           one firm tap a change, a pinch turned round takes the level back, a short pinch goes back, and with
//           Motion off or Reduce motion the level is simply there.
//   stills  with FRAMES=dir: pictures to read by eye, light and dark: the pinch held a quarter, half and three
//           quarters of the way to the change (OPEN_AT says how far that is: 0.18 now, 0.22 on the build before),
//           and each change of level held at 0, 40, 80 and 140ms.
// No frame may take over LONG ms; the frame that draws a new level is timed apart and printed.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-snap.mjs
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
const LIFT = 160
const SETTLE = 200
const LONG = 16
const OPEN_AT = Number(process.env.OPEN_AT ?? 0.18)
const parts = (process.env.PART ?? 'run,pinch').split(',')
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
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
    window.__rec.push({
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
const weekSpot = () => h.evaluate(() => { const r = [...document.querySelectorAll('[data-month-run] [data-month-week]')].find((one) => one.getBoundingClientRect().top > document.querySelector('[data-month-run]').getBoundingClientRect().top + 150).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
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
      check('a glide come late: it never turns round nor passes its week', got.past <= 0.5 && got.turns === 0, `${got.past}px past, ${got.turns} turns`)
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
    const seen = rec.flatMap((one) => [one.level, one.swell, one.gone, one.come].filter(Boolean))
    const worst = Math.max(0, ...seen.map(([x, y]) => Math.abs(x / y - 1)))
    const scaled = seen.filter(([x]) => Math.abs(x - 1) > 0.002).length
    check(`${name}: nothing is scaled more one way than the other in any frame`, worst < 0.002, `worst ${(worst * 100).toFixed(1)}% out of shape over ${rec.length} frames`)
    check(`${name}: it does move (frames with a scale)`, scaled > 0, `${scaled} frames`)
    const changed = rec.findIndex((one, i) => i && one.mode !== rec[i - 1].mode)
    if (changed < 0) return
    const moving = (one) => (one.gone || one.come) || Math.abs(one.level[0] - 1) >= 0.002 || one.level[2] <= 0.995
    let last = rec.length - 1
    while (last > changed && !moving(rec[last])) last--
    const ms = Math.round(rec[Math.min(rec.length - 1, last + 1)].t - rec[changed].t)
    check(`${name}: the new level is at rest within 260ms of the change`, ms <= 260, `${ms}ms, load ${load()}`)
    // How much of a level is on show: the old picture and the new one together, or the level itself.
    const shown = rec.slice(changed).map((one) => (one.gone && one.come ? one.gone[2] + one.come[2] : one.level[2]))
    check(`${name}: never less than a whole level on show (the old one stays until the new one is there)`, Math.min(...shown) >= 0.9, `least ${Math.min(...shown).toFixed(2)} of a level`)
    // Drawing the new level is the page's work, done in the two frames either side of the change (which of them it
    // falls in depends on when the browser runs it); every other frame is the pinch or the level settling.
    const near = (i) => i >= changed - 2 && i <= changed + 2
    const drawn = Math.round(Math.max(...rec.filter((_, i) => i && near(i)).map((one) => one.dt)) * 10) / 10
    const rest = Math.round(Math.max(...rec.filter((_, i) => i && !near(i)).map((one) => one.dt)) * 10) / 10
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
    // 5. With Motion off, and with the Mac's Reduce motion, the level is simply there: no travel, one firm tap.
    for (const [name, on, off] of [
      ['Motion off', () => h.evaluate(() => (document.documentElement.dataset.motion = 'off')), () => h.evaluate(() => delete document.documentElement.dataset.motion)],
      ['Reduce motion', () => h.emulateMedia({ reducedMotion: 'reduce' }), () => h.emulateMedia({ reducedMotion: null })]
    ]) {
      await on(); await wait(300)
      const firm = await taps('level')
      await record()
      await pinch(week.x, week.y, -6)
      await wait(400)
      const rec = await stop()
      const seen = rec.flatMap((one) => [one.level, one.swell, one.gone, one.come].filter(Boolean))
      check(`${name}: a pinch opens the week at once, nothing scaled or faded in any frame`, (await mode()) === 'week' && seen.every(([x, , o]) => Math.abs(x - 1) < 0.002 && o > 0.995), `${seen.filter(([x, , o]) => Math.abs(x - 1) >= 0.002 || o <= 0.995).length} frames moving`)
      check(`${name}: one firm tap`, (await taps('level')) - firm === 1, `${(await taps('level')) - firm} taps`)
      await off(); await wait(400)
      await h.keyboard.press('m'); await wait(700)
    }
  }

  // Pictures to read by eye. A picture takes longer than a whole change of level, so each is held still: the pinch by
  // a run of steps that move nothing (fingers resting mid-pinch), the change by stopping its clock.
  if (parts.includes('stills') && dir) {
    await h.evaluate(() => {
      window.__held = []
      const hold = (one) => (one.pause(), window.__held.push(one))
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) { const one = animate.apply(this, args); if (this.matches?.('[data-cal-level]')) hold(one); return one }
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
          await h.evaluate((at) => window.__held.forEach((one) => (one.currentTime = at)), at)
          await wait(120)
          await h.screenshot({ path: `${dir}/${look}-${name}-${String(at).padStart(3, '0')}ms.png` })
        }
        await h.evaluate(() => window.__held.forEach((one) => one.finish()))
        console.log(`STILLS ${look} ${name}: ${held} animation${held === 1 ? '' : 's'} held, now ${await mode()}`)
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
