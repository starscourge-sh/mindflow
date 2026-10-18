// The Calendar's ⌘K, late tasks, planned against did and the wraps, driven on
// sandbox data: "next tuesday" in ⌘K goes there; a task weeks ahead is found
// by its title and opened on its day; "N late · Reschedule all…" moves every
// late one and ⌘Z puts them back, and a late day's right click offers it;
// with a block picked, ⌘K is about it ("move this to Friday 3pm", "+1h",
// "make it 45 minutes", "duplicate to next week", "delete"), each undone; a
// block with a length and focus says "planned 2h · did 3h", the header
// totals the week and Close the week lists the gaps; the month's wrap is
// offered once after the 1st and opens the story; the Sunday digest's week
// opens its own.
//
//   npx electron-vite build --outDir out-calcmd
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-calcmd/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/cal-commands.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (by, hour = 10, minute = 0) => { const d = new Date(); d.setHours(hour, minute, 0, 0); d.setDate(d.getDate() + by); return d }
const find = async (id) => (await v('tasks')).find((one) => one.id === id)
const shots = process.env.SHOTS
const shot = async (name) => shots && h.screenshot({ path: `${shots}/${name}.png` })
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const today = key(new Date())
const lateNow = async () => (await v('tasks')).filter((one) => one.status === 'open' && one.dueAt && key(new Date(one.dueAt)) < today)
const palette = async (words) => {
  await h.keyboard.press('Meta+k'); await h.waitForTimeout(500)
  if (words) { await h.keyboard.type(words, { delay: 15 }); await h.waitForTimeout(600) }
}
const firstRow = () => h.locator('[data-search-at]').first().innerText().catch(() => '')

