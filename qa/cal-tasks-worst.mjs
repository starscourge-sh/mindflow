// The worst case for the Calendar and Tasks (break-ui): the data a real person ends up with, seeded through the same
// doors the app's own data comes in by. Long titles with no spaces (a 60-letter word, a web address), one-letter
// titles, emoji, Arabic, Chinese and Hindi, 40 events on one day with 6 at the same hour, an all-day pile of 15, an
// event lasting 40 days, times at 00:00 and 23:59, a calendar with a long name, 300 tasks with 120 late, a 50-letter
// tag, Later with 30 tags, and 12,345 cards due (the study count is given by main, as the app's own answer would be).
// Shoots Day, Week, Month, the sidebar (Upcoming, New event), an empty day, and Tasks Today, Upcoming and Later, light
// and dark, at 1440 and 760, and checks nothing scrolls sideways, no name runs out of its box, and no row of right to
// left text is set left to right.
//
//   npx electron-vite build --outDir out-bu
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-bu/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/cal-tasks-worst.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go, size, look, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const at = (by, hour, minute = 0) => { const d = c.now(); d.setHours(hour, minute, 0, 0); d.setDate(d.getDate() + by); return d }
const wait = (ms) => h.waitForTimeout(ms)

const WORD = 'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft'.slice(0, 60)
const URL = 'https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved'
const TAG = 'customerfeedbackfromenterpriseonboardingquarterthree'.slice(0, 50)
const TITLES = [WORD, URL, 'J', '🦊 Fox standup 👩🏽‍💻', 'اجتماع مع نور الهدى عبد الرحمن', '与王秀英开会讨论季度计划和预算', 'टीम के साथ साप्ताहिक बैठक और योजना', 'Aleksandra Wiśniewska-Kowalczyk, quarterly review of the Northwind account']
const CAL = 'The Department of Continuing Education and Lifelong Learning Evening Lecture Series'.slice(0, 80)

