// An everyday user on Tasks' All tab, one task open beside the list (scheduled tomorrow, two steps, urgent), scrolls
// back to the top and ticks off an overdue task there. The list stays where it was (within 2px, read every 50 ms for a
// second): ticking once scrolled it to the open task far below (22 Nov). And every task draws once, in the one section
// its day puts it in, its steps only as its "0/2" chip: on a Sunday (weeks start on Monday) a task for tomorrow stood
// under Tomorrow and Later both, and React's doubled rows multiplied with each draw (four, then five of it).
// Run on a Sunday morning by the app's own clock, so the Sunday split is met whatever day it really is.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=/abs/dir] node qa/tasks-tick-still.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1280, height: 800, at: '10:00', weekday: 0 })
const { h, v, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
// Every task row drawn in the list, by id, with the section heading it sits under.
const drawn = () => h.evaluate(() => [...document.querySelectorAll('[data-vlist] [data-task-row]')].map((row) => {
  const at = row.closest('[data-index]')
  let heading = ''
  for (let one = at?.previousElementSibling; one && !heading; one = one.previousElementSibling) heading = one.querySelector('h2')?.firstChild?.textContent?.trim() ?? ''
  return { id: row.getAttribute('data-id'), heading }
}))
const twice = (rows) => [...new Set(rows.map((one) => one.id).filter((id, at, all) => all.indexOf(id) !== at))]
const scrollTop = () => h.evaluate(() => {
  let box = document.querySelector('[data-vlist]')?.parentElement
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  return box ? box.scrollTop : -1
})
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // Set up through the app's own doors: a dozen overdue chores, and the one this person has open, for tomorrow.
  const made = await h.evaluate(async () => {
    const day = (by) => { const at = new Date(); at.setDate(at.getDate() + by); at.setHours(0, 0, 0, 0); return at.toISOString() }
    const add = async (title, patch) => { const { id } = await window.api.haligtree('task:add', title); await window.api.haligtree('task:save', id, patch); return id }
    const chores = ['find new action items from spending report', 'sort the receipts pile', 'answer the landlord', 'book the dentist', 'renew the library card', 'return the jacket', 'water the ferns', 'file the insurance form', 'call the bank', 'back up the photos', 'clean the inbox', 'order printer ink']
    const late = []
    for (const title of chores) late.push(await add(title, { due: day(-1), allDay: 1 }))
    const open = await add('load new seller categories and products', { due: day(1), allDay: 1, priority: 1, important: 1, reschedules: 1, subtasks: [{ text: 'test 1', done: false }, { text: 'test 2 @ 3', done: false }] })
    return { late, open }
  })
  await c.go('alltasks')
  await until(async () => (await drawn()).some((one) => one.id === made.late[0]))
  // Opened from its row, as a person does: it may scroll to it.
  const openRow = h.locator(`[data-task-row][data-id="${made.open}"] button[data-row]`)
  await openRow.scrollIntoViewIfNeeded()
  await openRow.click()
  check('the task opens beside the list', await until(() => h.locator(`[data-task-row][data-id="${made.open}"][data-open]`).count()))
  await wait(600)
  // Back to the top with the wheel, to the overdue ones.
  const box = await h.locator('[data-vlist]').boundingBox()
  await h.mouse.move(box.x + 200, box.y + 200)
  for (let i = 0; i < 40 && (await scrollTop()) > 0; i++) (await h.mouse.wheel(0, -600), await wait(60))
  await wait(500)
  const before = await drawn()
  check('every task draws once before the tick', !twice(before).length, `twice: ${twice(before).join(', ')}`)
  check('the open task is under Tomorrow alone', before.filter((one) => one.id === made.open).map((one) => one.heading).join(',') === 'Tomorrow' || !before.some((one) => one.id === made.open), JSON.stringify(before.filter((one) => one.id === made.open)))
  check('the open task is out of sight below, as the user had it', !(await h.locator(`[data-task-row][data-id="${made.open}"]`).isVisible()) || (await h.locator(`[data-task-row][data-id="${made.open}"]`).boundingBox()).y > 800)
  if (shots) await h.screenshot({ path: `${shots}/tick-before.png` })
  // Tick the first overdue one off, near the top, and read the scroll every 50 ms for a second.
  const target = made.late[0]
  const was = await scrollTop()
  await h.locator(`[data-task-row][data-id="${target}"] [data-task-tick]`).click()
  const tops = []
  for (let i = 0; i < 20; i++) (tops.push(await scrollTop()), await wait(50))
  const most = Math.max(...tops.map((one) => Math.abs(one - was)))
  check('ticking leaves the list where it is (within 2px for a second)', most <= 2, `was ${was}, read ${tops.join(' ')}`)
  check('the ticked task leaves the list', await until(async () => !(await drawn()).some((one) => one.id === target)))
  // A few more draws (a save, the side panel, a minute's tick), then every row counted again, top to bottom.
  await h.locator(`[data-task-row][data-id="${made.late[1]}"] [data-task-tick]`).click()
  await wait(1500)
  // Down to the open one: Tomorrow and Later are drawn there, side by side.
  await h.locator(`[data-task-row][data-id="${made.open}"]`).first().scrollIntoViewIfNeeded()
  await wait(400)
  const after = await drawn()
  check('the task stays open beside the list', (await h.locator('[data-task-row][data-open]').count()) === 1)
  check('every task draws once after two ticks', !twice(after).length, `twice: ${twice(after).join(', ')}`)
  const mine = after.filter((one) => one.id === made.open)
  check('the open task draws once, under Tomorrow', mine.length === 1 && mine[0].heading === 'Tomorrow', JSON.stringify(mine))
  const row = h.locator(`[data-task-row][data-id="${made.open}"]`).first()
  check('its steps show only as its 0/2 chip, never as rows of their own', (await row.locator('[data-steps-fold]').innerText()).includes('0/2') && !(await row.locator('[data-steps-of]').count()))
  const book = (await v('tasks')).filter((one) => one.id === made.open)
  check('the book holds it once', book.length === 1)
  if (shots) await h.screenshot({ path: `${shots}/tick-after.png` })
  check('no page errors (and no doubled keys)', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
