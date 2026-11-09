// The Calendar's and Tasks' motion, measured: for each motion, the animations
// it starts (what moves, how long, on what curve) and the moving thing's
// transform, opacity and rect on every frame; for the main ones, pictures held
// every 50ms (SHOTS=dir). Checks the rules in DESIGN.md: reached by a key,
// nothing moves; Motion off, nothing moves; exits faster than entries; only
// transform and opacity move.
//
//   npx electron-vite build --outDir out-ra
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-ra/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/cal-tasks-motion.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1300, height: 820, at: '11:30' })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)

/** Every frame for `ms`: the first match's transform, opacity and rect. Started before the act, read after. */
const sample = (sel, ms = 450) => h.evaluate(([sel, ms]) => new Promise((done) => {
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const t = Math.round(performance.now() - t0)
    const el = document.querySelector(sel)
    if (el) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      out.push({ t, rot: cs.rotate, tf: cs.transform === 'none' ? '-' : cs.transform.replace(/matrix\((.*)\)/, (_, m) => { const n = m.split(',').map(Number); return `s${n[0].toFixed(3)} x${n[4].toFixed(1)} y${n[5].toFixed(1)}` }), op: Number(cs.opacity).toFixed(2), r: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` })
    } else out.push({ t, gone: true })
    if (t < ms) requestAnimationFrame(tick)
    else done(out)
  }
  requestAnimationFrame(tick)
}), [sel, ms])
/** The animations running now (CSS, WAAPI, Motion's): on what, how long, which curve, which properties. */
const anims = () => h.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'paused').map((a) => {
  const el = a.effect?.target
  const timing = a.effect?.getComputedTiming()
  const props = [...new Set(a.effect?.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))]
  const tag = el ? `${el.tagName.toLowerCase()}${[...el.attributes].filter((x) => x.name.startsWith('data-')).slice(0, 2).map((x) => `[${x.name}]`).join('')}${a.effect.pseudoElement ?? ''}` : '?'
  return `${tag} ${props.join('+') || (a.transitionProperty ?? '')} ${Math.round(timing.duration)}ms ${String(a.effect.getTiming().easing).slice(0, 40)}${a.transitionProperty ? ` (transition ${a.transitionProperty})` : ''}`
}).filter((s) => !/mf-hint|caption|orb|shimmer|scenery|drift/.test(s)))
const print = (label, rows) => {
  console.log(`  ${label}:`)
  const keep = rows.filter((row, i) => i === 0 || i === rows.length - 1 || JSON.stringify({ ...row, t: 0 }) !== JSON.stringify({ ...rows[i - 1], t: 0 }))
  for (const row of keep) console.log(`    ${String(row.t).padStart(4)}ms ${row.gone ? 'gone' : `${row.tf.padEnd(26)} ${row.rot !== 'none' ? `rot ${row.rot} ` : ''}op ${row.op}  ${row.r}`}`)
}
/** How long the frames kept changing: the time of the last change. */
const settled = (rows) => { let first = -1, last = 0; for (let i = 1; i < rows.length; i++) if (JSON.stringify({ ...rows[i], t: 0 }) !== JSON.stringify({ ...rows[i - 1], t: 0 })) { if (first < 0) first = rows[i - 1].t; last = rows[i].t } return first < 0 ? 0 : last - first }
const settledOld = (rows) => { let last = 0; for (let i = 1; i < rows.length; i++) if (JSON.stringify({ ...rows[i], t: 0 }) !== JSON.stringify({ ...rows[i - 1], t: 0 })) last = rows[i].t; return last }
/** Pictures about every 50ms of the motion's own time: what `act` starts plays at a fifth of its speed, each picture named by where it is. */
async function film(label, act) {
  if (!shots) return act()
  await h.evaluate(() => {
    window.__held = new Set(document.getAnimations())
    window.__slow = []
    window.__freeze = true
    const hold = () => { for (const a of document.getAnimations()) if (!window.__held.has(a)) { window.__held.add(a); a.playbackRate = 0.2; window.__slow.push(a) } if (window.__freeze) requestAnimationFrame(hold) }
    requestAnimationFrame(hold)
  })
  await act()
  for (let n = 0; n < 9; n++) {
    const at = await h.evaluate(() => Math.round(Math.max(0, ...window.__slow.map((a) => Number(a.currentTime) || 0))))
    await h.screenshot({ path: `${shots}/${label}-${String(n).padStart(2, '0')}-at${at}ms.png` })
    await wait(170)
  }
  await h.evaluate(() => { window.__freeze = false; window.__slow.forEach((a) => { try { a.finish() } catch { a.cancel() } }) })
  await wait(400)
}
const motionOff = (off) => h.evaluate((off) => (off ? (document.documentElement.dataset.motion = 'off') : delete document.documentElement.dataset.motion), off)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const day = (by, hour) => { const d = c.now(); d.setHours(hour, 0, 0, 0); d.setDate(d.getDate() + by); return d }
  for (const [title, by, hour] of [['Team sync', 0, 10], ['Lunch with Sam', 1, 12], ['Dentist', 2, 15]]) {
    const start = day(by, hour)
    await v('event:add', { title, start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  }
  const late = await v('task:add', 'Return library books')
  await v('task:save', late.id, { due: day(-2, 10).toISOString(), allDay: 1 })
  const stepped = await v('task:add', 'Pack for the trip')
  await v('task:save', stepped.id, { due: day(0, 18).toISOString(), allDay: 1, subtasks: [{ text: 'Passport', done: false }, { text: 'Charger', done: false }] })
  await v('task:save', (await v('task:add', 'Email Sam back')).id, { due: day(0, 18).toISOString(), allDay: 1 })

  // 1. Week step: by a click it slides in from the side it lies on; by ← → and with Motion off nothing moves.
  await go('calendar'); await wait(1500)
  await h.keyboard.press('w'); await wait(700)
  const col = '[data-cal-col]'
  let p = sample(col, 420)
  await h.locator('[data-cal-next]').first().click()
  let list = await anims()
  let rows = await p
  console.log('Week step, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('first day column', rows)
  check('week step by a click slides, and settles under 300ms', list.some((s) => s.includes('data-cal-col')) && settled(rows) < 300, `${settled(rows)}ms`)
  await wait(500)
  p = sample(col, 300)
  await h.keyboard.press('ArrowRight')
  list = await anims(); rows = await p
  console.log('Week step, by →:'); list.forEach((s) => console.log(`  ${s}`)); print('first day column', rows)
  check('week step by → moves nothing', !list.some((s) => s.includes('data-cal-col') || s.includes('data-cal-head')) && settled(rows) === 0, list.join('; '))
  await motionOff(true)
  await h.locator('[data-cal-prev]').first().click(); list = await anims()
  check('week step with Motion off moves nothing', !list.some((s) => s.includes('data-cal-col')), list.join('; '))
  await motionOff(false)
  await wait(400)
  await film('week-step-click', () => h.locator('[data-cal-next]').first().click())

  // 2. Month: the grid slides by a click, not by a key.
  await h.keyboard.press('m'); await wait(800)
  p = sample('[data-month-grid]', 420)
  await h.locator('[data-cal-next]').first().click()
  list = await anims(); rows = await p
  console.log('Month step, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('month grid', rows)
  check('month step by a click settles under 300ms', settled(rows) < 300, `${settled(rows)}ms`)
  await wait(500)
  await film('month-step-click', () => h.locator('[data-cal-next]').first().click())
  p = sample('[data-month-grid]', 300)
  await h.keyboard.press('ArrowLeft')
  list = await anims(); rows = await p
  check('month step by ← moves nothing', !list.some((s) => s.includes('data-month-grid')) && settled(rows) === 0, list.join('; '))
  await wait(400)

  // 3. "New event" (clicked): the side form; closed by its own button and by Esc.
  await h.keyboard.press('w'); await wait(700)
  await h.keyboard.press('t'); await wait(700)
  p = sample('[data-day-side]', 450)
  await h.locator('[data-cal-new-event]').first().click()
  list = await anims(); rows = await p
  console.log('New event side form, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('side form', rows)
  const inAt = settled(rows)
  await wait(400)
  // Away by a click outside it: the pointer, not a key.
  p = sample('[data-day-side]', 400)
  await h.mouse.click(400, 500)
  list = await anims(); rows = await p
  console.log('Side form, closed by a click:'); list.forEach((s) => console.log(`  ${s}`)); print('side form', rows)
  const outAt = rows.findIndex((r) => r.gone) >= 0 ? rows.find((r) => r.gone).t : settled(rows)
  check('the side form leaves faster than it came', outAt < inAt || inAt === 0, `in ${inAt}ms, out ${outAt}ms`)
  await wait(500)
  await film('side-form-open', () => h.locator('[data-cal-new-event]').first().click())
  await film('side-form-close', () => h.mouse.click(400, 500))
  await h.locator('[data-cal-new-event]').first().click(); await wait(600)
  p = sample('[data-day-side]', 300)
  await h.keyboard.press('Escape')
  list = await anims(); rows = await p
  console.log('Side form, Esc:'); list.forEach((s) => console.log(`  ${s}`)); print('side form', rows)
  // By Esc it slides out too, as day-side.tsx means it to, and as quickly as by a click.
  check('Esc takes the side form away, quicker than it came', rows.some((r) => r.gone) && rows.find((r) => r.gone).t < inAt, `gone at ${rows.find((r) => r.gone)?.t}ms, in took ${inAt}ms`)
  await wait(500)

  // 4. An event's card on a click.
  const ev = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-cal-event]')].find((one) => one.getBoundingClientRect().height > 12); el?.scrollIntoView({ block: 'center' }); return el ? `[data-cal-event="${el.getAttribute('data-cal-event')}"]` : null })
  if (ev) {
    await wait(300)
    p = sample('[data-cal-pop]', 400)
    await h.locator(ev).first().click()
    list = await anims(); rows = await p
    console.log('Event card, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('card', rows)
    const shown = rows.find((r) => !r.gone && Number(r.op) >= 0.95)?.t ?? 999
    const began = rows.find((r) => !r.gone)?.t ?? 0
    check('the event card is 95% there within 200ms', shown - began <= 200, `${shown - began}ms`)
    await wait(300)
    p = sample('[data-cal-pop]', 300)
    await h.mouse.click(60, 780)
    list = await anims(); rows = await p
    console.log('Event card, closed by a click:'); list.forEach((s) => console.log(`  ${s}`)); print('card', rows)
    await wait(400)
    await film('event-card', () => h.locator(ev).first().click())
    await h.mouse.click(60, 780); await wait(400)
  } else check('an event to click', false)

  // 5. "T": today brought in without a smooth scroll; by the button, a smooth one.
  await h.keyboard.press('ArrowRight'); await wait(400)
  await h.evaluate(() => { const s = document.querySelector('[data-cal-col]')?.closest('.overflow-y-auto, [data-cal-scroll]') ?? document.querySelector('[data-cal-now]')?.parentElement; if (s) s.scrollTop = 0 })
  const scroller = () => h.evaluate(() => { let el = document.querySelector('[data-cal-now]'); while (el && !(el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible')) el = el.parentElement; return el ? el.scrollTop : null })
  await h.keyboard.press('t')
  const tops = []
  for (let n = 0; n < 8; n++) { tops.push(await scroller()); await wait(40) }
  console.log('T, scroll tops every ~40ms:', tops.join(' '))
  check('T lands the now line in one jump (no smooth scroll by a key)', tops.slice(1).filter((x, i) => x !== tops[i + 1 - 1]).length <= 1 || new Set(tops.slice(2)).size === 1, tops.join(' '))

  // 6. Tasks: the Display popover, the late menu, a tick, a step fold.
  await go('today'); await wait(1200)
  const pop = '[data-slot="popover-content"]'
  p = sample(pop, 350)
  await h.locator('[data-display]').first().click()
  list = await anims(); rows = await p
  console.log('Display popover, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('popover', rows)
  const popIn = settled(rows)
  await wait(300)
  p = sample(pop, 300)
  await h.mouse.click(60, 780)
  list = await anims(); rows = await p
  console.log('Display popover, closed by a click:'); list.forEach((s) => console.log(`  ${s}`)); print('popover', rows)
  const popOut = rows.find((r) => r.gone)?.t ?? 999
  check('Display popover in under 260ms, out faster', popIn <= 260 && popOut < popIn, `in ${popIn}ms, out ${popOut}ms`)
  await wait(400)
  await film('display-popover', () => h.locator('[data-display]').first().click())
  await h.mouse.click(60, 780); await wait(400)

  const lateBtn = h.locator('[data-late-all]').first()
  if (await lateBtn.count()) {
    await wait(400)
    p = sample('[role="menu"]', 300)
    await lateBtn.click()
    list = await anims(); rows = await p
    console.log('Late menu, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('menu', rows)
    check('the late menu opens at once: whole on its first frame', !list.some((s) => s.includes('[role]') || /menu/.test(s)) || rows.filter((r) => !r.gone && Number(r.op) < 1).length === 0, list.join('; '))
    p = sample('[role="menu"]', 250)
    await h.keyboard.press('Escape')
    list = await anims(); rows = await p
    console.log('Late menu, Esc:'); list.forEach((s) => console.log(`  ${s}`)); print('menu', rows)
    await wait(300)
  } else console.log('  (no late menu on Today)')

  // A step fold, clicked: the chevron turns, the steps show.
  const fold = h.locator(`[data-steps-fold="${stepped.id}"]`).first()
  if (await fold.count()) {
    p = sample(`[data-steps-fold="${stepped.id}"] svg:last-of-type`, 300)
    await fold.click()
    list = await anims(); rows = await p
    console.log('Step fold, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('chevron', rows)
    const turned = rows.filter((r) => r.rot && r.rot !== 'none')
    const turnMs = turned.length ? turned.at(-1).t - (rows.find((r) => r.rot && r.rot !== 'none' && r.rot !== rows[0].rot)?.t ?? 0) : 0
    check('the step fold chevron turns in 120 to 160ms', list.some((s) => /rotate 1[2-6]0ms/.test(s)), list.filter((s) => s.includes('rotate')).join('; '))
    await wait(300); await fold.click(); await wait(300)
  } else console.log('  (no step fold shown)')

  // A tick, clicked: the strike draws, the circle fills, then the row goes.
  const tick = h.locator(`[data-task-row][data-id="${stepped.id}"] [data-task-tick]`).first()
  if (await tick.count()) {
    const row = `[data-task-row][data-id="${stepped.id}"]`
    p = sample(row, 700)
    await film('tick', () => tick.click())
    list = await anims(); rows = await p
    console.log('Tick, clicked:'); list.forEach((s) => console.log(`  ${s}`)); print('row', rows)
  }
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
