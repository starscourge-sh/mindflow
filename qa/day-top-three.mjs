// Today's page, written out: the line under the first three says what it
// parts, and a ticked line keeps its #tag tinted where it was written, as the
// open lines show theirs.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-top-three.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 820 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
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
  const label = await h.evaluate(() => document.querySelector('[data-top-three]')?.textContent ?? '')
  check('the line under the first three says what it parts', /first three/.test(label), label)
  const id = (await v('tasks')).find((t) => t.title.includes('water the plants'))?.id
  await h.locator(`[data-day-line="${id}"] [role=checkbox]`).first().click(); await wait(900)
  const tint = await h.evaluate((id) => {
    const row = document.querySelector(`[data-day-line="${id}"]`)
    const tag = [...row.querySelectorAll('span')].find((s) => s.childNodes.length === 1 && s.textContent === '#garden')
    return { text: row.innerText.replace(/\s+/g, ' ').trim(), tinted: !!tag && getComputedStyle(tag).backgroundColor !== 'rgba(0, 0, 0, 0)' }
  }, id)
  check('a ticked line keeps its words and #tag where they were written, tinted', tint.tinted && tint.text.startsWith('#garden water'), JSON.stringify(tint))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? process.env.QA_DATA}/day-top-three.png` })
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
