// Today's page, written out (Tasks, "Write out my day"): its lines answer the keys a row on the other Tasks tabs
// answers (note ac5c2fa3: "keyboard shortcuts on this page do not work"). With the pointer resting on a line,
// N sends it to Next and T back to today, E ticks it; with nothing picked, ↓ picks the first line and ↵ writes
// in it. No key acts on the hidden list behind the page (↵ never opens a task nobody can see).
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
  // A deadline counts too: the sandbox's "by Friday" lands on today every Friday.
  const tonight = new Date(new Date().setHours(24, 0, 0, 0))
  const later = new Date(Date.now() + 3 * 864e5).toISOString()
  for (const task of await v('tasks')) {
    if (task.status !== 'open') continue
    if (task.dueAt && new Date(task.dueAt) < tonight) await v('task:save', task.id, { due: later })
    if (task.deadline && new Date(task.deadline) < tonight) await v('task:save', task.id, { deadline: later })
  }
  const today = new Date().toDateString()
  const doneToday = (await v('tasks')).filter((task) => task.status === 'done' && task.completedAt && new Date(task.completedAt).toDateString() === today).map((task) => task.id)
  await h.evaluate((ids) => {
    localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' }))
    const d = new Date()
    localStorage.setItem(`day-list:cleared:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, JSON.stringify(ids))
  }, doneToday)
  await h.reload(); await wait(1500); await go('today'); await wait(2500)
  for (const line of ['Book the dentist', 'Fix the gate latch', '#garden water the plants', 'Read chapter 4', 'Call the plumber']) {
    await h.keyboard.type(line, { delay: 8 }); await h.keyboard.press('Enter'); await wait(450)
  }
  await h.keyboard.press('Escape'); await wait(400)
  const id = async (title) => (await v('tasks')).find((t) => t.title === title && t.status === 'open')?.id
  const sectionOf = (task) => h.evaluate((task) => document.querySelector(`[data-day-line="${task}"]`)?.closest('[data-day-section]')?.getAttribute('data-day-section') ?? null, task)
  const plumber = await id('Call the plumber')
  const rest = async (task) => {
    const box = await h.locator(`[data-day-line="${task}"]`).first().boundingBox()
    await h.mouse.move(box.x + box.width - 40, box.y + 12); await wait(250)
  }
  await rest(plumber)
  await h.keyboard.press('n'); await wait(1200)
  check('N over a line sends it to Next', (await sectionOf(plumber)) === 'next', String(await sectionOf(plumber)))
  await h.evaluate(() => { const toggle = document.querySelector('[data-section-toggle="next"]'); if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click() }); await wait(600)
  await rest(plumber)
  await h.keyboard.press('t'); await wait(1200)
  check('T over it in Next brings it back to today', (await sectionOf(plumber)) === 'now', String(await sectionOf(plumber)))
  await rest(plumber)
  await h.keyboard.press('e'); await wait(1200)
  const ticked = (await v('tasks')).find((t) => t.id === plumber)?.status
  check('E over a line ticks it', ticked === 'done', ticked)
  await h.mouse.move(5, 400); await wait(300)
  const openBefore = await h.evaluate(() => !!document.querySelector('[data-task-panel], [data-task-open]'))
  await h.keyboard.press('ArrowDown'); await wait(300)
  const first = await h.evaluate(() => document.querySelector('[data-day-section="now"] [data-day-line]')?.getAttribute('data-day-line'))
  const picked = await h.evaluate(() => document.querySelector('[data-picked]')?.getAttribute('data-day-line'))
  check('↓ with nothing picked picks the first line', !!picked && picked === first, `${picked} / ${first}`)
  await h.screenshot({ path: `${shots}/day-keys-picked.png` })
  await h.keyboard.press('Enter'); await wait(400)
  const writing = await h.evaluate(() => document.activeElement?.closest('[data-day-line]')?.getAttribute('data-day-line'))
  const openAfter = await h.evaluate(() => !!document.querySelector('[data-task-panel], [data-task-open]'))
  check('↵ writes in the picked line, and opens no hidden task', writing === first && openAfter === openBefore, `${writing}, panel ${openBefore} → ${openAfter}`)
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
