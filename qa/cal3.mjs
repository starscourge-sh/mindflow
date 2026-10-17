// The calendar's side panel, driven on sandbox data: a day's + on the month
// opens it over the right; "#sag" typed through ⌥3 (as a UK Mac layout sends
// it) and a plain "#" both save the tag, with the tags in use offered as you
// type; ↵ saves with the day and stays open for the next one; Esc closes it;
// a chip opens its task in the same panel. The Calendar page and the week
// board open the same panel, and D, W and M typed there stay in the words.
//
//   npx electron-vite build --outDir out-cal3
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal3/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=dir node qa/cal3.mjs
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
  await v('settings:set', { hintRate: 0 })
  await v('task:add', 'seed one #sag')
  await v('task:add', 'seed two #sagas')
  const late = (await v('task:add', 'cal3 late chip')).id
  await v('task:save', late, { due: at(-1).toISOString() })
  const cdp = await h.context().newCDPSession(h)
  // ⌥3 on a UK or ZA Mac layout: Alt held, the 3 key, typing "#".
  const optHash = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 1, key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 1, key: '#', code: 'Digit3', text: '#', unmodifiedText: '3', windowsVirtualKeyCode: 51 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 1, key: '#', code: 'Digit3', windowsVirtualKeyCode: 51 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 0, key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 })
  }
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await go('home'); await h.waitForTimeout(1500)
    const M = '[data-month-plan]'
    const day = at(6)
    const cell = h.locator(`${M} [data-day="${key(day)}"]`)
    await cell.scrollIntoViewIfNeeded(); await cell.hover(); await cell.locator('[data-day-add]').click(); await h.waitForTimeout(600)
    check(`${theme}: the + opens the side panel`, await h.locator(`${S}[data-day-side="new"]`).count() === 1)
    const tag = `${theme}`
    await h.keyboard.type(`cal3 opt ${tag} `); await optHash(); await h.keyboard.type('sa'); await h.waitForTimeout(300)
    check(`${theme}: "#sa" offers the tags in use`, await h.locator('[data-tag-offer="sag"]').count() === 1 && await h.locator('[data-tag-offer="sagas"]').count() === 1)
    await shot(`cal3-offers-${theme}`)
    await h.keyboard.type('g'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const one = await find(`cal3 opt ${tag}`)
    check(`${theme}: "#sag" typed with ⌥3 saves the tag`, one && /#sag\b/.test(one.title), one?.title)
    check(`${theme}: it lands on the day clicked`, one && key(new Date(one.dueAt)) === key(day), one?.dueAt)
    check(`${theme}: the panel stays open, empty, for the next one`, await h.locator(S).count() === 1 && await h.locator(`${S} [data-task-input]`).inputValue() === '')
    // Plain "#", a priority and notes; then a tag offer taken with Tab.
    await h.keyboard.type(`cal3 plain ${tag} #sag`)
    await h.locator(S).getByRole("button", { name: "High", exact: true }).click()
    await h.locator('[data-day-side-notes]').fill('a note line')
    await shot(`cal3-new-${theme}`)
    await h.locator(`${S} [data-task-input]`).focus(); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const two = await find(`cal3 plain ${tag}`)
    check(`${theme}: a plain "#" saves the tag, with the priority and notes`, two && /#sag\b/.test(two.title) && two.priority === 2 && JSON.stringify((await v("task", two.id))?.notes ?? "").includes("a note line"), `${two?.title} p${two?.priority}`)
    await h.keyboard.type(`cal3 tab ${tag} #sa`); await h.waitForTimeout(200); await h.keyboard.press('Tab'); await h.keyboard.type('tomorrow'); await h.waitForTimeout(200)
    check(`${theme}: Tab takes the offered tag`, (await h.locator(`${S} [data-task-input]`).inputValue()) === `cal3 tab ${tag} #sag tomorrow`, await h.locator(`${S} [data-task-input]`).inputValue())
    await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const three = await find(`cal3 tab ${tag}`)
    check(`${theme}: a day said in the words wins over the day clicked`, three && key(new Date(three.dueAt)) === key(at(1)), three?.dueAt)
    await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    check(`${theme}: Esc closes the panel`, await h.locator(S).count() === 0)
    // A chip opens its task in the same panel, with a Vigil tip, not the grey one.
    const chip = h.locator(`${M} [data-plan-task]`, { hasText: 'cal3 late chip' }).first()
    check(`${theme}: chips carry no native title`, (await chip.getAttribute('title')) === null)
    await h.mouse.move(5, 300); await chip.hover(); await h.waitForTimeout(1600)
    check(`${theme}: a chip's tip says "Late: …"`, (await h.evaluate(() => [...document.querySelectorAll("[data-slot=tooltip-content], [role=tooltip]")].map((e) => e.textContent).join("|"))).includes("Late: cal3 late chip"))
    await shot(`cal3-tip-${theme}`)
    await chip.click(); await h.waitForTimeout(1000)
    check(`${theme}: clicking a chip opens it in the side panel`, await h.locator(`${S}[data-day-side="task"] [data-open="${late}"]`).count() === 1 && await h.locator('[data-page="task"]').count() === 0)
    await shot(`cal3-task-${theme}`)
    await h.locator(S).focus(); await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    check(`${theme}: Esc closes the task panel`, await h.locator(S).count() === 0)

    // The Calendar page: a slot opens the same panel; D, W and M go into the words.
    await go('calendar'); await h.waitForTimeout(1200)
    if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await h.waitForTimeout(500) }
    const colBox = await h.locator(`[data-cal-col="${key(at(0))}"]`).boundingBox()
    await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 13 * 48))
    await h.mouse.click(colBox.x + colBox.width / 2, (await h.locator(`[data-cal-col="${key(at(0))}"]`).boundingBox()).y + (theme === "light" ? 14 : 16) * 48 + 10); await h.waitForTimeout(700)
    check(`${theme}: a slot on the Calendar opens the panel at its time`, await h.locator(`${S}[data-day-side="new"]`).count() === 1)
    await h.keyboard.type(`cal3 slot ${tag} dwmt `); await optHash(); await h.keyboard.type('sag'); await h.waitForTimeout(300)
    check(`${theme}: D, W, M and T typed there stay in the words`, await h.locator('[data-cal-mode="week"]').count() === 1 && (await h.locator(`${S} [data-task-input]`).inputValue()) === `cal3 slot ${tag} dwmt #sag`)
    await shot(`cal3-calendar-${theme}`)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const slot = await find(`cal3 slot ${tag}`)
    check(`${theme}: saved at the slot time with its tag`, slot && new Date(slot.dueAt).getHours() === (theme === "light" ? 14 : 16) && !slot.allDay && /#sag\b/.test(slot.title), `${slot?.title} ${slot?.dueAt}`)
    await h.locator(`${S} [data-task-input]`).focus(); await h.keyboard.press('Escape'); await h.waitForTimeout(400)
    await h.keyboard.press('m'); await h.waitForTimeout(800)
    const calCell = h.locator(`[data-month-plan] [data-day="${key(at(2))}"]`)
    await calCell.hover(); await calCell.locator('[data-day-add]').click(); await h.waitForTimeout(600)
    check(`${theme}: the Calendar's month opens the same panel`, await h.locator(`${S}[data-day-side="new"]`).count() === 1)
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)

    // The week board.
    await go('week'); await h.waitForTimeout(1000)
    const col = h.locator('section[data-day="3"]'); await col.hover(); await col.locator('[data-week-add]').click(); await h.waitForTimeout(600)
    check(`${theme}: the week board's + opens the same panel`, await h.locator(`${S}[data-day-side="new"]`).count() === 1)
    await shot(`cal3-week-${theme}`)
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
