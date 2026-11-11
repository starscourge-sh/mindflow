// The Calendar's month as a run of weeks (11 Nov): it scrolls up and down and rests on a week, the title's month
// changes once as a month's first week reaches the top with one firm trackpad tap, only the weeks near the screen are
// drawn, sideways swipes leave the month alone (they are Back and Forward), the arrows and Today glide and the keys go
// at once, a pinch opens a week and then a day and goes back up, a task still drags to another day, the run comes back
// where it was, and every kind of line in a day sits the same gap under its date.
// With MEASURE=1 it also times the page's first frame, the frames of a fling through 12 months and the memory, on
// this build or an older one (an older one steps the months with its arrow instead of flinging).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/month-run.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go, electron } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= !!pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const title = () => h.evaluate(() => document.querySelector('[data-cal-title] span:last-child')?.textContent ?? '')
const mode = () => h.evaluate(() => document.querySelector('[data-cal-mode]')?.getAttribute('data-cal-mode'))
const taps = async () => (await electron.evaluate(() => globalThis.haligtreeTapKinds())).filter((one) => one === 'level').length
const monthName = (by) => { const d = c.now(); d.setDate(1); d.setMonth(d.getMonth() + by); return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
const run = () => h.evaluate(() => { const el = document.querySelector('[data-month-run]'); if (!el) return null; const rows = [...el.querySelectorAll('[data-month-week]')]; const row = el.clientHeight / 6; return { top: el.scrollTop, row, rows: rows.length, rest: Math.abs(el.scrollTop / row - Math.round(el.scrollTop / row)) * row, at: Math.round(el.scrollTop / row) } })
const settle = async () => { for (let i = 0; i < 40; i++) { const a = await run(); await wait(120); const b = await run(); if (a && b && Math.abs(a.top - b.top) < 0.5) return b } return run() }
const at = (by, hour) => { const d = c.now(); d.setHours(hour, 0, 0, 0); d.setDate(d.getDate() + by); return d }
// Fingers on a trackpad, in the page's own input: a run of wheel steps that fades, as a fling's glide does.
const fling = async (total, x, y) => {
  let left = total
  let dy = Math.sign(total) * 120
  while (Math.abs(left) > 1) { const by = Math.abs(dy) > Math.abs(left) ? left : dy; await h.mouse.wheel(0, by); left -= by; await wait(8) }
}
const frames = {
  start: () => h.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__frames.length < 5000 && !window.__stop) requestAnimationFrame(tick) }; window.__stop = false; requestAnimationFrame(tick) }),
  stop: () => h.evaluate(() => { window.__stop = true; const f = window.__frames.slice(1).sort((a, b) => a - b); const p = (q) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * q))] * 10) / 10; return { frames: f.length, p50: p(0.5), p95: p(0.95), max: Math.round(f[f.length - 1] * 10) / 10, over25: f.filter((one) => one > 25).length } })
}

