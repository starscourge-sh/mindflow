// Write out your day, start to finish: the empty day's question, lines typed
// into tasks, a step by Tab, a move by ⌥↓, a tick that stays struck, a paste
// into Next, a line that was already a task, one from before brought in, a
// line taken out and put back, ten-plus, and the whole list done. Each stage
// is saved as a picture in light, dark and Brutal.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-plan/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/day-list.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/day-list`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 820 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const tasks = () => v('tasks')
const today = new Date().toDateString()
const isToday = (task) => task.dueAt && new Date(task.dueAt).toDateString() === today
const shot = async (name) => {
  for (const [look, theme, style] of [['light', 'paper', 'soft'], ['dark', 'dark', 'soft'], ['brutal', 'paper', 'brutal']]) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, [theme, style])
    await wait(350)
    await h.screenshot({ path: `${dir}/${name}-${look}.png` })
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await wait(250)
}
const lineOf = async (title) => (await tasks()).find((one) => one.title === title)

// A clear day: everything due today or before put off, so the page starts empty.
// A deadline counts too: the sandbox's "by Friday" lands on today every Friday.
const tonight = new Date(new Date().setHours(24, 0, 0, 0))
const later = new Date(Date.now() + 3 * 864e5).toISOString()
for (const task of await tasks()) {
  if (task.status !== 'open') continue
  if (task.dueAt && new Date(task.dueAt) < tonight) await v('task:save', task.id, { due: later })
  if (task.deadline && new Date(task.deadline) < tonight) await v('task:save', task.id, { deadline: later })
}
const doneToday = (await tasks()).filter((task) => task.status === 'done' && task.completedAt && new Date(task.completedAt).toDateString() === today).map((task) => task.id)
await h.evaluate((ids) => {
  localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' }))
  const d = new Date()
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  localStorage.setItem(`day-list:cleared:${key}`, JSON.stringify(ids))
}, doneToday)
await h.reload()
await wait(1500)
await go('today')
await wait(1200)

// 1. The start of the day.
check('the empty day asks what matters', await h.locator('[data-day-empty]').isVisible())
check('the caret waits on the first line', await h.evaluate(() => document.activeElement?.getAttribute('data-new') === 'now'))
await wait(2500)
await shot('1-empty')

// 2. Writing it out.
for (const line of ['Send the draft to Ana', 'Book the dentist', 'Fix the gate latch', 'Water the plants']) {
  await h.keyboard.type(line, { delay: 8 })
  await h.keyboard.press('Enter')
  await wait(450)
}
let all = await tasks()
const written = ['Send the draft to Ana', 'Book the dentist', 'Fix the gate latch', 'Water the plants'].map((title) => all.find((one) => one.title === title))
check('each line is a task due today', written.every((one) => one && isToday(one) && one.status === 'open'), written.map((one) => one?.title).join(', '))
check('the order written is their order', written.every((one, at) => one?.sortOrder === at), written.map((one) => one?.sortOrder).join(','))
check('the top three carry it', (await h.locator('[data-day-line][data-top]').count()) === 3)
check('the caret is on the next new line', await h.evaluate(() => document.activeElement?.getAttribute('data-new') === 'now'))

// 3. A step: Enter after "Fix the gate latch", then Tab.
await h.locator(`[data-day-line="${written[2].id}"] textarea`).first().click()
await h.keyboard.press('End')
await h.keyboard.press('Enter')
await wait(200)
await h.keyboard.press('Tab')
await wait(200)
await h.keyboard.type('Buy a new spring', { delay: 8 })
await h.keyboard.press('Enter')
await wait(500)
await h.keyboard.press('Escape')
await wait(300)
const gate = await lineOf('Fix the gate latch')
check('Tab makes a step of the line above, once', gate?.subtasks?.length === 1 && gate.subtasks[0].text === 'Buy a new spring', JSON.stringify(gate?.subtasks))

// 4. ⌥↓ moves a line down.
await h.locator(`[data-day-line="${written[0].id}"] textarea`).first().click()
await h.keyboard.press('Alt+ArrowDown')
await wait(600)
all = await tasks()
check('⌥↓ moves a line down', all.find((one) => one.id === written[0].id).sortOrder === 1 && all.find((one) => one.id === written[1].id).sortOrder === 0)
await h.keyboard.press('Escape')
await shot('2-written')
// The day's page shows the same list, to write on and tick.
await go('day')
await wait(1500)
check('the day’s page shows the written list', await h.locator('[data-day-list] [data-day-line]').first().isVisible().catch(() => false))
await shot('2b-day-page')
await go('today')
await wait(900)

// 5. A tick stays where it was, struck through.
await h.locator(`[data-day-line="${written[1].id}"] [role=checkbox]`).first().click()
await wait(900)
check('ticking ticks the task', (await lineOf('Book the dentist'))?.status === 'done')
check('the ticked line stays in place, struck', await h.locator(`[data-day-line="${written[1].id}"][data-done]`).isVisible())
await shot('3-ticked')

// 6. Ticking it elsewhere ticks it here.
await v('task:done', written[3].id)
await wait(900)
check('ticked elsewhere shows ticked here', await h.locator(`[data-day-line="${written[3].id}"][data-done]`).isVisible())

