// On ice: a goal paused from its page leaves the open list, Home's strip and
// the desktop, stops counting down, and waits under a third tab, “On ice”.
// Taken off, it is open again with its day moved out by the days it waited,
// and the toast says so.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-ice.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v, go, send, errors, electron } = c
const strip = () => h.evaluate(() => [...document.querySelectorAll('[data-strip-goal]')].map((one) => one.getAttribute('data-strip-goal')))
const goal = async (id) => (await v('items', 'goal')).find((one) => one.id === id)
const tab = (name) => h.evaluate((name) => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => one.innerText.replace(/\s+/g, '') === name.replace(/\s+/g, ''))?.click(), name).then(() => h.waitForTimeout(500))
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-row][data-id]')].map((one) => one.getAttribute('data-id')))
const stickyFor = (id) => electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible() && w.webContents.getURL().includes(`id=${id}`)), id)
try {
  const open = (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt && one.goalAt).sort((a, b) => a.goalAt.localeCompare(b.goalAt))
  const g = open[0]
  await v('goal:beacon:set', g.id, 'always').catch(() => {})
  await send('goal', g.id)
  await h.waitForTimeout(1200)
  const prop = h.locator('button', { hasText: /^On ice$/ })
  check('“How it went” offers “On ice”', (await prop.count()) === 1)
  await prop.click()
  await h.waitForTimeout(800)
  let now = await goal(g.id)
  check('it is on ice', now.closedHow === 'on ice' && !!now.closedAt, now.closedHow)
  check('the page says “Goal, on ice” and offers “Take off ice”', await h.evaluate(() => document.body.innerText.includes('Goal, on ice')) && (await h.locator('button', { hasText: 'Take off ice' }).count()) === 1)
  check('its countdown stops: the page says since when, not days left', await h.evaluate(() => /On ice since/.test(document.querySelector('[data-open]')?.innerText ?? '')))
  await go('goals')
  check('Goals has three tabs: Open, Ended, On ice', (await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((one) => one.innerText.replace(/\s+/g, '')).join())) === 'Open,Ended,Onice', (await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((one) => one.innerText.replace(/\s+/g, '')).join())))
  await tab('Open')
  check('it leaves the Open list', !(await rows()).includes(g.id))
  await tab('Ended')
  check('and is not under Ended', !(await rows()).includes(g.id))
  await tab('On ice')
  check('it sits under the “On ice” tab', (await rows()).includes(g.id), JSON.stringify(await rows()))
  await go('home')
  check('it leaves Home\'s strip', !(await strip()).includes(g.id), JSON.stringify(await strip()))
  await h.waitForTimeout(1500)
  check('and the desktop: no sticky for it', !(await stickyFor(g.id)))
  // Five days on ice, then taken off: its day moves out five days.
  const iced = new Date(Date.now() - 5 * 86_400_000).toISOString()
  await v('goal:close', g.id, 'on ice', iced)
  await send('goal', g.id)
  await h.waitForTimeout(1200)
  await h.evaluate(() => ((window.qaToasts = []), addEventListener('haligtree:toast', (event) => window.qaToasts.push(event.detail.text))))
  await h.locator('button', { hasText: 'Take off ice' }).click()
  await h.waitForTimeout(700)
  now = await goal(g.id)
  const moved = Math.round((new Date(`${now.goalAt}T12:00`) - new Date(`${g.goalAt}T12:00`)) / 86_400_000)
  check('off ice, it is open again', !now.closedAt && !now.closedHow)
  check('its day moved out by the five days it waited', moved === 5, `${g.goalAt} -> ${now.goalAt}`)
  check('its start stays', now.goalFrom === g.goalFrom)
  const said = await h.evaluate(() => window.qaToasts.join(' | '))
  check('the toast says its day moved 5 days', /5 days later/.test(said), said)
  await go('home')
  check('back on Home\'s strip', (await strip()).includes(g.id))
  // Undo puts it back on ice, on its old day.
  await v('goal:dates', g.id, { target: g.goalAt })
  check('no errors', !errors.length, errors.join('\n'))
} finally {
  await c.close()
}
done()