try {
  await v('settings:set', { hintRate: 0 })
  // 300 things over the next twelve months: 150 tasks and 150 events, some all day.
  for (let n = 0; n < 150; n++) {
    const id = (await v('task:add', `Month run task ${n}`, undefined, false)).id
    await v('task:save', id, { due: at((n * 37) % 365, 0).toISOString(), allDay: 1 })
    await v('event:add', { title: `Month run event ${n}`, start: at((n * 53) % 365, 9 + (n % 8)).toISOString(), end: at((n * 53) % 365, 10 + (n % 8)).toISOString(), calendarId: 'personal', allDay: n % 5 === 0 })
  }
  await h.evaluate(() => localStorage.setItem('vigil.calendar.mode', 'month'))
  // The page's first frame, three times, from asking for it to its days drawn and painted.
  const firsts = []
  for (let i = 0; i < 3; i++) {
    await go('home'); await wait(800)
    await h.evaluate(() => { window.__drawn = null; const t0 = performance.now(); window.__t0 = t0; const look = () => document.querySelector('[data-cal-mode="month"] [data-day]') ? requestAnimationFrame(() => (window.__drawn = performance.now() - t0)) : requestAnimationFrame(look); requestAnimationFrame(look) })
    await go('calendar')
    for (let k = 0; k < 50 && !(await h.evaluate(() => window.__drawn)); k++) await wait(50)
    firsts.push(Math.round(await h.evaluate(() => window.__drawn)))
  }
  await wait(1200)
  const isRun = !!(await run())
  const memory = await h.evaluate(() => ({ heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), nodes: document.querySelectorAll('[data-month-plan] *').length, days: document.querySelectorAll('[data-month-plan] [data-day]').length }))
  console.log(`MEASURE first frame ms ${firsts.join(', ')}; heap ${memory.heapMB} MB; month DOM nodes ${memory.nodes}; days drawn ${memory.days}`)
  // Twelve months: flung on the run, stepped by the arrow on the old six weeks.
  const box = await h.evaluate(() => { const r = document.querySelector('[data-month-plan] [data-day]').closest('[data-month-scroll]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(box.x, box.y)
  const startTitle = await title()
  await frames.start()
  if (isRun) { const r = await run(); await fling(52 * r.row, box.x, box.y) }
  else for (let i = 0; i < 12; i++) { await h.click('[data-cal-next]'); await wait(300) }
  await settle(); await wait(300)
  const flung = await frames.stop()
  const after = await h.evaluate(() => ({ heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), nodes: document.querySelectorAll('[data-month-plan] *').length }))
  console.log(`MEASURE 12 months ${isRun ? 'flung' : 'stepped'}: ${JSON.stringify(flung)}; heap after ${after.heapMB} MB; month DOM nodes ${after.nodes}; ${startTitle} -> ${await title()}`)
  if (process.env.MEASURE_ONLY) throw new Error('measured only')

  // The run itself.
  check('the month is one run of weeks that scrolls', isRun)
  const rested = await run()
  check('it rests on a week after a fling', rested.rest < 1, JSON.stringify(rested))
  check('only the weeks near the screen are drawn (8 to 12)', rested.rows >= 8 && rested.rows <= 12, `${rested.rows} weeks`)
  check('the title went on about a year', (await title()) !== startTitle, `${startTitle} -> ${await title()}`)
  // Back to now, then one week at a time down: the title changes once, as the next month's first week reaches the top, with one firm tap.
  await h.keyboard.press('t'); await settle()
  check('T brings this month back', (await title()) === monthName(0), await title())
  const tapsBefore = await taps()
  const names = new Set()
  for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, (await run()).row); await settle(); names.add(await title()) }
  const tapped = (await taps()) - tapsBefore
  check('six weeks down passes into the next month, named once', names.has(monthName(1)) && names.size <= 2, [...names].join(' | '))
  check('one firm tap as the month changed', tapped === 1, `${tapped} taps`)
  check('the title changed only when the month\'s first week was at the top', await h.evaluate(() => { const el = document.querySelector('[data-month-run]'); const row = el.clientHeight / 6; const top = [...el.querySelectorAll('[data-month-week]')].find((one) => Math.abs(one.offsetTop - el.scrollTop) < row / 2); const sunday = new Date(top.dataset.monthWeek + 'T12:00'); sunday.setDate(sunday.getDate() + 6); return document.querySelector('[data-cal-title] span:last-child').textContent === sunday.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }))
  // Item 1: sideways over a day box, twice, leaves the month alone; the month no longer keeps the swipe for itself.
  const before1 = await run()
  const cell = await h.evaluate(() => { const r = document.querySelector('[data-month-run] [data-day]:not([data-outside])').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 40 } })
  await h.mouse.move(cell.x, cell.y)
  for (let i = 0; i < 2; i++) { for (let k = 0; k < 6; k++) { await h.mouse.wheel(40, 0); await wait(16) } await wait(400) }
  check('sideways swipes over a day box do not move the month', (await run()).top === before1.top && (await mode()) === 'month')
  check('nothing in the month holds sideways swipes back from Back and Forward', !(await h.evaluate(() => !!document.querySelector('[data-month-plan] [data-swipe-own], [data-month-plan][data-swipe-own]'))))
  // The arrows glide; the keys go at once.
  await h.keyboard.press('t'); await settle()
  await h.click('[data-cal-next]')
  const glide = []
  for (let i = 0; i < 8; i++) { glide.push(Math.round((await run()).top)); await wait(30) }
  await settle()
  check('the › button glides to the next month', new Set(glide).size > 2 && (await title()) === monthName(1), glide.join(','))
  await h.keyboard.press('ArrowRight'); await wait(60)
  const keyed = await run()
  check('→ is there at once', (await title()) === monthName(2) && keyed.rest < 1, JSON.stringify(keyed))
  await h.keyboard.press('ArrowLeft'); await h.keyboard.press('ArrowLeft'); await settle()
  // Comes back where it was: two weeks into this month, away and back.
  await h.keyboard.press('t'); await settle()
  await h.mouse.move(box.x, box.y)
  await h.mouse.wheel(0, (await run()).row * 2); const kept = await settle()
  await go('home'); await wait(600); await go('calendar'); await wait(1200)
  check('the run comes back to the week it was on', (await run()).at === kept.at, `${kept.at} -> ${(await run()).at}`)
  // A task dragged to another day.
  const chip = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-month-run] [data-plan-task][data-plan-kind="planned"]')].find((one) => one.getBoundingClientRect().height > 0 && one.getBoundingClientRect().top > 100); if (!el) return null; const r = el.getBoundingClientRect(); const day = el.closest('[data-day]'); const next = day.nextElementSibling?.matches('[data-day]') ? day.nextElementSibling : day.previousElementSibling; const n = next.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2, to: next.dataset.day, tx: n.left + n.width / 2, ty: n.top + n.height - 12, name: el.textContent } })
  if (chip) {
    await h.mouse.move(chip.x, chip.y); await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(chip.x + ((chip.tx - chip.x) * i) / 12, chip.y + ((chip.ty - chip.y) * i) / 12); await wait(16) }
    await h.mouse.up(); await wait(900)
    check('a task dragged to another day moves there', await h.evaluate(([to, name]) => [...document.querySelectorAll(`[data-day="${to}"] [data-plan-task]`)].some((one) => one.textContent === name), [chip.to, chip.name]), `${chip.name} -> ${chip.to}`)
  } else check('a task to drag', false)
  // Item 2: pinch out over a week opens it, over a day the day; pinch in goes back up.
  // A pinch: a run of ctrl wheel events at the pointer, as a trackpad sends it, a few frames apart, carrying on after the level changes.
  const pinch = (x, y, dy) => h.evaluate(([x, y, dy]) => new Promise((res) => { let i = 0; const send = () => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); const tick = () => { send(); send(); if (++i < 7) setTimeout(tick, 12); else res() }; tick() }), [x, y, dy])
  const week = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-month-run] [data-month-week]')].find((one) => one.getBoundingClientRect().top > 150); const r = el.getBoundingClientRect(); return { monday: el.dataset.monthWeek, x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  const grows = []
  await h.evaluate(() => { window.__grow = []; const el = document.querySelector('[data-cal-level]'); const tick = () => { window.__grow.push(el.getAnimations().length); if (window.__grow.length < 30) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await pinch(week.x, week.y, -6); await wait(700)
  grows.push(...(await h.evaluate(() => window.__grow)))
  check('pinching out over a week opens that week', (await mode()) === 'week' && (await h.evaluate((m) => !!document.querySelector(`[data-cal-col="${m}"]`), week.monday)), `${await mode()} ${week.monday}`)
  check('the week grows from its row', grows.some((n) => n > 0))
  await pinch(week.x, week.y, -6); await wait(700)
  const col = await h.evaluate(() => { const el = document.querySelectorAll('[data-cal-col]')[2]; const r = el.getBoundingClientRect(); return { day: el.dataset.calCol, x: r.left + r.width / 2, y: Math.max(r.top, 300) + 100 } })
  await wait(300)
  await pinch(col.x, col.y, -6); await wait(700)
  check('pinching out over a day in Week opens that day', (await mode()) === 'day' && (await h.evaluate((d) => document.querySelectorAll('[data-cal-col]').length === 1 && !!document.querySelector(`[data-cal-col="${d}"]`), col.day)), col.day)
  await wait(300)
  await pinch(col.x, col.y, 6); await wait(700)
  check('pinching in from a day goes back to its week', (await mode()) === 'week')
  await wait(300)
  await pinch(col.x, col.y, 6); await wait(700)
  check('pinching in from a week goes back to the month', (await mode()) === 'month' && !!(await run()))
  await pinch(col.x, col.y, 6); await wait(500)
  check('pinching in on the month stays on the month', (await mode()) === 'month')
  // Keys still change the level, with no animation.
  await h.keyboard.press('w'); const anims = await h.evaluate(() => document.querySelector('[data-cal-level]').getAnimations().length)
  check('W opens Week at once, nothing grows', (await mode()) === 'week' && anims === 0)
  await h.keyboard.press('m'); await wait(800)
  // Item 3: every kind of line sits the same gap under its date.
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('haligtree:study:days')
    ipcMain.handle('haligtree:study:days', () => { const d = new Date(); return { [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`]: 1 } })
  })
  await h.keyboard.press('d'); await wait(400); await h.keyboard.press('m'); await wait(1200)
  const gaps = await h.evaluate(() => {
    const kinds = { task: '[data-plan-task]', review: '[data-study-review]', book: '[data-study-book]', event: '[data-cal-event-chip]', mark: '[data-mark-flag]' }
    const out = {}
    for (const [kind, sel] of Object.entries(kinds)) {
      for (const cell of document.querySelectorAll('[data-month-run] [data-day]')) {
        const date = cell.querySelector('[data-day-number]')?.getBoundingClientRect()
        const lines = [...cell.querySelectorAll('[data-plan-task], [data-study-review], [data-study-book], [data-cal-event-chip], [data-mark-flag]')].filter((one) => one.getClientRects().length && !one.closest('[data-month-bars]'))
        const firstLine = lines[0]
        if (!date || !firstLine || !firstLine.matches(sel)) continue
        // Where its ink starts: the tinted chip's own top, or the text's top for a line with no tint.
        const tinted = getComputedStyle(firstLine).backgroundColor !== 'rgba(0, 0, 0, 0)'
        const words = [...firstLine.querySelectorAll('span')].find((one) => one.textContent.trim()) ?? firstLine
        const range = document.createRange(); range.selectNodeContents(words)
        const r = tinted ? firstLine.getBoundingClientRect() : range.getBoundingClientRect()
        out[kind] = { gap: Math.round((r.top - date.bottom) * 10) / 10, tinted, h: Math.round(r.height) }
        break
      }
    }
    return out
  })
  console.log('gaps under the date', JSON.stringify(gaps))
  const tops = Object.values(gaps).map((one) => one.gap)
  check('the review chip has room above it, as a task line does', gaps.review && gaps.review.gap >= 2, JSON.stringify(gaps.review))
  check('every kind of line starts the same gap under its date', tops.length >= 3 && Math.max(...tops) - Math.min(...tops) <= 1.5, JSON.stringify(gaps))
  if (process.env.SHOT) await c.both(process.env.SHOT)
} catch (error) { if (error.message !== 'measured only') check('the run finished', false, error.message.split('\n')[0]) }
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
if (!process.env.MEASURE_ONLY) check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(ok ? 0 : 1)
