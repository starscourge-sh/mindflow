// Today written out is Today's list itself (Tasks, "Write out my day"): lines typed there are rows that answer
// every key a row answers (note ac5c2fa3: "keyboard shortcuts on this page do not work"). Written in, then Esc:
// ↓ puts the keyboard on a row, M sends it to tomorrow, T on Upcoming brings it back, E ticks it, 1 to 3 mark it,
// ↵ starts a new line under it and opens no task, Space opens it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-keys.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 820 })
const { h, v, go } = c
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
  const openBefore = await h.evaluate(() => !!document.querySelector('[data-task-panel], [data-task-open]'))
  await h.keyboard.press('Enter'); await wait(400)
  const writing = await h.evaluate(() => { const line = document.querySelector('[data-write-line]'); return line && document.activeElement === line.querySelector('input') ? [...document.querySelectorAll('[data-task-row]')].filter((row) => row.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.querySelector('[data-task-title] > span.truncate')?.textContent.trim() : null })
  const openAfter = await h.evaluate(() => !!document.querySelector('[data-task-panel], [data-task-open]'))
  check('↵ starts a new line under the row, and opens no task', writing === first && openAfter === openBefore, `${writing}, panel ${openBefore} → ${openAfter}`)
  await h.keyboard.press('Escape'); await wait(400)
  const on = await onRow()
  await h.keyboard.press('e'); await wait(1400)
  check('E ticks it', (await task(on))?.status === 'done', `${on}: ${(await task(on))?.status}`)
  await h.keyboard.press('ArrowDown'); await wait(300)
  const next = await onRow()
  await h.keyboard.press(' '); await wait(1200)
  const opened = await h.evaluate(() => [...document.querySelectorAll('[data-open] textarea')].map((one) => one.value.trim())[0])
  check('Space opens the row', opened === next, `${opened} / ${next}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
