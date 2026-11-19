// A task on hold from a fresh start (tasks-view.tsx, main `task:back`): opening it leaves it where it is, so neither it
// nor the list moves under the pointer (the user, 17 Nov: "it abruptly snaps me and the task back up"); its page says it
// is on hold with "Bring it back", which brings it back with a notice and Undo, the On hold count changing in place.
// Real pointer only. QA_SHOTS films the click on the held row, every 50ms.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/held-task.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
const film = async (name, n) => { if (!shots) return; for (let i = 0; i < n; i++) { await h.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const held = async () => (await v('tasks:held')).map((one) => one.id)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('tasks:fresh-start')
  const before = await held()
  check('a fresh start puts the open tasks on hold', before.length >= 3, String(before.length))
  await go('alltasks'); await wait(1200)
  const fold = h.locator('[data-on-hold]')
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click()
  await wait(600)
  const id = before[2]
  const row = h.locator(`[role="main"] [data-task-row][data-id="${id}"]`).first()
  await row.scrollIntoViewIfNeeded(); await wait(300)
  const at = await row.boundingBox()
  const scroller = () => h.evaluate((tid) => { let el = document.querySelector(`[data-task-row][data-id="${tid}"]`); while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; return el?.scrollTop ?? -1 }, id)
  const top = await scroller()
  await h.mouse.click(at.x + 60, at.y + 12)
  await film('open', 12); await wait(900)
  const now = await row.boundingBox()
  check('opening it leaves the row where it was', !!now && Math.abs(now.y - at.y) <= 2, `${Math.round(at.y)} then ${Math.round(now?.y ?? -1)}`)
  check('and the list where it was', Math.abs((await scroller()) - top) <= 2, `${top} then ${await scroller()}`)
  check('it is still on hold', (await held()).includes(id))
  const bring = h.locator('[data-task-held] [data-bring-back]')
  check('its page says it is on hold, with "Bring it back"', (await bring.count()) === 1, await h.locator('[data-task-held]').textContent().catch(() => ''))
  const count = () => h.locator('[data-on-hold]').textContent()
  const was = await count()
  await bring.click(); await wait(900)
  check('"Bring it back" brings it back', !(await held()).includes(id))
  const toast = h.locator('[role="status"]', { hasText: 'Brought back from on hold' })
  check('a notice says so', (await toast.count()) >= 1)
  check('the On hold count goes down by one', (await count()) !== was, `${was} then ${await count()}`)
  await toast.first().locator('button', { hasText: 'Undo' }).click(); await wait(900)
  check('Undo puts it on hold again', (await held()).includes(id))
} finally {
  await close()
}
done()
