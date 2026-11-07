// Tasks as one list, each tab saying what it holds:
// 1. Today's list and the written-out day keep one order (Your order), and ⌥J moves a task past one of another priority.
// 2. All counts every open task, those on hold from a fresh start too.
// 3. A fresh start folds its tasks under "On hold" in their own tab, dimmed once unfolded; Later is not where they go.
// 4. A late task leads every tab under "Overdue"; Later never shows "Late ·".
// 5. Upcoming has no "No date" group; an undated task is in Later.
// 6. "Priority, then due date" is a sort beside "Your order", and orders by priority, then the day.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-tasks/main/index.js HALIGTREE_QA_AWAY=1 node qa/tasks-one-list.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const body = () => h.evaluate(() => document.body.innerText)
const heads = () => h.evaluate(() => [...document.querySelectorAll('h2')].map((x) => x.textContent.trim()))
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-task-row]')].map((x) => x.getAttribute('data-id')))
const count = () => h.evaluate(() => Number(document.querySelector('[data-list-count]')?.getAttribute('data-list-count') ?? -1))
const add = async (words, today = false) => (await v('task:add', words, undefined, today)).id
const day = (n) => new Date(Date.now() + n * 864e5).toISOString()
const shot = async (name) => shots && (await h.screenshot({ path: `${shots}/${name}.png` }))
const view = (mode, sort, group = 'when') => h.evaluate(([m, s, g]) => localStorage.setItem(`view:tasks:${m}`, JSON.stringify({ sort: s, group: g, filter: {} })), [mode, sort, group])
try {
  // A clean slate: every seeded task done, so only these are counted.
  for (const t of (await v('tasks')).filter((t) => t.status === 'open')) await v('task:save', t.id, { status: 'done' })
  await view('today', 'manual'); await view('upcoming', 'manual'); await view('later', 'manual'); await view('alltasks', 'manual')
  await h.reload(); await wait(1500)

  // 1. One order on Today, whichever way it is looked at.
  const a = await add('aa write the brief', true)
  const b = await add('bb call the bank', true)
  const cc = await add('cc post the parcel', true)
  await v('task:save', a, { sortOrder: 0, priority: 4 })
  await v('task:save', b, { sortOrder: 1, priority: 1 })
  await v('task:save', cc, { sortOrder: 2, priority: 4 })
  await go('today'); await wait(1200)
  const listed = (await rows()).filter((id) => [a, b, cc].includes(id))
  check('Today\'s list is in your order, not by priority', listed.join() === [a, b, cc].join(), listed.map((id) => ({ [a]: 'aa', [b]: 'bb', [cc]: 'cc' })[id]).join(' '))
  await shot('today-list')
  await h.click('[data-write-day]'); await wait(1200)
  const written = await h.evaluate(() => [...document.querySelectorAll('[data-day-line]')].map((x) => x.getAttribute('data-day-line')))
  const writtenOurs = written.filter((id) => [a, b, cc].includes(id))
  check('the written-out day has the same order', writtenOurs.join() === listed.join(), `${writtenOurs.length} lines`)
  await shot('today-written')
  await h.click('[data-write-day]'); await wait(1000)
  await h.locator(`[data-task-row][data-id="${a}"] [data-row]`).click(); await wait(500)
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.press('Alt+KeyJ'); await wait(1000)
  const moved = (await rows()).filter((id) => [a, b, cc].includes(id))
  check('⌥J moves a task past one of another priority', moved[1] === a, moved.map((id) => ({ [a]: 'aa', [b]: 'bb', [cc]: 'cc' })[id]).join(' '))

  // 4 and 5. Late leads every tab; Upcoming has only days to come; undated is in Later.
  const late = await add('pay the late fine')
  await v('task:save', late, { due: day(-3) })
  const coming = await add('book the dentist')
  await v('task:save', coming, { due: day(4) })
  const undated = await add('reorganise the shed')
  await v('task:save', undated, { due: null, plan: null })
  await go('upcoming'); await wait(1200)
  let hs = await heads()
  check('Upcoming leads with Overdue', hs[0]?.startsWith('Overdue') && (await rows())[0] === late, hs.join(' | '))
  check('Upcoming has no "No date" group', !hs.some((x) => x.startsWith('No date')), hs.join(' | '))
  check('and does not hold the undated task', !(await rows()).includes(undated))
  await shot('upcoming')
  await go('later'); await wait(1200)
  hs = await heads()
  check('Later leads with Overdue', hs[0]?.startsWith('Overdue'), hs.join(' | '))
  check('Later holds the undated task', (await rows()).includes(undated))
  await shot('later')

  // 6. Priority, then due date.
  const p1 = await add('zz renew the passport'); await v('task:save', p1, { due: day(9), priority: 2, sortOrder: 0 })
  const p2 = await add('yy return the library book'); await v('task:save', p2, { due: day(6), priority: 2, sortOrder: 1 })
  const p3 = await add('xx water the garden'); await v('task:save', p3, { due: day(2), priority: 0, sortOrder: 2 })
  await view('alltasks', 'prioritydue', 'none'); await h.reload(); await wait(1500)
  await go('alltasks'); await wait(1200)
  const byPri = (await rows()).filter((id) => [p1, p2, p3].includes(id))
  check('"Priority, then due date" puts priority first, then the sooner day', byPri.join() === [p2, p1, p3].join(), byPri.map((id) => ({ [p1]: 'zz', [p2]: 'yy', [p3]: 'xx' })[id]).join(' '))
  await h.keyboard.press('f'); await wait(700)
  check('and it is offered beside "Your order"', (await body()).includes('Priority, then due date'))
  await h.keyboard.press('Escape'); await wait(400)
  await view('alltasks', 'manual'); await h.reload(); await wait(1500)

  // 2 and 3. A fresh start: every one still counted in All, folded in its own tab.
  await go('alltasks'); await wait(1200)
  const open = (await v('tasks')).filter((t) => t.status === 'open').length
  await v('tasks:fresh-start'); await wait(800)
  const held = (await v('tasks:held')).length
  await go('alltasks'); await wait(1400)
  check('All counts every open task, those on hold too', (await count()) === open && held === open, `${await count()} said, ${open} open, ${held} held`)
  await shot('all-held')
  await go('later'); await wait(1200)
  check('Later does not gather what is on hold from other tabs', !(await body()).includes('Late ·') && !(await rows()).includes(late), (await heads()).join(' | '))
  await go('today'); await wait(1200)
  const fold = h.locator('[data-on-hold]')
  check('Today keeps its own under a folded "On hold"', (await fold.count()) === 1 && (await fold.getAttribute('aria-expanded')) === 'false' && !(await rows()).includes(b))
  await shot('today-held-folded')
  await fold.click(); await wait(700)
  const dim = await h.evaluate((id) => getComputedStyle(document.querySelector(`[data-task-row][data-id="${id}"]`)).opacity, b)
  check('unfolded, they show in place, dimmed', Number(dim) < 0.8, `opacity ${dim}`)
  await shot('today-held-open')
  await h.locator(`[data-task-row][data-id="${b}"] [data-row]`).click(); await wait(1000)
  check('opening one brings it back', !(await v('tasks:held')).some((t) => t.id === b))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
