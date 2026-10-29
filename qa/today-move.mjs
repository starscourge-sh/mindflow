// Moving Today's lines elsewhere, every way, each with Undo: dragged onto
// Next's heading and onto the Later tab on Tasks › Today, onto the places that
// come up under the list on the Journal's day page, from the right-click menu,
// and by keys once a line is picked with Esc. Pictures of the targets and the
// menu, light and dark, beside Upcoming's own look.
//   npx electron-vite build --outDir out-tm && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-tm/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/today-move.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/today-move`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 1100 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const tasks = () => v('tasks')
const task = async (id) => (await tasks()).find((one) => one.id === id)
const dayOf = (iso, days = 0) => !!iso && new Date(iso).toDateString() === new Date(Date.now() + days * 864e5).toDateString()
const theme = async (t) => {
  await h.evaluate((one) => { localStorage.setItem('theme', one); localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, t)
  await wait(350)
}
const shot = async (name) => {
  for (const [look, t] of [['light', 'paper'], ['dark', 'dark']]) (await theme(t), await h.screenshot({ path: `${dir}/${name}-${look}.png` }))
  await theme('paper')
}
const undo = async () => {
  await h.getByRole('button', { name: /^Undo/ }).last().click()
  await wait(900)
}

// A clear day, then five lines due today, written out.
const tonight = new Date(new Date().setHours(24, 0, 0, 0))
const away = new Date(Date.now() + 3 * 864e5).toISOString()
for (const one of await tasks()) {
  if (one.status !== 'open') continue
  if (one.dueAt && new Date(one.dueAt) < tonight) await v('task:save', one.id, { due: away })
  if (one.deadline && new Date(one.deadline) < tonight) await v('task:save', one.id, { deadline: away })
}
const nine = new Date(new Date().setHours(9, 0, 0, 0)).toISOString()
const ids = []
for (const [at, title] of ['Send the draft to Ana', 'Book the dentist', 'Fix the gate latch', 'Water the plants', 'Call the bank'].entries()) {
  const made = await v('task:add', title)
  await v('task:save', made.id, { due: nine, sortOrder: at })
  ids.push(made.id)
}
await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
await h.reload()
await wait(1500)
await go('today')
await wait(1500)
// Next and Later folded, as with a long Next: their headings are the places.
for (const id of ['next', 'later']) if (await h.locator(`[data-section-toggle=${id}][aria-expanded=true]`).count()) await h.click(`[data-section-toggle=${id}]`)
await wait(500)

const centre = async (selector) => {
  const box = await h.locator(selector).first().boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
let at = { x: 0, y: 0 }
const glide = async (to, steps = 14) => {
  const from = at
  for (let i = 1; i <= steps; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps); await wait(25) }
  at = to
  await wait(250)
}
/** A line picked up by its handle and carried over a place; `look` before letting go. */
const carry = async (id, target, look) => {
  await h.locator(`[data-day-line="${id}"]`).first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await wait(300)
  const start = await centre(`[data-day-line="${id}"] [data-grip]`)
  await h.mouse.move(start.x, start.y)
  at = start
  await h.mouse.down()
  await glide({ x: start.x, y: start.y + 12 }, 4)
  await glide(await centre(target))
  await look?.()
  await h.mouse.up()
  await wait(1000)
}

// 1. Dragged onto Next's heading on Tasks › Today: its day comes off.
await carry(ids[3], '[data-day-section=next] header', async () => {
  check('Next’s heading lights while a line is over it', await h.locator('[data-day-section=next] header[data-drop-hot]').count() === 1)
  check('under the line it says what dropping does', /Next/.test(await h.locator('[data-drop-said]').innerText().catch(() => '')))
  await shot('1-drag-next')
})
let one = await task(ids[3])
check('dropped on Next, it has no day', !one.dueAt, one.dueAt)
check('it says so', await h.getByText('Moved to Next, with no day yet').first().isVisible().catch(() => false))
await undo()
check('Undo puts it back on today', dayOf((await task(ids[3])).dueAt))

// A line dragged within Today still reorders.
await carry(ids[0], `[data-day-line="${ids[1]}"]`)
one = await tasks()
check('a drag within Today still reorders', one.find((t) => t.id === ids[0]).sortOrder === 1 && dayOf(one.find((t) => t.id === ids[0]).dueAt))

// 2. Dragged onto the Later tab: into Someday.
await carry(ids[4], '[data-row-drop=later]', async () => {
  check('the Later tab lights while a line is over it', await h.locator('[data-row-drop=later][data-drop-hot]').count() === 1)
  await shot('2-drag-later-tab')
})
one = await task(ids[4])
check('dropped on Later, it is in Someday', one.planFor === 'someday' && !one.dueAt, `${one.planFor} ${one.dueAt}`)
await undo()
check('Undo puts it back on today', dayOf((await task(ids[4])).dueAt))

// 3. On the Journal's day page, places come up under the list while a line is carried.
await go('day')
await wait(1500)
check('no drop places under the list until a line is carried', await h.locator('[data-drop-foot]').count() === 0)
await carry(ids[2], '[data-drop-foot] [data-row-drop=tomorrow]', async () => {
  check('carried, Tomorrow, Next and Later come up under the list', await h.locator('[data-drop-foot] [data-row-drop]').count() === 3)
  check('the place under the pointer lights', await h.locator('[data-drop-foot] [data-row-drop=tomorrow][data-drop-hot]').count() === 1)
  await shot('3-journal-drop-places')
})
check('dropped on Tomorrow, it is due tomorrow', dayOf((await task(ids[2])).dueAt, 1))
check('the places go once it is dropped', await h.locator('[data-drop-foot]').count() === 0)
await undo()
check('Undo puts it back on today', dayOf((await task(ids[2])).dueAt))
await carry(ids[2], '[data-drop-foot] [data-row-drop=next]')
check('dropped on Next under the list, it has no day', !(await task(ids[2])).dueAt)
await undo()
await carry(ids[2], '[data-drop-foot] [data-row-drop=someday]')
check('dropped on Later under the list, it is in Someday', (await task(ids[2])).planFor === 'someday')
await undo()
check('Undo after Later puts it back on today', dayOf((await task(ids[2])).dueAt))

// 4. Right-click: the places first.
await h.locator(`[data-day-line="${ids[1]}"] [data-line]`).first().click({ button: 'right' })
await wait(500)
const menu = h.locator('[role=menu]').last()
const words = await menu.innerText().catch(() => '')
check('the menu offers each place', ['Move it to', 'Tomorrow', 'Next week', 'Next, no day yet', 'Later, this month', 'Later, someday', 'Pick a date'].every((w) => words.includes(w)), words.split('\n').slice(0, 9).join(' | '))
await shot('4-menu')
await menu.getByRole('menuitem', { name: /Next week/ }).click()
await wait(900)
check('“Next week” moves it a week on', dayOf((await task(ids[1])).dueAt, 7))
await undo()
check('Undo puts it back on today', dayOf((await task(ids[1])).dueAt))
// The grip clicked (not dragged) opens the same menu, as the editor's handle does, with no caret put in the words.
await h.locator(`[data-day-line="${ids[1]}"]`).first().hover()
await h.locator(`[data-day-line="${ids[1]}"] [data-grip]`).first().click()
await wait(500)
const fromGrip = await h.evaluate(() => ({ menu: document.querySelector('[role=menu]')?.innerText ?? '', typing: !!document.activeElement?.closest('[contenteditable=true], textarea') }))
check('clicking the grip opens the line\'s menu, the words left alone', /Move it to/.test(fromGrip.menu) && !fromGrip.typing, JSON.stringify({ menu: fromGrip.menu.slice(0, 40), typing: fromGrip.typing }))
await shot('4b-grip-menu')
await h.locator('[role=menu]').last().getByRole('menuitem', { name: /Later, this month/ }).click()
await wait(900)
check('“Later, this month” puts it in This month', /^\d{4}-\d{2}$/.test((await task(ids[1])).planFor ?? ''), (await task(ids[1])).planFor)
await undo()
check('Undo puts it back on today', dayOf((await task(ids[1])).dueAt))

// 5. Keys: Esc picks the line; typing in it never moves it.
await h.keyboard.press('Escape')
await h.locator(`[data-day-line="${ids[0]}"] [data-line]`).first().click()
await wait(300)
await h.keyboard.press('End')
await h.keyboard.type(' m')
await wait(200)
check('M typed in the words is a letter, not a move', dayOf((await task(ids[0])).dueAt))
await h.keyboard.press('Backspace')
await h.keyboard.press('Backspace')
await h.keyboard.press('Escape')
await wait(300)
check('Esc leaves the line picked', await h.locator(`[data-day-line="${ids[0]}"][data-picked]`).count() === 1)
await shot('5-picked')
await h.keyboard.press('m')
await wait(900)
check('M moves it to tomorrow', dayOf((await task(ids[0])).dueAt, 1))
await undo()
check('Undo puts it back', dayOf((await task(ids[0])).dueAt))
for (const [key, said, ok] of [['w', 'next week', (t) => dayOf(t.dueAt, 7)], ['n', 'Next', (t) => !t.dueAt], ['l', 'Later, Someday', (t) => t.planFor === 'someday']]) {
  await h.locator(`[data-day-line="${ids[0]}"] [data-line]`).first().click()
  await wait(250)
  await h.keyboard.press('Escape')
  await wait(250)
  await h.keyboard.press(key)
  await wait(900)
  check(`${key.toUpperCase()} on a picked line moves it to ${said}`, ok(await task(ids[0])))
  await undo()
  check(`Undo after ${key.toUpperCase()} puts it back`, dayOf((await task(ids[0])).dueAt))
}
check('the words were left as they were', (await task(ids[0])).title === 'Send the draft to Ana', (await task(ids[0])).title)

// Beside: Upcoming, the Tasks page's own look.
await go('upcoming')
await wait(1500)
await shot('6-upcoming-beside')

await c.close()
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed; pictures in ${dir}`)
process.exit(failed ? 1 : 0)
