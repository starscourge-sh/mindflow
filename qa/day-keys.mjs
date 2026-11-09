// Today written out is Today's list itself (Tasks, "Write out my day"): lines typed there are rows that answer
// every key a row answers (note ac5c2fa3: "keyboard shortcuts on this page do not work"). Written in, then Esc:
// ↓ puts the keyboard on a row, M sends it to tomorrow, T on Upcoming brings it back, E ticks it, 1 to 3 mark it,
// O (and ⌘↵) starts a new line under it and ⇧O one above it, opening no task; ↵ opens it, as on every list.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-keys.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 820 })
const { h, v, go, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const task of await v('tasks')) if (task.status === 'open') await v('task:save', task.id, { status: 'done' })
  await h.reload(); await wait(1500); await go('today'); await wait(2000)
  await h.locator('[data-write-day]').click(); await wait(500)
  for (const line of ['Book the dentist', 'Fix the gate latch', '#garden water the plants', 'Read chapter 4', 'Call the plumber']) {
    await h.keyboard.type(line, { delay: 8 }); await h.keyboard.press('Enter'); await wait(600)
  }
  await h.keyboard.press('Escape'); await wait(500)
  const task = async (title) => (await v('tasks')).find((t) => t.title === title)
  const rowTitles = () => h.evaluate(() => [...document.querySelectorAll('[data-task-row] [data-task-title] > span.truncate')].map((one) => one.textContent.trim()))
  check('the five written lines are five rows of the list, in the order written', (await rowTitles()).join('|') === 'Book the dentist|Fix the gate latch|water the plants|Read chapter 4|Call the plumber', (await rowTitles()).join('|'))
  const onRow = () => h.evaluate(() => document.querySelector('[data-task-row][data-cursor] [data-task-title] > span.truncate')?.textContent.trim())
  // Esc left the keyboard on the row the line was under: the last one written.
  check('Esc leaves the keyboard on the last row written', (await onRow()) === 'Call the plumber', String(await onRow()))
  await h.mouse.move(5, 400)
  await h.keyboard.press('2'); await wait(800)
  check('2 marks it', (await task('Call the plumber'))?.priority === 2, String((await task('Call the plumber'))?.priority))
  await h.keyboard.press('m'); await wait(1200)
  check('M sends it to tomorrow, off Today', !(await rowTitles()).includes('Call the plumber'), (await rowTitles()).join('|'))
  await go('upcoming'); await wait(1200)
  await h.locator('[data-task-row]', { hasText: 'Call the plumber' }).first().locator('[data-row]').click(); await wait(600)
  await h.keyboard.press('Escape'); await wait(400)
  await h.keyboard.press('t'); await wait(1200)
  await go('today'); await wait(1200)
  check('T over it brings it back to today', (await rowTitles()).includes('Call the plumber'), (await rowTitles()).join('|'))
  await h.mouse.move(5, 400)
  await h.keyboard.press('ArrowDown'); await wait(300)
  const first = await onRow()
  check('↓ puts the keyboard on a row', !!first, String(first))
  await h.screenshot({ path: `${shots}/day-keys-picked.png` })
  const lineAt = () => h.evaluate(() => {
    const line = document.querySelector('[data-write-line]')
    if (!line || !line.contains(document.activeElement)) return null
    const rows = [...document.querySelectorAll('[data-task-row]')]
    const name = (row) => row?.querySelector('[data-task-title] > span.truncate')?.textContent.trim() ?? null
    return { above: name(rows.filter((row) => row.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)), below: name(rows.find((row) => row.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_PRECEDING)) }
  })
  const panel = () => h.evaluate(() => !!document.querySelector('[data-open] textarea'))
  for (const [key, where] of [['o', 'under'], ['Meta+Enter', 'under'], ['Shift+O', 'above']]) {
    const on = await onRow()
    await h.keyboard.press(key); await wait(500)
    const line = await lineAt()
    check(`${key} starts a new line ${where} the row, and opens no task`, !!line && (where === 'under' ? line.above === on : line.below === on) && !(await panel()), `${JSON.stringify(line)} / ${on}`)
    await h.keyboard.press('Escape'); await wait(400)
  }
  // ⇧O on the first row: the line written there becomes the first task.
  await h.keyboard.press('g'); await h.keyboard.press('g'); await wait(300)
  const top = await onRow()
  await h.keyboard.press('Shift+O'); await wait(400)
  await h.keyboard.type('First of all'); await h.keyboard.press('Enter'); await wait(900)
  await h.keyboard.press('Escape'); await wait(500)
  check('a line written above the first row is the first task', (await rowTitles())[0] === 'First of all', `${(await rowTitles()).join('|')} (was ${top})`)
  const on = await onRow()
  await h.keyboard.press('e'); await wait(1400)
  check('E ticks it', (await task(on))?.status === 'done', `${on}: ${(await task(on))?.status}`)
  await h.keyboard.press('ArrowDown'); await wait(300)
  const next = await onRow()
  await h.keyboard.press('Enter'); await wait(1200)
  const opened = await h.evaluate(() => [...document.querySelectorAll('[data-open] textarea')].map((one) => one.value.trim())[0])
  check('↵ opens the row, as on every list', opened === next, `${opened} / ${next}`)
  // Dragged: a row into your own order, and a row onto the Later tab.
  await h.keyboard.press('Escape'); await wait(400)
  await go('today'); await wait(1200)
  const drag = async (from, to) => {
    await h.mouse.move(from.x, from.y); await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await wait(30) }
    await wait(250); await h.mouse.up(); await wait(1200)
  }
  const rowBox = async (title) => { const b = await h.locator('[data-task-row]', { hasText: title }).first().boundingBox(); return { x: b.x + 200, y: b.y + 14 } }
  const names = await rowTitles()
  const last = names.at(-1)
  await drag(await rowBox(last), { ...(await rowBox(names[0])), y: (await rowBox(names[0])).y - 8 })
  check('a row dragged to the top stays there, in your order', (await rowTitles())[0] === last, (await rowTitles()).join('|'))
  const later = await h.locator('[data-page] header button[aria-label="Later"]').first().boundingBox()
  const moving = (await rowTitles())[1]
  await drag(await rowBox(moving), { x: later.x + later.width / 2, y: later.y + later.height / 2 })
  const gone = await task(moving)
  check('a row dropped on the Later tab goes to Later, someday', !(await rowTitles()).includes(moving) && gone?.planFor === 'someday', `${moving}: ${gone?.planFor} / ${(await rowTitles()).join('|')}`)
  // At the smallest window (560 x 400) the margin is too narrow for the 1 2 3: they step out of sight rather than hang over the page's edge.
  await size(560, 400); await wait(1200)
  await go('today'); await wait(1200)
  const marks = await h.evaluate(() => [...document.querySelectorAll('[data-three]')].map((mark) => {
    const m = mark.getBoundingClientRect()
    const row = mark.closest('[data-task-row]')
    const tick = row.querySelector('[data-task-tick]').getBoundingClientRect()
    const page = document.querySelector('[data-page]').getBoundingClientRect()
    return { left: Math.round(m.left), right: Math.round(m.right), tick: Math.round(tick.left), page: Math.round(page.left), width: Math.round(m.width) }
  }))
  check('560 x 400: no 1 2 3 hangs over the page\'s edge (they are hidden there)', marks.every((one) => one.width === 0 || (one.left >= one.page && one.right <= one.tick)), JSON.stringify(marks))
  await h.screenshot({ path: `${shots}/day-keys-narrow.png` })
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
