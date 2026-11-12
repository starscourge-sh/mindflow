// A task added to a month's day, driven on sandbox data (brought to the 12 Nov way in: a double-click on the day
// and the popover tied to its draft, in place of the "+" and the tall panel): the words and ↵ make the task on the
// day clicked, ⌘Z takes it back with its words, and its chip opens the task's page (TaskDetail) in the side panel,
// whose notes are the rich editor ("- " is a bullet, **bold** is bold) and whose tags, priority and estimate save.
// The next one starts empty on the same day. A Calendar slot says its time before the task is made.
//
//   npx electron-vite build --outDir out-cal5
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal5/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/cal5.mjs
import { sandbox } from './sandbox-lib.mjs'
import { openFromMonth, startOnDay } from './month-add-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (by) => { const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + by); return d }
const shot = async (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
const S = '[data-day-side]'
const P = '[data-cal-add]'
const find = async (words) => (await v('tasks')).find((one) => one.title.includes(words))
try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await go('home'); await h.waitForTimeout(1500)
    const M = '[data-month-plan]'
    // A day of its own for each theme: four tasks on one day would put the last behind "+N more".
    const day = at(theme === 'light' ? 5 : 4)
    const cell = h.locator(`${M} [data-day="${key(day)}"]`)
    // A double-click on the day starts the task in the popover tied to its draft there (12 Nov: the "+" and the tall
    // panel are gone); the task's own page is then one step away, by its chip on the day.
    await startOnDay(h, cell, 'task')
    check(`${theme}: a double-click on a day opens the new task popover, and no side panel`, await h.locator(`${P}[data-cal-add="task"]`).count() === 1 && await h.locator(S).count() === 0)
    check(`${theme}: the old day, time, length, priority, tags and notes controls are gone`, await h.locator(`${P} [data-day-side-notes], ${P} [data-day-side-tags], ${P} [data-hover-quiet]`).count() === 0)
    check(`${theme}: it says the day it lands on`, (await h.locator(`${P} [data-day-side-when]`).textContent()).length > 4, await h.locator(`${P} [data-day-side-when]`).textContent())
    await h.keyboard.type(`cal5 water the plants ${theme}`)
    await shot(`cal5-draft-${theme}`)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    let one = await find(`cal5 water the plants ${theme}`)
    check(`${theme}: ↵ makes it on the day clicked, and the popover goes`, one && key(new Date(one.dueAt)) === key(day) && await h.locator(P).count() === 0, one?.dueAt)
    // ⌘Z takes it back, words and all.
    await h.keyboard.press('Meta+z'); await h.waitForTimeout(1000)
    check(`${theme}: ⌘Z removes the task just made`, !(await v('tasks')).some((t) => t.id === one.id))
    check(`${theme}: and the line is back with its words`, await h.locator(`${P} [data-task-input]`).inputValue() === `cal5 water the plants ${theme}`)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    one = await find(`cal5 water the plants ${theme}`)
    check(`${theme}: ↵ makes it again`, !!one)
    await openFromMonth(h, one.id, `cal5 water the plants ${theme}`)
    check(`${theme}: its chip opens the task's page in the side panel`, one && await h.locator(`${S}[data-day-side="task"] [data-open="${one?.id}"]`).count() === 1)
    // The notes are the rich editor.
    const editor = h.locator(`${S} [data-open] [contenteditable="true"]`).first()
    await editor.click(); await h.waitForTimeout(200)
    await h.keyboard.type('- first point'); await h.keyboard.press('Enter'); await h.keyboard.press('Enter')
    await h.keyboard.type('a **bold** word'); await h.waitForTimeout(1500)
    check(`${theme}: "- " makes a bullet`, (await editor.locator('ul li').first().textContent())?.includes('first point'))
    check(`${theme}: **bold** turns bold`, (await editor.locator('strong').first().textContent()) === 'bold')
    // Tags, priority and length, on the task page.
    await h.locator(`${S} [aria-label="Add a tag"]`).first().click(); await h.keyboard.type('garden'); await h.keyboard.press('Enter'); await h.waitForTimeout(600)
    await h.locator(S).getByRole('button', { name: 'High', exact: true }).click(); await h.waitForTimeout(400)
    await h.locator(`${S} input[aria-label="Estimate"]`).fill('45'); await h.keyboard.press('Tab'); await h.waitForTimeout(800)
    const saved = await v('task', one.id)
    const notes = JSON.stringify(saved?.notes ?? '')
    check(`${theme}: the notes save as a list and bold`, notes.includes('bulletList') && notes.includes('"bold"'), notes.slice(0, 160))
    check(`${theme}: the tag, priority and estimate save`, /#garden\b/.test(saved.title) && saved.priority === 2 && saved.estimate === 45, `${saved.title} p${saved.priority} e${saved.estimate}`)
    await h.locator(`${S} [data-open]`).first().evaluate((el) => el.scrollTo(0, 0))
    await shot(`cal5-task-${theme}`)
    await h.locator(S).focus(); await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    check(`${theme}: Esc closes the task's panel`, await h.locator(S).count() === 0)
    // The ↵ button makes one too; a double-click on the same day starts the next, empty, for the same day.
    await startOnDay(h, cell, 'task')
    await h.locator(`${P} [data-task-input]`).fill(`cal5 again ${theme}`); await h.locator(`${P} [data-day-side-add]`).click(); await h.waitForTimeout(1300)
    const two = await find(`cal5 again ${theme}`)
    check(`${theme}: the ↵ button makes it too`, two && key(new Date(two.dueAt)) === key(day) && await h.locator(P).count() === 0)
    await startOnDay(h, cell, 'task')
    check(`${theme}: the next one starts empty`, await h.locator(`${P} [data-task-input]`).inputValue() === '')
    await h.keyboard.type(`cal5 third ${theme}`); await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    const three = await find(`cal5 third ${theme}`)
    check(`${theme}: the next one lands on the same day`, three && key(new Date(three.dueAt)) === key(day), three?.dueAt)
    await startOnDay(h, cell, 'task')
    await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    check(`${theme}: Esc closes it`, await h.locator(`${P}, ${S}`).count() === 0)
    // A chip opens the same page.
    const chip = h.locator(`${M} [data-plan-task]`, { hasText: `cal5 again ${theme}` }).first()
    await chip.click(); await h.waitForTimeout(1000)
    check(`${theme}: a chip opens the same task page`, await h.locator(`${S}[data-day-side="task"] [data-open="${two.id}"] [contenteditable="true"]`).count() > 0)
    await h.locator(S).focus(); await h.keyboard.press('Escape'); await h.waitForTimeout(500)

    // A slot on the Calendar says its time before it is made, and keeps it: a double-click there, turned to Task.
    await go('calendar'); await h.waitForTimeout(1200)
    if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await h.waitForTimeout(500) }
    await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 13 * 56))
    const hour = theme === 'light' ? 15 : 16
    const col = await h.locator(`[data-cal-col="${key(at(0))}"]`).boundingBox()
    await h.mouse.dblclick(col.x + col.width - 12, col.y + hour * 56 + 10); await h.waitForTimeout(700)
    await h.click(`${P} [data-day-side-kind="task"]`); await h.waitForTimeout(500)
    const said = await h.locator(`${P} [data-day-side-when]`).textContent()
    check(`${theme}: a slot says its time`, said.includes(`${hour}:00`) || said.includes(`${hour - 12}:00`), said)
    await shot(`cal5-slot-${theme}`)
    await h.keyboard.type(`cal5 slot ${theme}`); await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    const slot = await find(`cal5 slot ${theme}`)
    check(`${theme}: made at the slot's time`, slot && new Date(slot.dueAt).getHours() === hour && !slot.allDay, slot?.dueAt)
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
