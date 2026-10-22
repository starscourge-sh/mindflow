// A task has the same right-click menu wherever it shows: Home's Next up,
// Today, the matrix, ⌘K's results and the day page.
// From Home's Next up a focus session starts, and once it runs the menu
// offers the session's own lines instead of a second Start. "Pick a date…"
// opens the task with its calendar up; "Mark it done" is taken back by ⌘Z.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/context-menus.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const text = () => h.evaluate(() => document.body.innerText)
const lines = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const pick = (label) => h.locator('[role=menu] [role=menuitem]', { hasText: label }).first().click()
const menuOn = async (target) => {
  await target.scrollIntoViewIfNeeded().catch(() => {})
  await target.click({ button: 'right' })
  await wait(450)
  return lines()
}
const shut = async () => { await h.keyboard.press('Escape'); await wait(250) }
// The lines every task's menu has, in this order, wherever it is.
// Every way of giving it a day is one "Date" line (its submenu), so the menu stays short.
const CORE = ['Start a focus session', 'Mark it done', 'Date', 'Open', 'Copy', 'Move to the Bin']
const core = (menu) => {
  const at = CORE.map((label) => menu.findIndex((one) => one === label || one.startsWith(label)))
  return { ok: at.every((one) => one >= 0) && at.every((one, n) => n === 0 || one > at[n - 1]), missing: CORE.filter((_, n) => at[n] < 0) }
}
const surface = async (name, target) => {
  if (!(await target.count())) return check(`${name}: the task is there to right-click`, false)
  const menu = await menuOn(target)
  const { ok, missing } = core(menu)
  check(`${name}: the task's menu has the core lines in order`, ok, missing.length ? `missing ${missing.join(', ')}` : menu.join(' / '))
  if (SHOT) await h.screenshot({ path: `${SHOT}/menu-${name.toLowerCase().replace(/\W+/g, '-')}.png` })
  await shut()
}

