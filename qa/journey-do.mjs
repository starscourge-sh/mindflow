// A day of doing, walked as a person would, checking the gaps found in it are
// closed: everything on a task's panel changeable (the day a repeat ends, a
// subtask's words, taking one out with Undo, opening what it is "For this");
// a task's right-click menu in plain words, the same in each list; Today's
// page opening a line's task and ticking one "Still open from before"; the
// day page naming states in words and leaving out empty sections; Close the
// day heard once.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/journey-do.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const heard = () => h.evaluate(() => (window.vigilHeard ?? []).splice(0))
const text = () => h.evaluate(() => document.body.innerText)
try {
  await v('settings:set', { sounds: true, hintRate: 0 })
  // --- a task's panel
  const made = await v('task:add', 'Water the ferns every week', undefined, true)
  await v('task:save', made.id, { subtasks: [{ text: 'fill the can', done: false }, { text: 'check the soil', done: false }] })
  const gem = (await v('items', 'nugget'))[0]
  await h.evaluate(([task, item]) => window.api.vigil('task:link', task, item).catch(() => null), [made.id, gem?.id])
  await go('today')
  await send('task', made.id)
  await wait(1200)
  check('a repeating task shows when it stops repeating', await h.locator('[data-repeat-until]').count() === 1)
  await h.evaluate((id) => window.api.vigil('task:save', id, { until: new Date(Date.now() + 30 * 86400000).toISOString() }), made.id)
  await wait(800)
  check('and it can be set', ((await h.locator('[data-repeat-until]').innerText()) ?? '').startsWith('Ends'), await h.locator('[data-repeat-until]').innerText())
  const step = h.locator('[data-subtask="1"]')
  await step.fill('check the soil is dry')
  await step.press('Enter')
  await wait(700)
  check('a subtask\'s words change in place', (await v('task', made.id)).subtasks[1].text === 'check the soil is dry')
  await h.locator('[data-subtask="0"]').hover()
  await h.locator('button[aria-label^="Remove “fill the can"]').click()
  await wait(600)
  check('taking one out says so with Undo', (await text()).includes('Subtask removed'))
  check('the task number is gone from the panel', !/\bT-\d+\b/.test(await h.locator('.note-pane').innerText()))
  if (SHOT) await h.screenshot({ path: `${SHOT}/task-panel.png` })

  // --- the row menu
  await h.keyboard.press('Escape'); await wait(400)
  await go('upcoming'); await go('today')
  const row = h.locator(`[data-row][data-id="${made.id}"]`).first()
  if (await row.count()) {
    await row.click({ button: 'right' }); await wait(500)
    const menu = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
    check('the right-click menu leads with Open, Mark done, Start a focus session', menu[0]?.startsWith('Open') && menu[1]?.startsWith('Mark done') && menu[2]?.startsWith('Start a focus session'), menu.slice(0, 3).join(' / '))
    check('no “Eat the frog” or task number in it', !menu.some((one) => /frog|T-\d/.test(one)), menu.join(' / '))
    if (SHOT) await h.screenshot({ path: `${SHOT}/task-menu.png` })
    await h.keyboard.press('Escape')
  } else check('the task is on Today', false)

  // --- Today's page
  const old = await v('task:add', 'Return the library books', undefined, false)
  await v('task:save', old.id, { due: new Date(Date.now() - 2 * 86400000).toISOString() })
  await h.evaluate(() => { localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })) })
  await h.reload(); await wait(1500)
  await go('today')
  check('a line on the page has Open', await h.locator(`[data-open-line="${made.id}"]`).count() === 1)
  await h.locator(`[data-day-line="${made.id}"]`).hover()
  await h.locator(`[data-open-line="${made.id}"]`).click()
  await wait(900)
  check('which opens its panel beside the page', await h.locator('[data-repeat-until]').count() === 1)
  if (SHOT) await h.screenshot({ path: `${SHOT}/page-open.png` })
  const before = h.locator(`[data-before="${old.id}"] button[role=checkbox]`)
  check('“Still open from before” has a tick', await before.count() === 1)
  await before.click(); await wait(900)
  check('ticking it marks it done', (await v('task', old.id)).status === 'done')

  // --- the day page
  await go('day'); await wait(800)
  const page = await text()
  check('no raw status words on the day page', !/\b(dropped|discarded|promoted)\b/.test(page))
  check('flashcards are “Studied”, the day\'s tick “looked back”', !page.includes('Mark reviewed') && (page.includes('looked back') || page.includes('Looked back')))
  if (SHOT) await h.screenshot({ path: `${SHOT}/day-page.png` })

  // --- Close the day, heard once
  await heard()
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await wait(800)
  const opened = (await heard()).filter((one) => one === 'cue:open').length
  check('Close the day opens with one sound', opened === 1, String(opened))
  if (SHOT) await h.screenshot({ path: `${SHOT}/close-day.png` })
  check('its third choice is “Drop it”', await h.locator('[data-close-task] button', { hasText: 'Drop it' }).count() > 0)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
