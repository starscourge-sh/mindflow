// The Calendar's look, for the eye: Day, Week, Month and "New event", in light
// and dark, at 1440 and at the narrowest window (560), with 5, 50 or 500
// events (COUNT). Checks that nothing scrolls sideways, that timed tasks show
// their names at their time, that the side panels' lists are islands (icon,
// name, count, fold), that the late count is its own pill, and that the long
// instruction paragraphs are gone.
//
//   npx electron-vite build --outDir out-cal
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-cal/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir COUNT=50 node qa/calendar-pass.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
const count = Number(process.env.COUNT ?? 5)
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go, size, look } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const at = (by, hour, minute = 0) => { const d = c.now(); d.setHours(hour, minute, 0, 0); d.setDate(d.getDate() + by); return d }
try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  // Timed tasks: a short one (15 min), an hour, one done; a late one; a few with no day.
  const timed = [['Call the bank', 0, 9, 15], ['Read chapter 4', 0, 13, 60], ['Gym', 1, 7, 30], ['Draft essay intro', -1, 15, 45]]
  for (const [title, by, hour, est] of timed) await v('task:save', (await v('task:add', title)).id, { due: at(by, hour).toISOString(), allDay: 0, estimate: est })
  await v('task:save', (await v('task:add', 'Return library books')).id, { due: at(-3, 10).toISOString(), allDay: 1 })
  for (const title of ['Plan the trip', 'Sort photos', 'Email Sam back']) await v('task:add', title)
  // Events spread over the month, a few each day, some long names.
  const names = ['Team sync', 'Lunch with Sam', 'Dentist', 'Lecture: Organic Chemistry II, room 4.12', 'Run', 'Book club']
  for (let n = 0; n < count; n++) {
    const by = (n % 30) - 12
    const hour = 8 + ((n * 3) % 10)
    const start = at(by, hour, n % 2 ? 30 : 0)
    await v('event:add', { title: names[n % names.length], start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), calendarId: 'personal' })
  }
  await go('calendar'); await h.waitForTimeout(1500)

  const wide = async () => h.evaluate(() => {
    const page = document.querySelector('[data-cal-mode]')?.closest('section') ?? document.body
    return { over: page.scrollWidth - page.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })
  for (const [w, label] of [[1440, '1440'], [560, '560']]) {
    await size(w, 900); await h.waitForTimeout(600)
    for (const [k, mode] of [['d', 'day'], ['w', 'week'], ['m', 'month']]) {
      await h.keyboard.press('Escape'); await h.keyboard.press(k); await h.waitForTimeout(700)
      const o = await wide()
      check(`${label}: ${mode} has no sideways scroll`, o.over <= 1 && o.doc <= 1, JSON.stringify(o))
      if (mode !== 'month') {
        // Every timed task in view says its name at its time, readable (not cut to nothing).
        const names = await h.$$eval('[data-cal-block]', (els) => els.map((el) => {
          const name = el.querySelector('[data-cal-block-name]')
          const box = name?.getBoundingClientRect()
          return { text: name?.textContent ?? '', width: box?.width ?? 0, height: el.getBoundingClientRect().height }
        }))
        // A crowded hour never becomes a barcode: past a few side by side, "+N" opens the day.
        const thin = await h.$$eval('[data-cal-event], [data-cal-block], [data-cal-capture]', (els) => els.filter((el) => el.getBoundingClientRect().width < 14).length)
        check(`${label}: ${mode} draws no sliver too thin to read`, thin === 0, `${thin} under 14px, ${await h.locator('[data-cal-crowd-more]').count()} "+N"`)
        check(`${label}: ${mode}'s timed tasks show their names`, names.length > 0 && names.every((one) => one.text.length > 0 && one.width >= 24 && one.height >= 18), JSON.stringify(names.slice(0, 4)))
      }
      if (shots) for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(250); await h.screenshot({ path: `${shots}/cal-${count}-${label}-${mode}-${name}.png` }) }
      await look('light')
    }
  }
  await size(1440, 900); await h.keyboard.press('w'); await h.waitForTimeout(600)
  // At 1440 the header is one line: "New event" sits level with the title, not on a line of its own.
  const [title, add] = await Promise.all(['[data-cal-jump]', '[data-cal-new-event]'].map((sel) => h.locator(sel).boundingBox()))
  check('1440: the header is one line', Math.abs(title.y - add.y) < 24, `${title.y} ${add.y}`)
  // Captures, when shown, are pills with their words at their minute.
  const caps = await h.$$eval('[data-cal-capture]', (els) => els.map((el) => ({ text: el.querySelector('[data-cal-capture-name]')?.textContent ?? '', width: el.getBoundingClientRect().width })))
  check('captures show their words, not a dot', caps.every((one) => one.text.length > 0 && one.width >= 24), JSON.stringify(caps.slice(0, 3)))
  if (!(await h.locator('[data-cal-right]').count())) { await h.locator('[data-cal-side-toggle]').click(); await h.waitForTimeout(600) }
  if (shots) for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(250); await h.screenshot({ path: `${shots}/cal-${count}-1440-week-upcoming-${name}.png` }) }
  await look('light')
  // The side panels' lists are islands.
  const heads = await h.$$eval('[data-island-head]', (els) => els.map((el) => el.getAttribute('data-island-head')))
  check('the left panel\'s lists are islands', heads.includes('My calendars') && heads.includes('Unscheduled'), heads.join(', '))
  check('the right panel\'s Upcoming is an island', heads.includes('Upcoming'), heads.join(', '))
  check('no instruction paragraphs left', (await h.locator('text=/Tick one to show|The same tasks as in Tasks|Then the place, people/').count()) === 0)
  check('"Useful shortcuts" is gone from the rail', (await h.locator('[data-cal-shortcuts]').count()) === 0)
  const late = await h.locator('[data-late-all]').first()
  const lateBox = await late.boundingBox().catch(() => null)
  const lateLook = lateBox ? await late.evaluate((el) => ({ size: getComputedStyle(el).fontSize, bg: getComputedStyle(el).backgroundColor })) : null
  check('"1 late" has its own pill, not grey text', !!lateBox && lateLook.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(lateLook.size) >= 13, JSON.stringify(lateLook))
  // New event, light and dark, both widths.
  for (const [w, label] of [[1440, '1440'], [560, '560']]) {
    await size(w, 900); await h.waitForTimeout(400)
    await h.locator('[data-cal-new-event]').click(); await h.waitForTimeout(700)
    check(`${label}: "New event" opens its words field`, (await h.locator('[data-new-event-words]').count()) === 1)
    const o = await wide()
    check(`${label}: "New event" has no sideways scroll`, o.over <= 1 && o.doc <= 1, JSON.stringify(o))
    if (shots) for (const name of ['light', 'dark']) { await look(name); await h.waitForTimeout(250); await h.screenshot({ path: `${shots}/cal-${count}-${label}-new-${name}.png` }) }
    await look('light')
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  if (shots) {
    // The siblings, for the eye: Inbox and Tasks at the same size.
    await size(1440, 900)
    for (const id of ['inbox', 'today']) { await go(id); await h.waitForTimeout(900); await h.screenshot({ path: `${shots}/sib-${id}-light.png` }) }
  }
  const errors = c.errors.filter((one) => !/favicon|ResizeObserver/.test(one))
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (error) {
  console.log('FAIL  threw', error.message.split('\n')[0])
  results.push(false)
} finally {
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