try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  // 12,345 cards due today, as main would say it.
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('haligtree:study:days')
    ipcMain.handle('haligtree:study:days', () => {
      const key = (by) => { const d = new Date(); d.setDate(d.getDate() + by); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
      return { [key(0)]: 12345, [key(1)]: 1, [key(2)]: 987 }
    })
  })
  const cal = await v('calendar:set', { name: CAL })
  const add = (title, start, end, more = {}) => v('event:add', { title, start: start.toISOString(), end: end.toISOString(), calendarId: more.calendarId ?? 'personal', ...more })
  // 40 on today: 6 at 10:00, 15 all day, one at 00:00, one to 23:59, the rest spread through the day.
  for (let n = 0; n < 6; n++) await add(TITLES[n], at(0, 10), at(0, 11), n % 2 ? { calendarId: cal.id } : {})
  for (let n = 0; n < 15; n++) await add(`${TITLES[n % TITLES.length]}${n >= TITLES.length ? ` ${n}` : ''}`, at(0, 0), at(1, 0), { allDay: true })
  await add('Midnight launch', at(0, 0), at(0, 0, 30))
  await add('Last call 23:59', at(0, 23, 0), at(0, 23, 59))
  for (let n = 0; n < 17; n++) await add(TITLES[(n + 3) % TITLES.length], at(0, 7 + (n % 14), (n % 2) * 30), at(0, 8 + (n % 14), (n % 2) * 30), n % 3 ? {} : { calendarId: cal.id })
  // A 40-day event, and a few on the days around.
  await add(`${CAL} (spring term)`, at(-5, 0), at(35, 0), { allDay: true, calendarId: cal.id })
  for (let by = 1; by < 8; by++) await add(TITLES[by % TITLES.length], at(by, 9), at(by, 10))
  // 300 tasks: 120 late, 60 today, 60 to come, 30 in Later with 30 tags, 30 with no day.
  // Each title once: the same words again are taken as the same task (it is carried, not added).
  const titles = (n) => `${TITLES[n % TITLES.length]} ${n}${n % 9 === 0 ? ` #${TAG}` : ''}`
  for (const t of (await v('tasks')).filter((t) => t.status === 'open')) await v('task:save', t.id, { status: 'done' })
  for (let n = 0; n < 300; n++) {
    const kind = n < 120 ? 'late' : n < 180 ? 'today' : n < 240 ? 'soon' : n < 270 ? 'later' : 'none'
    const title = kind === 'later' ? `${TITLES[n % TITLES.length]} ${n} #tag${n - 240}${n === 240 ? ` #${TAG}` : ''}` : titles(n)
    const id = (await v('task:add', title, undefined, false)).id
    const patch = kind === 'late' ? { due: at(-1 - (n % 30), 9).toISOString(), allDay: 1 }
      : kind === 'today' ? (n % 4 ? { due: at(0, 0).toISOString(), allDay: 1 } : { due: at(0, n % 8 ? 14 : 23, n % 8 ? 0 : 59).toISOString(), allDay: 0, estimate: 30 })
      : kind === 'soon' ? { due: at(1 + (n % 14), 0).toISOString(), allDay: 1 } : kind === 'later' ? { plan: 'someday' } : { due: null, plan: null }
    await v('task:save', id, patch)
  }

  // Measures, on whatever is on screen: sideways scroll, text running out of its box, right-to-left words set left to right.
  const measure = () => h.evaluate(() => {
    const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth
    const scrollers = [...document.querySelectorAll('main *, section *')].filter((el) => {
      const s = getComputedStyle(el)
      return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0
    }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`)
    // A box whose text runs past its own right edge and is not clipped by it or a near parent.
    const spill = []
    for (const el of document.querySelectorAll('span, div, button, a, p, li, h1, h2, h3, label')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2)) continue
      if (el.scrollWidth - el.clientWidth <= 2) continue
      let clipped = false
      for (let p = el, i = 0; p && i < 3; p = p.parentElement, i++) { const s = getComputedStyle(p); if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') { clipped = true; break } }
      const r = el.getBoundingClientRect()
      if (!clipped && r.width > 0) spill.push(el.textContent.trim().slice(0, 30))
    }
    const rtl = [...document.querySelectorAll('span, div, button, a, p, li')].filter((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')
      return /^[\s؀-ۿ]+$/.test(own) && own.trim().length > 4 && getComputedStyle(el).direction !== 'rtl'
    }).length
    return { doc, scrollers: scrollers.slice(0, 4), spill: [...new Set(spill)].slice(0, 6), rtl }
  })
  const pass = async (label) => {
    const m = await measure()
    check(`${label}: no sideways scroll`, m.doc <= 1 && !m.scrollers.length, JSON.stringify(m.scrollers))
    check(`${label}: no words run out of their box`, !m.spill.length, m.spill.join(' | '))
    check(`${label}: Arabic reads right to left`, m.rtl === 0, `${m.rtl} set left to right`)
    if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(250); await h.screenshot({ path: `${shots}/${label}-${name}.png` }) }
    await look('light')
  }

  await go('calendar'); await wait(1500)
  for (const [w, label] of [[1440, '1440'], [760, '760']]) {
    await size(w, 900); await wait(600)
    if (await h.locator('[data-cal-right]').count() && await h.locator('[data-cal-side-toggle]').count()) { await h.locator('[data-cal-side-toggle]').click(); await wait(600) }
    for (const [k, mode] of [['d', 'day'], ['w', 'week'], ['m', 'month']]) {
      await h.keyboard.press('Escape'); await h.keyboard.press('t'); await h.keyboard.press(k); await wait(900)
      if (mode !== 'month') {
        // Today's all-day pile (15 events, 12,345 cards, 45 tasks): whole rows, and its "+N more" in sight, not scrolled off.
        const lane = await h.evaluate(() => {
          const box = document.querySelector('[data-cal-allday-lane] > .grid.overflow-y-auto, [data-cal-allday-lane] > div:last-child')?.getBoundingClientRect()
          const more = [...document.querySelectorAll('[data-cal-allday-more]')].map((el) => el.getBoundingClientRect())
          const review = document.querySelector('[data-cal-allday-lane] [data-study-review]')?.getBoundingClientRect()
          const el = document.querySelector('[data-cal-allday-lane] > div:last-child')
          return { fade: getComputedStyle(el).maskImage !== 'none', scrolls: el.scrollHeight > el.clientHeight + 1, more: more.length, hidden: more.filter((r) => r.bottom > box.bottom + 1).length, review: !!review && review.bottom <= box.bottom + 1, cut: [...document.querySelectorAll('[data-cal-allday-lane] [data-cal-event-chip]')].filter((el) => { const r = el.getBoundingClientRect(); return r.top < box.bottom - 1 && r.bottom > box.bottom + 1 }).length }
        })
        check(`${label}: ${mode}'s all-day pile shows the rest is there, no row cut in half`, lane.more > 0 && !lane.hidden && !lane.cut, JSON.stringify(lane))
        check(`${label}: ${mode} shows today's 12,345 cards`, lane.review, JSON.stringify(lane))
      }
      // The count is never cut: "12,345" whole inside its chip, the word dropped rather than cut to "ca…".
      const counts = await h.$$eval('[data-study-review]', (els) => els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => { const box = el.getBoundingClientRect(); const n = [...el.querySelectorAll('span')].find((one) => /^[\d,]+$/.test(one.textContent)); const r = n?.getBoundingClientRect(); return { text: n?.textContent, whole: !!r && r.right <= box.right + 0.5 && r.width > 0 } }))
      check(`${label}: ${mode}'s card counts are whole`, (counts.length > 0 || (label === '760' && mode === 'month')) && counts.every((one) => one.whole), JSON.stringify(counts))
      // The subtitle's numbers whole: "Weeks 44 – 49" never "Weeks 4…".
      const sub = await h.locator('[data-cal-subtitle] > span.truncate').evaluate((el) => ({ text: el.innerText, cut: el.scrollWidth > el.clientWidth + 1 }))
      check(`${label}: ${mode}'s subtitle is whole`, !sub.cut, JSON.stringify(sub))
      await pass(`cal-${label}-${mode}`)
    }
    // The sidebar: Upcoming, then New event.
    await h.keyboard.press('w'); await wait(600)
    // Narrow, there is no right panel to show (Upcoming moves into the view's menu).
    if (await h.locator('[data-cal-side-toggle]').count()) { await h.locator('[data-cal-side-toggle]').click(); await wait(800); await pass(`cal-${label}-upcoming`) }
    await h.locator('[data-cal-new-event]').click(); await wait(800)
    await pass(`cal-${label}-new`)
    await h.keyboard.press('Escape'); await wait(400)
    if (await h.locator('[data-cal-right]').count() && await h.locator('[data-cal-side-toggle]').count()) { await h.locator('[data-cal-side-toggle]').click(); await wait(600) }
    // An empty day, well past everything.
    await h.keyboard.press('d'); for (let n = 0; n < 45; n++) await h.keyboard.press('ArrowRight')
    await wait(900)
    await pass(`cal-${label}-empty-day`)
    await h.keyboard.press('t'); await wait(400)
  }
  for (const [w, label] of [[1440, '1440'], [760, '760']]) {
    await size(w, 900); await wait(500)
    for (const tab of ['today', 'upcoming', 'later']) { await go(tab); await wait(1500); await pass(`tasks-${label}-${tab}`) }
  }
  // Later's 30 tags read in counting order: Tag2 before Tag10, not Tag0, Tag1, Tag10, Tag11.
  await go('later'); await wait(1500)
  const heads = await h.evaluate(() => [...document.querySelectorAll('button, span, div')].map((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()).filter((t) => /^Tag\d+$/.test(t)).map((t) => Number(t.slice(3))))
  const order = [...new Set(heads)]
  check('Later\'s tags count up in order', order.length >= 10 && order.every((n, i) => !i || n > order[i - 1]), order.slice(0, 12).join(', '))
  check('no page errors', !c.errors.filter((e) => /PAGEERROR/.test(e)).length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  console.log('FAIL  the run stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
