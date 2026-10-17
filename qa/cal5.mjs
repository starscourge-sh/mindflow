// The calendar's new-task panel is the task page itself, driven on sandbox
// data: the words and ↵ make the task on the day clicked, and the panel turns
// into that task's page (TaskDetail), whose notes are the rich editor ("- "
// is a bullet, **bold** is bold) and whose tags, priority and estimate save.
// ⌘Z takes the new task back, ⌘N starts the next one, and a chip opens the
// same page. A Calendar slot says its time and length before it is made.
//
//   npx electron-vite build --outDir out-cal5
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal5/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/cal5.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (by) => { const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + by); return d }
const shot = async (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
const S = '[data-day-side]'
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
    await cell.scrollIntoViewIfNeeded(); await cell.hover(); await cell.locator('[data-day-add]').click(); await h.waitForTimeout(600)
    check(`${theme}: a day's + opens the new task panel`, await h.locator(`${S}[data-day-side="new"]`).count() === 1)
    check(`${theme}: the old day, time, length, priority, tags and notes controls are gone`, await h.locator(`${S} [data-day-side-notes], ${S} [data-day-side-tags], ${S} [data-hover-quiet]`).count() === 0)
    check(`${theme}: it says the day it lands on`, (await h.locator(`${S} [data-day-side-when]`).textContent()).length > 4, await h.locator(`${S} [data-day-side-when]`).textContent())
    await h.keyboard.type(`cal5 water the plants ${theme}`)
    await shot(`cal5-draft-${theme}`)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    const one = await find(`cal5 water the plants ${theme}`)
    check(`${theme}: ↵ makes it on the day clicked`, one && key(new Date(one.dueAt)) === key(day), one?.dueAt)
    check(`${theme}: the panel turns into the task's page`, one && await h.locator(`${S}[data-day-side="task"] [data-open="${one?.id}"]`).count() === 1)
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
    // ⌘Z takes it back, words and all.
    await h.locator(S).focus(); await h.keyboard.press('Meta+z'); await h.waitForTimeout(1000)
    check(`${theme}: ⌘Z removes the task just made`, !(await v('tasks')).some((t) => t.id === one.id))
    check(`${theme}: and the line is back with its words`, await h.locator(`${S}[data-day-side="new"] [data-task-input]`).inputValue() === `cal5 water the plants ${theme}`)
    // Made again, then ⌘N for the next one.
    await h.locator(`${S} [data-task-input]`).fill(`cal5 again ${theme}`); await h.locator(`${S} [data-day-side-add]`).click(); await h.waitForTimeout(1300)
    const two = await find(`cal5 again ${theme}`)
    check(`${theme}: "Add" makes it too, and opens it`, two && await h.locator(`${S} [data-open="${two?.id}"]`).count() === 1)
    check(`${theme}: "New task" with ⌘N is offered`, await h.locator(`${S} [data-day-side-new]`).count() === 1)
    await h.locator(S).focus(); await h.keyboard.press('Meta+n'); await h.waitForTimeout(600)
    check(`${theme}: ⌘N starts the next one, empty`, await h.locator(`${S}[data-day-side="new"] [data-task-input]`).inputValue() === '')
    await h.keyboard.type(`cal5 third ${theme}`); await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    const three = await find(`cal5 third ${theme}`)
    check(`${theme}: the next one lands on the same day`, three && key(new Date(three.dueAt)) === key(day), three?.dueAt)
    await h.locator(`${S} [data-day-side-new]`).click(); await h.waitForTimeout(500)
    check(`${theme}: the "New task" button starts one too`, await h.locator(`${S}[data-day-side="new"]`).count() === 1)
    await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    check(`${theme}: Esc closes it`, await h.locator(S).count() === 0)
    // A chip opens the same page.
    const chip = h.locator(`${M} [data-plan-task]`, { hasText: `cal5 again ${theme}` }).first()
    await chip.click(); await h.waitForTimeout(1000)
    check(`${theme}: a chip opens the same task page`, await h.locator(`${S}[data-day-side="task"] [data-open="${two.id}"] [contenteditable="true"]`).count() > 0)
    await h.locator(S).focus(); await h.keyboard.press('Escape'); await h.waitForTimeout(500)

    // A slot on the Calendar says its time before it is made, and keeps it.
    await go('calendar'); await h.waitForTimeout(1200)
    if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await h.waitForTimeout(500) }
    await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 13 * 56))
    const hour = theme === 'light' ? 15 : 16
    const col = await h.locator(`[data-cal-col="${key(at(0))}"]`).boundingBox()
    await h.mouse.click(col.x + col.width / 2, col.y + hour * 56 + 10); await h.waitForTimeout(700)
    const said = await h.locator(`${S} [data-day-side-when]`).textContent()
    check(`${theme}: a slot says its time`, said.includes(`${hour}:00`) || said.includes(`${hour - 12}:00`), said)
    await shot(`cal5-slot-${theme}`)
    await h.keyboard.type(`cal5 slot ${theme}`); await h.keyboard.press('Enter'); await h.waitForTimeout(1300)
    const slot = await find(`cal5 slot ${theme}`)
    check(`${theme}: made at the slot's time`, slot && new Date(slot.dueAt).getHours() === hour && !slot.allDay, slot?.dueAt)
    await h.locator(S).focus(); await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
