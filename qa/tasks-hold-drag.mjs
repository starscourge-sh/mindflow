// Tasks on the All tab, in your own order (the user, 23 Nov: "why cant i drag to place up there?"): a row dragged up
// lands there; a task on hold dragged up among the live ones is brought back; a live one dragged into "On hold" goes on hold.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, close } = s
h.setDefaultTimeout(8000)
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-task-row]')].map((r) => ({ id: r.dataset.id, held: r.hasAttribute('data-set-aside'), y: r.getBoundingClientRect().top + 12 })))
const drag = async (from, to) => {
  await h.mouse.move(700, from); await h.mouse.down()
  await h.mouse.move(700, from - 8, { steps: 3 }); await h.mouse.move(700, to, { steps: 14 }); await h.waitForTimeout(300)
  await h.mouse.up(); await h.waitForTimeout(1200)
}
const held = async (id) => (await s.v('tasks:held')).some((t) => t.id === id)
// "On hold" stands at the foot of the list: scrolled to it, as a person does.
const foot = async () => { await h.mouse.move(700, 500); for (let n = 0; n < 12; n++) await h.mouse.wheel(0, 600); await h.waitForTimeout(700) }
try {
  await h.locator('aside [data-side-row]', { hasText: /^Tasks/ }).first().click(); await h.waitForTimeout(1200)
  await h.getByRole('tab', { name: 'All' }).first().click(); await h.waitForTimeout(1200)
  let list = await rows()
  // Two put on hold, as a fresh start does.
  const shownIds = new Set(list.map((r) => r.id))
  const open = (await s.v('tasks')).filter((t) => t.status === 'open' && shownIds.has(t.id))
  for (const one of open.slice(-2)) await s.v('task:hold', one.id, await h.evaluate(() => new Date().toISOString()))
  await h.getByRole('tab', { name: 'Today' }).first().click(); await h.waitForTimeout(600)
  await h.getByRole('tab', { name: 'All' }).first().click(); await h.waitForTimeout(1200)
  await foot()
  if ((await h.locator('[data-on-hold]').getAttribute('aria-expanded')) === 'false') { await h.locator('[data-on-hold]').click(); await h.waitForTimeout(600) }
  await foot()
  list = await rows()
  const live = list.filter((r) => !r.held).slice(-3)
  // 1 your order: the last live row dragged above the one two up.
  await drag(live[2].y, live[0].y - 6)
  const after = (await rows()).filter((r) => !r.held).map((r) => r.id)
  check('on All, a row dragged up lands there', after.indexOf(live[2].id) < after.indexOf(live[1].id), JSON.stringify({ was: live.map((r) => r.id), after: after.slice(-3) }))
  // 2 out of "On hold": brought back.
  await foot()
  list = await rows()
  const one = list.find((r) => r.held)
  await drag(one.y, list.filter((r) => !r.held).at(-1).y)
  check('a task on hold dragged up among the live ones is brought back', !(await held(one.id)), one.id)
  // 3 into "On hold": put on hold.
  await foot()
  list = await rows()
  const away = list.filter((r) => !r.held).at(-1)
  const into = list.find((r) => r.held)
  await drag(away.y, into.y)
  check('a live task dragged into "On hold" goes on hold', await held(away.id), away.id)
} catch (error) { check('ran', false, error.stack) } finally { await close() }
done()
