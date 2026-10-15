// Today as the Matrix: the switcher offers List, Page and Matrix; the Matrix
// shows exactly the tasks the list does, each in the box its dates and flag
// put it in; a task dragged to another box changes as on the Matrix page, with
// Undo; the choice is kept after a reload; the link opens the full Matrix,
// which still shows every open task.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/today-matrix.mjs
// SHOTS=dir keeps pictures in Paper and Dark.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v, theme } = c

const chips = () => h.evaluate(() => {
  // A chip's label is drawn twice over (the bold copy keeps its width, the rolling letters their own): read once.
  const label = (one) => { const t = one.textContent.trim(); return [...t.slice(0, t.length / 2)].filter((_, i) => i % 2 === 0).join('') }
  const group = [...document.querySelectorAll('header button[aria-pressed]')].find((one) => label(one) === 'Matrix')?.parentElement
  return group ? [...group.querySelectorAll('button[aria-pressed]')].map((one) => ({ label: label(one), on: one.getAttribute('aria-pressed') })) : []
})
const chip = async (label) => {
  const all = await chips()
  return h.locator('header button[aria-pressed]').nth((await h.locator('header button[aria-pressed]').count()) - all.length + all.findIndex((one) => one.label === label))
}
const listIds = () => h.evaluate(() => [...new Set([...document.querySelectorAll('[data-row][data-id]')].map((one) => one.dataset.id))].sort())
const boxes = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-quadrant]')].map((box) => [box.dataset.quadrant, [...box.querySelectorAll('[data-row][data-id]')].map((one) => one.dataset.id)])))
const toast = () => h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
// The Matrix's rule, written out again: urgent is late or within two days, important the flag.
const quadrant = (task) => {
  const soon = new Date(); soon.setHours(0, 0, 0, 0); soon.setDate(soon.getDate() + 3)
  const urgent = [task.dueAt, task.deadline].some((one) => one && new Date(one).getTime() < soon.getTime())
  return task.important ? (urgent ? 'do' : 'plan') : urgent ? 'handoff' : 'drop'
}
const centre = async (locator) => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
async function drag(from, to) {
  const a = await centre(from)
  await h.mouse.move(a.x, a.y); await h.mouse.down()
  await h.mouse.move(a.x + 12, a.y + 6); await h.waitForTimeout(200)
  // Where the box is once the card is up, so nothing that moved on the way is aimed at.
  const b = await centre(to)
  for (let i = 1; i <= 14; i++) { await h.mouse.move(a.x + ((b.x - a.x) * i) / 14, a.y + ((b.y - a.y) * i) / 14); await h.waitForTimeout(30) }
  await h.waitForTimeout(250); await h.mouse.up(); await h.waitForTimeout(900)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await v('onboarding:set', { pageHints: false })
  await go('today')
  await (await chip('List')).click(); await h.waitForTimeout(700)
  const labels = (await chips()).map((one) => one.label)
  check('The switcher has List, Page and Matrix', labels.join(',') === 'List,Page,Matrix', labels.join(', '))
  const list = await listIds()
  await (await chip('Matrix')).click(); await h.waitForTimeout(900)
  let b = await boxes()
  const shown = Object.values(b).flat().sort()
  check('Four boxes on Today', Object.keys(b).length === 4, Object.keys(b).join(', '))
  check('Matrix shows exactly the tasks the list shows', list.length > 0 && shown.join() === list.join(), `list ${list.length}, matrix ${shown.length}`)
  const tasks = Object.fromEntries((await v('tasks')).map((one) => [one.id, one]))
  const wrong = Object.entries(b).flatMap(([q, ids]) => ids.filter((id) => quadrant(tasks[id]) !== q))
  check('Each task sits in the box its dates and flag give it', !wrong.length, wrong.map((id) => tasks[id].title).join('; '))
  const scope = await h.evaluate(() => (() => { const one = document.querySelector('[data-today-scope]'); return one && `${one.dataset.said} ${one.querySelector('[data-all-matrix]')?.textContent.slice(0, 19)}` })())
  check('It says these are today’s tasks and links to the full Matrix', /Today’s tasks/.test(scope ?? '') && /All tasks in Matrix/.test(scope ?? ''), scope)
  const count = await h.evaluate(() => [...document.querySelectorAll('header')].map((one) => one.textContent).join(' '))
  check('The count says tasks today', /tasks? today/.test(count), count.match(/tasks? today/)?.[0] ?? count.slice(-80))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/today-matrix-paper.png` })

  // A task from one urgent box to the other: its importance flips, said, and Undo puts it back.
  await h.waitForTimeout(800)
  const fromQ = b.handoff.length ? 'handoff' : 'do', toQ = fromQ === 'handoff' ? 'do' : 'handoff'
  const id = b[fromQ][0]
  const was = (await v('task', id)).important
  await drag(h.locator(`[data-quadrant="${fromQ}"] [data-row][data-id="${id}"]`), h.locator(`[data-quadrant="${toQ}"]`))
  b = await boxes()
  const said = await toast()
  const now = (await v('task', id)).important
  check('Dragged to another box, it lands there and its importance changes', b[toQ].includes(id) && !!now !== !!was, `${fromQ} to ${toQ}, important ${was} to ${now}`)
  check('The move is said with Undo', /marked important|no longer important/.test(said) && /Undo/.test(said), said)
  await h.locator('[role=status][aria-live] button', { hasText: 'Undo' }).first().click(); await h.waitForTimeout(900)
  b = await boxes()
  check('Undo puts it back in its box', b[fromQ].includes(id) && !!(await v('task', id)).important === !!was)

  // Kept after a reload.
  await h.reload(); await h.waitForTimeout(1800)
  await go('today')
  const on = await h.evaluate(() => JSON.parse(localStorage.getItem('view:tasks:today') ?? '{}').group)
  check('The Matrix choice is kept after a reload', on === 'matrix' && (await h.locator('[data-today-scope]').count()) === 1, on)

  // Dark, for the picture.
  if (SHOTS) { await theme('dark'); await go('today'); await h.screenshot({ path: `${SHOTS}/today-matrix-dark.png` }); await theme('paper'); await go('today') }

  // The link: the full Matrix, every open task there.
  await h.locator('[data-all-matrix]').click(); await h.waitForTimeout(1100)
  const full = Object.values(await boxes()).flat()
  const open = (await v('tasks')).filter((one) => one.status === 'open' && !one.waitingOn)
  const scoped = await h.locator('[data-today-scope]').count()
  check('The link opens the full Matrix with every open task', !scoped && full.length === open.length && full.length > shown.length, `${full.length} of ${open.length} open, today had ${shown.length}`)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/full-matrix-paper.png` })

  // An empty Today reads well: every task moved to next week.
  await go('today')
  for (const one of shown) await v('task:save', one, { due: new Date(Date.now() + 9 * 86400000).toISOString(), deadline: null })
  await h.waitForTimeout(1200)
  const empty = await h.evaluate(() => (() => { const one = document.querySelector('[data-today-scope]'); return one && `${one.dataset.said} ${one.querySelector('[data-all-matrix]')?.textContent.slice(0, 19)}` })())
  check('An empty Today says so, and where to go', /Nothing on today|Everything on today is done/.test(empty ?? ''), empty)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/today-matrix-empty-paper.png` })
  await (await chip('List')).click(); await h.waitForTimeout(400)
  if (c.errors.length) console.log(c.errors.join('\n'))
  check('No page errors', !c.errors.filter((one) => /PAGEERROR/.test(one)).length)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
