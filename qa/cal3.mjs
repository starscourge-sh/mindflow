// The calendar's side panel, driven on sandbox data: a day's + on the month
// opens it over the right; "#sag" typed through ⌥3 (as a UK Mac layout sends
// it) and a plain "#" both save the tag, with the tags in use offered as you
// type; ↵ saves with the day and shows the task, ⌘N starts the next; Esc closes it;
// a chip opens its task in the same panel. The Calendar page and the week
// board open the same panel, and D, W and M typed there stay in the words.
//
//   npx electron-vite build --outDir out-cal3
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal3/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir node qa/cal3.mjs
import { sandbox } from './sandbox-lib.mjs'
import { startOnDay } from './month-add-lib.mjs'
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
  await v('task:add', 'seed one #sag')
  await v('task:add', 'seed two #sagas')
  const late = (await v('task:add', 'cal3 late chip')).id
  await v('task:save', late, { due: at(-1).toISOString() })
  const longId = (await v('task:add', 'cal3 a planned chip with a long name that is cut off')).id
  await v('task:save', longId, { due: at(1).toISOString() })
  const cdp = await h.context().newCDPSession(h)
  // ⌥3 on a UK or ZA Mac layout: Alt held, the 3 key, typing "#".
  const optHash = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 1, key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 1, key: '#', code: 'Digit3', text: '#', unmodifiedText: '3', windowsVirtualKeyCode: 51 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 1, key: '#', code: 'Digit3', windowsVirtualKeyCode: 51 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 0, key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 })
  }
  /** A month's day, waited for until it is the only one of its kind on the page in front. */
  const theDay = async (sel) => { await h.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, sel, { timeout: 15000 }); return h.locator(sel) }
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await go('home'); await h.waitForTimeout(1500)
    const M = '[data-month-plan]'
    const day = at(6)
    // The one day meant, once it is the only one: on a busy machine the page just left (the Calendar, with its own month)
    // is still in the document for a moment, and the same day was found twice (load 28, 12 Nov).
    const cell = await theDay(`${M}[data-month-own] [data-day="${key(day)}"]`)
    // A double-click on the day starts the task in the popover tied to its draft there (12 Nov: the "+" and the tall panel are gone).
    await startOnDay(h, cell, 'task')
    check(`${theme}: a double-click on a day opens the popover on Task, and no side panel`, await h.locator(`${P}[data-cal-add="task"]`).count() === 1 && await h.locator(S).count() === 0)
    const tag = `${theme}`
    await h.keyboard.type(`cal3 opt ${tag} `); await optHash(); await h.keyboard.type('sa'); await h.waitForTimeout(300)
    check(`${theme}: "#sa" offers the tags in use`, await h.locator('[data-tag-offer="sag"]').count() === 1 && await h.locator('[data-tag-offer="sagas"]').count() === 1)
    await shot(`cal3-offers-${theme}`)
    await h.keyboard.type('g'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const one = await find(`cal3 opt ${tag}`)
    check(`${theme}: "#sag" typed with ⌥3 saves the tag`, one && /#sag\b/.test(one.title), one?.title)
    check(`${theme}: it lands on the day clicked`, one && key(new Date(one.dueAt)) === key(day), one?.dueAt)
    check(`${theme}: the popover goes once it is made, and its chip is on the day`, one && await h.locator(P).count() === 0 && await h.locator(`${M} [data-day="${key(day)}"] [data-plan-task]`, { hasText: `cal3 opt ${tag}` }).count() >= 1)
    await startOnDay(h, cell, 'task')
    check(`${theme}: the next one starts empty`, await h.locator(`${P} [data-task-input]`).inputValue() === '')
    // Plain "#"; then a tag offer taken with Tab.
    await h.keyboard.type(`cal3 plain ${tag} #sag`)
    await shot(`cal3-new-${theme}`)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const two = await find(`cal3 plain ${tag}`)
    check(`${theme}: a plain "#" saves the tag`, two && /#sag\b/.test(two.title), two?.title)
    await startOnDay(h, cell, 'task')
    await h.keyboard.type(`cal3 tab ${tag} #sa`); await h.waitForTimeout(200); await h.keyboard.press('Tab'); await h.keyboard.type('tomorrow'); await h.waitForTimeout(200)
    check(`${theme}: Tab takes the offered tag`, (await h.locator(`${P} [data-task-input]`).inputValue()) === `cal3 tab ${tag} #sag tomorrow`, await h.locator(`${P} [data-task-input]`).inputValue())
    await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const three = await find(`cal3 tab ${tag}`)
    check(`${theme}: a day said in the words wins over the day clicked`, three && key(new Date(three.dueAt)) === key(at(1)), three?.dueAt)
    await startOnDay(h, cell, 'task')
    await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    check(`${theme}: Esc closes the popover`, await h.locator(`${P}, ${S}`).count() === 0)
    // A chip opens its task in the same panel, with a Haligtree tip, not the grey one.
    const chip = h.locator(`${M} [data-plan-task]`, { hasText: 'cal3 late chip' }).first()
    check(`${theme}: chips carry no native title`, (await chip.getAttribute('title')) === null)
    const tips = () => h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content]')].map((e) => e.textContent).join('|'))
    const long = h.locator(`${M} [data-plan-task]`, { hasText: 'cal3 a planned chip with a long name' }).first()
    await h.mouse.move(5, 300); await long.hover(); await h.waitForTimeout(1600)
    check(`${theme}: a cut-off chip's tip shows its full name`, (await tips()).includes('cal3 a planned chip with a long name that is cut off'), await tips())
    await shot(`cal3-tip-cut-${theme}`)
    await h.mouse.move(200, 600, { steps: 5 }); await h.waitForTimeout(600); await chip.hover(); await h.waitForTimeout(1600)
    check(`${theme}: a chip's tip says "Late: …"`, (await tips()).includes('Late: cal3 late chip'), await tips())
    await shot(`cal3-tip-${theme}`)
    // A click picks the chip; a double-click opens the popover on it, and "Open" there is its page in the side panel.
    await chip.click(); await h.waitForTimeout(500)
    check(`${theme}: a click on a chip picks it and opens nothing`, await h.locator(S).count() === 0 && await h.locator(P).count() === 0)
    await chip.dblclick(); await h.locator('[data-cal-add][data-cal-open] [data-cal-open-page]').click(); await h.waitForTimeout(1000)
    check(`${theme}: a double-click on a chip, then "Open", opens it in the side panel`, await h.locator(`${S}[data-day-side="task"] [data-open="${late}"]`).count() === 1 && await h.locator('[data-page="task"]').count() === 0)
    await shot(`cal3-task-${theme}`)
    await h.locator(S).focus(); await h.keyboard.press('Escape')
    // Gone within two seconds: it slides out (160ms) before it is taken away, and a busy machine has taken longer than half a second over it.
    await h.locator(S).waitFor({ state: 'detached', timeout: 2000 }).catch(() => {})
    check(`${theme}: Esc closes the task panel`, await h.locator(S).count() === 0)

    // The Calendar page: a slot opens the same panel; D, W and M go into the words.
    await go('calendar'); await h.waitForTimeout(1200)
    if (await h.locator('[data-cal-mode="week"]').count() === 0) { await h.keyboard.press('w'); await h.waitForTimeout(500) }
    const colBox = await h.locator(`[data-cal-col="${key(at(0))}"]`).boundingBox()
    await h.locator('[data-cal-scroll]').evaluate((el) => (el.scrollTop = 13 * 56))
    await h.mouse.dblclick(colBox.x + colBox.width - 12, (await h.locator(`[data-cal-col="${key(at(0))}"]`).boundingBox()).y + (theme === "light" ? 14 : 16) * 56 + 10); await h.waitForTimeout(700)
    await h.click(`${P} [data-day-side-kind="task"]`); await h.waitForTimeout(500)
    check(`${theme}: a double-click on a slot on the Calendar opens the popover at its time`, await h.locator(`${P}[data-cal-add="task"]`).count() === 1 && await h.locator(S).count() === 0)
    await h.keyboard.type(`cal3 slot ${tag} dwmt `); await optHash(); await h.keyboard.type('sag'); await h.waitForTimeout(300)
    check(`${theme}: D, W, M and T typed there stay in the words`, await h.locator('[data-cal-mode="week"]').count() === 1 && (await h.locator(`${P} [data-task-input]`).inputValue()) === `cal3 slot ${tag} dwmt #sag`)
    await shot(`cal3-calendar-${theme}`)
    await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
    const slot = await find(`cal3 slot ${tag}`)
    check(`${theme}: saved at the slot time with its tag`, slot && new Date(slot.dueAt).getHours() === (theme === "light" ? 14 : 16) && !slot.allDay && /#sag\b/.test(slot.title), `${slot?.title} ${slot?.dueAt}`)
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)
    await h.keyboard.press('m'); await h.waitForTimeout(800)
    const calCell = await theDay(`[data-cal-level] [data-month-plan] [data-day="${key(at(2))}"]`)
    await startOnDay(h, calCell)
    check(`${theme}: the Calendar's month opens the same popover`, await h.locator(P).count() === 1 && await h.locator(S).count() === 0)
    await h.keyboard.press('Escape'); await h.waitForTimeout(400)

    // (The week board's "+" was checked here; the board is gone from the app, and this step timed out on premium-pass too.)
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