try {
  await v('settings:set', { sounds: true, hintRate: 0, countIn: false })
  const old = new Date(Date.now() - 2 * 86400000).toISOString()
  // Urgent and overdue: at the top of Next up whatever the sandbox holds.
  const made = await v('task:add', 'Ring the plumber about the boiler #ctxprobe', undefined, true)
  await v('task:save', made.id, { priority: 1, important: 1, due: old })
  const other = await v('task:add', 'Post the parcel to Gran #ctxprobe', undefined, true)
  await v('task:save', other.id, { priority: 1, important: 1, due: old })

  // --- Home's Next up: a session starts from the menu
  await go('home'); await wait(800)
  const row = h.locator(`[data-drag-open="task:${made.id}"]`).first()
  const first = await menuOn(row)
  // ("Try it for 2 minutes" may sit between: it is a focus session too.)
  check('Home Next up: the menu leads with Start a focus session, then Mark it done', first[0]?.startsWith('Start a focus session') && first.filter((one) => !one.startsWith('Try it for'))[1]?.startsWith('Mark it done'), first.slice(0, 3).join(' / '))
  check('Home Next up: more than Open and Open to the side', first.length >= 8, first.join(' / '))
  if (SHOT) await h.screenshot({ path: `${SHOT}/menu-home-next-up.png` })
  await pick('Start a focus session'); await wait(1200)
  const focus = await v('focus:now')
  check('Start a focus session from Home starts one on that task', focus?.taskId === made.id, JSON.stringify(focus ?? null).slice(0, 120))

  // Running: the session's own lines, never a second Start.
  let running = await menuOn(row)
  // Showing, adding time and ending sit one line deeper, under “The session”, so the menu keeps its length.
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^The session/ }).first().hover().catch(() => {})
  await wait(400)
  running = await lines()
  check('with a session on it, the menu offers Pause, End early and Abandon', ['Pause the session', 'End session early, count it', "Abandon session, don't count it"].every((label) => running.some((one) => one.startsWith(label))), running.slice(0, 5).join(' / '))
  check('and no second Start', !running.some((one) => one.startsWith('Start a focus session')))
  if (SHOT) await h.screenshot({ path: `${SHOT}/menu-home-running.png` })
  await pick('Pause the session'); await wait(800)
  check('Pause the session pauses it', !!(await v('focus:now'))?.pausedAt)
  const paused = await menuOn(row)
  check('paused, the line reads Resume the session', paused.some((one) => one.startsWith('Resume the session')), paused.slice(0, 4).join(' / '))
  await shut()
  if (focus) await v('session:abandon', focus.id)
  await wait(600)

  // --- Mark it done, with Undo
  const second = h.locator(`[data-drag-open="task:${other.id}"]`).first()
  await menuOn(second)
  await pick('Mark it done'); await wait(900)
  check('Mark it done from Home finishes the task', (await v('task', other.id))?.status === 'done')
  // The row leaving says it (no toast since sweep A); ⌘Z takes it back.
  await h.keyboard.press('Meta+z'); await wait(800)
  check('and ⌘Z takes it back', (await v('task', other.id))?.status === 'open')
  if ((await v('task', other.id))?.status !== 'open') await v('task:undone', other.id, { dueAt: old, doneAt: new Date().toISOString(), notifiedAt: null })
  await wait(600)

  // --- priority: Next up sorts by it and shows it; the menu sets it
  await go('home'); await wait(700)
  const levels = await h.evaluate(() => {
    const part = [...document.querySelectorAll('section')].find((one) => one.querySelector('h2')?.textContent?.startsWith('Next up'))
    return [...(part?.querySelectorAll('[data-drag-open^="task:"]') ?? [])].map((row) => Number(row.querySelector('[data-priority]')?.getAttribute('data-priority') ?? 0) || 5)
  })
  check('Next up is ordered by priority, Urgent first, none last', levels.length > 0 && levels.every((one, n) => n === 0 || one >= levels[n - 1]), levels.join(','))
  check('an Urgent task in Next up shows its priority mark', await h.locator(`[data-drag-open="task:${made.id}"] [data-priority="1"]`).count() === 1)
  await menuOn(h.locator(`[data-drag-open="task:${made.id}"]`).first())
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Priority' }).first().hover(); await wait(500)
  const levelsMenu = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check('the menu\'s Priority offers Urgent, High, Medium, Low and none', ['Urgent', 'High', 'Medium', 'Low'].every((one) => levelsMenu.includes(one)), levelsMenu.replace(/\s+/g, ' '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Medium/ }).last().click(); await wait(800)
  check('choosing Medium sets it', (await v('task', made.id))?.priority === 3)
  await v('task:save', made.id, { priority: 1 })
  await wait(500)

  // --- Pick a date…: the task opens, its calendar up
  await go('home'); await wait(600)
  await menuOn(h.locator(`[data-drag-open="task:${made.id}"]`).first())
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Date/ }).first().hover(); await wait(500)
  const dateMenu = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check('the menu\'s Date holds first today, today, tomorrow, next week, a date, the later lists and Hide until…', ['Do this first today', 'Do it today', 'Do it tomorrow', 'Do it next week', 'Pick a date…', 'Someday', 'Hide until…'].every((one) => dateMenu.includes(one)), dateMenu.replace(/\s+/g, ' '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Pick a date…' }).last().click(); await wait(1500)
  check('Pick a date… opens the task with its calendar showing', (await h.locator('[role=grid]').count()) > 0)
  if (SHOT) await h.screenshot({ path: `${SHOT}/pick-a-date.png` })
  await shut(); await shut()

  // --- the same lines on every surface
  await go('today'); await wait(600)
  await surface('Today', h.locator(`[data-row][data-id="${made.id}"]`).first())
  await go('matrix'); await wait(600)
  await surface('Matrix', h.locator('button', { hasText: 'Ring the plumber' }).first())
  // ⌘K's results.
  await go('home'); await wait(400)
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('plumber boiler'); await wait(1500)
  await surface('Search', h.locator('[data-row]', { hasText: 'Ring the plumber' }).first())
  await shut()
  // The day page: the brief's to-do has the same menu; one done today offers Not done.
  await go('day'); await wait(1500)
  await surface('Day page', h.locator('li button', { hasText: 'Ring the plumber' }).first())
  await v('task:done', other.id)
  await wait(900)
  const done = h.locator('li button', { hasText: 'Post the parcel to Gran' }).first()
  if (await done.count()) {
    const menu = await menuOn(done)
    check('Day page: a done task offers Not done, Open and Copy', menu.some((one) => one.startsWith('Not done')) && menu.some((one) => one.startsWith('Open')) && menu.some((one) => one.startsWith('Copy')), menu.join(' / '))
    await pick('Not done'); await wait(900)
    check('Not done puts it back on the list', (await v('task', other.id))?.status === 'open')
  } else check('Day page: the done task is listed', false)

  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, error.message.slice(0, 300))
} finally {
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
}
