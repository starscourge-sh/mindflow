// "To today" and "Move all to today" clear "Still open from before", even for a task past its deadline (the user, 6 Nov:
// two tasks stayed, both set for today, each with a deadline already gone). The deadline itself is kept.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/move-to-today.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const days = (n) => new Date(Date.now() + n * 864e5).toISOString()
try {
  // A clear day, as qa/day-list.mjs starts: nothing for today or before but these three.
  const tonight = new Date(new Date().setHours(23, 59, 59, 999))
  for (const task of await v('tasks')) {
    if (task.dueAt && new Date(task.dueAt) < tonight) await v('task:save', task.id, { due: days(9) })
    if (task.deadline && new Date(task.deadline) < tonight) await v('task:save', task.id, { deadline: days(9) })
  }
  await go('today')
  await wait(1200)
  const one = await v('task:add', 'Late by a deadline one')
  const two = await v('task:add', 'Late by a deadline two')
  const three = await v('task:add', 'Late by a day')
  await v('task:save', one.id, { due: days(-1), deadline: days(-2) })
  await v('task:save', two.id, { due: days(-1), deadline: days(-3) })
  await v('task:save', three.id, { due: days(-1) })
  await wait(900)
  const write = h.locator('button', { hasText: 'Write out my day' }).first()
  if (await write.count()) (await write.click({ timeout: 5000 }), await wait(700))
  const row = (id) => h.locator(`[data-before="${id}"]`)
  const under = await h.locator('[data-before]').evaluateAll((all) => all.map((one) => one.textContent.slice(0, 24)))
  check('all three are under Still open from before', (await row(one.id).count()) + (await row(two.id).count()) + (await row(three.id).count()) === 3, JSON.stringify(under))
  await row(one.id).getByRole('button', { name: 'To today' }).click()
  await wait(900)
  check('To today clears one past its deadline', (await row(one.id).count()) === 0)
  check('it is on today\'s list', (await h.getByText('Late by a deadline one').count()) > 0)
  await h.getByRole('button', { name: 'Move all to today' }).click()
  await wait(900)
  check('Move all to today clears the rest', (await row(two.id).count()) + (await row(three.id).count()) === 0)
  check('the section has gone', (await h.locator('[data-day-before]').count()) === 0 || !(await h.locator('[data-day-before]').innerText()).includes('Late by'))
  check('the deadline is kept', !!(await v('task', one.id))?.deadline)
  check('no page errors', !c.errors.some((e) => e.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
