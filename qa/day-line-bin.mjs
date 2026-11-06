// A line on Today's written page goes to the Bin from its hover tools, and its menu promises no key that does nothing
// (the user, 6 Nov: "the back space to delete does not work... rather just have it in the context menu").
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/day-line-bin.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await go('today')
  await wait(1200)
  const write = h.locator('button', { hasText: 'Write out my day' }).first()
  if (await write.count()) (await write.click({ timeout: 5000 }), await wait(800))
  const made = await v('task:add', 'A line to bin', undefined, true)
  await v('task:save', made.id, { due: new Date().toISOString() })
  await wait(1000)
  const line = h.locator(`[data-day-line="${made.id}"]`).first()
  await line.hover()
  await wait(400)
  if (process.env.SHOT) await h.screenshot({ path: join(process.env.SHOT, 'day-line-bin.png') })
  await line.click({ button: 'right' })
  await wait(400)
  const row = await h.getByRole('menuitem', { name: /Move to the Bin/ }).first().textContent()
  check('its menu has the Bin, with no key promised', /Move to the Bin/.test(row) && !row.includes('⌫'), row)
  const lines = await h.getByRole('menuitem').evaluateAll((all) => all.map((one) => one.textContent.trim()))
  check('the menu leads with Mark it done, then Open', lines[0].startsWith('Mark it done') && lines[1].startsWith('Open'), lines.slice(0, 4).join(' | '))
  check('no second Date line', !lines.some((one) => one.startsWith('Date')), lines.join(' | '))
  check('Later, this month shows its key', lines.some((one) => /^Later, this month.*H$/.test(one)), lines.filter((one) => one.startsWith('Later')).join(' | '))
  check('it can still be hidden until a day', lines.some((one) => /Hide/.test(one)), lines.join(' | '))
  if (process.env.SHOT) await h.screenshot({ path: join(process.env.SHOT, 'day-line-menu.png') })
  await h.keyboard.press('Escape')
  await wait(300)
  // H sends the pointed line to this month.
  const other = await v('task:add', 'A line for this month', undefined, true)
  await v('task:save', other.id, { due: new Date().toISOString() })
  await wait(900)
  // The right click left the caret in a line, where H is a letter: out of it first.
  await h.evaluate(() => document.activeElement?.blur())
  await h.locator(`[data-day-line="${other.id}"]`).first().hover()
  await wait(250)
  await h.keyboard.press('h')
  await wait(800)
  check('H puts the pointed line in this month', (await v('task', other.id))?.dueAt === null && !!(await v('task', other.id))?.planFor, JSON.stringify(await v('task', other.id).then((one) => ({ due: one?.dueAt, plan: one?.planFor }))))
  await line.hover()
  await wait(300)
  const bin = h.locator(`[data-line-bin="${made.id}"]`)
  check('the Bin shows among its hover tools', await bin.isVisible())
  await bin.click()
  await wait(1200)
  check('it leaves the page', (await h.locator(`[data-day-line="${made.id}"]`).count()) === 0)
  check('it went to the Bin', (await v('task', made.id))?.status === 'dropped')
  check('no page errors', !c.errors.some((e) => e.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
