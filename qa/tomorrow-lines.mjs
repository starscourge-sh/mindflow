// Tomorrow, written down before bed: the “For tomorrow” box on Today and
// Today's page, hidden before the evening hour and there after it; its lines
// tasks due tomorrow, a said time kept; a paste of several with one Undo;
// Backspace on an empty line takes it out; and Close the day's step “Anything
// on your mind for tomorrow?”, the same list, skippable, counted in the
// closing words, with one Undo. Pictures in light and dark.
// Run twice on a set clock, whatever the real one says: at 22:00 (the box
// says “For tomorrow”) and at 01:00 (the small hours: “For the morning”, the
// lines due today, still shown in the box where they were written).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/tomorrow-lines.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const base = process.env.QA_DATA

for (const at of ['22:00', '01:00']) {
console.log(`\n-- at ${at} --`)
process.env.QA_DATA = `${base}/at-${at.replace(':', '')}`
mkdirSync(process.env.QA_DATA, { recursive: true })
const dir = `${process.env.SHOTS ?? `${base}/tomorrow-lines`}/${at.replace(':', '')}`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1100, height: 860, at })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const tasks = () => v('tasks')
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = c.now()
const small = now.getHours() < 4
const title = small ? 'For the morning' : 'For tomorrow'
// The small hours still belong to the night before: tomorrow is the day you wake into.
const night = now.getHours() < 4 ? new Date(now.getTime() - 864e5) : now
const tomorrow = key(new Date(night.getFullYear(), night.getMonth(), night.getDate() + 1, 12))
const onTomorrow = (task) => task?.dueAt && key(new Date(task.dueAt)) === tomorrow
const shot = async (name, clip) => {
  for (const [look, theme] of [['light', 'paper'], ['dark', 'dark']]) {
    await h.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(400)
    await h.screenshot({ path: `${dir}/${name}-${look}.png`, ...(clip ? { clip } : {}) })
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  await wait(250)
}
const box = '[data-tomorrow-box]'
const lines = () => h.$$eval(`${box} [data-tomorrow-line]`, (all) => all.map((one) => one.querySelector('textarea').value))
const undo = async () => { await h.locator('button', { hasText: 'Undo' }).last().click(); await wait(900) }

await v('settings:set', { motion: false, hintRate: 0 })
await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))

// 1. Before the evening hour: no box, on Today or Today's page.
if (now.getHours() >= 4 && now.getHours() * 60 + now.getMinutes() < 23 * 60 + 58) {
  await v('settings:set', { closeDayAt: '23:59' })
  await go('today')
  await wait(800)
  check('before the hour, Today has no box', (await h.locator(box).count()) === 0)
  await go('day')
  await wait(800)
  check("before the hour, Today's page has no box", (await h.locator(box).count()) === 0)
} else console.log('SKIP  before the hour (it is too late or too early tonight to set an hour still to come)')

// 2. After it: the box at the end of today's lines, the caret left where it was.
await v('settings:set', { closeDayAt: '00:00', closeDay: true })
await h.evaluate(() => (localStorage.removeItem('close-day:done'), localStorage.removeItem('close-day:away')))
await go('today')
await wait(1200)
check(`after the hour, Today shows “${title}”`, (await h.locator(box).count()) === 1 && (await h.locator(`${box} h3`).textContent()) === title)
check('it never takes the caret', await h.evaluate(() => !document.activeElement?.closest('[data-tomorrow-box]')))
check('it says why, with the study a point away', (await h.locator(`${box} [data-tomorrow-why]`).count()) === 1)
await h.locator(box).scrollIntoViewIfNeeded()
await wait(1800)
await shot('1-today-empty')