try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  for (const n of [1, 2, 3]) await v('task:save', (await v('task:add', `calcmd late ${n}`)).id, { due: at(-n, 9).toISOString(), allDay: 1 })
  const future = (await v('task:add', 'calcmd zebra crossing')).id
  await v('task:save', future, { due: at(20, 14).toISOString(), allDay: 0, estimate: 30 })
  // A block with a two-hour length and three hours of focus today, and one with an hour and half an hour's.
  const hour = Math.max(1, Math.min(new Date().getHours() - 4, 18))
  const block = (await v('task:add', 'calcmd block')).id
  await v('task:save', block, { due: at(0, hour).toISOString(), allDay: 0, estimate: 120 })
  const under = (await v('task:add', 'calcmd under')).id
  await v('task:save', under, { due: at(0, hour + 3).toISOString(), allDay: 0, estimate: 60 })
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
  await v('sandbox:age', [
    { sessionAt: ago(200), endedAt: ago(20), taskId: block, plannedMs: 120 * 60_000 },
    { sessionAt: ago(15), endedAt: ago(1), taskId: under, plannedMs: 60 * 60_000 },
    { sessionAt: ago(45), endedAt: ago(29), taskId: under, plannedMs: 60 * 60_000 }
  ])

  // --- 1. Search that finds future dates
  await go('calendar'); await h.waitForTimeout(1500)
  await h.keyboard.press('w'); await h.waitForTimeout(400)
  await palette('next tuesday')
  const said = await firstRow()
  check('"next tuesday" in ⌘K offers Go to that Tuesday', /^Go to Tuesday \d+ \w+/.test(said), said)
  await shot('cmdk-next-tuesday')
  const [, d, m] = /Tuesday (\d+) (\w+)/.exec(said) ?? []
  const want = new Date(new Date().getFullYear() + (MONTHS.indexOf(m) < new Date().getMonth() ? 1 : 0), MONTHS.indexOf(m), Number(d))
  await h.keyboard.press('Enter'); await h.waitForTimeout(900)
  check('Enter goes to that day on the Calendar', await h.locator(`[data-cal-head="${key(want)}"]`).count() === 1, key(want))
  // From elsewhere too: Today, then "christmas".
  await go('today'); await h.waitForTimeout(800)
  await palette('christmas')
  const xmas = await firstRow()
  check('"christmas" from Today offers the 25th of December', /^Go to \w+ 25 December/.test(xmas), xmas)
  await h.keyboard.press('Enter'); await h.waitForTimeout(1500)
  check('and opens the Calendar there', await h.locator('[data-cal-mode]').count() === 1 && await h.locator('[data-cal-head$="-12-25"], [data-month-plan] [data-day$="-12-25"]').count() >= 1)

  // A task weeks ahead found by its title, with its day, and opened where it sits.
  await go('calendar'); await h.waitForTimeout(1000)
  await h.keyboard.press('t'); await h.waitForTimeout(400)
  await palette('zebra crossing')
  const row = h.locator('button[data-row]', { hasText: 'calcmd zebra crossing' }).first()
  const day = await row.locator('[data-search-task-day]').innerText().catch(() => '')
  check('a future task is found by title, with its day', day.includes(String(at(20).getDate())), day)
  await shot('cmdk-future-task')
  await row.click(); await h.waitForTimeout(1200)
  check('opening it jumps the Calendar to its day and opens it', await h.locator(`[data-cal-head="${key(at(20))}"]`).count() === 1 && await h.locator(`[data-cal-block="${future}"]`).count() === 1, key(at(20)))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  // --- 2. Reschedule all
  await h.keyboard.press('t'); await h.waitForTimeout(500)
  const before = await lateNow()
  const button = h.locator('[data-late-all]').first()
  check('the Calendar says how many are late', (await button.innerText()).replace(/\s+/g, ' ').startsWith(`${before.length} late`), `${await button.innerText()} / ${before.length}`)
  await button.click(); await h.waitForTimeout(400)
  await shot('late-menu')
  await h.locator('[data-late-to="tomorrow"]').click(); await h.waitForTimeout(1200)
  const tomorrow = key(at(1))
  const moved = await Promise.all(before.map((one) => find(one.id)))
  check(`Reschedule all → Tomorrow moves all ${before.length}`, moved.every((one) => key(new Date(one.dueAt)) === tomorrow) && (await lateNow()).length === 0, moved.map((one) => one.dueAt.slice(0, 10)).join(' '))
  check('times are kept', moved.every((one, i) => new Date(one.dueAt).getHours() === new Date(before[i].dueAt).getHours()))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  const back = await Promise.all(before.map((one) => find(one.id)))
  check('⌘Z puts every one back', back.every((one, i) => one.dueAt === before[i].dueAt), back.map((one) => one.dueAt.slice(0, 10)).join(' '))
  // Spread over three days.
  await h.locator('[data-late-all]').first().click(); await h.waitForTimeout(300)
  await h.locator('[data-late-to="spread"]').click(); await h.waitForTimeout(1200)
  const spread = new Set((await Promise.all(before.map((one) => find(one.id)))).map((one) => key(new Date(one.dueAt))))
  check('Spread over the next 3 days uses three days from today', [...spread].every((one) => [today, key(at(1)), key(at(2))].includes(one)) && spread.size === Math.min(3, before.length), [...spread].join(' '))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  // Today has it too.
  await go('today'); await h.waitForTimeout(1200)
  check('Today shows "N late · Reschedule all…" on Overdue', (await h.locator('[data-late-all]').first().innerText().catch(() => '')).includes('Reschedule all'))
  await shot('today-late')
  // A late day's right click.
  await go('calendar'); await h.waitForTimeout(1000)
  await h.keyboard.press('d'); await h.waitForTimeout(300)
  await h.keyboard.press('ArrowLeft'); await h.waitForTimeout(500)
  await h.locator(`[data-cal-head="${key(at(-1))}"]`).click({ button: 'right' }); await h.waitForTimeout(500)
  const menu = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('a late day\'s right click offers Reschedule all late', menu.includes('Reschedule all late'), menu.replace(/\n/g, ' | '))
  await shot('late-day-menu')
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  // --- 3. ⌘K about the picked block
  await h.keyboard.press('t'); await h.waitForTimeout(300)
  await h.keyboard.press('w'); await h.waitForTimeout(600)
  const pickBlock = async () => {
    if (await h.locator('[data-day-side]').count()) { await h.locator('[data-day-side-close]').click(); await h.waitForTimeout(500) }
    // Back to this week, where the block is: a move just made may have taken the page to Friday's.
    await h.keyboard.press('t'); await h.waitForTimeout(400)
    const b = h.locator(`[data-cal-block="${block}"]`)
    await b.scrollIntoViewIfNeeded(); await b.click(); await h.waitForTimeout(600)
  }
  await pickBlock()
  await palette()
  check('with a block picked, ⌘K opens about it', (await h.locator('[data-search-scope]').innerText().catch(() => '')).includes('calcmd block'))
  await h.keyboard.type('move this to Friday 3pm', { delay: 10 }); await h.waitForTimeout(500)
  check('"move this to Friday 3pm" reads as a move', (await firstRow()).startsWith('Move “calcmd block” to'), await firstRow())
  await shot('cmdk-scoped-move')
  const was = await find(block)
  await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  let t = await find(block)
  check('it lands on Friday at 15:00', new Date(t.dueAt).getDay() === 5 && new Date(t.dueAt).getHours() === 15 && !t.allDay, t.dueAt)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  t = await find(block)
  check('⌘Z puts it back', t.dueAt === was.dueAt, t.dueAt)
  for (const [words, ok, name] of [
    ['+1h', (one) => new Date(one.dueAt).getHours() === hour + 1, '"+1h" moves it an hour later'],
    ['make it 45 minutes', (one) => one.estimate === 45, '"make it 45 minutes" sets its length'],
    ['every last friday', (one) => one.recurrence === 'every last friday', '"every last friday" makes it repeat']
  ]) {
    await pickBlock()
    await palette(words)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    t = await find(block)
    check(name, ok(t), JSON.stringify({ due: t.dueAt, est: t.estimate, rec: t.recurrence }))
    await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
    t = await find(block)
    check(`  and ⌘Z undoes it`, t.dueAt === was.dueAt && t.estimate === was.estimate && (t.recurrence ?? null) === (was.recurrence ?? null))
  }
  await pickBlock()
  await palette('duplicate to next week')
  await h.keyboard.press('Enter'); await h.waitForTimeout(1500)
  const copies = (await v('tasks')).filter((one) => one.title === 'calcmd block' && one.status === 'open')
  check('"duplicate to next week" makes a copy a week on', copies.length === 2 && copies.some((one) => key(new Date(one.dueAt)) === key(at(7))), copies.map((one) => one.dueAt).join(' '))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  check('  and ⌘Z takes the copy away', (await v('tasks')).filter((one) => one.title === 'calcmd block' && one.status === 'open').length === 1)
  await h.keyboard.press('t'); await h.waitForTimeout(600)
  await pickBlock()
  await palette('delete')
  await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  check('"delete" moves it to the Bin', (await find(block)).status === 'dropped')
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  check('  and ⌘Z brings it back', (await find(block)).status === 'open')
  // With nothing picked: the Calendar's own.
  if (await h.locator('[data-day-side]').count()) { await h.locator('[data-day-side-close]').click(); await h.waitForTimeout(500) }
  await h.locator('[data-cal-subtitle]').click(); await h.waitForTimeout(300)
  await palette('month view')
  check('without a pick, ⌘K has the Calendar\'s own (Month view)', (await firstRow()).startsWith('Month view'), await firstRow())
  await h.keyboard.press('Enter'); await h.waitForTimeout(600)
  check('  and it switches the view', (await h.locator('[data-cal-mode]').getAttribute('data-cal-mode')) === 'month')
  await h.keyboard.press('w'); await h.waitForTimeout(800)

  // --- 4. Planned against did
  await h.keyboard.press('t'); await h.waitForTimeout(800)
  const plan = await h.locator(`[data-cal-block="${block}"] [data-plan-did]`).innerText().catch(() => '')
  check('a block with a length and focus says planned 2h · did 3h', plan.replace(/\s+/g, ' ') === 'planned 2h · did 3h', plan)
  check('  over in orange', await h.locator(`[data-cal-block="${block}"] [data-plan-did][data-over]`).count() === 1)
  const less = await h.locator(`[data-cal-block="${under}"] [data-plan-did]`).innerText().catch(() => '')
  check('one done in less says so, not over', less.replace(/\s+/g, ' ') === 'planned 1h · did 30m' && await h.locator(`[data-cal-block="${under}"] [data-plan-did][data-over]`).count() === 0, less)
  const total = await h.locator('[data-plan-total]').innerText().catch(() => '')
  check('the header totals the week', /^Planned .+ · did .+ this week$/.test(total.replace(/\s+/g, ' ')), total)
  await h.locator(`[data-cal-block="${block}"]`).scrollIntoViewIfNeeded()
  await shot('week-planned-did')
  await h.keyboard.press('d'); await h.waitForTimeout(600)
  check('the Day view shows it too', (await h.locator(`[data-cal-block="${block}"] [data-plan-did]`).innerText().catch(() => '')).includes('did 3h') && /today$/.test(await h.locator('[data-plan-total]').innerText().catch(() => '')))
  await shot('day-planned-did')
  await h.keyboard.press('w'); await h.waitForTimeout(400)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week'))); await h.waitForTimeout(1200)
  const gaps = await h.locator('[data-close-week] [data-planned-vs-did]').innerText().catch(() => '')
  check('Close the week lists the biggest gaps', gaps.includes('Planned vs did') && gaps.includes('calcmd block'), gaps.replace(/\n/g, ' | ').slice(0, 200))
  await h.locator('[data-close-week] [data-planned-vs-did]').screenshot({ path: shots ? `${shots}/close-week-gaps.png` : undefined }).catch(() => {})
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  await go('weekpage'); await h.waitForTimeout(1200)
  check('the week\'s page has it too', (await h.locator('[data-planned-vs-did]').innerText().catch(() => '')).includes('calcmd block'))

  // --- 5. The month's wrap, offered once
  check('a new book is not offered a wrap', await h.locator('[data-wrap-offer]').count() === 0)
  const last = new Date(); last.setDate(1); last.setMonth(last.getMonth() - 1)
  const before2 = new Date(last); before2.setMonth(before2.getMonth() - 1)
  check('the first open only noted the month', (await v('settings')).wrapOffered === `${last.getFullYear()}-${pad(last.getMonth() + 1)}`, (await v('settings')).wrapOffered)
  await v('settings:set', { wrapOffered: `${before2.getFullYear()}-${pad(before2.getMonth() + 1)}` })
  await h.reload(); await h.waitForTimeout(4500)
  const offer = await h.locator('[data-wrap-offer]').innerText().catch(() => '')
  check('after the 1st, the month\'s wrap is offered', offer.includes(`Your ${MONTHS[last.getMonth()]}, wrapped`), offer.replace(/\n/g, ' | '))
  await shot('wrap-offer')
  await h.locator('[data-wrap-open]').click(); await h.waitForTimeout(1500)
  const cards = await h.locator('[data-wrap-story] [aria-label^="Card "]').count()
  check('Open shows the story, 5 to 8 cards', await h.locator('[data-wrap-story]').count() === 1 && cards >= 5 && cards <= 8, String(cards))
  for (let i = 0; i < cards; i++) {
    await h.waitForTimeout(2600)
    await shot(`wrap-month-${i + 1}-${await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')}`)
    await h.keyboard.press('ArrowRight')
  }
  await h.keyboard.press('Escape'); await h.waitForTimeout(600)
  check('Esc closes it', await h.locator('[data-wrap-story]').count() === 0)
  await h.reload(); await h.waitForTimeout(4500)
  check('it is offered only once', await h.locator('[data-wrap-offer]').count() === 0)

  // --- 6. The Sunday digest's week
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  await send('wrap', `week:${key(monday)}`); await h.waitForTimeout(1800)
  check('the digest\'s click opens the week\'s wrap', (await h.locator('[data-wrap-story]').getAttribute('data-wrap-story').catch(() => '')) === `week:${key(monday)}` && (await h.locator('[data-wrap-story]').innerText()).includes('Your week, wrapped'))
  await shot('wrap-week-intro')
  await h.keyboard.press('ArrowRight'); await h.waitForTimeout(2600)
  await shot('wrap-week-2')
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // With Reduce motion.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await send('wrap', `week:${key(monday)}`); await h.waitForTimeout(1200)
  check('with Reduce motion it still opens', await h.locator('[data-wrap-story]').count() === 1)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' / '))
} catch (error) {
  console.log('FAIL  probe crashed', error)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
