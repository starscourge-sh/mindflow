// Small fixes of 5 Nov: G and g g in Review's All cards; "Still open from before" can send a task to the Bin
// (its trash button, with Undo) or open its right-click menu.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/small-fixes-5nov.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = (name) => (SHOT ? h.screenshot({ path: `${SHOT}/${name}.png` }).catch(() => {}) : null)

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })

  // 1. All cards: G to the last card, g g to the first.
  await go('review', ':cards'); await wait(1500)
  const at = () => h.evaluate(() => { const all = [...document.querySelectorAll('[data-pick]')]; return { at: all.findIndex((one) => one.contains(document.activeElement)), of: all.length } })
  await h.mouse.click(5, 5)
  await h.keyboard.press('j'); await wait(150)
  await h.keyboard.press('Shift+G'); await wait(300)
  let where = await at()
  check('All cards: G goes to the last card', where.of > 2 && where.at === where.of - 1, JSON.stringify(where))
  await h.keyboard.press('g'); await h.keyboard.press('g'); await wait(300)
  where = await at()
  check('All cards: g g goes to the first card', where.at === 0, JSON.stringify(where))

  // 2. Still open from before: a task from three days ago.
  const made = await v('task:add', 'Probe: render the first video')
  const id = made?.id ?? made
  await v('task:save', id, { due: new Date(Date.now() - 3 * 864e5).toISOString() })
  // "Still open from before" heads Today written out as a day (its view, as qa/day-keys.mjs sets it).
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
  await h.reload(); await wait(1500); await go('today'); await wait(2500)
  const row = h.locator(`[data-before="${id}"]`)
  check('Still open: the task is listed', (await row.count()) === 1)
  await row.click({ button: 'right' }); await wait(500)
  const items = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  check('Still open: right-click opens the task menu with "Move to the Bin"', items.some((one) => one.startsWith('Move to the Bin')), items.join(' | '))
  await h.keyboard.press('Escape'); await wait(300)
  await row.hover(); await wait(200)
  await shoot('still-open-bin')
  await h.locator(`[data-before-bin="${id}"]`).click(); await wait(1200)
  const task = await v('task', id)
  check('Still open: the trash button moves it to the Bin', task?.status === 'dropped' || task?.status === 'discarded' || !!task?.discardedAt || !!task?.binnedAt, JSON.stringify(task && { status: task.status }))
  check('Still open: it leaves the list', (await h.locator(`[data-before="${id}"]`).count()) === 0)

  // 3. A list row's grip shows as soon as the pointer is on the row, not after a wait.
  await go('articles'); await wait(1500)
  const kept = h.locator('[data-pane] [data-sortable-id]:visible').first()
  const kbox = await kept.boundingBox()
  await h.mouse.move(kbox.x + 60, kbox.y + kbox.height / 2, { steps: 4 }); await wait(220)
  const shown = await kept.evaluate((one) => Number(getComputedStyle(one.querySelector('[data-grip]')).opacity))
  check('Writing: a row\'s grip shows within 0.2s of pointing at it', shown > 0.9, String(shown))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