// 3. Lines become tasks due tomorrow; a said time is kept, tags too.
const field = h.locator(`${box} [data-tomorrow-new]`)
/** Typed only once the new line has the caret and is empty: on a busy machine the last line's Enter may still be settling. */
const ready = (sel) => h.waitForFunction((sel) => { const el = document.querySelector(sel); return !!el && document.activeElement === el && el.value === '' }, sel, { timeout: 4000 }).catch(() => {})
await field.click()
for (const line of ['Call Sam at 3', 'Water the plants #home']) {
  await ready(`${box} [data-tomorrow-new]`)
  await h.keyboard.type(line, { delay: 6 })
  await h.keyboard.press('Enter')
  await wait(700)
}
let all = await tasks()
const sam = all.find((one) => one.title === 'Call Sam')
const plants = all.find((one) => /Water the plants/.test(one.title))
check('a line is a task due tomorrow', onTomorrow(plants) && plants.status === 'open', plants?.dueAt)
check('its #tag is kept', /#home/.test(plants?.title ?? ''), plants?.title)
check('a said time is kept, on tomorrow', onTomorrow(sam) && new Date(sam.dueAt).getHours() === 15 && !sam.allDay, sam?.dueAt)
check('the box lists both', (await lines()).length === 2, (await lines()).join(' | '))
if (small) {
  check('in the small hours it says they are on today’s list too', (await h.locator(`${box} [data-tomorrow-above]`, { hasText: 'Both are on today’s list too' }).count()) === 1)
  check('and they are there, on Today', await h.evaluate((id) => [...document.querySelectorAll(`[data-id="${id}"], [data-day-line="${id}"], [data-line-task="${id}"]`)].some((one) => !one.closest('[data-tomorrow-box]')), sam?.id))
}

// 4. A paste of several lines: several tasks, one Undo for all.
await h.evaluate(() => {
  const area = document.querySelector('[data-tomorrow-box] [data-tomorrow-new]')
  const data = new DataTransfer()
  data.setData('text/plain', 'Return the library books\nAsk Ana about the rota\nBuy bread')
  area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
})
await wait(1500)
check('a paste of three lines makes three', (await lines()).length === 5, (await lines()).join(' | '))
await undo()
check('one Undo takes the three back out', (await lines()).length === 2 && !(await tasks()).some((one) => one.title === 'Buy bread' && one.status === 'open'), (await lines()).join(' | '))

// 5. Backspace on an emptied line takes it out.
await h.evaluate(() => (document.activeElement)?.blur?.())
await h.locator(`${box} [data-tomorrow-line] textarea`).nth(1).click()
await h.keyboard.press('Meta+a')
await h.keyboard.press('Backspace')
await h.keyboard.press('Backspace')
await wait(900)
check('Backspace on an empty line takes it out', (await lines()).length === 1 && !(await tasks()).some((one) => /Water the plants/.test(one.title) && one.status === 'open'), (await lines()).join(' | '))
await undo()
check('and Undo puts it back', (await lines()).length === 2, (await lines()).join(' | '))
await h.evaluate(() => (document.activeElement)?.blur?.())
await wait(600)
await shot('2-today-lines')

// 6. Today's page shows the same box, the same lines.
await go('day')
await wait(1500)
check("Today's page shows the same lines", (await lines()).length === 2, (await lines()).join(' | '))
await h.locator(box).scrollIntoViewIfNeeded()
await wait(600)
await shot('3-todays-page')

// 7. Close the day: the step, the same list, a new line, no twin.
await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-day')))
await wait(1200)
const step = '[data-close-day] [data-close-tomorrow]'
check('Close the day asks “Anything on your mind for tomorrow?”', (await h.locator(step, { hasText: 'Anything on your mind for tomorrow?' }).count()) === 1)
check('it holds the lines already written tonight', (await h.locator(`${step} [data-tomorrow-line]`).count()) === 2)
check('nothing to skip once there are lines', (await h.locator('[data-close-tomorrow-skip]').count()) === 0)
await h.locator(`${step} [data-tomorrow-new]`).click()
for (const line of ['Pick up the parcel', 'Water the plants #home']) {
  await ready(`${step} [data-tomorrow-new]`)
  await h.keyboard.type(line, { delay: 6 })
  await h.keyboard.press('Enter')
  await wait(800)
}
const inStep = await h.$$eval(`${step} [data-tomorrow-line] textarea`, (all) => all.map((one) => one.value))
check('a line already there is not listed twice', inStep.filter((one) => /Water the plants/.test(one)).length === 1 && inStep.length === 3, inStep.join(' | '))
check('nor made twice', (await tasks()).filter((one) => /Water the plants/.test(one.title) && one.status === 'open').length === 1)
check('a new line here is a task for tomorrow, and a choice for tomorrow’s first', onTomorrow((await tasks()).find((one) => one.title === 'Pick up the parcel')) && (await h.locator('[data-close-frog] [role="radio"]', { hasText: 'Pick up the parcel' }).count()) === 1)
await h.locator(step).scrollIntoViewIfNeeded()
await h.evaluate(() => (document.activeElement)?.blur?.())
await wait(600)
const sheet = await h.locator('[data-close-day]').boundingBox()
await shot('4-close-day-step', sheet ?? undefined)

// 8. The closing words count them; one Undo opens the day again and takes this pass's lines out.
await h.keyboard.press('Meta+Enter')
await wait(900)
const said = await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => /Undo/.test(one.textContent ?? ''))?.parentElement?.textContent ?? '')
check('the closing words say “3 things for tomorrow”', /3 things for tomorrow/.test(said), said.slice(0, 80))
await undo()
const after = await tasks()
check('Undo takes the line written in the pass back out', !after.some((one) => one.title === 'Pick up the parcel' && one.status === 'open'))
check('and keeps the ones written before it', after.some((one) => one.title === 'Call Sam' && one.status === 'open'))
check('and the day is open again', await h.evaluate((k) => localStorage.getItem('close-day:done') !== k, key(now)))
await go('today')
await wait(900)
check('Today shows the two left', (await lines()).length === 2, (await lines()).join(' | '))

// 9. Skippable: on a night with nothing written, “Nothing tonight” folds the step.
await h.evaluate((k) => localStorage.removeItem(`tomorrow-lines:${k}`), key(night))
await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-day')))
await wait(1000)
await h.locator('[data-close-tomorrow-skip]').click()
await wait(400)
check('the step can be skipped', (await h.locator(`${step} [data-tomorrow-new]`).count()) === 0 && (await h.locator(step, { hasText: 'Nothing on your mind tonight' }).count()) === 1)
await h.keyboard.press('Escape')
await wait(500)

// 10. Settings: the hour, and the box as it will look, said from it.
await go('settings')
await h.getByText('What comes back to you', { exact: true }).first().click()
await wait(1200)
const row = h.locator('[data-setting-title="For tomorrow, at night"]')
await row.scrollIntoViewIfNeeded()
check('Settings previews the box, from the hour', /Showing now/.test(await h.locator('[data-tomorrow-preview]').textContent()))
await v('settings:set', { closeDayAt: '23:59' })
await wait(800)
const later = await h.locator('[data-tomorrow-preview]').textContent()
if (small) check('in the small hours it still shows, as “For the morning”', /Showing now/.test(later) && /For the morning/.test(later), later.slice(0, 80))
else check('and changing the hour changes what it says', /Shows from 23:59/.test(later) && /For tomorrow/.test(later), later.slice(0, 80))
const rowBox = await h.locator('[data-setting-title="Close the day"]').boundingBox()
const prev = await row.boundingBox()
await shot('5-settings', rowBox && prev ? { x: rowBox.x, y: rowBox.y, width: rowBox.width, height: prev.y + prev.height - rowBox.y } : undefined)

check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