// 7. A paste into Next: two tasks, one with steps, no day.
// Next opens and closes plainly: a chevron, and it says whether it is open.
const toggle = h.locator('[data-section-toggle="next"]')
check('Next shows it opens', await toggle.locator('svg').count() === 1 && (await toggle.getAttribute('aria-expanded')) !== null)
if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
await wait(300)
await h.locator('textarea[data-new="next"]').click()
await h.evaluate(() => {
  const field = document.querySelector('textarea[data-new="next"]')
  const data = new DataTransfer()
  data.setData('text/plain', '- [ ] Plan the garden\n  - [x] Measure the beds\n  - [ ] Pick seeds\n- [ ] Sort the loft')
  field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
})
await wait(1500)
const garden = await lineOf('Plan the garden')
check('a pasted list becomes lines in Next, with no day', garden && !garden.dueAt && (await lineOf('Sort the loft')) && !(await lineOf('Sort the loft')).dueAt)
check('indented pasted lines are its steps', garden?.subtasks?.length === 2 && garden.subtasks[0].done === true)

// 8. Into today from Next.
await h.locator(`[data-day-line="${garden.id}"]`).hover()
await h.locator(`[data-day-line="${garden.id}"] button[aria-label="Into today"]`).click()
await wait(800)
check('“Today” brings a Next line into Now', isToday(await lineOf('Plan the garden')))

// A, with nothing being written, starts a new line on the page.
await h.keyboard.press('Escape')
await h.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {})
await h.keyboard.press('a')
await wait(400)
check('A starts a new line on the page', await h.evaluate(() => document.activeElement?.getAttribute('data-new') === 'now'))
await h.keyboard.press('Escape')

// 9. A line that was already a task: no second one.
const before = (await tasks()).length
await h.locator('textarea[data-new="now"]').click()
await h.keyboard.type('Sort the loft', { delay: 8 })
await h.keyboard.press('Enter')
await wait(900)
const lofts = (await tasks()).filter((one) => one.title === 'Sort the loft')
check('a line already a task is moved here, not doubled', lofts.length === 1 && isToday(lofts[0]) && (await tasks()).length === before, `${lofts.length} lofts`)

// 10. Taken out, and put back with Undo.
await h.keyboard.type('Something to take out', { delay: 8 })
await h.keyboard.press('Enter')
await wait(700)
const gone = await lineOf('Something to take out')
await h.locator(`[data-day-line="${gone.id}"] textarea`).first().click()
await h.keyboard.press('Meta+a')
await h.keyboard.press('Backspace')
await h.keyboard.press('Backspace')
await wait(800)
check('Backspace on an empty line takes it out', !(await tasks()).some((one) => one.title === 'Something to take out' && one.status === 'open'))
// A line written just now goes quietly, as if never written: ⌘Z, still in
// the line above, brings it back.
await h.keyboard.press('Meta+z')
await wait(900)
check('⌘Z puts it back', (await tasks()).some((one) => one.title === 'Something to take out' && one.status === 'open'))

// 11. From before: one left open yesterday, brought in.
const yesterday = new Date(Date.now() - 864e5).toISOString()
const old = await v('task:add', 'Return the library books')
await v('task:save', old.id, { due: yesterday })
await wait(900)
check('yesterday’s open line shows above, faded', await h.locator(`[data-before="${old.id}"]`).isVisible())
await shot('4-before')
await h.locator(`[data-before="${old.id}"] button`, { hasText: 'To today' }).click()
await wait(800)
check('“To today” makes it today’s', isToday(await lineOf('Return the library books')))

// 12. Ten and more.
await h.locator('textarea[data-new="now"]').click()
for (let n = 1; n <= 6; n++) {
  await h.keyboard.type(`Small thing ${n}`, { delay: 4 })
  await h.keyboard.press('Enter')
  await wait(350)
}
await h.keyboard.press('Escape')
await wait(500)
check('ten-plus says it is a lot', await h.locator('[data-day-many]').isVisible())
await shot('5-many')

// 13. Everything done: the ending, in place.
for (const task of await tasks()) if (task.status === 'open' && isToday(task)) await v('task:done', task.id)
await wait(1200)
check('all done says so in place', await h.locator('[data-day-all-done]').isVisible())
await shot('6-all-done')

// 14. Close the day shows done and left, and carries the rest.
await v('task:undone', (await lineOf('Small thing 6')).id, { dueAt: new Date().toISOString(), doneAt: new Date().toISOString(), notifiedAt: null })
await wait(600)
await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-day')))
await wait(900)
check('Close the day counts done against left', /\d+ of \d+ done/.test(await h.locator('[data-close-tally]').innerText().catch(() => '')))
await shot('7-close-day')
const carry = h.locator('[data-close-carry]')
check('Close the day offers to carry the rest', await carry.isVisible())
await carry.click().catch(() => {})
await wait(700)
const six = await lineOf('Small thing 6')
check('carried to tomorrow', six && new Date(six.dueAt).toDateString() === new Date(Date.now() + 864e5).toDateString())
await h.keyboard.press('Escape')

// 15. Motion off: nothing waits on an animation.
await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
await go('today')
check('no errors on the page', !c.errors.length, c.errors.slice(0, 3).join(' | '))

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
